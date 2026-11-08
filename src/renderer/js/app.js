'use strict';
// Navigation, theme and system line. Views live in FD.views and render into #view.
(function (FD) {
  const { h } = FD;
  const NAV = [
    { group: null, items: [{ view: 'home', sec: null, icon: 'home', label: 'Overview' }] },
    { group: 'Analyses', items: [
      { view: 'single', icon: 'wall', label: 'Single wall' },
      { view: 'study', icon: 'chart', label: 'Parametric study' },
    ] },
    { group: 'Paper', items: [
      { view: 'rigid', sec: '3', label: 'Rigid phase' },
      { view: 'integrity', sec: '4', label: 'Integrity in the fall' },
      { view: 'total', sec: '5', label: 'Total collapse' },
    ] },
    { group: null, items: [{ view: 'about', sec: null, icon: 'info', label: 'About' }] },
  ];
  let info = null;

  function buildNav() {
    const nav = document.getElementById('nav');
    nav.replaceChildren();
    for (const g of NAV) {
      if (g.group) nav.append(h('div', { class: 'nav-group' }, g.group));
      else nav.append(h('div', { style: 'height:8px' }));
      for (const it of g.items) {
        const mark = it.sec ? h('span', { class: 'sec' }, it.sec) : h('span', { class: 'sec' }, FD.icon(it.icon));
        nav.append(h('button', { class: 'nav', 'data-view': it.view || '', disabled: !it.view, title: it.view ? null : 'In preparation',
          onclick: () => it.view && go(it.view) }, mark, it.label, it.view ? null : h('span', { class: 'pill' }, 'soon')));
      }
    }
  }

  async function go(view) {
    const prev = FD.current && FD.views[FD.current];
    if (prev && prev.leave) prev.leave();
    FD.clearTheme();
    FD.current = view;
    document.querySelectorAll('#nav .nav').forEach(b => b.classList.toggle('active', b.dataset.view === view));
    const root = document.getElementById('view');
    root.replaceChildren();
    document.getElementById('main').scrollTop = 0;
    try { await FD.views[view].render(root, info, go); }
    catch (e) { root.append(h('div', { class: 'card' }, h('h2', {}, 'Something went wrong'), h('pre', { class: 'small' }, String(e && e.stack || e)))); }
  }

  function setTheme(t) {
    if (t === 'auto') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', t);
    localStorage.setItem('theme', t);
    document.querySelectorAll('#themeSwitch button').forEach(b => b.classList.toggle('on', b.dataset.t === t));
    requestAnimationFrame(() => FD.themeChanged());
  }

  async function main() {
    info = await window.api.info();
    FD.info = info;
    buildNav();
    document.querySelectorAll('#themeSwitch button').forEach(b => b.addEventListener('click', () => setTheme(b.dataset.t)));
    setTheme(localStorage.getItem('theme') || 'auto');
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => FD.themeChanged());
    document.getElementById('sysinfo').textContent = `v${info.version} · ${info.platform === 'darwin' ? 'macOS' : info.platform === 'win32' ? 'Windows' : info.platform} ${info.arch} · ${info.defaultWorkers} parallel runs`;
    go('home');
  }
  FD.views = FD.views || {};
  main();
})(window.FD);
