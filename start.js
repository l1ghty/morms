import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log('\x1b[36m%s\x1b[0m', 'Starting Worms Web Game development environment...');

// Start the WebSocket server
console.log('\x1b[35m%s\x1b[0m', 'Starting WebSocket server (port 8080)...');
const server = spawn('node', ['server.js'], {
  stdio: 'inherit',
  shell: true,
  cwd: __dirname
});

// Start the Vite dev client
console.log('\x1b[32m%s\x1b[0m', 'Starting Vite client dev server...');
const client = spawn('npx', ['vite'], {
  stdio: 'inherit',
  shell: true,
  cwd: __dirname
});

const killAll = () => {
  try {
    server.kill();
  } catch (e) {}
  try {
    client.kill();
  } catch (e) {}
};

process.on('SIGINT', () => {
  console.log('\nShutting down servers...');
  killAll();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\nShutting down servers...');
  killAll();
  process.exit(0);
});

server.on('exit', (code) => {
  if (code !== null && code !== 0) {
    console.error(`WebSocket server exited with code ${code}`);
    killAll();
    process.exit(code);
  }
});

client.on('exit', (code) => {
  if (code !== null && code !== 0) {
    console.error(`Vite client exited with code ${code}`);
    killAll();
    process.exit(code);
  }
});
