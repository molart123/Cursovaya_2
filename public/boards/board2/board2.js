var area1 = document.getElementById('gameArea1');
var area2 = document.getElementById('gameArea2');
var timerDisplay = document.getElementById('timerDisplay');
var name1 = document.getElementById('teamNameDisplay1');
var score1 = document.getElementById('scoreDisplay1');
var name2 = document.getElementById('teamNameDisplay2');
var score2 = document.getElementById('scoreDisplay2');
var message1 = document.getElementById('messageOverlay1');
var message2 = document.getElementById('messageOverlay2');

var enemies1 = [], enemies2 = [];
var textures = {};
var spawnInterval1 = null, spawnInterval2 = null;
var animFrame1 = null, animFrame2 = null;
var lastTimestamp1 = 0, lastTimestamp2 = 0;
var gameActive = false;
var gamePaused = false;
var currentMode = '';

function getState() {
    return fetch('/board/state').then(r => r.json());
}
function addScore(teamId, points) {
    fetch('/board/score', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({teamId:teamId, points:points})
    });
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
        life: life, maxLife: life, element: el,
        x: Math.random() * 80 + 10, y: Math.random() * 80 + 10,
        vx: (Math.random() - 0.5) * 6, vy: (Math.random() - 0.5) * 6
    };
    el.style.left = enemy.x + '%';
    el.style.top = enemy.y + '%';
    area.appendChild(el);
    list.push(enemy);
}

function startSpawning(area, list, teamId) {
    if (area.style.display !== 'block') return;
    createEnemy(area, list);
    var interval = setInterval(() => {
        if (!gameActive || gamePaused) return;
        if (area.style.display !== 'block') return;
        if (list.length >= 12) return;
        createEnemy(area, list);
    }, 1000);
    if (teamId === 1) spawnInterval1 = interval;
    else spawnInterval2 = interval;
}

function stopSpawning(teamId) {
    if (teamId === 1 && spawnInterval1) {
        clearInterval(spawnInterval1);
        spawnInterval1 = null;
    }
    if (teamId === 2 && spawnInterval2) {
        clearInterval(spawnInterval2);
        spawnInterval2 = null;
    }
}

// Анимация для одной области (запускается один раз и никогда не останавливается)
function animate(area, list, teamId, timestamp) {
    if (!gameActive || gamePaused) {
        // Не обновляем координаты, но продолжаем цикл
        if (teamId === 1) animFrame1 = requestAnimationFrame(t => animate(area1, enemies1, 1, t));
        else animFrame2 = requestAnimationFrame(t => animate(area2, enemies2, 2, t));
        return;
    }
    var lastTime = teamId === 1 ? lastTimestamp1 : lastTimestamp2;
    var dt = lastTime ? Math.min(0.05, (timestamp - lastTime) / 1000) : 0;
    if (teamId === 1) lastTimestamp1 = timestamp; else lastTimestamp2 = timestamp;
    for (var i = 0; i < list.length; i++) {
        var enemy = list[i];
        enemy.x += enemy.vx * dt;
        enemy.y += enemy.vy * dt;
        if (enemy.x < 0 || enemy.x > 94) { enemy.vx *= -1; enemy.x = Math.max(0, Math.min(94, enemy.x)); }
        if (enemy.y < 0 || enemy.y > 94) { enemy.vy *= -1; enemy.y = Math.max(0, Math.min(94, enemy.y)); }
        enemy.element.style.left = enemy.x + '%';
        enemy.element.style.top = enemy.y + '%';
    }
    if (teamId === 1) animFrame1 = requestAnimationFrame(t => animate(area1, enemies1, 1, t));
    else animFrame2 = requestAnimationFrame(t => animate(area2, enemies2, 2, t));
}

function shoot(area, list, teamId, event) {
    if (!gameActive || gamePaused) return;
    var rect = area.getBoundingClientRect();
    var x = event.clientX, y = event.clientY;
    var marker = document.createElement('div');
    marker.className = 'hit-marker';
    marker.style.left = (x - rect.left) + 'px';
    marker.style.top = (y - rect.top) + 'px';
    area.appendChild(marker);
    marker.addEventListener('animationend', function() { marker.remove(); });
    var clickX = ((x - rect.left) / rect.width) * 100;
    var clickY = ((y - rect.top) / rect.height) * 100;
    for (var i = list.length - 1; i >= 0; i--) {
        var enemy = list[i];
        var er = enemy.element.getBoundingClientRect();
        var cx = ((er.left + er.width / 2) - rect.left) / rect.width * 100;
        var cy = ((er.top + er.height / 2) - rect.top) / rect.height * 100;
        var rx = (er.width / rect.width * 100) / 2;
        var ry = (er.height / rect.height * 100) / 2;
        if (Math.abs(clickX - cx) <= rx && Math.abs(clickY - cy) <= ry) {
            enemy.life--;
            if (enemy.life <= 0) {
                var points = enemy.maxLife === 1 ? 5 : (enemy.maxLife === 2 ? 10 : 20);
                var sendId;
                if (currentMode === '2board2team') sendId = '2';
                else if (currentMode === '2board4team') sendId = teamId === '1' ? '3' : '4';
                else sendId = '1';
                addScore(sendId, points);
                var sd = teamId === '1' ? score1 : score2;
                sd.textContent = 'Очки: ' + (parseInt(sd.textContent.split(': ')[1]) + points);
                enemy.element.remove();
                list.splice(i, 1);
            }
            break;
        }
    }
}

function fullReset() {
    enemies1.forEach(e => e.element.remove()); enemies1 = [];
    enemies2.forEach(e => e.element.remove()); enemies2 = [];
    if (spawnInterval1) clearInterval(spawnInterval1);
    if (spawnInterval2) clearInterval(spawnInterval2);
    spawnInterval1 = null; spawnInterval2 = null;
    gameActive = false;
    gamePaused = true;
    lastTimestamp1 = 0; lastTimestamp2 = 0;
}

function startGame() {
    if (gameActive && gamePaused) {
        gamePaused = false;
        lastTimestamp1 = 0; lastTimestamp2 = 0;
        if (area1.style.display === 'block' && !spawnInterval1) startSpawning(area1, enemies1, 1);
        if (area2.style.display === 'block' && !spawnInterval2) startSpawning(area2, enemies2, 2);
        return;
    }
    fullReset();
    gameActive = true;
    gamePaused = false;
    lastTimestamp1 = 0; lastTimestamp2 = 0;
    if (area1.style.display === 'block') startSpawning(area1, enemies1, 1);
    if (area2.style.display === 'block') startSpawning(area2, enemies2, 2);
}

function pauseGame() {
    if (!gameActive) return;
    gamePaused = true;
    if (spawnInterval1) clearInterval(spawnInterval1);
    if (spawnInterval2) clearInterval(spawnInterval2);
    spawnInterval1 = null; spawnInterval2 = null;
}

function showMessages(text) {
    if (area1.style.display !== 'none') { message1.style.display = 'block'; message1.textContent = text; }
    if (area2.style.display !== 'none') { message2.style.display = 'block'; message2.textContent = text; }
}
function hideMessages() { message1.style.display = 'none'; message2.style.display = 'none'; }

area1.addEventListener('click', e => shoot(area1, enemies1, '1', e));
area2.addEventListener('click', e => shoot(area2, enemies2, '2', e));

// ЗАПУСКАЕМ АНИМАЦИЮ ДЛЯ ОБЕИХ ОБЛАСТЕЙ (ОДИН РАЗ)
animFrame1 = requestAnimationFrame(t => animate(area1, enemies1, 1, t));
animFrame2 = requestAnimationFrame(t => animate(area2, enemies2, 2, t));

function update() {
    getState().then(state => {
        textures = state.enemies || {};
        currentMode = state.mode;
        var mins = Math.floor(state.remaining / 60);
        var secs = state.remaining % 60;
        timerDisplay.textContent = String(mins).padStart(2, '0') + ':' + String(secs).padStart(2, '0');
        if (state.background) document.body.style.background = "url('" + state.background + "') center/cover no-repeat";
        else document.body.style.background = '#222';

        if (currentMode === '1board1team') {
            area1.style.display = 'none';
            area2.style.display = 'none';
            timerDisplay.style.display = 'none';
            fullReset();
            return;
        }
        timerDisplay.style.display = 'block';

        if (currentMode === '2board1team') {
            area1.style.display = 'block';
            area2.style.display = 'none';
            name1.textContent = state.teams[0].name || 'Команда 1';
            score1.textContent = 'Очки: ' + state.teams[0].score;
        } else if (currentMode === '2board2team') {
            area1.style.display = 'block';
            area2.style.display = 'none';
            name1.textContent = state.teams[1].name || 'Команда 2';
            score1.textContent = 'Очки: ' + state.teams[1].score;
        } else if (currentMode === '2board4team') {
            area1.style.display = 'block';
            area2.style.display = 'block';
            name1.textContent = state.teams[2].name || 'Команда 3';
            score1.textContent = 'Очки: ' + state.teams[2].score;
            name2.textContent = state.teams[3].name || 'Команда 4';
            score2.textContent = 'Очки: ' + state.teams[3].score;
        }

        if (state.status === 'active') {
            if (!gameActive || gamePaused) startGame();
            hideMessages();
        } else if (state.status === 'paused') {
            if (gameActive && !gamePaused) { pauseGame(); showMessages('ПАУЗА'); }
        } else if (state.status === 'finished') {
            fullReset();
            showMessages('Игра окончена!');
        } else {
            fullReset();
            showMessages('Ожидание запуска...');
        }
    });
}

update();
setInterval(update, 1000);