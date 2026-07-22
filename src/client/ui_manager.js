import { GameState } from '../common/constants.js';

export class UIManager {
  constructor(game) {
    this.game = game;
  }

  // Populate HTML weapon grid
  populateWeaponMenu() {
    const grid = document.getElementById('weapon-grid');
    if (!grid) return;
    grid.innerHTML = '';
    
    this.game.WEAPONS.forEach((weapon, index) => {
      const item = document.createElement('div');
      item.className = `weapon-item ${index === this.game.selectedWeaponIndex ? 'active' : ''}`;
      item.id = `weapon-item-${weapon.id}`;
      item.innerHTML = `
        <span class="weapon-icon-procedural">${weapon.icon}</span>
        <span class="weapon-name">${weapon.name}</span>
        <span class="weapon-ammo" id="ammo-${weapon.id}">${weapon.ammo === -1 ? '∞' : 'Qty: ' + weapon.ammo}</span>
      `;
      item.addEventListener('click', () => {
        if (weapon.ammo === 0) {
          this.game.audio.play('beep_error');
          return;
        }
        this.selectWeapon(index);
        this.toggleWeaponMenu(false);
      });
      grid.appendChild(item);
    });
  }

  selectWeapon(index, fromSync = false) {
    if (this.game.isOnline && !this.game.isLocalPlayerTurn && !fromSync) return;
    
    this.game.selectedWeaponIndex = index;
    const activeW = this.game.WEAPONS[index];
    
    if (this.game.isOnline && !fromSync) {
      this.game.mp.send({ type: 'select_weapon', index });
    }
    
    // Update active class in grid
    document.querySelectorAll('.weapon-item').forEach((el, idx) => {
      el.classList.toggle('active', idx === index);
    });
    
    // Update bottom HUD
    const weaponNameDisplay = document.getElementById('active-weapon-name-display');
    const weaponAmmoDisplay = document.getElementById('weapon-ammo-display');
    if (weaponNameDisplay) weaponNameDisplay.textContent = activeW.name;
    if (weaponAmmoDisplay) weaponAmmoDisplay.textContent = activeW.ammo === -1 ? '∞' : `Ammo: ${activeW.ammo}`;
    
    const timerDisplay = document.getElementById('weapon-timer-display');
    if (timerDisplay) {
      if (['grenade', 'cluster', 'holy', 'banana'].includes(activeW.id)) {
        timerDisplay.classList.remove('hidden');
        timerDisplay.textContent = `${this.game.selectedFuseTime}s Fuse`;
      } else {
        timerDisplay.classList.add('hidden');
      }
    }
    
    this.game.audio.play('weapon_select');
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
    if (this.game.state !== GameState.PLAYING && this.game.state !== GameState.START_TURN) return;
    
    const overlay = document.getElementById('weapon-select-overlay');
    if (!overlay) return;
    if (forceState !== undefined) {
      if (forceState) overlay.classList.remove('hidden');
      else overlay.classList.add('hidden');
    } else {
      overlay.classList.toggle('hidden');
    }
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

  updateRoomsList(data) {
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
          <span style="display: block; font-size: 0.8rem; color: rgba(255,255,255,0.5);">${room.mapType.toUpperCase()} • ${room.wormsPerTeam} Morms</span>
        </div>
        <button class="btn btn-primary join-room-btn" data-room-id="${room.id}" style="padding: 6px 14px; font-size: 0.85rem; border-radius: 4px;">Join</button>
      `;
      
      const joinBtn = item.querySelector('.join-room-btn');
      joinBtn.addEventListener('click', () => {
        const statusText = document.getElementById('lobby-status');
        if (statusText) statusText.textContent = `Joining ${room.name}...`;
        
        const playerNameInput = document.getElementById('player-name-input');
        const playerName = playerNameInput ? playerNameInput.value.trim() : 'Blue Team';
        
        this.game.mp.joinRoom(room.id, playerName);
      });
      
      listElement.appendChild(item);
    });
  }

  updateHUD() {
    const team = this.game.teams[this.game.activeTeamIndex];

    // 1. Update Active Worm Panel
    if (this.game.activeWorm && team) {
      const activeWormPanel = document.querySelector('.active-worm-panel');
      if (activeWormPanel) {
        activeWormPanel.className = `hud-panel active-worm-panel ${team.id}-team`;
      }
      const activeTeamName = document.getElementById('active-team-name');
      if (activeTeamName) activeTeamName.textContent = team.name;
      const activeWormName = document.getElementById('active-worm-name');
      if (activeWormName) activeWormName.textContent = this.game.activeWorm.name;
      const activeWormHealthText = document.getElementById('active-worm-health-text');
      if (activeWormHealthText) activeWormHealthText.textContent = `${this.game.activeWorm.health} HP`;
      const activeWormHealthBar = document.getElementById('active-worm-health-bar');
      if (activeWormHealthBar) activeWormHealthBar.style.width = `${this.game.activeWorm.health}%`;
    }

    // 2. Update Turn Timer
    const turnTimerEl = document.getElementById('turn-timer');
    if (turnTimerEl) {
      if (this.game.state === GameState.RETREAT) {
        turnTimerEl.textContent = `${this.game.retreatTimer}s RETREAT`;
      } else if (this.game.state === GameState.CLEANUP) {
        turnTimerEl.textContent = 'Turn End';
      } else {
        turnTimerEl.textContent = this.game.turnTimer;
      }
    }

    // 3. Update Wind HUD
    const arrow = document.getElementById('wind-direction-arrow');
    const bar = document.getElementById('wind-bar');
    const windText = document.getElementById('wind-text');
    if (arrow && bar && windText) {
      if (this.game.wind.strength === 0) {
        arrow.style.transform = 'rotate(0deg)';
        bar.style.width = '0%';
        windText.textContent = 'Calm (0 km/h)';
      } else {
        const rot = this.game.wind.strength > 0 ? 0 : 180;
        arrow.style.transform = `rotate(${rot}deg)`;
        const pct = Math.abs(this.game.wind.strength) / 0.15 * 100;
        bar.style.width = `${pct}%`;
        windText.textContent = `${Math.round(Math.abs(this.game.wind.strength) * 200)} km/h`;
      }
    }

    // 4. Update Charge HUD
    const chargeBar = document.getElementById('charge-bar');
    if (chargeBar) {
      chargeBar.style.width = `${this.game.chargePower}%`;
    }

    // 5. Update Teams HP HUD
    const container = document.getElementById('teams-hp-container');
    if (container) {
      container.innerHTML = '';
      this.game.teams.forEach(t => {
        const teamWorms = this.game.worms.filter(w => w.teamName === t.name);
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

    // 6. Update Turn Banner & dim HUD if it's the opponent's turn in multiplayer
    const turnBanner = document.getElementById('turn-notification-banner');
    const hudContainer = document.getElementById('game-hud');
    if (turnBanner) {
      if (this.game.isOnline) {
        turnBanner.classList.remove('hidden');
        if (this.game.isLocalPlayerTurn) {
          turnBanner.textContent = 'Your Turn';
          turnBanner.className = 'turn-notification-banner your-turn';
          if (hudContainer) hudContainer.classList.remove('opponent-turn-active');
        } else {
          turnBanner.textContent = "Opponent's Turn";
          turnBanner.className = 'turn-notification-banner opponent-turn';
          if (hudContainer) hudContainer.classList.add('opponent-turn-active');
        }
      } else {
        turnBanner.classList.add('hidden');
        if (hudContainer) hudContainer.classList.remove('opponent-turn-active');
      }
    }

    // 7. Update Mobile Virtual Controls overlay visibility
    const mobileControls = document.getElementById('mobile-controls');
    if (mobileControls) {
      const isMobileActive = this.game.input && this.game.input.touchControlsActive;
      const isPlayState = [GameState.PLAYING, GameState.FIRING, GameState.RETREAT, GameState.ACTION].includes(this.game.state);
      const isMyTurn = this.game.isLocalPlayerTurn;
      
      if (isMobileActive && isPlayState && isMyTurn) {
        mobileControls.classList.remove('hidden');
        
        // Show/hide fuse duration button depending on active weapon capability
        const activeW = this.game.WEAPONS[this.game.selectedWeaponIndex];
        const mobileFuseBtn = document.getElementById('btn-mobile-fuse');
        if (mobileFuseBtn) {
          if (activeW && ['grenade', 'cluster', 'holy'].includes(activeW.id)) {
            mobileFuseBtn.classList.remove('hidden');
            mobileFuseBtn.textContent = `⏱️ ${this.game.selectedFuseTime}s`;
          } else {
            mobileFuseBtn.classList.add('hidden');
          }
        }
      } else {
        mobileControls.classList.add('hidden');
      }
    }


    // 8. Update Portrait Orientation Warning overlay visibility (only in-game)
    const warning = document.getElementById('orientation-warning');
    if (warning) {
      const isLobby = this.game.state === GameState.LOBBY;
      const isPortrait = window.innerHeight > window.innerWidth;
      
      if (!isLobby && isPortrait) {
        warning.classList.remove('hidden');
      } else {
        warning.classList.add('hidden');
      }
    }
  }

  showGameOver(winningTeam) {
    const hud = document.getElementById('game-hud');
    const gameOverScreen = document.getElementById('game-over-screen');
    if (hud) hud.classList.add('hidden');
    if (gameOverScreen) gameOverScreen.classList.remove('hidden');
    
    const victoryTitle = document.getElementById('victory-title');
    const victorySubtitle = document.getElementById('victory-subtitle');
    if (victoryTitle) victoryTitle.textContent = `${winningTeam} Wins!`;
    if (victorySubtitle) victorySubtitle.textContent = `The opposing team has been entirely annihilated!`;
    
    const statTurns = document.getElementById('stat-turns');
    const statDamage = document.getElementById('stat-damage');
    const statDrowns = document.getElementById('stat-drowns');
    if (statTurns) statTurns.textContent = this.game.turnsPlayed;
    if (statDamage) statDamage.textContent = Math.round(this.game.totalDamageDealt);
    if (statDrowns) statDrowns.textContent = this.game.wormsDrowned;
    
    const menuBtn = document.getElementById('main-menu-btn');
    if (menuBtn) {
      menuBtn.textContent = this.game.isOnline ? 'Return to Lobby' : 'Main Menu';
    }
  }

  showHandover(team) {
    const handoverScreen = document.getElementById('handover-screen');
    if (!handoverScreen) return;
    
    const handoverSubtitle = document.getElementById('handover-subtitle');
    const handoverWormName = document.getElementById('handover-worm-name');
    const handoverCard = handoverScreen.querySelector('.menu-card');

    if (handoverSubtitle) handoverSubtitle.textContent = `Get ready, ${team.name}!`;
    if (handoverWormName) {
      if (this.game.isOnline && !this.game.isLocalPlayerTurn) {
        handoverWormName.textContent = `Waiting for opponent's turn...`;
      } else {
        handoverWormName.textContent = `${this.game.activeWorm.name} is up next`;
      }
    }

    const startBtn = document.getElementById('handover-start-btn');
    if (startBtn) {
      if (this.game.isOnline) {
        if (this.game.isLocalPlayerTurn) {
          startBtn.classList.remove('hidden');
          startBtn.textContent = 'Start Turn';
        } else {
          startBtn.classList.add('hidden');
        }
      } else {
        startBtn.classList.remove('hidden');
        startBtn.textContent = 'Start Turn';
      }
      startBtn.classList.remove('confirming');
    }

    if (handoverCard) handoverCard.className = `menu-card glass-panel handover-card ${team.id}-team`;
    handoverScreen.classList.remove('hidden');
  }

  hideHandover() {
    const handoverScreen = document.getElementById('handover-screen');
    if (handoverScreen) handoverScreen.classList.add('hidden');
  }

  showDisconnect() {
    const hud = document.getElementById('game-hud');
    const onlineLobby = document.getElementById('online-lobby-overlay');
    const handover = document.getElementById('handover-screen');
    const disconnect = document.getElementById('disconnect-overlay');
    
    if (hud) hud.classList.add('hidden');
    if (onlineLobby) onlineLobby.classList.add('hidden');
    if (handover) handover.classList.add('hidden');
    if (disconnect) disconnect.classList.remove('hidden');
  }
}
