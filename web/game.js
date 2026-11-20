import { Game, FLOOR } from './engine.js';
import { loadFighterArt, drawFighterSprite } from './fighters.js';
import { HEROES, LEVELS, CampaignProgress, AdventureGame } from './campaign.js';
import { loadWorldArt, drawWorldBackground, drawWorldObjects } from './world.js';
import { createDungeonUI } from './dungeon-ui.js';
import { createPinballUI } from './pinball-ui.js';

const $ = id => document.getElementById(id);
const canvas = $('game');
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const keyboard = new Set();
const pointers = new Map();
const bindings = { KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right',
  KeyW: 'jump', ArrowUp: 'jump', Space: 'jump', KeyJ: 'punch', KeyK: 'kick', KeyL: 'block', ShiftLeft: 'block', ShiftRight: 'block' };
let sprites = {};
let fighterArt = [];
let worldArt;
let storage;
try { storage = window.localStorage; } catch { /* The game also works without storage. */ }
const progress = new CampaignProgress(storage);
let selectedLevel = progress.unlocked;
let mode = 'arcade';
let camera = 0;
let levelWon = false;
let toast = '';
let toastUntil = 0;
let scene = 'day';
let ready = false;
let elapsed = 0;
let particles = [];
let shake = 0;
let soundEnabled = false;
let audioContext;
let musicRequest = 0;
const music = new Audio();
music.loop = true;
music.volume = 0.3;
music.preload = 'none';

function clearInput() {
  keyboard.clear();
  pointers.clear();
  document.querySelectorAll('[data-control]').forEach(b => b.classList.remove('pressed'));
}

function input() {
  return Object.fromEntries([...keyboard].map(key => [bindings[key], true])
    .concat([...pointers.values()].map(control => [control, true])));
}

function tone(freq, duration = 0.08, type = 'square', volume = 0.035) {
  if (!soundEnabled || !audioContext || audioContext.state !== 'running') return;
  const osc = audioContext.createOscillator();
  const gain = audioContext.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, audioContext.currentTime);
  osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq / 3), audioContext.currentTime + duration);
  gain.gain.setValueAtTime(volume, audioContext.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + duration);
  osc.connect(gain).connect(audioContext.destination);
  osc.start();
  osc.stop(audioContext.currentTime + duration);
}

async function syncMusic() {
  const request = ++musicRequest;
  if (!soundEnabled || game.paused || document.hidden) { music.pause(); return; }
  const source = new URL(`./assets/DrKarate${scene === 'day' ? 1 : 2}.mp3`, location.href).href;
  if (music.src !== source) music.src = source;
  try { await music.play(); }
  catch {
    if (request !== musicRequest) return;
    // Playback can be denied before a user gesture or if the audio asset fails.
    soundEnabled = false;
    updateSoundButton();
    $('status').textContent = 'ЗВУК НЕДОСТУПЕН — ИГРА ПРОДОЛЖАЕТСЯ';
  }
}

function updateSoundButton() {
  $('sound').setAttribute('aria-pressed', String(soundEnabled));
  $('sound').setAttribute('aria-label', soundEnabled ? 'Выключить звук' : 'Включить звук');
  $('sound').querySelector('span').textContent = soundEnabled ? 'Звук вкл.' : 'Звук выкл.';
}

function effect(event) {
  if (event.type === 'hit' || event.type === 'block') {
    tone(event.type === 'block' ? 580 : 130, 0.1, event.type === 'block' ? 'triangle' : 'sawtooth');
    shake = reducedMotion ? 0 : 3;
    for (let i = 0; i < (reducedMotion ? 3 : 12); i++) {
      const angle = Math.random() * Math.PI * 2;
      particles.push({ x: event.x, y: event.y, vx: Math.cos(angle) * (40 + Math.random() * 100),
        vy: Math.sin(angle) * 100, life: 0.25, color: event.type === 'block' ? '#a7e2ed' : '#ffe8a1' });
    }
  }
  if (event.type === 'swing') tone(220, 0.035, 'triangle', 0.015);
  if (event.type === 'fight') tone(680, 0.15);
  if (event.type === 'roundEnd') tone(220, 0.4, 'triangle');
  if (event.type === 'page') {
    tone(900, 0.2, 'triangle');
    toast = `Страница найдена! ${event.count} / 3`;
    toastUntil = elapsed + 2;
  }
  if (event.type === 'encounterEnd') {
    tone(500, 0.2, 'triangle');
    toast = 'Победа над двойником · +15 здоровья';
    toastUntil = elapsed + 2;
  }
  if (event.type === 'levelEnd') {
    levelWon = event.winner === 0;
    const final = event.index === LEVELS.length - 1;
    if (levelWon) progress.recordWin(event.index, event.pages);
    $('result-kicker').textContent = levelWon ? (final ? 'АРКАДНЫЙ ПОРТАЛ ЗАКРЫТ' : 'НОВЫЙ МАРШРУТ ОТКРЫТ') : 'ПРИКЛЮЧЕНИЕ ПРОДОЛЖАЕТСЯ';
    $('result-title').textContent = levelWon ? (final ? 'ГОРОД СПАСЁН!' : 'УРОВЕНЬ ПРОЙДЕН') : 'ЕЩЁ ПОПЫТКА';
    $('result-text').textContent = levelWon ? `${LEVELS[event.index].name} · Страницы дневника: ${event.pages}/3. ${progress.saved ? 'Прогресс сохранён.' : 'Прогресс доступен до закрытия страницы.'}` : 'Блокируй атаки и отвечай ударом. Уже открытые уровни остаются доступными.';
    $('restart').textContent = levelWon ? (final ? 'Карта приключений' : 'Следующий уровень') : 'Повторить уровень';
    $('back-menu').textContent = 'На карту';
    $('result').hidden = false;
    $('pause').disabled = true;
    $('restart').focus({ preventScroll: true });
    clearInput();
  }
  if (event.type === 'matchEnd') {
    $('result-title').textContent = event.winner === 0 ? 'ТВОЯ ПОБЕДА!' : 'ЕЩЁ ОДИН ШАНС';
    $('result-kicker').textContent = event.winner === 0 ? 'ДОДЗЁ ПРИЗНАЁТ МАСТЕРА' : 'МАСТЕРСТВО ПРИХОДИТ С ПРАКТИКОЙ';
    $('result-text').textContent = `${game.wins[0]} : ${game.wins[1]} · ${event.winner === 0 ? 'Красивый бой. Повторим?' : 'Блокируй удары и отвечай, пока соперник открыт.'}`;
    $('restart').textContent = 'Ещё поединок';
    $('back-menu').textContent = 'В главное меню';
    $('result').hidden = false;
    $('pause').disabled = true;
    $('restart').focus({ preventScroll: true });
    clearInput();
  }
}

let game = new Game({ onEvent: effect });

function drawPortrait(target, id, flipped = false) {
  const c = target.getContext('2d'), art = artById(id);
  c.clearRect(0, 0, target.width, target.height);
  if (!art) return;
  const f = art.frames[0], scale = target.height * .9 / (f.bottom - f.top + 1);
  c.save(); c.imageSmoothingEnabled = false;
  if (flipped) { c.translate(target.width, 0); c.scale(-1, 1); }
  c.drawImage(art.image, f.x, f.y, f.width, f.height,
    target.width / 2 - f.anchor * scale, target.height * .95 - f.baseline * scale, f.width * scale, f.height * scale);
  c.restore();
}
const dungeonUI = createDungeonUI({ root: $('dungeon'), storage, drawPortrait, onExit: showMenu });
const pinballUI = createPinballUI({ root: $('pinball'), storage, onExit: showMenu });

function closeExtraModes() {
  pinballUI.close();
  $('dungeon').hidden = true; $('pinball').hidden = true;
  $('arcade').classList.remove('dungeon-mode', 'pinball-mode');
}
function showExtraMode(name) {
  if (!ready) return;
  closeExtraModes(); clearInput();
  game.phase = 'menu'; game.paused = false; mode = name;
  $('arcade').classList.remove('map-mode', 'campaign-playing');
  $('arcade').classList.add(name + '-mode');
  $('campaign-map').hidden = true; $('pause-menu').hidden = true; $('result').hidden = true;
  $('pause').disabled = true; $(name).hidden = false;
  $('scene-label').textContent = name === 'dungeon' ? 'ПОДЗЕМЕЛЬЯ И КУБИКИ' : 'ТЕРРОР ПЕРЕКАТИ-ПОЛЕ';
  (name === 'dungeon' ? dungeonUI : pinballUI).open();
  $(name).querySelector('.mode-back').focus({ preventScroll: true });
  $(name).scrollIntoView({ block: 'start', behavior: 'instant' });
  syncMusic();
}

function artById(id) { return fighterArt.find(art => art.id === id); }
function isActive() { return !['menu', 'matchEnd', 'levelEnd'].includes(game.phase); }

function setScene(name) {
  scene = name;
  for (const choice of ['day', 'night']) {
    $(choice).classList.toggle('selected', choice === name);
    $(choice).setAttribute('aria-pressed', String(choice === name));
  }
  $('scene-label').textContent = mode === 'campaign' && game.level ? game.level.name : scene === 'day' ? 'ДНЕВНОЕ ДОДЗЁ' : 'НОЧНОЕ ДОДЗЁ';
  syncMusic();
}

function combatView() {
  closeExtraModes();
  $('arcade').classList.remove('map-mode');
  $('arcade').classList.toggle('campaign-playing', mode === 'campaign');
  $('campaign-map').hidden = true;
  $('mission-bar').hidden = mode !== 'campaign';
  $('pause-map').hidden = mode !== 'campaign';
  document.querySelector('.segmented').hidden = mode === 'campaign';
  for (const name of ['player-rounds', 'cpu-rounds']) $(name).hidden = mode === 'campaign';
  for (const name of ['journal-count', 'encounter-count']) $(name).hidden = mode !== 'campaign';
  particles = [];
  toastUntil = 0;
  camera = 0;
  $('pause').querySelector('span').textContent = 'Пауза';
}

function start() {
  if (!ready) return;
  mode = 'arcade';
  game = new Game({ onEvent: effect });
  combatView();
  $('menu').hidden = true;
  $('result').hidden = true;
  $('pause-menu').hidden = true;
  $('shade').hidden = true;
  $('hud').hidden = false;
  $('pause').disabled = false;
  clearInput();
  game.start($('difficulty').value);
  canvas.focus({ preventScroll: true });
  syncMusic();
}

function startCampaign(index = selectedLevel) {
  if (!ready || !progress.isUnlocked(index)) return;
  selectedLevel = index;
  mode = 'campaign';
  game = new AdventureGame({ onEvent: effect });
  game.startLevel(index, $('difficulty').value);
  combatView();
  setScene(game.level.scene);
  $('menu').hidden = true;
  $('result').hidden = true;
  $('pause-menu').hidden = true;
  $('shade').hidden = true;
  $('hud').hidden = false;
  $('pause').disabled = false;
  $('level-title').textContent = `${index + 1} / ${LEVELS.length} · ${game.level.name}`;
  clearInput();
  canvas.focus({ preventScroll: true });
}

function drawHeroCards() {
  document.querySelectorAll('[data-hero]').forEach(button => {
    button.setAttribute('aria-pressed', String(button.dataset.hero === progress.hero));
    const art = artById(button.dataset.hero);
    if (!art) return;
    const target = button.querySelector('canvas'), c = target.getContext('2d'), f = art.frames[0];
    c.clearRect(0, 0, target.width, target.height); c.imageSmoothingEnabled = false;
    const scale = 87 / (f.bottom - f.top + 1);
    c.drawImage(art.image, f.x, f.y, f.width, f.height, 55 - f.anchor * scale, 97 - f.baseline * scale, f.width * scale, f.height * scale);
  });
}

function renderMap() {
  const nodes = $('map-nodes'); nodes.replaceChildren();
  LEVELS.forEach((level, index) => {
    const button = document.createElement('button');
    button.className = 'map-node'; button.dataset.level = index;
    button.style.left = `${level.map[0]}%`; button.style.top = `${level.map[1]}%`;
    const unlocked = progress.isUnlocked(index), done = progress.bestPages[index] !== null;
    button.disabled = !unlocked;
    button.classList.toggle('completed', done); button.classList.toggle('selected', index === selectedLevel);
    button.setAttribute('aria-pressed', String(index === selectedLevel));
    button.setAttribute('aria-label', `Уровень ${index + 1}: ${level.name}. ${done ? 'Пройден.' : unlocked ? 'Доступен.' : 'Сначала пройди предыдущий уровень.'}`);
    const marker = document.createElement('span'); marker.className = 'node-marker'; marker.textContent = done ? '✓' : unlocked ? index + 1 : '×';
    const label = document.createElement('span'); label.className = 'node-label'; label.textContent = level.short;
    const stars = document.createElement('span'); stars.className = 'node-pages'; stars.textContent = done ? '★'.repeat(progress.bestPages[index]) + '☆'.repeat(3 - progress.bestPages[index]) : unlocked ? '☆☆☆' : 'ЗАКРЫТО';
    button.append(marker, label, stars);
    button.addEventListener('click', () => { selectedLevel = index; renderMap(); $('play-level').focus({ preventScroll: true }); });
    nodes.append(button);
  });
  drawHeroCards();
  $('map-summary').textContent = `${HEROES.find(h => h.id === progress.hero).name} · Пройдено ${progress.completed}/${LEVELS.length} · Страниц ${progress.bestPages.reduce((sum, n) => sum + (n ?? 0), 0)}/12${progress.completed === LEVELS.length ? ' · Гравити Фолз спасён!' : ''}`;
  $('brief-title').textContent = LEVELS[selectedLevel].name;
  $('brief-story').textContent = LEVELS[selectedLevel].story;
  $('save-status').textContent = progress.saved ? 'Прогресс сохраняется после завершения уровня.' : 'Сохранение в браузере недоступно. Прогресс хранится до закрытия страницы.';
  $('play-level').textContent = progress.bestPages[selectedLevel] === null ? 'Начать уровень' : 'Пройти ещё раз';
}

function showMap() {
  if (!ready) return;
  closeExtraModes(); mode = 'campaign';
  game.phase = 'menu'; game.paused = false;
  selectedLevel = Math.min(progress.unlocked, selectedLevel);
  $('arcade').classList.add('map-mode');
  $('scene-label').textContent = 'КАРТА ПРИКЛЮЧЕНИЙ';
  $('campaign-map').hidden = false;
  $('pause-menu').hidden = true;
  $('result').hidden = true;
  $('pause').disabled = true;
  clearInput(); renderMap(); syncMusic();
  $('play-level').focus({ preventScroll: true });
}

function showMenu() {
  mode = 'arcade'; game = new Game({ onEvent: effect });
  combatView();
  setScene(scene);
  $('result').hidden = true; $('pause-menu').hidden = true;
  $('menu').hidden = false; $('shade').hidden = false; $('hud').hidden = true;
  $('pause').disabled = true;
  $('campaign-start').focus({ preventScroll: true });
}

function togglePause(value) {
  game.pause(value);
  $('pause-menu').hidden = !game.paused;
  $('pause').querySelector('span').textContent = game.paused ? 'Продолжить' : 'Пауза';
  clearInput();
  syncMusic();
  if (game.paused) $('resume').focus({ preventScroll: true });
  else if (game.phase !== 'menu' && game.phase !== 'matchEnd') canvas.focus({ preventScroll: true });
}

$('start').addEventListener('click', start);
$('dungeon-start').addEventListener('click', () => showExtraMode('dungeon'));
$('pinball-start').addEventListener('click', () => showExtraMode('pinball'));
$('restart').addEventListener('click', () => {
  if (mode === 'arcade') start();
  else if (levelWon && game.levelIndex === LEVELS.length - 1) showMap();
  else startCampaign(game.levelIndex + (levelWon ? 1 : 0));
});
$('campaign-start').addEventListener('click', () => { selectedLevel = progress.unlocked; showMap(); });
$('open-map').addEventListener('click', showMap);
$('pause-map').addEventListener('click', showMap);
$('map-menu').addEventListener('click', showMenu);
$('play-level').addEventListener('click', () => startCampaign());
document.querySelectorAll('[data-hero]').forEach(button => button.addEventListener('click', () => {
  progress.selectHero(button.dataset.hero); renderMap();
}));
$('resume').addEventListener('click', () => togglePause(false));
$('pause').addEventListener('click', () => togglePause());
$('back-menu').addEventListener('click', () => mode === 'campaign' ? showMap() : showMenu());
for (const name of ['day', 'night']) {
  $(name).addEventListener('click', () => {
    setScene(name);
  });
}
$('sound').addEventListener('click', async () => {
  soundEnabled = !soundEnabled;
  if (soundEnabled) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    try {
      if (AudioCtx && !audioContext) audioContext = new AudioCtx();
      if (audioContext?.state === 'suspended') await audioContext.resume();
    } catch { /* Music can still play when WebAudio is unavailable. */ }
  }
  updateSoundButton();
  syncMusic();
});
if (!document.fullscreenEnabled) $('fullscreen').hidden = true;
$('fullscreen').addEventListener('click', async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await $('arcade').requestFullscreen();
  } catch { $('status').textContent = 'ПОЛНЫЙ ЭКРАН НЕДОСТУПЕН В ЭТОМ БРАУЗЕРЕ'; }
});
window.addEventListener('keydown', event => {
  if (event.target instanceof HTMLSelectElement || event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.code === 'KeyP' || event.code === 'Escape') {
    if (!event.repeat && isActive()) { event.preventDefault(); togglePause(); }
    return;
  }
  if (bindings[event.code] && isActive() && !game.paused) {
    event.preventDefault();
    keyboard.add(event.code);
  }
});
window.addEventListener('keyup', event => keyboard.delete(event.code));
window.addEventListener('blur', () => { clearInput(); if (isActive()) togglePause(true); });
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { clearInput(); if (isActive()) togglePause(true); }
  syncMusic();
});
document.querySelectorAll('[data-control]').forEach(button => {
  button.addEventListener('pointerdown', event => {
    event.preventDefault();
    if (game.paused || game.phase !== 'fight') return;
    button.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, button.dataset.control);
    button.classList.add('pressed');
  });
  const release = event => {
    pointers.delete(event.pointerId);
    if (![...pointers.values()].includes(button.dataset.control)) button.classList.remove('pressed');
  };
  button.addEventListener('pointerup', release);
  button.addEventListener('pointercancel', release);
  button.addEventListener('lostpointercapture', release);
  button.addEventListener('contextmenu', event => event.preventDefault());
});

// Original SFF axes are preserved. The browser camera shows a 640 × 360 crop.
function sprite(group, number, x = 320, y = 132) {
  const s = sprites[`${group},${number}`];
  if (s) ctx.drawImage(s.image, Math.round(x - s.x), Math.round(y - s.y));
}

function background(foreground = false) {
  if (foreground) { sprite(6, scene === 'day' ? 0 : 1); return; }
  ctx.fillStyle = scene === 'day' ? '#83bdbe' : '#071520';
  ctx.fillRect(0, 0, 640, 360);
  const t = elapsed * 60;
  if (scene === 'day') {
    const frame = Math.floor(t / 7) % 10;
    sprite(0, frame);
    sprite(1, 0);
    for (let x = -128; x < 800; x += 128) sprite(2, Math.floor(t / 7) % 6, x - t % 128, 132);
    sprite(3, frame);
    sprite(4, frame);
    for (let x = -256; x < 800; x += 256) sprite(5, Math.floor(t / 7) % 6, x + t * 2 % 256, 132);
  } else {
    sprite(0, 10 + Math.floor(t / 10) % 10);
    sprite(3, 10);
    sprite(4, 10 + Math.floor(t / 7) % 10);
  }
}

function drawFighter(f, index) {
  if (index === 1 && mode === 'campaign' && !game.enemyActive) return;
  const art = artById(index === 0 ? progress.hero : mode === 'campaign' ? game.enemyArt : 'dr-karate');
  if (art) drawFighterSprite(ctx, f, art, elapsed, mode === 'campaign' && game.level ? game.level.length : 640);
}

let lastAnnouncement = '';
function updateHud() {
  if (mode === 'dungeon' || mode === 'pinball') {
    $('status').textContent = mode === 'dungeon' ? 'ПОДЗЕМЕЛЬЯ · ТВОЙ ХОД' : 'ТЕРРОР ПЕРЕКАТИ-ПОЛЕ · ПИНБОЛ';
    return;
  }
  for (const [i, name] of ['player', 'cpu'].entries()) {
    $(name + '-health').style.width = `${game.fighters[i].hp / game.fighters[i].maxHp * 100}%`;
    $(name + '-hp').textContent = game.fighters[i].hp;
    [...$(name + '-rounds').children].forEach((dot, j) => dot.classList.toggle('won', j < game.wins[i]));
  }
  $('timer').textContent = String(Math.ceil(game.time)).padStart(2, '0');
  $('round').textContent = `ROUND ${String(game.round).padStart(2, '0')}`;
  $('player-name').textContent = artById(progress.hero)?.name ?? 'ДИППЕР';
  $('cpu-name').textContent = 'DR. KARATE';
  let announcement = '';
  if (!game.paused) {
    if (game.phase === 'countdown') announcement = game.phaseTime > 0.75 ? `РАУНД ${game.round}` : 'В БОЙ!';
    if (game.phase === 'roundEnd') announcement = game.roundWinner === -1 ? 'НИЧЬЯ' : game.roundWinner === 0 ? 'РАУНД ЗА ТОБОЙ' : 'РАУНД ЗА ДОКТОРОМ';
  }
  if (mode === 'campaign' && game.level) {
    $('timer').textContent = `${Math.min(100, Math.round(game.fighters[0].x / (game.level.length - 70) * 100))}%`;
    $('round').textContent = 'ПУТЬ';
    $('cpu-name').textContent = game.enemyActive ? game.enemyName : 'ПУТЬ СВОБОДЕН';
    $('cpu-hp').textContent = game.enemyActive ? game.fighters[1].hp : '—';
    $('journal-count').textContent = `Страницы: ${game.collected.size} / 3`;
    $('encounter-count').textContent = `Противники: ${game.enemyIndex} / ${game.level.enemies.length}`;
    $('mission').textContent = elapsed < toastUntil ? toast : game.enemyActive ? 'Победи противника, чтобы пройти дальше' : 'Двигайся вправо · собирай страницы дневника';
    if (!game.paused) announcement = game.phase === 'countdown' ? (game.phaseTime > 0.6 ? `ЭТАП ${game.levelIndex + 1}` : 'ВПЕРЁД!') : game.phase === 'encounterEnd' ? 'ПУТЬ ОТКРЫТ' : '';
  }
  if (announcement !== lastAnnouncement) { $('announcement').textContent = announcement; lastAnnouncement = announcement; }
  if (ready) $('status').textContent = game.paused ? 'ПАУЗА · P — ПРОДОЛЖИТЬ' : !$('campaign-map').hidden ? `КАРТА · ${progress.completed} / 4 УРОВНЯ` : game.phase === 'menu' ? 'ВЫБЕРИ ПРИКЛЮЧЕНИЕ ИЛИ БЫСТРЫЙ БОЙ' : mode === 'campaign' ? `ЭТАП ${game.levelIndex + 1} · СТРАНИЦЫ ${game.collected.size}/3` : game.phase === 'matchEnd' ? 'ПОЕДИНОК ЗАВЕРШЁН' : `ДО ДВУХ ПОБЕД · ${game.wins[0]} : ${game.wins[1]}`;
}

function draw(dt) {
  ctx.save();
  if (shake > 0 && !game.paused) { ctx.translate(Math.round((Math.random() - 0.5) * shake), 0); shake = Math.max(0, shake - dt * 25); }
  const adventure = mode === 'campaign' && game.level && worldArt;
  camera = adventure ? Math.max(0, Math.min(game.level.length - 640, game.fighters[0].x - 230)) : 0;
  if (adventure && game.level.terrain < 3) drawWorldBackground(ctx, game, worldArt.stages, camera);
  else background();
  ctx.save();
  ctx.translate(-Math.round(camera), 0);
  if (adventure) drawWorldObjects(ctx, game, elapsed);
  // Fighters remain visible in the attract screen, behind the menu.
  game.fighters.forEach(drawFighter);
  for (const p of particles) {
    ctx.fillStyle = p.color;
    ctx.globalAlpha = Math.max(0, p.life / 0.25);
    ctx.fillRect(Math.round(p.x), Math.round(p.y), 3, 3);
  }
  ctx.globalAlpha = 1;
  ctx.restore();
  if (!adventure || game.level.terrain === 3) background(true);
  ctx.restore();
}

let previous = 0;
let accumulator = 0;
function frame(now) {
  const dt = previous ? Math.min((now - previous) / 1000, 0.1) : 0;
  previous = now;
  accumulator += dt;
  while (accumulator >= 1 / 60) {
    game.update(1 / 60, input());
    if (!game.paused && !document.hidden) {
      elapsed += 1 / 60;
      for (const p of particles) { p.x += p.vx / 60; p.y += p.vy / 60; p.life -= 1 / 60; }
      particles = particles.filter(p => p.life > 0);
    }
    accumulator -= 1 / 60;
  }
  if (mode !== 'dungeon' && mode !== 'pinball') draw(game.paused ? 0 : dt);
  updateHud();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

async function load() {
  try {
    // Both fighter sheets and stage assets must be ready before combat starts.
    const fighterPromise = loadFighterArt();
    fighterPromise.catch(() => {}); // Handled together with the stage load below.
    const worldPromise = loadWorldArt();
    worldPromise.catch(() => {});
    const response = await fetch(new URL('./assets/sprites.json', import.meta.url));
    if (!response.ok) throw new Error(`Manifest HTTP ${response.status}`);
    const manifest = await response.json();
    let loaded = 0;
    const entries = Object.entries(manifest);
    const images = await Promise.all(entries.map(async ([key, data]) => {
      const image = new Image();
      image.src = new URL(`./assets/${data.file}`, import.meta.url).href;
      await image.decode();
      $('loading-status').textContent = `Подготавливаем арену · ${Math.round(++loaded / entries.length * 100)}%`;
      return [key, { ...data, image }];
    }));
    fighterArt = await fighterPromise;
    worldArt = await worldPromise;
    sprites = Object.fromEntries(images);
    ready = true;
    $('start').disabled = false;
    $('campaign-start').disabled = false;
    $('open-map').disabled = false;
    $('dungeon-start').disabled = false;
    $('pinball-start').disabled = false;
    $('start').textContent = 'Быстрый бой';
    $('loading-status').textContent = '3 ГЕРОЯ · 4 УРОВНЯ · ПРОГРЕСС СОХРАНЯЕТСЯ';
  } catch (error) {
    console.error('Cannot load arena:', error);
    $('start').textContent = 'Арена не загрузилась';
    $('loading-status').textContent = location.protocol === 'file:' ? 'Откройте игру через локальный сервер или GitHub Pages.' : 'Проверьте соединение и обновите страницу.';
    $('status').textContent = 'ОШИБКА ЗАГРУЗКИ';
  }
}
load();
