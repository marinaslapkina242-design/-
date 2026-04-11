// ═══════════════════════════════════════════
//   AETHON — Серверный скрипт
//   Стек: Node.js + Socket.io + Express
//   Запуск: node server.js
// ═══════════════════════════════════════════

const express = require('express');
const http    = require('http');
const { Server } = require('socket.io');
const path    = require('path');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, {
  cors: { origin: '*' }
});

const PORT = process.env.PORT || 3000;

// ─── Статические файлы (отдаём index.html) ───
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// ─── Хранилище состояния ───
const worlds = {
  'main-plaza':   { name: 'Главная площадь', players: {} },
  'aethon-forest':{ name: 'Лес Этона',       players: {} },
  'sky-parkour':  { name: 'Небесный паркур', players: {} },
  'volcano-isle': { name: 'Остров вулкана',  players: {} },
};

const players = {}; // socket.id → { id, username, world, x, y, z, coins }

// ─── REST: список миров ───
app.get('/api/worlds', (req, res) => {
  const list = Object.entries(worlds).map(([id, w]) => ({
    id,
    name:       w.name,
    playerCount: Object.keys(w.players).length,
  }));
  res.json(list);
});

// ─── REST: статус сервера ───
app.get('/api/status', (req, res) => {
  res.json({
    online:  Object.keys(players).length,
    worlds:  Object.keys(worlds).length,
    uptime:  Math.floor(process.uptime()),
  });
});

// ─── Socket.io: подключение ───
io.on('connection', (socket) => {
  console.log(`[+] Подключился: ${socket.id}`);

  // Игрок входит в платформу
  socket.on('player:join', ({ username }) => {
    players[socket.id] = {
      id:       socket.id,
      username: username || `Игрок_${socket.id.slice(0, 4)}`,
      world:    null,
      x: 0, y: 0, z: 0,
      coins:    0,
    };
    socket.emit('player:joined', players[socket.id]);
    console.log(`[JOIN] ${players[socket.id].username}`);
  });

  // Игрок входит в мир
  socket.on('world:enter', ({ worldId }) => {
    const player = players[socket.id];
    if (!player || !worlds[worldId]) return;

    // Покинуть старый мир
    if (player.world) {
      socket.leave(player.world);
      delete worlds[player.world].players[socket.id];
      socket.to(player.world).emit('world:playerLeft', { id: socket.id });
    }

    // Войти в новый мир
    player.world = worldId;
    player.x = 0; player.y = 0; player.z = 0;
    worlds[worldId].players[socket.id] = player;
    socket.join(worldId);

    // Отправить текущих игроков в мире
    socket.emit('world:entered', {
      worldId,
      players: Object.values(worlds[worldId].players),
    });

    // Оповестить остальных
    socket.to(worldId).emit('world:playerEntered', player);
    console.log(`[WORLD] ${player.username} → ${worlds[worldId].name}`);
  });

  // Обновление позиции игрока
  socket.on('player:move', ({ x, y, z }) => {
    const player = players[socket.id];
    if (!player || !player.world) return;

    player.x = x;
    player.y = y;
    player.z = z;

    socket.to(player.world).emit('player:moved', {
      id: socket.id,
      x, y, z,
    });
  });

  // Чат в мире
  socket.on('chat:message', ({ text }) => {
    const player = players[socket.id];
    if (!player || !player.world) return;
    if (!text || text.trim().length === 0) return;

    io.to(player.world).emit('chat:message', {
      from:      player.username,
      text:      text.slice(0, 200),
      timestamp: Date.now(),
    });
  });

  // Начисление монет (например, за задание)
  socket.on('coins:earn', ({ amount }) => {
    const player = players[socket.id];
    if (!player) return;
    player.coins += Math.min(amount, 1000); // защита от читов
    socket.emit('coins:updated', { coins: player.coins });
  });

  // Отключение
  socket.on('disconnect', () => {
    const player = players[socket.id];
    if (player) {
      if (player.world && worlds[player.world]) {
        delete worlds[player.world].players[socket.id];
        socket.to(player.world).emit('world:playerLeft', { id: socket.id });
      }
      console.log(`[-] Отключился: ${player.username}`);
      delete players[socket.id];
    }
  });
});

// ─── Запуск ───
server.listen(PORT, () => {
  console.log(`\n  ╔═══════════════════════════╗`);
  console.log(`  ║   AETHON сервер запущен   ║`);
  console.log(`  ║   http://localhost:${PORT}    ║`);
  console.log(`  ╚═══════════════════════════╝\n`);
});
