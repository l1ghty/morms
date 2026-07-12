import { ServerTerrain } from './server_terrain.js';
import { ServerWorm } from './server_worm.js';
import { ServerProjectile } from './server_projectile.js';

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
