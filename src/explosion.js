import { WEAPONS } from './game.js';

export function createExplosion(x, y, radius, maxDamage, knockbackForce, game) {
  // 1. Carve the terrain canvas and update collision mask
  game.carveTerrain(x, y, radius);
  
  // 2. Play Audio
  if (radius > 70) {
    game.audio.play('holy_explosion');
  } else {
    game.audio.play('explosion');
  }

  // 3. Spawn Visual Particles
  // Spawn a dense ring of fire and expanding grey smoke puffs
  game.particles.spawnBurst(x, y, 'fire', Math.round(radius * 0.4));
  game.particles.spawnBurst(x, y, 'smoke', Math.round(radius * 0.5));
  
  // 4. Damage and push worms
  game.worms.forEach(worm => {
    if (worm.health <= 0) return;
    
    // Calculate distance from explosion center to worm center
    const dx = worm.x - x;
    const dy = (worm.y - 2) - y; // offset slightly for worm center
    const dist = Math.sqrt(dx * dx + dy * dy);
    
    // We give a little buffer range because the worm capsule has volume
    const effectRadius = radius + 15;
    
    if (dist < effectRadius) {
      // Linear falloff: 1.0 at center, 0.0 at edge of radius
      const proximity = (effectRadius - dist) / effectRadius;
      
      // Calculate damage
      const damage = Math.round(maxDamage * proximity);
      if (damage > 0) {
        worm.damage(damage);
        game.particles.spawnText(worm.x, worm.y - 18, `-${damage}`, '#f87171');
      }
      
      // Calculate knockback vector
      const angle = dist === 0 ? -Math.PI / 2 : Math.atan2(dy, dx);
      // Give a slight upwards bias so they fly into the air!
      const lift = -1.2 * proximity;
      const horizontalPush = Math.cos(angle) * knockbackForce * proximity;
      const verticalPush = Math.sin(angle) * knockbackForce * proximity + lift;
      
      worm.vx += horizontalPush;
      worm.vy += verticalPush;
      worm.isFalling = true;
    }
  });

  // 5. Apply knockback force to other active projectiles in flight!
  game.projectiles.forEach(proj => {
    const dx = proj.x - x;
    const dy = proj.y - y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const effectRadius = radius + 20;
    
    if (dist > 0 && dist < effectRadius) {
      const proximity = (effectRadius - dist) / effectRadius;
      const angle = Math.atan2(dy, dx);
      const push = knockbackForce * 0.7 * proximity;
      
      proj.vx += Math.cos(angle) * push;
      proj.vy += Math.sin(angle) * push;
    }
  });
}
