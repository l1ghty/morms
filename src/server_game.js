export class ServerTerrain {
  constructor(width, height, type = 'island') {
    this.width = width;
    this.height = height;
    this.type = type;
    this.collisionMask = new Uint8Array(this.width * this.height);
    this.generate();
  }

  isSolid(x, y) {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) {
      if (y >= 820) return true; // Water boundary acts as solid boundary check
      return false;
    }
    return this.collisionMask[y * this.width + x] === 1;
  }

  carve(tx, ty, radius) {
    const rSq = radius * radius;
    const startX = Math.max(0, Math.floor(tx - radius));
    const endX = Math.min(this.width - 1, Math.ceil(tx + radius));
    const startY = Math.max(0, Math.floor(ty - radius));
    const endY = Math.min(this.height - 1, Math.ceil(ty + radius));
    
    for (let y = startY; y <= endY; y++) {
      for (let x = startX; x <= endX; x++) {
        const dx = x - tx;
        const dy = y - ty;
        if (dx * dx + dy * dy <= rSq) {
          this.collisionMask[y * this.width + x] = 0;
        }
      }
    }
  }

  generate() {
    const width = this.width;
    const height = this.height;
    
    if (this.type === 'island') {
      const baseline = height * 0.65;
      for (let x = 0; x < width; x++) {
        let falloff = 1;
        if (x < 200) {
          falloff = x / 200;
        } else if (x > width - 200) {
          falloff = (width - x) / 200;
        }
        const wave1 = Math.sin(x * 0.003) * 120;
        const wave2 = Math.sin(x * 0.015) * 40;
        const wave3 = Math.sin(x * 0.04) * 10;
        const wave4 = Math.cos(x * 0.001) * 30;
        
        // Add 4px baseline buffer offset to approximate visual grass stroke bounds
        const y = Math.min(baseline + (wave1 + wave2 + wave3 + wave4) * falloff, height - 100) - 4;
        for (let yFill = Math.max(0, Math.floor(y)); yFill < height; yFill++) {
          this.collisionMask[yFill * width + x] = 1;
        }
      }
    } else if (this.type === 'cave') {
      const baseline = height * 0.7;
      const roofBaseline = 180;
      for (let x = 0; x < width; x++) {
        const waveFloor = Math.sin(x * 0.005) * 80 + Math.sin(x * 0.02) * 20;
        const floorY = baseline + waveFloor - 4;
        
        const waveRoof = Math.sin(x * 0.006) * 60 + Math.sin(x * 0.03) * 15;
        const roofY = roofBaseline + waveRoof + 4;
        
        for (let yFill = 0; yFill < height; yFill++) {
          if (yFill >= floorY || yFill <= roofY) {
            this.collisionMask[yFill * width + x] = 1;
          }
        }
      }
    } else { // canyon
      const baseline = height * 0.55;
      for (let x = 0; x < width; x++) {
        const mid = width / 2;
        const distFromMid = Math.abs(x - mid);
        const canyonShape = 1 + (distFromMid / mid) * 1.5;
        const wave1 = Math.sin(x * 0.004) * 100;
        const wave2 = Math.sin(x * 0.025) * 35;
        const y = Math.max(100, Math.min(baseline + (wave1 + wave2) * canyonShape, height - 80)) - 4;
        
        for (let yFill = Math.max(0, Math.floor(y)); yFill < height; yFill++) {
          this.collisionMask[yFill * width + x] = 1;
        }
      }
    }
  }
}

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

export class ServerProjectile {
  constructor(x, y, vx, vy, type, game) {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.type = type;
    this.game = game;
    this.id = game && typeof game.getNextProjectileId === 'function' ? game.getNextProjectileId() : Math.random();
    
    this.isDead = false;
    this.radius = 4;
    this.elasticity = 0.5;
    this.setupWeaponProperties();
  }

  setupWeaponProperties() {
    switch (this.type) {
      case 'bazooka':
        this.radius = 3;
        this.affectedByWind = true;
        this.contactFuse = true;
        this.blastRadius = 45;
        this.maxDamage = 50;
        this.knockbackForce = 7.5;
        break;
      case 'grenade':
        this.radius = 4;
        this.affectedByWind = false;
        this.contactFuse = false;
        this.fuse = this.game.selectedFuseTime || 3.0;
        this.elasticity = 0.55;
        this.blastRadius = 48;
        this.maxDamage = 55;
        this.knockbackForce = 8.0;
        break;
      case 'cluster':
        this.radius = 4;
        this.affectedByWind = false;
        this.contactFuse = false;
        this.fuse = this.game.selectedFuseTime || 3.0;
        this.elasticity = 0.5;
        this.blastRadius = 40;
        this.maxDamage = 45;
        this.knockbackForce = 6.5;
        break;
      case 'cluster_shrapnel':
        this.radius = 3;
        this.affectedByWind = false;
        this.contactFuse = true;
        this.elasticity = 0.45;
        this.blastRadius = 25;
        this.maxDamage = 25;
        this.knockbackForce = 4.5;
        break;
      case 'holy':
        this.radius = 5;
        this.affectedByWind = false;
        this.contactFuse = false;
        this.fuse = this.game.selectedFuseTime || 3.0;
        this.elasticity = 0.65;
        this.blastRadius = 85;
        this.maxDamage = 95;
        this.knockbackForce = 14.0;
        this.playedHallelujah = false;
        break;
      case 'dynamite':
        this.radius = 5;
        this.affectedByWind = false;
        this.contactFuse = false;
        this.fuse = 5.0;
        this.elasticity = 0.15;
        this.blastRadius = 75;
        this.maxDamage = 85;
        this.knockbackForce = 12.0;
        break;
      case 'airstrike_missile':
        this.radius = 4;
        this.affectedByWind = false;
        this.contactFuse = true;
        this.blastRadius = 42;
        this.maxDamage = 45;
        this.knockbackForce = 7.0;
        break;
    }
  }

  update(dt) {
    if (this.isDead) return;

    if (this.y >= this.game.waterLevel) {
      this.game.broadcastAudio('splash');
      this.isDead = true;
      return;
    }

    this.vy += this.game.gravity * dt;

    if (this.affectedByWind && this.game.wind) {
      this.vx += this.game.wind.x * 0.04 * dt;
    }

    this.x += this.vx * dt;
    this.y += this.vy * dt;

    if (this.fuse !== undefined) {
      this.fuse -= (dt * 16.666) / 1000;
      
      // Holy hand grenade custom chanting
      if (this.type === 'holy' && this.fuse <= 1.1 && !this.playedHallelujah) {
        this.playedHallelujah = true;
        this.game.broadcastAudio('hallelujah');
      }

      if (this.fuse <= 0) {
        this.explode();
        return;
      }
    }

    if (this.game.terrain.isSolid(this.x, this.y)) {
      if (this.contactFuse) {
        this.explode();
      } else {
        this.handleTerrainBounce();
      }
      return;
    }

    if (this.contactFuse) {
      for (const w of this.game.worms) {
        if (w.health > 0) {
          const dx = w.x - this.x;
          const dy = w.y - this.y;
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
    const dot = this.vx * normal.x + this.vy * normal.y;
    
    if (dot < 0) {
      this.vx = (this.vx - 2 * dot * normal.x) * this.elasticity;
      this.vy = (this.vy - 2 * dot * normal.y) * this.elasticity;
      this.game.broadcastAudio('bounce');
      
      let limit = 0;
      while (this.game.terrain.isSolid(this.x, this.y) && limit < 15) {
        this.x += normal.x * 0.8;
        this.y += normal.y * 0.8;
        limit++;
      }
    }
    
    const speed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
    if (speed < 0.25) {
      this.vx = 0;
      this.vy = 0;
    }
  }

  getTerrainNormal(tx, ty) {
    let nx = 0;
    let ny = 0;
    const r = 4;
    const terrain = this.game.terrain;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy <= r * r) {
          if (terrain.isSolid(tx + dx, ty + dy)) {
            nx -= dx;
            ny -= dy;
          }
        }
      }
    }
    const len = Math.sqrt(nx * nx + ny * ny);
    if (len === 0) return { x: 0, y: -1 };
    return { x: nx / len, y: ny / len };
  }

  explode() {
    this.isDead = true;
    this.game.createExplosion(this.x, this.y, this.blastRadius, this.maxDamage, this.knockbackForce);
    
    if (this.type === 'cluster') {
      for (let i = 0; i < 5; i++) {
        const angle = -Math.PI / 2 + (i - 2) * 0.12 + (Math.random() - 0.5) * 0.08;
        const speed = (3.5 + Math.random() * 2.5) * 1.4;
        const shrap = new ServerProjectile(
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
}

export class ServerGame {
  constructor(room) {
    this.room = room;
    this.width = 1600;
    this.height = 900;
    this.waterLevel = 820;
    this.gravity = 0.22;
    
    this.projectileIdCounter = 1;
    this.terrain = new ServerTerrain(this.width, this.height, room.mapType);
    this.worms = [];
    this.projectiles = [];
    
    this.wind = { strength: 0, x: 0 };
    this.activeWorm = null;
    this.activeTeamIndex = 0;
    this.turnsPlayed = 0;
    this.totalDamageDealt = 0;
    this.wormsDrowned = 0;
    
    this.state = 'START_TURN';
    this.turnTimer = 'Ready';
    
    this.teams = [
      { id: 'red', name: room.p1Name, activeWormIndex: 0, selectedWeaponIndex: 0 },
      { id: 'blue', name: room.p2Name, activeWormIndex: 0, selectedWeaponIndex: 0 }
    ];
    
    this.chargePower = 0;
    this.maxCharge = 100;
    this.chargeRate = 1.8;
    this.selectedWeaponIndex = 0;
    this.selectedFuseTime = 3;
    
    this.activePlayerKeys = {
      ArrowLeft: false,
      ArrowRight: false,
      ArrowUp: false,
      ArrowDown: false
    };
    
    this.spawnWorms();
  }

  spawnWorms() {
    const segmentWidth = 1200 / this.room.wormsPerTeam;
    const redNames = ['Boggy', 'Dunky', 'Squeaky', 'Gordo'];
    const blueNames = ['Slippy', 'Slimy', 'Curly', 'Ziggy'];
    
    const getSafeSpawnPoint = (minX, maxX) => {
      let attempts = 0;
      while (attempts < 150) {
        const x = minX + Math.random() * (maxX - minX);
        let y = 350;
        let foundGround = false;
        while (y < this.waterLevel - 30) {
          if (this.terrain.isSolid(x, y)) {
            foundGround = true;
            break;
          }
          y += 2;
        }
        if (foundGround) {
          while (y > 100 && this.terrain.isSolid(x, y)) {
            y--;
          }
          if (this.room.mapType === 'cave' && y < 285) {
            attempts++;
            continue;
          }
          return { x, y: y - 10 };
        }
        attempts++;
      }
      return { x: minX + (maxX - minX) / 2, y: 550 };
    };

    let idCounter = 1;
    for (let i = 0; i < this.room.wormsPerTeam; i++) {
      const minX = 200 + i * segmentWidth;
      const maxX = 200 + (i + 1) * segmentWidth;
      const midX = minX + segmentWidth / 2;
      
      const redPos = getSafeSpawnPoint(minX, midX - 15);
      const bluePos = getSafeSpawnPoint(midX + 15, maxX);
      
      this.worms.push(new ServerWorm(idCounter++, redPos.x, redPos.y, redNames[i % redNames.length], this.teams[0].name, '#ef4444', this));
      this.worms.push(new ServerWorm(idCounter++, bluePos.x, bluePos.y, blueNames[i % blueNames.length], this.teams[1].name, '#3b82f6', this));
    }
  }

  getNextProjectileId() {
    return this.projectileIdCounter++;
  }

  carveTerrain(x, y, radius) {
    this.terrain.carve(x, y, radius);
    this.broadcastMessage({
      type: 'carve',
      x: x,
      y: y,
      radius: radius
    });
  }

  setupNextTurn(isFirstTurn = false) {
    if (!isFirstTurn) {
      this.turnsPlayed++;
      const currentTeam = this.teams[this.activeTeamIndex];
      const liveWormsInTeam = this.worms.filter(w => w.teamName === currentTeam.name && w.health > 0);
      if (liveWormsInTeam.length > 0) {
        currentTeam.activeWormIndex = (currentTeam.activeWormIndex + 1) % this.worms.filter(w => w.teamName === currentTeam.name).length;
      }
      this.activeTeamIndex = (this.activeTeamIndex + 1) % this.teams.length;
    }
    
    const team = this.teams[this.activeTeamIndex];
    const teamWorms = this.worms.filter(w => w.teamName === team.name);
    
    let nextWorm = null;
    let checkedCount = 0;
    let indexToCheck = team.activeWormIndex;
    
    while (checkedCount < teamWorms.length) {
      const candidate = teamWorms[indexToCheck];
      if (candidate.health > 0) {
        nextWorm = candidate;
        team.activeWormIndex = indexToCheck;
        break;
      }
      indexToCheck = (indexToCheck + 1) % teamWorms.length;
      checkedCount++;
    }
    
    if (!nextWorm) {
      const otherTeamIndex = (this.activeTeamIndex + 1) % this.teams.length;
      const otherTeam = this.teams[otherTeamIndex];
      this.gameOver(otherTeam.name);
      return;
    }
    
    this.activeWorm = nextWorm;
    this.selectedWeaponIndex = team.selectedWeaponIndex; // Sync active weapon index for new team
    this.state = 'HANDOVER';
    this.turnTimer = 'Ready';
    this.activePlayerKeys = {
      ArrowLeft: false,
      ArrowRight: false,
      ArrowUp: false,
      ArrowDown: false
    };
  }

  startTurn(windStrength = null) {
    if (this.state !== 'HANDOVER') return;
    this.state = 'PLAYING';
    this.turnTimer = 45;
    
    if (windStrength !== null) {
      this.wind.strength = windStrength;
    } else {
      const windStrengths = [-0.15, -0.1, -0.05, 0, 0.05, 0.1, 0.15];
      this.wind.strength = windStrengths[Math.floor(Math.random() * windStrengths.length)];
    }
    this.wind.x = this.wind.strength;
    
    this.startTimerLoop();
  }

  startTimerLoop() {
    if (this.timerInterval) clearInterval(this.timerInterval);
    this.timerInterval = setInterval(() => {
      if (this.state === 'PLAYING') {
        this.turnTimer--;
        if (this.turnTimer <= 0) {
          this.endActiveTurn();
        }
      }
    }, 1000);
  }

  endActiveTurn() {
    clearInterval(this.timerInterval);
    this.state = 'CLEANUP';
  }

  startRetreat(seconds) {
    this.state = 'RETREAT';
    this.retreatTimer = seconds;
    clearInterval(this.timerInterval);
    this.timerInterval = setInterval(() => {
      if (this.state === 'RETREAT') {
        this.retreatTimer--;
        if (this.retreatTimer <= 0) {
          clearInterval(this.timerInterval);
          this.state = 'CLEANUP';
        }
      }
    }, 1000);
  }

  gameOver(winningTeam) {
    this.state = 'GAME_OVER';
    clearInterval(this.timerInterval);
    this.broadcastMessage({
      type: 'game_over',
      winningTeam: winningTeam,
      turnsPlayed: this.turnsPlayed,
      totalDamageDealt: this.totalDamageDealt,
      wormsDrowned: this.wormsDrowned
    });
  }

  createExplosion(x, y, radius, maxDamage, knockbackForce) {
    this.carveTerrain(x, y, radius);
    
    this.broadcastAudio(radius > 70 ? 'holy_explosion' : 'explosion');
    
    this.worms.forEach(w => {
      if (w.health <= 0) return;
      const dx = w.x - x;
      const dy = (w.y - 2) - y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const effectRadius = radius + 15;
      
      if (dist < effectRadius) {
        const proximity = (effectRadius - dist) / effectRadius;
        const damage = Math.round(maxDamage * proximity);
        if (damage > 0) {
          w.damage(damage);
        }
        
        const angle = dist === 0 ? -Math.PI / 2 : Math.atan2(dy, dx);
        const lift = -1.2 * proximity;
        const horizontalPush = Math.cos(angle) * knockbackForce * proximity;
        const verticalPush = Math.sin(angle) * knockbackForce * proximity + lift;
        
        w.vx += horizontalPush;
        w.vy += verticalPush;
        w.isFalling = true;
      }
    });

    this.projectiles.forEach(p => {
      const dx = p.x - x;
      const dy = p.y - y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const effectRadius = radius + 20;
      if (dist > 0 && dist < effectRadius) {
        const proximity = (effectRadius - dist) / effectRadius;
        const angle = Math.atan2(dy, dx);
        const push = knockbackForce * 0.7 * proximity;
        p.vx += Math.cos(angle) * push;
        p.vy += Math.sin(angle) * push;
      }
    });
  }

  fireActiveWeapon(vx, vy, spawnX, spawnY, clientWeaponId = null) {
    const team = this.teams[this.activeTeamIndex];
    let weaponId;
    
    if (clientWeaponId) {
      weaponId = clientWeaponId;
      const idx = ['bazooka', 'grenade', 'cluster', 'holy', 'dynamite', 'airstrike', 'blowtorch'].indexOf(weaponId);
      if (idx !== -1) {
        team.selectedWeaponIndex = idx;
        this.selectedWeaponIndex = idx;
      }
    } else {
      this.selectedWeaponIndex = team.selectedWeaponIndex;
      weaponId = ['bazooka', 'grenade', 'cluster', 'holy', 'dynamite', 'airstrike', 'blowtorch'][this.selectedWeaponIndex];
    }
    
    if (weaponId === 'blowtorch') {
      this.state = 'ACTION';
      this.broadcastAudio('blowtorch');
      this.blowtorchCarveX = spawnX;
      this.blowtorchCarveY = spawnY;
      this.blowtorchVx = vx;
      this.blowtorchVy = vy;
      this.blowtorchStep = 0;
      this.startRetreat(2);
      return;
    }
    
    if (weaponId === 'airstrike') {
      this.state = 'ACTION';
      this.broadcastAudio('airstrike_siren');
      const targetX = spawnX;
      setTimeout(() => {
        for (let i = 0; i < 5; i++) {
          setTimeout(() => {
            const mX = targetX - 100 + i * 50 + (Math.random() - 0.5) * 20;
            const mY = -50;
            const missile = new ServerProjectile(mX, mY, 0, 8, 'airstrike_missile', this);
            this.projectiles.push(missile);
          }, i * 200);
        }
      }, 1000);
      this.startRetreat(3);
      return;
    }
    
    this.state = 'ACTION';
    this.broadcastAudio(weaponId === 'dynamite' ? 'fuse' : (weaponId === 'bazooka' ? 'shoot_bazooka' : 'shoot_grenade'));
    
    let proj;
    if (weaponId === 'bazooka') {
      proj = new ServerProjectile(spawnX, spawnY, vx, vy, 'bazooka', this);
    } else if (weaponId === 'grenade') {
      proj = new ServerProjectile(spawnX, spawnY, vx, vy, 'grenade', this);
    } else if (weaponId === 'cluster') {
      proj = new ServerProjectile(spawnX, spawnY, vx, vy, 'cluster', this);
    } else if (weaponId === 'holy') {
      proj = new ServerProjectile(spawnX, spawnY, vx, vy, 'holy', this);
    } else if (weaponId === 'dynamite') {
      proj = new ServerProjectile(this.activeWorm.x, this.activeWorm.y - 10, vx, vy, 'dynamite', this);
    }
    
    this.projectiles.push(proj);
    this.startRetreat(5);
  }

  update(dt) {
    let livingWormsCount = {};
    livingWormsCount[this.teams[0].name] = 0;
    livingWormsCount[this.teams[1].name] = 0;
    if (this.activeWorm && this.activeWorm.health > 0) {
      if (this.state === 'PLAYING' || this.state === 'RETREAT') {
        let dir = 0;
        if (this.activePlayerKeys.ArrowLeft) dir = -1;
        else if (this.activePlayerKeys.ArrowRight) dir = 1;
        this.activeWorm.move(dir, dt);
        
        if (this.state === 'PLAYING') {
          let aimDir = 0;
          if (this.activePlayerKeys.ArrowUp) aimDir = -1;
          else if (this.activePlayerKeys.ArrowDown) aimDir = 1;
          this.activeWorm.aim(aimDir, dt);
        }
      }
    }

    this.worms.forEach(w => {
      w.update(dt);
      if (w.health > 0) {
        livingWormsCount[w.teamName]++;
      }
    });
    
    if (this.state !== 'LOBBY' && this.state !== 'GAME_OVER') {
      const team1Name = this.teams[0].name;
      const team2Name = this.teams[1].name;
      if (livingWormsCount[team1Name] === 0 && livingWormsCount[team2Name] === 0) {
        this.gameOver('Draw');
        return;
      } else if (livingWormsCount[team1Name] === 0) {
        this.gameOver(team2Name);
        return;
      } else if (livingWormsCount[team2Name] === 0) {
        this.gameOver(team1Name);
        return;
      }
    }
    
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.update(dt);
      if (p.isDead) {
        this.projectiles.splice(i, 1);
      }
    }
    
    if (this.state === 'ACTION' && this.blowtorchStep !== undefined) {
      if (this.blowtorchStep < 50) {
        this.blowtorchCarveX += this.blowtorchVx * dt;
        this.blowtorchCarveY += this.blowtorchVy * dt;
        
        this.carveTerrain(this.blowtorchCarveX, this.blowtorchCarveY, 14);
        
        this.activeWorm.x = this.blowtorchCarveX - this.blowtorchVx * 4;
        this.activeWorm.y = this.blowtorchCarveY - this.blowtorchVy * 4;
        this.blowtorchStep += dt;
      } else {
        this.blowtorchStep = undefined;
      }
    }
    
    if (this.state === 'CLEANUP') {
      const unsettledProjectiles = this.projectiles.length;
      const unsettledWorms = this.worms.filter(w => !w.isSettled());
      const allSettled = unsettledProjectiles === 0 && unsettledWorms.length === 0;
      
      if (!allSettled) {
        this.cleanupWaitFrames = (this.cleanupWaitFrames || 0) + 1;
        if (this.cleanupWaitFrames % 60 === 0) {
          console.log(`[CLEANUP DELAY] Waiting on ${unsettledProjectiles} projectiles. Unsettled worms: ${unsettledWorms.map(w => w.name + '(vx:' + w.vx.toFixed(3) + ' vy:' + w.vy.toFixed(3) + ' fall:' + w.isFalling + ')').join(', ')}`);
        }
        
        // Force cleanup if it takes more than 2.5 seconds (150 frames) and NO projectiles remain
        if (this.cleanupWaitFrames > 150 && unsettledProjectiles === 0) {
          console.log('[CLEANUP DELAY] Forcing turn end due to timeout!');
          this.cleanupWaitFrames = 0;
          this.setupNextTurn();
          return;
        }
      }
      
      if (allSettled) {
        this.cleanupWaitFrames = 0;
        this.setupNextTurn();
      }
    }
  }

  broadcastMessage(msg) {
    const payload = JSON.stringify(msg);
    if (this.room.p1 && this.room.p1.readyState === 1) this.room.p1.send(payload);
    if (this.room.p2 && this.room.p2.readyState === 1) this.room.p2.send(payload);
  }

  broadcastAudio(name) {
    this.broadcastMessage({ type: 'play_audio', name });
  }

  handlePlayerInput(playerNumber, data) {
    const isOurTurn = (this.activeTeamIndex === 0 && playerNumber === 1) ||
                      (this.activeTeamIndex === 1 && playerNumber === 2);
                      
    if (!isOurTurn) return;

    const worm = this.activeWorm;
    const team = this.teams[this.activeTeamIndex];

    if (data.type === 'select_weapon' && data.index !== undefined) {
      team.selectedWeaponIndex = data.index;
      this.selectedWeaponIndex = data.index;
    }
    if (data.type === 'set_fuse' && data.fuse !== undefined) {
      this.selectedFuseTime = data.fuse;
    }

    if (data.type === 'input' && data.keys) {
      this.activePlayerKeys.ArrowLeft = !!(data.keys['ArrowLeft'] || data.keys['KeyA'] || data.keys['a']);
      this.activePlayerKeys.ArrowRight = !!(data.keys['ArrowRight'] || data.keys['KeyD'] || data.keys['d']);
      this.activePlayerKeys.ArrowUp = !!(data.keys['ArrowUp'] || data.keys['KeyW'] || data.keys['w']);
      this.activePlayerKeys.ArrowDown = !!(data.keys['ArrowDown'] || data.keys['KeyS'] || data.keys['s']);
    }

    if (this.state === 'PLAYING') {
      if (worm && worm.health > 0) {
        if (data.type === 'jump') {
          worm.jump(data.isBackflip);
        }
        
        if (data.type === 'start_charge') {
          this.state = 'FIRING';
          this.chargePower = 0;
        }

        if (data.type === 'fire' && data.weaponId === 'airstrike') {
          this.fireActiveWeapon(data.vx, data.vy, data.spawnX, data.spawnY, data.weaponId);
        }
      }
    }
    
    if (this.state === 'FIRING') {
      if (data.type === 'update_charge') {
        this.chargePower = data.chargePower;
      }
      if (data.type === 'fire') {
        this.fireActiveWeapon(data.vx, data.vy, data.spawnX, data.spawnY, data.weaponId);
      }
    }
    
    if (this.state === 'HANDOVER') {
      if (data.type === 'confirm_start') {
        this.startTurn();
      }
    }
  }

  destroy() {
    if (this.timerInterval) clearInterval(this.timerInterval);
  }
}
