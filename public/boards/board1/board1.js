var area1 = document.getElementById('gameArea1');
var area2 = document.getElementById('gameArea2');
var timerDisplay = document.getElementById('timerDisplay');
var name1 = document.getElementById('teamNameDisplay1');
var score1 = document.getElementById('scoreDisplay1');
var name2 = document.getElementById('teamNameDisplay2');
var score2 = document.getElementById('scoreDisplay2');
var message1 = document.getElementById('messageOverlay1');
var message2 = document.getElementById('messageOverlay2');

var enemies1 = [];
var enemies2 = [];
var textures = {};
var spawnInterval1 = null;
var spawnInterval2 = null;
var animId1 = null;
var animId2 = null;
var lastTime1 = 0;
var lastTime2 = 0;
var isSpawning = false;

function getState() {
    return fetch('/board/state').then(function(res) {
        return res.json();
    });
}

function addScore(teamId, points) {
    fetch('/board/score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamId: teamId, points: points })
    });
}

function update() {
    getState().then(function(state) {
        textures = state.enemies || {};
        var mode = state.mode;
        var mins = Math.floor(state.remaining / 60);
        var secs = state.remaining % 60;
        timerDisplay.textContent = String(mins).padStart(2, '0') + ':' + String(secs).padStart(2, '0');

        // Режимы
        if (mode === '2board4team') {
            area1.style.display = 'block';
            area2.style.display = 'block';
            name1.textContent = state.teams[0].name || 'Команда 1';
            score1.textContent = 'Очки: ' + state.teams[0].score;
            name2.textContent = state.teams[1].name || 'Команда 2';
            score2.textContent = 'Очки: ' + state.teams[1].score;
        } else {
            area1.style.display = 'block';
            area2.style.display = 'none';
            name1.textContent = state.teams[0].name || 'Команда 1';
            score1.textContent = 'Очки: ' + state.teams[0].score;
        }

        // Статус из базы данных
        if (state.status === 'active') {
            if (!isSpawning) {
                clearAll();
                startSpawning();
            }
            hideMessages();
        } else if (state.status === 'paused') {
            stopAnimation();
            isSpawning = false;
            showMessages('ПАУЗА');
        } else if (state.status === 'finished') {
            stopAll();
            showMessages('Игра окончена!');
        } else {
            stopAll();
            showMessages('Ожидание запуска...');
        }
    });
}

function clearAll() {
    enemies1.forEach(function(e) { e.element.remove(); });
    enemies1 = [];
    enemies2.forEach(function(e) { e.element.remove(); });
    enemies2 = [];
    stopAnimation();
}

function stopAll() {
    clearAll();
    if (spawnInterval1) { clearInterval(spawnInterval1); spawnInterval1 = null; }
    if (spawnInterval2) { clearInterval(spawnInterval2); spawnInterval2 = null; }
    isSpawning = false;
}

function stopAnimation() {
    if (animId1) { cancelAnimationFrame(animId1); animId1 = null; }
    if (animId2) { cancelAnimationFrame(animId2); animId2 = null; }
}

function startSpawning() {
    isSpawning = true;
    spawnEnemy(area1, enemies1, 1);
    spawnEnemy(area2, enemies2, 2);
    animId1 = requestAnimationFrame(function(ts) { move(area1, enemies1, ts, 1); });
    if (area2.style.display === 'block') {
        animId2 = requestAnimationFrame(function(ts) { move(area2, enemies2, ts, 2); });
    }
}

function spawnEnemy(area, list, teamId) {
    if (area.style.display === 'none') return;
    createEnemy(area, list);
    var interval = setInterval(function() {
        if (!isSpawning || area.style.display === 'none' || list.length >= 12) return;
        createEnemy(area, list);
    }, 1000);
    if (teamId === 1) spawnInterval1 = interval;
    else spawnInterval2 = interval;
}

function createEnemy(area, list) {
    var rand = Math.random();
    var life, cssClass;
    if (rand < 0.6) { life = 1; cssClass = 'easy'; }
    else if (rand < 0.85) { life = 2; cssClass = 'medium'; }
    else { life = 3; cssClass = 'hard'; }

    var el = document.createElement('div');
    el.className = 'enemy ' + cssClass;

    var imgKey = cssClass === 'easy' ? 'small_enemy' : (cssClass === 'medium' ? 'medium_enemy' : 'big_enemy');
    if (textures[imgKey]) {
        el.style.backgroundImage = "url('" + textures[imgKey] + "')";
        el.style.backgroundSize = 'contain';
        el.style.backgroundRepeat = 'no-repeat';
        el.style.backgroundPosition = 'center';
    } else {
        el.style.background = cssClass === 'easy' ? '#4caf50' : (cssClass === 'medium' ? '#ffeb3b' : '#f44336');
    }

    var enemy = {
        life: life,
        maxLife: life,
        element: el,
        x: Math.random() * 80 + 10,
        y: Math.random() * 80 + 10,
        vx: (Math.random() - 0.5) * 6,
        vy: (Math.random() - 0.5) * 6
    };

    el.style.left = enemy.x + '%';
    el.style.top = enemy.y + '%';
    area.appendChild(el);
    list.push(enemy);
}

function move(area, list, ts, teamId) {
    if (!isSpawning) return;

    var lastTime = teamId === 1 ? lastTime1 : lastTime2;
    var dt = lastTime ? (ts - lastTime) / 1000 : 0;
    if (teamId === 1) lastTime1 = ts;
    else lastTime2 = ts;

    list.forEach(function(enemy) {
        enemy.x = enemy.x + enemy.vx * dt;
        enemy.y = enemy.y + enemy.vy * dt;
        if (enemy.x < 0 || enemy.x > 94) { enemy.vx = enemy.vx * -1; enemy.x = Math.max(0, Math.min(94, enemy.x)); }
        if (enemy.y < 0 || enemy.y > 94) { enemy.vy = enemy.vy * -1; enemy.y = Math.max(0, Math.min(94, enemy.y)); }
        enemy.element.style.left = enemy.x + '%';
        enemy.element.style.top = enemy.y + '%';
    });

    if (teamId === 1) {
        animId1 = requestAnimationFrame(function(ts) { move(area, enemies1, ts, 1); });
    } else {
        animId2 = requestAnimationFrame(function(ts) { move(area, enemies2, ts, 2); });
    }
}

function shoot(area, list, teamId, event) {
    if (!isSpawning) return;

    var rect = area.getBoundingClientRect();
    var clickX = ((event.clientX - rect.left) / rect.width) * 100;
    var clickY = ((event.clientY - rect.top) / rect.height) * 100;

    for (var i = list.length - 1; i >= 0; i--) {
        var enemy = list[i];
        var enemyRect = enemy.element.getBoundingClientRect();
        var enemyCenterX = ((enemyRect.left + enemyRect.width / 2) - rect.left) / rect.width * 100;
        var enemyCenterY = ((enemyRect.top + enemyRect.height / 2) - rect.top) / rect.height * 100;
        var radiusX = (enemyRect.width / rect.width * 100) / 2;
        var radiusY = (enemyRect.height / rect.height * 100) / 2;

        if (Math.abs(clickX - enemyCenterX) <= radiusX && Math.abs(clickY - enemyCenterY) <= radiusY) {
            enemy.life = enemy.life - 1;
            if (enemy.life <= 0) {
                var points = enemy.maxLife === 1 ? 5 : (enemy.maxLife === 2 ? 10 : 20);
                addScore(teamId, points);
                var scoreDisplay = teamId === '1' ? score1 : score2;
                var currentScore = parseInt(scoreDisplay.textContent.split(': ')[1]);
                scoreDisplay.textContent = 'Очки: ' + (currentScore + points);
                enemy.element.remove();
                list.splice(i, 1);
            }
            break;
        }
    }
}

function showMessages(text) {
    if (area1.style.display !== 'none') {
        message1.style.display = 'block';
        message1.textContent = text;
    }
    if (area2.style.display !== 'none') {
        message2.style.display = 'block';
        message2.textContent = text;
    }
}

function hideMessages() {
    message1.style.display = 'none';
    message2.style.display = 'none';
}

area1.addEventListener('click', function(e) { shoot(area1, enemies1, '1', e); });
area2.addEventListener('click', function(e) { shoot(area2, enemies2, '2', e); });

update();
setInterval(update, 1000);