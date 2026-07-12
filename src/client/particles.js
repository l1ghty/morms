export class Particle {
  constructor(x, y, vx, vy, type, color, size, maxLife, extra = {}) {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.type = type;
    this.color = color;
    this.size = size;
    this.startSize = size;
    
    this.life = maxLife;
    this.maxLife = maxLife;
    this.isDead = false;
    
    // Extra properties
    this.text = extra.text || '';
    this.gravity = extra.gravity || 0;
    this.friction = extra.friction || 0.98;
  }

  update(dt) {
    this.life -= dt;
    if (this.life <= 0) {
      this.isDead = true;
      return;
    }

    // Physics
    this.vy += this.gravity * dt;
    this.vx *= Math.pow(this.friction, dt);
    this.vy *= Math.pow(this.friction, dt);
    
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    // Size / alpha changes over lifetime
    const lifeRatio = this.life / this.maxLife;
    
    if (this.type === 'fire') {
      // Shrink and cool (transition color slightly or fade)
      this.size = this.startSize * lifeRatio;
    } 
    else if (this.type === 'smoke' || this.type === 'smoke_trail') {
      // Expand and fade
      this.size = this.startSize * (1.5 - lifeRatio * 0.5);
    }
  }

  draw(ctx) {
    ctx.save();
    
    const lifeRatio = this.life / this.maxLife;
    ctx.globalAlpha = Math.max(0, Math.min(1, lifeRatio));

    if (this.type === 'fire') {
      // Draw double layered fire glowing circles
      ctx.fillStyle = this.color;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
      ctx.fill();
      
      ctx.fillStyle = '#f59e0b'; // core
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size * 0.6, 0, Math.PI * 2);
      ctx.fill();
    } 
    else if (this.type === 'smoke' || this.type === 'smoke_trail') {
      ctx.fillStyle = this.color;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
      ctx.fill();
    } 
    else if (this.type === 'water' || this.type === 'dirt') {
      // Draw droplets
      ctx.fillStyle = this.color;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
      ctx.fill();
    } 
    else if (this.type === 'text') {
      ctx.font = '800 11px Space Grotesk';
      ctx.textAlign = 'center';
      
      // Outline for readability
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 3;
      ctx.strokeText(this.text, this.x, this.y);
      
      ctx.fillStyle = this.color;
      ctx.fillText(this.text, this.x, this.y);
    }

    ctx.restore();
  }
}

export class ParticleSystem {
  constructor() {
    this.list = [];
  }

  clear() {
    this.list = [];
  }

  spawnBurst(x, y, type, count) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      
      if (type === 'fire') {
        const speed = 1.0 + Math.random() * 4.5;
        const vx = Math.cos(angle) * speed;
        const vy = Math.sin(angle) * speed - 0.5; // slight upwards float
        const color = Math.random() > 0.4 ? '#ef4444' : '#fbbf24'; // Red or Gold yellow
        const size = 5 + Math.random() * 7;
        const life = 12 + Math.random() * 15; // 12-27 frames
        
        this.list.push(new Particle(x, y, vx, vy, 'fire', color, size, life, { friction: 0.94 }));
      } 
      else if (type === 'smoke') {
        const speed = 0.5 + Math.random() * 2.0;
        const vx = Math.cos(angle) * speed;
        const vy = Math.sin(angle) * speed - 0.8; // float upwards
        const colors = ['#64748b', '#475569', '#334155']; // grey shades
        const color = colors[Math.floor(Math.random() * colors.length)];
        const size = 8 + Math.random() * 10;
        const life = 30 + Math.random() * 40;
        
        this.list.push(new Particle(x, y, vx, vy, 'smoke', color, size, life, { friction: 0.96 }));
      } 
      else if (type === 'smoke_trail') {
        // Soft white rocket trails
        const vx = (Math.random() - 0.5) * 0.4;
        const vy = (Math.random() - 0.5) * 0.4 - 0.2;
        const color = 'rgba(203, 213, 225, 0.4)';
        const size = 3 + Math.random() * 4;
        const life = 15 + Math.random() * 10;
        
        this.list.push(new Particle(x, y, vx, vy, 'smoke_trail', color, size, life, { friction: 0.98 }));
      }
      else if (type === 'water') {
        // High upward spray
        const speed = 2.0 + Math.random() * 4.0;
        // Limit angle to pointing generally UP (between -30 and -150 deg)
        const waterAngle = -Math.PI / 4 - Math.random() * Math.PI / 2;
        const vx = Math.cos(waterAngle) * speed;
        const vy = Math.sin(waterAngle) * speed;
        const color = 'rgba(14, 165, 233, 0.85)'; // vibrant cyan water
        const size = 2 + Math.random() * 3;
        const life = 25 + Math.random() * 15;
        
        this.list.push(new Particle(x, y, vx, vy, 'water', color, size, life, { gravity: 0.2, friction: 0.99 }));
      }
      else if (type === 'dirt') {
        // Brown specs
        const speed = 0.5 + Math.random() * 1.5;
        const vx = Math.cos(angle) * speed;
        const vy = Math.sin(angle) * speed - 1.0;
        const color = '#713f12';
        const size = 1.5 + Math.random() * 2;
        const life = 10 + Math.random() * 10;
        
        this.list.push(new Particle(x, y, vx, vy, 'dirt', color, size, life, { gravity: 0.18 }));
      }
    }
  }

  spawnText(x, y, text, color) {
    const vx = 0;
    const vy = -0.7; // float slowly upwards
    const life = 55; // 55 frames duration
    
    this.list.push(new Particle(x, y, vx, vy, 'text', color, 12, life, { friction: 1.0 }));
  }

  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.update(dt);
      if (p.isDead) {
        this.list.splice(i, 1);
      }
    }
  }

  isSettle() {
    // If there are still floating damage text labels, we wait for them so player can read them!
    return !this.list.some(p => p.type === 'text');
  }

  draw(ctx) {
    this.list.forEach(p => p.draw(ctx));
  }
}
