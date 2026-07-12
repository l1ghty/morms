import { calculateExplosionImpact } from '../common/physics.js';

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
  game.particles.spawnBurst(x, y, 'fire', Math.round(radius * 0.4));
  game.particles.spawnBurst(x, y, 'smoke', Math.round(radius * 0.5));
  
  // 4. Delegate math and state updates to shared module
  calculateExplosionImpact(
    x, y, radius, maxDamage, knockbackForce,
    game.worms, game.projectiles,
    (worm, damage) => {
      worm.damage(damage);
      game.particles.spawnText(worm.x, worm.y - 18, `-${damage}`, '#f87171');
    },
    (worm, vx, vy) => {
      worm.vx += vx;
      worm.vy += vy;
      worm.isFalling = true;
    },
    (proj, vx, vy) => {
      proj.vx += vx;
      proj.vy += vy;
    }
  );
}
