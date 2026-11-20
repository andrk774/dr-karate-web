// Turn resolution is atomic: a reload cannot replay a reward or skip an enemy turn.
export const DUNGEON_KEY = 'dr-karate-dungeon-v1';
export const DUNGEON_HEROES = {
  dipper: { name: 'Диппер', skill: 'Секрет дневника', detail: 'Атака d20 + 8, урон d8 + 4.' },
  mabel: { name: 'Мэйбл', skill: 'Радужный залп', detail: 'Без промаха: d6 + 3 урона и d6 + 4 лечения.' },
};
export const ROOMS = [
  [{ id: 'gate', title: 'Ворота подземелья', type: 'battle', note: 'Аркадный страж охраняет вход.', enemy: { name: 'Страж ворот', art: 'rumble', hp: 16, ac: 11, bonus: 3 } }],
  [{ id: 'trap', title: 'Коридор ловушек', type: 'trap', note: 'Проверка d20 + 4 против 12: успех даёт 25 монет, провал — d6 урона.' },
    { id: 'spring', title: 'Тихий источник', type: 'rest', note: 'Восстанови 12 здоровья и один заряд способности.' }],
  [{ id: 'guard', title: 'Кристальный зал', type: 'battle', note: 'Двойник преграждает путь к сокровищнице.', enemy: { name: 'Кристальный двойник', art: 'rumble', hp: 22, ac: 12, bonus: 4 } }],
  [{ id: 'chest', title: 'Забытый сундук', type: 'chest', note: 'Найди d6 × 10 монет и одно зелье.' },
    { id: 'camp', title: 'Лагерь исследователей', type: 'rest', note: 'Восстанови 12 здоровья и один заряд способности.' }],
  [{ id: 'boss', title: 'Тронный зал', type: 'battle', note: 'Доктор Карате хранит ключ от выхода. Последний бой!', enemy: { name: 'Доктор Карате', art: 'dr-karate', hp: 32, ac: 13, bonus: 5 } }],
];
const integer = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;
export class Dungeon {
  constructor({ storage, random = Math.random } = {}) {
    this.storage = storage; this.random = random; this.state = null; this.saved = !!storage;
    try {
      const raw = JSON.parse(storage?.getItem(DUNGEON_KEY) ?? 'null');
      if (raw && this.valid(raw)) this.state = raw;
    } catch { this.saved = false; }
  }
  valid(s) {
    if (s.version !== 1 || !Object.hasOwn(DUNGEON_HEROES, s.hero) || !integer(s.depth, 0, 4) ||
      !['route', 'event', 'combat', 'cleared', 'won', 'lost'].includes(s.phase) ||
      !integer(s.hp, 0, 42) || !integer(s.energy, 0, 3) || !integer(s.potions, 0, 4) ||
      !integer(s.gold, 0, 1000) || !integer(s.turn, 0, 1000000) || typeof s.prepared !== 'boolean' ||
      !Array.isArray(s.path) || s.path.length !== s.depth + (s.phase === 'route' ? 0 : 1) ||
      !s.path.every((id, i) => ROOMS[i]?.some(r => r.id === id)) ||
      !Array.isArray(s.log) || s.log.length > 60 || !s.log.every(l => typeof l === 'string' && l.length <= 300) ||
      !Array.isArray(s.dice) || s.dice.length > 8 || !s.dice.every(d => [4, 6, 8, 20].includes(d.sides) && integer(d.value, 1, d.sides) && typeof d.label === 'string' && d.label.length < 60)) return false;
    const room = ROOMS[s.depth].find(r => r.id === s.path[s.depth]);
    if ((s.phase === 'lost') !== (s.hp === 0)) return false;
    if (s.phase === 'won' && (s.depth !== 4 || s.enemyHp !== 0)) return false;
    if (s.phase === 'combat' && (!room?.enemy || !integer(s.enemyHp, 1, room.enemy.hp))) return false;
    if (s.phase === 'event' && (!room || room.enemy)) return false;
    if (s.phase === 'cleared' && (s.depth === 4 || s.enemyHp !== 0)) return false;
    return integer(s.enemyHp, 0, room?.enemy?.hp ?? 0);
  }
  get room() { return this.state && ROOMS[this.state.depth].find(r => r.id === this.state.path[this.state.depth]); }
  start(hero) {
    if (!Object.hasOwn(DUNGEON_HEROES, hero)) return false;
    this.state = { version: 1, hero, hp: 42, energy: 3, potions: 3, gold: 0, depth: 0, phase: 'route',
      path: [], enemyHp: 0, prepared: false, turn: 0, dice: [], log: ['Под Хижиной Чудес открылась дверь. Найди ключ и вернись домой.'] };
    this.save(); return true;
  }
  save() {
    try { if (!this.storage) throw new Error('No storage'); this.storage.setItem(DUNGEON_KEY, JSON.stringify(this.state)); this.saved = true; }
    catch { this.saved = false; }
  }
  log(line) { this.state.log.push(line); this.state.log = this.state.log.slice(-60); }
  roll(sides, label) {
    const value = 1 + Math.floor(this.random() * sides);
    this.state.dice.push({ sides, value, label }); return value;
  }
  enter(id) {
    const s = this.state;
    if (!s || s.phase !== 'route') return false;
    const room = ROOMS[s.depth].find(r => r.id === id);
    if (!room) return false;
    s.path.push(id); s.enemyHp = room.enemy?.hp ?? 0; s.prepared = false; s.dice = [];
    s.phase = room.enemy ? 'combat' : 'event'; this.log(room.title + '. ' + room.note); this.save(); return true;
  }
  advance() {
    const s = this.state;
    if (!s || s.phase !== 'cleared') return false;
    s.depth++; s.phase = 'route'; s.dice = []; this.save(); return true;
  }
  resolve() {
    const s = this.state;
    if (!s || s.phase !== 'event') return false;
    s.dice = []; s.turn++;
    const type = this.room.type;
    if (type === 'rest') {
      const heal = Math.min(12, 42 - s.hp); s.hp += heal; s.energy = Math.min(3, s.energy + 1);
      this.log(`Отдых: +${heal} здоровья. Заряды способности: ${s.energy}/3.`);
    } else if (type === 'chest') {
      const die = this.roll(6, 'Сокровище'), gold = die * 10; s.gold += gold; s.potions = Math.min(4, s.potions + 1);
      this.log(`Сундук: d6 [${die}] × 10 = ${gold} монет. Получено зелье.`);
    } else {
      const die = this.roll(20, 'Ловушка');
      if (die + 4 >= 12) { s.gold += 25; this.log(`Ловушка: d20 [${die}] + 4 = ${die + 4} ≥ 12. Успех! +25 монет.`); }
      else { const damage = this.roll(6, 'Урон ловушки'); s.hp = Math.max(0, s.hp - damage); this.log(`Ловушка: d20 [${die}] + 4 = ${die + 4} < 12. Потеряно d6 [${damage}] здоровья.`); }
    }
    s.phase = s.hp > 0 ? 'cleared' : 'lost'; this.save(); return true;
  }
  act(action) {
    const s = this.state;
    if (!s || s.phase !== 'combat' || !['attack', 'guard', 'skill', 'potion'].includes(action) ||
      (action === 'skill' && !s.energy) || (action === 'potion' && (!s.potions || s.hp === 42))) return false;
    s.dice = []; s.turn++;
    this.log(`Ход ${s.turn}.`);
    if (action === 'potion') {
      s.potions--; const die = this.roll(8, 'Зелье'), heal = Math.min(42 - s.hp, die + 6); s.hp += heal;
      this.log(`Зелье: d8 [${die}] + 6. Восстановлено ${heal} здоровья.`);
    } else if (action === 'guard') {
      s.prepared = true; this.log('Защита: урон следующего ответа вдвое меньше. Следующая атака получает +4 к попаданию (не складывается).');
    } else if (action === 'skill' && s.hero === 'mabel') {
      s.energy--; const damage = this.roll(6, 'Радужный урон') + 3, healingDie = this.roll(6, 'Радужное лечение');
      const heal = Math.min(42 - s.hp, healingDie + 4); s.hp += heal; s.enemyHp = Math.max(0, s.enemyHp - damage);
      this.log(`Радужный залп: d6 [${damage - 3}] + 3 = ${damage} урона без промаха. Лечение d6 [${healingDie}] + 4: +${heal} здоровья.`);
    } else {
      const skill = action === 'skill'; if (skill) s.energy--;
      const bonus = (skill ? 8 : 4) + (s.prepared ? 4 : 0); s.prepared = false;
      const die = this.roll(20, 'Попадание'), hit = die === 20 || (die !== 1 && die + bonus >= this.room.enemy.ac);
      this.log(`Атака: d20 [${die}] + ${bonus} = ${die + bonus} против брони ${this.room.enemy.ac}. ${die === 1 ? 'Критический промах!' : die === 20 ? 'Критическое попадание!' : hit ? 'Попадание.' : 'Промах.'}`);
      if (hit) {
        const sides = skill ? 8 : 6, base = skill ? 4 : 3;
        const a = this.roll(sides, 'Урон'), b = die === 20 ? this.roll(sides, 'Критический урон') : 0;
        const damage = a + b + base; s.enemyHp = Math.max(0, s.enemyHp - damage);
        this.log(`Урон: d${sides} [${a}]${b ? ` + d${sides} [${b}]` : ''} + ${base} = ${damage}.`);
      }
    }
    if (!s.enemyHp) {
      s.gold += this.state.depth === 4 ? 100 : 20;
      s.phase = s.depth === 4 ? 'won' : 'cleared';
      this.log(s.phase === 'won' ? 'Ключ найден! Выход открыт — поход завершён.' : 'Противник повержен. +20 монет. Можно идти дальше.');
    } else {
      const foe = this.room.enemy, die = this.roll(20, 'Ответ противника');
      const hit = die === 20 || (die !== 1 && die + foe.bonus >= 13);
      this.log(`Ответ: d20 [${die}] + ${foe.bonus} = ${die + foe.bonus} против твоей брони 13. ${hit ? 'Попадание.' : 'Промах.'}`);
      if (hit) {
        const a = this.roll(6, 'Урон противника'), b = die === 20 ? this.roll(6, 'Критический урон') : 0;
        const total = a + b + 2, damage = action === 'guard' ? Math.ceil(total / 2) : total;
        s.hp = Math.max(0, s.hp - damage);
        this.log(`Ответный урон: d6 [${a}]${b ? ` + d6 [${b}]` : ''} + 2 = ${total}${action === 'guard' ? `; защита уменьшает до ${damage}` : ''}.`);
      }
      if (!s.hp) { s.phase = 'lost'; this.log('Поход окончен. Выбери героя и попробуй другой маршрут.'); }
    }
    this.save(); return true;
  }
}
