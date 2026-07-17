import { Game } from './client/game.js';

let game = null;

document.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('game-canvas');
  
  // Create game instance
  game = new Game(canvas);
  window.game = game;

  // Setup Game Mode button selection to launch game immediately
  const modeButtons = document.querySelectorAll('.mode-btn');
  modeButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const mode = btn.getAttribute('data-mode');
      const wormCountSelect = document.getElementById('worm-count-select');
      const mapTypeSelect = document.getElementById('map-type-select');
      
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
  });

  // Hook up Main Menu Button
  const mainMenuBtn = document.getElementById('main-menu-btn');
  if (mainMenuBtn) {
    mainMenuBtn.addEventListener('click', () => {
      const wasOnline = game && game.isOnline;
      if (game) {
        if (wasOnline) {
          game.mp.send({ type: 'return_to_lobby' });
        } else {
          document.getElementById('game-over-screen').classList.add('hidden');
          document.getElementById('game-hud').classList.add('hidden');
          game.disconnectOnline();
          game.state = 'LOBBY';
          document.getElementById('start-screen').classList.remove('hidden');
        }
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

  // Hook up Lobby settings changes (Host only)
  const lobbyWormCount = document.getElementById('lobby-worm-count-select');
  const lobbyMapType = document.getElementById('lobby-map-type-select');
  
  const sendLobbySettingsUpdate = () => {
    if (game && game.isOnline) {
      game.mp.send({
        type: 'update_settings',
        wormsPerTeam: parseInt(lobbyWormCount.value, 10),
        mapType: lobbyMapType.value
      });
    }
  };
  
  if (lobbyWormCount) lobbyWormCount.addEventListener('change', sendLobbySettingsUpdate);
  if (lobbyMapType) lobbyMapType.addEventListener('change', sendLobbySettingsUpdate);

  // Hook up Touch Controls toggle settings change
  const touchControlsToggle = document.getElementById('mobile-controls-toggle');
  if (touchControlsToggle) {
    touchControlsToggle.addEventListener('change', () => {
      if (game && game.input) {
        game.input.updateTouchControlsState();
        game.updateHUD();
      }
    });
  }


  // Hook up Disconnect Return Button
  const disconnectBackBtn = document.getElementById('disconnect-back-btn');
  if (disconnectBackBtn) {
    disconnectBackBtn.addEventListener('click', () => {
      document.getElementById('disconnect-overlay').classList.add('hidden');
      
      const wasOnline = game && game.settings && game.settings.mode === 'online';
      if (wasOnline) {
        document.getElementById('online-lobby-overlay').classList.remove('hidden');
        document.getElementById('lobby-status').textContent = 'Connecting to server...';
        game.startOnline(game.settings);
      } else {
        document.getElementById('start-screen').classList.remove('hidden');
        game.state = 'LOBBY';
      }
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
    if (game && game.lastRightMouseDown) {
      const dx = e.clientX - game.lastRightMouseDown.x;
      const dy = e.clientY - game.lastRightMouseDown.y;
      if (Math.hypot(dx, dy) > 5) {
        return;
      }
    }
    if (game) {
      game.toggleWeaponMenu();
    }
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

  // Fullscreen Button toggle
  const btnFullscreen = document.getElementById('btn-fullscreen');
  if (btnFullscreen) {
    const toggleFullscreen = () => {
      const container = document.getElementById('game-container');
      if (!container) return;
      
      if (!document.fullscreenElement) {
        container.requestFullscreen().catch(err => {
          console.error(`Error attempting to enable fullscreen: ${err.message}`);
        });
      } else {
        document.exitFullscreen();
      }
    };
    
    btnFullscreen.addEventListener('click', toggleFullscreen);
    btnFullscreen.addEventListener('touchstart', (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleFullscreen();
    }, { passive: false });
    
    // Also update UI state on fullscreen change (in case of Esc key press)
    document.addEventListener('fullscreenchange', () => {
      if (document.fullscreenElement) {
        document.body.classList.add('fullscreen-active');
      } else {
        document.body.classList.remove('fullscreen-active');
      }
    });
  }

  // Handle Resize

  function resizeCanvas() {
    if (game) {
      game.resize(window.innerWidth, window.innerHeight);
      if (game.input) {
        game.input.updateTouchControlsState();
      }
    }
  }


  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();
});
