import { ServerTerrain } from './server_terrain.js';
import { ServerWorm } from './server_worm.js';
import { ServerProjectile } from './server_projectile.js';
import { calculateExplosionImpact, getSafeSpawnPoint, getActiveTeamWorm, rotateActiveWorm, getRandomWindStrength } from '../common/physics.js';
import { MAP_WIDTH, MAP_HEIGHT, WATER_LEVEL, GRAVITY, TURN_DURATION, RETREAT_DURATION_SHORT, RETREAT_DURATION_LONG, MAX_CHARGE, CHARGE_RATE_SERVER, DEFAULT_FUSE_TIME, TEAM_RED, TEAM_BLUE, WORM_NAMES_RED, WORM_NAMES_BLUE } from '../common/constants.js';

export class ServerGame {
  constructor(room) {
    this.room = room;
    this.width = MAP_WIDTH;
    this.height = MAP_HEIGHT;
    this.waterLevel = WATER_LEVEL;
    this.gravity = GRAVITY;
    
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
    this.maxCharge = MAX_CHARGE;
    this.chargeRate = CHARGE_RATE_SERVER;
    this.selectedWeaponIndex = 0;
    this.selectedFuseTime = DEFAULT_FUSE_TIME;
    
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
    let idCounter = 1;
    for (let i = 0; i < this.room.wormsPerTeam; i++) {
      const minX = 200 + i * segmentWidth;
      const maxX = 200 + (i + 1) * segmentWidth;
      const midX = minX + segmentWidth / 2;
      
      const redPos = getSafeSpawnPoint(minX, midX - 15, this.terrain, this.waterLevel, this.room.mapType);
      const bluePos = getSafeSpawnPoint(midX + 15, maxX, this.terrain, this.waterLevel, this.room.mapType);
      
      this.worms.push(new ServerWorm(idCounter++, redPos.x, redPos.y, WORM_NAMES_RED[i % WORM_NAMES_RED.length], this.teams[0].name, TEAM_RED.color, this));
      this.worms.push(new ServerWorm(idCounter++, bluePos.x, bluePos.y, WORM_NAMES_BLUE[i % WORM_NAMES_BLUE.length], this.teams[1].name, TEAM_BLUE.color, this));
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
      const rotation = rotateActiveWorm(this.teams, this.activeTeamIndex, this.worms, (name) => this.gameOver(name));
      if (!rotation) return;
      this.turnsPlayed++;
      this.activeWorm = rotation.nextWorm;
      this.activeTeamIndex = rotation.nextTeamIndex;
    } else {
      const team = this.teams[this.activeTeamIndex];
      const nextWorm = getActiveTeamWorm(team, this.worms);
      if (!nextWorm) {
        const otherTeamIndex = (this.activeTeamIndex + 1) % this.teams.length;
        const otherTeam = this.teams[otherTeamIndex];
        this.gameOver(otherTeam.name);
        return;
      }
      this.activeWorm = nextWorm;
    }
    
    const team = this.teams[this.activeTeamIndex];
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
    this.turnTimer = TURN_DURATION;
    
    if (windStrength !== null) {
      this.wind.strength = windStrength;
    } else {
      this.wind.strength = getRandomWindStrength();
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
    
    calculateExplosionImpact(
      x, y, radius, maxDamage, knockbackForce,
      this.worms, this.projectiles,
      (w, damage) => {
        w.damage(damage);
      },
      (w, vx, vy) => {
        w.vx += vx;
        w.vy += vy;
        w.isFalling = true;
      },
      (p, vx, vy) => {
        p.vx += vx;
        p.vy += vy;
      }
    );
  }

  fireActiveWeapon(vx, vy, spawnX, spawnY, clientWeaponId = null) {
    const team = this.teams[this.activeTeamIndex];
    let weaponId;
    
    if (clientWeaponId) {
      weaponId = clientWeaponId;
      const idx = ['bazooka', 'grenade', 'cluster', 'holy', 'dynamite', 'airstrike', 'blowtorch', 'banana', 'baseball_bat', 'super_sheep'].indexOf(weaponId);
      if (idx !== -1) {
        team.selectedWeaponIndex = idx;
        this.selectedWeaponIndex = idx;
      }
    } else {
      this.selectedWeaponIndex = team.selectedWeaponIndex;
      weaponId = ['bazooka', 'grenade', 'cluster', 'holy', 'dynamite', 'airstrike', 'blowtorch', 'banana', 'baseball_bat', 'super_sheep'][this.selectedWeaponIndex];
    }
    
    if (weaponId === 'blowtorch') {
      this.state = 'ACTION';
      this.broadcastAudio('blowtorch');
      this.blowtorchCarveX = spawnX;
      this.blowtorchCarveY = spawnY;
      this.blowtorchVx = vx;
      this.blowtorchVy = vy;
      this.blowtorchStep = 0;
      this.startRetreat(RETREAT_DURATION_SHORT);
      return;
    }
    
    if (weaponId === 'baseball_bat') {
      this.state = 'ACTION';
      this.broadcastAudio('shoot_bazooka'); // swing sound
      
      let targetWorm = null;
      let minDist = 45;
      for (const w of this.worms) {
        if (w !== this.activeWorm && w.health > 0) {
          const dx = w.x - this.activeWorm.x;
          const dy = w.y - this.activeWorm.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < minDist) {
            minDist = dist;
            targetWorm = w;
          }
        }
      }
      
      if (targetWorm) {
        this.broadcastAudio('bounce'); // hit sound
        targetWorm.damage(30);
        targetWorm.vx = this.activeWorm.facingDir * 14;
        targetWorm.vy = -10;
        targetWorm.isFalling = true;
      }
      
      this.startRetreat(RETREAT_DURATION_SHORT);
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
      this.startRetreat(RETREAT_DURATION_SHORT);
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
    } else if (weaponId === 'banana') {
      proj = new ServerProjectile(spawnX, spawnY, vx, vy, 'banana', this);
    } else if (weaponId === 'super_sheep') {
      proj = new ServerProjectile(spawnX, spawnY, vx, vy, 'super_sheep', this);
    } else if (weaponId === 'dynamite') {
      proj = new ServerProjectile(this.activeWorm.x, this.activeWorm.y - 10, vx, vy, 'dynamite', this);
    }
    
    this.projectiles.push(proj);
    if (weaponId === 'super_sheep') {
      this.state = 'ACTION';
    } else {
      this.startRetreat(RETREAT_DURATION_LONG);
    }
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

    if (this.state === 'ACTION') {
      const team = this.teams[this.activeTeamIndex];
      const weaponId = ['bazooka', 'grenade', 'cluster', 'holy', 'dynamite', 'airstrike', 'blowtorch', 'banana', 'baseball_bat', 'super_sheep'][this.selectedWeaponIndex];
      if (weaponId === 'super_sheep') {
        const hasSuperSheep = this.projectiles.some(p => p.type === 'super_sheep');
        if (!hasSuperSheep) {
          this.startRetreat(RETREAT_DURATION_SHORT);
        }
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

    if (data.type === 'detonate_sheep') {
      for (const proj of this.projectiles) {
        if (proj.type === 'super_sheep' && !proj.isDead) {
          proj.explode();
        }
      }
    }
  }

  destroy() {
    if (this.timerInterval) clearInterval(this.timerInterval);
  }
}
