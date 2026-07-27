import { CustomMapManager } from '../common/custom_map_manager.js';

export class ServerTerrain {
  constructor(width, height, type = 'island') {
    this.width = width;
    this.height = height;
    this.type = type;
    this.collisionMask = new Uint8Array(this.width * this.height);
    this.generate();
  }

  isSolid(x, y) {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) {
      return false;
    }
    return this.collisionMask[y * this.width + x] === 1;
  }

  carve(tx, ty, radius) {
    const rSq = radius * radius;
    const startX = Math.max(0, Math.floor(tx - radius));
    const endX = Math.min(this.width - 1, Math.ceil(tx + radius));
    const startY = Math.max(0, Math.floor(ty - radius));
    const endY = Math.min(this.height - 1, Math.ceil(ty + radius));
    
    for (let y = startY; y <= endY; y++) {
      for (let x = startX; x <= endX; x++) {
        const dx = x - tx;
        const dy = y - ty;
        if (dx * dx + dy * dy <= rSq) {
          this.collisionMask[y * this.width + x] = 0;
        }
      }
    }
  }

  generate() {
    const width = this.width;
    const height = this.height;
    
    let customData = null;
    if (typeof this.type === 'object' && this.type !== null) {
      customData = this.type;
    } else if (typeof this.type === 'string' && this.type.startsWith('custom:')) {
      customData = CustomMapManager.getMapById(this.type);
    }

    if (customData) {
      this.generateCustom(customData);
      return;
    }
    
    if (this.type === 'island') {
      const baseline = height * 0.65;
      for (let x = 0; x < width; x++) {
        let falloff = 1;
        if (x < 200) {
          falloff = x / 200;
        } else if (x > width - 200) {
          falloff = (width - x) / 200;
        }
        const wave1 = Math.sin(x * 0.003) * 120;
        const wave2 = Math.sin(x * 0.015) * 40;
        const wave3 = Math.sin(x * 0.04) * 10;
        const wave4 = Math.cos(x * 0.001) * 30;
        
        // Add 4px baseline buffer offset to approximate visual grass stroke bounds
        const y = Math.min(baseline + (wave1 + wave2 + wave3 + wave4) * falloff, height - 100) - 4;
        for (let yFill = Math.max(0, Math.floor(y)); yFill < height; yFill++) {
          this.collisionMask[yFill * width + x] = 1;
        }
      }
    } else if (this.type === 'cave') {
      const baseline = height * 0.7;
      const roofBaseline = 180;
      for (let x = 0; x < width; x++) {
        const waveFloor = Math.sin(x * 0.005) * 80 + Math.sin(x * 0.02) * 20;
        const floorY = baseline + waveFloor - 4;
        
        const waveRoof = Math.sin(x * 0.006) * 60 + Math.sin(x * 0.03) * 15;
        const roofY = roofBaseline + waveRoof + 4;
        
        for (let yFill = 0; yFill < height; yFill++) {
          if (yFill >= floorY || yFill <= roofY) {
            this.collisionMask[yFill * width + x] = 1;
          }
        }
      }
    } else { // canyon
      const baseline = height * 0.55;
      for (let x = 0; x < width; x++) {
        const mid = width / 2;
        const distFromMid = Math.abs(x - mid);
        const canyonShape = 1 + (distFromMid / mid) * 1.5;
        const wave1 = Math.sin(x * 0.004) * 100;
        const wave2 = Math.sin(x * 0.025) * 35;
        const y = Math.max(100, Math.min(baseline + (wave1 + wave2) * canyonShape, height - 80)) - 4;
        
        for (let yFill = Math.max(0, Math.floor(y)); yFill < height; yFill++) {
          this.collisionMask[yFill * width + x] = 1;
        }
      }
    }
  }

  generateCustom(mapData) {
    const base = mapData.baseType || 'island';
    if (base === 'cave') {
      this.type = 'cave';
      this.generate();
    } else if (base === 'canyon') {
      this.type = 'canyon';
      this.generate();
    } else if (base === 'blank') {
      this.collisionMask.fill(0);
    } else {
      this.type = 'island';
      this.generate();
    }
    this.type = mapData.id || 'custom';

    if (Array.isArray(mapData.additions)) {
      mapData.additions.forEach(add => {
        const cx = add.x;
        const cy = add.y;
        const r = add.r;
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
              this.collisionMask[rowOffset + x] = 1;
            }
          }
        }
      });
    }

    if (Array.isArray(mapData.platforms)) {
      mapData.platforms.forEach(plat => {
        const startX = Math.max(0, Math.floor(plat.x - plat.w / 2));
        const endX = Math.min(this.width - 1, Math.ceil(plat.x + plat.w / 2));
        const startY = Math.max(0, Math.floor(plat.y - plat.h / 2));
        const endY = Math.min(this.height - 1, Math.ceil(plat.y + plat.h / 2));
        
        for (let y = startY; y <= endY; y++) {
          const rowOffset = y * this.width;
          for (let x = startX; x <= endX; x++) {
            this.collisionMask[rowOffset + x] = 1;
          }
        }
      });
    }

    if (Array.isArray(mapData.carves)) {
      mapData.carves.forEach(carve => {
        this.carve(carve.x, carve.y, carve.r);
      });
    }
  }
}
