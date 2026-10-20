// Selector de temas (skill /temas). Uso: ThemePicker.mount(contenedor, temaGuardado, (id) => guardar(id))
// Devuelve set(id) por si hay que cambiar el tema desde fuera.
(function () {
  const THEMES = [
    ['cozy-night', 'Cozy Night', '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>'],
    ['cozy-day', 'Cozy Day', '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'],
    ['midnight', 'Midnight', '<path d="M12 3l1.9 5.6L19.5 10l-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.4z"/><path d="M19 17l.6 1.4L21 19l-1.4.6L19 21l-.6-1.4L17 19l1.4-.6z"/>'],
    ['matcha', 'Matcha', '<path d="M5 19c0-8 5-13 14-14 0 9-5 14-13 14z"/><path d="M5 19c3-3 6-6 9-8"/>'],
    ['sakura', 'Sakura', '<circle cx="12" cy="7.2" r="2.8"/><circle cx="16.6" cy="10.5" r="2.8"/><circle cx="14.8" cy="15.9" r="2.8"/><circle cx="9.2" cy="15.9" r="2.8"/><circle cx="7.4" cy="10.5" r="2.8"/>'],
    ['ocean', 'Océano', '<path d="M2 10c2.5-3 5-3 7.5 0s5 3 7.5 0 3.5-2 5-1.5M2 16c2.5-3 5-3 7.5 0s5 3 7.5 0 3.5-2 5-1.5"/>'],
    ['sunset', 'Atardecer', '<path d="M4 17h16M7 17a5 5 0 0 1 10 0M12 5v3M5.6 9.6l1.8 1.4M18.4 9.6l-1.8 1.4M7 21h10"/>'],
    ['mocha', 'Mocha', '<path d="M4 9h12v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5zM16 10h1.5a2.5 2.5 0 0 1 0 5H16M8 3v3M12 3v3"/>'],
    ['uva', 'Uva', '<circle cx="9" cy="9" r="2.4"/><circle cx="14" cy="9" r="2.4"/><circle cx="11.5" cy="13.4" r="2.4"/><circle cx="16.5" cy="13.4" r="2.4"/><circle cx="14" cy="17.8" r="2.4"/><path d="M11 6.6 9.5 3"/>'],
    ['arctic', 'Ártico', '<path d="M12 2v20M4.9 7l14.2 10M4.9 17 19.1 7M9 4l3 2 3-2M9 20l3-2 3 2"/>'],
  ];

  function mount(el, current, onChange) {
    el.classList.add('theme-picker');
    el.setAttribute('role', 'radiogroup');
    el.setAttribute('aria-label', 'Tema');
    el.innerHTML = '<span class="tp-pill"></span>' + THEMES.map(([id, name, icon]) =>
      `<button type="button" role="radio" data-theme="${id}" title="${name}" aria-label="${name}"><svg viewBox="0 0 24 24">${icon}</svg></button>`).join('');
    const pill = el.querySelector('.tp-pill');
    const btns = [...el.querySelectorAll('button')];
    const set = (id, user) => {
      let i = THEMES.findIndex((t) => t[0] === id);
      if (i < 0) i = 0;
      document.documentElement.dataset.theme = THEMES[i][0];
      btns.forEach((b, k) => { b.classList.toggle('on', k === i); b.setAttribute('aria-checked', k === i); });
      const cols = parseInt(getComputedStyle(el).getPropertyValue('--cols'), 10) || THEMES.length;
      pill.style.transform = `translate(${(i % cols) * 100}%, ${Math.floor(i / cols) * 100}%)`;
      if (user && onChange) onChange(THEMES[i][0]);
    };
    btns.forEach((b) => (b.onclick = () => set(b.dataset.theme, true)));
    set(current);
    return set;
  }

  window.ThemePicker = { THEMES, mount };
})();
