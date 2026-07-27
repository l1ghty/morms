import { CustomMapManager } from '../common/custom_map_manager.js';
import { Terrain } from './terrain.js';

export class MapEditor {
  constructor(game) {
    this.game = game;
    this.canvas = null;
    this.ctx = null;
    
    this.width = 1600;
    this.height = 900;
    this.waterLevel = 820;
    
    this.mapName = 'My Custom Fortress';
    this.currentMapId = null;
    this.baseType = 'island';
    this.currentTool = 'draw'; // 'draw' | 'carve' | 'platform' | 'crater'
    this.brushSize = 30; // 15, 30, 60, 100
    
    this.additions = [];
    this.carves = [];
    this.platforms = [];
    
    this.isMouseDown = false;
    this.mousePos = { x: 800, y: 450 };
    this.lastActionPos = null;
    
    this.previewTerrain = null;
  }

  init() {
    this.canvas = document.getElementById('editor-canvas');
    if (!this.canvas) return;
    this.canvas.width = this.width;
    this.canvas.height = this.height;
    this.ctx = this.canvas.getContext('2d');
    
    this.setupEventListeners();
    this.initTemplate(this.baseType);
    this.populateSavedMapsDropdown();
    this.resizeEditor();
    
    window.addEventListener('resize', () => this.resizeEditor());
  }

  populateSavedMapsDropdown() {
    const select = document.getElementById('editor-load-map-select');
    if (!select) return;
    const maps = CustomMapManager.getCustomMaps();
    const seenNames = new Set();
    const uniqueMaps = [];
    maps.forEach(m => {
      if (m && m.id && m.name) {
        let mapName = m.name;
        if (seenNames.has(mapName)) {
          const checksum = CustomMapManager.computeChecksum(m);
          mapName = `${mapName} (${checksum})`;
          let counter = 2;
          while (seenNames.has(mapName)) {
            mapName = `${m.name} (${checksum}-${counter})`;
            counter++;
          }
        }
        seenNames.add(mapName);
        uniqueMaps.push({ id: m.id, name: mapName });
      }
    });

    select.innerHTML = `<option value="">-- Load Saved Map --</option>` +
      uniqueMaps.map(m => `<option value="${m.id}" ${m.id === this.currentMapId ? 'selected' : ''}>${m.name}</option>`).join('');
  }

  newMap() {
    this.currentMapId = null;
    this.mapName = 'My Custom Fortress';
    const titleInput = document.getElementById('editor-map-name');
    if (titleInput) titleInput.value = this.mapName;
    const deleteBtn = document.getElementById('editor-delete-btn');
    if (deleteBtn) deleteBtn.classList.add('hidden');
    this.initTemplate('island');
    this.populateSavedMapsDropdown();
  }

  exportCurrentMapObject() {
    const titleInput = document.getElementById('editor-map-name');
    const name = titleInput ? titleInput.value.trim() || 'Custom Map' : this.mapName;
    const mapId = this.currentMapId || `custom:map_${Date.now()}`;
    
    return {
      id: mapId,
      name: name,
      width: this.width,
      height: this.height,
      version: 1,
      baseType: this.baseType,
      additions: JSON.parse(JSON.stringify(this.additions)),
      carves: JSON.parse(JSON.stringify(this.carves)),
      platforms: JSON.parse(JSON.stringify(this.platforms))
    };
  }

  saveMap() {
    const mapObj = this.exportCurrentMapObject();
    const saved = CustomMapManager.saveMap(mapObj);
    this.currentMapId = saved.id;
    this.populateSavedMapsDropdown();
    const deleteBtn = document.getElementById('editor-delete-btn');
    if (deleteBtn && this.currentMapId && this.currentMapId !== 'custom:sample_fortress') {
      deleteBtn.classList.remove('hidden');
    }
    return saved;
  }

  deleteCurrentMap() {
    if (this.currentMapId && this.currentMapId !== 'custom:sample_fortress') {
      CustomMapManager.deleteMap(this.currentMapId);
      this.newMap();
    }
  }

  exportJSON() {
    const mapObj = this.exportCurrentMapObject();
    CustomMapManager.exportMapJSON(mapObj);
  }

  importJSON(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const data = CustomMapManager.parseMapJSON(e.target.result);
      if (data) {
        this.loadMapData(data);
      } else {
        alert('Invalid custom map file.');
      }
    };
    reader.readAsText(file);
  }

  loadMapData(data) {
    if (!data) return;
    this.currentMapId = data.id || null;
    if (data.name) {
      this.mapName = data.name;
      const titleInput = document.getElementById('editor-map-name');
      if (titleInput) titleInput.value = data.name;
    }
    this.baseType = data.baseType || 'island';
    this.additions = data.additions ? JSON.parse(JSON.stringify(data.additions)) : [];
    this.carves = data.carves ? JSON.parse(JSON.stringify(data.carves)) : [];
    this.platforms = data.platforms ? JSON.parse(JSON.stringify(data.platforms)) : [];
    
    const templateSelect = document.getElementById('editor-template-select');
    if (templateSelect) templateSelect.value = this.baseType;
    
    const deleteBtn = document.getElementById('editor-delete-btn');
    if (deleteBtn) {
      if (this.currentMapId && this.currentMapId !== 'custom:sample_fortress') {
        deleteBtn.classList.remove('hidden');
      } else {
        deleteBtn.classList.add('hidden');
      }
    }

    this.populateSavedMapsDropdown();
    this.rebuildTerrain();
  }

  resizeEditor() {
    if (!this.canvas) return;
    const container = document.getElementById('editor-canvas-container');
    if (!container) return;
    
    const availableW = container.clientWidth - 40;
    const availableH = container.clientHeight - 80;
    const aspect = this.width / this.height;
    
    let displayW = availableW;
    let displayH = displayW / aspect;
    if (displayH > availableH) {
      displayH = availableH;
      displayW = displayH * aspect;
    }
    
    this.canvas.style.width = `${Math.max(300, displayW)}px`;
    this.canvas.style.height = `${Math.max(170, displayH)}px`;
  }

  initTemplate(type) {
    this.baseType = type;
    this.additions = [];
    this.carves = [];
    this.platforms = [];
    this.rebuildTerrain();
  }

  rebuildTerrain() {
    if (this.baseType === 'blank') {
      this.previewTerrain = new Terrain(this.width, this.height, 'island');
      // Clear out all initial procedural dirt for a blank sky
      this.previewTerrain.ctx.clearRect(0, 0, this.width, this.height);
      this.previewTerrain.collisionMask.fill(0);
    } else {
      this.previewTerrain = new Terrain(this.width, this.height, this.baseType);
    }
    
    // Apply additions
    this.additions.forEach(add => {
      this.applyAdditionToTerrain(add.x, add.y, add.r);
    });
    
    // Apply platforms
    this.platforms.forEach(plat => {
      this.applyPlatformToTerrain(plat.x, plat.y, plat.w, plat.h);
    });
    
    // Apply carves
    this.carves.forEach(carve => {
      this.previewTerrain.carve(carve.x, carve.y, carve.r);
    });
    
    this.render();
  }

  applyAdditionToTerrain(cx, cy, r) {
    const ctx = this.previewTerrain.ctx;
    ctx.save();
    ctx.fillStyle = this.previewTerrain.getDirtGradient();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    
    // Grass top stroke
    ctx.strokeStyle = '#22c55e';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(cx, cy, r, Math.PI * 1.1, Math.PI * 1.9, false);
    ctx.stroke();
    
    ctx.strokeStyle = '#a3e635';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(cx, cy, r, Math.PI * 1.15, Math.PI * 1.85, false);
    ctx.stroke();
    ctx.restore();
    
    // Update collision mask
    const rSq = r * r;
    const startX = Math.max(0, Math.floor(cx - r));
    const endX = Math.min(this.width - 1, Math.ceil(cx + r));
    const startY = Math.max(0, Math.floor(cy - r));
    const endY = Math.min(this.height - 1, Math.ceil(cy + r));
    
    for (let y = startY; y <= endY; y++) {
      const dy = y - cy;
      const dy2 = dy * dy;
      const rowOffset = y * this.width;
      for (let x = startX; x <= endX; x++) {
        const dx = x - cx;
        if (dx * dx + dy2 <= rSq) {
          this.previewTerrain.collisionMask[rowOffset + x] = 1;
        }
      }
    }
  }

  applyPlatformToTerrain(px, py, w, h) {
    const ctx = this.previewTerrain.ctx;
    ctx.save();
    ctx.fillStyle = '#64748b';
    ctx.fillRect(px - w / 2, py - h / 2, w, h);
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 2;
    ctx.strokeRect(px - w / 2, py - h / 2, w, h);
    ctx.fillStyle = '#22c55e';
    ctx.fillRect(px - w / 2, py - h / 2, w, 4);
    ctx.restore();
    
    // Update collision mask
    const startX = Math.max(0, Math.floor(px - w / 2));
    const endX = Math.min(this.width - 1, Math.ceil(px + w / 2));
    const startY = Math.max(0, Math.floor(py - h / 2));
    const endY = Math.min(this.height - 1, Math.ceil(py + h / 2));
    
    for (let y = startY; y <= endY; y++) {
      const rowOffset = y * this.width;
      for (let x = startX; x <= endX; x++) {
        this.previewTerrain.collisionMask[rowOffset + x] = 1;
      }
    }
  }

  setupEventListeners() {
    if (!this.canvas) return;
    
    const getCanvasCoords = (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      const x = (clientX - rect.left) * (this.width / rect.width);
      const y = (clientY - rect.top) * (this.height / rect.height);
      return { x: Math.max(0, Math.min(this.width, x)), y: Math.max(0, Math.min(this.height, y)) };
    };

    const handleStart = (e) => {
      this.isMouseDown = true;
      this.mousePos = getCanvasCoords(e);
      this.performToolAction(this.mousePos.x, this.mousePos.y);
      this.lastActionPos = { ...this.mousePos };
      this.render();
    };

    const handleMove = (e) => {
      this.mousePos = getCanvasCoords(e);
      if (this.isMouseDown) {
        const dx = this.mousePos.x - (this.lastActionPos ? this.lastActionPos.x : 0);
        const dy = this.mousePos.y - (this.lastActionPos ? this.lastActionPos.y : 0);
        const dist = Math.hypot(dx, dy);
        
        // Perform stroke spacing according to brush size
        const step = Math.max(5, this.brushSize * 0.35);
        if (dist >= step) {
          this.performToolAction(this.mousePos.x, this.mousePos.y);
          this.lastActionPos = { ...this.mousePos };
        }
      }
      this.render();
    };

    const handleEnd = () => {
      this.isMouseDown = false;
      this.lastActionPos = null;
    };

    this.canvas.addEventListener('mousedown', handleStart);
    this.canvas.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleEnd);

    this.canvas.addEventListener('touchstart', (e) => { e.preventDefault(); handleStart(e); }, { passive: false });
    this.canvas.addEventListener('touchmove', (e) => { e.preventDefault(); handleMove(e); }, { passive: false });
    this.canvas.addEventListener('touchend', handleEnd);
  }

  performToolAction(x, y) {
    const r = this.brushSize;
    if (this.currentTool === 'draw') {
      this.additions.push({ x, y, r });
      this.applyAdditionToTerrain(x, y, r);
    } else if (this.currentTool === 'carve') {
      this.carves.push({ x, y, r });
      this.previewTerrain.carve(x, y, r);
    } else if (this.currentTool === 'platform') {
      const w = r * 2.5;
      const h = Math.max(12, r * 0.5);
      this.platforms.push({ x, y, w, h });
      this.applyPlatformToTerrain(x, y, w, h);
    } else if (this.currentTool === 'crater') {
      this.carves.push({ x, y, r: r * 1.5 });
      this.previewTerrain.carve(x, y, r * 1.5);
    }
  }

  exportCurrentMapObject() {
    const titleInput = document.getElementById('editor-map-name');
    const name = titleInput ? titleInput.value.trim() || 'Custom Map' : this.mapName;
    const safeId = `custom:${name.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${Date.now()}`;
    
    return {
      id: safeId,
      name: name,
      width: this.width,
      height: this.height,
      version: 1,
      baseType: this.baseType,
      additions: this.additions,
      carves: this.carves,
      platforms: this.platforms
    };
  }

  saveMap() {
    const mapObj = this.exportCurrentMapObject();
    CustomMapManager.saveMap(mapObj);
    return mapObj;
  }

  exportJSON() {
    const mapObj = this.exportCurrentMapObject();
    CustomMapManager.exportMapJSON(mapObj);
  }

  importJSON(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const data = CustomMapManager.parseMapJSON(e.target.result);
      if (data) {
        this.loadMapData(data);
      } else {
        alert('Invalid custom map file.');
      }
    };
    reader.readAsText(file);
  }

  loadMapData(data) {
    if (data.name) {
      this.mapName = data.name;
      const titleInput = document.getElementById('editor-map-name');
      if (titleInput) titleInput.value = data.name;
    }
    this.baseType = data.baseType || 'island';
    this.additions = data.additions || [];
    this.carves = data.carves || [];
    this.platforms = data.platforms || [];
    
    const templateSelect = document.getElementById('editor-template-select');
    if (templateSelect) templateSelect.value = this.baseType;
    
    this.rebuildTerrain();
  }

  render() {
    if (!this.ctx) return;
    this.ctx.clearRect(0, 0, this.width, this.height);
    
    // Background gradient (matching game canvas)
    const gradient = this.ctx.createLinearGradient(0, 0, 0, this.height);
    gradient.addColorStop(0, '#1e293b');
    gradient.addColorStop(0.5, '#0f172a');
    gradient.addColorStop(1, '#020617');
    this.ctx.fillStyle = gradient;
    this.ctx.fillRect(0, 0, this.width, this.height);
    
    // Draw background clouds
    this.ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
    for (let i = 0; i < 6; i++) {
      const cx = (i * 300) % (this.width + 200) - 100;
      const cy = 100 + Math.sin(i) * 50;
      this.ctx.beginPath();
      this.ctx.arc(cx, cy, 50, 0, Math.PI * 2);
      this.ctx.arc(cx + 40, cy - 10, 45, 0, Math.PI * 2);
      this.ctx.arc(cx - 30, cy + 10, 35, 0, Math.PI * 2);
      this.ctx.fill();
    }
    
    // Render preview terrain canvas
    if (this.previewTerrain) {
      this.previewTerrain.draw(this.ctx);
    }
    
    // Water layer
    this.ctx.fillStyle = 'rgba(14, 116, 144, 0.8)';
    this.ctx.fillRect(0, this.waterLevel, this.width, this.height - this.waterLevel);
    this.ctx.strokeStyle = '#06b6d4';
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();
    this.ctx.moveTo(0, this.waterLevel);
    this.ctx.lineTo(this.width, this.waterLevel);
    this.ctx.stroke();
    
    // Brush Cursor Indicator
    const mx = this.mousePos.x;
    const my = this.mousePos.y;
    const r = this.brushSize;
    
    this.ctx.save();
    if (this.currentTool === 'draw') {
      this.ctx.strokeStyle = '#22c55e';
      this.ctx.fillStyle = 'rgba(34, 197, 94, 0.15)';
      this.ctx.lineWidth = 2;
      this.ctx.beginPath();
      this.ctx.arc(mx, my, r, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.stroke();
    } else if (this.currentTool === 'carve') {
      this.ctx.strokeStyle = '#ef4444';
      this.ctx.fillStyle = 'rgba(239, 68, 68, 0.15)';
      this.ctx.lineWidth = 2;
      this.ctx.beginPath();
      this.ctx.arc(mx, my, r, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.stroke();
    } else if (this.currentTool === 'platform') {
      const w = r * 2.5;
      const h = Math.max(12, r * 0.5);
      this.ctx.strokeStyle = '#38bdf8';
      this.ctx.fillStyle = 'rgba(56, 189, 248, 0.2)';
      this.ctx.lineWidth = 2;
      this.ctx.strokeRect(mx - w / 2, my - h / 2, w, h);
      this.ctx.fillRect(mx - w / 2, my - h / 2, w, h);
    } else if (this.currentTool === 'crater') {
      this.ctx.strokeStyle = '#f59e0b';
      this.ctx.fillStyle = 'rgba(245, 158, 11, 0.2)';
      this.ctx.lineWidth = 2;
      this.ctx.beginPath();
      this.ctx.arc(mx, my, r * 1.5, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.stroke();
    }
    this.ctx.restore();
  }
}
