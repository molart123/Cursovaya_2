var express = require('express');
var fs = require('fs');
var path = require('path');
var app = express();
var PORT = 63342;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

var db = JSON.parse(fs.readFileSync(path.join(__dirname, 'db.json'), 'utf8'));

if (db.gameConfig.timeRemaining === undefined) {
    db.gameConfig.timeRemaining = db.gameConfig.roundDuration;
    saveDB();
}

var timerInterval = null;

function saveDB() {
    fs.writeFileSync(path.join(__dirname, 'db.json'), JSON.stringify(db, null, 2));
}

function startServerTimer() {
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(function() {
        if (db.gameConfig.isRunning) {
            db.gameConfig.timeRemaining = db.gameConfig.timeRemaining - 1;
            if (db.gameConfig.timeRemaining <= 0) {
                db.gameConfig.timeRemaining = 0;
                db.gameConfig.isRunning = false;
                db.gameConfig.isStarting = false;
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
    db.teams.forEach(function(t) {
        t.score = 0;
    });
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
    saveDB();
}

if (db.gameConfig.isRunning && db.gameConfig.timeRemaining > 0) {
    startServerTimer();
}

app.get('/config', function(req, res) {
    res.json(db);
});

app.get('/themes', function(req, res) {
    res.json({
        themes: Object.keys(db.themes),
        currentTheme: db.gameConfig.theme
    });
});

app.post('/game-mode', function(req, res) {
    db.gameConfig.mode = req.body.key;
    stopGame();
    res.json({ ok: true });
});

app.post('/theme', function(req, res) {
    db.gameConfig.theme = req.body.key;
    stopGame();
    res.json({ ok: true });
});

app.post('/team/:id/name', function(req, res) {
    var index = parseInt(req.params.id) - 1;
    db.teams[index].name = req.body.key;
    saveDB();
    res.json({ ok: true });
});

app.post('/round-duration', function(req, res) {
    var val = parseInt(req.body.key, 10);
    if (val >= 10) {
        db.gameConfig.roundDuration = val;
        stopGame();
        res.json({ ok: true });
    } else {
        res.status(400).json({ ok: false, message: 'Минимум 10 секунд' });
    }
});

app.post('/game/process', function(req, res) {
    var key = req.body.key;

    if (key === 'start game') {
        db.gameConfig.isStarting = true;
        db.gameConfig.isRunning = true;
        db.gameConfig.timeRemaining = db.gameConfig.roundDuration;
        db.teams.forEach(function(t) {
            t.score = 0;
        });
        startServerTimer();
    }
    else if (key === 'stop game') {
        db.gameConfig.isRunning = false;
        if (timerInterval) {
            clearInterval(timerInterval);
            timerInterval = null;
        }
    }
    else if (key === 'resume game') {
        if (!db.gameConfig.isRunning && db.gameConfig.isStarting && db.gameConfig.timeRemaining > 0) {
            db.gameConfig.isRunning = true;
            startServerTimer();
        }
    }
    else if (key === 'shutdown game') {
        stopGame();
    }

    saveDB();
    res.json({ ok: true });
});

app.get('/board/state', function(req, res) {
    var theme = db.gameConfig.theme;
    var enemiesRaw = db.themes[theme] || {};
    var enemies = {};

    for (var key in enemiesRaw) {
        enemies[key] = '/' + enemiesRaw[key];
    }

    var status = 'stopped';
    if (db.gameConfig.isRunning && db.gameConfig.timeRemaining > 0) {
        status = 'active';
    } else if (!db.gameConfig.isRunning && db.gameConfig.isStarting && db.gameConfig.timeRemaining > 0) {
        status = 'paused';
    } else if (db.gameConfig.timeRemaining <= 0 && db.gameConfig.isStarting) {
        status = 'finished';
    } else if (!db.gameConfig.isStarting) {
        status = 'shutdown';
    }

    res.json({
        mode: db.gameConfig.mode,
        theme: theme,
        enemies: enemies,
        teams: db.teams.map(function(t) {
            return { name: t.name, score: t.score };
        }),
        remaining: db.gameConfig.timeRemaining,
        status: status
    });
});

app.post('/board/score', function(req, res) {
    var index = parseInt(req.body.teamId) - 1;
    if (index >= 0 && index < db.teams.length) {
        db.teams[index].score = db.teams[index].score + req.body.points;
        saveDB();
        res.json({ ok: true, score: db.teams[index].score });
    } else {
        res.status(400).json({ ok: false });
    }
});

app.listen(PORT, function() {
    console.log('http://localhost:' + PORT);
});