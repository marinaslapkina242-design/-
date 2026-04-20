/**
 * ВОЛНА — Бэкенд сервер
 * Запуск: node server.js
 * Порт: 3001
 *
 * Требования: Node.js 14+
 * Установка зависимостей: npm install express cors bcryptjs jsonwebtoken
 */

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = 3001;
const DB_FILE = path.join(__dirname, 'db.json');
const JWT_SECRET = 'volna_secret_key_change_in_production';

app.use(cors());
app.use(express.json());
// Отдаём index.html статически
app.use(express.static(__dirname));

// ════════════════════════════════════
// БД — простой JSON-файл
// ════════════════════════════════════
function readDB() {
  if (!fs.existsSync(DB_FILE)) {
    const initial = {
      users: [
        { id: 1, username: 'alex', name: 'Алекс Волков', passwordHash: bcrypt.hashSync('1234', 10), bio: 'Разработчик 🚀 Люблю кофе и открытый код.', following: [2, 3] },
        { id: 2, username: 'masha', name: 'Маша Иванова', passwordHash: bcrypt.hashSync('1234', 10), bio: 'Дизайнер ✨ Рисую миры из пикселей.', following: [1] },
        { id: 3, username: 'dima', name: 'Дима Петров', passwordHash: bcrypt.hashSync('1234', 10), bio: 'Музыкант 🎸', following: [] },
        { id: 4, username: 'katya', name: 'Катя Смирнова', passwordHash: bcrypt.hashSync('1234', 10), bio: 'Путешественница 🌍', following: [1, 2] },
      ],
      posts: [
        { id: 1, userId: 2, text: 'Только что закончила новый проект — UI для финтек-стартапа. Когда дизайн и функционал встречаются — это магия! ✨', time: '2024-01-15T10:00:00Z', likes: [], comments: [{ userId: 1, text: 'Потрясающе! Покажи, когда запустят 🔥', time: '2024-01-15T10:05:00Z' }] },
        { id: 2, userId: 3, text: 'Записал новый трек сегодня ночью. Иногда лучшие идеи приходят в 3 часа ночи 🌙🎸', time: '2024-01-15T05:00:00Z', likes: [1], comments: [] },
        { id: 3, userId: 4, text: 'Стамбул — это отдельная вселенная. Успела попробовать 12 видов турецкого завтрака за 2 дня 🥙', time: '2024-01-14T12:00:00Z', likes: [1, 2, 3], comments: [{ userId: 2, text: 'Завидую! 😍', time: '2024-01-14T13:00:00Z' }] },
      ],
      messages: {
        '1-2': [
          { from: 2, text: 'Привет! Ты видел мой новый проект?', time: '2024-01-15T10:31:00Z' },
          { from: 1, text: 'Да, это огонь! Как долго работала?', time: '2024-01-15T10:33:00Z' },
        ],
        '1-3': [
          { from: 3, text: 'Слушай, можешь помочь с одним вопросом?', time: '2024-01-14T20:00:00Z' },
        ]
      },
      nextId: 10
    };
    fs.writeFileSync(DB_FILE, JSON.stringify(initial, null, 2));
    return initial;
  }
  return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
}

function writeDB(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

// ════════════════════════════════════
// MIDDLEWARE — проверка токена
// ════════════════════════════════════
function auth(req, res, next) {
  const token = req.headers['authorization']?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Нет токена' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Токен недействителен' });
  }
}

// ════════════════════════════════════
// УТИЛИТЫ
// ════════════════════════════════════
function safeUser(u) {
  const { passwordHash, ...safe } = u;
  return safe;
}

function formatTime(isoStr) {
  const d = new Date(isoStr);
  const now = new Date();
  const diff = Math.floor((now - d) / 1000);
  if (diff < 60) return 'только что';
  if (diff < 3600) return `${Math.floor(diff / 60)}м назад`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}ч назад`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}д назад`;
  return d.toLocaleDateString('ru');
}

function chatKey(id1, id2) {
  return [id1, id2].sort((a, b) => a - b).join('-');
}

// ════════════════════════════════════
// AUTH ROUTES
// ════════════════════════════════════

// POST /api/register
app.post('/api/register', (req, res) => {
  const { username, name, password } = req.body;
  if (!username || !name || !password) return res.status(400).json({ error: 'Заполни все поля' });
  if (password.length < 4) return res.status(400).json({ error: 'Пароль минимум 4 символа' });

  const db = readDB();
  if (db.users.find(u => u.username === username)) {
    return res.status(400).json({ error: 'Это имя уже занято' });
  }

  const newUser = {
    id: db.nextId++,
    username,
    name,
    passwordHash: bcrypt.hashSync(password, 10),
    bio: '',
    following: []
  };
  db.users.push(newUser);
  writeDB(db);

  const token = jwt.sign({ id: newUser.id }, JWT_SECRET, { expiresIn: '30d' });
  res.json({ token, user: safeUser(newUser) });
});

// POST /api/login
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const db = readDB();
  const user = db.users.find(u => u.username === username);
  if (!user || !bcrypt.compareSync(password, user.passwordHash)) {
    return res.status(401).json({ error: 'Неверный логин или пароль' });
  }
  const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '30d' });
  res.json({ token, user: safeUser(user) });
});

// GET /api/me
app.get('/api/me', auth, (req, res) => {
  const db = readDB();
  const user = db.users.find(u => u.id === req.user.id);
  if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
  res.json(safeUser(user));
});

// ════════════════════════════════════
// USERS ROUTES
// ════════════════════════════════════

// GET /api/users — все пользователи (кроме паролей)
app.get('/api/users', auth, (req, res) => {
  const db = readDB();
  res.json(db.users.map(safeUser));
});

// PATCH /api/users/me — обновить профиль
app.patch('/api/users/me', auth, (req, res) => {
  const { name, bio } = req.body;
  const db = readDB();
  const user = db.users.find(u => u.id === req.user.id);
  if (!user) return res.status(404).json({ error: 'Не найден' });
  if (name) user.name = name;
  if (bio !== undefined) user.bio = bio;
  writeDB(db);
  res.json(safeUser(user));
});

// POST /api/users/:id/follow — подписаться / отписаться
app.post('/api/users/:id/follow', auth, (req, res) => {
  const targetId = parseInt(req.params.id);
  const db = readDB();
  const me = db.users.find(u => u.id === req.user.id);
  if (!me) return res.status(404).json({ error: 'Не найден' });
  if (!me.following) me.following = [];
  const idx = me.following.indexOf(targetId);
  if (idx === -1) { me.following.push(targetId); }
  else { me.following.splice(idx, 1); }
  writeDB(db);
  res.json({ following: me.following });
});

// ════════════════════════════════════
// POSTS ROUTES
// ════════════════════════════════════

// GET /api/posts — лента
app.get('/api/posts', auth, (req, res) => {
  const db = readDB();
  const me = db.users.find(u => u.id === req.user.id);
  const visible = db.posts.filter(p => p.userId === me.id || (me.following || []).includes(p.userId));
  const result = [...visible].reverse().map(p => ({
    ...p,
    timeFormatted: formatTime(p.time)
  }));
  res.json(result);
});

// GET /api/posts/user/:id — посты пользователя
app.get('/api/posts/user/:id', auth, (req, res) => {
  const db = readDB();
  const uid = parseInt(req.params.id);
  const posts = db.posts.filter(p => p.userId === uid).reverse().map(p => ({
    ...p,
    timeFormatted: formatTime(p.time)
  }));
  res.json(posts);
});

// POST /api/posts — создать пост
app.post('/api/posts', auth, (req, res) => {
  const { text } = req.body;
  if (!text || !text.trim()) return res.status(400).json({ error: 'Текст пуст' });
  const db = readDB();
  const post = {
    id: db.nextId++,
    userId: req.user.id,
    text: text.trim(),
    time: new Date().toISOString(),
    likes: [],
    comments: []
  };
  db.posts.push(post);
  writeDB(db);
  res.json({ ...post, timeFormatted: 'только что' });
});

// POST /api/posts/:id/like — лайк / убрать лайк
app.post('/api/posts/:id/like', auth, (req, res) => {
  const pid = parseInt(req.params.id);
  const db = readDB();
  const post = db.posts.find(p => p.id === pid);
  if (!post) return res.status(404).json({ error: 'Пост не найден' });
  const idx = post.likes.indexOf(req.user.id);
  if (idx === -1) { post.likes.push(req.user.id); }
  else { post.likes.splice(idx, 1); }
  writeDB(db);
  res.json({ likes: post.likes });
});

// POST /api/posts/:id/comment — добавить комментарий
app.post('/api/posts/:id/comment', auth, (req, res) => {
  const pid = parseInt(req.params.id);
  const { text } = req.body;
  if (!text || !text.trim()) return res.status(400).json({ error: 'Текст пуст' });
  const db = readDB();
  const post = db.posts.find(p => p.id === pid);
  if (!post) return res.status(404).json({ error: 'Пост не найден' });
  const comment = { userId: req.user.id, text: text.trim(), time: new Date().toISOString() };
  post.comments.push(comment);
  writeDB(db);
  res.json(comment);
});

// ════════════════════════════════════
// MESSAGES ROUTES
// ════════════════════════════════════

// GET /api/messages/:userId — получить чат с пользователем
app.get('/api/messages/:userId', auth, (req, res) => {
  const otherId = parseInt(req.params.userId);
  const key = chatKey(req.user.id, otherId);
  const db = readDB();
  const msgs = (db.messages[key] || []).map(m => ({
    ...m,
    timeFormatted: new Date(m.time).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })
  }));
  res.json(msgs);
});

// POST /api/messages/:userId — отправить сообщение
app.post('/api/messages/:userId', auth, (req, res) => {
  const otherId = parseInt(req.params.userId);
  const { text } = req.body;
  if (!text || !text.trim()) return res.status(400).json({ error: 'Пусто' });
  const key = chatKey(req.user.id, otherId);
  const db = readDB();
  if (!db.messages[key]) db.messages[key] = [];
  const msg = { from: req.user.id, text: text.trim(), time: new Date().toISOString() };
  db.messages[key].push(msg);
  writeDB(db);
  const now = new Date();
  res.json({
    ...msg,
    timeFormatted: now.toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })
  });
});

// GET /api/messages — список последних чатов
app.get('/api/messages', auth, (req, res) => {
  const db = readDB();
  const myId = req.user.id;
  const convos = [];
  for (const [key, msgs] of Object.entries(db.messages)) {
    const ids = key.split('-').map(Number);
    if (!ids.includes(myId)) continue;
    const otherId = ids.find(id => id !== myId);
    const other = db.users.find(u => u.id === otherId);
    if (!other) continue;
    const last = msgs.length ? msgs[msgs.length - 1] : null;
    convos.push({
      userId: otherId,
      name: other.name,
      username: other.username,
      lastMessage: last ? last.text : '',
      lastTime: last ? last.time : ''
    });
  }
  res.json(convos);
});

// ════════════════════════════════════
// ЗАПУСК
// ════════════════════════════════════
app.listen(PORT, () => {
  console.log(`\n✦ Волна — сервер запущен на http://localhost:${PORT}`);
  console.log(`  Открой в браузере: http://localhost:${PORT}/index.html`);
  console.log(`  API доступно на:   http://localhost:${PORT}/api/\n`);
});
