import { GameState } from '../common/constants.js';

export class InputManager {
  constructor(game) {
    this.game = game;
    this.dragStart = { x: 0, y: 0 };
    this.camStart = { x: 0, y: 0 };
    this.isDragging = false;
    this.dragButton = null;
    
    // Mobile Touch interaction state
    this.touchStart = { x: 0, y: 0 };
    this.isTouchDragging = false;
    this.touchSingleTap = false;
    this.touchStartDist = 0;
    this.touchStartZoom = 1.0;
    this.touchStartCenter = { x: 0, y: 0 };
    this.touchControlsActive = false;
    
    this.setupInputs();
    this.setupTouchControls();
    this.setupVirtualControls();
  }

  setupInputs() {
    this.game.canvas.style.cursor = 'default';
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      
      const isMovementKey = ['ArrowLeft', 'KeyA', 'ArrowRight', 'KeyD', 'ArrowUp', 'KeyW', 'ArrowDown', 'KeyS'].includes(e.code) ||
                            ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'a', 'A', 'd', 'D', 'w', 'W', 's', 'S'].includes(e.key);
      if (isMovementKey && (this.game.state === GameState.PLAYING || this.game.state === GameState.RETREAT)) {
        this.game.camera.manual = false;
      }
      
      // If in HANDOVER state, pressing Space or Enter starts the turn!
      if (this.game.state === GameState.HANDOVER) {
        if (e.code === 'Space' || e.key === ' ' || e.key === 'Spacebar' || e.code === 'Enter' || e.key === 'Enter') {
          if (this.game.isOnline && !this.game.isLocalPlayerTurn) return;
          this.game.startTurn();
          e.preventDefault();
          return;
        }
      }

      // If in ACTION state, and active weapon is super_sheep, pressing Space or Enter detonates it!
      if (this.game.state === GameState.ACTION) {
        const weapon = this.game.WEAPONS[this.game.selectedWeaponIndex];
        if (weapon && weapon.id === 'super_sheep') {
          if (e.code === 'Space' || e.key === ' ' || e.key === 'Spacebar' || e.code === 'Enter' || e.key === 'Enter') {
            if (this.game.isOnline && !this.game.isLocalPlayerTurn) return;
            this.game.detonateSheep();
            e.preventDefault();
            return;
          }
        }
      }

      this.game.keys[e.code] = true;
      if (e.key) {
        this.game.keys[e.key] = true;
      }
      
      // Prevent browser scrolling on Arrow keys and Space
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code) ||
          [' ', 'Spacebar', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault();
      }
      
      // Detonate Super Sheep with Space key during ACTION state
      if (this.game.state === GameState.ACTION) {
        if (e.code === 'Space' || e.key === ' ' || e.key === 'Spacebar') {
          if (this.game.isOnline && !this.game.isLocalPlayerTurn) return;
          const hasSheep = this.game.projectiles.some(p => p.type === 'super_sheep' && !p.isDead);
          if (hasSheep) {
            this.game.detonateSheep();
            e.preventDefault();
            return;
          }
        }
      }

      // Change Grenade timer (1-5s) with number keys 1-5
      if (this.game.state === GameState.PLAYING) {
        if (e.key >= '1' && e.key <= '5') {
          if (this.game.isOnline && !this.game.isLocalPlayerTurn) return;
          const activeW = this.game.WEAPONS[this.game.selectedWeaponIndex];
          if (['grenade', 'cluster', 'holy', 'banana'].includes(activeW.id)) {
            this.game.selectedFuseTime = parseInt(e.key, 10);
            this.game.audio.play('beep_tick');
            const timerDisplay = document.getElementById('weapon-timer-display');
            if (timerDisplay) {
              timerDisplay.textContent = `${this.game.selectedFuseTime}s Fuse`;
            }
            if (this.game.isOnline) {
              this.game.mp.send({ type: 'set_fuse', fuse: this.game.selectedFuseTime });
            }
            e.preventDefault();
            return;
          }
        }
      }
      
      // Jump and Backflip hotkeys
      if (this.game.state === GameState.PLAYING || this.game.state === GameState.RETREAT) {
        if (e.code === 'Enter' || e.key === 'Enter') {
          if (this.game.isOnline && !this.game.isLocalPlayerTurn) return;
          if (this.game.activeWorm && this.game.activeWorm.rope && this.game.activeWorm.rope.attached) {
            this.game.activeWorm.detachRope();
          } else {
            this.game.activeWorm.jump(false); // Normal jump forwards
            if (this.game.isOnline) {
              this.game.mp.send({ type: 'jump', isBackflip: false });
            }
          }
        }
        if (e.code === 'Backspace' || e.key === 'Backspace') {
          if (this.game.isOnline && !this.game.isLocalPlayerTurn) return;
          if (this.game.activeWorm && this.game.activeWorm.rope && this.game.activeWorm.rope.attached) {
            this.game.activeWorm.detachRope();
          } else {
            this.game.activeWorm.jump(true); // Backflip
            if (this.game.isOnline) {
              this.game.mp.send({ type: 'jump', isBackflip: true });
            }
          }
        }
      }
    });

    window.addEventListener('keyup', (e) => {
      this.game.keys[e.code] = false;
      if (e.key) {
        this.game.keys[e.key] = false;
      }
      
      // If releasing space and charging, fire!
      const isSpace = e.code === 'Space' || e.key === ' ' || e.key === 'Spacebar';
      if (isSpace && this.game.state === GameState.FIRING && this.game.isCharging) {
        if (this.game.isOnline && !this.game.isLocalPlayerTurn) return;
        this.game.fireActiveWeapon();
      }
    });

    // Reset keys state and charging state on window blur (switching tabs) to prevent stuck input
    window.addEventListener('blur', () => {
      this.game.keys = {};
      this.dragButton = null;
      this.isDragging = false;
      this.game.canvas.style.cursor = 'default';
      if (this.game.state === GameState.FIRING) {
        this.game.state = GameState.PLAYING;
        this.game.isCharging = false;
        this.game.chargePower = 0;
        const chargeBar = document.getElementById('charge-bar');
        if (chargeBar) chargeBar.style.width = '0%';
      }
    });

    // Reset loop baseline timer when returning to the tab to prevent large dt simulation spikes
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        this.game.lastTime = performance.now();
      }
    });

    // Track mouse coordinates over the canvas
    this.game.canvas.addEventListener('mousemove', (e) => {
      const rect = this.game.canvas.getBoundingClientRect();
      const scaleX = this.game.canvas.width / rect.width;
      const scaleY = this.game.canvas.height / rect.height;
      
      const mouseX = (e.clientX - rect.left) * scaleX;
      const mouseY = (e.clientY - rect.top) * scaleY;
      
      this.game.mouse.x = mouseX;
      this.game.mouse.y = mouseY;
      
      // Absolute coordinates in the game map (including camera offset & zoom)
      this.game.mouse.canvasX = (mouseX / this.game.camera.zoom) + this.game.camera.x;
      this.game.mouse.canvasY = (mouseY / this.game.camera.zoom) + this.game.camera.y;

      // Handle Panning if dragging
      if (this.dragButton !== null) {
        const dx = e.clientX - this.dragStart.x;
        const dy = e.clientY - this.dragStart.y;
        
        if (this.isDragging || Math.hypot(dx, dy) > 5) {
          const activeW = this.game.WEAPONS[this.game.selectedWeaponIndex];
          const isAirstrike = activeW && activeW.id === 'airstrike';
          
          // Pan on middle (1), right (2), or left (0) when not targeting an airstrike
          const canPan = this.dragButton === 1 || this.dragButton === 2 || (this.dragButton === 0 && !isAirstrike);
          
          if (canPan) {
            this.isDragging = true;
            this.game.canvas.style.cursor = 'grabbing';
            this.game.camera.manual = true;
            
            this.game.camera.x = this.camStart.x - dx / this.game.camera.zoom;
            this.game.camera.y = this.camStart.y - dy / this.game.camera.zoom;
            
            // Constrain camera bounds
            this.game.camera.x = Math.max(0, Math.min(this.game.camera.x, this.game.width - this.game.canvas.width / this.game.camera.zoom));
            this.game.camera.y = Math.max(0, Math.min(this.game.camera.y, this.game.height - this.game.canvas.height / this.game.camera.zoom));
            
            if (this.game.canvas.width / this.game.camera.zoom > this.game.width) {
              this.game.camera.x = (this.game.width - this.game.canvas.width / this.game.camera.zoom) / 2;
            }
            if (this.game.canvas.height / this.game.camera.zoom > this.game.height) {
              this.game.camera.y = (this.game.height - this.game.canvas.height / this.game.camera.zoom) / 2;
            }
            
            // Re-update absolute coordinates
            this.game.mouse.canvasX = (mouseX / this.game.camera.zoom) + this.game.camera.x;
            this.game.mouse.canvasY = (mouseY / this.game.camera.zoom) + this.game.camera.y;
          }
        }
      }
    });

    this.game.canvas.addEventListener('mousedown', (e) => {
      if (e.button === 1) {
        e.preventDefault();
      }
      
      this.dragStart.x = e.clientX;
      this.dragStart.y = e.clientY;
      this.camStart.x = this.game.camera.x;
      this.camStart.y = this.game.camera.y;
      this.isDragging = false;
      this.dragButton = e.button;
      
      if (e.button === 0) { // Left click
        this.game.mouse.clicked = true;
      }
      if (e.button === 2) { // Right click
        this.game.lastRightMouseDown = { x: e.clientX, y: e.clientY };
      }
    });
    
    this.game.canvas.addEventListener('mouseup', (e) => {
      if (e.button === 0) {
        this.game.mouse.clicked = false;
        if (this.dragButton === 0) {
          if (!this.isDragging) {
            this.game.handleMouseClick();
          }
        }
      }
      
      if (e.button === this.dragButton) {
        this.dragButton = null;
        this.isDragging = false;
        this.game.canvas.style.cursor = 'default';
      }
    });

    this.game.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      
      const rect = this.game.canvas.getBoundingClientRect();
      const scaleX = this.game.canvas.width / rect.width;
      const scaleY = this.game.canvas.height / rect.height;
      const mouseX = (e.clientX - rect.left) * scaleX;
      const mouseY = (e.clientY - rect.top) * scaleY;
      
      const zoomOld = this.game.camera.zoom;
      const zoomFactor = 1.1;
      let zoomNew = zoomOld;
      
      if (e.deltaY < 0) {
        zoomNew = Math.min(2.5, zoomOld * zoomFactor);
      } else {
        zoomNew = Math.max(0.4, zoomOld / zoomFactor);
      }
      
      if (zoomNew !== zoomOld) {
        this.game.camera.x += mouseX * (1 / zoomOld - 1 / zoomNew);
        this.game.camera.y += mouseY * (1 / zoomOld - 1 / zoomNew);
        this.game.camera.zoom = zoomNew;
        this.game.camera.manual = true;
        
        this.game.camera.x = Math.max(0, Math.min(this.game.camera.x, this.game.width - this.game.canvas.width / zoomNew));
        this.game.camera.y = Math.max(0, Math.min(this.game.camera.y, this.game.height - this.game.canvas.height / zoomNew));
        
        if (this.game.canvas.width / zoomNew > this.game.width) {
          this.game.camera.x = (this.game.width - this.game.canvas.width / zoomNew) / 2;
        }
        if (this.game.canvas.height / zoomNew > this.game.height) {
          this.game.camera.y = (this.game.height - this.game.canvas.height / zoomNew) / 2;
        }
        
        this.game.mouse.canvasX = (mouseX / zoomNew) + this.game.camera.x;
        this.game.mouse.canvasY = (mouseY / zoomNew) + this.game.camera.y;
      }
    }, { passive: false });
  }

  // --- Mobile Touch Gestures ---
  setupTouchControls() {
    this.game.canvas.addEventListener('touchstart', (e) => {
      if (e.touches.length === 1) {
        this.touchStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        this.camStart = { x: this.game.camera.x, y: this.game.camera.y };
        this.isTouchDragging = true;
        this.touchSingleTap = true;
      } else if (e.touches.length === 2) {
        this.isTouchDragging = false;
        this.touchSingleTap = false;
        
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        this.touchStartDist = Math.hypot(dx, dy);
        this.touchStartZoom = this.game.camera.zoom;
        this.touchStartCenter = {
          x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
          y: (e.touches[0].clientY + e.touches[1].clientY) / 2
        };
      }
    }, { passive: true });

    this.game.canvas.addEventListener('touchmove', (e) => {
      if (e.touches.length === 1 && this.isTouchDragging) {
        const dx = e.touches[0].clientX - this.touchStart.x;
        const dy = e.touches[0].clientY - this.touchStart.y;
        
        // Exceed a threshold to be considered a drag instead of a tap
        if (Math.hypot(dx, dy) > 8) {
          this.touchSingleTap = false;
          
          this.game.camera.manual = true;
          this.game.camera.x = this.camStart.x - dx / this.game.camera.zoom;
          this.game.camera.y = this.camStart.y - dy / this.game.camera.zoom;
          
          // Keep viewport bounds
          this.game.camera.x = Math.max(0, Math.min(this.game.camera.x, this.game.width - this.game.canvas.width / this.game.camera.zoom));
          this.game.camera.y = Math.max(0, Math.min(this.game.camera.y, this.game.height - this.game.canvas.height / this.game.camera.zoom));
          
          if (this.game.canvas.width / this.game.camera.zoom > this.game.width) {
            this.game.camera.x = (this.game.width - this.game.canvas.width / this.game.camera.zoom) / 2;
          }
          if (this.game.canvas.height / this.game.camera.zoom > this.game.height) {
            this.game.camera.y = (this.game.height - this.game.canvas.height / this.game.camera.zoom) / 2;
          }
        }
      } else if (e.touches.length === 2 && this.touchStartDist > 0) {
        e.preventDefault(); // Stop mobile browser zoom
        
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const dist = Math.hypot(dx, dy);
        
        if (dist > 5) {
          let zoomNew = this.touchStartZoom * (dist / this.touchStartDist);
          zoomNew = Math.max(0.4, Math.min(2.5, zoomNew));
          
          const zoomOld = this.game.camera.zoom;
          if (zoomNew !== zoomOld) {
            const rect = this.game.canvas.getBoundingClientRect();
            const scaleX = this.game.canvas.width / rect.width;
            const scaleY = this.game.canvas.height / rect.height;
            const mouseX = (this.touchStartCenter.x - rect.left) * scaleX;
            const mouseY = (this.touchStartCenter.y - rect.top) * scaleY;
            
            this.game.camera.x += mouseX * (1 / zoomOld - 1 / zoomNew);
            this.game.camera.y += mouseY * (1 / zoomOld - 1 / zoomNew);
            this.game.camera.zoom = zoomNew;
            this.game.camera.manual = true;
            
            this.game.camera.x = Math.max(0, Math.min(this.game.camera.x, this.game.width - this.game.canvas.width / zoomNew));
            this.game.camera.y = Math.max(0, Math.min(this.game.camera.y, this.game.height - this.game.canvas.height / zoomNew));
            
            if (this.game.canvas.width / zoomNew > this.game.width) {
              this.game.camera.x = (this.game.width - this.game.canvas.width / zoomNew) / 2;
            }
            if (this.game.canvas.height / zoomNew > this.game.height) {
              this.game.camera.y = (this.game.height - this.game.canvas.height / zoomNew) / 2;
            }
          }
        }
      }
    }, { passive: false });

    this.game.canvas.addEventListener('touchend', (e) => {
      if (this.touchSingleTap && this.isTouchDragging) {
        // Compute click coordinates
        const rect = this.game.canvas.getBoundingClientRect();
        const scaleX = this.game.canvas.width / rect.width;
        const scaleY = this.game.canvas.height / rect.height;
        const clientX = e.changedTouches[0].clientX;
        const clientY = e.changedTouches[0].clientY;
        const mouseX = (clientX - rect.left) * scaleX;
        const mouseY = (clientY - rect.top) * scaleY;
        
        this.game.mouse.x = mouseX;
        this.game.mouse.y = mouseY;
        this.game.mouse.canvasX = (mouseX / this.game.camera.zoom) + this.game.camera.x;
        this.game.mouse.canvasY = (mouseY / this.game.camera.zoom) + this.game.camera.y;
        
        this.game.handleMouseClick();
      }
      
      this.isTouchDragging = false;
      this.touchStartDist = 0;
    }, { passive: true });

    // Enable touch controls automatically on the first touch gesture anywhere
    window.addEventListener('touchstart', () => {
      const toggleSelect = document.getElementById('mobile-controls-toggle');
      if (toggleSelect && toggleSelect.value === 'auto' && !this.touchControlsActive) {
        this.touchControlsActive = true;
        document.body.classList.add('touch-controls-active');
        this.game.updateHUD();
      }
    }, { once: true, passive: true });
  }

  // --- Mobile Virtual Buttons ---
  setupVirtualControls() {
    // Helper to map virtual element events to game key inputs
    const bindVirtualKey = (elementId, keyCode) => {
      const el = document.getElementById(elementId);
      if (!el) return;
      
      const press = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (this.game.isOnline && !this.game.isLocalPlayerTurn) return;
        this.game.keys[keyCode] = true;
        this.game.camera.manual = false;
      };
      
      const release = (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.game.keys[keyCode] = false;
      };
      
      el.addEventListener('touchstart', press, { passive: false });
      el.addEventListener('touchend', release, { passive: false });
      el.addEventListener('touchcancel', release, { passive: false });
      
      // PC debugging support
      el.addEventListener('mousedown', press);
      el.addEventListener('mouseup', release);
      el.addEventListener('mouseleave', release);
    };

    bindVirtualKey('btn-dpad-left', 'ArrowLeft');
    bindVirtualKey('btn-dpad-right', 'ArrowRight');
    bindVirtualKey('btn-dpad-up', 'ArrowUp');
    bindVirtualKey('btn-dpad-down', 'ArrowDown');

    // Jump / Backflip bindings
    const bindJump = (elementId, isBackflip) => {
      const el = document.getElementById(elementId);
      if (!el) return;
      
      const triggerJump = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (this.game.state !== GameState.PLAYING && this.game.state !== GameState.RETREAT) return;
        if (this.game.isOnline && !this.game.isLocalPlayerTurn) return;
        
        if (this.game.activeWorm && this.game.activeWorm.rope && this.game.activeWorm.rope.attached) {
          this.game.activeWorm.detachRope();
          return;
        }

        this.game.activeWorm.jump(isBackflip);
        if (this.game.isOnline) {
          this.game.mp.send({ type: 'jump', isBackflip });
        }
      };
      
      el.addEventListener('touchstart', triggerJump, { passive: false });
      el.addEventListener('mousedown', triggerJump);
    };
    
    bindJump('btn-mobile-jump', false);
    bindJump('btn-mobile-backflip', true);

    // Fire button bindings (with holding/charging logic)
    const fireBtn = document.getElementById('btn-mobile-fire');
    if (fireBtn) {
      const pressFire = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (this.game.isOnline && !this.game.isLocalPlayerTurn) return;
        
        const weapon = this.game.WEAPONS[this.game.selectedWeaponIndex];
        
        // Detonate Super Sheep if flying
        if (this.game.state === GameState.ACTION && weapon && weapon.id === 'super_sheep') {
          this.game.detonateSheep();
          return;
        }
        
        if (this.game.state !== GameState.PLAYING) return;
        if (weapon.id === 'airstrike') return; // Targeted on canvas click
        
        if (weapon.id === 'ninja_rope') {
          this.game.fireActiveWeapon();
          return;
        }

        this.game.keys['Space'] = true;
        this.game.state = GameState.FIRING;
        this.game.isCharging = true;
        this.game.chargePower = 0;
        if (this.game.isOnline) {
          this.game.mp.send({ type: 'start_charge' });
        }
      };
      
      const releaseFire = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!this.game.keys['Space']) return;
        
        this.game.keys['Space'] = false;
        if (this.game.state === GameState.FIRING && this.game.isCharging) {
          if (this.game.isOnline && !this.game.isLocalPlayerTurn) return;
          this.game.fireActiveWeapon();
        }
      };
      
      fireBtn.addEventListener('touchstart', pressFire, { passive: false });
      fireBtn.addEventListener('touchend', releaseFire, { passive: false });
      fireBtn.addEventListener('touchcancel', releaseFire, { passive: false });
      
      fireBtn.addEventListener('mousedown', pressFire);
      fireBtn.addEventListener('mouseup', releaseFire);
      fireBtn.addEventListener('mouseleave', releaseFire);
    }

    // Weapon drawer button
    const weaponBtn = document.getElementById('btn-mobile-weapon');
    if (weaponBtn) {
      const toggleWep = (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.game.toggleWeaponMenu();
      };
      weaponBtn.addEventListener('touchstart', toggleWep, { passive: false });
      weaponBtn.addEventListener('mousedown', toggleWep);
    }

    // Fuse duration cycling
    const fuseBtn = document.getElementById('btn-mobile-fuse');
    if (fuseBtn) {
      const cycleFuse = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (this.game.state !== GameState.PLAYING) return;
        if (this.game.isOnline && !this.game.isLocalPlayerTurn) return;
        
        const activeW = this.game.WEAPONS[this.game.selectedWeaponIndex];
        if (['grenade', 'cluster', 'holy'].includes(activeW.id)) {
          let nextFuse = (this.game.selectedFuseTime % 5) + 1;
          this.game.selectedFuseTime = nextFuse;
          this.game.audio.play('beep_tick');
          
          const timerDisplay = document.getElementById('weapon-timer-display');
          if (timerDisplay) {
            timerDisplay.textContent = `${this.game.selectedFuseTime}s Fuse`;
          }
          
          fuseBtn.textContent = `⏱️ ${nextFuse}s`;
          
          if (this.game.isOnline) {
            this.game.mp.send({ type: 'set_fuse', fuse: this.game.selectedFuseTime });
          }
        }
      };
      fuseBtn.addEventListener('touchstart', cycleFuse, { passive: false });
      fuseBtn.addEventListener('mousedown', cycleFuse);
    }
  }

  updateTouchControlsState() {
    const toggleSelect = document.getElementById('mobile-controls-toggle');
    const setting = toggleSelect ? toggleSelect.value : 'auto';
    
    let active = false;
    if (setting === 'on') {
      active = true;
    } else if (setting === 'off') {
      active = false;
    } else {
      // Auto detect touch layout
      const isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
      const isSmall = window.innerWidth <= 1024;
      active = isTouch && isSmall;
    }
    
    this.touchControlsActive = active;
    
    if (active) {
      document.body.classList.add('touch-controls-active');
    } else {
      document.body.classList.remove('touch-controls-active');
      // Release virtual key holds
      ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].forEach(k => {
        this.game.keys[k] = false;
      });
    }
  }
}

