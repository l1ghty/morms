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

  createShrapnel(x, y, vx, vy, type = 'cluster_shrapnel') {
    return new Projectile(x, y, vx, vy, type, this.game);
  }

  onWaterHit() {
    this.game.particles.spawnBurst(this.x, this.game.waterLevel, 'water', 8);
  }

  onFlightParticle(dt) {
    if (this.type === 'bazooka' || this.type === 'airstrike_missile' || this.type === 'super_sheep') {
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
    } else if (this.type === 'banana' || this.type === 'banana_shrapnel') {
      ctx.save();
      ctx.translate(this.x, this.y);
      const spin = (this.x * 0.05 + performance.now() * 0.008) % (Math.PI * 2);
      ctx.rotate(spin);
      const r = this.radius;
      ctx.fillStyle = '#facc15';
      ctx.strokeStyle = '#854d0e';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0.25 * Math.PI, 1.25 * Math.PI, false);
      ctx.arc(0, 0, r * 0.65, 1.25 * Math.PI, 0.25 * Math.PI, true);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#16a34a';
      ctx.beginPath();
      ctx.arc(0, 0, r, 0.25 * Math.PI, 0.45 * Math.PI);
      ctx.lineTo(0, 0);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    } else if (this.type === 'super_sheep') {
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.rotate(Math.atan2(this.vy, this.vx));

      ctx.fillStyle = '#ef4444'; // Red cape
      ctx.beginPath();
      ctx.moveTo(-6, 0);
      ctx.lineTo(-14, -6);
      ctx.lineTo(-11, 6);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(-3, 4); ctx.lineTo(-3, 7);
      ctx.moveTo(3, 4); ctx.lineTo(3, 7);
      ctx.stroke();

      ctx.fillStyle = '#ffffff'; // fluffy body
      ctx.beginPath();
      ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(-3, -2, 3.5, 0, Math.PI * 2);
      ctx.arc(3, 1, 3.5, 0, Math.PI * 2);
      ctx.arc(-2, 2, 3, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#fca5a5'; // face
      ctx.beginPath();
      ctx.arc(this.radius - 1, -1, 3.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#000000';
      ctx.beginPath();
      ctx.arc(this.radius, -2, 0.7, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
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

    // Fuse countdown timer badge above timed weapons
    if (!this.contactFuse && this.fuse > 0) {
      const secs = Math.ceil(this.fuse);
      ctx.font = '800 10px Space Grotesk';
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
      ctx.fillRect(this.x - 8, this.y - this.radius - 17, 16, 12);
      ctx.fillStyle = '#f59e0b';
      ctx.fillText(`${secs}`, this.x, this.y - this.radius - 7);
    }

    ctx.restore();
  }
}
