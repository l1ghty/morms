// ─── Map & World ──────────────────────────────────────────────────────────────
export const MAP_WIDTH = 1600;
export const MAP_HEIGHT = 900;
export const WATER_LEVEL = 820;
export const GRAVITY = 0.22;

// ─── Worm ──────────────────────────────────────────────────────────────────────
export const WORM_MAX_HEALTH = 100;

// ─── Turn Timing ───────────────────────────────────────────────────────────────
export const TURN_DURATION = 45;          // seconds per turn
export const RETREAT_DURATION_SHORT = 3;  // after most weapons
export const RETREAT_DURATION_LONG = 5;   // after dynamite / blowtorch
export const DEFAULT_FUSE_TIME = 3;       // grenade / cluster fuse (seconds)

// ─── Charging ──────────────────────────────────────────────────────────────────
export const MAX_CHARGE = 100;
export const CHARGE_RATE = 2.5;           // charge units per frame
export const CHARGE_RATE_CLIENT = CHARGE_RATE;
export const CHARGE_RATE_SERVER = CHARGE_RATE;

// ─── Camera ────────────────────────────────────────────────────────────────────
export const CAMERA_LERP_SPEED = 0.05;

// ─── Teams ─────────────────────────────────────────────────────────────────────
export const TEAM_RED = { id: 'red',  name: 'Red Team',  color: '#ef4444' };
export const TEAM_BLUE = { id: 'blue', name: 'Blue Team', color: '#3b82f6' };

// ─── Worm Name Pools ───────────────────────────────────────────────────────────
export const WORM_NAMES_RED  = ['Boggy', 'Dunky', 'Squeaky', 'Gordo'];
export const WORM_NAMES_BLUE = ['Slippy', 'Slimy', 'Curly', 'Ziggy'];

// ─── Default Match Settings ────────────────────────────────────────────────────
export const DEFAULT_SETTINGS = { wormsPerTeam: 3, mapType: 'island' };

// ─── Game State ────────────────────────────────────────────────────────────────
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

// ─── Weapons ───────────────────────────────────────────────────────────────────
export const WEAPONS = [
  { id: 'bazooka',   name: 'Bazooka',      ammo: -1, icon: '🚀', desc: 'Heavy rocket. Affected by gravity & wind.' },
  { id: 'grenade',   name: 'Grenade',       ammo: -1, icon: '💣', desc: 'Bouncy grenade with 3s fuse. Physics bounce!' },
  { id: 'cluster',   name: 'Cluster Bomb',  ammo:  3, icon: '💥', desc: 'Explodes into 5 bouncing shrapnel bombs.' },
  { id: 'holy',      name: 'Holy Grenade',  ammo:  1, icon: '⛪', desc: 'Massive blast, high bounce. Plays Hallelujah!' },
  { id: 'dynamite',  name: 'Dynamite',      ammo:  2, icon: '🧨', desc: 'Drops at feet. Huge explosion. 5s fuse.' },
  { id: 'airstrike', name: 'Air Strike',    ammo:  1, icon: '✈️', desc: 'Click map to target. 5 missiles drop down.' },
  { id: 'blowtorch', name: 'Blowtorch',     ammo:  2, icon: '🔥', desc: 'Digs tunnel in terrain. High utility.' },
  { id: 'banana',    name: 'Banana Bomb',   ammo:  2, icon: '🍌', desc: 'Wildly bouncy banana. Explodes into 5 bouncing bananas!' },
  { id: 'baseball_bat', name: 'Baseball Bat', ammo: 2, icon: '🏏', desc: 'Whack a nearby worm to launch them into orbit!' },
  { id: 'super_sheep', name: 'Super Sheep',  ammo:  2, icon: '🐑', desc: 'Controllable/manual detonation flying sheep!' }
];

