import { Game, createFighter } from './engine.js';

export const HEROES = [
  { id: 'dipper', name: 'Диппер', note: 'Кепка, дневник и план на любой случай.' },
  { id: 'mabel', name: 'Мэйбл', note: 'Радужный свитер. Боевой настрой.' },
  { id: 'rumble', name: 'Рамбл', note: 'Аркадная легенда на твоей стороне.' },
];
const clone = (x, hp, art = 'rumble') => ({ x, hp, art, name: 'АРКАДНЫЙ ДВОЙНИК', tint: 'hue-rotate(130deg)' });
export const LEVELS = [
  { id: 'forest', name: 'Лес у Хижины Чудес', short: 'Хижина Чудес', map: [19, 73], terrain: 0, scene: 'day', length: 1600,
    story: 'Из старого автомата сбежали пиксельные двойники. Найди страницы дневника и пробейся к городу.',
    pages: [250, 830, 1450], enemies: [clone(450, 40), clone(1120, 50)] },
  { id: 'town', name: 'Улицы Гравити Фолз', short: 'Гравити Фолз', map: [43, 34], terrain: 1, scene: 'day', length: 2000,
    story: 'Город захвачен аркадными бойцами. Освободи главную улицу — след ведёт в старую шахту.',
    pages: [270, 1300, 1850], enemies: [clone(480, 55), clone(1030, 60), clone(1640, 65, 'dr-karate')] },
  { id: 'mine', name: 'Заброшенная шахта', short: 'Шахта', map: [76, 35], terrain: 2, scene: 'night', length: 2100,
    story: 'Кристаллы питают аркадный портал. Пройди тоннель и собери оставшиеся подсказки.',
    pages: [260, 1280, 1940], enemies: [clone(470, 65), clone(1030, 70, 'dr-karate'), clone(1740, 80)] },
  { id: 'dojo', name: 'Додзё Доктора Карате', short: 'Додзё', map: [85, 70], terrain: 3, scene: 'night', length: 1400,
    story: 'Доктор Карате охраняет выход из игры. Победи его и закрой портал в Гравити Фолз!',
    pages: [220, 740, 1290], enemies: [clone(430, 70), { x: 1080, hp: 140, art: 'dr-karate', name: 'DR. KARATE', tint: '' }] },
];

export const SAVE_KEY = 'dr-karate-campaign-v1';
export class CampaignProgress {
  constructor(storage) {
    this.storage = storage;
    this.hero = 'dipper';
    this.bestPages = Array(LEVELS.length).fill(null);
    this.saved = true;
    try {
      const raw = JSON.parse(storage?.getItem(SAVE_KEY) ?? 'null');
      if (raw?.version !== 1) return;
      if (HEROES.some(h => h.id === raw.hero)) this.hero = raw.hero;
      // Only accept a contiguous sequence of earned level completions.
      for (let i = 0; i < LEVELS.length; i++) {
        const pages = raw.bestPages?.[i];
        if (!Number.isInteger(pages) || pages < 0 || pages > 3) break;
        this.bestPages[i] = pages;
      }
    } catch { this.saved = false; }
  }
  get completed() { return this.bestPages.filter(n => n !== null).length; }
  get unlocked() { return Math.min(LEVELS.length - 1, this.completed); }
  isUnlocked(index) { return Number.isInteger(index) && index >= 0 && index <= this.unlocked; }
  selectHero(id) {
    if (!HEROES.some(h => h.id === id)) return false;
    this.hero = id;
    return this.save();
  }
  recordWin(index, pages) {
    if (!this.isUnlocked(index) || !Number.isInteger(pages) || pages < 0 || pages > 3) return false;
    this.bestPages[index] = Math.max(this.bestPages[index] ?? 0, pages);
    this.save();
    return true;
  }
  save() {
    try {
      if (!this.storage) throw new Error('No browser storage');
      this.storage.setItem(SAVE_KEY, JSON.stringify({ version: 1, hero: this.hero, bestPages: this.bestPages }));
      this.saved = true;
    } catch { this.saved = false; }
    return this.saved;
  }
}

export class AdventureGame extends Game {
  startLevel(index, difficulty = 'normal') {
    if (!LEVELS[index]) throw new RangeError('Unknown campaign level');
    this.levelIndex = index;
    this.level = LEVELS[index];
    this.difficulty = difficulty;
    this.resetFighters();
    this.fighters[0].x = 100;
    this.fighters[1].hp = 0;
    this.bounds = { left: 35, right: this.level.length - 35 };
    this.enemyIndex = 0;
    this.enemyActive = false;
    this.enemyArt = 'rumble';
    this.enemyName = '';
    this.collected = new Set();
    this.elapsed = 0;
    this.phase = 'countdown';
    this.phaseTime = 2;
    this.paused = false;
    this.onEvent({ type: 'levelStart', index });
  }

  spawnEnemy() {
    const definition = this.level.enemies[this.enemyIndex];
    const enemy = createFighter(definition.x, -1);
    enemy.hp = enemy.maxHp = definition.hp;
    enemy.tint = definition.tint;
    this.fighters[1] = enemy;
    this.enemyArt = definition.art;
    this.enemyName = definition.name;
    this.enemyActive = true;
    this.aiWait = 0.65;
    this.aiGuard = false;
    this.bounds = { left: Math.max(35, definition.x - 350), right: Math.min(this.level.length - 35, definition.x + 170) };
    this.onEvent({ type: 'encounter', enemy: this.enemyName });
  }

  finishLevel(winner) {
    this.phase = 'levelEnd';
    this.paused = false;
    this.onEvent({ type: 'levelEnd', winner, index: this.levelIndex, pages: this.collected.size });
  }

  update(dt, input = {}, cpuInput) {
    if (this.paused || ['menu', 'levelEnd'].includes(this.phase)) return;
    if (this.phase === 'countdown' || this.phase === 'encounterEnd') {
      this.phaseTime -= dt;
      if (this.phaseTime <= 0) {
        if (this.phase === 'encounterEnd') {
          this.enemyActive = false;
          this.enemyIndex++;
          this.bounds = { left: 35, right: this.level.length - 35 };
        }
        this.phase = 'fight';
      }
      return;
    }
    if (this.freeze > 0) { this.freeze -= dt; return; }
    this.elapsed += dt;
    const [player, enemy] = this.fighters;
    this.move(player, input, dt);
    if (this.enemyActive) {
      this.move(enemy, cpuInput ?? this.ai(dt), dt);
      if (Math.abs(player.y - enemy.y) < 55 && Math.abs(player.x - enemy.x) < 34) {
        const sign = player.x <= enemy.x ? 1 : -1;
        const center = Math.max(this.bounds.left + 17, Math.min(this.bounds.right - 17, (player.x + enemy.x) / 2));
        player.x = center - sign * 17; enemy.x = center + sign * 17;
      }
      if (!player.attack) player.facing = player.x < enemy.x ? 1 : -1;
      if (!enemy.attack) enemy.facing = enemy.x < player.x ? 1 : -1;
      this.strike(player, enemy);
      this.strike(enemy, player);
      if (player.hp <= 0) { this.finishLevel(1); return; }
      if (enemy.hp <= 0) {
        player.hp = Math.min(player.maxHp, player.hp + 15);
        this.phase = 'encounterEnd';
        this.phaseTime = 1;
        this.onEvent({ type: 'encounterEnd' });
      }
    } else {
      if (!player.attack && (input.left || input.right)) player.facing = input.right ? 1 : -1;
      const next = this.level.enemies[this.enemyIndex];
      if (next && player.x >= next.x - 260) this.spawnEnemy();
    }
    this.level.pages.forEach((x, index) => {
      if (!this.collected.has(index) && Math.abs(player.x - x) < 28 && player.y > -55) {
        this.collected.add(index);
        player.hp = Math.min(player.maxHp, player.hp + 8);
        this.onEvent({ type: 'page', x, count: this.collected.size });
      }
    });
    if (!this.enemyActive && this.enemyIndex >= this.level.enemies.length && player.x >= this.level.length - 70) this.finishLevel(0);
  }
}
