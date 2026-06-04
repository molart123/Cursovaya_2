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
var animId1 = null, animId2 = null;
var lastTime1 = 0, lastTime2 = 0;
var currentMode = '';
var paused = true;
var spawning = false;
var gameActive = false;

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

function update() {
    getState().then(state => {
        textures = state.enemies || {};
        currentMode = state.mode;
        var mins = Math.floor(state.remaining/60);
        var secs = state.remaining%60;
        timerDisplay.textContent = String(mins).padStart(2,'0')+':'+String(secs).padStart(2,'0');

        if (state.background) {
            document.body.style.background = "url('" + state.background + "') center/cover no-repeat";
        } else {
            document.body.style.background = '#222';
        }

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
            if (!gameActive) {
                fullReset();
                startSpawning();
                paused = false;
                gameActive = true;
                lastTime1 = 0;
                lastTime2 = 0;
            } else if (paused) {
                paused = false;
                startSpawning();
                lastTime1 = 0;
                lastTime2 = 0;
            }
            hideMessages();
        }
        else if (state.status === 'paused') {
            if (!paused) {
                paused = true;
                stopSpawning();
                showMessages('ПАУЗА');
            }
        }
        else if (state.status === 'finished') {
            fullReset();
            gameActive = false;
            showMessages('Игра окончена!');
        }
        else {
            fullReset();
            gameActive = false;
            showMessages('Ожидание запуска...');
        }
    });
}

function fullReset() {
    enemies1.forEach(e => e.element.remove());
    enemies2.forEach(e => e.element.remove());
    enemies1 = [];
    enemies2 = [];
    stopSpawning();
    paused = true;
    spawning = false;
    lastTime1 = 0;
    lastTime2 = 0;
}

function stopSpawning() {
    if (spawnInterval1) { clearInterval(spawnInterval1); spawnInterval1 = null; }
    if (spawnInterval2) { clearInterval(spawnInterval2); spawnInterval2 = null; }
    spawning = false;
}

function startSpawning() {
    if (spawning) return;
    spawning = true;
    if (area1.style.display !== 'none') {
        spawnEnemy(area1, enemies1, 1);
        spawnInterval1 = setInterval(() => {
            if (!spawning || area1.style.display === 'none' || enemies1.length >= 12) return;
            createEnemy(area1, enemies1);
        }, 1000);
    }
    if (area2.style.display === 'block') {
        spawnEnemy(area2, enemies2, 2);
        spawnInterval2 = setInterval(() => {
            if (!spawning || area2.style.display === 'none' || enemies2.length >= 12) return;
            createEnemy(area2, enemies2);
        }, 1000);
    }
}

function spawnEnemy(area, list, teamId) {
    if (area.style.display === 'none') return;
    createEnemy(area, list);
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

function move(area, list, ts, teamId) {
    if (!paused && gameActive) {
        var lastTime = teamId === 1 ? lastTime1 : lastTime2;
        var dt = lastTime ? (ts - lastTime) / 1000 : 0;
        if (teamId === 1) lastTime1 = ts; else lastTime2 = ts;
        for (var i = 0; i < list.length; i++) {
            var enemy = list[i];
            enemy.x += enemy.vx * dt;
            enemy.y += enemy.vy * dt;
            if (enemy.x < 0 || enemy.x > 94) { enemy.vx *= -1; enemy.x = Math.max(0, Math.min(94, enemy.x)); }
            if (enemy.y < 0 || enemy.y > 94) { enemy.vy *= -1; enemy.y = Math.max(0, Math.min(94, enemy.y)); }
            enemy.element.style.left = enemy.x + '%';
            enemy.element.style.top = enemy.y + '%';
        }
    }
    // Продолжаем анимацию
    if (teamId === 1) {
        animId1 = requestAnimationFrame(ts => move(area1, enemies1, ts, 1));
    } else {
        animId2 = requestAnimationFrame(ts => move(area2, enemies2, ts, 2));
    }
}

function shoot(area, list, teamId, event) {
    if (paused || !gameActive) return;
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

function showMessages(text) {
    if (area1.style.display !== 'none') { message1.style.display = 'block'; message1.textContent = text; }
    if (area2.style.display !== 'none') { message2.style.display = 'block'; message2.textContent = text; }
}
function hideMessages() { message1.style.display = 'none'; message2.style.display = 'none'; }

area1.addEventListener('click', e => shoot(area1, enemies1, '1', e));
area2.addEventListener('click', e => shoot(area2, enemies2, '2', e));

animId1 = requestAnimationFrame(ts => move(area1, enemies1, ts, 1));
if (area2.style.display === 'block') {
    animId2 = requestAnimationFrame(ts => move(area2, enemies2, ts, 2));
}

update();
setInterval(update, 1000);