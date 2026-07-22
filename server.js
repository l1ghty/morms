import { WebSocketServer } from 'ws';
import { ServerGame } from './src/server/server_game.js';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DIST_DIR = path.join(__dirname, 'dist');

const isProd = process.env.NODE_ENV === 'production';
const PORT = process.env.PORT || (isProd ? 3000 : 8080);

const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const server = http.createServer((req, res) => {
  // Strip query parameters or hashes
  let safeUrl = req.url.split('?')[0].split('#')[0];
  safeUrl = safeUrl === '/' ? 'index.html' : safeUrl;
  
  const filePath = path.join(DIST_DIR, safeUrl);
  
  if (!filePath.startsWith(DIST_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Forbidden');
    return;
  }

  const ext = path.extname(filePath);
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        fs.readFile(path.join(DIST_DIR, 'index.html'), (err2, indexContent) => {
          if (err2) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('Not Found');
          } else {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(indexContent, 'utf-8');
          }
        });
      } else {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end(`Server Error: ${err.code}`);
      }
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content, 'utf-8');
    }
  });
});

const wss = new WebSocketServer({ server });
console.log('WebSocket server is initialized');

server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT} (Mode: ${isProd ? 'Production' : 'Development'})`);
});

const rooms = {};
const lobbyClients = new Set();
let nextRoomId = 1;

function getAvailableRooms() {
  return Object.values(rooms)
    .filter(r => r.status === 'waiting')
    .map(r => ({
      id: r.id,
      name: r.name,
      p1Name: r.p1Name,
      mapType: r.mapType,
      wormsPerTeam: r.wormsPerTeam
    }));
}

function broadcastRoomList() {
  const roomsList = getAvailableRooms();
  const msg = JSON.stringify({ type: 'rooms_list', rooms: roomsList });
  
  lobbyClients.forEach(client => {
    if (client.readyState === 1) { // OPEN
      client.send(msg);
    }
  });
}

wss.on('connection', (ws) => {
  console.log('New client connected, added to lobby');
  lobbyClients.add(ws);
  
  // Send initial room list immediately
  ws.send(JSON.stringify({ type: 'rooms_list', rooms: getAvailableRooms() }));

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      
      if (data.type === 'create_room') {
        const roomId = `Room #${nextRoomId++}`;
        ws.playerNumber = 1;
        ws.roomId = roomId;
        
        const roomName = data.roomName ? data.roomName.trim() : `Room #${roomId}`;
        const p1Name = data.playerName ? data.playerName.trim() : 'Red Team';
        
        rooms[roomId] = {
          id: roomId,
          name: roomName,
          p1: ws,
          p1Name: p1Name,
          p2: null,
          p2Name: '',
          mapType: data.mapType,
          wormsPerTeam: data.wormsPerTeam,
          status: 'waiting'
        };
        
        lobbyClients.delete(ws);
        console.log(`Client ${p1Name} created room ${roomName} (${roomId})`);
        
        ws.send(JSON.stringify({
          type: 'init',
          playerNumber: 1,
          roomId: roomId,
          roomName: roomName,
          p1Name: p1Name
        }));
        
        broadcastRoomList();
      } 
      else if (data.type === 'join_room') {
        const roomId = data.roomId;
        const room = rooms[roomId];
        
        if (room && room.status === 'waiting') {
          let p2Name = data.playerName ? data.playerName.trim() : 'Blue Team';
          if (p2Name === room.p1Name) {
            p2Name = `${p2Name} (2)`;
          }
          
          room.p2 = ws;
          room.p2Name = p2Name;
          room.status = 'ready';
          ws.playerNumber = 2;
          ws.roomId = roomId;
          
          lobbyClients.delete(ws);
          console.log(`Client ${p2Name} joined room ${room.name} (${roomId})`);
          
          ws.send(JSON.stringify({
            type: 'init',
            playerNumber: 2,
            roomId: roomId,
            roomName: room.name,
            p1Name: room.p1Name,
            p2Name: p2Name
          }));
          
          // Notify Host P1 that opponent joined
          room.p1.send(JSON.stringify({
            type: 'opponent_joined',
            opponentName: p2Name
          }));
          
          // Notify Guest P2 that they are joined and waiting for host
          room.p2.send(JSON.stringify({
            type: 'joined_waiting_host',
            hostName: room.p1Name,
            opponentName: p2Name,
            mapType: room.mapType,
            wormsPerTeam: room.wormsPerTeam
          }));
          
          broadcastRoomList();
        } else {
          ws.send(JSON.stringify({
            type: 'error',
            message: 'Room is full or no longer exists.'
          }));
        }
      }
      else if (data.type === 'update_settings') {
        const roomId = ws.roomId;
        const room = rooms[roomId];
        if (room && ws.playerNumber === 1 && room.status !== 'playing') {
          room.wormsPerTeam = data.wormsPerTeam;
          room.mapType = data.mapType;
          console.log(`Room ${roomId} settings updated: worms=${room.wormsPerTeam}, map=${room.mapType}`);
          
          if (room.p2) {
            room.p2.send(JSON.stringify({
              type: 'settings_updated',
              wormsPerTeam: room.wormsPerTeam,
              mapType: room.mapType
            }));
          }
          broadcastRoomList();
        }
      }
      else if (data.type === 'return_to_lobby') {
        const roomId = ws.roomId;
        const room = rooms[roomId];
        if (room) {
          if (room.status === 'playing') {
            room.status = 'ready';
            if (room.gameInterval) {
              clearInterval(room.gameInterval);
              room.gameInterval = null;
            }
            room.game = null;
            console.log(`Room ${roomId} returning to lobby`);
          }
          ws.send(JSON.stringify({ type: 'back_to_lobby' }));
        }
      }
      else if (data.type === 'host_start') {
        const roomId = ws.roomId;
        const room = rooms[roomId];
        
        if (room && room.status === 'ready' && ws.playerNumber === 1) {
          room.status = 'playing';
          console.log(`Host starting match in room ${room.name} (${roomId})`);
          
          // Instantiate the server-side simulation Game
          room.game = new ServerGame(room);
          
          const startMsg = JSON.stringify({
            type: 'start_match',
            mapType: room.mapType,
            wormsPerTeam: room.wormsPerTeam,
            p1Name: room.p1Name,
            p2Name: room.p2Name,
            worms: room.game.worms.map(w => ({
              id: w.id,
              x: w.x,
              y: w.y,
              name: w.name,
              teamName: w.teamName,
              color: w.teamColor,
              health: w.health
            }))
          });
          room.p1.send(startMsg);
          room.p2.send(startMsg);
          
          // Start first turn transition
          room.game.setupNextTurn(true);
          
          // Setup 60Hz gameplay ticks
          room.lastTickTime = Date.now();
          room.gameInterval = setInterval(() => {
            const now = Date.now();
            const dt = Math.min((now - room.lastTickTime) / 16.666, 4);
            room.lastTickTime = now;
            
            if (room.game) {
              room.game.update(dt);
              
              const stateMsg = JSON.stringify({
                type: 'game_tick',
                state: room.game.state,
                activeWormId: room.game.activeWorm ? room.game.activeWorm.id : null,
                activeTeamIndex: room.game.activeTeamIndex,
                turnTimer: room.game.state === 'RETREAT' ? room.game.retreatTimer : room.game.turnTimer,
                windStrength: room.game.wind.strength,
                chargePower: room.game.chargePower,
                selectedWeaponIndex: room.game.selectedWeaponIndex,
                selectedFuseTime: room.game.selectedFuseTime,
                worms: room.game.worms.map(w => ({
                  id: w.id,
                  x: w.x,
                  y: w.y,
                  vx: w.vx,
                  vy: w.vy,
                  health: w.health,
                  facingDir: w.facingDir,
                  aimAngle: w.aimAngle,
                  isFalling: w.isFalling,
                  rope: w.rope && w.rope.attached ? { attached: true, x: w.rope.x, y: w.rope.y, length: w.rope.length } : null
                })),
                projectiles: room.game.projectiles.map(p => ({
                  id: p.id,
                  type: p.type,
                  x: p.x,
                  y: p.y,
                  vx: p.vx,
                  vy: p.vy,
                  fuse: p.fuse
                }))
              });
              
              if (room.p1 && room.p1.readyState === 1) room.p1.send(stateMsg);
              if (room.p2 && room.p2.readyState === 1) room.p2.send(stateMsg);
            }
          }, 1000 / 60);
          
          broadcastRoomList();
        }
      }
      else {
        // Direct player inputs to the server-side simulation or relay if not gameplay
        const roomId = ws.roomId;
        if (roomId && rooms[roomId]) {
          const room = rooms[roomId];
          if (room.game) {
            room.game.handlePlayerInput(ws.playerNumber, data);
          } else {
            const opponent = ws.playerNumber === 1 ? room.p2 : room.p1;
            if (opponent && opponent.readyState === 1) {
              opponent.send(message.toString());
            }
          }
        }
      }
    } catch (e) {
      console.error('Error handling message:', e);
    }
  });

  ws.on('close', () => {
    console.log(`Client disconnected (Player ${ws.playerNumber} in room ${ws.roomId})`);
    lobbyClients.delete(ws);
    
    const roomId = ws.roomId;
    if (roomId && rooms[roomId]) {
      const room = rooms[roomId];
      const opponent = ws.playerNumber === 1 ? room.p2 : room.p1;
      
      if (room.gameInterval) {
        clearInterval(room.gameInterval);
      }
      if (room.game) {
        room.game.destroy();
      }

      if (opponent && opponent.readyState === 1) {
        opponent.send(JSON.stringify({ type: 'player_left' }));
        opponent.close();
      }
      
      delete rooms[roomId];
      console.log(`Room ${roomId} closed because a player disconnected`);
      broadcastRoomList();
    }
  });

  ws.on('error', (err) => {
    console.error('Socket error:', err);
  });
});
