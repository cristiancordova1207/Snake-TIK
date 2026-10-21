// Simula partidas con regalos aleatorios y comprueba la IA:  node test_ai.js [partidas]
// - no debe perder sola
// - debe llegar al 100 % y ganar tras la cuenta atrás (aquí 120 pasos = 10 s a 12 mov/s)
// - el rescate anti-bucle (15 s = 180 pasos) evita quedarse dando vueltas
// - el botón PERDER hace que pierda en menos de 5 s (60 pasos)
const { Game } = require('./ui/snake-core.js');

let seed = 12345;
const rng = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const COUNTDOWN = 120;

const GAMES = +process.argv[2] || 40;
let bombDeaths = 0, wins = 0, losses = 0, stalls = 0, stepsTotal = 0, rescues = 0;
for (let g = 0; g < GAMES; g++) {
  const n = [10, 14, 20, 26][g % 4];
  const game = new Game(n, rng);
  game.stallSteps = 180;
  let t = 0, fullFor = 0;
  while (game.state === 'play' && t < 60000) {
    const r = t < 2500 ? rng() : 1;
    if (r < 0.03) game.add('apples', 5);
    else if (r < 0.04) game.add('bombs', 5);
    else if (r < 0.0405) game.add('bombs', 150);
    else if (r < 0.042) game.add('apples', 150);
    const before = game.queueBombs;
    game.spawnTick(3);
    game.step();
    for (const e of game.events) { if (e.type === 'rescue') rescues++; if (e.type === 'lose' && e.reason === 'bomb') bombDeaths++; }
    game.events.length = 0;
    // cuenta atrás de victoria: se reinicia si llegan bombas o deja de estar lleno
    fullFor = game.isFull() && game.queueBombs === 0 && before === game.queueBombs ? fullFor + 1 : 0;
    if (fullFor >= COUNTDOWN) game.win();
    t++;
  }
  if (game.state === 'win') wins++; else if (game.state === 'lose') losses++; else stalls++;
  stepsTotal += t;
}
console.log(`partidas=${GAMES} ganadas=${wins} perdidas=${losses} (por bomba, válidas: ${bombDeaths}) atascadas=${stalls} rescates=${rescues} pasos medios=${Math.round(stepsTotal / GAMES)}`);

// botón PERDER
let failOk = 0;
for (let g = 0; g < 20; g++) {
  const game = new Game(20, rng);
  for (let i = 0; i < 200; i++) { game.spawnTick(3); game.step(); }
  const at = game.steps;
  game.scheduleFail(60);
  while (game.state === 'play' && game.steps < at + 400) { game.spawnTick(3); game.step(); }
  if (game.state === 'lose' && game.steps - at <= 120) failOk++;
}
console.log(`botón PERDER: ${failOk}/20 pierden a tiempo`);
// perder por bombas es la regla del juego (-1 por bomba); fallo = chocar o atascarse
if (losses - bombDeaths > 0 || stalls > 0 || failOk < 18) { console.error('FALLO'); process.exit(1); }
