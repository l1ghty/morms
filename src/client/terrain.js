export class Terrain {
  constructor(width, height, type = 'island') {
    this.width = width;
    this.height = height;
    this.type = type;
    
    // Create the visual terrain canvas
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.width;
    this.canvas.height = this.height;
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    
    // CPU-side collision mask (1 = solid, 0 = empty)
    this.collisionMask = new Uint8Array(this.width * this.height);
    
    this.generate();
  }

  generate() {
    this.ctx.clearRect(0, 0, this.width, this.height);
    
    // Draw sky background pattern (optional, usually terrain has transparent background)
    // We want the terrain canvas to have transparency where there is no dirt, so we can see the sky behind it!
    
    if (this.type === 'island') {
      this.generateIsland();
    } else if (this.type === 'cave') {
      this.generateCave();
    } else {
      this.generateCanyon();
    }
    
    // Compile CPU collision mask from the rendered canvas pixels (alpha channel > 120 means solid)
    const imgData = this.ctx.getImageData(0, 0, this.width, this.height);
    const data = imgData.data;
    for (let i = 0; i < this.collisionMask.length; i++) {
      // Data is [R, G, B, A, R, G, B, A...]
      const alphaIndex = i * 4 + 3;
      this.collisionMask[i] = data[alphaIndex] > 120 ? 1 : 0;
    }
  }

  generateIsland() {
    const ctx = this.ctx;
    
    // Generate terrain outline
    const baseline = this.height * 0.65;
    const points = [];
    
    for (let x = 0; x < this.width; x++) {
      // Island falloff near borders (X < 150 or X > width - 150)
      let falloff = 1;
      if (x < 200) {
        falloff = x / 200;
      } else if (x > this.width - 200) {
        falloff = (this.width - x) / 200;
      }
      
      // Combine multiple sine waves for ruggedness
      const wave1 = Math.sin(x * 0.003) * 120;
      const wave2 = Math.sin(x * 0.015) * 40;
      const wave3 = Math.sin(x * 0.04) * 10;
      const wave4 = Math.cos(x * 0.001) * 30;
      
      const y = baseline + (wave1 + wave2 + wave3 + wave4) * falloff;
      // Clamp Y to stay above the water level
      points.push({ x, y: Math.min(y, this.height - 100) });
    }
    
    this.drawTerrainShape(points);
  }

  generateCave() {
    const ctx = this.ctx;
    
    // Bottom terrain
    const points = [];
    const baseline = this.height * 0.7;
    for (let x = 0; x < this.width; x++) {
      const wave = Math.sin(x * 0.005) * 80 + Math.sin(x * 0.02) * 20;
      points.push({ x, y: baseline + wave });
    }
    
    this.drawTerrainShape(points);
    
    // Add Cave Roof
    ctx.fillStyle = this.getDirtGradient();
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(this.width, 0);
    
    // Rugged ceiling
    const roofBaseline = 180;
    ctx.lineTo(this.width, roofBaseline);
    for (let x = this.width - 1; x >= 0; x--) {
      const wave = Math.sin(x * 0.006) * 60 + Math.sin(x * 0.03) * 15;
      ctx.lineTo(x, roofBaseline + wave);
    }
    ctx.closePath();
    ctx.fill();
    
    // Draw grassy border on the ceiling (facing down)
    ctx.strokeStyle = '#4ade80'; // Bright grass green
    ctx.lineWidth = 6;
    ctx.beginPath();
    const startY = roofBaseline + Math.sin(this.width * 0.006) * 60 + Math.sin(this.width * 0.03) * 15;
    ctx.moveTo(this.width, startY);
    for (let x = this.width - 1; x >= 0; x--) {
      const wave = Math.sin(x * 0.006) * 60 + Math.sin(x * 0.03) * 15;
      ctx.lineTo(x, roofBaseline + wave);
    }
    ctx.stroke();
  }

  generateCanyon() {
    const points = [];
    const baseline = this.height * 0.55;
    
    for (let x = 0; x < this.width; x++) {
      // Canyon style: High cliffs on sides, valley/canyon in the middle
      let canyonShape = 1;
      const mid = this.width / 2;
      const distFromMid = Math.abs(x - mid);
      
      // High edges, deep center
      canyonShape = 1 + (distFromMid / mid) * 1.5;
      
      const wave1 = Math.sin(x * 0.004) * 100;
      const wave2 = Math.sin(x * 0.025) * 35;
      
      const y = baseline + (wave1 + wave2) * canyonShape;
      points.push({ x, y: Math.max(100, Math.min(y, this.height - 80)) });
    }
    
    this.drawTerrainShape(points);
  }

  getDirtGradient() {
    // Top brown gradient transitioning to dark grey stone at depth
    const grad = this.ctx.createLinearGradient(0, 150, 0, this.height);
    grad.addColorStop(0, '#854d0e'); // Warm light brown
    grad.addColorStop(0.3, '#713f12'); // Medium brown
    grad.addColorStop(0.7, '#451a03'); // Dark brown
    grad.addColorStop(1, '#1e293b'); // Dark rock
    return grad;
  }

  drawTerrainShape(points) {
    const ctx = this.ctx;
    
    // Draw Main Dirt Fill
    ctx.fillStyle = this.getDirtGradient();
    ctx.beginPath();
    ctx.moveTo(points[0].x, this.height);
    
    points.forEach(p => {
      ctx.lineTo(p.x, p.y);
    });
    
    ctx.lineTo(points[points.length - 1].x, this.height);
    ctx.closePath();
    ctx.fill();
    
    // Add Grass layer on top surface
    ctx.strokeStyle = '#22c55e'; // Vibrant green
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.stroke();
    
    // Add secondary yellow-green highlight on top of grass
    ctx.strokeStyle = '#a3e635'; // Lime green
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.stroke();
  }

  isSolid(x, y) {
    // Bounds check
    if (x < 0 || x >= this.width) return false;
    if (y < 0) return false; // Air is not solid
    if (y >= this.height) return false; // Below screen is water, not solid terrain
    
    const idx = Math.floor(y) * this.width + Math.floor(x);
    return this.collisionMask[idx] === 1;
  }

  carve(cx, cy, radius) {
    cx = Math.floor(cx);
    cy = Math.floor(cy);
    radius = Math.floor(radius);
    
    const ctx = this.ctx;
    
    // 1. Visual carve on the canvas
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = 'rgba(0, 0, 0, 1)';
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    
    // 2. CPU-side collision mask update
    const startX = Math.max(0, cx - radius);
    const endX = Math.min(this.width - 1, cx + radius);
    const startY = Math.max(0, cy - radius);
    const endY = Math.min(this.height - 1, cy + radius);
    
    const r2 = radius * radius;
    for (let y = startY; y <= endY; y++) {
      const dy = y - cy;
      const dy2 = dy * dy;
      const rowOffset = y * this.width;
      
      for (let x = startX; x <= endX; x++) {
        const dx = x - cx;
        if (dx * dx + dy2 <= r2) {
          this.collisionMask[rowOffset + x] = 0; // Clear solid
        }
      }
    }
  }

  draw(ctx) {
    // Draw the offscreen terrain canvas onto the active render context
    ctx.drawImage(this.canvas, 0, 0);
  }
}
