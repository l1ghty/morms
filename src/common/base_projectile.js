import { setupWeaponProperties, handleTerrainBounce } from './physics.js';

/**
 * BaseProjectile — shared physics loop, fuse countdown, terrain/worm
 * contact detection, and cluster shrapnel logic for both client Projectile
 * and headless ServerProjectile.
 *
 * Subclasses must implement:
 *   playAudio(name)          — play/broadcast a sound effect
 *   doExplode()              — trigger terrain carve + damage calculation
 *   createShrapnel(x,y,vx,vy) — instantiate a new projectile of same class
 *
 * Subclasses may override (optional hooks):
 *   onWaterHit()             — water splash particles
 *   onFlightParticle()       — smoke trail particles during flight
 *   onHallelujah()           — holy grenade audio cue (already handled in base)
 */
export class BaseProjectile {
  constructor(x, y, vx, vy, type, game) {
    this.x    = x;
    this.y    = y;
    this.vx   = vx;
    this.vy   = vy;
    this.type = type;
    this.game = game;

    this.isDead = false;

    const props = setupWeaponProperties(this.type, this.game.selectedFuseTime);
    Object.assign(this, props);
  }

  // ─── Physics Update ─────────────────────────────────────────────────────────

  update(dt) {
    if (this.isDead) return;

    // Drowned / out of bounds
    if (this.y >= this.game.waterLevel) {
      this.playAudio('splash');
      this.onWaterHit();
      this.isDead = true;
      return;
    }

    if (this.type === 'super_sheep') {
      // Super sheep flight steering
      let goLeft = false;
      let goRight = false;
      if (this.game.activePlayerKeys) {
        // Server-side
        goLeft = this.game.activePlayerKeys.ArrowLeft;
        goRight = this.game.activePlayerKeys.ArrowRight;
      } else if (this.game.keys) {
        // Client-side
        goLeft = this.game.keys['ArrowLeft'] || this.game.keys['KeyA'] || this.game.keys['a'] || this.game.keys['A'];
        goRight = this.game.keys['ArrowRight'] || this.game.keys['KeyD'] || this.game.keys['d'] || this.game.keys['D'];
      }

      let angle = Math.atan2(this.vy, this.vx);
      const turnSpeed = 0.05 * dt; // radians per frame
      if (goLeft) angle -= turnSpeed;
      if (goRight) angle += turnSpeed;

      if (!this.sheepSpeed) {
        this.sheepSpeed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
        this.sheepSpeed = Math.max(5.5, Math.min(9.0, this.sheepSpeed));
      }
      this.vx = Math.cos(angle) * this.sheepSpeed;
      this.vy = Math.sin(angle) * this.sheepSpeed;
    } else if (this.type === 'homing_missile') {
      // ── Homing missile: boost upward, then home toward clicked target ──────
      if (this.fuse === undefined) this.fuse = 10.0;
      if (this._boostTimer === undefined) this._boostTimer = 0.6; // seconds to fly straight up

      this.fuse -= dt / 60;
      const bounds = 500;
      if (this.fuse <= 0 || this.y < -bounds || this.x < -bounds || this.x > this.game.width + bounds) {
        this.explode();
        return;
      }

      if (this._boostTimer > 0) {
        // Boost phase: steer upward at constant speed
        this._boostTimer -= dt / 60;
        const upAngle = -Math.PI / 2; // straight up
        let currentAngle = Math.atan2(this.vy, this.vx);
        let diff = upAngle - currentAngle;
        while (diff > Math.PI) diff -= 2 * Math.PI;
        while (diff < -Math.PI) diff += 2 * Math.PI;
        const maxTurn = 0.12 * dt; // faster turn during boost
        currentAngle += Math.sign(diff) * Math.min(Math.abs(diff), maxTurn);
        this.vx = Math.cos(currentAngle) * this.homingSpeed;
        this.vy = Math.sin(currentAngle) * this.homingSpeed;
      } else {
        // Homing phase: steer toward clicked target
        let currentAngle = Math.atan2(this.vy, this.vx);

        if (this.homingTargetX !== undefined && this.homingTargetY !== undefined) {
          const dx = this.homingTargetX - this.x;
          const dy = this.homingTargetY - this.y;
          const desiredAngle = Math.atan2(dy, dx);

          // Shortest arc rotation
          let diff = desiredAngle - currentAngle;
          while (diff > Math.PI) diff -= 2 * Math.PI;
          while (diff < -Math.PI) diff += 2 * Math.PI;

          // Allow player to nudge target lock
          let nudge = 0;
          if (this.game.activePlayerKeys) {
            if (this.game.activePlayerKeys.ArrowLeft) nudge -= 0.02 * dt;
            if (this.game.activePlayerKeys.ArrowRight) nudge += 0.02 * dt;
          } else if (this.game.keys) {
            if (this.game.keys['ArrowLeft'] || this.game.keys['KeyA']) nudge -= 0.02 * dt;
            if (this.game.keys['ArrowRight'] || this.game.keys['KeyD']) nudge += 0.02 * dt;
          }

          const maxTurn = this.homingTurnRate * dt;
          const steer = Math.sign(diff) * Math.min(Math.abs(diff), maxTurn) + nudge;
          currentAngle += steer;
        }

        this.vx = Math.cos(currentAngle) * this.homingSpeed;
        this.vy = Math.sin(currentAngle) * this.homingSpeed;
      }
    } else {
      // Gravity
      this.vy += this.game.gravity * dt;

      // Wind
      if (this.affectedByWind && this.game.wind) {
        this.vx += this.game.wind.x * 0.04 * dt;
      }

      // Drag
      this.vx *= Math.pow(0.992, dt);
      this.vy *= Math.pow(0.992, dt);
    }

    // Integrate position
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    // Optional flight particles (smoke trail for rockets)
    this.onFlightParticle(dt);

    // Fuse countdown (timed weapons)
    if (!this.contactFuse) {
      this.fuse -= dt / 60;

      if (this.type === 'holy' && this.fuse <= 1.1 && !this.playedHallelujah) {
        this.playedHallelujah = true;
        this.playAudio('hallelujah');
      }

      if (this.fuse <= 0) {
        this.explode();
        return;
      }
    } else if (this.type === 'super_sheep') {
      if (this.fuse === undefined) {
        this.fuse = 12.0;
      }
      this.fuse -= dt / 60;
      const bounds = 500;
      if (this.fuse <= 0 || this.y < -bounds || this.x < -bounds || this.x > this.game.width + bounds) {
        this.explode();
        return;
      }
    }

    // Terrain collision
    if (this.game.terrain.isSolid(this.x, this.y)) {
      if (this.contactFuse) {
        this.explode();
      } else {
        handleTerrainBounce(this, this.game.terrain, () => this.playAudio('bounce'));
      }
      return;
    }

    // Direct worm contact (rockets / missiles / banana shrapnel)
    if (this.contactFuse) {
      for (const worm of this.game.worms) {
        if (!worm.isGrave) {
          // Homing missile should not self-detonate on the firing worm
          if (this.type === 'homing_missile' && this.game.activeWorm && worm === this.game.activeWorm) continue;
          const dx = worm.x - this.x;
          const dy = worm.y - this.y;
          if (dx * dx + dy * dy < 144) { // 12² = 144
            this.explode();
            return;
          }
        }
      }
    } else if (this.type === 'banana_shrapnel' && !this.hasImpacted) {
      for (const worm of this.game.worms) {
        if (!worm.isGrave) {
          const dx = worm.x - this.x;
          const dy = worm.y - this.y;
          if (dx * dx + dy * dy < 144) {
            this.hasImpacted = true;
            this.fuse = 0.2;
            break;
          }
        }
      }
    }
  }

  // ─── Explosion + Cluster Shrapnel ────────────────────────────────────────────

  explode() {
    this.isDead = true;
    this.doExplode();

    if (this.type === 'cluster' || this.type === 'banana') {
      const isBanana = this.type === 'banana';
      const shrapType = isBanana ? 'banana_shrapnel' : 'cluster_shrapnel';
      const count = 5;
      for (let i = 0; i < count; i++) {
        const spreadFactor = isBanana ? 0.38 : 0.18;
        const angle = -Math.PI / 2 + (i - (count - 1) / 2) * spreadFactor + (Math.random() - 0.5) * 0.12;
        const baseSpeed = isBanana ? (6.5 + Math.random() * 4.0) : (4.0 + Math.random() * 2.5);
        const shrap = this.createShrapnel(
          this.x,
          this.y - 8,
          Math.cos(angle) * baseSpeed,
          Math.sin(angle) * baseSpeed,
          shrapType
        );
        this.game.projectiles.push(shrap);
      }
    }
  }

  // ─── Abstract / Hook Methods (override in subclass) ──────────────────────────

  /** Must be overridden — plays/broadcasts a sound by name. */
  playAudio(name) {}

  /** Must be overridden — trigger damage + terrain carving at explosion site. */
  doExplode() {}

  /** Must be overridden — return a new shrapnel projectile of the same class. */
  createShrapnel(x, y, vx, vy) { return null; }

  /** Optional — water splash particles. */
  onWaterHit() {}

  /** Optional — smoke trail particles during flight. */
  onFlightParticle(dt) {}
}
