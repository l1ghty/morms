import { BaseProjectile } from '../common/base_projectile.js';
import { createExplosion } from './explosion.js';

export class Projectile extends BaseProjectile {
  constructor(x, y, vx, vy, type, game) {
    super(x, y, vx, vy, type, game);
  }

  // ─── Hook Implementations ─────────────────────────────────────────────────────

  playAudio(name) {
    this.game.audio.play(name);
  }

  doExplode() {
    createExplosion(this.x, this.y, this.blastRadius, this.maxDamage, this.knockbackForce, this.game);
  }

  createShrapnel(x, y, vx, vy) {
    return new Projectile(x, y, vx, vy, 'cluster_shrapnel', this.game);
  }

  onWaterHit() {
    this.game.particles.spawnBurst(this.x, this.game.waterLevel, 'water', 8);
  }

  onFlightParticle(dt) {
    if (this.type === 'bazooka' || this.type === 'airstrike_missile') {
      if (Math.random() < 0.6 * dt) {
        this.game.particles.spawnBurst(this.x - this.vx * 0.5, this.y - this.vy * 0.5, 'smoke_trail', 1);
      }
    }
  }

  // ─── Rendering ───────────────────────────────────────────────────────────────

  draw(ctx) {
    ctx.save();

    if (this.type === 'bazooka' || this.type === 'airstrike_missile') {
      ctx.translate(this.x, this.y);
      ctx.rotate(Math.atan2(this.vy, this.vx));

      ctx.fillStyle = '#dc2626'; // red nose cone
      ctx.beginPath();
      ctx.moveTo(8, 0); ctx.lineTo(2, -3); ctx.lineTo(2, 3);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#f1f5f9'; // white body
      ctx.fillRect(-6, -2.5, 8, 5);

      ctx.fillStyle = '#475569'; // grey tail fins
      ctx.fillRect(-8, -3.5, 2, 7);
    } else if (this.type === 'grenade' || this.type === 'cluster' || this.type === 'cluster_shrapnel') {
      ctx.fillStyle   = this.type === 'cluster_shrapnel' ? '#f59e0b' : '#166534';
      ctx.strokeStyle = '#f1f5f9';
      ctx.lineWidth   = 1;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else if (this.type === 'holy') {
      ctx.fillStyle   = '#fbbf24';
      ctx.strokeStyle = '#78350f';
      ctx.lineWidth   = 1.5;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Cross
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth   = 1.5;
      ctx.beginPath();
      ctx.moveTo(this.x, this.y - this.radius);
      ctx.lineTo(this.x, this.y - this.radius - 5);
      ctx.moveTo(this.x - 3, this.y - this.radius - 3);
      ctx.lineTo(this.x + 3, this.y - this.radius - 3);
      ctx.stroke();
    } else if (this.type === 'dynamite') {
      ctx.fillStyle   = '#dc2626';
      ctx.strokeStyle = '#000000';
      ctx.lineWidth   = 1;
      ctx.fillRect(this.x - 3, this.y - 5, 6, 10);
      ctx.strokeRect(this.x - 3, this.y - 5, 6, 10);

      // Sparking fuse
      const time = performance.now() * 0.05;
      ctx.strokeStyle = time % 2 < 1 ? '#fbbf24' : '#ef4444';
      ctx.lineWidth   = 1.5;
      ctx.beginPath();
      ctx.moveTo(this.x, this.y - 5);
      ctx.quadraticCurveTo(this.x + 3, this.y - 9, this.x + 4, this.y - 8);
      ctx.stroke();
    }

    ctx.restore();
  }
}
