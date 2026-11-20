import test from 'node:test';
import assert from 'node:assert/strict';
import { AdventureGame, CampaignProgress, LEVELS, SAVE_KEY } from '../web/campaign.js';

function memory(initial = null) {
  let raw = initial;
  return { getItem: () => raw, setItem: (_key, value) => { raw = value; } };
}
function advance(g, seconds, input = {}, enemy = {}) {
  for (let i = 0; i < Math.ceil(seconds * 60); i++) g.update(1 / 60, input, enemy);
}
function adventure(index = 0, onEvent = () => {}) {
  const g = new AdventureGame({ random: () => 0.5, onEvent });
  g.startLevel(index, 'easy'); advance(g, 2.1); return g;
}

test('campaign locks later levels and retains hero and best pages on reload', () => {
  const storage = memory(), p = new CampaignProgress(storage);
  assert.equal(p.isUnlocked(0), true); assert.equal(p.isUnlocked(1), false);
  assert.equal(p.recordWin(2, 3), false);
  p.selectHero('mabel'); assert.equal(p.recordWin(0, 2), true);
  assert.equal(p.isUnlocked(1), true); p.recordWin(0, 1);
  const loaded = new CampaignProgress(storage);
  assert.equal(loaded.hero, 'mabel'); assert.equal(loaded.bestPages[0], 2);
  assert.equal(loaded.unlocked, 1); assert.equal(loaded.completed, 1);
});
test('invalid saves, skipped levels and storage failures do not break the campaign', () => {
  assert.equal(new CampaignProgress(memory('{bad')).completed, 0);
  const p = new CampaignProgress(memory(JSON.stringify({ version: 1, hero: 'unknown', bestPages: [2, null, 3] })));
  assert.equal(p.hero, 'dipper'); assert.deepEqual(p.bestPages, [2, null, null, null]);
  assert.equal(p.selectHero('unknown'), false); assert.equal(p.recordWin(-1, 3), false);
  const blocked = new CampaignProgress({ getItem() { throw Error('denied'); }, setItem() { throw Error('denied'); } });
  assert.equal(blocked.recordWin(0, 3), true); assert.equal(blocked.unlocked, 1); assert.equal(blocked.saved, false);
  assert.equal(SAVE_KEY, 'dr-karate-campaign-v1');
});
test('level countdown and pause freeze movement; walking triggers an encounter', () => {
  const g = new AdventureGame(); g.startLevel(0);
  advance(g, 1, { right: true }); assert.equal(g.fighters[0].x, 100);
  g.pause(true); const time = g.phaseTime; advance(g, 3); assert.equal(g.phaseTime, time);
  g.pause(false); advance(g, 1.1); advance(g, 1, { right: true });
  assert.equal(g.enemyActive, true); assert.equal(g.enemyIndex, 0);
  assert.equal(g.fighters[1].hp, LEVELS[0].enemies[0].hp);
});
test('journal pages collect once, heal the hero, and reset for a retry', () => {
  const g = adventure(); g.fighters[0].hp = 50; g.fighters[0].x = LEVELS[0].pages[0];
  g.update(1 / 60, {}, {}); assert.equal(g.collected.size, 1); assert.equal(g.fighters[0].hp, 58);
  advance(g, 0.1); assert.equal(g.fighters[0].hp, 58);
  g.startLevel(0); assert.equal(g.collected.size, 0); assert.equal(g.fighters[0].hp, 100);
});
test('leaving an encounter requires victory; defeat ends the level without unlocking', () => {
  const storage = memory(), p = new CampaignProgress(storage); let result;
  const g = adventure(0, event => { if (event.type === 'levelEnd') { result = event; if (!event.winner) p.recordWin(event.index, event.pages); } });
  advance(g, 1, { right: true });
  g.fighters[0].x = g.bounds.right; advance(g, 0.5, { right: true });
  assert.ok(g.fighters[0].x <= g.bounds.right);
  g.fighters[0].hp = 0; g.update(1 / 60, {}, {});
  assert.equal(result.winner, 1); assert.equal(g.phase, 'levelEnd'); assert.equal(p.completed, 0);
  g.pause(true); assert.equal(g.paused, false);
});
test('all four levels can be traversed, fought and completed; final boss and save are correct', () => {
  const storage = memory(), p = new CampaignProgress(storage);
  for (let index = 0; index < LEVELS.length; index++) {
    assert.equal(p.isUnlocked(index), true);
    let wins = 0;
    const g = adventure(index, event => {
      if (event.type === 'levelEnd' && event.winner === 0) { wins++; p.recordWin(index, event.pages); }
    });
    // Real movement, attack wind-ups, hit detection, knockback and encounter transitions.
    // The opponent stays passive in this deterministic route test.
    for (let frame = 0; frame < 18000 && g.phase !== 'levelEnd'; frame++) {
      const [hero, foe] = g.fighters;
      const input = g.enemyActive ? { right: foe.x - hero.x > 54, left: hero.x - foe.x > 54, kick: Math.abs(foe.x - hero.x) < 84 } : { right: true };
      g.update(1 / 60, input, {});
    }
    assert.equal(g.phase, 'levelEnd', `Level ${index + 1} must be completable`);
    assert.equal(wins, 1); assert.equal(g.enemyIndex, LEVELS[index].enemies.length);
    assert.equal(g.collected.size, 3);
    if (index === 3) { assert.equal(g.enemyName, 'DR. KARATE'); assert.equal(g.fighters[1].maxHp, 140); }
    advance(g, 3, { right: true }); assert.equal(wins, 1, 'Completion is emitted only once');
  }
  const loaded = new CampaignProgress(storage);
  assert.equal(loaded.completed, 4); assert.deepEqual(loaded.bestPages, [3, 3, 3, 3]);
  assert.equal(loaded.unlocked, 3);
});
