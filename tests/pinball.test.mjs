import test from 'node:test';
import assert from 'node:assert/strict';
import { Pinball, PINBALL_GOAL, TARGETS } from '../web/pinball.js';

test('launch enters the main table; ball remains finite under varied flipper input', () => {
  const g = new Pinball(); assert.equal(g.launch(), true); assert.equal(g.launch(), false);
  let entered = false;
  for (let i = 0; i < 3600 && g.phase === 'playing'; i++) {
    g.update(1 / 60, { left: i % 70 < 25, right: i % 90 < 30 });
    if (g.ball.x < 350 && g.ball.y < 400) entered = true;
    for (const value of Object.values(g.ball)) assert.ok(Number.isFinite(value));
    assert.ok(g.ball.x >= 0 && g.ball.x <= 420);
  }
  assert.equal(entered, true, 'Launch should leave the return lane');
});
test('flipper returns a falling ball and pause freezes the simulation', () => {
  const g = new Pinball(); g.launch(); g.flippers[0] = -.48;
  Object.assign(g.ball, { x: 169, y: 526, vx: 0, vy: 150 });
  g.update(.02, { left: true }); assert.ok(g.ball.vy < 0);
  g.pause(true); const before = JSON.stringify(g.ball); const time = g.time;
  g.update(.1, { right: true }); assert.equal(JSON.stringify(g.ball), before); assert.equal(g.time, time);
  g.pause(false); g.update(.02); assert.notEqual(JSON.stringify(g.ball), before);
});
test('three drains end the attempt and reset restores balls, score and stars', () => {
  const g = new Pinball();
  for (let lives = 2; lives >= 0; lives--) { g.launch(); Object.assign(g.ball, { x: 210, y: 675, vx: 0, vy: 200 }); g.update(.01); assert.equal(g.lives, lives); }
  assert.equal(g.phase, 'lost'); assert.equal(g.launch(), false);
  g.reset(); assert.equal(g.phase, 'ready'); assert.equal(g.lives, 3); assert.equal(g.score, 0);
});
test('targets score once per contact and three distinct stars award a set bonus', () => {
  const g = new Pinball(); g.launch();
  for (let i = 0; i < 3; i++) {
    Object.assign(g.ball, { x: TARGETS[i].x, y: TARGETS[i].y - 20, vx: 0, vy: 50 });
    g.update(1 / 240);
  }
  assert.equal(g.score, 750); assert.deepEqual(g.targets, [false, false, false]);
  g.addScore(2250); assert.equal(g.score, PINBALL_GOAL); assert.equal(g.phase, 'won');
  const time = g.time; g.update(1); assert.equal(g.time, time); assert.equal(g.launch(), false);
});
test('a complete attempt needs flippers; timed returns can reach the exit naturally', () => {
  for (const controlled of [false, true]) {
    const g = new Pinball();
    for (let i = 0; i < 7200 && !['won', 'lost'].includes(g.phase); i++) {
      if (g.phase === 'ready') g.launch();
      const on = controlled && g.ball.y > 480;
      g.update(1 / 60, { left: on, right: on });
    }
    assert.equal(g.phase, controlled ? 'won' : 'lost');
  }
});
