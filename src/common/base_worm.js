import { resolveWormCollision, moveWorm } from './physics.js';
import { WORM_MAX_HEALTH } from './constants.js';

/**
 * BaseWorm — shared physics, damage system, aim, and collision for
 * both the client Worm and the headless ServerWorm.
 *
 * Subclasses must implement:
 *   playAudio(name)         — play/broadcast a sound effect
 *
 * Subclasses may override (optional hooks):
 *   onDrown()               — visual/broadcast extras when drowning
 *   onDie(drowned)          — visual/broadcast extras on death
 *   onDamageVisual(amount)  — floating damage text / broadcast
 *   onMove(walked)          — dirt particles when walking
 */
export class BaseWorm {
  constructor(x, y, name, teamName, teamColor, game) {
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;

    this.name = name;
    this.teamName = teamName;
    this.teamColor = teamColor;
    this.game = game;

    // Hitbox dimensions
    this.width  = 12;
    this.height = 18;
    this.halfW  = this.width  / 2;
    this.halfH  = this.height / 2;

    this.health    = WORM_MAX_HEALTH;
    this.facingDir = Math.random() > 0.5 ? 1 : -1;
    this.aimAngle  = -Math.PI / 6;
    this.isFalling = true;
    this.walkSpeed = 3.5;
    this.rope      = null; // { attached: true, x: number, y: number, length: number }
  }

  // ─── Physics Update ─────────────────────────────────────────────────────────

  update(dt) {
    if (this.health <= 0) return;

    // Drowning
    if (this.y + this.halfH >= this.game.waterLevel) {
      if (this.rope) this.detachRope();
      this.drown();
      return;
    }

    // Rope mechanics update
    if (this.rope && this.rope.attached) {
      this.isFalling = true;
      this.vy += this.game.gravity * dt;
      this.vx *= Math.pow(0.992, dt);
      this.vy *= Math.pow(0.992, dt);

      this.x += this.vx * dt;
      this.y += this.vy * dt;

      // Enforce rope distance constraint
      const dx = this.x - this.rope.x;
      const dy = this.y - this.rope.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist > this.rope.length && dist > 0) {
        const nx = dx / dist;
        const ny = dy / dist;
        this.x = this.rope.x + nx * this.rope.length;
        this.y = this.rope.y + ny * this.rope.length;

        const vRadial = this.vx * nx + this.vy * ny;
        if (vRadial > 0) {
          this.vx -= vRadial * nx;
          this.vy -= vRadial * ny;
        }
      }
    } else {
      // Gravity + drag
      if (this.isFalling) {
        this.vy += this.game.gravity * dt;
        this.vx *= Math.pow(0.98, dt);
      } else {
        this.vx *= Math.pow(0.92, dt);
      }

      this.x += this.vx * dt;
      this.y += this.vy * dt;
    }

    // Horizontal map bounds
    if (this.x < this.halfW) {
      this.x  = this.halfW;
      this.vx = 0;
    } else if (this.x > this.game.width - this.halfW) {
      this.x  = this.game.width - this.halfW;
      this.vx = 0;
    }

    this.resolveTerrainCollision(dt);
  }

  fireRope() {
    if (this.rope && this.rope.attached) {
      this.detachRope();
      return true;
    }

    const aimX = Math.cos(this.aimAngle) * this.facingDir;
    const aimY = Math.sin(this.aimAngle);
    const maxRange = 480;
    const step = 4;
    let hitX = null;
    let hitY = null;

    for (let d = 10; d <= maxRange; d += step) {
      const checkX = this.x + aimX * d;
      const checkY = this.y + aimY * d;
      if (checkX < 0 || checkX > this.game.width || checkY < 0 || checkY > this.game.waterLevel) {
        break;
      }
      if (this.game.terrain.isSolid(checkX, checkY)) {
        hitX = checkX;
        hitY = checkY;
        break;
      }
    }

    if (hitX !== null && hitY !== null) {
      const ropeLength = Math.hypot(this.x - hitX, this.y - hitY);
      this.rope = {
        attached: true,
        x: hitX,
        y: hitY,
        length: Math.max(25, ropeLength)
      };
      this.isFalling = true;
      this.playAudio('rope_attach');
      return true;
    } else {
      this.playAudio('beep_error');
      return false;
    }
  }

  detachRope() {
    if (this.rope) {
      this.rope = null;
      this.playAudio('jump');
    }
  }

  swingRope(dir, dt) {
    if (this.rope && this.rope.attached) {
      this.vx += dir * 0.55 * dt;
    }
  }

  adjustRopeLength(dir, dt) {
    if (this.rope && this.rope.attached) {
      this.rope.length = Math.max(25, Math.min(550, this.rope.length + dir * 6.5 * dt));
    }
  }

  resolveTerrainCollision(dt) {
    resolveWormCollision(
      this,
      this.game.terrain,
      () => this.game.endActiveTurn(),
      (dmg) => {
        this.damage(dmg);
        this.onDamageVisual(dmg);
      }
    );
  }

  move(dir, dt) {
    const walked = moveWorm(this, this.game.terrain, dir, dt);
    this.onMove(walked, dt);
  }

  // ─── Aim & Jump ─────────────────────────────────────────────────────────────

  aim(dir, dt) {
    if (this.health <= 0) return;
    const aimSpeed = 0.04;
    this.aimAngle += dir * aimSpeed * dt;
    const minAim = -Math.PI / 2.1;
    const maxAim =  Math.PI / 2.1;
    this.aimAngle = Math.max(minAim, Math.min(this.aimAngle, maxAim));
  }

  jump(isBackflip = false) {
    if (this.health <= 0 || this.isFalling) return;
    this.isFalling = true;
    this.playAudio('jump');
    if (isBackflip) {
      this.vy = -6.0;
      this.vx = -this.facingDir * 2.0;
    } else {
      this.vy = -4.0;
      this.vx =  this.facingDir * 2.8;
    }
  }

  // ─── Health / Death ─────────────────────────────────────────────────────────

  damage(amount) {
    if (this.health <= 0) return;
    this.health -= amount;
    this.game.totalDamageDealt += amount;
    if (this.health <= 0) {
      this.health = 0;
      this.die();
    }
  }

  drown() {
    this.health = 0;
    this.game.wormsDrowned++;
    this.playAudio('splash');
    this.onDrown();
    this.die(true);
  }

  die(drowned = false) {
    if (!drowned) {
      this.playAudio('worm_die');
      this.game.carveTerrain(this.x, this.y + 4, 12);
    }
    this.onDie(drowned);
  }

  isSettled() {
    if (this.health <= 0) return true;
    if (this.rope && this.rope.attached) return false;
    return !this.isFalling && Math.abs(this.vx) < 0.05 && Math.abs(this.vy) < 0.05;
  }

  // ─── Abstract / Hook Methods (override in subclass) ──────────────────────────

  /** Must be overridden — plays/broadcasts a sound by name. */
  playAudio(name) {}

  /** Optional — visual extras when drowning (particles). */
  onDrown() {}

  /** Optional — visual extras on death (smoke, text, etc). */
  onDie(drowned) {}

  /** Optional — floating damage number / broadcast. */
  onDamageVisual(amount) {}

  /** Optional — dirt particles while walking. */
  onMove(walked, dt) {}
}
