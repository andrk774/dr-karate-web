import { Dungeon, DUNGEON_HEROES, ROOMS } from './dungeon.js';

export function createDungeonUI({ root, storage, drawPortrait, onExit }) {
  const game = new Dungeon({ storage });
  let busy = false;
  root.innerHTML = `
    <header class="mode-heading"><div><p class="eyebrow">ДНЕВНИК · ПОШАГОВОЕ ПРИКЛЮЧЕНИЕ</p><h2>Подземелья и кубики</h2></div><button class="mode-back">Главное меню</button></header>
    <div class="dungeon-lobby"><p>Под Хижиной Чудес открылась древняя дверь. Пройди пять комнат, найди ключ у Доктора Карате и выберись на поверхность.</p><p>Выбери героя для нового похода:</p><div class="dungeon-heroes"></div></div>
    <div class="dungeon-run" hidden>
      <nav class="dungeon-route" aria-label="Карта подземелья"></nav>
      <div class="dungeon-stats"></div>
      <div class="dungeon-stage">
        <div class="dungeon-portrait"><canvas width="180" height="180" aria-hidden="true"></canvas><strong></strong></div>
        <div class="dungeon-room"><p class="eyebrow">КОМНАТА <span></span> / 5</p><h3 tabindex="-1"></h3><p class="room-note"></p><div class="dungeon-dice" aria-label="Результаты бросков"></div></div>
        <div class="dungeon-foe"><canvas width="180" height="180" aria-hidden="true"></canvas><strong></strong><p></p></div>
      </div>
      <p class="dungeon-turn" role="status" aria-live="polite"></p>
      <div class="dungeon-actions"></div>
      <details class="dungeon-rules"><summary>Правила кубиков и способностей</summary><p>Время не идёт, пока ты выбираешь. Каждое действие в бою — твой ход, затем один ответ противника. Добитый враг не отвечает.</p><p>d20 — кубик с 20 гранями; d6 и d8 — с 6 и 8. Обычная атака: d20 + 4 против брони врага, урон d6 + 3. Натуральная 1 всегда промах, 20 всегда попадание и дополнительный кубик урона. Твоя броня — 13.</p><p>Защита уменьшает урон ответа вдвое с округлением вверх и даёт +4 к следующей атаке с d20. Бонус не складывается. Зелье лечит d8 + 6, но враг отвечает. Способность расходует один из трёх зарядов. Источники и лагеря лечат на 12 и возвращают один заряд.</p><p>Монеты — счёт похода. Выбор комнаты необратим до нового похода. Прогресс сохраняется после каждого действия только в этом браузере.</p></details>
      <section class="dungeon-journal" aria-label="Журнал бросков"><h3>Журнал похода</h3><ol></ol></section>
    </div><p class="dungeon-save"></p>`;
  const $ = selector => root.querySelector(selector);
  $('.mode-back').onclick = onExit;
  for (const [id, hero] of Object.entries(DUNGEON_HEROES)) {
    const button = document.createElement('button'); button.dataset.dungeonHero = id;
    const canvas = document.createElement('canvas'); canvas.width = 110; canvas.height = 100; canvas.setAttribute('aria-hidden', 'true');
    const text = document.createElement('span'), title = document.createElement('strong'), note = document.createElement('small');
    title.textContent = hero.name; note.textContent = `${hero.skill}: ${hero.detail}`; text.append(title, note); button.append(canvas, text);
    button.onclick = () => { game.start(id); render(); $('.dungeon-room h3').focus({ preventScroll: true }); };
    $('.dungeon-heroes').append(button);
  }
  function action(label, note, run, disabled = false, id = '') {
    const button = document.createElement('button'); button.disabled = disabled || busy;
    if (id) button.dataset.dungeonAction = id;
    const strong = document.createElement('strong'), small = document.createElement('small');
    strong.textContent = label; small.textContent = note; button.append(strong, small);
    button.onclick = () => {
      if (busy) return;
      if (!run()) return;
      busy = true; render();
      setTimeout(() => {
        busy = false; render();
        if (!root.hidden) {
          const replacement = id && root.querySelector(`[data-dungeon-action="${id}"]:not(:disabled)`);
          (replacement || $('.dungeon-room h3')).focus({ preventScroll: true });
        }
      }, matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 400);
    };
    $('.dungeon-actions').append(button);
  }
  function render() {
    const s = game.state, ended = s && ['won', 'lost'].includes(s.phase);
    $('.dungeon-lobby').hidden = !!s && !ended; $('.dungeon-run').hidden = !s;
    root.querySelectorAll('[data-dungeon-hero]').forEach(b => drawPortrait(b.querySelector('canvas'), b.dataset.dungeonHero));
    $('.dungeon-save').textContent = game.saved ? 'Автосохранение · можно выйти в меню и продолжить позже.' : 'Хранилище браузера недоступно: поход сохранится только до закрытия страницы.';
    if (!s) return;
    $('.dungeon-route').replaceChildren();
    ROOMS.forEach((rooms, i) => {
      const node = document.createElement('span'), chosen = rooms.find(r => r.id === s.path[i]);
      node.dataset.short = `${i + 1} · ${['Вход', 'Развилка', 'Страж', 'Развилка', 'Босс'][i]}`;
      node.className = i < s.depth ? 'done' : i === s.depth ? 'current' : '';
      if (i === s.depth) node.setAttribute('aria-current', 'step');
      node.textContent = `${i < s.depth ? '✓' : i + 1} · ${chosen?.title ?? rooms.map(r => r.title).join(' / ')}`;
      $('.dungeon-route').append(node);
    });
    const hero = DUNGEON_HEROES[s.hero], room = game.room;
    $('.dungeon-stats').textContent = `♥ ${s.hp}/42 · Броня 13 · Зелья ${s.potions} · Заряды ${s.energy}/3 · Монеты ${s.gold}`;
    drawPortrait($('.dungeon-portrait canvas'), s.hero); $('.dungeon-portrait strong').textContent = hero.name;
    $('.dungeon-room .eyebrow span').textContent = s.depth + 1;
    $('.dungeon-room h3').textContent = s.phase === 'won' ? 'Ключ найден!' : s.phase === 'lost' ? 'Нужен новый план' : room?.title ?? 'Выбери путь';
    $('.room-note').textContent = ended ? (s.phase === 'won' ? `Выход открыт. ${hero.name} возвращается домой с ${s.gold} монетами.` : 'Можно начать новый поход выше. Попробуй защиту, зелья и комнаты отдыха.') : room?.note ?? 'Каждая дверь ведёт дальше. Выбери одну комнату на этом участке.';
    $('.dungeon-foe').hidden = !room?.enemy;
    if (room?.enemy) {
      drawPortrait($('.dungeon-foe canvas'), room.enemy.art, true);
      $('.dungeon-foe strong').textContent = room.enemy.name;
      $('.dungeon-foe p').textContent = `♥ ${s.enemyHp}/${room.enemy.hp} · Броня ${room.enemy.ac}`;
    }
    $('.dungeon-dice').replaceChildren();
    for (const die of s.dice) {
      const item = document.createElement('div'); item.className = 'die' + (busy ? ' rolled' : '');
      const value = document.createElement('b'), label = document.createElement('small');
      value.textContent = die.value; label.textContent = `d${die.sides}`;
      item.title = die.label; item.setAttribute('aria-label', `${die.label}: d${die.sides}, выпало ${die.value}`); item.append(value, label); $('.dungeon-dice').append(item);
    }
    $('.dungeon-turn').textContent = s.phase === 'combat' ? `Твой ход · ${hero.skill}: ${hero.detail}${s.prepared ? ' Подготовка: +4 к следующей атаке с d20.' : ''}` : s.phase === 'cleared' ? 'Комната пройдена. Путь свободен.' : ended ? 'Поход завершён.' : 'Можно спокойно обдумать следующий шаг.';
    $('.dungeon-actions').replaceChildren();
    if (s.phase === 'route') for (const r of ROOMS[s.depth]) action(r.title, r.note, () => game.enter(r.id), false, r.id);
    if (s.phase === 'combat') {
      action('Бросить d20 · атака', 'Попадание +4 · урон d6 + 3', () => game.act('attack'), false, 'attack');
      action('Защита', 'Половина урона · подготовка +4', () => game.act('guard'), false, 'guard');
      action(hero.skill, `${s.energy} заряда · ${hero.detail}`, () => game.act('skill'), !s.energy, 'skill');
      action('Выпить зелье', `${s.potions} шт. · лечение d8 + 6`, () => game.act('potion'), !s.potions || s.hp === 42, 'potion');
    }
    if (s.phase === 'event') action(room.type === 'rest' ? 'Отдохнуть' : 'Бросить кубик', room.note, () => game.resolve(), false, 'resolve');
    if (s.phase === 'cleared') action('Следующая комната', 'Открыть карту маршрута', () => game.advance(), false, 'advance');
    const log = $('.dungeon-journal ol'); log.replaceChildren();
    for (const line of s.log.slice().reverse()) { const li = document.createElement('li'); li.textContent = line; log.append(li); }
  }
  return { open: render };
}
