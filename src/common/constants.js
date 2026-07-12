export const GameState = {
  LOBBY: 'LOBBY',
  START_TURN: 'START_TURN',
  PLAYING: 'PLAYING',
  FIRING: 'FIRING',
  ACTION: 'ACTION',
  RETREAT: 'RETREAT',
  CLEANUP: 'CLEANUP',
  GAME_OVER: 'GAME_OVER',
  HANDOVER: 'HANDOVER'
};

export const WEAPONS = [
  { id: 'bazooka', name: 'Bazooka', ammo: -1, icon: '🚀', desc: 'Heavy rocket. Affected by gravity & wind.' },
  { id: 'grenade', name: 'Grenade', ammo: -1, icon: '💣', desc: 'Bouncy grenade with 3s fuse. Physics bounce!' },
  { id: 'cluster', name: 'Cluster Bomb', ammo: 3, icon: '💥', desc: 'Explodes into 5 bouncing shrapnel bombs.' },
  { id: 'holy', name: 'Holy Grenade', ammo: 1, icon: '⛪', desc: 'Massive blast, high bounce. Plays Hallelujah!' },
  { id: 'dynamite', name: 'Dynamite', ammo: 2, icon: '🧨', desc: 'Drops at feet. Huge explosion. 5s fuse.' },
  { id: 'airstrike', name: 'Air Strike', ammo: 1, icon: '✈️', desc: 'Click map to target. 5 missiles drop down.' },
  { id: 'blowtorch', name: 'Blowtorch', ammo: 2, icon: '🔥', desc: 'Digs tunnel in terrain. High utility.' }
];
