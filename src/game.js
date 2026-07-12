import { Terrain } from './terrain.js';
import { Worm } from './worm.js';
import { Projectile } from './projectile.js';
import { ParticleSystem } from './particles.js';
import { AudioSynth } from './audio.js';
import { MultiplayerManager } from './multiplayer.js';

export const GameState = {
  LOBBY: 'LOBBY',
  START_TURN: 'START_TURN',
  PLAYING: 'PLAYING',
  FIRING: 'FIRING',
  ACTION: 'ACTION',
  RETREAT: 'RETREAT',
  CLEANUP: 'CLEANUP',
  GAME_OVER: 'GAME_OVER',
  HANDOVER: 'HANDOVER'
};

export const WEAPONS = [
  { id: 'bazooka', name: 'Bazooka', ammo: -1, icon: '🚀', desc: 'Heavy rocket. Affected by gravity & wind.' },
  { id: 'grenade', name: 'Grenade', ammo: -1, icon: '💣', desc: 'Bouncy grenade with 3s fuse. Physics bounce!' },
  { id: 'cluster', name: 'Cluster Bomb', ammo: 3, icon: '💥', desc: 'Explodes into 5 bouncing shrapnel bombs.' },
  { id: 'holy', name: 'Holy Grenade', ammo: 1, icon: '⛪', desc: 'Massive blast, high bounce. Plays Hallelujah!' },
  { id: 'dynamite', name: 'Dynamite', ammo: 2, icon: '🧨', desc: 'Drops at feet. Huge explosion. 5s fuse.' },
  { id: 'airstrike', name: 'Air Strike', ammo: 1, icon: '✈️', desc: 'Click map to target. 5 missiles drop down.' },
  { id: 'blowtorch', name: 'Blowtorch', ammo: 2, icon: '🔥', desc: 'Digs tunnel in terrain. High utility.' }
];

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
    
    this.setupInputs();
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

  // Populate HTML weapon grid
  populateWeaponMenu() {
    const grid = document.getElementById('weapon-grid');
    grid.innerHTML = '';
    
    this.WEAPONS.forEach((weapon, index) => {
      const item = document.createElement('div');
      item.className = `weapon-item ${index === this.selectedWeaponIndex ? 'active' : ''}`;
      item.id = `weapon-item-${weapon.id}`;
      item.innerHTML = `
        <span class="weapon-icon-procedural">${weapon.icon}</span>
        <span class="weapon-name">${weapon.name}</span>
        <span class="weapon-ammo" id="ammo-${weapon.id}">${weapon.ammo === -1 ? '∞' : 'Qty: ' + weapon.ammo}</span>
      `;
      item.addEventListener('click', () => {
        if (weapon.ammo === 0) {
          this.audio.play('beep_error');
          return;
        }
        this.selectWeapon(index);
        this.toggleWeaponMenu(false);
      });
      grid.appendChild(item);
    });
  }

  selectWeapon(index, fromSync = false) {
    if (this.isOnline && !this.isLocalPlayerTurn && !fromSync) return;
    
    this.selectedWeaponIndex = index;
    const activeW = this.WEAPONS[index];
    
    if (this.isOnline && !fromSync) {
      this.mp.send({ type: 'select_weapon', index });
    }
    
    // Update active class in grid
    document.querySelectorAll('.weapon-item').forEach((el, idx) => {
      el.classList.toggle('active', idx === index);
    });
    
    // Update bottom HUD
    document.getElementById('active-weapon-name-display').textContent = activeW.name;
    document.getElementById('weapon-ammo-display').textContent = activeW.ammo === -1 ? '∞' : `Ammo: ${activeW.ammo}`;
    
    const timerDisplay = document.getElementById('weapon-timer-display');
    if (timerDisplay) {
      if (['grenade', 'cluster', 'holy'].includes(activeW.id)) {
        timerDisplay.classList.remove('hidden');
        timerDisplay.textContent = `${this.selectedFuseTime}s Fuse`;
      } else {
        timerDisplay.classList.add('hidden');
      }
    }
    
    this.audio.play('weapon_select');
  }

  deductAmmo(weapon) {
    if (weapon.ammo > 0) {
      weapon.ammo--;
      this.populateWeaponMenu();
      if (weapon.ammo === 0) {
        this.selectWeapon(0);
      }
    }
  }

  toggleWeaponMenu(forceState) {
    if (this.state !== GameState.PLAYING && this.state !== GameState.START_TURN) return;
    
    const overlay = document.getElementById('weapon-select-overlay');
    if (forceState !== undefined) {
      if (forceState) overlay.classList.remove('hidden');
      else overlay.classList.add('hidden');
    } else {
      overlay.classList.toggle('hidden');
    }
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
      
      // Find safe spawn points on solid ground (optimized for cave/island separation)
      const getSafeSpawnPoint = (minX, maxX) => {
        let attempts = 0;
        while (attempts < 150) {
          const x = minX + Math.random() * (maxX - minX);
          
          // Start in middle of vertical space (y=350) to avoid ceiling solid pixels entirely
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
            // Trace up to find the exact top surface of this ground segment
            while (y > 100 && this.terrain.isSolid(x, y)) {
              y--;
            }
            
            // In cave maps, reject spots with less than 100px ceiling clearance (y < 280)
            if (settings.mapType === 'cave' && y < 285) {
              attempts++;
              continue;
            }
            
            return { x, y: y - 10 };
          }
          attempts++;
        }
        // Fallback safe spawn coordinates
        return { x: minX + (maxX - minX) / 2, y: 550 };
      };
  
      // Divide the map's safe playable island width (from X=200 to X=1400) into segments
      const segmentWidth = 1200 / settings.wormsPerTeam;
      
      for (let i = 0; i < settings.wormsPerTeam; i++) {
        const minX = 200 + i * segmentWidth;
        const maxX = 200 + (i + 1) * segmentWidth;
        const midX = minX + segmentWidth / 2;
        
        // Spawn Red worm on left half, Blue worm on right half of segment
        const redPos = getSafeSpawnPoint(minX, midX - 15);
        const bluePos = getSafeSpawnPoint(midX + 15, maxX);
        
        const team1Name = this.isOnline ? (this.onlineP1Name || 'Red Team') : 'Red Team';
        const team2Name = this.isOnline ? (this.onlineP2Name || 'Blue Team') : 'Blue Team';
        
        this.worms.push(new Worm(redPos.x, redPos.y, redNames[i % redNames.length], team1Name, '#ef4444', this));
        this.worms.push(new Worm(bluePos.x, bluePos.y, blueNames[i % blueNames.length], team2Name, '#3b82f6', this));
      }
    }
    
    // Clone weapons array for each team to reset ammo
    this.teams.forEach(team => {
      team.weapons = WEAPONS.map(w => ({ ...w }));
    });
    
    // Select active weapon default
    this.selectWeapon(0);
    this.populateWeaponMenu();
    
    // Setup camera target
    if (!skipSetupTurn) {
      this.setupNextTurn(true);
    }
    
    // Run loop
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
    const listElement = document.getElementById('lobbies-list');
    if (!listElement) return;
    
    listElement.innerHTML = '';
    
    if (!data.rooms || data.rooms.length === 0) {
      listElement.innerHTML = `<p style="color: rgba(255,255,255,0.4); padding: 40px 0; font-size: 0.95rem;">No active rooms found. Create one to begin!</p>`;
      return;
    }
    
    data.rooms.forEach(room => {
      const item = document.createElement('div');
      item.className = 'lobby-item';
      item.style.display = 'flex';
      item.style.justifyContent = 'space-between';
      item.style.alignItems = 'center';
      item.style.padding = '10px 14px';
      item.style.background = 'rgba(255,255,255,0.05)';
      item.style.borderRadius = '8px';
      item.style.border = '1px solid rgba(255,255,255,0.08)';
      item.style.transition = 'all 0.2s ease-in-out';
      
      item.innerHTML = `
        <div style="text-align: left;">
          <span style="font-weight: 600; color: #fff; font-size: 0.95rem;">${room.name}</span>
          <span style="display: block; font-size: 0.8rem; color: rgba(255,255,255,0.5);">${room.mapType.toUpperCase()} • ${room.wormsPerTeam} Worms</span>
        </div>
        <button class="btn btn-primary join-room-btn" data-room-id="${room.id}" style="padding: 6px 14px; font-size: 0.85rem; border-radius: 4px;">Join</button>
      `;
      
      const joinBtn = item.querySelector('.join-room-btn');
      joinBtn.addEventListener('click', () => {
        const statusText = document.getElementById('lobby-status');
        if (statusText) statusText.textContent = `Joining ${room.name}...`;
        
        const playerNameInput = document.getElementById('player-name-input');
        const playerName = playerNameInput ? playerNameInput.value.trim() : 'Blue Team';
        
        this.mp.joinRoom(room.id, playerName);
      });
      
      listElement.appendChild(item);
    });
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

  resetLobbyUI() {
    const statusText = document.getElementById('lobby-status');
    if (statusText) statusText.textContent = 'Connected. Choose a room or create one.';
    
    const lobbyControls = document.getElementById('room-lobby-controls');
    if (lobbyControls) lobbyControls.classList.remove('hidden');
    
    const hostControls = document.getElementById('room-host-controls');
    if (hostControls) hostControls.classList.add('hidden');
    
    const guestControls = document.getElementById('room-guest-controls');
    if (guestControls) guestControls.classList.add('hidden');
    
    const listContainer = document.getElementById('lobbies-list-container');
    if (listContainer) {
      listContainer.innerHTML = `<div id="lobbies-list" style="display: flex; flex-direction: column; gap: 8px;">
        <p style="color: rgba(255,255,255,0.4); padding: 40px 0; font-size: 0.95rem;">No active rooms found. Create one to begin!</p>
      </div>`;
    }
  }

  initOnlineMatch(data) {
    this.isOnline = true;
    this.onlinePlayerNumber = this.mp.playerNumber;

    // Initialize the match layout and worms from the server first
    const settings = {
      wormsPerTeam: data.wormsPerTeam,
      mapType: data.mapType
    };
    this.start(settings, data.worms, true);

    // Register handlers now that everything is fully set up and ready
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

    // Check state transition to HANDOVER to trigger Handover UI
    const stateTransitionToHandover = (data.state === 'HANDOVER' && this.state !== GameState.HANDOVER);

    // Sync properties
    this.state = data.state;
    this.activeTeamIndex = data.activeTeamIndex;
    this.turnTimer = data.turnTimer;
    this.wind.strength = data.windStrength;
    this.wind.x = data.windStrength;
    this.chargePower = data.chargePower;
    this.selectedFuseTime = data.selectedFuseTime;

    // Sync active worm reference
    if (data.activeWormId === null) {
      this.activeWorm = null;
    }

    // Update bottom weapon HUD weapon select index
    const team = this.teams[this.activeTeamIndex];
    if (team) {
      team.selectedWeaponIndex = data.selectedWeaponIndex;
      const activeW = team.weapons[data.selectedWeaponIndex];
      if (activeW) {
        document.getElementById('active-weapon-name-display').textContent = activeW.name;
        document.getElementById('weapon-ammo-display').textContent = activeW.ammo === -1 ? '∞' : `Ammo: ${activeW.ammo}`;
        
        // Update active class in weapon grid
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

    // Sync worms
    data.worms.forEach(syncW => {
      const worm = this.worms.find(w => w.id === syncW.id);
      if (worm) {
        const prevHealth = worm.health;
        
        // Save target coordinates instead of hard-snapping them immediately
        worm.targetX = syncW.x;
        worm.targetY = syncW.y;
        
        // If coordinate is not initialized yet or too far (lag spike or initial setup), snap
        if (worm.x === undefined || worm.y === undefined || isNaN(worm.x) || isNaN(worm.y)) {
          worm.x = syncW.x;
          worm.y = syncW.y;
        }
        const dx = syncW.x - worm.x;
        const dy = syncW.y - worm.y;
        if (dx * dx + dy * dy > 80 * 80) { // e.g. 80px distance
          worm.x = syncW.x;
          worm.y = syncW.y;
        }

        worm.vx = syncW.vx;
        worm.vy = syncW.vy;
        worm.facingDir = syncW.facingDir;
        worm.aimAngle = syncW.aimAngle;
        worm.isFalling = syncW.isFalling;
        worm.health = syncW.health;

        // If worm took damage, spawn local indicators
        if (prevHealth > worm.health) {
          const dmg = prevHealth - worm.health;
          this.particles.spawnText(worm.x, worm.y - 18, `-${dmg}`, '#f87171');
        }

        if (prevHealth > 0 && worm.health <= 0) {
          const isDrowned = worm.y >= this.waterLevel;
          if (isDrowned) {
            this.particles.spawnBurst(worm.x, this.waterLevel, 'water', 15);
          } else {
            // Died locally
            this.particles.spawnBurst(worm.x, worm.y, 'smoke', 8);
            this.particles.spawnText(worm.x, worm.y - 10, 'RIP', '#94a3b8');
            // grave carve is handled by the incoming carve message from the server!
          }
        }

        if (syncW.id === data.activeWormId) {
          this.activeWorm = worm;
        }
      }
    });

    // Rebuild/sync projectiles by matching ID to prevent recreation stutter
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

    // Remove client projectiles that are no longer active on the server
    this.projectiles = this.projectiles.filter(p => activeProjIds.has(p.id));

    // Update camera focus target
    if (this.projectiles.length > 0) {
      this.camera.target = this.projectiles[0];
    } else if (this.activeWorm) {
      this.camera.target = this.activeWorm;
    }

    // If state is not HANDOVER, ensure handover screen is hidden
    if (this.state !== GameState.HANDOVER) {
      document.getElementById('handover-screen').classList.add('hidden');
    }

    // Show Handover overlay if transitioned to HANDOVER
    const handoverScreen = document.getElementById('handover-screen');
    if (this.state === GameState.HANDOVER && handoverScreen && handoverScreen.classList.contains('hidden') && this.activeWorm && team) {
      const handoverSubtitle = document.getElementById('handover-subtitle');
      const handoverWormName = document.getElementById('handover-worm-name');
      const handoverCard = handoverScreen.querySelector('.menu-card');

      handoverSubtitle.textContent = `Get ready, ${team.name}!`;
      handoverWormName.textContent = `${this.activeWorm.name} is up next`;

      // Reset confirmation state and button text
      this.handoverConfirm = false;
      const startBtn = document.getElementById('handover-start-btn');
      if (startBtn) {
        if (this.isLocalPlayerTurn) {
          startBtn.classList.remove('hidden');
          startBtn.textContent = 'Start Turn';
        } else {
          startBtn.classList.add('hidden');
          handoverWormName.textContent = `Waiting for opponent's turn...`;
        }
        startBtn.classList.remove('confirming');
      }

      handoverCard.className = `menu-card glass-panel handover-card ${team.id}-team`;
      handoverScreen.classList.remove('hidden');
      this.populateWeaponMenu();
    }
  }

  handlePlayerLeft() {
    this.isOnline = false;
    this.mp.disconnect();
    this.resetLobbyUI();
    document.getElementById('game-hud').classList.add('hidden');
    document.getElementById('online-lobby-overlay').classList.add('hidden');
    document.getElementById('handover-screen').classList.add('hidden');
    document.getElementById('disconnect-overlay').classList.remove('hidden');
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

  updateHUD() {
    const team = this.teams[this.activeTeamIndex];

    // 1. Update Active Worm Panel
    if (this.activeWorm && team) {
      const activeWormPanel = document.querySelector('.active-worm-panel');
      if (activeWormPanel) {
        activeWormPanel.className = `hud-panel active-worm-panel ${team.id}-team`;
      }
      const activeTeamName = document.getElementById('active-team-name');
      if (activeTeamName) activeTeamName.textContent = team.name;
      const activeWormName = document.getElementById('active-worm-name');
      if (activeWormName) activeWormName.textContent = this.activeWorm.name;
      const activeWormHealthText = document.getElementById('active-worm-health-text');
      if (activeWormHealthText) activeWormHealthText.textContent = `${this.activeWorm.health} HP`;
      const activeWormHealthBar = document.getElementById('active-worm-health-bar');
      if (activeWormHealthBar) activeWormHealthBar.style.width = `${this.activeWorm.health}%`;
    }

    // 2. Update Turn Timer
    const turnTimerEl = document.getElementById('turn-timer');
    if (turnTimerEl) {
      if (this.state === GameState.RETREAT) {
        turnTimerEl.textContent = `${this.turnTimer}s RETREAT`;
      } else if (this.state === GameState.CLEANUP) {
        turnTimerEl.textContent = 'Turn End';
      } else {
        turnTimerEl.textContent = this.turnTimer;
      }
    }

    // 3. Update Wind HUD
    const arrow = document.getElementById('wind-direction-arrow');
    const bar = document.getElementById('wind-bar');
    const windText = document.getElementById('wind-text');
    if (arrow && bar && windText) {
      if (this.wind.strength === 0) {
        arrow.style.transform = 'rotate(0deg)';
        bar.style.width = '0%';
        windText.textContent = 'Calm (0 km/h)';
      } else {
        const rot = this.wind.strength > 0 ? 0 : 180;
        arrow.style.transform = `rotate(${rot}deg)`;
        const pct = Math.abs(this.wind.strength) / 0.15 * 100;
        bar.style.width = `${pct}%`;
        windText.textContent = `${Math.round(Math.abs(this.wind.strength) * 200)} km/h`;
      }
    }

    // 4. Update Charge HUD
    const chargeBar = document.getElementById('charge-bar');
    if (chargeBar) {
      chargeBar.style.width = `${this.chargePower}%`;
    }

    // 5. Update Teams HP HUD
    const container = document.getElementById('teams-hp-container');
    if (container) {
      container.innerHTML = '';
      this.teams.forEach(t => {
        const teamWorms = this.worms.filter(w => w.teamName === t.name);
        const currentHealth = teamWorms.reduce((sum, w) => sum + w.health, 0);
        if (!t.maxHealth || t.maxHealth < currentHealth) {
          t.maxHealth = Math.max(currentHealth, 100);
        }
        const pct = Math.min((currentHealth / t.maxHealth) * 100, 100);
        
        const row = document.createElement('div');
        row.className = 'team-hp-row';
        row.innerHTML = `
          <span class="team-hp-name ${t.id}-team-text">${t.name}</span>
          <div class="team-hp-bar-wrapper">
            <div class="team-hp-bar ${t.id}-team-bar" style="width: ${pct}%;"></div>
          </div>
          <span class="team-hp-val">${currentHealth} HP</span>
        `;
        container.appendChild(row);
      });
    }
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
      const isOurTurn = isFirstTurn 
        ? (this.onlinePlayerNumber === 1) 
        : this.isLocalPlayerTurn;
      if (!isOurTurn) return;
    }
    
    // Broadcast next turn to the other client if we are the active player
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
      // Rotate active worm indexes for next time
      const currentTeam = this.teams[this.activeTeamIndex];
      const liveWormsInTeam = this.worms.filter(w => w.teamName === currentTeam.name && w.health > 0);
      
      if (liveWormsInTeam.length > 0) {
        // Increment worm index
        currentTeam.activeWormIndex = (currentTeam.activeWormIndex + 1) % this.worms.filter(w => w.teamName === currentTeam.name).length;
      }
      
      // Switch team index
      this.activeTeamIndex = (this.activeTeamIndex + 1) % this.teams.length;
    }
    
    // Get live worm
    const team = this.teams[this.activeTeamIndex];
    const teamWorms = this.worms.filter(w => w.teamName === team.name);
    
    // Find next alive worm starting from activeWormIndex
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
    
    // Check if team has lost
    if (!nextWorm) {
      // Find other team
      const otherTeamIndex = (this.activeTeamIndex + 1) % this.teams.length;
      const otherTeam = this.teams[otherTeamIndex];
      this.gameOver(otherTeam.name);
      return;
    }
    
    this.activeWorm = nextWorm;
    this.camera.target = this.activeWorm;
    
    // Update Active Worm HUD styles
    const activeWormPanel = document.querySelector('.active-worm-panel');
    activeWormPanel.className = `hud-panel active-worm-panel ${team.id}-team`;
    document.getElementById('active-team-name').textContent = team.name;
    document.getElementById('active-worm-name').textContent = this.activeWorm.name;
    document.getElementById('active-worm-health-text').textContent = `${this.activeWorm.health} HP`;
    document.getElementById('active-worm-health-bar').style.width = '100%';
    
    // If our selected weapon is out of ammo, fall back to Bazooka (index 0)
    const currentWeapon = this.WEAPONS[this.selectedWeaponIndex];
    if (currentWeapon.ammo === 0) {
      this.selectWeapon(0);
    } else {
      this.selectWeapon(this.selectedWeaponIndex);
    }
    
    this.populateWeaponMenu();
    
    // Transition to HANDOVER state
    this.state = GameState.HANDOVER;
    
    // Stop any running timer
    clearInterval(this.timerInterval);
    document.getElementById('turn-timer').textContent = 'Ready';
    
    // Update and show Handover screen UI
    const handoverScreen = document.getElementById('handover-screen');
    const handoverSubtitle = document.getElementById('handover-subtitle');
    const handoverWormName = document.getElementById('handover-worm-name');
    const handoverCard = handoverScreen.querySelector('.menu-card');
    
    handoverSubtitle.textContent = `Get ready, ${team.name}!`;
    handoverWormName.textContent = `${this.activeWorm.name} is up next`;
    
    // Reset confirmation state and button text
    this.handoverConfirm = false;
    const startBtn = document.getElementById('handover-start-btn');
    if (startBtn) {
      if (this.isOnline) {
        if (this.isLocalPlayerTurn) {
          startBtn.classList.remove('hidden');
          startBtn.textContent = 'Start Turn';
        } else {
          startBtn.classList.add('hidden');
          handoverWormName.textContent = `Waiting for opponent's turn...`;
        }
      } else {
        startBtn.classList.remove('hidden');
        startBtn.textContent = 'Start Turn';
      }
      startBtn.classList.remove('confirming');
    }
    
    // Add color theme classes
    handoverCard.className = `menu-card glass-panel handover-card ${team.id}-team`;
    
    // Show overlay
    handoverScreen.classList.remove('hidden');
  }

  startTurn(windStrength = null, fromSync = false) {
    if (this.state !== GameState.HANDOVER) return;
    
    if (this.isOnline && !this.isLocalPlayerTurn && !fromSync) return;
    
    // Two-step confirmation logic
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
      if (this.autoStartTimer) {
        clearTimeout(this.autoStartTimer);
        this.autoStartTimer = null;
      }
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
    
    // Hide handover screen
    document.getElementById('handover-screen').classList.add('hidden');
    
    const team = this.teams[this.activeTeamIndex];
    
    // Set random wind or load synced wind
    if (windStrength !== null) {
      this.wind.strength = windStrength;
    } else {
      const windStrengths = [-0.15, -0.1, -0.05, 0, 0.05, 0.1, 0.15];
      this.wind.strength = windStrengths[Math.floor(Math.random() * windStrengths.length)];
    }
    this.wind.x = this.wind.strength;
    
    // Broadcast start turn with wind configuration
    if (this.isOnline && !fromSync) {
      this.mp.send({ type: 'start_turn', windStrength: this.wind.strength });
    }
    
    // Update Wind HUD
    const arrow = document.getElementById('wind-direction-arrow');
    const bar = document.getElementById('wind-bar');
    const windText = document.getElementById('wind-text');
    
    if (this.wind.strength === 0) {
      arrow.style.transform = 'rotate(0deg)';
      bar.style.width = '0%';
      windText.textContent = 'Calm (0 km/h)';
    } else {
      const rot = this.wind.strength > 0 ? 0 : 180;
      arrow.style.transform = `rotate(${rot}deg)`;
      const pct = Math.abs(this.wind.strength) / 0.15 * 100;
      bar.style.width = `${pct}%`;
      windText.textContent = `${Math.round(Math.abs(this.wind.strength) * 200)} km/h`;
    }
    
    // Reset inputs / charging
    this.keys = {};
    this.isCharging = false;
    this.chargePower = 0;
    document.getElementById('charge-bar').style.width = '0%';
    
    // Set timer
    this.state = GameState.PLAYING;
    this.turnTimer = 45;
    document.getElementById('turn-timer').textContent = this.turnTimer;
    
    // Start timer interval
    clearInterval(this.timerInterval);
    this.timerInterval = setInterval(() => {
      if (this.state === GameState.PLAYING) {
        this.turnTimer--;
        document.getElementById('turn-timer').textContent = this.turnTimer;
        
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

  setupInputs() {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      
      // If in HANDOVER state, pressing Space or Enter starts the turn!
      if (this.state === GameState.HANDOVER) {
        if (e.code === 'Space' || e.key === ' ' || e.key === 'Spacebar' || e.code === 'Enter' || e.key === 'Enter') {
          if (this.isOnline && !this.isLocalPlayerTurn) return;
          this.startTurn();
          e.preventDefault();
          return;
        }
      }

      this.keys[e.code] = true;
      if (e.key) {
        this.keys[e.key] = true;
      }
      
      // Prevent browser scrolling on Arrow keys and Space
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code) ||
          [' ', 'Spacebar', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault();
      }
      
      // Change Grenade timer (1-5s) with number keys 1-5
      if (this.state === GameState.PLAYING) {
        if (e.key >= '1' && e.key <= '5') {
          if (this.isOnline && !this.isLocalPlayerTurn) return;
          const activeW = this.WEAPONS[this.selectedWeaponIndex];
          if (['grenade', 'cluster', 'holy'].includes(activeW.id)) {
            this.selectedFuseTime = parseInt(e.key, 10);
            this.audio.play('beep_tick');
            const timerDisplay = document.getElementById('weapon-timer-display');
            if (timerDisplay) {
              timerDisplay.textContent = `${this.selectedFuseTime}s Fuse`;
            }
            if (this.isOnline) {
              this.mp.send({ type: 'set_fuse', fuse: this.selectedFuseTime });
            }
            e.preventDefault();
            return;
          }
        }
      }
      
      // Jump and Backflip hotkeys
      if (this.state === GameState.PLAYING || this.state === GameState.RETREAT) {
        if (e.code === 'Enter' || e.key === 'Enter') {
          if (this.isOnline && !this.isLocalPlayerTurn) return;
          this.activeWorm.jump(false); // Normal jump forwards
          if (this.isOnline) {
            this.mp.send({ type: 'jump', isBackflip: false });
          }
        }
        if (e.code === 'Backspace' || e.key === 'Backspace') {
          if (this.isOnline && !this.isLocalPlayerTurn) return;
          this.activeWorm.jump(true); // Backflip
          if (this.isOnline) {
            this.mp.send({ type: 'jump', isBackflip: true });
          }
        }
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
      if (e.key) {
        this.keys[e.key] = false;
      }
      
      // If releasing space and charging, fire!
      const isSpace = e.code === 'Space' || e.key === ' ' || e.key === 'Spacebar';
      if (isSpace && this.state === GameState.FIRING && this.isCharging) {
        if (this.isOnline && !this.isLocalPlayerTurn) return;
        this.fireActiveWeapon();
      }
    });

    // Reset keys state and charging state on window blur (switching tabs) to prevent stuck input
    window.addEventListener('blur', () => {
      this.keys = {};
      if (this.state === GameState.FIRING) {
        this.state = GameState.PLAYING;
        this.isCharging = false;
        this.chargePower = 0;
        const chargeBar = document.getElementById('charge-bar');
        if (chargeBar) chargeBar.style.width = '0%';
      }
    });

    // Reset loop baseline timer when returning to the tab to prevent large dt simulation spikes
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        this.lastTime = performance.now();
      }
    });

    // Track mouse coordinates over the canvas
    this.canvas.addEventListener('mousemove', (e) => {
      const rect = this.canvas.getBoundingClientRect();
      // Calculate coordinates relative to canvas internal coordinate system (1600x900)
      const scaleX = this.width / rect.width;
      const scaleY = this.height / rect.height;
      
      this.mouse.x = (e.clientX - rect.left) * scaleX;
      this.mouse.y = (e.clientY - rect.top) * scaleY;
      
      // Absolute coordinates in the game map (including camera offset)
      this.mouse.canvasX = this.mouse.x + this.camera.x;
      this.mouse.canvasY = this.mouse.y + this.camera.y;
    });

    this.canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) { // Left click
        this.mouse.clicked = true;
        this.handleMouseClick();
      }
    });
    
    this.canvas.addEventListener('mouseup', () => {
      this.mouse.clicked = false;
    });
  }

  handleMouseClick() {
    if (this.state !== GameState.PLAYING) return;
    if (this.isOnline && !this.isLocalPlayerTurn) return;
    
    const weapon = this.WEAPONS[this.selectedWeaponIndex];
    if (weapon.id === 'airstrike') {
      this.state = GameState.ACTION;
      
      // Air strike target coords
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
      
      // Queue missiles to drop shortly
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
      
      // Deduct ammo
      this.deductAmmo(weapon);
      
      this.startRetreat(3);
    }
  }

  fireActiveWeapon() {
    this.isCharging = false;
    this.state = GameState.ACTION;
    
    const weapon = this.WEAPONS[this.selectedWeaponIndex];
    const worm = this.activeWorm;
    
    // Aim vector
    const aimX = Math.cos(worm.aimAngle) * worm.facingDir;
    const aimY = Math.sin(worm.aimAngle);
    
    // Spawn offset (slightly in front of the worm's face)
    const spawnX = worm.x + aimX * 18;
    const spawnY = worm.y + aimY * 18;
    
    // Launch speed scale
    const velocityScale = ((this.chargePower / this.maxCharge) * 12 + 2) * 1.5; // speed between 3 and 21 (reduced by 25%)
    const vx = aimX * velocityScale;
    const vy = aimY * velocityScale;
    
    // Sync firing event
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
      // Local audio feedback
      if (weapon.id === 'bazooka') {
        this.audio.play('shoot_bazooka');
      } else if (['grenade', 'cluster', 'holy'].includes(weapon.id)) {
        this.audio.play('shoot_grenade');
      } else if (weapon.id === 'dynamite') {
        this.audio.play('fuse');
      } else if (weapon.id === 'blowtorch') {
        this.audio.play('blowtorch');
      }
      
      // Deduct ammo
      this.deductAmmo(weapon);
      
      // Reset charge
      this.chargePower = 0;
      document.getElementById('charge-bar').style.width = '0%';
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
      // Just drop at feet
      this.audio.play('fuse');
      const proj = new Projectile(worm.x, worm.y - 10, worm.facingDir * 2.25, -2, 'dynamite', this); // reduced drop distance by 25%
      this.projectiles.push(proj);
      this.camera.target = proj;
      
      this.deductAmmo(weapon);
      this.startRetreat(5);
    }
    else if (weapon.id === 'blowtorch') {
      // Blowtorch does not shoot a projectile, it cuts terrain instantly
      this.audio.play('blowtorch');
      
      let step = 0;
      const torchInterval = setInterval(() => {
        if (step >= 38 || worm.health <= 0) { // reduced blowtorch distance by 25%
          clearInterval(torchInterval);
          this.state = GameState.CLEANUP;
          if (this.isOnline && this.isLocalPlayerTurn) {
            this.mp.send({ type: 'sync_state', state: GameState.CLEANUP });
          }
          return;
        }
        
        // Cut a circle in front of the worm
        const cutX = worm.x + (Math.cos(worm.aimAngle) * worm.facingDir) * 15;
        const cutY = worm.y + (Math.sin(worm.aimAngle) * 15);
        
        this.terrain.carve(cutX, cutY, 18);
        this.particles.spawnBurst(cutX, cutY, 'fire', 3);
        
        // Move the worm forward slightly into the carved path
        worm.x += (Math.cos(worm.aimAngle) * worm.facingDir) * 1.2;
        worm.y += (Math.sin(worm.aimAngle)) * 1.2;
        worm.vy = 0; // prevent sliding down instantly during cut
        
        if (this.isOnline && this.isLocalPlayerTurn) {
          this.sendWormSync();
        }
        
        step++;
      }, 80);
      
      this.deductAmmo(weapon);
    }
    
    // Reset charge
    this.chargePower = 0;
    document.getElementById('charge-bar').style.width = '0%';
  }

  endActiveTurn() {
    clearInterval(this.timerInterval);
    this.state = GameState.CLEANUP;
    document.getElementById('turn-timer').textContent = 'Turn End';
  }

  startRetreat(seconds) {
    this.state = GameState.RETREAT;
    this.retreatTimer = seconds;
    
    clearInterval(this.timerInterval);
    this.timerInterval = setInterval(() => {
      if (this.state === GameState.RETREAT) {
        this.retreatTimer--;
        document.getElementById('turn-timer').textContent = `${this.retreatTimer}s RETREAT`;
        
        if (this.retreatTimer <= 0) {
          clearInterval(this.timerInterval);
          this.state = GameState.CLEANUP;
          this.camera.target = this.activeWorm; // Focus camera back to active worm or action
        }
      }
    }, 1000);
  }

  resize(w, h) {
    // Keep canvas matching the screen size while maintaining layout
    this.canvas.width = w;
    this.canvas.height = h;
  }

  gameOver(winningTeam) {
    this.state = GameState.GAME_OVER;
    clearInterval(this.timerInterval);
    
    document.getElementById('game-hud').classList.add('hidden');
    document.getElementById('game-over-screen').classList.remove('hidden');
    
    document.getElementById('victory-title').textContent = `${winningTeam} Wins!`;
    document.getElementById('victory-subtitle').textContent = `The opposing team has been entirely annihilated!`;
    
    document.getElementById('stat-turns').textContent = this.turnsPlayed;
    document.getElementById('stat-damage').textContent = Math.round(this.totalDamageDealt);
    document.getElementById('stat-drowns').textContent = this.wormsDrowned;
    
    const menuBtn = document.getElementById('main-menu-btn');
    if (menuBtn) {
      menuBtn.textContent = this.isOnline ? 'Return to Lobby' : 'Main Menu';
    }
    
    if (this.isOnline && !this.fromGameOverSync) {
      this.mp.send({
        type: 'game_over',
        winningTeam: winningTeam
      });
    }
  }

  gameLoop(currentTime) {
    const dt = Math.min((currentTime - this.lastTime) / 16.666, 4); // Limit lag spikes
    this.lastTime = currentTime;
    
    this.update(dt);
    this.render();
    
    requestAnimationFrame(this.gameLoop.bind(this));
  }

  update(dt) {
    // Update camera targets and map bounds
    this.updateCamera(dt);
    
    // Update particle systems
    this.particles.update(dt, this.terrain);
    
    if (this.isOnline) {
      // Extrapolate projectiles and interpolate towards target
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
        
        // Spawn flight particles
        if (p.type === 'bazooka' || p.type === 'airstrike_missile') {
          if (Math.random() < 0.6 * dt) {
            this.particles.spawnBurst(p.x - p.vx * 0.5, p.y - p.vy * 0.5, 'smoke_trail', 1);
          }
        }
        
        // Splash if crossing water level
        if (p.y >= this.waterLevel) {
          this.particles.spawnBurst(p.x, this.waterLevel, 'water', 8);
        }
      });

      // Extrapolate worms and interpolate towards target
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

      // Send inputs if it is our turn
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

      // Begin charging when Space is pressed in PLAYING state (online)
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

      // Charging input (Spacebar)
      if (this.state === GameState.FIRING && this.isLocalPlayerTurn) {
        if (this.keys['Space'] || this.keys[' '] || this.keys['Spacebar']) {
          this.chargePower += this.chargeRate * dt;
          if (this.chargePower >= this.maxCharge) {
            this.chargePower = this.maxCharge;
            this.fireActiveWeapon(); // Auto-fire at full charge
          }
          document.getElementById('charge-bar').style.width = `${this.chargePower}%`;
          this.mp.send({ type: 'update_charge', chargePower: this.chargePower });
        }
      }
    } else {
      // Offline mode
      // Update active projectiles
      for (let i = this.projectiles.length - 1; i >= 0; i--) {
        const p = this.projectiles[i];
        p.update(dt);
        if (p.isDead) {
          this.projectiles.splice(i, 1);
        }
      }
      
      // Update all worms
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
      
      // Check if active worm died during its turn
      if (this.state !== GameState.LOBBY && 
          this.state !== GameState.CLEANUP && 
          this.state !== GameState.GAME_OVER && 
          this.state !== GameState.HANDOVER && 
          this.activeWorm && 
          this.activeWorm.health <= 0) {
        
        clearInterval(this.timerInterval);
        this.state = GameState.CLEANUP;
      }
      
      // Check quick victory or loss conditions
      if (this.state !== GameState.LOBBY && this.state !== GameState.GAME_OVER) {
        if (livingWormsCount[team1Name] === 0 && livingWormsCount[team2Name] === 0) {
          this.gameOver('Draw');
        } else if (livingWormsCount[team1Name] === 0) {
          this.gameOver(team2Name);
        } else if (livingWormsCount[team2Name] === 0) {
          this.gameOver(team1Name);
        }
      }
      
      // Turn State Processing
      if (this.state === GameState.PLAYING || this.state === GameState.RETREAT) {
        this.handlePlayingInput(dt);
      }
      
      if (this.state === GameState.FIRING) {
        if (this.keys['Space']) {
          this.chargePower += this.chargeRate * dt;
          if (this.chargePower >= this.maxCharge) {
            this.chargePower = this.maxCharge;
            this.fireActiveWeapon(); // Auto-fire at full charge
          }
          document.getElementById('charge-bar').style.width = `${this.chargePower}%`;
        }
      }
      
      if (this.state === GameState.CLEANUP) {
        // Check if all projectiles are gone, explosions finished, and worms stopped moving
        const unsettledProjectiles = this.projectiles.length;
        const allSettled = unsettledProjectiles === 0 && 
                           this.particles.isSettle() && 
                           this.worms.every(w => w.isSettled());
        
        if (!allSettled) {
          this.cleanupWaitFrames = (this.cleanupWaitFrames || 0) + 1;
          // Force cleanup if it takes more than 2.5 seconds (150 frames) and NO projectiles remain
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
    
    // Movement inputs (Allowed in both PLAYING and RETREAT states)
    const goLeft = this.keys['ArrowLeft'] || this.keys['KeyA'] || this.keys['a'] || this.keys['A'];
    const goRight = this.keys['ArrowRight'] || this.keys['KeyD'] || this.keys['d'] || this.keys['D'];
    
    if (goLeft) {
      worm.move(-1, dt);
    } else if (goRight) {
      worm.move(1, dt);
    } else {
      worm.move(0, dt); // Stand still
    }
    
    // Aiming & Firing inputs are ONLY allowed during the main active turn state (PLAYING)
    if (this.state === GameState.PLAYING) {
      const aimUp = this.keys['ArrowUp'] || this.keys['KeyW'] || this.keys['w'] || this.keys['W'];
      const aimDown = this.keys['ArrowDown'] || this.keys['KeyS'] || this.keys['s'] || this.keys['S'];
      
      if (aimUp) {
        worm.aim(-1, dt);
      } else if (aimDown) {
        worm.aim(1, dt);
      }
      
      // Weapon fire button hold (Air Strike does not charge, it uses mouse click)
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
    
    // Determine what camera should follow
    if (this.projectiles.length > 0) {
      // Follow active projectile
      focusX = this.projectiles[0].x;
      focusY = this.projectiles[0].y;
    } else if (this.activeWorm) {
      focusX = this.activeWorm.x;
      focusY = this.activeWorm.y;
    }
    
    // Interpolate camera to focus position
    // Center of screen calculations
    const targetCamX = focusX - this.canvas.width / 2;
    const targetCamY = focusY - this.canvas.height / 2;
    
    // Smooth follow
    this.camera.x += (targetCamX - this.camera.x) * this.camera.lerpSpeed * dt;
    this.camera.y += (targetCamY - this.camera.y) * this.camera.lerpSpeed * dt;
    
    // Bounds check to avoid rendering outside the game world limits
    this.camera.x = Math.max(0, Math.min(this.camera.x, this.width - this.canvas.width));
    this.camera.y = Math.max(0, Math.min(this.camera.y, this.height - this.canvas.height));
    
    // If canvas is wider/taller than virtual boundaries, lock to center
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
    // Translate canvas by negative camera coordinates to scroll the world!
    this.ctx.translate(-this.camera.x, -this.camera.y);
    
    // 1. Draw Sky background (Parallax)
    this.drawBackground();
    
    // 2. Draw Terrain
    if (this.terrain) {
      this.terrain.draw(this.ctx);
    }
    
    // 3. Draw Water layer
    this.drawWater();
    
    // 4. Draw Particles
    this.particles.draw(this.ctx);
    
    // 5. Draw Projectiles
    this.projectiles.forEach(p => p.draw(this.ctx));
    
    // 6. Draw Worms
    this.worms.forEach(w => {
      w.draw(this.ctx, w === this.activeWorm && (this.state === GameState.PLAYING || this.state === GameState.FIRING));
    });
    
    // 7. Draw Mouse targeting indicator for Airstrike
    this.drawTargetingLine();
    
    this.ctx.restore();
  }

  drawBackground() {
    // Parallax sky gradient
    const gradient = this.ctx.createLinearGradient(this.camera.x, 0, this.camera.x, this.height);
    gradient.addColorStop(0, '#1e293b');
    gradient.addColorStop(0.5, '#0f172a');
    gradient.addColorStop(1, '#020617');
    this.ctx.fillStyle = gradient;
    this.ctx.fillRect(this.camera.x, 0, this.canvas.width, this.height);
    
    // Draw simple procedural parallax clouds
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
    // Draw waves
    const time = performance.now() * 0.002;
    this.ctx.fillStyle = 'rgba(14, 116, 144, 0.8)'; // Teal-cyan water
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
      // Draw vertical target line and aiming reticle
      const targetX = this.mouse.x + this.camera.x;
      this.ctx.strokeStyle = 'rgba(239, 68, 68, 0.4)';
      this.ctx.lineWidth = 1.5;
      this.ctx.setLineDash([5, 5]);
      
      this.ctx.beginPath();
      this.ctx.moveTo(targetX, 0);
      this.ctx.lineTo(targetX, this.height);
      this.ctx.stroke();
      this.ctx.setLineDash([]);
      
      // Target crosshair
      this.ctx.strokeStyle = '#ef4444';
      this.ctx.beginPath();
      this.ctx.arc(this.mouse.canvasX, this.mouse.canvasY, 15, 0, Math.PI * 2);
      this.ctx.moveTo(this.mouse.canvasX - 25, this.mouse.canvasY);
      this.ctx.lineTo(this.mouse.canvasX + 25, this.mouse.canvasY);
      this.ctx.moveTo(this.mouse.canvasX, this.mouse.canvasY - 25);
      this.ctx.lineTo(this.mouse.canvasX, this.mouse.canvasY + 25);
      this.ctx.stroke();
    }
  }
}
