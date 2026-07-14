import { GameState } from '../common/constants.js';

export class InputManager {
  constructor(game) {
    this.game = game;
    this.dragStart = { x: 0, y: 0 };
    this.camStart = { x: 0, y: 0 };
    this.isDragging = false;
    this.dragButton = null;
    this.setupInputs();
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
      
      // Change Grenade timer (1-5s) with number keys 1-5
      if (this.game.state === GameState.PLAYING) {
        if (e.key >= '1' && e.key <= '5') {
          if (this.game.isOnline && !this.game.isLocalPlayerTurn) return;
          const activeW = this.game.WEAPONS[this.game.selectedWeaponIndex];
          if (['grenade', 'cluster', 'holy'].includes(activeW.id)) {
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
          this.game.activeWorm.jump(false); // Normal jump forwards
          if (this.game.isOnline) {
            this.game.mp.send({ type: 'jump', isBackflip: false });
          }
        }
        if (e.code === 'Backspace' || e.key === 'Backspace') {
          if (this.game.isOnline && !this.game.isLocalPlayerTurn) return;
          this.game.activeWorm.jump(true); // Backflip
          if (this.game.isOnline) {
            this.game.mp.send({ type: 'jump', isBackflip: true });
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
}
