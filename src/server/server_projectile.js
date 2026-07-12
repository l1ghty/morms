import { BaseProjectile } from '../common/base_projectile.js';

export class ServerProjectile extends BaseProjectile {
  constructor(x, y, vx, vy, type, game) {
    super(x, y, vx, vy, type, game);
    this.id = game && typeof game.getNextProjectileId === 'function'
      ? game.getNextProjectileId()
      : Math.random();
  }

  // ─── Hook Implementations ─────────────────────────────────────────────────────

  playAudio(name) {
    this.game.broadcastAudio(name);
  }

  doExplode() {
    this.game.createExplosion(this.x, this.y, this.blastRadius, this.maxDamage, this.knockbackForce);
  }

  createShrapnel(x, y, vx, vy) {
    return new ServerProjectile(x, y, vx, vy, 'cluster_shrapnel', this.game);
  }

  // onWaterHit and onFlightParticle are no-ops on the server (no renderer)
}
