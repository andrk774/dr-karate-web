import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
const { chromium, devices } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const url = process.env.GAME_URL || 'http://127.0.0.1:4173/';
await mkdir(new URL('../.qa/', import.meta.url), { recursive: true });
const browser = await chromium.launch({ headless: true });
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 }, reducedMotion: 'reduce' });
  page.on('pageerror', e => errors.push(e.message));
  page.on('response', r => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
  const ready = async p => { await p.goto(url); await p.waitForFunction(() => !document.querySelector('#dungeon-start').disabled); };
  const state = () => page.evaluate(() => JSON.parse(localStorage.getItem('dr-karate-dungeon-v1')));
  const click = async id => {
    const button = page.locator(`[data-dungeon-action="${id}"]`);
    await button.click(); await page.waitForFunction(() => document.querySelector('.dungeon-actions button:not(:disabled)') || document.querySelector('.dungeon-actions').children.length === 0);
  };
  await ready(page); await page.click('#dungeon-start'); await page.click('[data-dungeon-hero="mabel"]');
  await click('gate'); assert.equal((await state()).phase, 'combat');
  await page.waitForTimeout(250); const before = await state(); await page.waitForTimeout(250); assert.deepEqual(await state(), before, 'Turns wait for input');
  await click('guard'); const saved = await state();
  await page.reload(); await page.waitForFunction(() => !document.querySelector('#dungeon-start').disabled); await page.click('#dungeon-start');
  assert.deepEqual(await state(), saved, 'Resume exact completed round');
  // Seed only the dungeon dice, keeping the production roll/turn/save functions.
  await page.evaluate(async () => {
    const { Dungeon } = await import('./dungeon.js'); let seed = 77; const original = Dungeon.prototype.roll;
    Dungeon.prototype.roll = function (...args) { this.random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; }; return original.apply(this, args); };
  });
  await page.locator('#dungeon').screenshot({ path: '.qa/dungeon-combat.png' });
  for (let step = 0; step < 150; step++) {
    const s = await state(); if (['won', 'lost'].includes(s.phase)) break;
    if (s.phase === 'route') await click(['gate', 'spring', 'guard', 'camp', 'boss'][s.depth]);
    else if (s.phase === 'event') await click('resolve');
    else if (s.phase === 'cleared') await click('advance');
    else await click(s.hp < 25 && s.potions ? 'potion' : s.energy ? 'skill' : 'attack');
  }
  assert.equal((await state()).phase, 'won'); assert.match(await page.locator('.dungeon-room h3').textContent(), /Ключ найден/);
  await page.locator('#dungeon').screenshot({ path: '.qa/dungeon-win.png' });
  await page.click('[data-dungeon-hero="dipper"]'); assert.equal((await state()).hero, 'dipper');
  await click('gate'); await click('skill'); assert.equal((await state()).energy, 2);
  await page.click('#dungeon .mode-back'); assert.equal(await page.locator('#menu').isVisible(), true);
  await page.click('#pinball-start');
  const instrument = async p => p.evaluate(async () => {
    const { Pinball } = await import('./pinball.js'); const original = Pinball.prototype.update;
    Pinball.prototype.update = function (...args) { window.testPinball = this; return original.apply(this, args); };
  });
  await instrument(page); await page.click('.pinball-launch'); await page.waitForTimeout(100);
  await page.keyboard.down('a'); await page.waitForTimeout(100);
  assert.ok(await page.evaluate(() => window.testPinball.flippers[0] < 0)); await page.keyboard.up('a');
  await page.keyboard.press('p'); const ball = await page.evaluate(() => ({ ...window.testPinball.ball }));
  await page.waitForTimeout(150); assert.deepEqual(await page.evaluate(() => window.testPinball.ball), ball);
  await page.click('.pinball-pause'); await page.waitForTimeout(100);
  await page.locator('#pinball').screenshot({ path: '.qa/pinball-desktop.png' });
  // Place the ball at real targets; collision scoring and the victory UI remain production code.
  await page.evaluate(async () => {
    const { TARGETS } = await import('./pinball.js'); const g = window.testPinball;
    for (let round = 0; round < 4; round++) for (let i = 0; i < 3; i++) {
      g.cooldowns.fill(0); Object.assign(g.ball, { x: TARGETS[i].x, y: TARGETS[i].y - 20, vx: 0, vy: 50 }); g.update(1 / 240);
    }
  });
  await page.waitForFunction(() => document.querySelector('.pinball-status').textContent.includes('Шериф побеждён'));
  assert.ok(Number(await page.evaluate(() => localStorage.getItem('dr-karate-pinball-best-v1'))) >= 3000);
  await page.click('.pinball-launch');
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => { const g = window.testPinball; Object.assign(g.ball, { x: 210, y: 675, vx: 0, vy: 200 }); g.update(.01); });
    if (i < 2) await page.click('.pinball-launch');
  }
  await page.waitForFunction(() => document.querySelector('.pinball-status').textContent.includes('закончились'));
  await ready(page); await page.click('#pinball-start'); assert.match(await page.locator('.pinball-best').textContent(), /3\d\d\d/);
  await page.click('#pinball .mode-back'); await page.click('#campaign-start'); assert.equal(await page.locator('#campaign-map').isVisible(), true);
  await page.click('#map-menu'); await page.click('#start'); await page.waitForTimeout(2400); assert.equal(await page.locator('#hud').isVisible(), true);

  const mobile = await browser.newPage({ ...devices['iPhone 13'], defaultBrowserType: undefined, reducedMotion: 'reduce' });
  mobile.on('pageerror', e => errors.push(e.message));
  await ready(mobile); await mobile.click('#dungeon-start'); await mobile.click('[data-dungeon-hero="mabel"]'); await mobile.click('[data-dungeon-action="gate"]');
  assert.ok(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await mobile.locator('#dungeon').screenshot({ path: '.qa/dungeon-mobile.png' });
  await mobile.click('#dungeon .mode-back'); await mobile.click('#pinball-start'); await instrument(mobile); await mobile.click('.pinball-launch');
  await mobile.locator('.pinball-controls').scrollIntoViewIfNeeded();
  const left = await mobile.locator('[data-flipper="left"]').boundingBox(), right = await mobile.locator('[data-flipper="right"]').boundingBox();
  const cdp = await mobile.context().newCDPSession(mobile);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [left, right].map((b, i) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2, id: i + 1 })) });
  await mobile.waitForTimeout(100);
  assert.ok(await mobile.evaluate(() => window.testPinball.flippers[0] < 0 && window.testPinball.flippers[1] > Math.PI));
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  assert.ok(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await mobile.locator('#pinball').screenshot({ path: '.qa/pinball-mobile.png' });
  assert.deepEqual(errors, []);
  console.log('Extra modes browser QA passed: dungeon turns, both heroes, full route, exact resume, pinball controls, pause, scoring, victory, defeat, best score, mode switching and mobile multi-touch.');
} finally { await browser.close(); }
