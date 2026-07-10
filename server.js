import { WebSocketServer } from 'ws';
import { ServerGame } from './src/server_game.js';

const wss = new WebSocketServer({ port: 8080 });
console.log('WebSocket server is running on port 8080');

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
          const p2Name = data.playerName ? data.playerName.trim() : 'Blue Team';
          
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
            opponentName: p2Name
          }));
          
          broadcastRoomList();
        } else {
          ws.send(JSON.stringify({
            type: 'error',
            message: 'Room is full or no longer exists.'
          }));
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
                turnTimer: room.game.turnTimer,
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
                  isFalling: w.isFalling
                })),
                projectiles: room.game.projectiles.map(p => ({
                  id: p.id,
                  type: p.type,
                  x: p.x,
                  y: p.y,
                  vx: p.vx,
                  vy: p.vy
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
