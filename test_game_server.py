import os
import shutil
import json
import tempfile
from pathlib import Path

import pytest
import requests
import bcrypt
from PIL import Image

# Конфигурация
BASE_URL = os.environ.get("TEST_BASE_URL", "http://localhost:3000")
TEST_ADMIN_LOGIN = "molart"
TEST_ADMIN_PASSWORD = "molart123"

PROJECT_ROOT = Path(__file__).parent
DB_PATH = PROJECT_ROOT / "db.json"
USERS_PATH = PROJECT_ROOT / "users.json"
BACKUP_DIR = PROJECT_ROOT / "test_backup"


def ensure_test_admin():
    """Создаёт или обновляет тестового суперадмина с известным паролем."""
    if not USERS_PATH.exists():
        return
    with open(USERS_PATH, "r", encoding="utf-8") as f:
        users = json.load(f)
    hashed = bcrypt.hashpw(TEST_ADMIN_PASSWORD.encode(), bcrypt.gensalt()).decode()
    users[TEST_ADMIN_LOGIN] = {"password": hashed, "role": "superadmin"}
    with open(USERS_PATH, "w", encoding="utf-8") as f:
        json.dump(users, f, indent=2)


# --- Фикстуры ---

@pytest.fixture(scope="session")
def backup_data():
    """Сохраняет исходные db.json и users.json, восстанавливает после тестов."""
    if not DB_PATH.exists() or not USERS_PATH.exists():
        pytest.skip("Файлы db.json или users.json не найдены")
    BACKUP_DIR.mkdir(exist_ok=True)
    shutil.copy2(DB_PATH, BACKUP_DIR / "db.json")
    shutil.copy2(USERS_PATH, BACKUP_DIR / "users.json")
    yield
    shutil.copy2(BACKUP_DIR / "db.json", DB_PATH)
    shutil.copy2(BACKUP_DIR / "users.json", USERS_PATH)
    shutil.rmtree(BACKUP_DIR, ignore_errors=True)


@pytest.fixture
def session():
    sess = requests.Session()
    yield sess
    sess.close()


@pytest.fixture
def admin_session(session, backup_data):
    """Выполняет логин тестового суперадмина."""
    ensure_test_admin()
    resp = session.post(f"{BASE_URL}/admin/login", json={
        "login": TEST_ADMIN_LOGIN,
        "password": TEST_ADMIN_PASSWORD
    })
    if resp.status_code != 200:
        pytest.skip(f"Не удалось залогиниться: {resp.status_code} {resp.text}")
    return session


@pytest.fixture
def temp_theme_dir():
    with tempfile.TemporaryDirectory() as tmpdir:
        yield Path(tmpdir)


def create_dummy_image(path, size=(1, 1)):
    img = Image.new("RGB", size, color=(255, 0, 0))
    img.save(path, "PNG")


# --- Тесты ---

class TestAdminAuth:
    def test_login_success(self, session):
        ensure_test_admin()
        resp = session.post(f"{BASE_URL}/admin/login", json={
            "login": TEST_ADMIN_LOGIN,
            "password": TEST_ADMIN_PASSWORD
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["ok"] is True
        assert "role" in data

    def test_login_fail_wrong_password(self, session):
        resp = session.post(f"{BASE_URL}/admin/login", json={
            "login": TEST_ADMIN_LOGIN,
            "password": "wrong"
        })
        assert resp.status_code == 401
        assert "error" in resp.json()

    def test_check_authenticated(self, admin_session):
        resp = admin_session.get(f"{BASE_URL}/admin/check")
        assert resp.status_code == 200
        data = resp.json()
        assert data["authenticated"] is True
        assert data["role"] == "superadmin"

    def test_check_not_authenticated(self, session):
        resp = session.get(f"{BASE_URL}/admin/check")
        assert resp.status_code == 200
        data = resp.json()
        assert data["authenticated"] is False

    def test_logout(self, admin_session):
        resp = admin_session.post(f"{BASE_URL}/admin/logout")
        assert resp.status_code == 200
        check = admin_session.get(f"{BASE_URL}/admin/check")
        assert check.json()["authenticated"] is False


class TestPublicEndpoints:
    def test_get_config(self, session):
        resp = session.get(f"{BASE_URL}/config")
        assert resp.status_code == 200
        data = resp.json()
        assert "gameConfig" in data
        assert "teams" in data
        assert len(data["teams"]) == 4

    def test_get_themes(self, session):
        resp = session.get(f"{BASE_URL}/themes")
        assert resp.status_code == 200
        data = resp.json()
        assert "themes" in data
        assert "currentTheme" in data
        assert isinstance(data["themes"], list)

    def test_board_state(self, session):
        resp = session.get(f"{BASE_URL}/board/state")
        assert resp.status_code == 200
        data = resp.json()
        assert "mode" in data
        assert "status" in data
        assert "remaining" in data
        assert "teams" in data
        # Проверяем наличие токена (новое поле)
        assert "boardAuthToken" in data


class TestGameConfigActions:
    def test_change_game_mode(self, admin_session):
        new_mode = "2board2team"
        resp = admin_session.post(f"{BASE_URL}/game-mode", json={"key": new_mode})
        assert resp.status_code == 200
        config = admin_session.get(f"{BASE_URL}/config").json()
        assert config["gameConfig"]["mode"] == new_mode

    def test_change_theme(self, admin_session):
        themes = admin_session.get(f"{BASE_URL}/themes").json()["themes"]
        if not themes:
            pytest.skip("Нет доступных тем")
        new_theme = themes[0]
        resp = admin_session.post(f"{BASE_URL}/theme", json={"key": new_theme})
        assert resp.status_code == 200
        config = admin_session.get(f"{BASE_URL}/config").json()
        assert config["gameConfig"]["theme"] == new_theme

    def test_change_round_duration(self, admin_session):
        new_duration = 120
        resp = admin_session.post(f"{BASE_URL}/round-duration", json={"key": new_duration})
        assert resp.status_code == 200
        config = admin_session.get(f"{BASE_URL}/config").json()
        assert config["gameConfig"]["roundDuration"] == new_duration

    def test_round_duration_minimum(self, admin_session):
        resp = admin_session.post(f"{BASE_URL}/round-duration", json={"key": 5})
        assert resp.status_code == 400
        config = admin_session.get(f"{BASE_URL}/config").json()
        assert config["gameConfig"]["roundDuration"] != 5


class TestTeams:
    def test_rename_team(self, admin_session):
        new_name = "Python Test Team"
        resp = admin_session.post(f"{BASE_URL}/team/1/name", json={"key": new_name})
        assert resp.status_code == 200
        config = admin_session.get(f"{BASE_URL}/config").json()
        assert config["teams"][0]["name"] == new_name

    def test_add_score(self, admin_session):
        resp = admin_session.post(f"{BASE_URL}/board/score", json={"teamId": 1, "points": 10})
        assert resp.status_code == 200
        data = resp.json()
        assert data["ok"] is True
        config = admin_session.get(f"{BASE_URL}/config").json()
        assert config["teams"][0]["score"] == 10


class TestBoardPasswords:
    def test_set_board_passwords(self, admin_session):
        pwd1 = "test123"
        pwd2 = "test456"
        resp1 = admin_session.post(f"{BASE_URL}/admin/board-password", json={"boardId": 1, "password": pwd1})
        assert resp1.status_code == 200
        resp2 = admin_session.post(f"{BASE_URL}/admin/board-password", json={"boardId": 2, "password": pwd2})
        assert resp2.status_code == 200

        config = admin_session.get(f"{BASE_URL}/config").json()
        assert config["gameConfig"]["board1Password"] == pwd1
        assert config["gameConfig"]["board2Password"] == pwd2

    def test_board_auth_success(self, session, admin_session):
        admin_session.post(f"{BASE_URL}/admin/board-password", json={"boardId": 1, "password": "boardpass"})
        resp = session.post(f"{BASE_URL}/board/auth", json={"boardId": 1, "password": "boardpass"})
        assert resp.status_code == 200
        data = resp.json()
        assert data["ok"] is True
        assert "authToken" in data

    def test_board_auth_failure(self, session, admin_session):
        admin_session.post(f"{BASE_URL}/admin/board-password", json={"boardId": 1, "password": "correct"})
        resp = session.post(f"{BASE_URL}/board/auth", json={"boardId": 1, "password": "wrong"})
        assert resp.status_code == 401
        assert "error" in resp.json()


class TestGameControl:
    def test_start_stop_game(self, admin_session):
        admin_session.post(f"{BASE_URL}/game/process", json={"key": "shutdown game"})
        start = admin_session.post(f"{BASE_URL}/game/process", json={"key": "start game"})
        assert start.status_code == 200
        state = admin_session.get(f"{BASE_URL}/board/state").json()
        assert state["status"] == "active"

        stop = admin_session.post(f"{BASE_URL}/game/process", json={"key": "stop game"})
        assert stop.status_code == 200
        state = admin_session.get(f"{BASE_URL}/board/state").json()
        assert state["status"] == "paused"

        shutdown = admin_session.post(f"{BASE_URL}/game/process", json={"key": "shutdown game"})
        assert shutdown.status_code == 200
        state = admin_session.get(f"{BASE_URL}/board/state").json()
        assert state["status"] == "shutdown"


class TestRevokeBoards:
    def test_revoke_boards(self, admin_session):
        # Получаем текущий токен
        state_before = admin_session.get(f"{BASE_URL}/board/state").json()
        old_token = state_before["boardAuthToken"]
        # Вызываем revoke
        resp = admin_session.post(f"{BASE_URL}/admin/revoke-boards")
        assert resp.status_code == 200
        data = resp.json()
        assert data["ok"] is True
        assert "newToken" in data
        new_token = data["newToken"]
        assert new_token != old_token
        # Проверяем, что токен в состоянии игры изменился
        state_after = admin_session.get(f"{BASE_URL}/board/state").json()
        assert state_after["boardAuthToken"] == new_token


class TestThemeManagement:
    @pytest.fixture
    def sample_theme_files(self, temp_theme_dir):
        small = temp_theme_dir / "small.png"
        medium = temp_theme_dir / "medium.png"
        big = temp_theme_dir / "big.png"
        bg = temp_theme_dir / "bg.png"
        create_dummy_image(small)
        create_dummy_image(medium)
        create_dummy_image(big)
        create_dummy_image(bg)
        return small, medium, big, bg

    def test_create_theme(self, admin_session, sample_theme_files):
        small, medium, big, bg = sample_theme_files
        theme_name = f"test_theme_{os.getpid()}"
        files = {
            "small_enemy": ("small.png", open(small, "rb"), "image/png"),
            "medium_enemy": ("medium.png", open(medium, "rb"), "image/png"),
            "big_enemy": ("big.png", open(big, "rb"), "image/png"),
            "background": ("bg.png", open(bg, "rb"), "image/png")
        }
        data = {"name": theme_name}
        resp = admin_session.post(f"{BASE_URL}/admin/themes", files=files, data=data)
        for f in files.values():
            f[1].close()
        if resp.status_code != 200:
            print("Response text:", resp.text)
        assert resp.status_code == 200
        assert resp.json().get("ok") is True

        themes_resp = admin_session.get(f"{BASE_URL}/admin/themes")
        themes = themes_resp.json()["themes"]
        assert theme_name in themes

        delete_resp = admin_session.delete(f"{BASE_URL}/admin/themes/{theme_name}")
        assert delete_resp.status_code == 200

    def test_create_theme_missing_images(self, admin_session, sample_theme_files):
        small, _, _, _ = sample_theme_files
        theme_name = "bad_theme"
        files = {
            "small_enemy": ("small.png", open(small, "rb"), "image/png"),
        }
        data = {"name": theme_name}
        resp = admin_session.post(f"{BASE_URL}/admin/themes", files=files, data=data)
        files["small_enemy"][1].close()
        assert resp.status_code == 400
        assert "Missing enemy images" in resp.text

    def test_edit_theme(self, admin_session, sample_theme_files):
        small, medium, big, bg = sample_theme_files
        theme_name = f"edit_theme_{os.getpid()}"
        files_create = {
            "small_enemy": ("small.png", open(small, "rb"), "image/png"),
            "medium_enemy": ("medium.png", open(medium, "rb"), "image/png"),
            "big_enemy": ("big.png", open(big, "rb"), "image/png"),
            "background": ("bg.png", open(bg, "rb"), "image/png")
        }
        create_resp = admin_session.post(f"{BASE_URL}/admin/themes", files=files_create, data={"name": theme_name})
        for f in files_create.values():
            f[1].close()
        assert create_resp.status_code == 200

        new_bg = sample_theme_files[3]
        files_update = {
            "background": ("new_bg.png", open(new_bg, "rb"), "image/png")
        }
        resp = admin_session.put(f"{BASE_URL}/admin/themes/{theme_name}", files=files_update, data={})
        files_update["background"][1].close()
        assert resp.status_code == 200

        themes = admin_session.get(f"{BASE_URL}/admin/themes").json()["themes"]
        assert "background" in themes[theme_name]

        admin_session.delete(f"{BASE_URL}/admin/themes/{theme_name}")

    def test_delete_theme(self, admin_session, sample_theme_files):
        small, medium, big, bg = sample_theme_files
        theme_name = f"to_delete_{os.getpid()}"
        files = {
            "small_enemy": ("small.png", open(small, "rb"), "image/png"),
            "medium_enemy": ("medium.png", open(medium, "rb"), "image/png"),
            "big_enemy": ("big.png", open(big, "rb"), "image/png"),
            "background": ("bg.png", open(bg, "rb"), "image/png")
        }
        create_resp = admin_session.post(f"{BASE_URL}/admin/themes", files=files, data={"name": theme_name})
        for f in files.values():
            f[1].close()
        assert create_resp.status_code == 200

        resp = admin_session.delete(f"{BASE_URL}/admin/themes/{theme_name}")
        assert resp.status_code == 200

        themes = admin_session.get(f"{BASE_URL}/admin/themes").json()["themes"]
        assert theme_name not in themes

    def test_delete_active_theme_forbidden(self, admin_session):
        config = admin_session.get(f"{BASE_URL}/config").json()
        active_theme = config["gameConfig"]["theme"]
        if not active_theme:
            pytest.skip("Нет активной темы")
        resp = admin_session.delete(f"{BASE_URL}/admin/themes/{active_theme}")
        assert resp.status_code == 400
        assert "Cannot delete active theme" in resp.text


class TestUserManagement:
    def test_create_admin(self, admin_session):
        new_login = "temp_admin"
        new_password = "temppass"
        resp = admin_session.post(f"{BASE_URL}/admin/users", json={
            "login": new_login,
            "password": new_password,
            "role": "admin"
        })
        assert resp.status_code == 200

        users_resp = admin_session.get(f"{BASE_URL}/admin/users")
        users = users_resp.json()["users"]
        assert any(u["login"] == new_login for u in users)

        admin_session.delete(f"{BASE_URL}/admin/users/{new_login}")

    def test_delete_user(self, admin_session):
        new_login = "to_delete"
        admin_session.post(f"{BASE_URL}/admin/users", json={
            "login": new_login,
            "password": "pass",
            "role": "admin"
        })
        resp = admin_session.delete(f"{BASE_URL}/admin/users/{new_login}")
        assert resp.status_code == 200
        users = admin_session.get(f"{BASE_URL}/admin/users").json()["users"]
        assert not any(u["login"] == new_login for u in users)

    def test_cannot_delete_self(self, admin_session):
        resp = admin_session.delete(f"{BASE_URL}/admin/users/{TEST_ADMIN_LOGIN}")
        assert resp.status_code == 400
        assert "Cannot delete yourself" in resp.json().get("error", "")