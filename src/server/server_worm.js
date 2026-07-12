import { resolveWormCollision, moveWorm } from '../common/physics.js';
import { WORM_MAX_HEALTH } from '../common/constants.js';

export class ServerWorm {
  constructor(id, x, y, name, teamName, teamColor, game) {
    this.id = id;
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.name = name;
    this.teamName = teamName;
    this.teamColor = teamColor;
    this.game = game;
    
    this.width = 12;
    this.height = 18;
    this.halfW = 6;
    this.halfH = 9;
    
    this.health = WORM_MAX_HEALTH;
    this.facingDir = Math.random() > 0.5 ? 1 : -1;
    this.aimAngle = -Math.PI / 6;
    this.isFalling = true;
    this.walkSpeed = 3.5;
  }

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
    this.game.broadcastAudio('splash');
    this.die(true);
  }

  die(drowned = false) {
    if (!drowned) {
      this.game.broadcastAudio('worm_die');
      this.game.carveTerrain(this.x, this.y + 4, 12);
    }
  }

  isSettled() {
    if (this.health <= 0) return true;
    return !this.isFalling && Math.abs(this.vx) < 0.1 && Math.abs(this.vy) < 0.1;
  }

  aim(dir, dt) {
    if (this.health <= 0) return;
    const aimSpeed = 0.04;
    this.aimAngle += dir * aimSpeed * dt;
    const minAim = -Math.PI / 2.1;
    const maxAim = Math.PI / 2.1;
    this.aimAngle = Math.max(minAim, Math.min(this.aimAngle, maxAim));
  }

  jump(isBackflip = false) {
    if (this.health <= 0 || this.isFalling) return;
    this.isFalling = true;
    this.game.broadcastAudio('jump');
    if (isBackflip) {
      this.vy = -6.0;
      this.vx = -this.facingDir * 2.0;
    } else {
      this.vy = -4.0;
      this.vx = this.facingDir * 2.8;
    }
  }

  move(dir, dt) {
    moveWorm(this, this.game.terrain, dir, dt);
  }

  update(dt) {
    if (this.health <= 0) return;
    
    if (this.y + this.halfH >= this.game.waterLevel) {
      this.drown();
      return;
    }
    
    if (this.isFalling) {
      this.vy += this.game.gravity * dt;
      this.vx *= Math.pow(0.98, dt);
    } else {
      this.vx *= Math.pow(0.92, dt);
    }
    
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    
    if (this.x < this.halfW) {
      this.x = this.halfW;
      this.vx = 0;
    } else if (this.x > this.game.width - this.halfW) {
      this.x = this.game.width - this.halfW;
      this.vx = 0;
    }
    
    this.resolveTerrainCollision(dt);
  }

  resolveTerrainCollision(dt) {
    resolveWormCollision(
      this,
      this.game.terrain,
      () => this.game.endActiveTurn(),
      (dmg) => {
        this.damage(dmg);
        this.game.broadcastAudio('worm_damage');
      }
    );
  }
}
