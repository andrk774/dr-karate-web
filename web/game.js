import { Game, FLOOR } from './engine.js';
import { loadFighterArt, drawFighterSprite } from './fighters.js';

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
  if (event.type === 'matchEnd') {
    $('result-title').textContent = event.winner === 0 ? 'ТВОЯ ПОБЕДА!' : 'ЕЩЁ ОДИН ШАНС';
    $('result-kicker').textContent = event.winner === 0 ? 'ДОДЗЁ ПРИЗНАЁТ МАСТЕРА' : 'МАСТЕРСТВО ПРИХОДИТ С ПРАКТИКОЙ';
    $('result-text').textContent = `${game.wins[0]} : ${game.wins[1]} · ${event.winner === 0 ? 'Красивый бой. Повторим?' : 'Блокируй удары и отвечай, пока соперник открыт.'}`;
    $('result').hidden = false;
    $('pause').disabled = true;
    $('restart').focus({ preventScroll: true });
    clearInput();
  }
}

const game = new Game({ onEvent: effect });

function start() {
  if (!ready) return;
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
$('restart').addEventListener('click', start);
$('resume').addEventListener('click', () => togglePause(false));
$('pause').addEventListener('click', () => togglePause());
$('back-menu').addEventListener('click', () => {
  game.phase = 'menu';
  game.paused = false;
  game.resetFighters();
  $('result').hidden = true;
  $('menu').hidden = false;
  $('shade').hidden = false;
  $('hud').hidden = true;
  $('pause').disabled = true;
  $('start').focus({ preventScroll: true });
});
for (const name of ['day', 'night']) {
  $(name).addEventListener('click', () => {
    scene = name;
    for (const choice of ['day', 'night']) {
      $(choice).classList.toggle('selected', choice === name);
      $(choice).setAttribute('aria-pressed', String(choice === name));
    }
    $('scene-label').textContent = scene === 'day' ? 'ДНЕВНОЕ ДОДЗЁ' : 'НОЧНОЕ ДОДЗЁ';
    syncMusic();
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
    if (!event.repeat && !['menu', 'matchEnd'].includes(game.phase)) { event.preventDefault(); togglePause(); }
    return;
  }
  if (bindings[event.code] && !['menu', 'matchEnd'].includes(game.phase) && !game.paused) {
    event.preventDefault();
    keyboard.add(event.code);
  }
});
window.addEventListener('keyup', event => keyboard.delete(event.code));
window.addEventListener('blur', () => { clearInput(); if (!['menu', 'matchEnd'].includes(game.phase)) togglePause(true); });
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { clearInput(); if (!['menu', 'matchEnd'].includes(game.phase)) togglePause(true); }
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
  if (fighterArt[index]) drawFighterSprite(ctx, f, fighterArt[index], elapsed);
}

let lastAnnouncement = '';
function updateHud() {
  for (const [i, name] of ['player', 'cpu'].entries()) {
    $(name + '-health').style.width = `${game.fighters[i].hp}%`;
    $(name + '-hp').textContent = game.fighters[i].hp;
    [...$(name + '-rounds').children].forEach((dot, j) => dot.classList.toggle('won', j < game.wins[i]));
  }
  $('timer').textContent = String(Math.ceil(game.time)).padStart(2, '0');
  $('round').textContent = `ROUND ${String(game.round).padStart(2, '0')}`;
  let announcement = '';
  if (!game.paused) {
    if (game.phase === 'countdown') announcement = game.phaseTime > 0.75 ? `РАУНД ${game.round}` : 'В БОЙ!';
    if (game.phase === 'roundEnd') announcement = game.roundWinner === -1 ? 'НИЧЬЯ' : game.roundWinner === 0 ? 'РАУНД ЗА ТОБОЙ' : 'РАУНД ЗА ДОКТОРОМ';
  }
  if (announcement !== lastAnnouncement) { $('announcement').textContent = announcement; lastAnnouncement = announcement; }
  if (ready) $('status').textContent = game.paused ? 'ПАУЗА · P — ПРОДОЛЖИТЬ' : game.phase === 'menu' ? '1 ИГРОК · ПРОТИВ КОМПЬЮТЕРА' : game.phase === 'matchEnd' ? 'ПОЕДИНОК ЗАВЕРШЁН' : `ДО ДВУХ ПОБЕД · ${game.wins[0]} : ${game.wins[1]}`;
}

function draw(dt) {
  ctx.save();
  if (shake > 0 && !game.paused) { ctx.translate(Math.round((Math.random() - 0.5) * shake), 0); shake = Math.max(0, shake - dt * 25); }
  background();
  // Fighters remain visible in the attract screen, behind the menu.
  game.fighters.forEach(drawFighter);
  background(true);
  for (const p of particles) {
    ctx.fillStyle = p.color;
    ctx.globalAlpha = Math.max(0, p.life / 0.25);
    ctx.fillRect(Math.round(p.x), Math.round(p.y), 3, 3);
  }
  ctx.globalAlpha = 1;
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
  draw(game.paused ? 0 : dt);
  updateHud();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

async function load() {
  try {
    // Both fighter sheets and stage assets must be ready before combat starts.
    const fighterPromise = loadFighterArt();
    fighterPromise.catch(() => {}); // Handled together with the stage load below.
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
    sprites = Object.fromEntries(images);
    ready = true;
    $('start').disabled = false;
    $('start').innerHTML = 'Начать поединок <span>↗</span>';
    $('loading-status').textContent = 'БЕЗ МОНЕТ. БЕЗ УСТАНОВКИ. ПРОСТО ИГРАЙ.';
  } catch (error) {
    console.error('Cannot load arena:', error);
    $('start').textContent = 'Арена не загрузилась';
    $('loading-status').textContent = location.protocol === 'file:' ? 'Откройте игру через локальный сервер или GitHub Pages.' : 'Проверьте соединение и обновите страницу.';
    $('status').textContent = 'ОШИБКА ЗАГРУЗКИ';
  }
}
load();
