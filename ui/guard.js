// Snake Tik · protección: sin menú contextual, sin atajos de herramientas de desarrollo,
// y si alguien consigue abrirlas, la página se queda en negro.
(function () {
  'use strict';
  const blocked = (e) => {
    const k = (e.key || '').toUpperCase();
    return k === 'F12' || (e.ctrlKey && e.shiftKey && 'IJCK'.includes(k)) || (e.ctrlKey && (k === 'U' || k === 'S'));
  };
  addEventListener('keydown', (e) => { if (blocked(e)) { e.preventDefault(); e.stopImmediatePropagation(); } }, true);
  addEventListener('contextmenu', (e) => e.preventDefault(), true);
  addEventListener('dragstart', (e) => e.preventDefault(), true);
  let dead = false;
  function blackout() {
    if (dead) return; dead = true;
    try { window.stop(); } catch (_) { /* nada */ }
    document.documentElement.innerHTML = '<head><title>Snake Tik</title></head><body style="margin:0;background:#000;height:100vh"></body>';
  }
  // 1) "debugger" solo se detiene si las herramientas están abiertas: si tarda, están abiertas
  setInterval(() => { const t = performance.now(); debugger; if (performance.now() - t > 120) blackout(); }, 1200); // eslint-disable-line no-debugger
  // 2) herramientas acopladas a la ventana: el área visible se encoge mucho
  setInterval(() => { if (outerWidth - innerWidth > 240 || outerHeight - innerHeight > 280) blackout(); }, 1000);
})();
