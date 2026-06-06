async function checkAuth() {
    const resp = await fetch('/admin/check');
    const data = await resp.json();
    if (!data.authenticated) {
        window.location.href = '/admin/login.html';
        return null;
    }
    return data.role;
}

let currentRole = null;
checkAuth().then(role => {
    currentRole = role;
    if (currentRole === 'superadmin') {
        document.getElementById('adminManagementSection').style.display = 'block';
        loadAdminsList();
    }
    loadThemesList();
    loadConfigAndStart();
    loadBoardPasswords(); // загрузить пароли досок
});

function loadConfigAndStart() {
    fetch('/themes').then(r => r.json()).then(data => {
        const sel = document.getElementById('themeSelect');
        sel.innerHTML = '';
        data.themes.forEach(t => {
            const o = document.createElement('option');
            o.value = t;
            o.textContent = t.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
            sel.appendChild(o);
        });
        sel.value = data.currentTheme;
    });
    fetch('/config').then(r => r.json()).then(data => {
        document.getElementById('gameModeSelect').value = data.gameConfig.mode;
        document.getElementById('roundDurationInput').value = data.gameConfig.roundDuration;
        data.teams.forEach((t, i) => {
            const n = i + 1;
            document.getElementById('team' + n + 'NameLabel').textContent = (t.name || 'Команда ' + n) + ':';
            document.getElementById('team' + n + 'ScoreLabel').textContent = 'Счёт: ' + t.score;
        });
    });
}

function loadBoardPasswords() {
    fetch('/config').then(r => r.json()).then(data => {
        document.getElementById('board1PasswordInput').value = data.gameConfig.board1Password || '';
        document.getElementById('board2PasswordInput').value = data.gameConfig.board2Password || '';
    });
}

document.getElementById('setBoard1PasswordBtn').addEventListener('click', () => {
    const pwd = document.getElementById('board1PasswordInput').value.trim();
    if (!pwd) return alert('Введите пароль (минимум 4 символа)');
    fetch('/admin/board-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ boardId: 1, password: pwd })
    }).then(r => r.json()).then(data => {
        if (data.ok) alert('Пароль для доски 1 сохранён');
        else alert('Ошибка: ' + data.error);
    });
});

document.getElementById('setBoard2PasswordBtn').addEventListener('click', () => {
    const pwd = document.getElementById('board2PasswordInput').value.trim();
    if (!pwd) return alert('Введите пароль (минимум 4 символа)');
    fetch('/admin/board-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ boardId: 2, password: pwd })
    }).then(r => r.json()).then(data => {
        if (data.ok) alert('Пароль для доски 2 сохранён');
        else alert('Ошибка: ' + data.error);
    });
});

function updateTimer() {
    fetch('/board/state')
        .then(r => r.json())
        .then(d => {
            const m = Math.floor(d.remaining / 60);
            const s = d.remaining % 60;
            document.getElementById('timerDisplay').textContent = String(m).padStart(2,'0') + ':' + String(s).padStart(2,'0');
        });
}
setInterval(updateTimer, 1000);
updateTimer();

document.getElementById('gameModeSelect').addEventListener('change', function() {
    fetch('/game-mode', {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({key: this.value})
    });
});

document.getElementById('themeSelect').addEventListener('change', function() {
    fetch('/theme', {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({key: this.value})
    });
});

document.getElementById('roundDurationInput').addEventListener('change', function() {
    const v = parseInt(this.value, 10);
    if (!isNaN(v) && v >= 10) {
        fetch('/round-duration', {
            method: 'POST',
            headers: {'Content-Type':'application/json'},
            body: JSON.stringify({key: v})
        });
    } else {
        alert('Минимум 10 секунд');
        fetch('/config').then(r=>r.json()).then(d=>{
            this.value = d.gameConfig.roundDuration;
        });
    }
});

document.getElementById('teamsContainer').addEventListener('click', function(e) {
    if (e.target.id.includes('RenameBtn')) {
        const n = e.target.id.match(/\d+/)[0];
        const name = prompt('Новое название:');
        if (name) {
            fetch('/team/' + n + '/name', {
                method: 'POST',
                headers: {'Content-Type':'application/json'},
                body: JSON.stringify({key: name})
            }).then(() => {
                document.getElementById('team' + n + 'NameLabel').textContent = name + ':';
            });
        }
    }
});

document.getElementById('isRunning').addEventListener('click', function(e) {
    const id = e.target.id;
    let action = '';
    if (id.includes('start')) action = 'start game';
    else if (id.includes('stop')) action = 'stop game';
    else if (id.includes('resume')) action = 'resume game';
    else if (id.includes('shutdown')) action = 'shutdown game';
    if (action) {
        fetch('/game/process', {
            method: 'POST',
            headers: {'Content-Type':'application/json'},
            body: JSON.stringify({key: action})
        });
    }
});

document.getElementById('logoutBtn').addEventListener('click', async () => {
    await fetch('/admin/logout', { method: 'POST' });
    window.location.href = '/admin/login.html';
});

// Управление админами (superadmin)
async function loadAdminsList() {
    const resp = await fetch('/admin/users');
    const data = await resp.json();
    const container = document.getElementById('adminsList');
    container.innerHTML = '';
    for (const u of data.users) {
        const div = document.createElement('div');
        div.className = 'team-block';
        div.innerHTML = `
            <span>${u.login} (${u.role})</span>
            <button class="deleteAdminBtn" data-login="${u.login}">🗑️ Удалить</button>
        `;
        container.appendChild(div);
    }
    document.querySelectorAll('.deleteAdminBtn').forEach(btn => {
        btn.addEventListener('click', () => deleteAdmin(btn.dataset.login));
    });
}

async function deleteAdmin(login) {
    if (confirm(`Удалить администратора ${login}?`)) {
        await fetch(`/admin/users/${login}`, { method: 'DELETE' });
        loadAdminsList();
    }
}

document.getElementById('createAdminBtn')?.addEventListener('click', async () => {
    const login = document.getElementById('newAdminLogin').value;
    const password = document.getElementById('newAdminPassword').value;
    const role = document.getElementById('newAdminRole').value;
    if (!login || !password) return alert('Заполните логин и пароль');
    const resp = await fetch('/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ login, password, role })
    });
    if (resp.ok) {
        alert('Админ создан');
        document.getElementById('newAdminLogin').value = '';
        document.getElementById('newAdminPassword').value = '';
        loadAdminsList();
    } else {
        const err = await resp.json();
        alert('Ошибка: ' + err.error);
    }
});

// Управление темами
let currentEditTheme = null;

async function loadThemesList() {
    const resp = await fetch('/admin/themes');
    const data = await resp.json();
    const container = document.getElementById('themesList');
    container.innerHTML = '';
    for (let [name, content] of Object.entries(data.themes)) {
        const card = document.createElement('div');
        card.className = 'team-block';
        card.style.flexWrap = 'wrap';
        card.innerHTML = `
            <span style="flex:2;"><strong>${name}</strong><br>
            <small>small: ${content.small_enemy ? '✅' : '❌'}</small>
            <small> medium: ${content.medium_enemy ? '✅' : '❌'}</small>
            <small> big: ${content.big_enemy ? '✅' : '❌'}</small>
            <small> bg: ${content.background ? '✅' : '❌'}</small>
            </span>
            <button class="editThemeBtn" data-name="${name}">✏️ Редакт.</button>
            <button class="deleteThemeBtn" data-name="${name}" ${name === document.getElementById('themeSelect')?.value ? 'disabled' : ''}>🗑️ Удалить</button>
            <button class="selectThemeBtn" data-name="${name}">⭐ Выбрать</button>
        `;
        container.appendChild(card);
    }
    document.querySelectorAll('.editThemeBtn').forEach(btn => {
        btn.addEventListener('click', () => openEditTheme(btn.dataset.name));
    });
    document.querySelectorAll('.deleteThemeBtn').forEach(btn => {
        btn.addEventListener('click', () => deleteTheme(btn.dataset.name));
    });
    document.querySelectorAll('.selectThemeBtn').forEach(btn => {
        btn.addEventListener('click', () => selectTheme(btn.dataset.name));
    });
}

function selectTheme(themeName) {
    fetch('/theme', {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({key: themeName})
    }).then(() => {
        document.getElementById('themeSelect').value = themeName;
        loadThemesList();
    });
}

async function deleteTheme(themeName) {
    const current = document.getElementById('themeSelect').value;
    if (themeName === current) {
        alert('Нельзя удалить текущую активную тему');
        return;
    }
    if (confirm(`Удалить тему "${themeName}"? Все файлы будут удалены.`)) {
        const resp = await fetch(`/admin/themes/${themeName}`, { method: 'DELETE' });
        const data = await resp.json();
        if (data.ok) {
            loadThemesList();
            fetch('/themes').then(r=>r.json()).then(themeData => {
                const sel = document.getElementById('themeSelect');
                sel.innerHTML = '';
                themeData.themes.forEach(t => {
                    const o = document.createElement('option');
                    o.value = t;
                    o.textContent = t.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                    sel.appendChild(o);
                });
                sel.value = themeData.currentTheme;
            });
        } else {
            alert('Ошибка: ' + (data.error || 'неизвестная'));
        }
    }
}

function openEditTheme(themeName) {
    currentEditTheme = themeName;
    document.getElementById('modalTitle').innerText = 'Редактирование темы: ' + themeName;
    document.getElementById('themeNameInput').value = themeName;
    document.getElementById('smallEnemyInput').value = '';
    document.getElementById('mediumEnemyInput').value = '';
    document.getElementById('bigEnemyInput').value = '';
    document.getElementById('backgroundInput').value = '';
    document.getElementById('smallEnemyPreview').innerHTML = '';
    document.getElementById('mediumEnemyPreview').innerHTML = '';
    document.getElementById('bigEnemyPreview').innerHTML = '';
    document.getElementById('backgroundPreview').innerHTML = '';
    document.getElementById('themeModal').style.display = 'flex';
}

function closeModal() {
    document.getElementById('themeModal').style.display = 'none';
    currentEditTheme = null;
    document.getElementById('themeForm').reset();
}

document.getElementById('createThemeBtn').addEventListener('click', () => {
    currentEditTheme = null;
    document.getElementById('modalTitle').innerText = 'Создание новой темы';
    document.getElementById('themeNameInput').value = '';
    document.getElementById('smallEnemyInput').value = '';
    document.getElementById('mediumEnemyInput').value = '';
    document.getElementById('bigEnemyInput').value = '';
    document.getElementById('backgroundInput').value = '';
    document.getElementById('smallEnemyPreview').innerHTML = '';
    document.getElementById('mediumEnemyPreview').innerHTML = '';
    document.getElementById('bigEnemyPreview').innerHTML = '';
    document.getElementById('backgroundPreview').innerHTML = '';
    document.getElementById('themeModal').style.display = 'flex';
});

document.getElementById('closeModalBtn').addEventListener('click', closeModal);

document.getElementById('themeForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    const themeName = document.getElementById('themeNameInput').value.trim();
    if (!themeName.match(/^[a-zA-Z0-9_-]+$/)) {
        alert('Название может содержать только латинские буквы, цифры, _ и -');
        return;
    }
    const formData = new FormData();
    formData.append('name', themeName);
    const smallFile = document.getElementById('smallEnemyInput').files[0];
    const mediumFile = document.getElementById('mediumEnemyInput').files[0];
    const bigFile = document.getElementById('bigEnemyInput').files[0];
    const bgFile = document.getElementById('backgroundInput').files[0];
    if (smallFile) formData.append('small_enemy', smallFile);
    if (mediumFile) formData.append('medium_enemy', mediumFile);
    if (bigFile) formData.append('big_enemy', bigFile);
    if (bgFile) formData.append('background', bgFile);

    let url = '/admin/themes';
    let method = 'POST';
    if (currentEditTheme) {
        url = `/admin/themes/${currentEditTheme}`;
        method = 'PUT';
        if (themeName !== currentEditTheme) {
            formData.append('name', themeName);
        }
    } else {
        if (!smallFile || !mediumFile || !bigFile) {
            alert('Для новой темы необходимо загрузить все три изображения мишеней');
            return;
        }
    }

    const resp = await fetch(url, { method, body: formData });
    const data = await resp.json();
    if (data.ok) {
        closeModal();
        loadThemesList();
        fetch('/themes').then(r=>r.json()).then(themeData => {
            const sel = document.getElementById('themeSelect');
            sel.innerHTML = '';
            themeData.themes.forEach(t => {
                const o = document.createElement('option');
                o.value = t;
                o.textContent = t.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                sel.appendChild(o);
            });
            sel.value = themeData.currentTheme;
        });
    } else {
        alert('Ошибка: ' + (data.error || 'неизвестная'));
    }
});

function previewFile(input, previewId) {
    const file = input.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            const img = document.createElement('img');
            img.src = e.target.result;
            img.style.maxWidth = '100px';
            img.style.maxHeight = '100px';
            img.style.margin = '5px';
            const container = document.getElementById(previewId);
            container.innerHTML = '';
            container.appendChild(img);
        };
        reader.readAsDataURL(file);
    }
}
document.getElementById('smallEnemyInput')?.addEventListener('change', function() { previewFile(this, 'smallEnemyPreview'); });
document.getElementById('mediumEnemyInput')?.addEventListener('change', function() { previewFile(this, 'mediumEnemyPreview'); });
document.getElementById('bigEnemyInput')?.addEventListener('change', function() { previewFile(this, 'bigEnemyPreview'); });
document.getElementById('backgroundInput')?.addEventListener('change', function() { previewFile(this, 'backgroundPreview'); });