import { GameState } from '../common/constants.js';

export class InputManager {
  constructor(game) {
    this.game = game;
    this.setupInputs();
  }

  setupInputs() {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      
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
      // Calculate coordinates relative to canvas internal coordinate system (1600x900)
      const scaleX = this.game.width / rect.width;
      const scaleY = this.game.height / rect.height;
      
      this.game.mouse.x = (e.clientX - rect.left) * scaleX;
      this.game.mouse.y = (e.clientY - rect.top) * scaleY;
      
      // Absolute coordinates in the game map (including camera offset)
      this.game.mouse.canvasX = this.game.mouse.x + this.game.camera.x;
      this.game.mouse.canvasY = this.game.mouse.y + this.game.camera.y;
    });

    this.game.canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) { // Left click
        this.game.mouse.clicked = true;
        this.game.handleMouseClick();
      }
    });
    
    this.game.canvas.addEventListener('mouseup', () => {
      this.game.mouse.clicked = false;
    });
  }
}
