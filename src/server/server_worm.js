import { BaseWorm } from '../common/base_worm.js';

export class ServerWorm extends BaseWorm {
  constructor(id, x, y, name, teamName, teamColor, game) {
    super(x, y, name, teamName, teamColor, game);
    this.id = id;
  }

  // ─── Audio / Visual Hook Implementations ─────────────────────────────────────

  playAudio(name) {
    this.game.broadcastAudio(name);
  }

  // onDrown, onDie, onDamageVisual, onMove are no-ops on the server (no particles)
}
