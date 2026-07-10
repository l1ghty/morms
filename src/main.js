import { Game } from './game.js';

let game = null;

document.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('game-canvas');
  
  // Create game instance
  game = new Game(canvas);
  window.game = game;

  // Hook up Start Game Button
  const startGameBtn = document.getElementById('start-game-btn');
  startGameBtn.addEventListener('click', () => {
    const wormCountSelect = document.getElementById('worm-count-select');
    const mapTypeSelect = document.getElementById('map-type-select');
    const gameModeSelect = document.getElementById('game-mode-select');
    
    const mode = gameModeSelect ? gameModeSelect.value : 'local';
    
    const settings = {
      wormsPerTeam: parseInt(wormCountSelect.value, 10),
      mapType: mapTypeSelect.value,
      mode: mode
    };
    
    if (mode === 'online') {
      document.getElementById('start-screen').classList.add('hidden');
      document.getElementById('online-lobby-overlay').classList.remove('hidden');
      document.getElementById('lobby-status').textContent = 'Connecting to server...';
      game.startOnline(settings);
    } else {
      document.getElementById('start-screen').classList.add('hidden');
      document.getElementById('game-hud').classList.remove('hidden');
      game.start(settings);
    }
  });

  // Hook up Main Menu Button
  const mainMenuBtn = document.getElementById('main-menu-btn');
  if (mainMenuBtn) {
    mainMenuBtn.addEventListener('click', () => {
      document.getElementById('game-over-screen').classList.add('hidden');
      document.getElementById('game-hud').classList.add('hidden');
      document.getElementById('start-screen').classList.remove('hidden');
      
      if (game) {
        game.disconnectOnline();
        game.state = 'LOBBY'; // transition back to lobby state
      }
    });
  }

  // Hook up Cancel Matchmaking Button
  const cancelMatchmakingBtn = document.getElementById('cancel-matchmaking-btn');
  if (cancelMatchmakingBtn) {
    cancelMatchmakingBtn.addEventListener('click', () => {
      document.getElementById('online-lobby-overlay').classList.add('hidden');
      document.getElementById('start-screen').classList.remove('hidden');
      game.cancelOnline();
    });
  }

  // Hook up Create Lobby Button
  const createLobbyBtn = document.getElementById('create-lobby-btn');
  if (createLobbyBtn) {
    createLobbyBtn.addEventListener('click', () => {
      document.getElementById('lobby-status').textContent = 'Creating room...';
      game.createOnlineRoom();
    });
  }

  // Hook up Disconnect Return Button
  const disconnectBackBtn = document.getElementById('disconnect-back-btn');
  if (disconnectBackBtn) {
    disconnectBackBtn.addEventListener('click', () => {
      document.getElementById('disconnect-overlay').classList.add('hidden');
      document.getElementById('start-screen').classList.remove('hidden');
      game.state = 'LOBBY';
    });
  }

  // Hook up Host Start Match Button
  const hostStartMatchBtn = document.getElementById('host-start-match-btn');
  if (hostStartMatchBtn) {
    hostStartMatchBtn.addEventListener('click', () => {
      game.hostStartOnlineMatch();
    });
  }

  // Hook up Host Leave Button
  const hostLeaveBtn = document.getElementById('host-leave-btn');
  if (hostLeaveBtn) {
    hostLeaveBtn.addEventListener('click', () => {
      document.getElementById('online-lobby-overlay').classList.add('hidden');
      document.getElementById('start-screen').classList.remove('hidden');
      game.cancelOnline();
    });
  }

  // Hook up Guest Leave Button
  const guestLeaveBtn = document.getElementById('guest-leave-btn');
  if (guestLeaveBtn) {
    guestLeaveBtn.addEventListener('click', () => {
      document.getElementById('online-lobby-overlay').classList.add('hidden');
      document.getElementById('start-screen').classList.remove('hidden');
      game.cancelOnline();
    });
  }

  // Hook up Handover Start Button
  const handoverStartBtn = document.getElementById('handover-start-btn');
  if (handoverStartBtn) {
    handoverStartBtn.addEventListener('click', () => {
      if (game) {
        game.startTurn();
      }
    });
  }

  // Hook up Weapon selector panel triggers
  const weaponHudBtn = document.getElementById('weapon-hud-btn');
  weaponHudBtn.addEventListener('click', () => {
    game.toggleWeaponMenu(true);
  });

  const closeWeaponsBtn = document.getElementById('close-weapons-btn');
  closeWeaponsBtn.addEventListener('click', () => {
    game.toggleWeaponMenu(false);
  });

  // Handle keyboard inputs for weapon selection
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      game.toggleWeaponMenu();
    }
  });

  // Prevent right-click context menu on game container so we can use right click to toggle weapons!
  const container = document.getElementById('game-container');
  container.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    game.toggleWeaponMenu();
  });

  // Debug/Test Controls Panel Event Listeners
  const btnWalkLeft = document.getElementById('btn-walk-left');
  if (btnWalkLeft) {
    btnWalkLeft.addEventListener('click', () => {
      if (game && game.activeWorm && game.activeWorm.health > 0) {
        game.activeWorm.x -= 20;
      }
    });
  }

  const btnWalkRight = document.getElementById('btn-walk-right');
  if (btnWalkRight) {
    btnWalkRight.addEventListener('click', () => {
      if (game && game.activeWorm && game.activeWorm.health > 0) {
        game.activeWorm.x += 20;
      }
    });
  }

  const btnJump = document.getElementById('btn-jump');
  if (btnJump) {
    btnJump.addEventListener('click', () => {
      if (game && game.activeWorm && game.activeWorm.health > 0) {
        game.activeWorm.jump(false);
      }
    });
  }

  const btnBackflip = document.getElementById('btn-backflip');
  if (btnBackflip) {
    btnBackflip.addEventListener('click', () => {
      if (game && game.activeWorm && game.activeWorm.health > 0) {
        game.activeWorm.jump(true);
      }
    });
  }

  const btnDropDamage = document.getElementById('btn-drop-damage');
  if (btnDropDamage) {
    btnDropDamage.addEventListener('click', () => {
      if (game && game.activeWorm && game.activeWorm.health > 0) {
        game.activeWorm.y -= 120;
        game.activeWorm.vy = 8.5;
        game.activeWorm.isFalling = true;
      }
    });
  }

  // Handle Resize
  function resizeCanvas() {
    if (game) {
      game.resize(window.innerWidth, window.innerHeight);
    }
  }

  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();
});
