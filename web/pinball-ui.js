import { Pinball, BUMPERS, TARGETS, TABLE_WALLS, PINBALL_GOAL } from './pinball.js';

export function createPinballUI({ root, storage, onExit }) {
  const key = 'dr-karate-pinball-best-v1';
  let best = 0, saved = !!storage, active = false, last = 0, toast = '', toastUntil = 0, previousStatus = '', animation = 0;
  const keys = new Set(), pointers = new Map();
  try { const n = Number(storage?.getItem(key)); if (Number.isSafeInteger(n) && n >= 0 && n < 1000000) best = n; } catch { saved = false; }
  root.innerHTML = `<header class="mode-heading"><div><p class="eyebrow">ГРАВИТИ ФОЛЗ · ВЕСТЕРН-ПИНБОЛ</p><h2>Террор перекати-поле</h2></div><button class="mode-back">Главное меню</button></header>
    <div class="pinball-layout"><div class="pinball-playfield"><div class="pinball-table"><canvas width="420" height="680" tabindex="0" aria-label="Поле пинбола. A и D или стрелки — флипперы. Пробел — запуск. P — пауза."></canvas></div><div class="pinball-controls"><button data-flipper="left" aria-label="Левый флиппер">Левый флиппер</button><button class="pinball-table-action">Запуск</button><button data-flipper="right" aria-label="Правый флиппер">Правый флиппер</button></div></div>
    <aside class="pinball-side"><p class="eyebrow">СБЕГИ ИЗ АВТОМАТА</p><h3>Набери 3 000</h3><p class="pinball-story">Механический шериф запер выход. Отбивай шарик и зажги три звезды, чтобы разрушить его заклятие.</p>
    <div class="pinball-score" aria-label="Текущий счёт"><b>0</b><span>ОЧКОВ / 3 000</span></div><p class="pinball-lives"></p><p class="pinball-best"></p><p class="pinball-status" role="status" aria-live="polite"></p>
    <button class="pinball-launch">Запустить шарик</button><button class="pinball-pause" disabled>Пауза</button>
    <details><summary>Правила и управление</summary><p>Три шарика на попытку. Перекати-поле даёт 50 очков. Новая звезда — 150, уже горящая — 25. Три звезды вместе дают ещё 300 очков и загораются заново.</p><p>A / ← и D / → — флипперы. Пробел — запуск. P или Escape — пауза. На телефоне удерживай кнопки под полем. При уходе с вкладки шарик останавливается.</p><p>Рекорд сохраняется в этом браузере. Текущая попытка при перезагрузке начинается заново.</p></details>
    <small class="pinball-note">Фан-версия по мотивам автомата из мультсериала.</small></aside></div>`;
  const $ = s => root.querySelector(s), canvas = $('canvas'), ctx = canvas.getContext('2d');
  const game = new Pinball({ onEvent(event) {
    if (event.type === 'score' && game.score > best) {
      best = game.score;
      try { if (!storage) throw new Error('No storage'); storage.setItem(key, String(best)); saved = true; } catch { saved = false; }
    }
    if (event.type === 'bonus') { toast = 'ТРИ ЗВЕЗДЫ! +300'; toastUntil = performance.now() + 1800; }
    if (event.type === 'drain') clearInput();
  } });
  function clearInput() { keys.clear(); pointers.clear(); root.querySelectorAll('[data-flipper]').forEach(b => b.classList.remove('pressed')); }
  function pause(value) { game.pause(value); clearInput(); render(); }
  function launch() {
    if (['won', 'lost'].includes(game.phase)) game.reset();
    game.launch(); $('.pinball-playfield').scrollIntoView({ block: 'start', behavior: 'instant' }); canvas.focus({ preventScroll: true }); render();
  }
  $('.mode-back').onclick = onExit; $('.pinball-launch').onclick = launch;
  $('.pinball-pause').onclick = () => pause(!game.paused);
  $('.pinball-table-action').onclick = () => game.phase === 'playing' ? pause(!game.paused) : launch();
  root.querySelectorAll('[data-flipper]').forEach(button => {
    button.onpointerdown = e => { e.preventDefault(); if (game.paused || game.phase !== 'playing') return; button.setPointerCapture(e.pointerId); pointers.set(e.pointerId, button.dataset.flipper); button.classList.add('pressed'); };
    const release = e => { pointers.delete(e.pointerId); if (![...pointers.values()].includes(button.dataset.flipper)) button.classList.remove('pressed'); };
    button.onpointerup = release; button.onpointercancel = release; button.onlostpointercapture = release;
    button.oncontextmenu = e => e.preventDefault();
    button.onkeydown = e => { if (['Space', 'Enter'].includes(e.code)) { e.preventDefault(); keys.add(button.dataset.flipper); } };
    button.onkeyup = e => { if (['Space', 'Enter'].includes(e.code)) keys.delete(button.dataset.flipper); };
    button.onblur = () => keys.delete(button.dataset.flipper);
  });
  window.addEventListener('keydown', e => {
    if (!active || e.ctrlKey || e.metaKey || e.altKey || e.target.closest?.('[data-flipper]')) return;
    const side = ['KeyA', 'ArrowLeft'].includes(e.code) ? 'left' : ['KeyD', 'ArrowRight'].includes(e.code) ? 'right' : null;
    if (side) { e.preventDefault(); keys.add(side); }
    if (['KeyP', 'Escape'].includes(e.code) && !e.repeat) { e.preventDefault(); pause(!game.paused); }
    if (e.code === 'Space' && e.target === canvas) { e.preventDefault(); if (!e.repeat) launch(); }
  });
  window.addEventListener('keyup', e => { if (['KeyA', 'ArrowLeft'].includes(e.code)) keys.delete('left'); if (['KeyD', 'ArrowRight'].includes(e.code)) keys.delete('right'); });
  window.addEventListener('blur', () => { if (active) pause(true); });
  document.addEventListener('visibilitychange', () => { if (active && document.hidden) pause(true); });
  function line(points, color, width) {
    ctx.beginPath(); ctx.moveTo(points[0], points[1]); ctx.lineTo(points[2], points[3]); ctx.lineWidth = width; ctx.strokeStyle = color; ctx.lineCap = 'round'; ctx.stroke();
  }
  function circle(x, y, r, fill, stroke = '') { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = fill; ctx.fill(); if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 3; ctx.stroke(); } }
  function label(text, x, y, size, color = '#ffe3a7') { ctx.font = `bold ${size}px Georgia, serif`; ctx.textAlign = 'center'; ctx.fillStyle = color; ctx.fillText(text, x, y); }
  function render() {
    const g = ctx.createLinearGradient(0, 0, 0, 680); g.addColorStop(0, '#392a30'); g.addColorStop(.55, '#9c5636'); g.addColorStop(1, '#362925');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 420, 680);
    ctx.fillStyle = '#dba35114';
    for (let y = 45; y < 680; y += 32) ctx.fillRect(20, y, 380, 1);
    label('TUMBLEWEED', 195, 68, 27); label('TERROR', 195, 98, 27, '#e9a066');
    label(`${game.score} / 3000 · ШАРИКИ ${game.lives}`, 195, 123, 13);
    // Desert silhouettes and rails are drawn directly, so the board stays crisp at any scale.
    ctx.fillStyle = '#242f2b';
    for (const [x, y] of [[43, 228], [323, 230]]) { ctx.fillRect(x, y, 9, 70); ctx.fillRect(x - 15, y + 22, 32, 8); ctx.fillRect(x - 15, y + 5, 7, 24); ctx.fillRect(x + 13, y + 12, 7, 19); }
    for (const wall of TABLE_WALLS) { line(wall, '#1c2024', 14); line(wall, '#bc9562', 7); }
    BUMPERS.forEach((p, i) => {
      circle(p.x, p.y, p.r + 5, '#412c24', '#e9b862'); circle(p.x, p.y, p.r, game.cooldowns[i] > 0 ? '#ffe3a0' : '#a8763b');
      ctx.save(); ctx.translate(p.x, p.y);
      for (let k = 0; k < 7; k++) { ctx.rotate(Math.PI / 7); ctx.strokeStyle = '#53321c'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(0, 0, p.r - 3, 7, .6, 0, Math.PI * 2); ctx.stroke(); }
      ctx.restore();
    });
    TARGETS.forEach((p, i) => { circle(p.x, p.y, p.r + 5, game.targets[i] ? '#f1c661' : '#453931', '#d4a458'); label('★', p.x, p.y + 9, 27, game.targets[i] ? '#4b3427' : '#d4a458'); });
    label('ЗАЖГИ ТРИ ЗВЕЗДЫ', 193, 438, 16); label('+300', 193, 463, 19);
    for (let i = 0; i < 2; i++) {
      const x = i === 0 ? 139 : 281, a = game.flippers[i];
      line([x, 555, x + Math.cos(a) * 60, 555 + Math.sin(a) * 60], '#29272a', 20);
      line([x, 555, x + Math.cos(a) * 60, 555 + Math.sin(a) * 60], '#e4ba6b', 12);
      circle(x, 555, 8, '#9b4234');
    }
    const b = game.ball; circle(b.x + 3, b.y + 4, 9, '#0006'); circle(b.x, b.y, b.r, '#f8f1da', '#64717a'); circle(b.x - 2, b.y - 3, 2, '#fff');
    label('ВЫХОД', 210, 647, 15, '#d8ad75');
    if (toastUntil > performance.now()) label(toast, 200, 500, 18);
    if (game.paused || ['won', 'lost'].includes(game.phase)) {
      ctx.fillStyle = '#151c24d9'; ctx.fillRect(26, 222, 368, 145);
      label(game.paused ? 'ПАУЗА' : game.phase === 'won' ? 'ВЫХОД ОТКРЫТ!' : 'ЕЩЁ ПОПЫТКА?', 210, 280, 25);
      label(game.paused ? 'Нажми «Продолжить»' : `Твой счёт: ${game.score}`, 210, 321, 18);
    }
    $('.pinball-score b').textContent = game.score.toLocaleString('ru-RU');
    $('.pinball-lives').textContent = `Шарики: ${game.lives} / 3 · Звёзды: ${game.targets.filter(Boolean).length} / 3`;
    $('.pinball-best').textContent = `Рекорд: ${best}${saved ? ' · сохранён' : ' · до закрытия страницы'}`;
    const status = game.paused ? 'Пауза. Шарик подождёт.' : game.phase === 'ready' ? 'Запусти шарик. Отбивай его флипперами!' : game.phase === 'won' ? 'Шериф побеждён. Ты выбрался из автомата!' : game.phase === 'lost' ? 'Шарики закончились. Рекорд остаётся с тобой.' : `Шарик в игре. Цель: ${PINBALL_GOAL} очков.`;
    if (status !== previousStatus) { $('.pinball-status').textContent = status; previousStatus = status; }
    $('.pinball-table-action').textContent = game.phase === 'playing' ? (game.paused ? 'Дальше' : 'Пауза') : ['won', 'lost'].includes(game.phase) ? 'Заново' : 'Запуск';
    $('.pinball-launch').disabled = game.phase === 'playing';
    $('.pinball-launch').textContent = ['won', 'lost'].includes(game.phase) ? 'Новая попытка' : 'Запустить шарик';
    $('.pinball-pause').disabled = game.phase !== 'playing'; $('.pinball-pause').textContent = game.paused ? 'Продолжить' : 'Пауза';
  }
  function frame(now) {
    if (!active) return;
    const input = { left: keys.has('left') || [...pointers.values()].includes('left'), right: keys.has('right') || [...pointers.values()].includes('right') };
    game.update(Math.min((now - last) / 1000, .05), input); last = now; render(); animation = requestAnimationFrame(frame);
  }
  return {
    open() { if (active) return; active = true; last = performance.now(); render(); animation = requestAnimationFrame(frame); },
    close() { active = false; cancelAnimationFrame(animation); pause(true); },
  };
}
