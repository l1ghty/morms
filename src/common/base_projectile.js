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
        this.fuse = 20.0; // 20 seconds maximum flying time
      }
      this.fuse -= dt / 60;
      if (this.fuse <= 0) {
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

    // Direct worm contact (rockets / missiles)
    if (this.contactFuse) {
      for (const worm of this.game.worms) {
        if (worm.health > 0) {
          const dx = worm.x - this.x;
          const dy = worm.y - this.y;
          if (dx * dx + dy * dy < 144) { // 12² = 144
            this.explode();
            return;
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
      const shrapType = this.type === 'banana' ? 'banana_shrapnel' : 'cluster_shrapnel';
      const speedScale = this.type === 'banana' ? 1.8 : 1.4;
      for (let i = 0; i < 5; i++) {
        const angle = -Math.PI / 2 + (i - 2) * 0.12 + (Math.random() - 0.5) * 0.08;
        const speed = (3.5 + Math.random() * 2.5) * speedScale;
        const shrap = this.createShrapnel(
          this.x,
          this.y - 6,
          Math.cos(angle) * speed,
          Math.sin(angle) * speed,
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
