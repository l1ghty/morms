import { setupWeaponProperties, handleTerrainBounce } from './physics.js';

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
    
    const props = setupWeaponProperties(this.type, this.game.selectedFuseTime);
    Object.assign(this, props);
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
        handleTerrainBounce(this, this.game.terrain, () => this.game.broadcastAudio('bounce'));
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
