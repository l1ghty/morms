import { Game } from './client/game.js';
import { MapEditor } from './client/map_editor.js';
import { CustomMapManager } from './common/custom_map_manager.js';

let game = null;

document.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('game-canvas');
  
  // Create game instance
  game = new Game(canvas);
  window.game = game;

  // Populate custom maps in selects
  game.ui.populateMapSelects();

  // Instantiate Map Editor
  const mapEditor = new MapEditor(game);
  mapEditor.init();
  window.mapEditor = mapEditor;

  // Mode buttons selector
  const modeButtons = document.querySelectorAll('.mode-btn[data-mode]');
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

  // Hook up Main Menu Button (Game Over Screen)
  const mainMenuBtn = document.getElementById('main-menu-btn');
  if (mainMenuBtn) {
    mainMenuBtn.addEventListener('click', () => {
      if (game) {
        game.returnToMainMenu(true);
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
      const mapType = lobbyMapType.value;
      let customMapData = null;
      if (mapType && typeof mapType === 'string' && mapType.startsWith('custom:')) {
        customMapData = CustomMapManager.getMapById(mapType);
      }
      game.mp.send({
        type: 'update_settings',
        wormsPerTeam: parseInt(lobbyWormCount.value, 10),
        mapType: mapType,
        customMapData: customMapData
      });
    }
  };
  
  if (lobbyWormCount) lobbyWormCount.addEventListener('change', sendLobbySettingsUpdate);
  if (lobbyMapType) {
    lobbyMapType.addEventListener('change', () => {
      sendLobbySettingsUpdate();
      if (game && game.ui) game.ui.updateDeleteMapButtonsVisibility();
    });
  }

  const mapTypeSelect = document.getElementById('map-type-select');
  if (mapTypeSelect) {
    mapTypeSelect.addEventListener('change', () => {
      if (game && game.ui) game.ui.updateDeleteMapButtonsVisibility();
    });
  }

  // Delete Map button listeners on Main Menu & Lobby
  ['delete-selected-map-btn', 'delete-lobby-map-btn'].forEach(btnId => {
    const deleteBtn = document.getElementById(btnId);
    if (!deleteBtn) return;
    deleteBtn.addEventListener('click', () => {
      const selectId = btnId === 'delete-selected-map-btn' ? 'map-type-select' : 'lobby-map-type-select';
      const select = document.getElementById(selectId);
      if (!select) return;
      
      const mapId = select.value;
      const mapObj = CustomMapManager.getMapById(mapId);
      if (!mapObj) return;

      if (confirm(`Are you sure you want to remove map "${mapObj.name}"?`)) {
        CustomMapManager.deleteMap(mapId);
        if (game && game.ui) game.ui.populateMapSelects();
        if (window.mapEditor) window.mapEditor.populateSavedMapsDropdown();
        
        select.value = 'island';
        if (selectId === 'lobby-map-type-select') {
          sendLobbySettingsUpdate();
        }
        if (game && game.ui) game.ui.updateDeleteMapButtonsVisibility();
      }
    });
  });

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

  // Map Editor Event Listeners
  const openMapEditorBtn = document.getElementById('open-map-editor-btn');
  if (openMapEditorBtn) {
    openMapEditorBtn.addEventListener('click', () => {
      document.getElementById('start-screen').classList.add('hidden');
      document.getElementById('map-editor-screen').classList.remove('hidden');
      mapEditor.populateSavedMapsDropdown();
      mapEditor.resizeEditor();
      mapEditor.render();
    });
  }

  const editorLoadMapSelect = document.getElementById('editor-load-map-select');
  if (editorLoadMapSelect) {
    editorLoadMapSelect.addEventListener('change', () => {
      const selectedId = editorLoadMapSelect.value;
      if (selectedId) {
        const mapData = CustomMapManager.getMapById(selectedId);
        if (mapData) {
          mapEditor.loadMapData(mapData);
        }
      }
    });
  }

  const editorNewBtn = document.getElementById('editor-new-btn');
  if (editorNewBtn) {
    editorNewBtn.addEventListener('click', () => {
      mapEditor.newMap();
    });
  }

  const editorDeleteBtn = document.getElementById('editor-delete-btn');
  if (editorDeleteBtn) {
    editorDeleteBtn.addEventListener('click', () => {
      if (confirm(`Are you sure you want to delete map "${mapEditor.mapName}"?`)) {
        mapEditor.deleteCurrentMap();
        game.ui.populateMapSelects();
        alert('Map deleted.');
      }
    });
  }

  const editorBackBtn = document.getElementById('editor-back-btn');
  if (editorBackBtn) {
    editorBackBtn.addEventListener('click', () => {
      document.getElementById('map-editor-screen').classList.add('hidden');
      document.getElementById('start-screen').classList.remove('hidden');
    });
  }

  const toolBtns = document.querySelectorAll('.editor-tool-btn[data-tool]');
  toolBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      toolBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      mapEditor.currentTool = btn.getAttribute('data-tool');
    });
  });

  const sizeBtns = document.querySelectorAll('.brush-size-btn[data-size]');
  sizeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      sizeBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      mapEditor.brushSize = parseInt(btn.getAttribute('data-size'), 10);
    });
  });

  const templateSelect = document.getElementById('editor-template-select');
  if (templateSelect) {
    templateSelect.addEventListener('change', () => {
      mapEditor.initTemplate(templateSelect.value);
    });
  }

  const editorResetBtn = document.getElementById('editor-reset-btn');
  if (editorResetBtn) {
    editorResetBtn.addEventListener('click', () => {
      mapEditor.initTemplate(mapEditor.baseType);
    });
  }

  const editorSaveBtn = document.getElementById('editor-save-btn');
  if (editorSaveBtn) {
    editorSaveBtn.addEventListener('click', () => {
      const saved = mapEditor.saveMap();
      game.ui.populateMapSelects();
      const mapSelect = document.getElementById('map-type-select');
      if (mapSelect) mapSelect.value = saved.id;
      alert(`Map "${saved.name}" saved successfully!`);
    });
  }

  const editorExportBtn = document.getElementById('editor-export-btn');
  if (editorExportBtn) {
    editorExportBtn.addEventListener('click', () => {
      mapEditor.exportJSON();
    });
  }

  const editorImportInput = document.getElementById('editor-import-input');
  if (editorImportInput) {
    editorImportInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        mapEditor.importJSON(e.target.files[0]);
      }
    });
  }

  const editorPlayBtn = document.getElementById('editor-play-btn');
  if (editorPlayBtn) {
    editorPlayBtn.addEventListener('click', () => {
      const savedMap = mapEditor.saveMap();
      game.ui.populateMapSelects();
      document.getElementById('map-editor-screen').classList.add('hidden');
      document.getElementById('game-hud').classList.remove('hidden');
      
      const wormCountSelect = document.getElementById('worm-count-select');
      const wormsPerTeam = wormCountSelect ? parseInt(wormCountSelect.value, 10) : 3;
      
      game.start({
        wormsPerTeam: wormsPerTeam,
        mapType: savedMap.id,
        mode: 'local',
        launchedFromEditor: true
      });
    });
  }

  // Hook up In-Game Menu & Pause controls
  const ingameMenuBtn = document.getElementById('ingame-menu-btn');
  if (ingameMenuBtn) {
    ingameMenuBtn.addEventListener('click', () => {
      game.togglePauseMenu();
    });
  }

  const pauseResumeBtn = document.getElementById('pause-resume-btn');
  if (pauseResumeBtn) {
    pauseResumeBtn.addEventListener('click', () => {
      game.togglePauseMenu(false);
    });
  }

  const pauseEditorBtn = document.getElementById('pause-editor-btn');
  if (pauseEditorBtn) {
    pauseEditorBtn.addEventListener('click', () => {
      game.returnToEditor();
    });
  }

  const pauseMainMenuBtn = document.getElementById('pause-main-menu-btn');
  if (pauseMainMenuBtn) {
    pauseMainMenuBtn.addEventListener('click', () => {
      game.returnToMainMenu();
    });
  }

  const gameOverEditorBtn = document.getElementById('game-over-editor-btn');
  if (gameOverEditorBtn) {
    gameOverEditorBtn.addEventListener('click', () => {
      game.returnToEditor(true);
    });
  }

  const handoverExitBtn = document.getElementById('handover-exit-btn');
  if (handoverExitBtn) {
    handoverExitBtn.addEventListener('click', () => {
      if (game && game.launchedFromEditor) {
        game.returnToEditor();
      } else if (game) {
        game.returnToMainMenu();
      }
    });
  }

  // Handle keyboard inputs for weapon selection & Escape key for Pause Menu
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const isEditorOpen = !document.getElementById('map-editor-screen').classList.contains('hidden');
      const isStartOpen = !document.getElementById('start-screen').classList.contains('hidden');
      if (!isEditorOpen && !isStartOpen) {
        game.togglePauseMenu();
        e.preventDefault();
      }
    }
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
  const warningExitFSBtn = document.getElementById('warning-exit-fullscreen-btn');

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
  }

  if (warningExitFSBtn) {
    const exitFullscreen = (e) => {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(err => {
          console.error(`Error exiting fullscreen: ${err.message}`);
        });
      }
    };
    warningExitFSBtn.addEventListener('click', exitFullscreen);
    warningExitFSBtn.addEventListener('touchstart', exitFullscreen, { passive: false });
  }

  document.addEventListener('fullscreenchange', () => {
    const warningBtn = document.getElementById('warning-exit-fullscreen-btn');
    if (document.fullscreenElement) {
      document.body.classList.add('fullscreen-active');
      if (warningBtn) warningBtn.classList.remove('hidden');
    } else {
      document.body.classList.remove('fullscreen-active');
      if (warningBtn) warningBtn.classList.add('hidden');
    }
  });

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
