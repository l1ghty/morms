export class ServerProjectile {
  constructor(x, y, vx, vy, type, game) {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.type = type;
    this.game = game;
    this.id = game && typeof game.getNextProjectileId === 'function' ? game.getNextProjectileId() : Math.random();
    
    this.isDead = false;
    this.radius = 4;
    this.elasticity = 0.5;
    this.setupWeaponProperties();
  }

  setupWeaponProperties() {
    switch (this.type) {
      case 'bazooka':
        this.radius = 3;
        this.affectedByWind = true;
        this.contactFuse = true;
        this.blastRadius = 45;
        this.maxDamage = 50;
        this.knockbackForce = 7.5;
        break;
      case 'grenade':
        this.radius = 4;
        this.affectedByWind = false;
        this.contactFuse = false;
        this.fuse = this.game.selectedFuseTime || 3.0;
        this.elasticity = 0.55;
        this.blastRadius = 48;
        this.maxDamage = 55;
        this.knockbackForce = 8.0;
        break;
      case 'cluster':
        this.radius = 4;
        this.affectedByWind = false;
        this.contactFuse = false;
        this.fuse = this.game.selectedFuseTime || 3.0;
        this.elasticity = 0.5;
        this.blastRadius = 40;
        this.maxDamage = 45;
        this.knockbackForce = 6.5;
        break;
      case 'cluster_shrapnel':
        this.radius = 3;
        this.affectedByWind = false;
        this.contactFuse = true;
        this.elasticity = 0.45;
        this.blastRadius = 25;
        this.maxDamage = 25;
        this.knockbackForce = 4.5;
        break;
      case 'holy':
        this.radius = 5;
        this.affectedByWind = false;
        this.contactFuse = false;
        this.fuse = this.game.selectedFuseTime || 3.0;
        this.elasticity = 0.65;
        this.blastRadius = 85;
        this.maxDamage = 95;
        this.knockbackForce = 14.0;
        this.playedHallelujah = false;
        break;
      case 'dynamite':
        this.radius = 5;
        this.affectedByWind = false;
        this.contactFuse = false;
        this.fuse = 5.0;
        this.elasticity = 0.15;
        this.blastRadius = 75;
        this.maxDamage = 85;
        this.knockbackForce = 12.0;
        break;
      case 'airstrike_missile':
        this.radius = 4;
        this.affectedByWind = false;
        this.contactFuse = true;
        this.blastRadius = 42;
        this.maxDamage = 45;
        this.knockbackForce = 7.0;
        break;
    }
  }

  update(dt) {
    if (this.isDead) return;

    if (this.y >= this.game.waterLevel) {
      this.game.broadcastAudio('splash');
      this.isDead = true;
      return;
    }

    this.vy += this.game.gravity * dt;

    if (this.affectedByWind && this.game.wind) {
      this.vx += this.game.wind.x * 0.04 * dt;
    }

    this.x += this.vx * dt;
    this.y += this.vy * dt;

    if (this.fuse !== undefined) {
      this.fuse -= (dt * 16.666) / 1000;
      
      // Holy hand grenade custom chanting
      if (this.type === 'holy' && this.fuse <= 1.1 && !this.playedHallelujah) {
        this.playedHallelujah = true;
        this.game.broadcastAudio('hallelujah');
      }

      if (this.fuse <= 0) {
        this.explode();
        return;
      }
    }

    if (this.game.terrain.isSolid(this.x, this.y)) {
      if (this.contactFuse) {
        this.explode();
      } else {
        this.handleTerrainBounce();
      }
      return;
    }

    if (this.contactFuse) {
      for (const w of this.game.worms) {
        if (w.health > 0) {
          const dx = w.x - this.x;
          const dy = w.y - this.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 12) {
            this.explode();
            return;
          }
        }
      }
    }
  }

  handleTerrainBounce() {
    const normal = this.getTerrainNormal(this.x, this.y);
    const dot = this.vx * normal.x + this.vy * normal.y;
    
    if (dot < 0) {
      this.vx = (this.vx - 2 * dot * normal.x) * this.elasticity;
      this.vy = (this.vy - 2 * dot * normal.y) * this.elasticity;
      this.game.broadcastAudio('bounce');
      
      let limit = 0;
      while (this.game.terrain.isSolid(this.x, this.y) && limit < 15) {
        this.x += normal.x * 0.8;
        this.y += normal.y * 0.8;
        limit++;
      }
    }
    
    const speed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
    if (speed < 0.25) {
      this.vx = 0;
      this.vy = 0;
    }
  }

  getTerrainNormal(tx, ty) {
    let nx = 0;
    let ny = 0;
    const r = 4;
    const terrain = this.game.terrain;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy <= r * r) {
          if (terrain.isSolid(tx + dx, ty + dy)) {
            nx -= dx;
            ny -= dy;
          }
        }
      }
    }
    const len = Math.sqrt(nx * nx + ny * ny);
    if (len === 0) return { x: 0, y: -1 };
    return { x: nx / len, y: ny / len };
  }

  explode() {
    this.isDead = true;
    this.game.createExplosion(this.x, this.y, this.blastRadius, this.maxDamage, this.knockbackForce);
    
    if (this.type === 'cluster') {
      for (let i = 0; i < 5; i++) {
        const angle = -Math.PI / 2 + (i - 2) * 0.12 + (Math.random() - 0.5) * 0.08;
        const speed = (3.5 + Math.random() * 2.5) * 1.4;
        const shrap = new ServerProjectile(
          this.x,
          this.y - 6,
          Math.cos(angle) * speed,
          Math.sin(angle) * speed,
          'cluster_shrapnel',
          this.game
        );
        this.game.projectiles.push(shrap);
      }
    }
  }
}
