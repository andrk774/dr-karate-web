import test from 'node:test';
import assert from 'node:assert/strict';
import { Dungeon, DUNGEON_KEY, ROOMS } from '../web/dungeon.js';
const memory = () => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }; };
const rolls = (...values) => { let i = 0; return () => { assert.ok(i < values.length, 'Unexpected die roll'); return values[i++]; }; };
function fight(random, hero = 'dipper') { const g = new Dungeon({ random, storage: memory() }); g.start(hero); g.enter('gate'); return g; }

test('d20 natural one misses; twenty crits and a defeated enemy cannot respond', () => {
  const miss = fight(rolls(0, 0)); miss.act('attack');
  assert.equal(miss.state.enemyHp, 16); assert.equal(miss.state.hp, 42); assert.equal(miss.state.dice.length, 2);
  const critical = fight(rolls(.999, .999, .999)); critical.state.enemyHp = 15; critical.act('attack');
  assert.equal(critical.state.phase, 'cleared'); assert.equal(critical.state.hp, 42); assert.equal(critical.state.gold, 20);
  assert.equal(critical.act('attack'), false); assert.equal(critical.state.turn, 1);
});
test('defense halves one response and prepares a non-stacking accuracy bonus', () => {
  const g = fight(rolls(.7, .5, .2, .5, 0)); g.act('guard');
  assert.equal(g.state.hp, 39); assert.equal(g.state.prepared, true);
  g.act('attack'); assert.equal(g.state.enemyHp, 9); assert.equal(g.state.prepared, false);
  assert.ok(g.state.log.some(x => x.includes('+ 8 = 13')));
});
test('skills and potions consume resources, respect caps and cost an enemy response', () => {
  const g = fight(rolls(.5, .5, 0, .999, 0), 'mabel'); g.state.hp = 20;
  g.act('skill'); assert.equal(g.state.hp, 28); assert.equal(g.state.enemyHp, 9); assert.equal(g.state.energy, 2);
  g.act('potion'); assert.equal(g.state.hp, 42); assert.equal(g.state.potions, 2);
  const snapshot = JSON.stringify(g.state); assert.equal(g.act('potion'), false); assert.equal(JSON.stringify(g.state), snapshot);
  g.state.energy = 0; assert.equal(g.act('skill'), false);
});
test('branch choices, trap failure and chest rewards cannot be replayed', () => {
  const g = fight(rolls(0, .999)); g.state.phase = 'cleared'; g.state.enemyHp = 0; g.advance();
  assert.equal(g.enter('boss'), false); assert.equal(g.enter('trap'), true); assert.equal(g.enter('spring'), false);
  g.state.hp = 5; g.resolve(); assert.equal(g.state.hp, 0); assert.equal(g.state.phase, 'lost'); assert.equal(g.resolve(), false); assert.equal(g.advance(), false);
  const chest = new Dungeon({ random: () => .5 }); chest.start('mabel');
  Object.assign(chest.state, { depth: 3, path: ['gate', 'spring', 'guard'] });
  chest.enter('chest'); chest.resolve(); assert.equal(chest.state.gold, 40); assert.equal(chest.state.potions, 4);
  assert.equal(chest.resolve(), false); assert.equal(chest.state.gold, 40);
});
test('saved combat resumes exactly; invalid or blocked storage is harmless', () => {
  const storage = memory(), g = new Dungeon({ storage, random: () => 0 }); g.start('dipper'); g.enter('gate'); g.act('attack');
  assert.deepEqual(new Dungeon({ storage }).state, g.state);
  const raw = JSON.parse(storage.getItem(DUNGEON_KEY)); raw.path = ['boss']; storage.setItem(DUNGEON_KEY, JSON.stringify(raw));
  assert.equal(new Dungeon({ storage }).state, null);
  storage.setItem(DUNGEON_KEY, '{bad'); assert.equal(new Dungeon({ storage }).state, null);
  const blocked = new Dungeon({ storage: { getItem() { throw new Error(); }, setItem() { throw new Error(); } } });
  assert.doesNotThrow(() => blocked.start('mabel')); assert.equal(blocked.saved, false);
});
test('complete both hero routes through all five rooms, saving after every action', () => {
  for (const hero of ['dipper', 'mabel']) {
    const storage = memory(); let seed = 77;
    const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
    const g = new Dungeon({ storage, random }); g.start(hero);
    for (let step = 0; step < 150 && !['won', 'lost'].includes(g.state.phase); step++) {
      const s = g.state;
      if (s.phase === 'route') g.enter(ROOMS[s.depth].find(r => r.type === 'rest')?.id ?? ROOMS[s.depth][0].id);
      else if (s.phase === 'event') g.resolve();
      else if (s.phase === 'cleared') g.advance();
      else g.act(s.hp < 25 && s.potions ? 'potion' : s.energy ? 'skill' : 'attack');
      assert.deepEqual(new Dungeon({ storage }).state, g.state, `Resume ${s.phase}`);
    }
    assert.equal(g.state.phase, 'won', hero); assert.equal(g.state.path.length, 5);
    const before = JSON.stringify(g.state); assert.equal(g.advance(), false); assert.equal(g.act('attack'), false); assert.equal(JSON.stringify(g.state), before);
  }
});
