// Загружаем темы
fetch('/themes')
    .then(function(r) { return r.json(); })
    .then(function(data) {
        var sel = document.getElementById('themeSelect');
        data.themes.forEach(function(t) {
            var o = document.createElement('option');
            o.value = t;
            o.textContent = t;
            sel.appendChild(o);
        });
        sel.value = data.currentTheme;
    });

// Загружаем конфигурацию
fetch('/config')
    .then(function(r) { return r.json(); })
    .then(function(data) {
        document.getElementById('gameModeSelect').value = data.gameConfig.mode;
        document.getElementById('roundDurationInput').value = data.gameConfig.roundDuration;
        data.teams.forEach(function(t, i) {
            var n = i + 1;
            var nl = document.getElementById('team' + n + 'NameLabel');
            var sl = document.getElementById('team' + n + 'ScoreLabel');
            if (t.name) nl.textContent = 'Команда ' + n + ': ' + t.name;
            sl.textContent = 'Счет: ' + t.score;
        });
    });

// Обновление оставшегося времени
function updateTimer() {
    fetch('/board/state')
        .then(function(r) { return r.json(); })
        .then(function(d) {
            var mins = Math.floor(d.remaining / 60);
            var secs = d.remaining % 60;
            document.getElementById('timerDisplay').textContent =
                String(mins).padStart(2, '0') + ':' + String(secs).padStart(2, '0');
        });
}
setInterval(updateTimer, 1000);
updateTimer();

// Изменение режима игры
document.getElementById('gameModeSelect').addEventListener('change', function() {
    fetch('/game-mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: this.value })
    });
});

// Изменение темы
document.getElementById('themeSelect').addEventListener('change', function() {
    fetch('/theme', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: this.value })
    });
});

// Изменение длительности раунда (сразу сохраняется)
document.getElementById('roundDurationInput').addEventListener('change', function() {
    var val = parseInt(this.value, 10);
    if (!isNaN(val) && val >= 10) {
        fetch('/round-duration', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key: val })
        });
    } else {
        alert('Минимальная длительность 10 секунд');
        fetch('/config')
            .then(function(r) { return r.json(); })
            .then(function(data) {
                document.getElementById('roundDurationInput').value = data.gameConfig.roundDuration;
            });
    }
});

// Переименование команд
document.getElementById('teamsContainer').addEventListener('click', function(e) {
    var id = e.target.id;
    if (id.indexOf('RenameBtn') !== -1) {
        var n = id.match(/\d+/)[0];
        var name = prompt('Новое название:');
        if (name) {
            fetch('/team/' + n + '/name', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ key: name })
            })
                .then(function() {
                    document.getElementById('team' + n + 'NameLabel').textContent = 'Команда ' + n + ': ' + name;
                });
        }
    }
});

// Управление игрой
document.getElementById('isRunning').addEventListener('click', function(e) {
    var id = e.target.id;
    var a = '';
    if (id.indexOf('start') !== -1) a = 'start game';
    else if (id.indexOf('stop') !== -1) a = 'stop game';
    else if (id.indexOf('resume') !== -1) a = 'resume game';
    else if (id.indexOf('shutdown') !== -1) a = 'shutdown game';
    if (a) {
        fetch('/game/process', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key: a })
        });
    }
});