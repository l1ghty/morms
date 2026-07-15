export class MultiplayerManager {
  constructor(game) {
    this.game = game;
    this.socket = null;
    this.playerNumber = null;
    this.roomId = null;
    this.isOnline = false;
    this.handlers = {};
  }

  connect() {
    const wsUrl = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws`;
    this.socket = new WebSocket(wsUrl);

    this.socket.onopen = () => {
      console.log('Connected to WebSocket server');
      const statusText = document.getElementById('lobby-status');
      if (statusText) statusText.textContent = 'Connected. Choose a room or create one.';
    };

    this.socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this.handleMessage(data);
      } catch (e) {
        console.error('Error parsing WS message:', e);
      }
    };

    this.socket.onclose = () => {
      console.log('Disconnected from WebSocket server');
      this.isOnline = false;
      if (this.game.state !== 'LOBBY' && this.game.state !== 'GAME_OVER') {
        this.game.handlePlayerLeft();
      }
    };

    this.socket.onerror = (err) => {
      console.error('WebSocket error:', err);
    };
  }

  createRoom(roomName, playerName, mapType, wormsPerTeam) {
    this.send({
      type: 'create_room',
      roomName,
      playerName,
      mapType,
      wormsPerTeam
    });
  }

  joinRoom(roomId, playerName) {
    this.send({
      type: 'join_room',
      roomId,
      playerName
    });
  }

  disconnect() {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    this.isOnline = false;
    this.playerNumber = null;
    this.roomId = null;
    this.roomName = null;
    this.p1Name = null;
    this.p2Name = null;
  }

  send(data) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(data));
    }
  }

  handleMessage(data) {
    switch (data.type) {
      case 'init':
        this.playerNumber = data.playerNumber;
        this.roomId = data.roomId;
        this.roomName = data.roomName;
        this.p1Name = data.p1Name || 'Red Team';
        this.p2Name = data.p2Name || 'Blue Team';
        console.log(`Initialized as Player ${this.playerNumber} in Room ${this.roomId}`);
        
        if (this.playerNumber === 1) {
          const statusText = document.getElementById('lobby-status');
          if (statusText) statusText.textContent = `Room created: ${this.roomName}. Waiting for opponent...`;
          
          const lobbyControls = document.getElementById('room-lobby-controls');
          if (lobbyControls) lobbyControls.classList.add('hidden');
          const hostControls = document.getElementById('room-host-controls');
          if (hostControls) hostControls.classList.remove('hidden');
          const startBtn = document.getElementById('host-start-match-btn');
          if (startBtn) startBtn.classList.add('hidden'); // hidden until guest joins
          
          const listContainer = document.getElementById('lobbies-list-container');
          if (listContainer) {
            listContainer.innerHTML = `
              <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; min-height: 200px; gap: 16px;">
                <div style="display: flex; justify-content: space-around; align-items: center; width: 100%; background: rgba(0,0,0,0.25); padding: 16px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.08);">
                  <div style="text-align: center; flex: 1;">
                    <div style="font-size: 0.8rem; color: rgba(255,255,255,0.5); text-transform: uppercase;">Host (Red)</div>
                    <div style="font-size: 1.1rem; font-weight: 600; color: #ef4444; margin-top: 4px; word-break: break-all;">${this.p1Name}</div>
                  </div>
                  <div style="font-size: 1.4rem; color: rgba(255,255,255,0.2); padding: 0 10px;">VS</div>
                  <div style="text-align: center; flex: 1;">
                    <div style="font-size: 0.8rem; color: rgba(255,255,255,0.5); text-transform: uppercase;">Opponent (Blue)</div>
                    <div style="font-size: 1.1rem; font-weight: 600; color: #3b82f6; margin-top: 4px; animation: pulse 1.5s infinite;">Waiting...</div>
                  </div>
                </div>
                <span style="color: rgba(255,255,255,0.5); font-size: 0.9rem;">Room name: <strong>${this.roomName}</strong></span>
              </div>`;
          }
        }
        break;
      case 'opponent_joined':
        console.log('Opponent has joined!');
        this.p2Name = data.opponentName || 'Blue Team';
        const statusText = document.getElementById('lobby-status');
        if (statusText) statusText.textContent = `Opponent joined room ${this.roomName || ''}! Ready to start.`;
        
        const startMatchBtn = document.getElementById('host-start-match-btn');
        if (startMatchBtn) startMatchBtn.classList.remove('hidden'); // Show Start button
        
        const hostListContainer = document.getElementById('lobbies-list-container');
        if (hostListContainer) {
          hostListContainer.innerHTML = `
            <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; min-height: 200px; gap: 16px;">
              <div style="display: flex; justify-content: space-around; align-items: center; width: 100%; background: rgba(0,0,0,0.25); padding: 16px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.08);">
                <div style="text-align: center; flex: 1;">
                  <div style="font-size: 0.8rem; color: rgba(255,255,255,0.5); text-transform: uppercase;">Host (Red)</div>
                  <div style="font-size: 1.1rem; font-weight: 600; color: #ef4444; margin-top: 4px; word-break: break-all;">${this.p1Name}</div>
                </div>
                <div style="font-size: 1.4rem; color: rgba(255,255,255,0.2); padding: 0 10px;">VS</div>
                <div style="text-align: center; flex: 1;">
                  <div style="font-size: 0.8rem; color: rgba(255,255,255,0.5); text-transform: uppercase;">Opponent (Blue)</div>
                  <div style="font-size: 1.1rem; font-weight: 600; color: #3b82f6; margin-top: 4px; word-break: break-all;">${this.p2Name}</div>
                </div>
              </div>
              <span style="color: #4ade80; font-size: 0.95rem; font-weight: 600;">Opponent Connected! Ready to start.</span>
            </div>`;
        }
        break;
      case 'joined_waiting_host':
        console.log('Joined and waiting for host...');
        this.p1Name = data.hostName || 'Red Team';
        this.p2Name = data.opponentName || 'Blue Team';
        
        const guestStatusText = document.getElementById('lobby-status');
        if (guestStatusText) guestStatusText.textContent = `Joined Room: ${this.roomName || 'Online Room'}`;
        
        const guestLobbyControls = document.getElementById('room-lobby-controls');
        if (guestLobbyControls) guestLobbyControls.classList.add('hidden');
        const guestControls = document.getElementById('room-guest-controls');
        if (guestControls) guestControls.classList.remove('hidden');
        
        const guestListContainer = document.getElementById('lobbies-list-container');
        if (guestListContainer) {
          guestListContainer.innerHTML = `
            <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; min-height: 200px; gap: 16px;">
              <div style="display: flex; justify-content: space-around; align-items: center; width: 100%; background: rgba(0,0,0,0.25); padding: 16px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.08);">
                <div style="text-align: center; flex: 1;">
                  <div style="font-size: 0.8rem; color: rgba(255,255,255,0.5); text-transform: uppercase;">Host (Red)</div>
                  <div style="font-size: 1.1rem; font-weight: 600; color: #ef4444; margin-top: 4px; word-break: break-all;">${this.p1Name}</div>
                </div>
                <div style="font-size: 1.4rem; color: rgba(255,255,255,0.2); padding: 0 10px;">VS</div>
                <div style="text-align: center; flex: 1;">
                  <div style="font-size: 0.8rem; color: rgba(255,255,255,0.5); text-transform: uppercase;">Opponent (Blue)</div>
                  <div style="font-size: 1.1rem; font-weight: 600; color: #3b82f6; margin-top: 4px; word-break: break-all;">${this.p2Name}</div>
                </div>
              </div>
              <span style="color: rgba(255,255,255,0.5); font-size: 0.95rem;">Waiting for host to start match...</span>
            </div>`;
        }
        
        // Update guest settings display
        const guestWorms = document.getElementById('guest-worms-display');
        const guestTerrain = document.getElementById('guest-terrain-display');
        if (guestWorms && data.wormsPerTeam !== undefined) guestWorms.textContent = data.wormsPerTeam;
        if (guestTerrain && data.mapType !== undefined) {
          const mapNames = { island: 'Island', cave: 'Cave', canyon: 'Canyon' };
          guestTerrain.textContent = mapNames[data.mapType] || data.mapType;
        }
        break;
      case 'settings_updated':
        console.log('Lobby settings updated:', data);
        const guestWormsDisplay = document.getElementById('guest-worms-display');
        const guestTerrainDisplay = document.getElementById('guest-terrain-display');
        if (guestWormsDisplay) guestWormsDisplay.textContent = data.wormsPerTeam;
        if (guestTerrainDisplay) {
          const mapNames = { island: 'Island', cave: 'Cave', canyon: 'Canyon' };
          guestTerrainDisplay.textContent = mapNames[data.mapType] || data.mapType;
        }
        break;
      case 'start_match':
        this.isOnline = true;
        this.game.onlineP1Name = data.p1Name;
        this.game.onlineP2Name = data.p2Name;
        const lobbyOverlay = document.getElementById('online-lobby-overlay');
        if (lobbyOverlay) lobbyOverlay.classList.add('hidden');
        const gameHud = document.getElementById('game-hud');
        if (gameHud) gameHud.classList.remove('hidden');
        this.game.initOnlineMatch(data);
        break;
      case 'player_left':
        this.game.handlePlayerLeft();
        break;
      case 'back_to_lobby':
        console.log('Returning to room lobby');
        this.game.state = 'LOBBY';
        
        // Hide game over screen
        const gameOverScreen = document.getElementById('game-over-screen');
        if (gameOverScreen) gameOverScreen.classList.add('hidden');
        
        // Hide game HUD
        const gameHudScreen = document.getElementById('game-hud');
        if (gameHudScreen) gameHudScreen.classList.add('hidden');
        
        this.showRoomLobby();
        break;
      default:
        // Execute handlers registered by the game
        if (this.handlers[data.type]) {
          this.handlers[data.type](data);
        }
        break;
    }
  }

  registerHandler(type, callback) {
    this.handlers[type] = callback;
  }

  showRoomLobby() {
    const lobbyOverlay = document.getElementById('online-lobby-overlay');
    if (lobbyOverlay) lobbyOverlay.classList.remove('hidden');

    const statusText = document.getElementById('lobby-status');
    if (statusText) statusText.textContent = `Room: ${this.roomName || 'Online Room'}`;

    const listContainer = document.getElementById('lobbies-list-container');
    if (listContainer) {
      listContainer.innerHTML = `
        <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; min-height: 200px; gap: 16px;">
          <div style="display: flex; justify-content: space-around; align-items: center; width: 100%; background: rgba(0,0,0,0.25); padding: 16px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.08);">
            <div style="text-align: center; flex: 1;">
              <div style="font-size: 0.8rem; color: rgba(255,255,255,0.5); text-transform: uppercase;">Host (Red)</div>
              <div style="font-size: 1.1rem; font-weight: 600; color: #ef4444; margin-top: 4px; word-break: break-all;">${this.p1Name || 'Red Team'}</div>
            </div>
            <div style="font-size: 1.4rem; color: rgba(255,255,255,0.2); padding: 0 10px;">VS</div>
            <div style="text-align: center; flex: 1;">
              <div style="font-size: 0.8rem; color: rgba(255,255,255,0.5); text-transform: uppercase;">Opponent (Blue)</div>
              <div style="font-size: 1.1rem; font-weight: 600; color: #3b82f6; margin-top: 4px; word-break: break-all;">${this.p2Name || 'Blue Team'}</div>
            </div>
          </div>
          <span style="color: #4ade80; font-size: 0.95rem; font-weight: 600;">Opponent Connected! Ready to start.</span>
        </div>`;
    }

    const lobbyControls = document.getElementById('room-lobby-controls');
    if (lobbyControls) lobbyControls.classList.add('hidden');

    if (this.playerNumber === 1) {
      const hostControls = document.getElementById('room-host-controls');
      if (hostControls) hostControls.classList.remove('hidden');
      const guestControls = document.getElementById('room-guest-controls');
      if (guestControls) guestControls.classList.add('hidden');
      const startMatchBtn = document.getElementById('host-start-match-btn');
      if (startMatchBtn) startMatchBtn.classList.remove('hidden');
      
      const wormSelect = document.getElementById('lobby-worm-count-select');
      const mapSelect = document.getElementById('lobby-map-type-select');
      const settings = this.game.settings || { wormsPerTeam: 3, mapType: 'island' };
      if (wormSelect) wormSelect.value = settings.wormsPerTeam;
      if (mapSelect) mapSelect.value = settings.mapType;
    } else {
      const hostControls = document.getElementById('room-host-controls');
      if (hostControls) hostControls.classList.add('hidden');
      const guestControls = document.getElementById('room-guest-controls');
      if (guestControls) guestControls.classList.remove('hidden');
      
      const guestWorms = document.getElementById('guest-worms-display');
      const guestTerrain = document.getElementById('guest-terrain-display');
      const settings = this.game.settings || { wormsPerTeam: 3, mapType: 'island' };
      if (guestWorms) guestWorms.textContent = settings.wormsPerTeam;
      if (guestTerrain) {
        const mapNames = { island: 'Island', cave: 'Cave', canyon: 'Canyon' };
        guestTerrain.textContent = mapNames[settings.mapType] || settings.mapType;
      }
    }
  }
}
