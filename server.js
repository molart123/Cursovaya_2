const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, { cors: { origin: "*" } });

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const DB_PATH = path.join(__dirname, 'db.json');
const ADMIN_PASSWORD = 'rainbow123';

function readDB() {
  if (!fs.existsSync(DB_PATH)) {
    const defaultDB = {
      gameConfig: { mode: 'single_multi', theme: 'farm', isRunning: false, roundDuration: 150 },
      teams: [
        { id: 1, name: 'Котята', color: '#FFB347', score: 0 },
        { id: 2, name: 'Зайчики', color: '#77DD77', score: 0 },
        { id: 3, name: 'Пингвины', color: '#AEC6CF', score: 0 },
        { id: 4, name: 'Лисята', color: '#FF6961', score: 0 }
      ],
      boards: [],
      themes: {
        farm: { background: '#e0f7fa', botColor: '#FFB347' },
        space: { background: '#1a1a4e', botColor: '#00ffcc' }
      }
    };
    fs.writeFileSync(DB_PATH, JSON.stringify(defaultDB, null, 2));
    return defaultDB;
  }
  return JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
}

function saveDB(db) { fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2)); }

let db = readDB();
let gameState = {
  config: { ...db.gameConfig },
  teams: db.teams.map(t => ({ ...t, score: 0 })),
  boards: [],
  activeGames: {}
};

// Инициализация игры на всех досках
function initActiveGames() {
  gameState.activeGames = {};
  gameState.boards.forEach(board => {
    gameState.activeGames[board.id] = {
      bots: [],
      crystals: [],
      lastBotId: 0,
      lastCrystalId: 0
    };
    const zones = board.split ? board.subBoards : [{ x: 0, y: 0, width: board.width, height: board.height }];
    zones.forEach(zone => {
      for (let i = 0; i < 8; i++) {
        gameState.activeGames[board.id].lastBotId++;
        gameState.activeGames[board.id].bots.push({
          id: gameState.activeGames[board.id].lastBotId,
          x: zone.x + Math.random() * zone.width,
          y: zone.y + Math.random() * zone.height,
          vx: (Math.random() - 0.5) * 2.5,
          vy: (Math.random() - 0.5) * 2.5,
          alive: true,
          respawnTime: 0,
          boardId: board.id,
          zone: zone
        });
      }
      // кристаллы
      gameState.activeGames[board.id].lastCrystalId++;
      gameState.activeGames[board.id].crystals.push({
        id: gameState.activeGames[board.id].lastCrystalId,
        x: zone.x + Math.random() * zone.width,
        y: zone.y + Math.random() * zone.height,
        boardId: board.id
      });
    });
  });
}

// Настройка досок согласно режиму
function configureBoardsForMode() {
  const mode = gameState.config.mode;
  gameState.boards = [];
  if (mode === 'single_multi') {
    // Одна общая доска
    gameState.boards.push({ id: 1, name: 'Общая поляна', width: 1200, height: 700, split: false, subBoards: [] });
  } else if (mode === 'duel') {
    // Две доски для двух команд
    gameState.boards.push({ id: 1, name: 'Поле Котят', width: 1200, height: 700, split: false, subBoards: [] });
    gameState.boards.push({ id: 2, name: 'Поле Зайчиков', width: 1200, height: 700, split: false, subBoards: [] });
  } else if (mode === 'quad_split') {
    // Две доски, каждая разделена
    gameState.boards.push({
      id: 1, name: 'Радужное поле', width: 1200, height: 700, split: true,
      subBoards: [
        { teamId: 1, x: 0, y: 0, width: 600, height: 700 },
        { teamId: 2, x: 600, y: 0, width: 600, height: 700 }
      ]
    });
    gameState.boards.push({
      id: 2, name: 'Звёздное поле', width: 1200, height: 700, split: true,
      subBoards: [
        { teamId: 3, x: 0, y: 0, width: 600, height: 700 },
        { teamId: 4, x: 600, y: 0, width: 600, height: 700 }
      ]
    });
  }
}

// Игровой цикл
setInterval(() => {
  if (!gameState.config.isRunning) return;
  const now = Date.now();
  gameState.boards.forEach(board => {
    const game = gameState.activeGames[board.id];
    if (!game) return;
    game.bots.forEach(bot => {
      if (!bot.alive) {
        if (bot.respawnTime && bot.respawnTime < now) {
          bot.alive = true;
          bot.x = bot.zone.x + Math.random() * bot.zone.width;
          bot.y = bot.zone.y + Math.random() * bot.zone.height;
        }
        return;
      }
      if (Math.random() < 0.01) {
        bot.vx = (Math.random() - 0.5) * 3;
        bot.vy = (Math.random() - 0.5) * 3;
      }
      bot.x += bot.vx;
      bot.y += bot.vy;
      if (bot.x < bot.zone.x) { bot.x = bot.zone.x; bot.vx *= -1; }
      if (bot.x > bot.zone.x + bot.zone.width) { bot.x = bot.zone.x + bot.zone.width; bot.vx *= -1; }
      if (bot.y < bot.zone.y) { bot.y = bot.zone.y; bot.vy *= -1; }
      if (bot.y > bot.zone.y + bot.zone.height) { bot.y = bot.zone.y + bot.zone.height; bot.vy *= -1; }
    });
    // Проверка кристаллов: они не двигаются, но могут быть собраны только выстрелом
  });
  broadcastGameState();
}, 1000 / 60);

function broadcastGameState() {
  io.emit('gameState', {
    boards: gameState.boards.map(board => {
      const game = gameState.activeGames[board.id];
      return {
        id: board.id,
        width: board.width,
        height: board.height,
        split: board.split,
        subBoards: board.subBoards,
        bots: game ? game.bots.filter(b => b.alive) : [],
        crystals: game ? game.crystals : []
      };
    }),
    scores: gameState.teams.map(t => ({ id: t.id, score: t.score })),
    timeLeft: gameState.config.isRunning ? Math.max(0, gameState.roundEndTime - Date.now()) : 0,
    isRunning: gameState.config.isRunning
  });
}

// Сокеты
io.on('connection', (socket) => {
  socket.on('requestConfig', () => {
    socket.emit('config', {
      config: gameState.config,
      teams: gameState.teams,
      boards: gameState.boards,
      themes: db.themes
    });
  });

  socket.on('shoot', (data) => {
    if (!gameState.config.isRunning) return;
    const { x, y, teamId, boardId } = data;
    const team = gameState.teams.find(t => t.id === teamId);
    if (!team) return;
    const board = gameState.boards.find(b => b.id === boardId);
    if (!board || x < 0 || x > board.width || y < 0 || y > board.height) return;
    const game = gameState.activeGames[boardId];
    if (!game) return;
    const now = Date.now();

    // Боты
    for (const bot of game.bots) {
      if (!bot.alive) continue;
      const dx = x - bot.x, dy = y - bot.y;
      if (Math.sqrt(dx*dx + dy*dy) < 35) {
        bot.alive = false;
        bot.respawnTime = now + 3000;
        team.score += 10;
        io.emit('scoreUpdate', gameState.teams.map(t => ({ id: t.id, score: t.score })));
        io.emit('hit', { x, y, teamId, boardId });
        return;
      }
    }
    // Кристаллы
    for (let i = 0; i < game.crystals.length; i++) {
      const c = game.crystals[i];
      const dx = x - c.x, dy = y - c.y;
      if (Math.sqrt(dx*dx + dy*dy) < 30) {
        game.crystals.splice(i, 1);
        team.score += 5;
        io.emit('scoreUpdate', gameState.teams.map(t => ({ id: t.id, score: t.score })));
        io.emit('crystal', { x, y, boardId });
        // спавн нового через 2 сек
        setTimeout(() => {
          if (gameState.config.isRunning && game.crystals.length < 8) {
            const zone = board.split ? board.subBoards.find(s => s.teamId === teamId) || { x:0,y:0,width:board.width,height:board.height } : { x:0,y:0,width:board.width,height:board.height };
            game.lastCrystalId++;
            game.crystals.push({ id: game.lastCrystalId, x: zone.x + Math.random()*zone.width, y: zone.y + Math.random()*zone.height, boardId });
          }
        }, 2000);
        return;
      }
    }
    io.emit('miss', { x, y, boardId });
  });

  socket.on('disconnect', () => {});
});

// --- HTTP API ---
function checkAdmin(req, res, next) {
  const pwd = req.body.password || req.query.password;
  if (pwd !== ADMIN_PASSWORD) return res.status(403).json({ error: 'Неверный пароль' });
  next();
}

app.get('/api/public-config', (req, res) => {
  res.json({ config: gameState.config, teams: gameState.teams, boards: gameState.boards });
});

app.get('/api/config', checkAdmin, (req, res) => {
  res.json({ config: gameState.config, teams: gameState.teams });
});

app.post('/api/config', checkAdmin, (req, res) => {
  const { mode, theme, roundDuration, teams } = req.body;
  if (mode) gameState.config.mode = mode;
  if (theme) gameState.config.theme = theme;
  if (roundDuration) gameState.config.roundDuration = roundDuration;
  if (teams) teams.forEach(t => {
    const team = gameState.teams.find(tm => tm.id === t.id);
    if (team) { team.name = t.name || team.name; team.color = t.color || team.color; }
  });
  db.gameConfig = { ...gameState.config };
  db.teams = gameState.teams.map(t => ({ id: t.id, name: t.name, color: t.color, score: t.score }));
  saveDB(db);
  io.emit('configUpdate', { config: gameState.config, teams: gameState.teams });
  res.json({ success: true });
});

app.post('/api/start', checkAdmin, (req, res) => {
  if (gameState.config.isRunning) return res.json({ success: false, message: 'Уже идёт' });
  gameState.teams.forEach(t => t.score = 0);
  configureBoardsForMode();
  initActiveGames();
  gameState.config.isRunning = true;
  gameState.roundEndTime = Date.now() + gameState.config.roundDuration * 1000;
  io.emit('gameStarted', { duration: gameState.config.roundDuration });
  res.json({ success: true });
});

app.post('/api/stop', checkAdmin, (req, res) => {
  gameState.config.isRunning = false;
  io.emit('gameStopped', { scores: gameState.teams.map(t => ({ id: t.id, score: t.score })) });
  res.json({ success: true });
});

app.post('/api/reset', checkAdmin, (req, res) => {
  gameState.teams.forEach(t => t.score = 0);
  initActiveGames();
  io.emit('scoreUpdate', gameState.teams.map(t => ({ id: t.id, score: t.score })));
  res.json({ success: true });
});

setInterval(() => {
  if (gameState.config.isRunning && Date.now() >= gameState.roundEndTime) {
    gameState.config.isRunning = false;
    io.emit('roundEnd', { scores: gameState.teams.map(t => ({ id: t.id, score: t.score })) });
  }
}, 1000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Сервер на порту ${PORT}`);
  configureBoardsForMode();
  initActiveGames();
});