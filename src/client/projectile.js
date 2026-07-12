import { createExplosion } from './explosion.js';
import { setupWeaponProperties, handleTerrainBounce } from '../common/physics.js';

export class Projectile {
  constructor(x, y, vx, vy, type, game) {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.type = type;
    this.game = game;
    
    this.isDead = false;
    
    // Assign properties from shared library
    const props = setupWeaponProperties(this.type, this.game.selectedFuseTime);
    Object.assign(this, props);
  }

  update(dt) {
    if (this.isDead) return;

    // 1. Check if fell out of bounds / drowned
    if (this.y >= this.game.waterLevel) {
      this.game.audio.play('splash');
      this.game.particles.spawnBurst(this.x, this.game.waterLevel, 'water', 8);
      this.isDead = true;
      return;
    }

    // 2. Physics integrations
    // Gravity
    this.vy += this.game.gravity * dt;
    
    // Wind (only bazooka rocket gets blown sideways)
    if (this.affectedByWind) {
      this.vx += this.game.wind.x * 0.04 * dt;
    }

    // Drag
    this.vx *= Math.pow(0.992, dt);
    this.vy *= Math.pow(0.992, dt);

    // Apply movement
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    // Spawn flight particles
    if (this.type === 'bazooka' || this.type === 'airstrike_missile') {
      if (Math.random() < 0.6 * dt) {
        this.game.particles.spawnBurst(this.x - this.vx * 0.5, this.y - this.vy * 0.5, 'smoke_trail', 1);
      }
    }

    // 3. Timers / Fuse Updates
    if (!this.contactFuse) {
      this.fuse -= (dt / 60); // 60 frames per second
      
      // Holy hand grenade custom chanting
      if (this.type === 'holy' && this.fuse <= 1.1 && !this.playedHallelujah) {
        this.playedHallelujah = true;
        this.game.audio.play('hallelujah');
      }

      if (this.fuse <= 0) {
        this.explode();
        return;
      }
    }

    // 4. Collision Checking
    const terrain = this.game.terrain;
    
    // Check if hit solid terrain
    if (terrain.isSolid(this.x, this.y)) {
      if (this.contactFuse) {
        this.explode();
      } else {
        // Bounce physics using shared function
        handleTerrainBounce(this, terrain, () => this.game.audio.play('bounce'));
      }
      return;
    }

    // Contact fuse checks if it hits a living worm directly
    if (this.contactFuse) {
      for (const worm of this.game.worms) {
        if (worm.health > 0) {
          const dx = worm.x - this.x;
          const dy = worm.y - this.y;
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
    
    // Bounce reflection formula: V_new = V - 2 * (V . N) * N
    const dot = this.vx * normal.x + this.vy * normal.y;
    
    // Only bounce if heading into the collision normal
    if (dot < 0) {
      this.vx = (this.vx - 2 * dot * normal.x) * this.elasticity;
      this.vy = (this.vy - 2 * dot * normal.y) * this.elasticity;
      
      this.game.audio.play('bounce');
      
      // Push the projectile out of the terrain slightly to avoid re-colliding next frame
      let limit = 0;
      while (this.game.terrain.isSolid(this.x, this.y) && limit < 15) {
        this.x += normal.x * 0.8;
        this.y += normal.y * 0.8;
        limit++;
      }
    }
    
    // If movement speed drops to almost zero, stop the horizontal roll/sliding
    const speed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
    if (speed < 0.25) {
      this.vx = 0;
      this.vy = 0;
    }
  }


  explode() {
    this.isDead = true;
    
    // Trigger the actual damage & carving explosion
    createExplosion(this.x, this.y, this.blastRadius, this.maxDamage, this.knockbackForce, this.game);
    
    // Cluster Bomb special: spawns sub-munitions
    if (this.type === 'cluster') {
      for (let i = 0; i < 5; i++) {
        const angle = -Math.PI / 2 + (i - 2) * 0.12 + (Math.random() - 0.5) * 0.08;
        const speed = (3.5 + Math.random() * 2.5) * 1.4; // 40% higher/faster
        const shrap = new Projectile(
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

  draw(ctx) {
    ctx.save();
    
    if (this.type === 'bazooka' || this.type === 'airstrike_missile') {
      // Draw projectile rocket with rotation
      ctx.translate(this.x, this.y);
      const angle = Math.atan2(this.vy, this.vx);
      ctx.rotate(angle);
      
      // Rocket body
      ctx.fillStyle = '#dc2626'; // red nose
      ctx.beginPath();
      ctx.moveTo(8, 0);
      ctx.lineTo(2, -3);
      ctx.lineTo(2, 3);
      ctx.closePath();
      ctx.fill();
      
      ctx.fillStyle = '#f1f5f9'; // white body
      ctx.fillRect(-6, -2.5, 8, 5);
      
      ctx.fillStyle = '#475569'; // grey tail fins
      ctx.fillRect(-8, -3.5, 2, 7);
    } 
    else if (this.type === 'grenade' || this.type === 'cluster' || this.type === 'cluster_shrapnel') {
      // Bouncing sphere
      ctx.fillStyle = this.type === 'cluster_shrapnel' ? '#f59e0b' : '#166534';
      ctx.strokeStyle = '#f1f5f9';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } 
    else if (this.type === 'holy') {
      // Holy Hand Grenade shape (gold orb with cross on top)
      ctx.fillStyle = '#fbbf24';
      ctx.strokeStyle = '#78350f';
      ctx.lineWidth = 1.5;
      
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      
      // Cross
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(this.x, this.y - this.radius);
      ctx.lineTo(this.x, this.y - this.radius - 5);
      ctx.moveTo(this.x - 3, this.y - this.radius - 3);
      ctx.lineTo(this.x + 3, this.y - this.radius - 3);
      ctx.stroke();
    } 
    else if (this.type === 'dynamite') {
      // Red stick of dynamite
      ctx.fillStyle = '#dc2626';
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 1;
      
      ctx.fillRect(this.x - 3, this.y - 5, 6, 10);
      ctx.strokeRect(this.x - 3, this.y - 5, 6, 10);
      
      // Sparking fuse
      const time = performance.now() * 0.05;
      ctx.strokeStyle = time % 2 < 1 ? '#fbbf24' : '#ef4444';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(this.x, this.y - 5);
      ctx.quadraticCurveTo(this.x + 3, this.y - 9, this.x + 4, this.y - 8);
      ctx.stroke();
    }
    
    ctx.restore();
  }
}
