import { resolveWormCollision, moveWorm } from '../common/physics.js';

export class Worm {
  constructor(x, y, name, teamName, teamColor, game) {
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    
    this.name = name;
    this.teamName = teamName;
    this.teamColor = teamColor;
    this.game = game;
    
    // Worm dimensions
    this.width = 12;
    this.height = 18;
    this.halfW = this.width / 2;
    this.halfH = this.height / 2;
    
    this.health = 100;
    this.facingDir = Math.random() > 0.5 ? 1 : -1; // 1 = Right, -1 = Left
    this.aimAngle = -Math.PI / 6; // Aim upwards 30 degrees default
    
    this.isFalling = true;
    this.walkSpeed = 3.5;
  }

  update(dt) {
    if (this.health <= 0) return;
    
    // 1. Drowning check
    if (this.y + this.halfH >= this.game.waterLevel) {
      this.drown();
      return;
    }
    
    // 2. Physics & Gravity
    if (this.isFalling) {
      this.vy += this.game.gravity * dt;
      // Air drag
      this.vx *= Math.pow(0.98, dt);
    } else {
      // Ground friction
      this.vx *= Math.pow(0.92, dt);
    }
    
    // Move
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    
    // 3. Keep within horizontal map bounds
    if (this.x < this.halfW) {
      this.x = this.halfW;
      this.vx = 0;
    } else if (this.x > this.game.width - this.halfW) {
      this.x = this.game.width - this.halfW;
      this.vx = 0;
    }
    
    // 4. Terrain collision resolution
    this.resolveTerrainCollision(dt);
  }

  resolveTerrainCollision(dt) {
    resolveWormCollision(
      this,
      this.game.terrain,
      () => this.game.endActiveTurn(),
      (dmg) => {
        this.damage(dmg);
        this.game.audio.play('worm_damage');
        this.game.particles.spawnText(this.x, this.y - 20, `-${dmg}`, '#ef4444');
      }
    );
  }

  move(dir, dt) {
    const walked = moveWorm(this, this.game.terrain, dir, dt);
    if (walked) {
      if (Math.random() < 0.15 * dt) {
        this.game.particles.spawnBurst(this.x, this.y + this.halfH, 'dirt', 1);
      }
    }
  }

  aim(dir, dt) {
    if (this.health <= 0) return;
    
    // Rotate aiming reticle up/down (clamped)
    const aimSpeed = 0.04;
    this.aimAngle += dir * aimSpeed * dt;
    
    // Clamp aiming to between straight up (-PI/2) and straight down (PI/2)
    const minAim = -Math.PI / 2.1;
    const maxAim = Math.PI / 2.1;
    this.aimAngle = Math.max(minAim, Math.min(this.aimAngle, maxAim));
  }

  jump(isBackflip = false) {
    if (this.health <= 0 || this.isFalling) return;
    
    this.isFalling = true;
    this.game.audio.play('jump');
    
    if (isBackflip) {
      // Backflip: High jump backwards
      this.vy = -6.0;
      this.vx = -this.facingDir * 2.0;
    } else {
      // Standard Jump: forwards
      this.vy = -4.0;
      this.vx = this.facingDir * 2.8;
    }
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
    this.game.audio.play('splash');
    this.game.particles.spawnBurst(this.x, this.game.waterLevel, 'water', 15);
    this.die(true);
  }

  die(drowned = false) {
    if (!drowned) {
      this.game.audio.play('worm_die');
      // Create a neat little explosion at corpse to clear terrain and throw a small gravestone
      this.game.particles.spawnBurst(this.x, this.y, 'smoke', 8);
      this.game.particles.spawnText(this.x, this.y - 10, 'RIP', '#94a3b8');
      
      // Carve a tiny grave crater
      this.game.carveTerrain(this.x, this.y + 4, 12);
    }
  }

  isSettled() {
    // A worm is settled if it's dead, or if it is at rest on the ground (no velocity)
    if (this.health <= 0) return true;
    return !this.isFalling && Math.abs(this.vx) < 0.05 && Math.abs(this.vy) < 0.05;
  }

  draw(ctx, isActive) {
    if (this.health <= 0) {
      // Draw simple small grey gravestone
      ctx.fillStyle = '#64748b';
      ctx.fillRect(this.x - 5, this.y - 6, 10, 14);
      ctx.fillStyle = '#475569';
      ctx.fillRect(this.x - 3, this.y - 1, 6, 2);
      ctx.fillRect(this.x - 1, this.y - 4, 2, 8);
      return;
    }
    
    ctx.save();
    
    // Draw worm body (pink capsule)
    // Draw head and body separately to make it look organic
    ctx.fillStyle = '#ff8fa3';
    ctx.lineWidth = 1;
    
    ctx.beginPath();
    // Rounded top, flat bottom capsule
    ctx.arc(this.x, this.y - this.halfH + 5, 6, Math.PI, 0, false);
    ctx.lineTo(this.x + 6, this.y + this.halfH);
    ctx.lineTo(this.x - 6, this.y + this.halfH);
    ctx.closePath();
    ctx.fill();
    
    // Cute Team Headband
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

    // Cute banding details on belly
    ctx.strokeStyle = '#f472b6';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(this.x - 4, this.y + 2);
    ctx.lineTo(this.x + 4, this.y + 2);
    ctx.moveTo(this.x - 5, this.y + 5);
    ctx.lineTo(this.x + 5, this.y + 5);
    ctx.stroke();
    
    // Draw Eyes
    ctx.fillStyle = '#ffffff';
    // Position eyes based on facing direction
    const eyeOffsetX = this.facingDir * 3;
    const eyeOffsetY = -4;
    
    ctx.beginPath();
    ctx.arc(this.x + eyeOffsetX, this.y + eyeOffsetY, 2.5, 0, Math.PI * 2);
    ctx.fill();
    
    // Pupils looking slightly in aim direction
    ctx.fillStyle = '#000000';
    const pupilX = this.x + eyeOffsetX + this.facingDir * 0.8;
    const pupilY = this.y + eyeOffsetY + Math.sin(this.aimAngle) * 0.8;
    ctx.beginPath();
    ctx.arc(pupilX, pupilY, 1, 0, Math.PI * 2);
    ctx.fill();
    
    // Active indicators
    if (isActive) {
      // Animated green pointer arrow above head bouncing up and down
      const time = performance.now() * 0.006;
      const bounce = Math.sin(time) * 4 - 24;
      
      ctx.fillStyle = '#10b981';
      ctx.strokeStyle = '#022c22';
      ctx.lineWidth = 1.5;
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
      
      // Draw Aiming Crosshair
      const weapon = this.game.WEAPONS ? this.game.WEAPONS[this.game.selectedWeaponIndex] : { id: 'bazooka' };
      if (weapon.id !== 'airstrike') {
        const aimDist = 80; // doubled visual aiming distance to match doubled range
        const ax = this.x + Math.cos(this.aimAngle) * this.facingDir * aimDist;
        const ay = this.y + Math.sin(this.aimAngle) * aimDist;
        
        ctx.strokeStyle = '#a3e635'; // Lime green aiming reticle
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(ax, ay, 6, 0, Math.PI * 2);
        ctx.moveTo(ax - 10, ay); ctx.lineTo(ax + 10, ay);
        ctx.moveTo(ax, ay - 10); ctx.lineTo(ax, ay + 10);
        ctx.stroke();
      }
      
      // Draw weapon held by worm
      this.drawHeldWeapon(ctx, weapon.id);
    }
    
    // Draw Health / Name label above worm
    this.drawNameLabel(ctx);
    
    ctx.restore();
  }

  drawHeldWeapon(ctx, weaponId) {
    const aimX = Math.cos(this.aimAngle) * this.facingDir;
    const aimY = Math.sin(this.aimAngle);
    
    // Center point of weapon
    const wx = this.x + aimX * 6;
    const wy = this.y + aimY * 2;
    
    ctx.save();
    ctx.translate(wx, wy);
    // Rotate canvas in direction of weapon angle
    // If facing left, we flip the drawing vertically
    const rot = Math.atan2(aimY, aimX);
    ctx.rotate(rot);
    
    if (weaponId === 'bazooka') {
      // Grey launcher tube
      ctx.fillStyle = '#475569';
      ctx.fillRect(-2, -3, 16, 5);
      ctx.fillStyle = '#94a3b8';
      ctx.fillRect(10, -4, 2, 7); // end nozzle
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 1, 2, 3); // handle
    } 
    else if (weaponId === 'grenade' || weaponId === 'cluster' || weaponId === 'holy') {
      // Little grenade item in hand
      ctx.fillStyle = weaponId === 'holy' ? '#fbbf24' : '#15803d';
      ctx.beginPath();
      ctx.arc(4, 0, 3, 0, Math.PI * 2);
      ctx.fill();
      if (weaponId === 'holy') {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(4, -5); ctx.lineTo(4, -2); ctx.moveTo(2, -4); ctx.lineTo(6, -4); ctx.stroke(); // Tiny cross
      }
    } 
    else if (weaponId === 'dynamite') {
      // Red stick of dynamite
      ctx.fillStyle = '#dc2626';
      ctx.fillRect(2, -2, 6, 4);
      // Sparking fuse
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(8, 0);
      ctx.quadraticCurveTo(10, -2, 11, -1);
      ctx.stroke();
    }
    else if (weaponId === 'blowtorch') {
      ctx.fillStyle = '#94a3b8';
      ctx.fillRect(-1, -2, 10, 4); // body
      ctx.fillStyle = '#f59e0b';
      ctx.fillRect(0, 2, 2, 3); // trigger grip
      // Pilot blue flame
      ctx.fillStyle = 'rgba(56, 189, 248, 0.7)';
      ctx.beginPath();
      ctx.moveTo(9, -1);
      ctx.lineTo(13, 0);
      ctx.lineTo(9, 1);
      ctx.closePath();
      ctx.fill();
    }
    
    ctx.restore();
  }

  drawNameLabel(ctx) {
    // Draw Name text
    ctx.font = 'bold 9px Space Grotesk';
    ctx.textAlign = 'center';
    
    // Shadow backing for readability
    ctx.fillStyle = 'rgba(15, 23, 42, 0.55)';
    ctx.fillRect(this.x - 30, this.y - this.halfH - 24, 60, 13);
    
    // Brightened team color for high contrast readability
    ctx.fillStyle = this.teamColor === '#ef4444' ? '#fca5a5' : '#93c5fd';
    ctx.fillText(this.name, this.x, this.y - this.halfH - 14);
    
    // Draw Mini Health Bar
    const hbW = 34;
    const hbH = 3;
    const hbX = this.x - hbW / 2;
    const hbY = this.y - this.halfH - 9;
    
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(hbX, hbY, hbW, hbH);
    
    const pct = this.health / 100;
    // Health bar changes color based on amount
    if (pct > 0.5) ctx.fillStyle = '#10b981'; // Green
    else if (pct > 0.2) ctx.fillStyle = '#fbbf24'; // Yellow
    else ctx.fillStyle = '#ef4444'; // Red
    
    ctx.fillRect(hbX, hbY, hbW * pct, hbH);
    
    // Small border around health bar
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 0.5;
    ctx.strokeRect(hbX, hbY, hbW, hbH);
  }
}
