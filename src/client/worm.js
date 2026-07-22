import { BaseWorm } from '../common/base_worm.js';

export class Worm extends BaseWorm {
  constructor(x, y, name, teamName, teamColor, game) {
    super(x, y, name, teamName, teamColor, game);
  }

  // ─── Audio / Visual Hook Implementations ─────────────────────────────────────

  playAudio(name) {
    this.game.audio.play(name);
  }

  onDrown() {
    this.game.particles.spawnBurst(this.x, this.game.waterLevel, 'water', 15);
  }

  onDie(drowned) {
    if (!drowned) {
      this.game.particles.spawnBurst(this.x, this.y, 'smoke', 8);
      this.game.particles.spawnText(this.x, this.y - 10, 'RIP', '#94a3b8');
    }
  }

  onDamageVisual(amount) {
    this.game.particles.spawnText(this.x, this.y - 20, `-${amount}`, '#ef4444');
  }

  onMove(walked, dt) {
    if (walked && Math.random() < 0.15 * dt) {
      this.game.particles.spawnBurst(this.x, this.y + this.halfH, 'dirt', 1);
    }
  }

  // ─── Rendering ───────────────────────────────────────────────────────────────

  draw(ctx, isActive) {
    if (this.health <= 0) {
      // Gravestone
      ctx.fillStyle = '#64748b';
      ctx.fillRect(this.x - 5, this.y - 6, 10, 14);
      ctx.fillStyle = '#475569';
      ctx.fillRect(this.x - 3, this.y - 1, 6, 2);
      ctx.fillRect(this.x - 1, this.y - 4, 2, 8);
      return;
    }

    ctx.save();

    // Render active Ninja Rope
    if (this.rope && this.rope.attached) {
      ctx.strokeStyle = '#d97706';
      ctx.lineWidth = 2.5;
      ctx.setLineDash([6, 3]);
      ctx.beginPath();
      ctx.moveTo(this.x, this.y - 2);
      ctx.lineTo(this.rope.x, this.rope.y);
      ctx.stroke();
      ctx.setLineDash([]);

      // Grapple Hook anchor point
      ctx.fillStyle = '#475569';
      ctx.beginPath();
      ctx.arc(this.rope.x, this.rope.y, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }

    // Worm body (pink capsule)
    ctx.fillStyle = '#ff8fa3';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(this.x, this.y - this.halfH + 5, 6, Math.PI, 0, false);
    ctx.lineTo(this.x + 6, this.y + this.halfH);
    ctx.lineTo(this.x - 6, this.y + this.halfH);
    ctx.closePath();
    ctx.fill();

    // Team headband
    ctx.fillStyle = this.teamColor;
    ctx.fillRect(this.x - 6, this.y - this.halfH + 1.5, 12, 3);

    // Headband knot tails
    ctx.beginPath();
    const knotX = this.x - this.facingDir * 6;
    const knotY = this.y - this.halfH + 3;
    ctx.arc(knotX, knotY, 2, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = this.teamColor;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(knotX, knotY);
    ctx.lineTo(knotX - this.facingDir * 3, knotY + 3);
    ctx.moveTo(knotX, knotY);
    ctx.lineTo(knotX - this.facingDir * 2, knotY + 5);
    ctx.stroke();

    // Belly banding details
    ctx.strokeStyle = '#f472b6';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(this.x - 4, this.y + 2); ctx.lineTo(this.x + 4, this.y + 2);
    ctx.moveTo(this.x - 5, this.y + 5); ctx.lineTo(this.x + 5, this.y + 5);
    ctx.stroke();

    // Eyes
    ctx.fillStyle = '#ffffff';
    const eyeOffsetX = this.facingDir * 3;
    const eyeOffsetY = -4;
    ctx.beginPath();
    ctx.arc(this.x + eyeOffsetX, this.y + eyeOffsetY, 2.5, 0, Math.PI * 2);
    ctx.fill();

    // Pupils
    ctx.fillStyle = '#000000';
    const pupilX = this.x + eyeOffsetX + this.facingDir * 0.8;
    const pupilY = this.y + eyeOffsetY + Math.sin(this.aimAngle) * 0.8;
    ctx.beginPath();
    ctx.arc(pupilX, pupilY, 1, 0, Math.PI * 2);
    ctx.fill();

    // Active worm indicators
    if (isActive) {
      const time   = performance.now() * 0.006;
      const bounce = Math.sin(time) * 4 - 24;

      ctx.fillStyle   = '#10b981';
      ctx.strokeStyle = '#022c22';
      ctx.lineWidth   = 1.5;
      ctx.beginPath();
      ctx.moveTo(this.x, this.y + bounce);
      ctx.lineTo(this.x - 6, this.y + bounce - 8);
      ctx.lineTo(this.x - 2, this.y + bounce - 8);
      ctx.lineTo(this.x - 2, this.y + bounce - 14);
      ctx.lineTo(this.x + 2, this.y + bounce - 14);
      ctx.lineTo(this.x + 2, this.y + bounce - 8);
      ctx.lineTo(this.x + 6, this.y + bounce - 8);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Aiming reticle
      const weapon = this.game.WEAPONS ? this.game.WEAPONS[this.game.selectedWeaponIndex] : { id: 'bazooka' };
      if (weapon.id !== 'airstrike') {
        const aimDist = 80;
        const ax = this.x + Math.cos(this.aimAngle) * this.facingDir * aimDist;
        const ay = this.y + Math.sin(this.aimAngle) * aimDist;

        ctx.strokeStyle = '#a3e635';
        ctx.lineWidth   = 1.5;
        ctx.beginPath();
        ctx.arc(ax, ay, 6, 0, Math.PI * 2);
        ctx.moveTo(ax - 10, ay); ctx.lineTo(ax + 10, ay);
        ctx.moveTo(ax, ay - 10); ctx.lineTo(ax, ay + 10);
        ctx.stroke();
      }

      this.drawHeldWeapon(ctx, weapon.id);
    }

    this.drawNameLabel(ctx);
    ctx.restore();
  }

  drawHeldWeapon(ctx, weaponId) {
    const aimX = Math.cos(this.aimAngle) * this.facingDir;
    const aimY = Math.sin(this.aimAngle);
    const wx   = this.x + aimX * 6;
    const wy   = this.y + aimY * 2;

    ctx.save();
    ctx.translate(wx, wy);
    ctx.rotate(Math.atan2(aimY, aimX));

    if (weaponId === 'bazooka') {
      ctx.fillStyle = '#475569';
      ctx.fillRect(-2, -3, 16, 5);
      ctx.fillStyle = '#94a3b8';
      ctx.fillRect(10, -4, 2, 7);
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 1, 2, 3);
    } else if (weaponId === 'grenade' || weaponId === 'cluster' || weaponId === 'holy') {
      ctx.fillStyle = weaponId === 'holy' ? '#fbbf24' : '#15803d';
      ctx.beginPath();
      ctx.arc(4, 0, 3, 0, Math.PI * 2);
      ctx.fill();
      if (weaponId === 'holy') {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(4, -5); ctx.lineTo(4, -2); ctx.moveTo(2, -4); ctx.lineTo(6, -4); ctx.stroke();
      }
    } else if (weaponId === 'banana') {
      ctx.fillStyle = '#facc15';
      ctx.strokeStyle = '#854d0e';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.arc(4, 0, 3, 0.25 * Math.PI, 1.25 * Math.PI, false);
      ctx.arc(4, 0, 2, 1.25 * Math.PI, 0.25 * Math.PI, true);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else if (weaponId === 'baseball_bat') {
      ctx.fillStyle = '#d97706'; // wood color
      ctx.strokeStyle = '#78350f'; // dark wood border
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, -1.5);
      ctx.lineTo(13, -3);
      ctx.lineTo(13, 2);
      ctx.lineTo(0, 0.5);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // Grip
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(-2, -1, 3, 1.8);
    } else if (weaponId === 'super_sheep') {
      ctx.fillStyle = '#ef4444'; // cape
      ctx.beginPath();
      ctx.moveTo(-1, 0);
      ctx.lineTo(-6, -3);
      ctx.lineTo(-4, 3);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#ffffff'; // fluffy body
      ctx.beginPath();
      ctx.arc(3, 0, 3, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#fca5a5'; // head
      ctx.beginPath();
      ctx.arc(5, -0.5, 1.8, 0, Math.PI * 2);
      ctx.fill();
    } else if (weaponId === 'dynamite') {
      ctx.fillStyle = '#dc2626';
      ctx.fillRect(2, -2, 6, 4);
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(8, 0);
      ctx.quadraticCurveTo(10, -2, 11, -1);
      ctx.stroke();
    } else if (weaponId === 'blowtorch') {
      ctx.fillStyle = '#94a3b8';
      ctx.fillRect(-1, -2, 10, 4);
      ctx.fillStyle = '#f59e0b';
      ctx.fillRect(0, 2, 2, 3);
      ctx.fillStyle = 'rgba(56, 189, 248, 0.7)';
      ctx.beginPath();
      ctx.moveTo(9, -1); ctx.lineTo(13, 0); ctx.lineTo(9, 1);
      ctx.closePath();
      ctx.fill();
    } else if (weaponId === 'ninja_rope') {
      ctx.fillStyle = '#334155';
      ctx.fillRect(0, -2, 10, 4);
      ctx.fillStyle = '#d97706';
      ctx.beginPath();
      ctx.arc(2, 3, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#94a3b8';
      ctx.beginPath();
      ctx.moveTo(10, -3); ctx.lineTo(13, 0); ctx.lineTo(10, 3);
      ctx.closePath();
      ctx.fill();
    }

    ctx.restore();
  }

  drawNameLabel(ctx) {
    ctx.font      = 'bold 9px Space Grotesk';
    ctx.textAlign = 'center';

    ctx.fillStyle = 'rgba(15, 23, 42, 0.55)';
    ctx.fillRect(this.x - 30, this.y - this.halfH - 24, 60, 13);

    ctx.fillStyle = this.teamColor === '#ef4444' ? '#fca5a5' : '#93c5fd';
    ctx.fillText(this.name, this.x, this.y - this.halfH - 14);

    const hbW = 34;
    const hbH = 3;
    const hbX = this.x - hbW / 2;
    const hbY = this.y - this.halfH - 9;

    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(hbX, hbY, hbW, hbH);

    const pct = this.health / 100;
    if      (pct > 0.5) ctx.fillStyle = '#10b981';
    else if (pct > 0.2) ctx.fillStyle = '#fbbf24';
    else                ctx.fillStyle = '#ef4444';
    ctx.fillRect(hbX, hbY, hbW * pct, hbH);

    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth   = 0.5;
    ctx.strokeRect(hbX, hbY, hbW, hbH);
  }
}
