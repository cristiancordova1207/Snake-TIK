"""Compila Snake Tik a un solo .exe:  py -3.13 tools/build.py
1. Copia ui/ a build/ui sin el código del juego en claro: render.js y snake-core.js van cifrados (.enc)
   con la clave SNAKE_ASSET_KEY (la misma que entrega el servidor a las cuentas con licencia).
2. PyInstaller --onefile --noconsole -> dist/Snake-Tik.exe
La clave de compilación se guarda en %APPDATA%\\SnakeTik_build_asset.key (no se sube a GitHub).
"""
import os
import shutil
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
from account import xcrypt  # noqa: E402
from snake_tik import VERSION  # noqa: E402

KEY_FILE = os.path.join(os.environ["APPDATA"], "SnakeTik_build_asset.key")
PROTECTED = ("render.js", "snake-core.js")


def main():
    key = open(KEY_FILE).read().strip()
    build = os.path.join(ROOT, "build")
    shutil.rmtree(build, ignore_errors=True)
    shutil.copytree(os.path.join(ROOT, "ui"), os.path.join(build, "ui"))
    for name in PROTECTED:
        plain = os.path.join(build, "ui", name)
        with open(plain, "rb") as f:
            data = f.read()
        with open(plain + ".enc", "wb") as f:
            f.write(xcrypt(data, key))
        os.remove(plain)
    for junk in ("themes.css", "themes.js"):  # restos del diseño anterior
        p = os.path.join(build, "ui", junk)
        if os.path.exists(p):
            os.remove(p)
    with open(os.path.join(build, "version.txt"), "w") as f:
        f.write(f"""VSVersionInfo(ffi=FixedFileInfo(filevers=({VERSION.replace('.', ',')},0), prodvers=({VERSION.replace('.', ',')},0)),
kids=[StringFileInfo([StringTable('040904B0', [StringStruct('CompanyName', 'Wylo'), StringStruct('FileDescription', 'Snake Tik'),
StringStruct('FileVersion', '{VERSION}'), StringStruct('ProductName', 'Snake Tik'), StringStruct('ProductVersion', '{VERSION}')])]),
VarFileInfo([VarStruct('Translation', [1033, 1200])])])""")
    cmd = [sys.executable, "-m", "PyInstaller", "--noconfirm", "--onefile", "--noconsole", "--name", "Snake-Tik",
           "--icon", os.path.join(ROOT, "assets", "snaketik.ico"), "--version-file", os.path.join(build, "version.txt"),
           "--add-data", os.path.join(build, "ui") + ";ui", "--collect-all", "TikTokLive", "--copy-metadata", "betterproto",
           "--workpath", os.path.join(build, "pyi"), "--specpath", build, "--distpath", os.path.join(ROOT, "dist"),
           os.path.join(ROOT, "snake_tik.py")]
    subprocess.run(cmd, check=True)
    exe = os.path.join(ROOT, "dist", "Snake-Tik.exe")
    print(f"\nListo: {exe}  ({os.path.getsize(exe) / 1e6:.1f} MB)  v{VERSION}")


if __name__ == "__main__":
    main()
