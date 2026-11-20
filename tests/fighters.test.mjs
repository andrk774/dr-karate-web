import test from 'node:test';
import assert from 'node:assert/strict';
import { fighterFrame, FRAME } from '../web/fighters.js';
import { ATTACKS } from '../web/engine.js';

const fighter = overrides => ({ hp: 100, y: 0, stun: 0, blocking: false,
  moving: false, walk: 0, attack: null, attackTime: 0, ...overrides });

test('attack sprites extend during the actual damage window and recover afterward', () => {
  for (const attack of ['punch', 'kick']) {
    const timing = ATTACKS[attack];
    assert.equal(fighterFrame(fighter({ attack, attackTime: timing.windup - 0.01 }), 0), FRAME[attack + 'Ready']);
    assert.equal(fighterFrame(fighter({ attack, attackTime: timing.windup + timing.active / 2 }), 0), FRAME[attack]);
    assert.equal(fighterFrame(fighter({ attack, attackTime: timing.duration - 0.01 }), 0), FRAME[attack + 'Ready']);
  }
});

test('knockout, block and hurt states override movement and interrupted attacks', () => {
  assert.equal(fighterFrame(fighter({ hp: 0, attack: 'punch', stun: 0.2, blocking: true }), 0), FRAME.knockout);
  assert.equal(fighterFrame(fighter({ blocking: true, stun: 0.1 }), 0), FRAME.block);
  assert.equal(fighterFrame(fighter({ stun: 0.2, moving: true, attack: 'kick' }), 0), FRAME.hurt);
});

test('airborne pose wins over walk, and movement animation stops when stationary', () => {
  assert.equal(fighterFrame(fighter({ y: -40, moving: true }), 0), FRAME.jump);
  const walking = new Set([0, 1.4, 2.8, 4.2, 5.6].map(walk => fighterFrame(fighter({ moving: true, walk }), 0)));
  assert.ok(walking.has(FRAME.walkA));
  assert.ok(walking.has(FRAME.walkB));
  assert.equal(fighterFrame(fighter({ walk: 2.8 }), 0), FRAME.idle);
  assert.equal(fighterFrame(fighter(), 0.6), FRAME.breathe);
});
