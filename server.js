var express = require('express');
var fs = require('fs');
var path = require('path');
var multer = require('multer');
var session = require('express-session');
var bcrypt = require('bcrypt');
var crypto = require('crypto');
var app = express();
var PORT = 3000;

app.use(session({
    secret: 'laser-game-secret-key-change-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, httpOnly: true, maxAge: 8 * 60 * 60 * 1000 }
}));

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const USERS_FILE = path.join(__dirname, 'users.json');
function loadUsers() {
    if (!fs.existsSync(USERS_FILE)) return {};
    return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
}
function saveUsers(users) {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}
let users = loadUsers();

var db = JSON.parse(fs.readFileSync(path.join(__dirname, 'db.json'), 'utf8'));
if (db.gameConfig.timeRemaining === undefined) {
    db.gameConfig.timeRemaining = db.gameConfig.roundDuration;
    saveDB();
}
if (!db.gameConfig.boardAuthToken) {
    db.gameConfig.boardAuthToken = crypto.randomBytes(32).toString('hex');
    saveDB();
}
var timerInterval = null;
function saveDB() {
    fs.writeFileSync(path.join(__dirname, 'db.json'), JSON.stringify(db, null, 2));
}
function startServerTimer() {
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        if (db.gameConfig.isRunning) {
            db.gameConfig.timeRemaining--;
            if (db.gameConfig.timeRemaining <= 0) {
                db.gameConfig.timeRemaining = 0;
                db.gameConfig.isRunning = false;
                clearInterval(timerInterval);
                timerInterval = null;
            }
            saveDB();
        }
    }, 1000);
}
function stopGame() {
    db.gameConfig.isRunning = false;
    db.gameConfig.isStarting = false;
    db.gameConfig.timeRemaining = db.gameConfig.roundDuration;
    db.teams.forEach(t => t.score = 0);
    if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
    saveDB();
}
if (db.gameConfig.isRunning && db.gameConfig.timeRemaining > 0) {
    startServerTimer();
}

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        let themeName = req.body.name;
        if (!themeName && req.params.name) themeName = req.params.name;
        if (!themeName) return cb(new Error('Theme name is required'));
        const themeDir = path.join(__dirname, 'public', 'themes', themeName);
        if (!fs.existsSync(themeDir)) fs.mkdirSync(themeDir, { recursive: true });
        cb(null, themeDir);
    },
    filename: function (req, file, cb) {
        cb(null, file.fieldname + path.extname(file.originalname));
    }
});
const upload = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
        if (allowed.includes(file.mimetype)) cb(null, true);
        else cb(new Error('Only images are allowed'));
    }
});

function requireAuth(req, res, next) {
    if (req.session?.user && (req.session.user.role === 'admin' || req.session.user.role === 'superadmin')) {
        next();
    } else {
        res.status(401).json({ error: 'Unauthorized' });
    }
}
function requireSuperAdmin(req, res, next) {
    if (req.session?.user?.role === 'superadmin') {
        next();
    } else {
        res.status(403).json({ error: 'Forbidden: superadmin rights required' });
    }
}

function startServer() {
    app.get('/admin/admin.html', (req, res, next) => {
        if (req.session.user) next();
        else res.redirect('/admin/login.html');
    });
    app.use('/admin/admin.html', express.static(path.join(__dirname, 'public/admin/admin.html')));
    app.use('/admin/admin.js', express.static(path.join(__dirname, 'public/admin/admin.js')));
    app.use('/admin/admin.css', express.static(path.join(__dirname, 'public/admin/admin.css')));
    app.use('/admin/login.html', express.static(path.join(__dirname, 'public/admin/login.html')));

    app.post('/admin/login', (req, res) => {
        const { login, password } = req.body;
        if (!login || !password) return res.status(400).json({ error: 'Login and password required' });
        const user = users[login];
        if (!user) return res.status(401).json({ error: 'Invalid credentials' });
        bcrypt.compare(password, user.password, (err, result) => {
            if (err || !result) return res.status(401).json({ error: 'Invalid credentials' });
            req.session.user = { login: login, role: user.role };
            res.json({ ok: true, role: user.role });
        });
    });
    app.post('/admin/logout', (req, res) => {
        req.session.destroy();
        res.json({ ok: true });
    });
    app.get('/admin/check', (req, res) => {
        if (req.session.user) res.json({ authenticated: true, role: req.session.user.role });
        else res.json({ authenticated: false });
    });
    app.post('/admin/users', requireSuperAdmin, (req, res) => {
        const { login, password, role } = req.body;
        if (!login || !password) return res.status(400).json({ error: 'Login and password required' });
        if (!/^[a-zA-Z0-9_]+$/.test(login)) return res.status(400).json({ error: 'Invalid login' });
        if (users[login]) return res.status(400).json({ error: 'User already exists' });
        if (role !== 'admin' && role !== 'superadmin') return res.status(400).json({ error: 'Invalid role' });
        bcrypt.hash(password, 10, (err, hash) => {
            if (err) return res.status(500).json({ error: err.message });
            users[login] = { password: hash, role: role };
            saveUsers(users);
            res.json({ ok: true });
        });
    });
    app.get('/admin/users', requireSuperAdmin, (req, res) => {
        const userList = Object.keys(users).map(login => ({ login, role: users[login].role }));
        res.json({ users: userList });
    });
    app.delete('/admin/users/:login', requireSuperAdmin, (req, res) => {
        const login = req.params.login;
        if (!users[login]) return res.status(404).json({ error: 'User not found' });
        if (login === req.session.user.login) return res.status(400).json({ error: 'Cannot delete yourself' });
        delete users[login];
        saveUsers(users);
        res.json({ ok: true });
    });

    app.get('/config', (req, res) => { res.json(db); });
    app.get('/themes', (req, res) => {
        res.json({ themes: Object.keys(db.themes), currentTheme: db.gameConfig.theme });
    });
    app.post('/game-mode', requireAuth, (req, res) => {
        db.gameConfig.mode = req.body.key;
        stopGame();
        res.json({ ok: true });
    });
    app.post('/theme', requireAuth, (req, res) => {
        db.gameConfig.theme = req.body.key;
        stopGame();
        res.json({ ok: true });
    });
    app.post('/team/:id/name', requireAuth, (req, res) => {
        const index = parseInt(req.params.id) - 1;
        db.teams[index].name = req.body.key;
        saveDB();
        res.json({ ok: true });
    });
    app.post('/round-duration', requireAuth, (req, res) => {
        const val = parseInt(req.body.key, 10);
        if (val >= 10) {
            db.gameConfig.roundDuration = val;
            stopGame();
            res.json({ ok: true });
        } else {
            res.status(400).json({ ok: false, message: 'Минимум 10 секунд' });
        }
    });
    app.post('/game/process', requireAuth, (req, res) => {
        const key = req.body.key;
        if (key === 'start game') {
            db.gameConfig.isStarting = true;
            db.gameConfig.isRunning = true;
            db.gameConfig.timeRemaining = db.gameConfig.roundDuration;
            db.teams.forEach(t => t.score = 0);
            startServerTimer();
        } else if (key === 'stop game') {
            db.gameConfig.isRunning = false;
            if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
        } else if (key === 'resume game') {
            if (!db.gameConfig.isRunning && db.gameConfig.isStarting && db.gameConfig.timeRemaining > 0) {
                db.gameConfig.isRunning = true;
                startServerTimer();
            }
        } else if (key === 'shutdown game') {
            stopGame();
        }
        saveDB();
        res.json({ ok: true });
    });
    app.get('/board/state', (req, res) => {
        const theme = db.gameConfig.theme;
        const raw = db.themes[theme] || {};
        const background = raw.background ? '/' + raw.background : null;
        const enemies = {};
        for (let key in raw) if (key !== 'background') enemies[key] = '/' + raw[key];
        let status = 'stopped';
        if (db.gameConfig.isRunning && db.gameConfig.timeRemaining > 0) status = 'active';
        else if (!db.gameConfig.isRunning && db.gameConfig.isStarting && db.gameConfig.timeRemaining > 0) status = 'paused';
        else if (db.gameConfig.timeRemaining <= 0 && db.gameConfig.isStarting) status = 'finished';
        else if (!db.gameConfig.isStarting) status = 'shutdown';
        res.json({
            mode: db.gameConfig.mode,
            theme: theme,
            background: background,
            enemies: enemies,
            teams: db.teams.map(t => ({ name: t.name, score: t.score })),
            remaining: db.gameConfig.timeRemaining,
            status: status,
            boardAuthToken: db.gameConfig.boardAuthToken
        });
    });
    app.post('/board/score', requireAuth, (req, res) => {
        const index = parseInt(req.body.teamId) - 1;
        if (index >= 0 && index < db.teams.length) {
            db.teams[index].score += req.body.points;
            saveDB();
            res.json({ ok: true, score: db.teams[index].score });
        } else res.status(400).json({ ok: false });
    });

    // CRUD тем
    app.get('/admin/themes', requireAuth, (req, res) => { res.json({ themes: db.themes }); });
    app.post('/admin/themes', requireAuth, upload.fields([{name:'small_enemy'},{name:'medium_enemy'},{name:'big_enemy'},{name:'background'}]), (req, res) => {
        try {
            let themeName = req.body.name;
            if (!themeName || !/^[a-zA-Z0-9_-]+$/.test(themeName)) return res.status(400).json({ error: 'Invalid theme name' });
            if (db.themes[themeName]) return res.status(400).json({ error: 'Theme exists' });
            if (!req.files['small_enemy'] || !req.files['medium_enemy'] || !req.files['big_enemy']) {
                return res.status(400).json({ error: 'Missing enemy images' });
            }
            const newTheme = {};
            newTheme.small_enemy = `themes/${themeName}/${req.files['small_enemy'][0].filename}`;
            newTheme.medium_enemy = `themes/${themeName}/${req.files['medium_enemy'][0].filename}`;
            newTheme.big_enemy = `themes/${themeName}/${req.files['big_enemy'][0].filename}`;
            if (req.files['background']) newTheme.background = `themes/${themeName}/${req.files['background'][0].filename}`;
            db.themes[themeName] = newTheme;
            saveDB();
            res.json({ ok: true });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });
    app.put('/admin/themes/:name', requireAuth, upload.fields([{name:'small_enemy'},{name:'medium_enemy'},{name:'big_enemy'},{name:'background'}]), (req, res) => {
        try {
            const oldName = req.params.name;
            let newName = req.body.name || oldName;
            if (!db.themes[oldName]) return res.status(404).json({ error: 'Theme not found' });
            if (!/^[a-zA-Z0-9_-]+$/.test(newName)) return res.status(400).json({ error: 'Invalid theme name' });
            if (newName !== oldName) {
                if (db.themes[newName]) return res.status(400).json({ error: 'Theme with new name exists' });
                const oldPath = path.join(__dirname, 'public', 'themes', oldName);
                const newPath = path.join(__dirname, 'public', 'themes', newName);
                if (fs.existsSync(oldPath)) fs.renameSync(oldPath, newPath);
                const themeData = db.themes[oldName];
                const updatedTheme = {};
                for (let [key, value] of Object.entries(themeData)) {
                    updatedTheme[key] = value.replace(`themes/${oldName}/`, `themes/${newName}/`);
                }
                db.themes[newName] = updatedTheme;
                delete db.themes[oldName];
                if (db.gameConfig.theme === oldName) db.gameConfig.theme = newName;
            }
            const currentTheme = db.themes[newName];
            if (req.files['small_enemy']) currentTheme.small_enemy = `themes/${newName}/${req.files['small_enemy'][0].filename}`;
            if (req.files['medium_enemy']) currentTheme.medium_enemy = `themes/${newName}/${req.files['medium_enemy'][0].filename}`;
            if (req.files['big_enemy']) currentTheme.big_enemy = `themes/${newName}/${req.files['big_enemy'][0].filename}`;
            if (req.files['background']) currentTheme.background = `themes/${newName}/${req.files['background'][0].filename}`;
            saveDB();
            res.json({ ok: true });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });
    app.delete('/admin/themes/:name', requireAuth, (req, res) => {
        const themeName = req.params.name;
        if (!db.themes[themeName]) return res.status(404).json({ error: 'Theme not found' });
        if (db.gameConfig.theme === themeName) return res.status(400).json({ error: 'Cannot delete active theme' });
        const themeDir = path.join(__dirname, 'public', 'themes', themeName);
        if (fs.existsSync(themeDir)) fs.rmSync(themeDir, { recursive: true, force: true });
        delete db.themes[themeName];
        saveDB();
        res.json({ ok: true });
    });

    // Аутентификация досок с токеном
    app.post('/board/auth', (req, res) => {
        const { boardId, password } = req.body;
        if (boardId !== 1 && boardId !== 2) return res.status(400).json({ error: 'Invalid boardId' });
        const correct = db.gameConfig[`board${boardId}Password`];
        if (!correct) return res.status(500).json({ error: 'Board password not set' });
        if (password === correct) {
            res.json({ ok: true, authToken: db.gameConfig.boardAuthToken });
        } else {
            res.status(401).json({ error: 'Неверный пароль' });
        }
    });

    // Смена паролей досок
    app.post('/admin/board-password', requireAuth, (req, res) => {
        const { boardId, password } = req.body;
        if (boardId !== 1 && boardId !== 2) return res.status(400).json({ error: 'Invalid boardId' });
        if (!password || password.length < 4) return res.status(400).json({ error: 'Пароль должен быть минимум 4 символа' });
        db.gameConfig[`board${boardId}Password`] = password;
        saveDB();
        res.json({ ok: true });
    });

    // Принудительная блокировка всех досок (смена токена)
    app.post('/admin/revoke-boards', requireAuth, (req, res) => {
        db.gameConfig.boardAuthToken = crypto.randomBytes(32).toString('hex');
        saveDB();
        res.json({ ok: true, newToken: db.gameConfig.boardAuthToken });
    });

    app.listen(PORT, '0.0.0.0', () => {
        console.log('========================================');
        console.log(`  Сервер запущен на порту ${PORT}`);
        console.log(`  Админка: http://localhost:${PORT}/admin/admin.html`);
        console.log(`  Доска 1: http://localhost:${PORT}/boards/board1/board1.html`);
        console.log(`  Доска 2: http://localhost:${PORT}/boards/board2/board2.html`);
        console.log('========================================');
    });
}

if (Object.keys(users).length === 0) {
    console.log('\x1b[33m%s\x1b[0m', '⚠️ Не найдено ни одного пользователя. Создание главного администратора:');
    const readline = require('readline').createInterface({ input: process.stdin, output: process.stdout });
    readline.question('Логин: ', (login) => {
        readline.question('Пароль: ', (password) => {
            bcrypt.hash(password, 10, (err, hash) => {
                if (err) throw err;
                users[login] = { password: hash, role: 'superadmin' };
                saveUsers(users);
                console.log('\x1b[32m%s\x1b[0m', `✅ Суперадмин "${login}" создан!`);
                readline.close();
                startServer();
            });
        });
    });
} else {
    startServer();
}