// Snake Tik · núcleo del juego + IA. Sin DOM: lo usan game.html y test_ai.js (node).
// IA: va a la manzana más cercana SOLO si, tras comérsela, aún puede alcanzar su cola.
// Si no, persigue su cola por el camino más largo (así nunca se encierra).
// Bombas: se comen y restan 1 (como la manzana suma 1). Si la serpiente llega a 0, pierde.
// El mapa completo incluye las casillas de bombas: hay que comérselas para llegar al 100 %.
(function (root) {
  'use strict';
  const FREE = 0, BODY = 1, BOMB = 2;

  class Game {
    constructor(n = 20, rng = Math.random) {
      this.n = n; this.total = n * n; this.rng = rng;
      this.wins = 0; this.losses = 0;
      this.reset();
    }

    reset() {
      const n = this.n, c = Math.floor(n / 2);
      const keepBombs = this.queueBombs || 0;   // las bombas que no llegaron a caer pasan a la siguiente partida
      this.grid = new Uint8Array(this.total);
      this.snake = [];                      // índices, cabeza primero
      for (let i = 0; i < 4; i++) this.snake.push(this.idx(c - i, c));
      for (const s of this.snake) this.grid[s] = BODY;
      this.apples = new Map();              // índice -> valor (1 normal, 3 dorada)
      this.bombs = new Set();
      this.grow = 0;
      this.dir = 0;                         // 0 der, 1 izq, 2 abajo, 3 arriba
      this.queueApples = 0; this.queueGold = 0; this.queueBombs = keepBombs;
      this.vanished = false;
      this.state = 'play';                  // play | win | lose
      this.steps = 0; this.lastEat = 0;
      this.failAt = 0;                      // botón PERDER: paso en el que se equivoca a propósito
      this.lastDir = 0;
      this.filled = new Set();              // huecos rellenados por el rescate anti-bucle (opción fillHoles)
      this.done = new Set();                // huecos dados por completados sin bloque (opción de bloques apagada)
      this.plan = null;
      this.events = [];                     // para efectos: {type, cell, value}
    }

    // el tablero está completo: lo usa la cuenta atrás de victoria
    // done = casillas vacías que se dieron por completadas al final (opción "rellenar huecos" apagada)
    isFull() { return this.bombs.size === 0 && this.snake.length + this.filled.size + this.done.size >= this.total; }

    // rescate anti-bucle: los huecos a los que ya no puede llegar (con o sin manzana) se rellenan solos
    // Antes del 80 % solo se rellenan huecos pequeños (≤ 3 casillas): una zona grande solo está tapada
    // un rato por el cuerpo y rellenarla deja bloques fijos en el tablero.
    absorbHoles() {
      const tail = this.snake[this.snake.length - 1];
      const reach = this.bfs(this.snake[0], (i) => (this.grid[i] === BODY && i !== tail) || this.filled.has(i)).dist;
      const maxComp = this.progress() >= 0.8 ? Infinity : 3;
      let n = 0;
      const seen = new Uint8Array(this.total);
      for (let s0 = 0; s0 < this.total; s0++) {
        if (seen[s0] || this.grid[s0] === BODY || reach[s0] >= 0 || this.done.has(s0)) continue;
        const comp = [s0]; seen[s0] = 1;
        for (let k = 0; k < comp.length; k++) {
          for (let d = 0; d < 4; d++) {
            const nb = this.neighbor(comp[k], d);
            if (nb >= 0 && !seen[nb] && this.grid[nb] !== BODY && reach[nb] < 0) { seen[nb] = 1; comp.push(nb); }
          }
        }
        if (comp.length > maxComp) continue;
        for (const i of comp) this.markDone(i);
        n += comp.length;
      }
      return n;
    }

    // casilla imposible de rellenar: bloque (opción "rellenar huecos") o, por defecto, completada pero vacía y pisable
    markDone(i) {
      this.apples.delete(i); this.bombs.delete(i);
      if (this.fillHoles) {
        this.grid[i] = BODY; this.filled.add(i);
        this.events.push({ type: 'absorb', cell: i });
      } else {
        this.grid[i] = FREE; this.done.add(i);
      }
    }

    // botón PERDER: se equivoca en algún momento de los próximos `maxSteps` pasos
    scheduleFail(maxSteps) {
      if (this.state !== 'play' || this.failAt) return;
      this.failAt = this.steps + 1 + Math.floor(this.rng() * Math.max(1, maxSteps));
    }

    idx(x, y) { return y * this.n + x; }
    xy(i) { return [i % this.n, Math.floor(i / this.n)]; }
    neighbor(i, d) {
      const n = this.n, x = i % n, y = (i / n) | 0;
      if (d === 0) return x + 1 < n ? i + 1 : -1;
      if (d === 1) return x > 0 ? i - 1 : -1;
      if (d === 2) return y + 1 < n ? i + n : -1;
      return y > 0 ? i - n : -1;
    }
    freeCells() { return this.total; }
    wall(i) { return this.filled.has(i); }
    progress() { return Math.min(1, (this.snake.length + this.filled.size + this.done.size) / this.total); }
    // ¿puede pisar bombas? Muy corta se moriría; con "nunca pierde" no baja de 2
    bombOk(len) { return this.noLose || len > 3 || (this.apples.size === 0 && this.steps - this.lastEat > this.stallSteps); } // con hambre y sin manzanas se las come aunque sea corta
    // comer una bomba sobre un cuerpo: -1 (primero gasta crecimiento pendiente). Devuelve si muere.
    bombHit(body, grow) {
      if (grow > 0) return { grow: grow - 1, dead: false, cut: null };
      if (this.noLose && body.length <= 2) return { grow, dead: false, cut: null };
      if (body.length <= 1) return { grow, dead: true, cut: null };
      return { grow, dead: false, cut: body.pop() };
    }

    // ---------------- búsqueda ----------------
    // BFS desde `from` sobre celdas permitidas. blocked(i) -> true si no se puede pisar.
    bfs(from, blocked) {
      const dist = new Int32Array(this.total).fill(-1), prev = new Int32Array(this.total).fill(-1);
      const q = new Int32Array(this.total); let h = 0, t = 0;
      q[t++] = from; dist[from] = 0;
      while (h < t) {
        const c = q[h++];
        for (let d = 0; d < 4; d++) {
          const nb = this.neighbor(c, d);
          if (nb < 0 || dist[nb] >= 0 || blocked(nb)) continue;
          dist[nb] = dist[c] + 1; prev[nb] = c; q[t++] = nb;
        }
      }
      return { dist, prev, order: q.subarray(0, t) };
    }

    // ¿puede la cabeza llegar a su cola? (cuerpo = muro, versión estricta: si se cumple siempre hay salida)
    tailReachable(body, grow) {
      if (body.length < 2) return true;
      const head = body[0], tail = body[body.length - 1];
      const occ = new Uint8Array(this.total);
      for (let k = 0; k < body.length - 1; k++) occ[body[k]] = 1;
      const r = this.bfs(head, (i) => occ[i] || this.wall(i));
      if (grow === 0) return r.dist[tail] >= 0;
      // creciendo: la cola sigue quieta `grow` pasos, hay que llegar a ella sin adelantarse
      occ[tail] = 1;
      const r2 = this.bfs(head, (i) => occ[i] || this.wall(i));
      for (let d = 0; d < 4; d++) {
        const nb = this.neighbor(tail, d);
        if (nb >= 0 && r2.dist[nb] >= 0 && r2.dist[nb] + 1 > grow) return true;
      }
      return false;
    }

    simulate(path) {
      const body = this.snake.slice(); let grow = this.grow;
      const eaten = new Set();
      let dead = false;
      for (const c of path) {
        body.unshift(c);
        if (this.apples.has(c) && !eaten.has(c)) { grow += this.apples.get(c); eaten.add(c); }
        if (grow > 0) grow--; else body.pop();
        if (this.bombs.has(c) && !eaten.has(c)) { eaten.add(c); const r = this.bombHit(body, grow); grow = r.grow; dead = dead || r.dead; }
      }
      return { body, grow, eaten, dead };
    }

    decide() {
      const head = this.snake[0], tail = this.snake[this.snake.length - 1];
      const bombsBlock = !this.bombOk(this.snake.length);
      const blockedNow = (i) => (this.grid[i] === BODY && !(i === tail && this.grow === 0)) || this.filled.has(i) || (bombsBlock && this.grid[i] === BOMB);

      // botón PERDER: llegó el momento de "equivocarse" (se mete contra su cuerpo, una pared o una bomba)
      if (this.failAt && this.steps >= this.failAt) {
        const bad = [];
        for (let d = 0; d < 4; d++) {
          const nb = this.neighbor(head, d);
          if (nb < 0 || this.grid[nb] === BOMB || (this.grid[nb] === BODY && nb !== tail)) bad.push(d);
        }
        // nunca hacia atrás sobre el cuello: queda feo; mejor contra el cuerpo o la pared
        const neck = this.snake[1];
        const pick = bad.filter((d) => this.neighbor(head, d) !== neck);
        if (pick.length) return pick[(this.rng() * pick.length) | 0];
        // si todo está libre alrededor, sigue unos pasos más hasta encontrar dónde chocar
      }

      // 0) jugada de final de partida ya calculada (secuencia exacta que acaba en posición segura)
      if (this.plan && this.plan.length) {
        if (this.planValid()) return this.plan.shift();
        this.plan = null;
      }
      const stalled = this.steps - this.lastEat > this.freeCells();

      // 1) manzanas por orden de cercanía (y bombas si no hay manzanas o está atascada: hay que limpiar el mapa)
      const wantBombs = this.bombs.size > 0 && !bombsBlock && (this.apples.size === 0 || stalled);
      if (this.apples.size || wantBombs) {
        const r = this.bfs(head, blockedNow);
        let tried = 0;
        for (let k = 1; k < r.order.length && tried < 8; k++) {
          const c = r.order[k];
          if (!this.apples.has(c) && !(wantBombs && this.bombs.has(c))) continue;
          tried++;
          const path = [];
          for (let p = c; p !== head; p = r.prev[p]) path.push(p);
          path.reverse();
          const sim = this.simulate(path);
          if (!sim.dead && this.tailReachable(sim.body, sim.grow)) return this.dirTo(head, path[0]);
        }
        // atascado al final: busca una secuencia exacta que coma y termine segura
        if (stalled && (this.steps & 7) === 0) {
          const plan = this.searchPlan(30, Math.min(120, this.freeCells()));
          if (plan) { this.plan = plan; return this.plan.shift(); }
        }
      }

      // 2) perseguir la cola por el camino más largo posible (sin encerrarse nunca)
      // atascada: los huecos imposibles se dan por completados aunque no tenga un movimiento seguro (si no, no acabaría nunca)
      if (this.stallSteps && this.steps - this.lastEat > this.stallSteps && !this.isFull()) {
        if (this.absorbHoles() > 0) this.lastEat = this.steps;
        else { // solo quedan manzanas/bombas imposibles de comer sin encerrarse
          let empty = false;
          for (let i = 0; i < this.total && !empty; i++) if (this.grid[i] === FREE && !this.apples.has(i) && !this.done.has(i)) empty = true;
          if (!empty && (this.apples.size || this.bombs.size)) { for (const c of [...this.apples.keys(), ...this.bombs]) this.markDone(c); this.lastEat = this.steps; }
        }
      }
      const chase = this.chaseMove(stalled);
      if (chase >= 0) {
        // rescate anti-bucle: si lleva demasiado sin comer, la manzana atascada "salta" delante de la cabeza
        if (this.stallSteps && this.steps - this.lastEat > this.stallSteps && !this.isFull()) {
          if (this.absorbHoles() > 0) { this.lastEat = this.steps; return chase; }
          // solo quedan manzanas imposibles de comer sin encerrarse: se absorben también
          let empty = false;
          for (let i = 0; i < this.total && !empty; i++) if (this.grid[i] === FREE && !this.apples.has(i) && !this.done.has(i)) empty = true;
          if (!empty && (this.apples.size || this.bombs.size)) {
            for (const a of [...this.apples.keys(), ...this.bombs]) this.markDone(a);
            this.lastEat = this.steps;
            return chase;
          }
          const nb = this.neighbor(head, chase);
          if (nb >= 0 && this.grid[nb] === FREE && !this.apples.has(nb)) {
            let from = -1;
            for (const a of this.apples.keys()) { from = a; break; }
            if (from >= 0) this.apples.delete(from);
            this.apples.set(nb, 1);
            const sim = this.simulate([nb]);
            if (this.tailReachable(sim.body, sim.grow)) {
              this.events.push({ type: 'rescue', cell: nb, from });
            } else { // no era seguro: lo dejamos como estaba
              this.apples.delete(nb);
              if (from >= 0) this.apples.set(from, 1);
            }
          }
        }
        return chase;
      }
      return this.lastResort();
    }

    chaseMove(stalled) {
      const head = this.snake[0], tail = this.snake[this.snake.length - 1];
      const bombsBlock = !this.bombOk(this.snake.length);
      const blockedNow = (i) => (this.grid[i] === BODY && !(i === tail && this.grow === 0)) || this.filled.has(i) || (bombsBlock && this.grid[i] === BOMB);
      let best = -1, bestScore = -Infinity;
      for (let d = 0; d < 4; d++) {
        const nb = this.neighbor(head, d);
        if (nb < 0 || blockedNow(nb)) continue;
        const sim = this.simulate([nb]);
        if (sim.dead || !this.tailReachable(sim.body, sim.grow)) continue;
        const st = sim.body[sim.body.length - 1];
        const occ = new Uint8Array(this.total);
        for (let k = 0; k < sim.body.length - 1; k++) occ[sim.body[k]] = 1;
        const r = this.bfs(nb, (i) => occ[i] || this.wall(i));
        // lejos de la cola = recorre el tablero; si lleva rato sin comer, se arrima a las manzanas
        let appleDist = 0;
        if (this.apples.size) {
          let m = 99;
          for (const a of this.apples.keys()) if (r.dist[a] >= 0 && r.dist[a] < m) m = r.dist[a];
          appleDist = m;
        }
        const score = (r.dist[st] >= 0 ? r.dist[st] : 0) * (stalled ? 1 : 4) + this.wallHug(nb, sim.body)
          - appleDist * (stalled ? 3 : 0.5) + this.rng() * (stalled ? 6 : 0.5);
        if (score > bestScore) { bestScore = score; best = d; }
      }
      return best;
    }

    // 3) sin salida segura: la casilla con más espacio libre
    lastResort() {
      const head = this.snake[0], tail = this.snake[this.snake.length - 1];
      // emergencia: si no hay otra salida, se come la bomba (aunque le cueste la vida)
      const blockedNow = (i) => (this.grid[i] === BODY && !(i === tail && this.grow === 0)) || this.filled.has(i);
      let best = -1, bestArea = 0;
      for (let d = 0; d < 4; d++) {
        const nb = this.neighbor(head, d);
        if (nb < 0 || blockedNow(nb)) continue;
        const sim = this.simulate([nb]);
        const occ = new Set(sim.body.slice(1));
        const area = this.bfs(nb, (i) => occ.has(i) || this.wall(i)).order.length;
        if (area > bestArea) { bestArea = area; best = d; }
      }
      return best;
    }

    // un movimiento exacto sobre un estado copiado; devuelve false si choca
    applyMove(st, d) {
      const head = st.body[0], nb = this.neighbor(head, d);
      if (nb < 0 || this.wall(nb)) return false;
      const tail = st.body[st.body.length - 1];
      if (st.occ[nb] && !(nb === tail && st.grow === 0)) return false;
      if (st.apples.has(nb)) { st.grow += st.apples.get(nb); st.apples.delete(nb); st.ate = true; }
      if (st.grow > 0) st.grow--; else { st.occ[st.body.pop()] = 0; }
      st.body.unshift(nb); st.occ[nb] = 1;
      if (st.bombs.has(nb)) {
        st.bombs.delete(nb);
        const r = this.bombHit(st.body, st.grow);
        if (r.dead) return false;
        st.grow = r.grow;
        if (r.cut !== null) st.occ[r.cut] = 0;
      }
      return true;
    }

    copyState() {
      const occ = new Uint8Array(this.total);
      for (const s of this.snake) occ[s] = 1;
      return { body: this.snake.slice(), occ, grow: this.grow, apples: new Map(this.apples), bombs: new Set(this.bombs), ate: false };
    }

    // distancia de cada casilla a la manzana más cercana (una sola BFS desde todas las manzanas)
    appleField(st) {
      const dist = new Int32Array(this.total).fill(-1), q = new Int32Array(this.total);
      let h = 0, t = 0;
      for (const a of st.apples.keys()) { dist[a] = 0; q[t++] = a; }
      while (h < t) {
        const c = q[h++];
        for (let d = 0; d < 4; d++) {
          const nb = this.neighbor(c, d);
          if (nb < 0 || dist[nb] >= 0 || this.wall(nb)) continue;
          dist[nb] = dist[c] + 1;
          if (!st.occ[nb]) q[t++] = nb; // el cuerpo recibe distancia pero no la propaga
        }
      }
      return dist;
    }

    // muchas partidas imaginarias cortas: la primera que come y acaba en posición segura (estricta) gana
    searchPlan(rollouts, maxLen) {
      for (let r = 0; r < rollouts; r++) {
        const st = this.copyState(), moves = [];
        for (let k = 0; k < maxLen; k++) {
          const opts = [];
          for (let d = 0; d < 4; d++) {
            const nb = this.neighbor(st.body[0], d);
            if (nb < 0 || this.wall(nb)) continue;
            const tail = st.body[st.body.length - 1];
            if (st.occ[nb] && !(nb === tail && st.grow === 0)) continue;
            opts.push(d);
          }
          if (!opts.length) break;
          // casi siempre hacia la manzana más cercana, a veces al azar para explorar
          let d = opts[(this.rng() * opts.length) | 0];
          if (!st.ate && this.rng() < 0.7) {
            const field = this.appleField(st);
            let bestD = 1e9;
            for (const o of opts) {
              const nb = this.neighbor(st.body[0], o);
              const m = field[nb] >= 0 ? field[nb] : 1e6;
              if (m < bestD) { bestD = m; d = o; }
            }
          }
          this.applyMove(st, d);
          moves.push(d);
          if (st.ate && this.tailReachable(st.body, st.grow)) return moves;
        }
      }
      return null;
    }

    // ¿la jugada guardada sigue siendo posible tal cual (nuevas bombas/manzanas)?
    planValid() {
      const st = this.copyState();
      let ateBefore = false;
      for (const d of this.plan) { if (!this.applyMove(st, d)) return false; ateBefore = ateBefore || st.ate; }
      return this.tailReachable(st.body, st.grow);
    }

    // prefiere ir pegado a paredes y a su propio cuerpo (rellena compacto, como en el vídeo)
    wallHug(c, body) {
      const set = new Set(body); let s = 0;
      for (let d = 0; d < 4; d++) {
        const nb = this.neighbor(c, d);
        if (nb < 0 || set.has(nb) || this.wall(nb)) s++;
      }
      return s;
    }

    dirTo(a, b) {
      for (let d = 0; d < 4; d++) if (this.neighbor(a, d) === b) return d;
      return -1;
    }

    // ---------------- un paso ----------------
    step() {
      if (this.state !== 'play') return;
      this.steps++;
      const d = this.decide();
      const nb = d < 0 ? -1 : this.neighbor(this.snake[0], d);
      const tail = this.snake[this.snake.length - 1];
      if (nb < 0 || (this.grid[nb] === BODY && !(nb === tail && this.grow === 0))) {
        // red de seguridad: en vez de chocar, revienta media cola para tener salida (salvo si PERDER está activo)
        // (varios intentos: dar la vuelta o volver a cortar hasta que la cabeza tenga salida)
        if (!this.failAt && (this._rescues || 0) < 8 && this._rescueCut()) {
          this._rescues = (this._rescues || 0) + 1; this.steps--; this.step(); this._rescues = 0; return;
        }
        return this.lose('crash');
      }
      this.dir = d;
      // mismo orden que simulate(): comer primero, luego decidir si la cola avanza
      if (this.apples.has(nb)) {
        const v = this.apples.get(nb);
        this.grow += v; this.apples.delete(nb); this.lastEat = this.steps;
        this.events.push({ type: 'eat', cell: nb, value: v });
      }
      if (this.grow > 0) this.grow--;
      else { this.grid[tail] = FREE; this.snake.pop(); }
      this.snake.unshift(nb);
      if (this.bombs.has(nb)) { // bomba: -1
        this.bombs.delete(nb);
        const r = this.bombHit(this.snake, this.grow);
        this.grow = r.grow;
        if (r.cut !== null) this.grid[r.cut] = FREE;
        this.events.push({ type: 'bombEat', cell: nb, cut: r.cut });
        if (r.dead) { // llegó a 0: desaparece
          for (const c of this.snake) this.grid[c] = FREE;
          this.vanished = true;
          return this.lose('bomb');
        }
      }
      this.grid[nb] = BODY; this.done.delete(nb);
      if (this.isFull()) this.grow = 0; // tablero lleno: ya no cabe crecer (si no, chocaría con su cola)
      if (d !== this.lastDir) this.events.push({ type: 'turn', dir: d });
      this.lastDir = d;
      // la victoria la da la cuenta atrás de fuera (isFull() + N segundos sin bombas)
    }

    // bombas con el tablero lleno: explotan el final de la cola y dejan sitio para ellas
    blastTail(k) {
      // primero vuelan los huecos rellenados, luego la cola
      for (const c of this.filled) { if (k <= 0) break; this.filled.delete(c); this.grid[c] = FREE; this.events.push({ type: 'blast', cell: c }); k--; }
      k = Math.min(k, this.snake.length - 4);
      for (let i = 0; i < k; i++) {
        const c = this.snake.pop();
        this.grid[c] = FREE;
        this.events.push({ type: 'blast', cell: c });
      }
      this.grow = 0;
      this.plan = null;
      return k;
    }

    // sin salida: si la cabeza está encerrada por su propio cuello, se da la vuelta (la cola pasa a ser la cabeza);
    // si no, corta la mitad de la cola (y los huecos rellenados) para que vuelva a haber salida
    _rescueCut() {
      const rev = this.snake.slice().reverse();
      const head = rev[0];
      for (let d = 0; d < 4; d++) {
        const nb = this.neighbor(head, d);
        if (nb >= 0 && this.grid[nb] !== BODY) {
          this.snake = rev; this.grow = 0; this.plan = null;
          this.events.push({ type: 'reverse' });
          return true;
        }
      }
      if (this.snake.length <= 2 && !this.filled.size) return false;
      for (const c of this.filled) { this.grid[c] = FREE; this.events.push({ type: 'blast', cell: c }); }
      this.filled.clear();
      const k = Math.floor(this.snake.length / 2);
      for (let i = 0; i < k; i++) { const c = this.snake.pop(); this.grid[c] = FREE; this.events.push({ type: 'blast', cell: c }); }
      this.grow = 0; this.plan = null;
      this.events.push({ type: 'blasted', count: k });
      return true;
    }

    // airdrop: suelta `k` manzanas en casillas libres al azar de la columna x
    dropColumn(x, k) {
      const free = [];
      for (let y = 0; y < this.n; y++) {
        const i = this.idx(x, y);
        if (this.grid[i] === FREE && !this.apples.has(i)) free.push(i);
      }
      let placed = 0;
      for (let j = 0; j < k && free.length; j++) {
        const c = free.splice((this.rng() * free.length) | 0, 1)[0];
        this.apples.set(c, 1);
        this.events.push({ type: 'apple', cell: c, value: 1, drop: true });
        placed++;
      }
      return placed;
    }

    lose(reason = 'manual') {
      if (this.state !== 'play') return;
      this.state = 'lose'; this.losses++;
      this.events.push({ type: 'lose', cell: this.snake[0], reason });
    }

    win() {
      if (this.state !== 'play') return;
      this.state = 'win'; this.wins++;
      this.events.push({ type: 'win' });
    }

    // ---------------- aparecer cosas ----------------
    randomFree(filter) {
      const free = [];
      for (let i = 0; i < this.total; i++) if (this.grid[i] === FREE && !this.apples.has(i) && !this.done.has(i) && (!filter || filter(i))) free.push(i);
      return free.length ? free[(this.rng() * free.length) | 0] : -1;
    }

    spawnTick(max = 3) {
      if (this.state !== 'play') return;
      let reach = null;
      for (let k = 0; k < max; k++) {
        if (this.queueBombs > 0) {
          const [hx, hy] = this.xy(this.snake[0]);
          let c = this.randomFree((i) => { const [x, y] = this.xy(i); return Math.abs(x - hx) + Math.abs(y - hy) > 2; });
          if (c < 0) c = this.randomFree();
          if (c < 0) break; // sin sitio: esperan (y si no, pasan a la siguiente partida)
          this.queueBombs--;
          if (c >= 0) { this.bombs.add(c); this.grid[c] = BOMB; this.events.push({ type: 'bomb', cell: c }); }
        } else if (this.queueGold > 0 || this.queueApples > 0) {
          // en una casilla a la que pueda llegar ya: si cae en una zona tapada por el cuerpo se atasca
          // y el rescate acabaría rellenando esa zona con bloques
          if (!reach) { const tail = this.snake[this.snake.length - 1]; reach = this.bfs(this.snake[0], (i) => (this.grid[i] === BODY && i !== tail) || this.filled.has(i)).dist; }
          // con bloques: solo donde ya puede llegar; sin bloques: en cualquier sitio (así entra en zonas que su cuerpo tapaba)
          let c = this.fillHoles ? this.randomFree((i) => reach[i] >= 0) : this.randomFree();
          if (c < 0) c = this.randomFree();
          if (c < 0) break;
          const gold = this.queueGold > 0;
          if (gold) this.queueGold--; else this.queueApples--;
          this.apples.set(c, gold ? 3 : 1);
          this.events.push({ type: 'apple', cell: c, value: gold ? 3 : 1 });
        } else break;
      }
      // tablero lleno y llegan bombas: revientan la cola para hacerles sitio
      if (this.queueBombs > 0 && this.isFull()) {
        const k = this.blastTail(Math.min(this.queueBombs, Math.max(4, Math.floor(this.total * 0.15))));
        if (k > 0) this.events.push({ type: 'blasted', count: k });
      }
      // siempre hay al menos una manzana en juego (en una casilla a la que pueda llegar)
      if (this.apples.size === 0 && this.queueApples === 0 && this.queueGold === 0 && !this.isFull()) {
        const tail = this.snake[this.snake.length - 1];
        const reach = this.bfs(this.snake[0], (i) => (this.grid[i] === BODY && i !== tail) || this.filled.has(i)).dist;
        let c = this.randomFree((i) => reach[i] >= 0);
        if (c < 0) c = this.randomFree();
        if (c >= 0) {
          const gold = this.rng() < 0.08;
          this.apples.set(c, gold ? 3 : 1);
          this.events.push({ type: 'apple', cell: c, value: gold ? 3 : 1 });
        }
      }
    }

    add(kind, amount) {
      if (kind === 'apples') this.queueApples += amount;
      else if (kind === 'gold') this.queueGold += amount;
      else if (kind === 'bombs') this.queueBombs += amount;
    }
  }

  const api = { Game, FREE, BODY, BOMB };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SnakeCore = api;
})(this);
