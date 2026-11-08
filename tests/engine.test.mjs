import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../web/engine.js';

function battle() {
  const game = new Game({ random: () => 0.5 });
  game.start();
  advance(game, 2.5);
  return game;
}
function advance(game, seconds, player = {}, cpu = {}) {
  for (let i = 0; i < Math.ceil(seconds * 60); i++) game.update(1 / 60, player, cpu);
}
function close(game, distance = 50) {
  game.fighters[0].x = 250;
  game.fighters[1].x = 250 + distance;
}

test('countdown prevents combat; movement starts with fight', () => {
  const g = new Game(); g.start();
  advance(g, 1, { right: true, punch: true });
  assert.equal(g.fighters[0].x, 220);
  assert.equal(g.fighters[1].hp, 100);
  advance(g, 1.5);
  assert.equal(g.phase, 'fight');
  advance(g, 0.3, { right: true });
  assert.ok(g.fighters[0].x > 220);
});
test('one punch deals damage only once during active frames', () => {
  const g = battle(); close(g);
  g.update(1 / 60, { punch: true }, {});
  advance(g, 0.5);
  assert.equal(g.fighters[1].hp, 92);
});
test('kick reaches farther than punch', () => {
  const g = battle(); close(g, 80);
  g.update(1 / 60, { punch: true }, {}); advance(g, 0.5);
  assert.equal(g.fighters[1].hp, 100);
  g.update(1 / 60, { kick: true }, {}); advance(g, 0.65);
  assert.equal(g.fighters[1].hp, 87);
});
test('out-of-range attacks miss', () => {
  const g = battle();
  advance(g, 2, { punch: true, kick: true });
  assert.equal(g.fighters[1].hp, 100);
});
test('guard reduces a hit to chip damage and prevents attacking', () => {
  const g = battle(); close(g);
  g.update(1 / 60, { punch: true }, { block: true, kick: true });
  advance(g, 0.25, {}, { block: true, kick: true });
  assert.equal(g.fighters[1].hp, 99);
  assert.equal(g.fighters[1].attack, null);
  assert.equal(g.fighters[0].hp, 100);
});
test('jump leaves the ground, avoids low attacks, and lands', () => {
  const g = battle(); close(g);
  g.update(1 / 60, { jump: true }, {}); advance(g, 0.2);
  assert.ok(g.fighters[0].y < -48);
  g.update(1 / 60, {}, { punch: true }); advance(g, 0.15);
  assert.equal(g.fighters[0].hp, 100);
  advance(g, 1);
  assert.equal(g.fighters[0].y, 0);
  assert.equal(g.fighters[0].vy, 0);
});
test('ground collision and stage boundaries constrain fighters', () => {
  const g = battle(); close(g);
  advance(g, 2, { right: true }, { left: true });
  assert.ok(g.fighters[1].x - g.fighters[0].x >= 34 - 0.001);
  advance(g, 10, { left: true }, { right: true });
  assert.equal(g.fighters[0].x, 35);
  assert.equal(g.fighters[1].x, 605);
});
test('pause freezes timer, physics and countdown', () => {
  const g = battle(); const time = g.time;
  g.pause(true); advance(g, 5, { right: true, jump: true, punch: true });
  assert.equal(g.time, time);
  assert.equal(g.fighters[0].x, 220);
  g.pause(false); advance(g, 1);
  assert.ok(g.time < time);
  g.nextRound(); const count = g.phaseTime;
  g.pause(true); advance(g, 5); assert.equal(g.phaseTime, count);
});
test('timeout awards the healthier fighter; two rounds win the match', () => {
  const g = battle();
  g.fighters[1].hp = 50; g.time = 0.001; g.update(1 / 60, {}, {});
  assert.equal(g.phase, 'roundEnd'); assert.deepEqual(g.wins, [1, 0]);
  advance(g, 5.2);
  assert.equal(g.phase, 'fight'); assert.equal(g.round, 2);
  assert.equal(g.fighters[1].hp, 100);
  g.fighters[1].hp = 0; g.update(1 / 60, {}, {}); advance(g, 3);
  assert.equal(g.phase, 'matchEnd'); assert.deepEqual(g.wins, [2, 0]);
  const time = g.time; advance(g, 5, { right: true }); assert.equal(g.time, time);
  g.start(); assert.deepEqual(g.wins, [0, 0]); assert.equal(g.round, 1);
});
test('a drawn round awards neither side and permits a rematch', () => {
  const g = battle(); g.time = 0.001; g.update(1 / 60, {}, {});
  assert.equal(g.roundWinner, -1); assert.deepEqual(g.wins, [0, 0]);
  advance(g, 5.2); assert.equal(g.phase, 'fight'); assert.equal(g.round, 2);
});
test('AI approaches and attacks a stationary player', () => {
  const g = battle();
  for (let i = 0; i < 600; i++) g.update(1 / 60, {});
  assert.ok(g.fighters[0].hp < 100);
  assert.ok(g.fighters.every(f => Number.isFinite(f.x) && f.hp >= 0));
});
