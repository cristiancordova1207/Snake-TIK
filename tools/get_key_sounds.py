"""Descarga los packs de Mechvibes (MIT) y recorta SOLO el sonido de las 4 flechas.
Resultado: ui/sfx/keys/<pack>/{up,down,left,right}.mp3  +  ui/sfx/keys/packs.json
Uso: py -3.13 tools/get_key_sounds.py
"""
import json
import os
import subprocess
import tempfile
import urllib.request

RAW = "https://raw.githubusercontent.com/hainguyents13/mechvibes/master/src/audio/"
API = "https://api.github.com/repos/hainguyents13/mechvibes/contents/src/audio"
OUT = os.path.join(os.path.dirname(__file__), "..", "ui", "sfx", "keys")
# códigos de las flechas en Mechvibes (scancodes de uiohook)
ARROWS = {"up": "57416", "down": "57424", "left": "57419", "right": "57421"}
FALLBACK = ["30", "31", "32", "33"]  # A S D F si el pack no trae flechas
# color del vástago del switch para el icono
COLORS = {"black": "#1f1f24", "blue": "#3b82f6", "brown": "#8b5a2b", "red": "#ef4444", "purple": "#a855f7",
          "cream": "#f2e3c6", "oreo": "#2b2b2b", "pandas": "#f5c542", "topre": "#7c3aed", "turquoise": "#2dd4bf"}


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": "SnakeTik"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()


def color_for(pid):
    for k, c in COLORS.items():
        if k in pid:
            return c
    return "#94a3b8"


def cut(src, dst, start_ms, dur_ms):
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", f"{start_ms / 1000:.3f}", "-t", f"{max(dur_ms, 60) / 1000:.3f}",
                    "-i", src, "-af", "afade=t=out:st=%.3f:d=0.03" % (max(dur_ms, 60) / 1000 - 0.03),
                    "-ac", "1", "-b:a", "96k", dst], check=True)


def main():
    packs = []
    names = [x["name"] for x in json.loads(get(API))]
    tmp = tempfile.mkdtemp()
    for pid in names:
        cfg = json.loads(get(RAW + pid + "/config.json"))
        d = os.path.join(OUT, pid)
        os.makedirs(d, exist_ok=True)
        defines = cfg.get("defines", {})
        if cfg.get("key_define_type") == "single":
            src = os.path.join(tmp, pid + os.path.splitext(cfg["sound"])[1])
            with open(src, "wb") as f:
                f.write(get(RAW + pid + "/" + cfg["sound"]))
            for i, (arrow, code) in enumerate(ARROWS.items()):
                seg = defines.get(code) or defines.get(FALLBACK[i]) or next(v for k, v in defines.items() if v and "-up" not in k)
                cut(src, os.path.join(d, arrow + ".mp3"), seg[0], seg[1])
        else:  # "multi": un archivo por tecla; usamos los genéricos
            pattern = cfg.get("sound", "")
            files = []
            if "{0-4}" in pattern:
                files = [pattern.replace("{0-4}", str(k)) for k in range(4)]
            else:
                files = [v for k, v in defines.items() if isinstance(v, str) and "-up" not in k][:4]
            for arrow, fname in zip(ARROWS, (files * 4)[:4]):
                src = os.path.join(tmp, pid + "_" + os.path.basename(fname))
                with open(src, "wb") as f:
                    f.write(get(RAW + pid + "/" + fname))
                subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", src, "-t", "0.35", "-ac", "1", "-b:a", "96k",
                                os.path.join(d, arrow + ".mp3")], check=True)
        packs.append({"id": pid, "name": cfg.get("name", pid).replace("pandas", "Holy Pandas"), "color": color_for(pid)})
        print("ok", pid)
    with open(os.path.join(OUT, "packs.json"), "w", encoding="utf-8") as f:
        json.dump(packs, f, ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main()
