"""Snake Tik - la serpiente que juega sola en tu directo de TikTok.

Panel:  http://127.0.0.1:5010/        (regalos, conexión, botón PERDER - no sale en el directo)
Juego:  http://127.0.0.1:5010/game    (ventana 9:16 para capturar en TikTok LIVE Studio)
"""
import asyncio
import json
import os
import re
import shutil
import subprocess
import sys
import threading
import time
import urllib.request
import webbrowser
from collections import deque

from flask import Flask, jsonify, request, send_from_directory

from TikTokLive import TikTokLiveClient
from TikTokLive.events import (ConnectEvent, DisconnectEvent, GiftEvent,
                               LikeEvent, LiveEndEvent)

from account import Account, xcrypt

VERSION = "1.0.3"
PORT = 5010

BASE = getattr(sys, "_MEIPASS", os.path.dirname(os.path.abspath(__file__)))
UI_DIR = os.path.join(BASE, "ui")
CFG_DIR = os.path.join(os.environ.get("APPDATA", os.path.expanduser("~")), "SnakeTik")
CFG_PATH = os.path.join(CFG_DIR, "config.json")

ACTIONS = {
    "apples":  {"name": "apples", "emoji": "🍎"},
    "gold":    {"name": "gold", "emoji": "🍏"},
    "bombs":   {"name": "bombs", "emoji": "💣"},
    "airdrop": {"name": "airdropAct", "emoji": "✈️"},
}
LIVE_SETTINGS = ("speed", "grid", "toasts", "stats", "board", "animal", "color", "speedup", "countdown", "lang", "sound", "discord", "nolose", "notitle", "layout")

# Igual que en el vídeo de referencia
DEFAULT_CFG = {
    "tiktok_user": "",
    "theme": "cozy-night",
    "lang": "",            # "" = preguntar en el primer arranque
    "speed": 12,           # movimientos por segundo
    "grid": 20,            # casillas por lado (10..26)
    "toasts": True,        # avisos "Fulano envió Rosa" dentro del juego
    "board": "grass",
    "animal": "snake",
    "color": None,         # None = color propio del animal
    "speedup": False,      # más rápida cuanto más crece
    "countdown": 10,       # segundos al 100 % para ganar
    "nolose": False,       # la serpiente nunca pierde
    "notitle": False,      # ocultar el título del juego
    "layout": {},          # piezas movidas con el ratón: {"title": {"x": 0, "y": 0}, ...}
    "discord": "discord.gg/K6TCjKAyds",
    "stats": {"wins": 0, "losses": 0},
    "sound": {"master": 0.8, "keys": {"pack": "cherrymx-black-abs", "vol": 0.8, "on": True}, "events": {}},
    "rules": [
        {"kind": "gift", "gift_id": 5655, "gift_name": "Rose", "action": "apples", "amount": 5},
        {"kind": "gift", "gift_id": 5269, "gift_name": "TikTok", "action": "bombs", "amount": 5},
        {"kind": "gift", "gift_id": 5780, "gift_name": "Bouquet Flower", "action": "apples", "amount": 150},
        {"kind": "gift", "gift_id": 5879, "gift_name": "Doughnut", "action": "bombs", "amount": 150},
        {"kind": "gift", "gift_id": 10994, "gift_name": "Bouquet", "action": "apples", "amount": 500},
        {"kind": "gift", "gift_id": 11046, "gift_name": "Galaxy", "action": "airdrop", "amount": 500},
    ],
}
SOUND_DIR = os.path.join(CFG_DIR, "sounds")

lock = threading.Lock()
events = deque(maxlen=2000)
log = deque(maxlen=200)
seq = 0
gift_catalog = {}
state = {"status": "off", "error": "", "game_seen": 0.0, "likes": {}, "fired": {}, "tiktok": "", "started": False}
client_box = {"client": None, "loop": None}


def load_cfg():
    try:
        with open(CFG_PATH, encoding="utf-8") as f:
            cfg = json.load(f)
        for k, v in DEFAULT_CFG.items():
            cfg.setdefault(k, v)
        return cfg
    except (OSError, ValueError):
        return json.loads(json.dumps(DEFAULT_CFG))


def save_cfg():
    os.makedirs(CFG_DIR, exist_ok=True)
    with open(CFG_PATH, "w", encoding="utf-8") as f:
        json.dump(cfg, f, ensure_ascii=False, indent=2)


cfg = load_cfg()
ACC = Account(CFG_DIR, VERSION)
# archivos del juego que solo se entregan con licencia válida (en el .exe van cifrados: <nombre>.enc)
PROTECTED = {"render.js", "snake-core.js"}
FROZEN = getattr(sys, "frozen", False)


def lock_reason():
    """None si se puede jugar; si no, el motivo que se ve en la ventana del juego."""
    if not ACC.token or not ACC.profile:
        return "Inicia sesión en el programa"
    if ACC.profile.get("banned"):
        return "Cuenta suspendida"
    if not ACC.allowed():
        return "Activa tu plan en el programa"
    return None


def push(ev, text=None):
    global seq
    with lock:
        seq += 1
        ev["seq"] = seq
        ev["t"] = time.time()
        events.append(ev)
        if text:
            log.appendleft({"t": time.time(), "text": text})


def fire(nick, action, amount, source):
    a = ACTIONS[action]
    push({"type": "add", "what": action, "amount": amount, "nick": nick, "source": source},
         f"{a['emoji']} {nick}: {source} → +{amount}")


def rule_for_gift(gift_id, gift_name):
    name = (gift_name or "").strip().lower()
    for r in cfg["rules"]:
        if r["kind"] == "gift" and ((r.get("gift_id") and r["gift_id"] == gift_id)
                                    or (name and r.get("gift_name", "").strip().lower() == name)):
            return r
    return None


def handle_gift(nick, gift_id, gift_name, count, coins=0, img=""):
    if gift_id and gift_id not in gift_catalog:
        gift_catalog[gift_id] = {"id": gift_id, "name": gift_name, "coins": coins, "img": img}
    r = rule_for_gift(gift_id, gift_name)
    if r:
        fire(nick, r["action"], int(r["amount"]) * count, f"{gift_name} x{count}")
    else:
        with lock:
            log.appendleft({"t": time.time(), "text": f"🎁 {nick} envió {gift_name} x{count} (sin acción)"})


def handle_likes(user, nick, count):
    likes, fired = state["likes"], state["fired"]
    likes[user] = likes.get(user, 0) + count
    for i, r in enumerate(cfg["rules"]):
        if r["kind"] != "likes" or int(r.get("likes", 0)) <= 0:
            continue
        key = f"{user}|{i}"
        times = likes[user] // int(r["likes"]) - fired.get(key, 0)
        if times > 0:
            fired[key] = fired.get(key, 0) + times
            fire(nick, r["action"], int(r["amount"]) * times, f"{r['likes']} likes")


def store_gifts(data):
    for g in data.get("gifts", []):
        gift_catalog[g["id"]] = {"id": g["id"], "name": g["name"], "coins": g.get("diamond_count", 0),
                                 "img": (g.get("image") or {}).get("url_list", [""])[0]}


def run_client(unique_id):
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    client = TikTokLiveClient(unique_id="@" + unique_id)
    client_box.update(client=client, loop=loop)

    @client.on(ConnectEvent)
    async def _c(_):
        state.update(status="live", error="", likes={}, fired={}, tiktok=unique_id)
        push({"type": "status", "live": True}, f"🟢 Conectado al LIVE de @{unique_id}")
        threading.Thread(target=ACC.beat_now, daemon=True).start()  # el servidor avisa a Discord
        try:
            store_gifts(await client.web.fetch_gift_list())
        except Exception as ex:
            print("No se pudo leer la lista de regalos:", ex)

    @client.on(DisconnectEvent)
    async def _d(_):
        state["status"] = "off"
        push({"type": "status", "live": False}, "🔌 Desconectado")

    @client.on(LiveEndEvent)
    async def _e(_):
        state["status"] = "off"
        push({"type": "status", "live": False}, "⏹️ El LIVE terminó")

    @client.on(GiftEvent)
    async def _g(ev):
        if ev.streaking:  # combo en curso: se cuenta al terminar
            return
        g = ev.gift
        img = ""
        try:
            img = g.image.m_urls[0]
        except Exception:
            pass
        handle_gift(ev.user.nickname or ev.user.unique_id, g.id, g.name, max(1, ev.repeat_count or 1), g.diamond_count, img)

    @client.on(LikeEvent)
    async def _l(ev):
        handle_likes(ev.user.unique_id, ev.user.nickname or ev.user.unique_id, ev.count or 1)

    state.update(status="connecting", error="")
    try:
        loop.run_until_complete(client.connect())
    except Exception as ex:
        name = type(ex).__name__
        state.update(status="off", error="Ese usuario no está en directo ahora mismo." if "Offline" in name else f"{name}: {ex}")
    finally:
        client_box.update(client=None, loop=None)
        state["status"] = "off" if state["status"] != "off" else "off"


def connect(unique_id):
    disconnect()
    threading.Thread(target=run_client, args=(unique_id,), daemon=True).start()


def disconnect():
    c, loop = client_box["client"], client_box["loop"]
    if c and loop and loop.is_running():
        asyncio.run_coroutine_threadsafe(c.disconnect(), loop)
        for _ in range(30):
            if client_box["client"] is None:
                break
            time.sleep(0.1)
    state["status"] = "off"


app = Flask(__name__, static_folder=None)


@app.get("/")
def index():
    return send_from_directory(UI_DIR, "index.html")


@app.get("/game")
def game():
    return send_from_directory(UI_DIR, "game.html")


@app.get("/ui/<path:p>")
def ui_file(p):
    if p == "guard.js" and not FROZEN:  # en desarrollo no molesta (pruebas con herramientas automáticas)
        return app.response_class("", mimetype="application/javascript")
    if p in PROTECTED:
        key = ACC.asset_key()
        if not key:
            return ("// sin licencia", 403)
        plain = os.path.join(UI_DIR, p)
        if not FROZEN and os.path.exists(plain):  # desarrollo: archivo sin cifrar
            return send_from_directory(UI_DIR, p, max_age=0)
        with open(plain + ".enc", "rb") as f:
            data = xcrypt(f.read(), key)
        return app.response_class(data, mimetype="application/javascript", headers={"Cache-Control": "no-store"})
    return send_from_directory(UI_DIR, p)


@app.get("/api/poll")
def api_poll():
    """Lo llama la ventana del juego."""
    since = request.args.get("since", -1, type=int)
    with lock:
        state["game_seen"] = time.time()
        out = [e for e in events if e["seq"] > since] if since >= 0 else []
        cur = seq
    settings = {k: cfg[k] for k in LIVE_SETTINGS}
    if ACC.profile and ACC.profile.get("discord") is not None:
        settings["discord"] = ACC.profile["discord"]  # el enlace lo decide el admin desde el servidor
    return jsonify({"seq": cur, "events": out, "settings": settings, "locked": lock_reason() or False, "started": state["started"]})


@app.post("/api/stats")
def api_stats():
    d = request.get_json(force=True)
    cfg["stats"] = {"wins": int(d.get("wins", 0)), "losses": int(d.get("losses", 0))}
    save_cfg()
    return jsonify({"ok": True})


@app.get("/api/state")
def api_state():
    with lock:
        return jsonify({"status": state["status"], "error": state["error"],
                        "game": time.time() - state["game_seen"] < 3, "started": state["started"],
                        "cfg": cfg, "actions": ACTIONS, "log": list(log)[:60]})


@app.get("/api/gifts")
def api_gifts():
    if request.args.get("refresh") or not gift_catalog:
        try:
            async def go():
                return await TikTokLiveClient(unique_id="tiktok").web.fetch_gift_list()
            store_gifts(asyncio.run(go()))
        except Exception as ex:
            return jsonify({"error": str(ex), "gifts": list(gift_catalog.values())})
    return jsonify({"gifts": sorted(gift_catalog.values(), key=lambda g: (g["coins"], g["name"]))})


@app.post("/api/config")
def api_config():
    data = request.get_json(force=True)
    if "grid" in data:
        data["grid"] = max(10, min(26, int(data["grid"])))
    for k in ("tiktok_user", "theme", "rules") + LIVE_SETTINGS:
        if k in data and k != "discord":  # el enlace de Discord solo lo cambia el admin (ver /api/admin)
            cfg[k] = data[k]
    save_cfg()
    if "stats" in data:  # el juego cambia sus contadores al momento (p. ej. botón de reiniciar)
        push({"type": "stats", **cfg["stats"]})
    if any(k in data for k in LIVE_SETTINGS):
        push({"type": "settings"})
    return jsonify({"ok": True})


@app.post("/api/sound-upload")
def api_sound_upload():
    """Sonido propio para un evento: se guarda solo en este PC."""
    f = request.files.get("file")
    if not f or not f.filename:
        return jsonify({"ok": False}), 400
    ext = os.path.splitext(f.filename)[1].lower()
    if ext not in (".mp3", ".wav", ".ogg", ".m4a"):
        return jsonify({"ok": False, "error": "Formato no válido (mp3, wav, ogg, m4a)"}), 400
    os.makedirs(SOUND_DIR, exist_ok=True)
    name = f"{int(time.time() * 1000)}{ext}"
    f.save(os.path.join(SOUND_DIR, name))
    return jsonify({"ok": True, "url": f"/usersfx/{name}", "name": f.filename})


@app.get("/usersfx/<path:p>")
def user_sfx(p):
    return send_from_directory(SOUND_DIR, p)


@app.post("/api/connect")
def api_connect():
    user = (request.get_json(force=True).get("user") or "").strip().lstrip("@").lower()
    if not re.match(r"^[\w.]{2,24}$", user):
        return jsonify({"ok": False, "error": "bad_tiktok"}), 400
    if lock_reason():
        return jsonify({"ok": False, "error": "locked"}), 403
    if user not in (ACC.profile.get("tiktoks") or []):
        r = ACC._take(ACC.call("tiktok_add", username=user))  # máximo 3 cuentas por usuario
        if r.get("error"):
            return jsonify({"ok": False, "error": r["error"]}), 403
    cfg["tiktok_user"] = user
    save_cfg()
    connect(user)
    return jsonify({"ok": True})


@app.post("/api/disconnect")
def api_disconnect():
    disconnect()
    return jsonify({"ok": True})


@app.post("/api/command")
def api_command():
    """Botones del panel: perder, reiniciar, pruebas."""
    d = request.get_json(force=True)
    c = d.get("cmd")
    if c == "start":
        state["started"] = True
        push({"type": "reset"}, "▶ Start")
    elif c == "lose":
        push({"type": "lose"}, "💀 Botón PERDER")
    elif c == "reset":
        push({"type": "reset"}, "🔄 Partida reiniciada")
    elif c == "add" and d.get("what") in ACTIONS:
        fire(d.get("nick") or "Prueba", d["what"], int(d.get("amount") or 1), "prueba")
    return jsonify({"ok": True})


# ---------- cuenta ----------
def account_view():
    return {"logged": bool(ACC.token and ACC.profile), "profile": ACC.profile, "prices": ACC.prices,
            "allowed": ACC.allowed(), "admin": ACC.is_admin(), "version": VERSION}


@app.get("/api/account")
def api_account():
    if ACC.token and (request.args.get("refresh") or not ACC.profile):
        ACC.refresh()
    return jsonify(account_view())


@app.post("/api/account/<what>")
def api_account_do(what):
    d = request.get_json(force=True) if request.data else {}
    if what == "login":
        r = ACC.login(d.get("username", ""), d.get("password", ""))
    elif what == "register":
        r = ACC.register(d.get("username", ""), d.get("password", ""), d.get("confirm", ""))
    elif what == "logout":
        disconnect()
        ACC.logout()
        r = {}
    elif what in ("checkout", "portal"):
        r = ACC.call(what, plan=d.get("plan"))
        if r.get("url"):
            open_url(r["url"])
    elif what == "tiktok_add":
        r = ACC._take(ACC.call("tiktok_add", username=d.get("username", "")))
    else:
        return jsonify({"error": "unknown"}), 404
    if r.get("token") or what in ("login", "register"):
        ACC.refresh()
        push({"type": "settings"})
    return jsonify({**account_view(), "error": r.get("error"), "url": r.get("url")})


@app.post("/api/admin")
def api_admin():
    """Acciones de administrador (solo la cuenta Wylo). El servidor vuelve a comprobar el rol."""
    if not ACC.is_admin():
        return jsonify({"error": "forbidden"}), 403
    d = request.get_json(force=True)
    action = d.pop("action", "")
    r = ACC.call("admin_" + action, **d)
    if action == "set_discord":
        ACC.refresh()
        push({"type": "settings"})
    return jsonify(r)


# ---------- actualizaciones (GitHub Releases) ----------
# latest.json en el repo de releases: {"version": "1.0.1", "notes": "...", "url": ".../Snake-Tik.exe"}
RELEASES_JSON = "https://raw.githubusercontent.com/cristiancordova1207/Snake-Tik---Releases/main/latest.json"
_upd = {"t": 0.0, "info": None}


def _ver(v):
    return tuple(int(x) for x in re.findall(r"\d+", v or "0")[:3]) or (0,)


def latest_release():
    if time.time() - _upd["t"] < 600 and _upd["info"]:
        return _upd["info"]
    req = urllib.request.Request(RELEASES_JSON + f"?t={int(time.time() // 300)}", headers={"User-Agent": "SnakeTik"})
    with urllib.request.urlopen(req, timeout=15) as r:
        d = json.loads(r.read())
    info = {"latest": str(d.get("version", "")).lstrip("v"), "notes": d.get("notes") or "", "url": d.get("url")}
    _upd.update(t=time.time(), info=info)
    return info


def install_update(url):
    """Descarga el .exe nuevo y lo cambia por el actual cuando este se cierra (solo en el .exe)."""
    import tempfile
    tmp = os.path.join(tempfile.gettempdir(), "SnakeTik-update.exe")
    req = urllib.request.Request(url, headers={"User-Agent": "SnakeTik"})
    with urllib.request.urlopen(req, timeout=300) as r, open(tmp, "wb") as f:
        shutil.copyfileobj(r, f)
    exe = sys.executable
    bat = os.path.join(tempfile.gettempdir(), "SnakeTik-update.bat")
    with open(bat, "w", encoding="utf-8") as f:
        f.write(f"""@echo off
:wait
tasklist /FI "PID eq {os.getpid()}" | find "{os.getpid()}" >nul && (timeout /t 1 /nobreak >nul & goto wait)
copy /y "{tmp}" "{exe}" >nul
start "" "{exe}"
del "{tmp}"
del "%~f0"
""")
    subprocess.Popen(["cmd", "/c", bat], creationflags=0x08000000)  # sin ventana
    threading.Timer(1.0, lambda: os._exit(0)).start()


@app.route("/api/update", methods=["GET", "POST"])
def api_update():
    try:
        info = latest_release()
    except Exception:
        return jsonify({"available": False, "current": VERSION})
    available = bool(info["url"]) and _ver(info["latest"]) > _ver(VERSION)
    if request.method == "POST" and available:
        if not FROZEN:
            return jsonify({"error": "Solo se actualiza el .exe"})
        try:
            install_update(info["url"])
        except Exception as ex:
            return jsonify({"error": str(ex)})
        return jsonify({"ok": True})
    return jsonify({"available": available, "current": VERSION, **info})


@app.post("/api/open-game")
def api_open_game():
    open_windows(("game",))
    return jsonify({"ok": True})


def open_url(url):
    exe = browser_exe()
    if exe:
        subprocess.Popen([exe, url])
    else:
        webbrowser.open(url)


def browser_exe():
    """Chrome primero (lo pidió el usuario); Edge si no hay Chrome."""
    local = os.environ.get("LOCALAPPDATA", "")
    for p in (shutil.which("chrome"),
              r"C:\Program Files\Google\Chrome\Application\chrome.exe",
              r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
              os.path.join(local, r"Google\Chrome\Application\chrome.exe"),
              shutil.which("msedge"),
              r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"):
        if p and os.path.exists(p):
            return p
    return None


# el juego no se congela aunque la ventana quede tapada (captura de TikTok LIVE Studio) y suena sin hacer clic
BROWSER_FLAGS = ["--autoplay-policy=no-user-gesture-required", "--disable-background-timer-throttling",
                 "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows",
                 "--no-first-run", "--no-default-browser-check"]


def open_windows(which=("panel", "game")):
    base = f"http://127.0.0.1:{PORT}"
    exe = browser_exe()
    if not exe:
        for w in which:
            webbrowser.open(base + ("/" if w == "panel" else "/game"))
        return
    # perfiles propios (no tocan tu Chrome normal); uno por ventana para que cada una recuerde su tamaño
    prof = lambda name: ["--user-data-dir=" + os.path.join(CFG_DIR, "browser-" + name)]
    if "panel" in which:
        subprocess.Popen([exe, f"--app={base}/", "--window-size=1180,820"] + prof("panel") + BROWSER_FLAGS)
    if "game" in which:
        subprocess.Popen([exe, f"--app={base}/game", "--window-size=540,1000", "--window-position=40,20"] + prof("game") + BROWSER_FLAGS)


def on_license_lost():
    disconnect()
    push({"type": "settings"}, "🔒 Licencia no válida: se cortó la conexión")


ACC.live_info = lambda: (state["status"] == "live", state.get("tiktok", ""))
ACC.on_lost = on_license_lost


def already_running():
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{PORT}/api/account", timeout=2):
            return True
    except Exception:
        return False


# ---------- instalación (el .exe descargado se instala solo) ----------
INSTALL_DIR = os.path.join(os.environ.get("LOCALAPPDATA", CFG_DIR), "Programs", "Snake Tik")
INSTALLED_EXE = os.path.join(INSTALL_DIR, "Snake Tik.exe")
UNINSTALL_KEY = r"Software\Microsoft\Windows\CurrentVersion\Uninstall\SnakeTik"


def _shortcuts():
    desktop = os.path.join(os.environ.get("USERPROFILE", ""), "Desktop")
    start = os.path.join(os.environ.get("APPDATA", ""), r"Microsoft\Windows\Start Menu\Programs")
    return [os.path.join(desktop, "Snake Tik.lnk"), os.path.join(start, "Snake Tik.lnk")]


def self_install():
    """Si se ejecuta desde Descargas: se copia a %LOCALAPPDATA%\\Programs\\Snake Tik, crea accesos directos,
    se registra en "Aplicaciones instaladas" y abre la copia instalada. Sin permisos de administrador."""
    if not FROZEN or os.path.normcase(os.path.abspath(sys.executable)) == os.path.normcase(INSTALLED_EXE):
        return
    os.makedirs(INSTALL_DIR, exist_ok=True)
    try:
        shutil.copy2(sys.executable, INSTALLED_EXE)
    except PermissionError:
        pass  # ya instalado y abierto: solo lo enseñamos
    ps = "; ".join(
        f"$s=(New-Object -ComObject WScript.Shell).CreateShortcut('{lnk}'); $s.TargetPath='{INSTALLED_EXE}'; "
        f"$s.WorkingDirectory='{INSTALL_DIR}'; $s.IconLocation='{INSTALLED_EXE},0'; $s.Save()" for lnk in _shortcuts())
    subprocess.run(["powershell", "-NoProfile", "-Command", ps], creationflags=0x08000000)
    try:
        import winreg
        with winreg.CreateKey(winreg.HKEY_CURRENT_USER, UNINSTALL_KEY) as k:
            for name, val in (("DisplayName", "Snake Tik"), ("DisplayVersion", VERSION), ("Publisher", "Wylo"),
                              ("DisplayIcon", INSTALLED_EXE), ("InstallLocation", INSTALL_DIR),
                              ("UninstallString", f'"{INSTALLED_EXE}" --uninstall')):
                winreg.SetValueEx(k, name, 0, winreg.REG_SZ, val)
            winreg.SetValueEx(k, "NoModify", 0, winreg.REG_DWORD, 1)
    except OSError:
        pass
    subprocess.Popen([INSTALLED_EXE])
    sys.exit(0)


def uninstall():
    for lnk in _shortcuts():
        try:
            os.remove(lnk)
        except OSError:
            pass
    try:
        import winreg
        winreg.DeleteKey(winreg.HKEY_CURRENT_USER, UNINSTALL_KEY)
    except OSError:
        pass
    # la carpeta se borra cuando este proceso termina (los ajustes de %APPDATA%\SnakeTik se conservan)
    subprocess.Popen(["cmd", "/c", f'timeout /t 2 /nobreak >nul & rmdir /s /q "{INSTALL_DIR}"'], creationflags=0x08000000)
    sys.exit(0)


if __name__ == "__main__":
    if "--uninstall" in sys.argv:
        uninstall()
    self_install()
    if already_running():
        open_windows()
        sys.exit(0)
    if ACC.token:
        ACC.refresh()
    ACC.beat_loop()
    if "--no-window" not in sys.argv:
        threading.Timer(1.0, open_windows).start()
    print(f"Snake Tik en http://127.0.0.1:{PORT}  (juego 9:16 en /game)")
    app.run(host="127.0.0.1", port=PORT, threaded=True)
