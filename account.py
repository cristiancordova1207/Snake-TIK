"""Snake Tik · cuenta y licencia.

- Inicio de sesión / registro contra la función `snake-api` de Supabase.
- La sesión se guarda cifrada con DPAPI de Windows (solo este usuario de este PC puede leerla).
- Pulso cada 60 s: el servidor dice si la licencia es válida y descuenta minutos de prueba si hay directo.
- El código del juego va cifrado dentro del .exe; la clave solo llega del servidor con una licencia válida.
"""
import ctypes
import ctypes.wintypes as wt
import hashlib
import json
import os
import threading
import time
import urllib.error
import urllib.request

API = "https://dcepxcltgzipkmzpptzn.supabase.co/functions/v1/snake-api"
GRACE = 15 * 60  # sin internet: la licencia confirmada sigue valiendo 15 min


# ---------- DPAPI ----------
class _Blob(ctypes.Structure):
    _fields_ = [("cbData", wt.DWORD), ("pbData", ctypes.POINTER(ctypes.c_char))]


def _blob(b):
    buf = ctypes.create_string_buffer(b, len(b))
    return _Blob(len(b), ctypes.cast(buf, ctypes.POINTER(ctypes.c_char))), buf


def protect(data: bytes) -> bytes:
    src, _keep = _blob(data)
    out = _Blob()
    if not ctypes.windll.crypt32.CryptProtectData(ctypes.byref(src), None, None, None, None, 0, ctypes.byref(out)):
        raise OSError("CryptProtectData")
    try:
        return ctypes.string_at(out.pbData, out.cbData)
    finally:
        ctypes.windll.kernel32.LocalFree(out.pbData)


def unprotect(data: bytes) -> bytes:
    src, _keep = _blob(data)
    out = _Blob()
    if not ctypes.windll.crypt32.CryptUnprotectData(ctypes.byref(src), None, None, None, None, 0, ctypes.byref(out)):
        raise OSError("CryptUnprotectData")
    try:
        return ctypes.string_at(out.pbData, out.cbData)
    finally:
        ctypes.windll.kernel32.LocalFree(out.pbData)


# ---------- cifrado de los archivos del juego ----------
def xcrypt(data: bytes, key_hex: str) -> bytes:
    """Cifrado simétrico (flujo SHA-256 en modo contador). Cifrar y descifrar es la misma operación."""
    key = bytes.fromhex(key_hex)
    out = bytearray(len(data))
    for block in range(0, len(data), 32):
        ks = hashlib.sha256(key + block.to_bytes(8, "little")).digest()
        chunk = data[block:block + 32]
        out[block:block + len(chunk)] = bytes(a ^ b for a, b in zip(chunk, ks))
    return bytes(out)


def machine_id():
    """Huella del PC para limitar cuentas por equipo: sha256 del MachineGuid de Windows (nunca se envía el valor en claro)."""
    try:
        import winreg
        with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\Microsoft\Cryptography", 0,
                            winreg.KEY_READ | winreg.KEY_WOW64_64KEY) as k:
            guid = winreg.QueryValueEx(k, "MachineGuid")[0]
    except OSError:
        return ""
    return hashlib.sha256(f"snaketik:{guid}".encode()).hexdigest()


class Account:
    def __init__(self, cfg_dir, version):
        self.path = os.path.join(cfg_dir, "session.dat")
        self.version = version
        self.token = None
        self.profile = None
        self.prices = None
        self.last_ok = 0.0
        self.error = ""
        self.live_info = lambda: (False, "")  # (en directo, cuenta de TikTok) -> lo pone snake_tik.py
        self.on_lost = lambda: None           # se llama si la licencia deja de valer
        self._load()

    # ---------- red ----------
    def call(self, action, **data):
        body = json.dumps({"action": action, "token": self.token, "version": self.version, **data}).encode()
        req = urllib.request.Request(API, data=body, method="POST", headers={"Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=20) as r:
                return json.loads(r.read())
        except urllib.error.HTTPError as e:
            try:
                return json.loads(e.read())
            except Exception:
                return {"error": f"http_{e.code}"}
        except Exception:
            return {"error": "offline"}

    # ---------- sesión ----------
    def _load(self):
        try:
            with open(self.path, "rb") as f:
                self.token = unprotect(f.read()).decode()
        except Exception:
            self.token = None

    def _save(self):
        os.makedirs(os.path.dirname(self.path), exist_ok=True)
        with open(self.path, "wb") as f:
            f.write(protect(self.token.encode()))

    def _take(self, r):
        if r.get("token"):
            self.token = r["token"]
            self._save()
        if r.get("profile"):
            self.profile = r["profile"]
            if self.profile.get("allowed"):
                self.last_ok = time.time()
        if r.get("prices"):
            self.prices = r["prices"]
        return r

    def login(self, username, password):
        return self._take(self.call("login", username=username, password=password))

    def register(self, username, password, confirm):
        return self._take(self.call("register", username=username, password=password, confirm=confirm, hwid=machine_id()))

    def logout(self):
        if self.token:
            self.call("logout")
        self.token, self.profile = None, None
        try:
            os.remove(self.path)
        except OSError:
            pass

    def refresh(self):
        if not self.token:
            return {"error": "no_session"}
        r = self._take(self.call("me"))
        if r.get("error") == "no_session":
            self.logout()
        return r

    # ---------- licencia ----------
    def allowed(self):
        if not self.profile:
            return False
        if self.profile.get("allowed") and time.time() - self.last_ok < GRACE:
            return True
        return False

    def is_admin(self):
        return bool(self.profile and self.profile.get("role") == "admin")

    def asset_key(self):
        return self.profile.get("assetKey") if self.allowed() else None

    def beat_now(self):
        if self.token:
            live, tiktok = self.live_info()
            self._take(self.call("beat", live=live, tiktok=tiktok))

    def beat_loop(self):
        def run():
            while True:
                if self.token:
                    live, tiktok = self.live_info()
                    was = self.allowed()
                    r = self._take(self.call("beat", live=live, tiktok=tiktok))
                    if r.get("error") == "no_session":
                        self.logout()
                    if was and not self.allowed():
                        self.on_lost()
                time.sleep(60)
        threading.Thread(target=run, daemon=True).start()
