import { Terrain } from './terrain.js';
import { Worm } from './worm.js';
import { Projectile } from './projectile.js';
import { ParticleSystem } from './particles.js';
import { AudioSynth } from './audio.js';
import { MultiplayerManager } from './multiplayer.js';
import { GameState, WEAPONS } from './constants.js';
import { UIManager } from './ui_manager.js';
import { InputManager } from './input_manager.js';

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    
    this.width = 1600; // Virtual width of the map
    this.height = 900; // Virtual height of the map
    this.waterLevel = 820; // Water level line
    this.gravity = 0.22;
    
    // Core game components
    this.terrain = null;
    this.worms = [];
    this.projectiles = [];
    
    // Systems
    this.particles = new ParticleSystem();
    this.audio = new AudioSynth();
    
    // Camera
    this.camera = { x: 0, y: 0, targetX: 0, targetY: 0, lerpSpeed: 0.05, target: null };
    
    // Input state
    this.keys = {};
    this.mouse = { x: 0, y: 0, canvasX: 0, canvasY: 0, clicked: false };
    
    // Game loop & Turn state
    this.state = GameState.LOBBY;
    this.settings = { wormsPerTeam: 3, mapType: 'island' };
    
    this.teams = [
      { id: 'red', name: 'Red Team', color: '#ef4444', activeWormIndex: 0, selectedWeaponIndex: 0 },
      { id: 'blue', name: 'Blue Team', color: '#3b82f6', activeWormIndex: 0, selectedWeaponIndex: 0 }
    ];
    this.activeTeamIndex = 0;
    
    // Clone weapons array for each team
    this.teams.forEach(team => {
      team.weapons = WEAPONS.map(w => ({ ...w }));
    });
    
    this.activeWorm = null;
    
    this.turnTimer = 45;
    this.timerInterval = null;
    this.retreatTimer = 0;
    this.wind = { x: 0, strength: 0 }; // Wind speed from -0.15 to +0.15
    
    // Shooting mechanics
    this.chargePower = 0;
    this.isCharging = false;
    this.maxCharge = 100;
    this.chargeRate = 2.5;
    
    this.selectedWeaponIndex = 0;
    this.totalDamageDealt = 0;
    this.wormsDrowned = 0;
    this.turnsPlayed = 0;
    this.cameraLocked = false;
    this.selectedFuseTime = 3;
    
    // Online Multiplayer properties
    this.mp = new MultiplayerManager(this);
    this.isOnline = false;
    this.onlinePlayerNumber = null;
    
    // UI and Input managers
    this.ui = new UIManager(this);
    this.input = new InputManager(this);
  }

  getCurrentTeamWeapons() {
    return this.teams[this.activeTeamIndex].weapons;
  }

  get WEAPONS() {
    return this.getCurrentTeamWeapons();
  }

  get selectedWeaponIndex() {
    return this.teams[this.activeTeamIndex].selectedWeaponIndex;
  }

  set selectedWeaponIndex(index) {
    this.teams[this.activeTeamIndex].selectedWeaponIndex = index;
  }

  get isLocalPlayerTurn() {
    if (!this.isOnline) return true;
    const localTeamName = this.onlinePlayerNumber === 1 ? (this.onlineP1Name || 'Red Team') : (this.onlineP2Name || 'Blue Team');
    return this.activeWorm && this.activeWorm.teamName === localTeamName;
  }

  populateWeaponMenu() {
    this.ui.populateWeaponMenu();
  }

  selectWeapon(index, fromSync = false) {
    this.ui.selectWeapon(index, fromSync);
  }

  deductAmmo(weapon) {
    this.ui.deductAmmo(weapon);
  }

  toggleWeaponMenu(forceState) {
    this.ui.toggleWeaponMenu(forceState);
  }

  resetLobbyUI() {
    this.ui.resetLobbyUI();
  }

  updateHUD() {
    this.ui.updateHUD();
  }

  start(settings, syncWorms = null, skipSetupTurn = false) {
    this.settings = settings;
    this.state = GameState.START_TURN;
    
    this.totalDamageDealt = 0;
    this.wormsDrowned = 0;
    this.turnsPlayed = 0;
    this.projectiles = [];
    this.particles.clear();
    
    // Setup team names based on online custom values
    if (this.isOnline) {
      this.teams[0].name = this.onlineP1Name || 'Red Team';
      this.teams[1].name = this.onlineP2Name || 'Blue Team';
    } else {
      this.teams[0].name = 'Red Team';
      this.teams[1].name = 'Blue Team';
    }

    // Reset Team indices
    this.teams[0].activeWormIndex = 0;
    this.teams[0].selectedWeaponIndex = 0;
    this.teams[1].activeWormIndex = 0;
    this.teams[1].selectedWeaponIndex = 0;
    this.activeTeamIndex = 0;
    
    // Generate terrain
    this.terrain = new Terrain(this.width, this.height, settings.mapType);
    
    // Generate Worms
    this.worms = [];
    
    if (syncWorms) {
      syncWorms.forEach(w => {
        const worm = new Worm(w.x, w.y, w.name, w.teamName, w.color, this);
        worm.id = w.id;
        this.worms.push(worm);
      });
    } else {
      const redNames = ['Boggy', 'Dunky', 'Squeaky', 'Gordo'];
      const blueNames = ['Slippy', 'Slimy', 'Curly', 'Ziggy'];
      
      // Find safe spawn points on solid ground
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
            if (settings.mapType === 'cave' && y < 285) {
              attempts++;
              continue;
            }
            return { x, y: y - 10 };
          }
          attempts++;
        }
        return { x: minX + (maxX - minX) / 2, y: 550 };
      };
  
      const segmentWidth = 1200 / settings.wormsPerTeam;
      
      for (let i = 0; i < settings.wormsPerTeam; i++) {
        const minX = 200 + i * segmentWidth;
        const maxX = 200 + (i + 1) * segmentWidth;
        const midX = minX + segmentWidth / 2;
        
        const redPos = getSafeSpawnPoint(minX, midX - 15);
        const bluePos = getSafeSpawnPoint(midX + 15, maxX);
        
        const team1Name = this.isOnline ? (this.onlineP1Name || 'Red Team') : 'Red Team';
        const team2Name = this.isOnline ? (this.onlineP2Name || 'Blue Team') : 'Blue Team';
        
        this.worms.push(new Worm(redPos.x, redPos.y, redNames[i % redNames.length], team1Name, '#ef4444', this));
        this.worms.push(new Worm(bluePos.x, bluePos.y, blueNames[i % blueNames.length], team2Name, '#3b82f6', this));
      }
    }
    
    // Reset weapons for team reset ammo
    this.teams.forEach(team => {
      team.weapons = WEAPONS.map(w => ({ ...w }));
    });
    
    this.selectWeapon(0);
    this.populateWeaponMenu();
    
    if (!skipSetupTurn) {
      this.setupNextTurn(true);
    }
    
    if (!this.loopStarted) {
      this.lastTime = performance.now();
      requestAnimationFrame(this.gameLoop.bind(this));
      this.loopStarted = true;
    }
  }

  startOnline(settings) {
    this.settings = settings;
    this.isOnline = true;
    this.mp.registerHandler('rooms_list', (data) => this.handleIncomingRoomsList(data));
    this.mp.connect();
  }

  createOnlineRoom() {
    const roomNameInput = document.getElementById('room-name-input');
    const roomName = roomNameInput ? roomNameInput.value.trim() : "Boggy's Fort";
    
    const playerNameInput = document.getElementById('player-name-input');
    const playerName = playerNameInput ? playerNameInput.value.trim() : 'Red Team';
    
    const mapTypeSelect = document.getElementById('map-type-select');
    const wormCountSelect = document.getElementById('worm-count-select');
    
    const mapType = mapTypeSelect ? mapTypeSelect.value : 'island';
    const wormsPerTeam = wormCountSelect ? parseInt(wormCountSelect.value, 10) : 3;
    
    this.settings = { mapType, wormsPerTeam, mode: 'online' };
    
    const lobbyWorms = document.getElementById('lobby-worm-count-select');
    const lobbyMap = document.getElementById('lobby-map-type-select');
    if (lobbyWorms) lobbyWorms.value = wormsPerTeam.toString();
    if (lobbyMap) lobbyMap.value = mapType;
    
    this.mp.createRoom(roomName, playerName, mapType, wormsPerTeam);
  }

  hostStartOnlineMatch() {
    this.mp.send({ type: 'host_start' });
  }

  handleIncomingRoomsList(data) {
    this.ui.updateRoomsList(data);
  }

  cancelOnline() {
    this.isOnline = false;
    this.mp.disconnect();
    this.resetLobbyUI();
  }

  disconnectOnline() {
    this.isOnline = false;
    this.mp.disconnect();
    this.resetLobbyUI();
  }

  initOnlineMatch(data) {
    this.isOnline = true;
    this.onlinePlayerNumber = this.mp.playerNumber;

    const settings = {
      wormsPerTeam: data.wormsPerTeam,
      mapType: data.mapType
    };
    this.start(settings, data.worms, true);

    this.mp.registerHandler('carve', (data) => this.handleIncomingCarve(data));
    this.mp.registerHandler('game_over', (data) => this.handleIncomingGameOver(data));
    this.mp.registerHandler('game_tick', (data) => this.handleIncomingGameTick(data));
    this.mp.registerHandler('play_audio', (data) => this.audio.play(data.name));
  }

  handleIncomingCarve(data) {
    if (this.terrain) {
      this.terrain.carve(data.x, data.y, data.radius);
      if (data.radius <= 18) {
        this.particles.spawnBurst(data.x, data.y, 'fire', 3);
      } else {
        this.particles.spawnBurst(data.x, data.y, 'fire', Math.round(data.radius * 0.4));
        this.particles.spawnBurst(data.x, data.y, 'smoke', Math.round(data.radius * 0.5));
      }
    }
  }

  handleIncomingGameOver(data) {
    this.turnsPlayed = data.turnsPlayed;
    this.totalDamageDealt = data.totalDamageDealt;
    this.wormsDrowned = data.wormsDrowned;
    
    this.fromGameOverSync = true;
    this.gameOver(data.winningTeam);
    this.fromGameOverSync = false;
  }

  handleIncomingGameTick(data) {
    if (!this.isOnline) return;

    this.state = data.state;
    this.activeTeamIndex = data.activeTeamIndex;
    this.turnTimer = data.turnTimer;
    this.wind.strength = data.windStrength;
    this.wind.x = data.windStrength;
    this.chargePower = data.chargePower;
    this.selectedFuseTime = data.selectedFuseTime;

    if (data.activeWormId === null) {
      this.activeWorm = null;
    }

    const team = this.teams[this.activeTeamIndex];
    if (team) {
      team.selectedWeaponIndex = data.selectedWeaponIndex;
      const activeW = team.weapons[data.selectedWeaponIndex];
      if (activeW) {
        const weaponNameDisplay = document.getElementById('active-weapon-name-display');
        const weaponAmmoDisplay = document.getElementById('weapon-ammo-display');
        if (weaponNameDisplay) weaponNameDisplay.textContent = activeW.name;
        if (weaponAmmoDisplay) weaponAmmoDisplay.textContent = activeW.ammo === -1 ? '∞' : `Ammo: ${activeW.ammo}`;
        
        document.querySelectorAll('.weapon-item').forEach((el, idx) => {
          el.classList.toggle('active', idx === data.selectedWeaponIndex);
        });

        const timerDisplay = document.getElementById('weapon-timer-display');
        if (timerDisplay) {
          if (['grenade', 'cluster', 'holy'].includes(activeW.id)) {
            timerDisplay.classList.remove('hidden');
            timerDisplay.textContent = `${this.selectedFuseTime}s Fuse`;
          } else {
            timerDisplay.classList.add('hidden');
          }
        }
      }
    }

    data.worms.forEach(syncW => {
      const worm = this.worms.find(w => w.id === syncW.id);
      if (worm) {
        const prevHealth = worm.health;
        worm.targetX = syncW.x;
        worm.targetY = syncW.y;
        
        if (worm.x === undefined || worm.y === undefined || isNaN(worm.x) || isNaN(worm.y)) {
          worm.x = syncW.x;
          worm.y = syncW.y;
        }
        const dx = syncW.x - worm.x;
        const dy = syncW.y - worm.y;
        if (dx * dx + dy * dy > 80 * 80) {
          worm.x = syncW.x;
          worm.y = syncW.y;
        }

        worm.vx = syncW.vx;
        worm.vy = syncW.vy;
        worm.facingDir = syncW.facingDir;
        worm.aimAngle = syncW.aimAngle;
        worm.isFalling = syncW.isFalling;
        worm.health = syncW.health;

        if (prevHealth > worm.health) {
          const dmg = prevHealth - worm.health;
          this.particles.spawnText(worm.x, worm.y - 18, `-${dmg}`, '#f87171');
        }

        if (prevHealth > 0 && worm.health <= 0) {
          const isDrowned = worm.y >= this.waterLevel;
          if (isDrowned) {
            this.particles.spawnBurst(worm.x, this.waterLevel, 'water', 15);
          } else {
            this.particles.spawnBurst(worm.x, worm.y, 'smoke', 8);
            this.particles.spawnText(worm.x, worm.y - 10, 'RIP', '#94a3b8');
          }
        }

        if (syncW.id === data.activeWormId) {
          this.activeWorm = worm;
        }
      }
    });

    const activeProjIds = new Set();
    data.projectiles.forEach(syncP => {
      const pId = syncP.id || `${syncP.type}_${Math.round(syncP.x)}_${Math.round(syncP.y)}`;
      activeProjIds.add(pId);
      
      let proj = this.projectiles.find(p => p.id === pId);
      if (!proj) {
        proj = new Projectile(syncP.x, syncP.y, syncP.vx, syncP.vy, syncP.type, this);
        proj.id = pId;
        proj.targetX = syncP.x;
        proj.targetY = syncP.y;
        this.projectiles.push(proj);
      } else {
        proj.targetX = syncP.x;
        proj.targetY = syncP.y;
        proj.vx = syncP.vx;
        proj.vy = syncP.vy;
      }
    });

    this.projectiles = this.projectiles.filter(p => activeProjIds.has(p.id));

    if (this.projectiles.length > 0) {
      this.camera.target = this.projectiles[0];
    } else if (this.activeWorm) {
      this.camera.target = this.activeWorm;
    }

    if (this.state !== GameState.HANDOVER) {
      this.ui.hideHandover();
    } else if (this.activeWorm && team) {
      this.ui.showHandover(team);
      this.populateWeaponMenu();
    }
  }

  handlePlayerLeft() {
    this.isOnline = false;
    this.mp.disconnect();
    this.resetLobbyUI();
    this.ui.showDisconnect();
    this.state = GameState.LOBBY;
  }

  sendWormSync() {
    if (!this.activeWorm) return;
    this.mp.send({
      type: 'sync_worm',
      x: this.activeWorm.x,
      y: this.activeWorm.y,
      vx: this.activeWorm.vx,
      vy: this.activeWorm.vy,
      facingDir: this.activeWorm.facingDir,
      aimAngle: this.activeWorm.aimAngle
    });
  }

  carveTerrain(x, y, radius) {
    if (this.terrain) {
      this.terrain.carve(x, y, radius);
      if (this.isOnline && this.isLocalPlayerTurn) {
        this.mp.send({ type: 'carve', x, y, radius });
      }
    }
  }

  setupNextTurn(isFirstTurn = false, fromSync = false) {
    if (this.isOnline && !fromSync) {
      const isOurTurn = isFirstTurn ? (this.onlinePlayerNumber === 1) : this.isLocalPlayerTurn;
      if (!isOurTurn) return;
    }
    
    if (this.isOnline && !fromSync) {
      this.mp.send({
        type: 'next_turn',
        isFirstTurn: isFirstTurn,
        worms: this.worms.map(w => ({
          name: w.name,
          x: w.x,
          y: w.y,
          vx: w.vx,
          vy: w.vy,
          health: w.health
        }))
      });
    }
    
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
    this.camera.target = this.activeWorm;
    
    const currentWeapon = this.WEAPONS[this.selectedWeaponIndex];
    if (currentWeapon.ammo === 0) {
      this.selectWeapon(0);
    } else {
      this.selectWeapon(this.selectedWeaponIndex);
    }
    
    this.populateWeaponMenu();
    
    this.state = GameState.HANDOVER;
    clearInterval(this.timerInterval);
    const turnTimerEl = document.getElementById('turn-timer');
    if (turnTimerEl) turnTimerEl.textContent = 'Ready';
    
    this.ui.showHandover(team);
  }

  startTurn(windStrength = null, fromSync = false) {
    if (this.state !== GameState.HANDOVER) return;
    
    if (this.isOnline && !this.isLocalPlayerTurn && !fromSync) return;
    
    if (this.isOnline && this.isLocalPlayerTurn && !fromSync && !this.handoverConfirm) {
      this.handoverConfirm = true;
      const startBtn = document.getElementById('handover-start-btn');
      if (startBtn) {
        startBtn.textContent = 'Confirm Start';
        startBtn.classList.add('confirming');
      }
      this.audio.play('weapon_select');
      return;
    }
    
    if (this.isOnline && this.isLocalPlayerTurn && !fromSync) {
      this.handoverConfirm = false;
      this.mp.send({ type: 'confirm_start' });
      const startBtn = document.getElementById('handover-start-btn');
      if (startBtn) {
        startBtn.classList.add('hidden');
      }
      return;
    }
    
    if (!this.isOnline && !this.handoverConfirm) {
      this.handoverConfirm = true;
      const startBtn = document.getElementById('handover-start-btn');
      if (startBtn) {
        startBtn.textContent = 'Confirm Start';
        startBtn.classList.add('confirming');
      }
      this.audio.play('weapon_select');
      return;
    }
    
    this.handoverConfirm = false;
    this.ui.hideHandover();
    
    if (windStrength !== null) {
      this.wind.strength = windStrength;
    } else {
      const windStrengths = [-0.15, -0.1, -0.05, 0, 0.05, 0.1, 0.15];
      this.wind.strength = windStrengths[Math.floor(Math.random() * windStrengths.length)];
    }
    this.wind.x = this.wind.strength;
    
    if (this.isOnline && !fromSync) {
      this.mp.send({ type: 'start_turn', windStrength: this.wind.strength });
    }
    
    // Reset inputs / charging
    this.keys = {};
    this.isCharging = false;
    this.chargePower = 0;
    const chargeBar = document.getElementById('charge-bar');
    if (chargeBar) chargeBar.style.width = '0%';
    
    this.state = GameState.PLAYING;
    this.turnTimer = 45;
    const turnTimerEl = document.getElementById('turn-timer');
    if (turnTimerEl) turnTimerEl.textContent = this.turnTimer;
    
    clearInterval(this.timerInterval);
    this.timerInterval = setInterval(() => {
      if (this.state === GameState.PLAYING) {
        this.turnTimer--;
        const timerEl = document.getElementById('turn-timer');
        if (timerEl) timerEl.textContent = this.turnTimer;
        
        if (this.turnTimer <= 5) {
          this.audio.play('beep_tick');
        }
        
        if (this.turnTimer <= 0) {
          clearInterval(this.timerInterval);
          this.state = GameState.CLEANUP;
          if (this.isOnline && this.isLocalPlayerTurn) {
            this.mp.send({ type: 'sync_state', state: GameState.CLEANUP });
          }
        }
      }
    }, 1000);
  }

  handleMouseClick() {
    if (this.state !== GameState.PLAYING) return;
    if (this.isOnline && !this.isLocalPlayerTurn) return;
    
    const weapon = this.WEAPONS[this.selectedWeaponIndex];
    if (weapon.id === 'airstrike') {
      this.state = GameState.ACTION;
      const targetX = this.mouse.canvasX;
      
      if (this.isOnline && this.isLocalPlayerTurn) {
        this.mp.send({
          type: 'fire',
          weaponId: 'airstrike',
          spawnX: targetX,
          spawnY: 0,
          vx: 0,
          vy: 0,
          chargePower: 0,
          selectedFuseTime: 3
        });
      }
      
      this.audio.play('airstrike_siren');
      
      if (this.isOnline) {
        this.deductAmmo(weapon);
        return;
      }
      
      setTimeout(() => {
        for (let i = 0; i < 5; i++) {
          setTimeout(() => {
            const spawnX = targetX - 100 + i * 50 + (Math.random() - 0.5) * 20;
            const spawnY = -50;
            const proj = new Projectile(spawnX, spawnY, 0, 8, 'airstrike_missile', this);
            this.projectiles.push(proj);
            this.camera.target = proj;
          }, i * 200);
        }
      }, 1000);
      
      this.deductAmmo(weapon);
      this.startRetreat(3);
    }
  }

  fireActiveWeapon() {
    this.isCharging = false;
    this.state = GameState.ACTION;
    
    const weapon = this.WEAPONS[this.selectedWeaponIndex];
    const worm = this.activeWorm;
    
    const aimX = Math.cos(worm.aimAngle) * worm.facingDir;
    const aimY = Math.sin(worm.aimAngle);
    
    const spawnX = worm.x + aimX * 18;
    const spawnY = worm.y + aimY * 18;
    
    const velocityScale = ((this.chargePower / this.maxCharge) * 12 + 2) * 1.5;
    const vx = aimX * velocityScale;
    const vy = aimY * velocityScale;
    
    if (this.isOnline && this.isLocalPlayerTurn) {
      this.mp.send({
        type: 'fire',
        weaponId: weapon.id,
        spawnX,
        spawnY,
        vx,
        vy,
        chargePower: this.chargePower,
        selectedFuseTime: this.selectedFuseTime
      });
    }
    
    if (this.isOnline) {
      if (weapon.id === 'bazooka') {
        this.audio.play('shoot_bazooka');
      } else if (['grenade', 'cluster', 'holy'].includes(weapon.id)) {
        this.audio.play('shoot_grenade');
      } else if (weapon.id === 'dynamite') {
        this.audio.play('fuse');
      } else if (weapon.id === 'blowtorch') {
        this.audio.play('blowtorch');
      }
      this.deductAmmo(weapon);
      this.chargePower = 0;
      const chargeBar = document.getElementById('charge-bar');
      if (chargeBar) chargeBar.style.width = '0%';
      return;
    }
    
    if (weapon.id === 'bazooka') {
      this.audio.play('shoot_bazooka');
      const proj = new Projectile(spawnX, spawnY, vx, vy, 'bazooka', this);
      this.projectiles.push(proj);
      this.camera.target = proj;
      this.startRetreat(5);
    } 
    else if (weapon.id === 'grenade') {
      this.audio.play('shoot_grenade');
      const proj = new Projectile(spawnX, spawnY, vx, vy, 'grenade', this);
      this.projectiles.push(proj);
      this.camera.target = proj;
      this.startRetreat(5);
    } 
    else if (weapon.id === 'cluster') {
      this.audio.play('shoot_grenade');
      const proj = new Projectile(spawnX, spawnY, vx, vy, 'cluster', this);
      this.projectiles.push(proj);
      this.camera.target = proj;
      this.deductAmmo(weapon);
      this.startRetreat(5);
    } 
    else if (weapon.id === 'holy') {
      this.audio.play('shoot_grenade');
      const proj = new Projectile(spawnX, spawnY, vx, vy, 'holy', this);
      this.projectiles.push(proj);
      this.camera.target = proj;
      this.deductAmmo(weapon);
      this.startRetreat(5);
    } 
    else if (weapon.id === 'dynamite') {
      this.audio.play('fuse');
      const proj = new Projectile(worm.x, worm.y - 10, worm.facingDir * 2.25, -2, 'dynamite', this);
      this.projectiles.push(proj);
      this.camera.target = proj;
      this.deductAmmo(weapon);
      this.startRetreat(5);
    }
    else if (weapon.id === 'blowtorch') {
      this.audio.play('blowtorch');
      
      let step = 0;
      const torchInterval = setInterval(() => {
        if (step >= 38 || worm.health <= 0) {
          clearInterval(torchInterval);
          this.state = GameState.CLEANUP;
          if (this.isOnline && this.isLocalPlayerTurn) {
            this.mp.send({ type: 'sync_state', state: GameState.CLEANUP });
          }
          return;
        }
        
        const cutX = worm.x + (Math.cos(worm.aimAngle) * worm.facingDir) * 15;
        const cutY = worm.y + (Math.sin(worm.aimAngle) * 15);
        
        this.terrain.carve(cutX, cutY, 18);
        this.particles.spawnBurst(cutX, cutY, 'fire', 3);
        
        worm.x += (Math.cos(worm.aimAngle) * worm.facingDir) * 1.2;
        worm.y += (Math.sin(worm.aimAngle)) * 1.2;
        worm.vy = 0;
        
        if (this.isOnline && this.isLocalPlayerTurn) {
          this.sendWormSync();
        }
        
        step++;
      }, 80);
      
      this.deductAmmo(weapon);
    }
    
    this.chargePower = 0;
    const chargeBar = document.getElementById('charge-bar');
    if (chargeBar) chargeBar.style.width = '0%';
  }

  endActiveTurn() {
    clearInterval(this.timerInterval);
    this.state = GameState.CLEANUP;
    const timerEl = document.getElementById('turn-timer');
    if (timerEl) timerEl.textContent = 'Turn End';
  }

  startRetreat(seconds) {
    this.state = GameState.RETREAT;
    this.retreatTimer = seconds;
    
    clearInterval(this.timerInterval);
    this.timerInterval = setInterval(() => {
      if (this.state === GameState.RETREAT) {
        this.retreatTimer--;
        const timerEl = document.getElementById('turn-timer');
        if (timerEl) timerEl.textContent = `${this.retreatTimer}s RETREAT`;
        
        if (this.retreatTimer <= 0) {
          clearInterval(this.timerInterval);
          this.state = GameState.CLEANUP;
          this.camera.target = this.activeWorm;
        }
      }
    }, 1000);
  }

  resize(w, h) {
    this.canvas.width = w;
    this.canvas.height = h;
  }

  gameOver(winningTeam) {
    this.state = GameState.GAME_OVER;
    clearInterval(this.timerInterval);
    this.ui.showGameOver(winningTeam);
    
    if (this.isOnline && !this.fromGameOverSync) {
      this.mp.send({
        type: 'game_over',
        winningTeam: winningTeam
      });
    }
  }

  gameLoop(currentTime) {
    const dt = Math.min((currentTime - this.lastTime) / 16.666, 4);
    this.lastTime = currentTime;
    
    this.update(dt);
    this.render();
    
    requestAnimationFrame(this.gameLoop.bind(this));
  }

  update(dt) {
    this.updateCamera(dt);
    this.particles.update(dt, this.terrain);
    
    if (this.isOnline) {
      this.projectiles.forEach(p => {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        
        if (p.targetX !== undefined && p.targetY !== undefined) {
          const dx = p.targetX - p.x;
          const dy = p.targetY - p.y;
          const distSq = dx * dx + dy * dy;
          if (distSq > 120 * 120) {
            p.x = p.targetX;
            p.y = p.targetY;
          } else {
            p.x += dx * 0.35 * dt;
            p.y += dy * 0.35 * dt;
          }
        }
        
        if (p.type === 'bazooka' || p.type === 'airstrike_missile') {
          if (Math.random() < 0.6 * dt) {
            this.particles.spawnBurst(p.x - p.vx * 0.5, p.y - p.vy * 0.5, 'smoke_trail', 1);
          }
        }
        
        if (p.y >= this.waterLevel) {
          this.particles.spawnBurst(p.x, this.waterLevel, 'water', 8);
        }
      });

      this.worms.forEach(w => {
        w.x += w.vx * dt;
        w.y += w.vy * dt;
        
        if (w.targetX !== undefined && w.targetY !== undefined) {
          const dx = w.targetX - w.x;
          const dy = w.targetY - w.y;
          const distSq = dx * dx + dy * dy;
          if (distSq > 100 * 100) {
            w.x = w.targetX;
            w.y = w.targetY;
          } else {
            w.x += dx * 0.3 * dt;
            w.y += dy * 0.3 * dt;
          }
        }
        
        if (w.x < w.halfW) w.x = w.halfW;
        if (w.x > this.width - w.halfW) w.x = this.width - w.halfW;
      });

      if (this.isLocalPlayerTurn && (this.state === GameState.PLAYING || this.state === GameState.RETREAT)) {
        this.mp.send({
          type: 'input',
          keys: {
            ArrowLeft: this.keys['ArrowLeft'] || this.keys['KeyA'] || this.keys['a'] || this.keys['A'],
            ArrowRight: this.keys['ArrowRight'] || this.keys['KeyD'] || this.keys['d'] || this.keys['D'],
            ArrowUp: this.keys['ArrowUp'] || this.keys['KeyW'] || this.keys['w'] || this.keys['W'],
            ArrowDown: this.keys['ArrowDown'] || this.keys['KeyS'] || this.keys['s'] || this.keys['S']
          }
        });
      }

      if (this.state === GameState.PLAYING && this.isLocalPlayerTurn) {
        const weapon = this.WEAPONS[this.selectedWeaponIndex];
        const pressFire = this.keys['Space'] || this.keys[' '] || this.keys['Spacebar'];
        if (pressFire && weapon.id !== 'airstrike') {
          this.state = GameState.FIRING;
          this.isCharging = true;
          this.chargePower = 0;
          this.mp.send({ type: 'start_charge' });
        }
      }

      if (this.state === GameState.FIRING && this.isLocalPlayerTurn) {
        if (this.keys['Space'] || this.keys[' '] || this.keys['Spacebar']) {
          this.chargePower += this.chargeRate * dt;
          if (this.chargePower >= this.maxCharge) {
            this.chargePower = this.maxCharge;
            this.fireActiveWeapon();
          }
          const chargeBar = document.getElementById('charge-bar');
          if (chargeBar) chargeBar.style.width = `${this.chargePower}%`;
          this.mp.send({ type: 'update_charge', chargePower: this.chargePower });
        }
      }
    } else {
      // Offline mode
      for (let i = this.projectiles.length - 1; i >= 0; i--) {
        const p = this.projectiles[i];
        p.update(dt);
        if (p.isDead) {
          this.projectiles.splice(i, 1);
        }
      }
      
      const team1Name = this.teams[0].name;
      const team2Name = this.teams[1].name;
      let livingWormsCount = {};
      livingWormsCount[team1Name] = 0;
      livingWormsCount[team2Name] = 0;
      
      this.worms.forEach(w => {
        w.update(dt);
        if (w.health > 0) {
          livingWormsCount[w.teamName]++;
        }
      });
      
      if (this.state !== GameState.LOBBY && 
          this.state !== GameState.CLEANUP && 
          this.state !== GameState.GAME_OVER && 
          this.state !== GameState.HANDOVER && 
          this.activeWorm && 
          this.activeWorm.health <= 0) {
        
        clearInterval(this.timerInterval);
        this.state = GameState.CLEANUP;
      }
      
      if (this.state !== GameState.LOBBY && this.state !== GameState.GAME_OVER) {
        if (livingWormsCount[team1Name] === 0 && livingWormsCount[team2Name] === 0) {
          this.gameOver('Draw');
        } else if (livingWormsCount[team1Name] === 0) {
          this.gameOver(team2Name);
        } else if (livingWormsCount[team2Name] === 0) {
          this.gameOver(team1Name);
        }
      }
      
      if (this.state === GameState.PLAYING || this.state === GameState.RETREAT) {
        this.handlePlayingInput(dt);
      }
      
      if (this.state === GameState.FIRING) {
        if (this.keys['Space']) {
          this.chargePower += this.chargeRate * dt;
          if (this.chargePower >= this.maxCharge) {
            this.chargePower = this.maxCharge;
            this.fireActiveWeapon();
          }
          const chargeBar = document.getElementById('charge-bar');
          if (chargeBar) chargeBar.style.width = `${this.chargePower}%`;
        }
      }
      
      if (this.state === GameState.CLEANUP) {
        const unsettledProjectiles = this.projectiles.length;
        const allSettled = unsettledProjectiles === 0 && 
                           this.particles.isSettle() && 
                           this.worms.every(w => w.isSettled());
        
        if (!allSettled) {
          this.cleanupWaitFrames = (this.cleanupWaitFrames || 0) + 1;
          if (this.cleanupWaitFrames > 150 && unsettledProjectiles === 0) {
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
    this.updateHUD();
  }

  handlePlayingInput(dt) {
    const worm = this.activeWorm;
    if (!worm || worm.health <= 0) return;
    
    const goLeft = this.keys['ArrowLeft'] || this.keys['KeyA'] || this.keys['a'] || this.keys['A'];
    const goRight = this.keys['ArrowRight'] || this.keys['KeyD'] || this.keys['d'] || this.keys['D'];
    
    if (goLeft) {
      worm.move(-1, dt);
    } else if (goRight) {
      worm.move(1, dt);
    } else {
      worm.move(0, dt);
    }
    
    if (this.state === GameState.PLAYING) {
      const aimUp = this.keys['ArrowUp'] || this.keys['KeyW'] || this.keys['w'] || this.keys['W'];
      const aimDown = this.keys['ArrowDown'] || this.keys['KeyS'] || this.keys['s'] || this.keys['S'];
      
      if (aimUp) {
        worm.aim(-1, dt);
      } else if (aimDown) {
        worm.aim(1, dt);
      }
      
      const weapon = this.WEAPONS[this.selectedWeaponIndex];
      const pressFire = this.keys['Space'] || this.keys[' '] || this.keys['Spacebar'];
      if (pressFire && weapon.id !== 'airstrike') {
        this.state = GameState.FIRING;
        this.isCharging = true;
        this.chargePower = 0;
        if (this.isOnline && this.isLocalPlayerTurn) {
          this.mp.send({ type: 'start_charge' });
        }
      }
    }
  }

  updateCamera(dt) {
    let focusX = this.width / 2;
    let focusY = this.height / 2;
    
    if (this.projectiles.length > 0) {
      focusX = this.projectiles[0].x;
      focusY = this.projectiles[0].y;
    } else if (this.activeWorm) {
      focusX = this.activeWorm.x;
      focusY = this.activeWorm.y;
    }
    
    const targetCamX = focusX - this.canvas.width / 2;
    const targetCamY = focusY - this.canvas.height / 2;
    
    this.camera.x += (targetCamX - this.camera.x) * this.camera.lerpSpeed * dt;
    this.camera.y += (targetCamY - this.camera.y) * this.camera.lerpSpeed * dt;
    
    this.camera.x = Math.max(0, Math.min(this.camera.x, this.width - this.canvas.width));
    this.camera.y = Math.max(0, Math.min(this.camera.y, this.height - this.canvas.height));
    
    if (this.canvas.width > this.width) {
      this.camera.x = (this.width - this.canvas.width) / 2;
    }
    if (this.canvas.height > this.height) {
      this.camera.y = (this.height - this.canvas.height) / 2;
    }
  }

  render() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    
    this.ctx.save();
    this.ctx.translate(-this.camera.x, -this.camera.y);
    
    this.drawBackground();
    
    if (this.terrain) {
      this.terrain.draw(this.ctx);
    }
    
    this.drawWater();
    
    this.particles.draw(this.ctx);
    
    this.projectiles.forEach(p => p.draw(this.ctx));
    
    this.worms.forEach(w => {
      w.draw(this.ctx, w === this.activeWorm && (this.state === GameState.PLAYING || this.state === GameState.FIRING));
    });
    
    this.drawTargetingLine();
    
    this.ctx.restore();
  }

  drawBackground() {
    const gradient = this.ctx.createLinearGradient(this.camera.x, 0, this.camera.x, this.height);
    gradient.addColorStop(0, '#1e293b');
    gradient.addColorStop(0.5, '#0f172a');
    gradient.addColorStop(1, '#020617');
    this.ctx.fillStyle = gradient;
    this.ctx.fillRect(this.camera.x, 0, this.canvas.width, this.height);
    
    this.ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
    for (let i = 0; i < 6; i++) {
      const cx = ((i * 300) + (this.camera.x * 0.3)) % (this.width + 200) - 100;
      const cy = 100 + Math.sin(i) * 50;
      this.ctx.beginPath();
      this.ctx.arc(cx, cy, 50, 0, Math.PI * 2);
      this.ctx.arc(cx + 40, cy - 10, 45, 0, Math.PI * 2);
      this.ctx.arc(cx - 30, cy + 10, 35, 0, Math.PI * 2);
      this.ctx.fill();
    }
  }

  drawWater() {
    const time = performance.now() * 0.002;
    this.ctx.fillStyle = 'rgba(14, 116, 144, 0.8)';
    this.ctx.beginPath();
    this.ctx.moveTo(this.camera.x, this.waterLevel);
    
    for (let x = this.camera.x; x <= this.camera.x + this.canvas.width; x += 20) {
      const waveHeight = Math.sin(x * 0.015 + time) * 6 + Math.cos(x * 0.03 - time) * 3;
      this.ctx.lineTo(x, this.waterLevel + waveHeight);
    }
    
    this.ctx.lineTo(this.camera.x + this.canvas.width, this.height);
    this.ctx.lineTo(this.camera.x, this.height);
    this.ctx.closePath();
    this.ctx.fill();
  }

  drawTargetingLine() {
    if (this.state !== GameState.PLAYING) return;
    
    const weapon = this.WEAPONS[this.selectedWeaponIndex];
    if (weapon.id === 'airstrike') {
      const targetX = this.mouse.x + this.camera.x;
      this.ctx.strokeStyle = 'rgba(239, 68, 68, 0.4)';
      this.ctx.lineWidth = 1.5;
      this.ctx.setLineDash([5, 5]);
      
      this.ctx.beginPath();
      this.ctx.moveTo(targetX, 0);
      this.ctx.lineTo(targetX, this.height);
      this.ctx.stroke();
      this.ctx.setLineDash([]);
      
      this.ctx.strokeStyle = '#ef4444';
      this.ctx.beginPath();
      this.ctx.arc(this.mouse.canvasX, this.mouse.canvasY, 15, 0, Math.PI * 2);
      this.ctx.moveTo(this.mouse.canvasX - 25, this.mouse.canvasY);
      this.ctx.lineTo(this.mouse.canvasX + 25, this.mouse.canvasY);
      this.ctx.moveTo(this.mouse.canvasX, this.mouse.canvasY - 25);
      this.ctx.lineTo(this.mouse.canvasX, this.game.waterLevel || this.mouse.canvasY + 25); // safe fallback boundary limit
      this.ctx.stroke();
    }
  }
}
