import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
const { chromium, devices } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const url = process.env.GAME_URL || 'http://127.0.0.1:4173/';
await mkdir(new URL('../.qa/', import.meta.url), { recursive: true });
const browser = await chromium.launch({ headless: true });
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1150 } });
  page.on('pageerror', e => errors.push(e.message));
  page.on('response', r => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
  await page.goto(url); await page.waitForFunction(() => !document.querySelector('#campaign-start').disabled);
  // Capture the real instance in this test browser only. Simulation below uses
  // the production movement, collisions, attack timing and victory callbacks.
  // The CPU stays passive to make this full-route test deterministic.
  await page.evaluate(async () => {
    const { AdventureGame } = await import('./campaign.js');
    const update = AdventureGame.prototype.update;
    AdventureGame.prototype.update = function (...args) { window.testAdventure = this; return update.apply(this, args); };
  });
  await page.click('#campaign-start');
  assert.equal(await page.locator('.map-node').count(), 6);
  assert.equal(await page.locator('.map-node:disabled').count(), 5);
  await page.click('[data-hero="mabel"]');
  assert.equal(await page.locator('[data-hero="mabel"]').getAttribute('aria-pressed'), 'true');
  await page.locator('#campaign-map').screenshot({ path: '.qa/campaign-map.png' });
  await page.click('#play-level');
  await page.waitForFunction(() => window.testAdventure?.phase === 'fight');
  assert.equal(await page.locator('#player-name').textContent(), 'МЭЙБЛ');
  await page.keyboard.down('d'); await page.waitForTimeout(1700); await page.keyboard.up('d');
  assert.match(await page.locator('#journal-count').textContent(), /1 \/ 3/);
  await page.locator('#screen').screenshot({ path: '.qa/campaign-forest.png' });
  await page.keyboard.press('p');
  const before = await page.evaluate(() => window.testAdventure.elapsed);
  await page.waitForTimeout(200);
  assert.equal(await page.evaluate(() => window.testAdventure.elapsed), before);
  await page.click('#resume');
  for (let index = 0; index < 6; index++) {
    await page.waitForFunction(i => window.testAdventure?.levelIndex === i, index);
    const result = await page.evaluate(() => {
      const g = window.testAdventure;
      let maxX = g.fighters[0].x;
      for (let frame = 0; frame < 18000 && g.phase !== 'levelEnd'; frame++) {
        const [hero, foe] = g.fighters;
        const input = g.enemyActive ? { right: foe.x - hero.x > 54, left: hero.x - foe.x > 54, kick: Math.abs(foe.x - hero.x) < 84 } : { right: true };
        g.update(1 / 60, input, {}); maxX = Math.max(maxX, hero.x);
      }
      return { phase: g.phase, pages: g.collected.size, maxX };
    });
    assert.equal(result.phase, 'levelEnd'); assert.equal(result.pages, 3); assert.ok(result.maxX > 640);
    await page.waitForFunction(() => !document.querySelector('#result').hidden);
    if (index === 5) {
      assert.equal(await page.locator('#result-title').textContent(), 'ГОРОД СПАСЁН!');
      await page.locator('#screen').screenshot({ path: '.qa/campaign-finale.png' });
      await page.click('#restart');
    } else {
      await page.click('#back-menu');
      assert.equal(await page.locator(`.map-node[data-level="${index + 1}"]`).isEnabled(), true);
      if (index === 0) await page.click('[data-hero="dipper"]');
      await page.click(`.map-node[data-level="${index + 1}"]`); await page.click('#play-level');
      await page.waitForFunction(() => window.testAdventure?.phase === 'fight');
      await page.locator('#screen').screenshot({ path: `.qa/campaign-level-${index + 2}.png` });
    }
  }
  assert.match(await page.locator('#map-summary').textContent(), /6\/6/);
  assert.match(await page.locator('#map-summary').textContent(), /18\/18/);
  await page.reload(); await page.waitForFunction(() => !document.querySelector('#campaign-start').disabled);
  await page.click('#campaign-start');
  assert.equal(await page.locator('.map-node:disabled').count(), 0);
  assert.equal(await page.locator('[data-hero="dipper"]').getAttribute('aria-pressed'), 'true');
  assert.match(await page.locator('#map-summary').textContent(), /18\/18/);

  await page.evaluate(() => localStorage.setItem('dr-karate-campaign-v1', JSON.stringify({ version: 1, hero: 'mabel', bestPages: [3, 3, 3, 3] })));
  await page.reload(); await page.waitForFunction(() => !document.querySelector('#campaign-start').disabled);
  await page.click('#campaign-start');
  assert.equal(await page.locator('.map-node[data-level="4"]').isEnabled(), true);
  assert.equal(await page.locator('.map-node[data-level="5"]').isEnabled(), false);
  assert.match(await page.locator('#map-summary').textContent(), /4\/6/);
  assert.match(await page.locator('#brief-title').textContent(), /Ночной лес/);
  await page.click('#play-level'); await page.waitForTimeout(2300);
  assert.equal(await page.locator('#level-title').textContent(), '5 / 6 · Ночной лес');

  const mobile = await browser.newPage({ ...devices['iPhone 13'], defaultBrowserType: undefined });
  mobile.on('pageerror', e => errors.push(e.message));
  await mobile.goto(url); await mobile.waitForFunction(() => !document.querySelector('#campaign-start').disabled);
  await mobile.tap('#campaign-start'); await mobile.tap('[data-hero="mabel"]');
  assert.ok(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Mobile map fits viewport');
  await mobile.screenshot({ path: '.qa/campaign-mobile-map.png', fullPage: true });
  await mobile.tap('#play-level'); await mobile.waitForTimeout(2300);
  assert.equal(await mobile.locator('.touch-controls').isVisible(), true);
  await mobile.screenshot({ path: '.qa/campaign-mobile-level.png', fullPage: true });
  assert.deepEqual(errors, []);
  console.log('Campaign browser QA passed: six levels, final boss, all 18 pages, four-level save migration, hero selection, map locks, reload persistence and mobile.');
} finally { await browser.close(); }
