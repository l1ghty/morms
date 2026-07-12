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
    
    this.health = 100;
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
    if (this.health <= 0 || this.isFalling) return;
    if (dir !== 0) {
      this.facingDir = dir;
      const newX = this.x + dir * this.walkSpeed * dt;
      const terrain = this.game.terrain;
      const feetY = this.y + this.halfH;
      
      let climbHeight = -1;
      const maxSlopeClimb = Math.max(8, Math.ceil(this.walkSpeed * dt * 1.6));
      
      for (let h = 0; h <= maxSlopeClimb; h++) {
        let isClear = true;
        const offsets = dir === 1 ? [-2, 0, 2, 4, 5] : [-5, -4, -2, 0, 2];
        for (const ox of offsets) {
          if (terrain.isSolid(newX + ox, feetY - h) ||
              terrain.isSolid(newX + ox, feetY - h - 8) ||
              terrain.isSolid(newX + ox, feetY - h - 15)) {
            isClear = false;
            break;
          }
        }
        if (isClear) {
          climbHeight = h;
          break;
        }
      }
      
      if (climbHeight !== -1) {
        this.x = newX;
        this.y -= climbHeight;
        if (climbHeight === 0) {
          const maxSlopeDescend = 8;
          let foundGroundOffset = -1;
          for (let dy = 1; dy <= maxSlopeDescend; dy++) {
            let isGroundSolid = false;
            for (let ox = -this.halfW + 2; ox <= this.halfW - 2; ox += 2) {
              if (terrain.isSolid(this.x + ox, this.y + this.halfH + dy)) {
                isGroundSolid = true;
                break;
              }
            }
            if (isGroundSolid) {
              foundGroundOffset = dy;
              break;
            }
          }
          if (foundGroundOffset !== -1) {
            this.y += (foundGroundOffset - 1);
          }
        }
      } else {
        this.vx = 0;
      }
    }
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
    const terrain = this.game.terrain;
    const feetY = this.y + this.halfH;
    let isInside = false;
    for (let ox = -this.halfW + 2; ox <= this.halfW - 2; ox += 2) {
      if (terrain.isSolid(this.x + ox, feetY)) {
        isInside = true;
        break;
      }
    }
    
    if (isInside) {
      if (this.vy >= 0) {
        if (this.isFalling && this.vy > 6.5) {
          const dmg = Math.round((this.vy - 6.5) * 16);
          if (dmg > 0) {
            this.damage(dmg);
            this.game.broadcastAudio('worm_damage');
            if (this === this.game.activeWorm &&
                (this.game.state === 'PLAYING' ||
                 this.game.state === 'FIRING' ||
                 this.game.state === 'RETREAT')) {
              this.game.endActiveTurn();
            }
          }
        }
        
        this.vy = 0;
        this.vx = 0;
        this.isFalling = false;
        
        let pushUpCount = 0;
        const maxPushUp = 20;
        while (pushUpCount < maxPushUp) {
          let stillInside = false;
          for (let ox = -this.halfW + 2; ox <= this.halfW - 2; ox += 2) {
            if (terrain.isSolid(this.x + ox, this.y + this.halfH)) {
              stillInside = true;
              break;
            }
          }
          if (stillInside) {
            this.y -= 1.0;
            pushUpCount++;
          } else {
            break;
          }
        }
      } else {
        this.vy = 0.5;
        this.vx *= 0.6;
        this.y += 1.5;
      }
    } else {
      let hasGround = false;
      for (let ox = -this.halfW + 2; ox <= this.halfW - 2; ox += 2) {
        if (terrain.isSolid(this.x + ox, feetY + 2.5)) {
          hasGround = true;
          break;
        }
      }
      if (!hasGround) {
        this.isFalling = true;
      }
    }
  }
}
