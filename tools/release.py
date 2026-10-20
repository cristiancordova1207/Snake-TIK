"""Publica una versión en GitHub (cristiancordova1207/Snake-Tik---Releases):
    py -3.13 tools/release.py "Novedades de esta versión (una por línea)"
1. Compila dist/Snake-Tik.exe (tools/build.py) con la versión de snake_tik.py (VERSION).
2. Copia el .exe al repo de releases, escribe latest.json (lo lee el actualizador del programa) y CHANGELOG.md.
3. Commit + push. Los programas abiertos verán el aviso "Nueva versión" con las novedades.
"""
import datetime
import json
import os
import shutil
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
from snake_tik import VERSION  # noqa: E402

REPO = "https://github.com/cristiancordova1207/Snake-Tik---Releases.git"
RAW_EXE = "https://github.com/cristiancordova1207/Snake-Tik---Releases/raw/main/Snake-Tik.exe"


def git(*args, cwd):
    subprocess.run(["git", *args], cwd=cwd, check=True)


def main():
    notes = sys.argv[1] if len(sys.argv) > 1 else "Mejoras y correcciones."
    if "--no-build" not in sys.argv:
        subprocess.run([sys.executable, os.path.join(ROOT, "tools", "build.py")], check=True)
    work = os.path.join(tempfile.gettempdir(), "snaketik-releases")
    if os.path.isdir(os.path.join(work, ".git")):
        git("pull", "-q", cwd=work)
    else:
        shutil.rmtree(work, ignore_errors=True)
        git("clone", "-q", REPO, work, cwd=tempfile.gettempdir())
    shutil.copy2(os.path.join(ROOT, "dist", "Snake-Tik.exe"), os.path.join(work, "Snake-Tik.exe"))
    today = datetime.date.today().isoformat()
    with open(os.path.join(work, "latest.json"), "w", encoding="utf-8") as f:
        json.dump({"version": VERSION, "date": today, "notes": notes, "url": RAW_EXE}, f, ensure_ascii=False, indent=2)
    log = os.path.join(work, "CHANGELOG.md")
    old = open(log, encoding="utf-8").read() if os.path.exists(log) else "# Snake Tik · novedades\n"
    head, _, rest = old.partition("\n")
    entry = f"\n## v{VERSION} · {today}\n\n" + "\n".join(f"- {line.strip()}" for line in notes.splitlines() if line.strip()) + "\n"
    with open(log, "w", encoding="utf-8") as f:
        f.write(head + "\n" + entry + rest)
    readme = os.path.join(work, "README.md")
    with open(readme, "w", encoding="utf-8") as f:
        f.write(f"# Snake Tik · descargas\n\n**Última versión: v{VERSION}** ({today})\n\n[⬇️ Descargar Snake-Tik.exe]({RAW_EXE})\n\nNovedades en [CHANGELOG.md](CHANGELOG.md).\n")
    git("add", "-A", cwd=work)
    git("commit", "-q", "-m", f"v{VERSION}", cwd=work)
    git("push", "-q", "origin", "HEAD:main", cwd=work)
    print(f"Publicada v{VERSION}")


if __name__ == "__main__":
    main()
