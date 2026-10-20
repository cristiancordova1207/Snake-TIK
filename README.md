# Snake Tik

La serpiente que juega sola en tu directo de TikTok. Los regalos del público sueltan manzanas, bombas o un airdrop; la IA intenta llenar el tablero.

- `snake_tik.py` — programa (Flask local en 127.0.0.1:5010, ventanas en Chrome: panel y juego 9:16).
- `account.py` — cuenta, licencia y pulso contra Supabase (`snake-api`).
- `ui/` — panel (`index.html`, `panel.js`), juego (`game.html`, `render.js`, `snake-core.js`), sonidos (`sfx.js`, `sfx/keys`), idiomas (`i18n.js`).
- `supabase/` — esquema (`snake.sql`) y funciones Edge (`snake-api`, `snake-stripe`).
- `tools/build.py` — compila `dist/Snake-Tik.exe`; `tools/release.py` — publica en Snake-Tik---Releases.
- `test_ai.js` — simulaciones de la IA (`node test_ai.js`).

Los sonidos de teclas vienen de los packs de [Mechvibes](https://github.com/hainguyents13/mechvibes) (MIT).
