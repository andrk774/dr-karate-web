// Optional browser QA: install Playwright or set PLAYWRIGHT_MODULE to its module URL.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
const { chromium, devices } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const url = process.env.GAME_URL || 'http://127.0.0.1:4173';
await mkdir(new URL('../.qa/', import.meta.url), { recursive: true });
const browser = await chromium.launch({ headless: true });
const errors = [];
function watch(page) {
  page.on('pageerror', e => errors.push(e.message));
  page.on('response', r => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
}
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1150 } });
  watch(page);
  await page.goto(url);
  await page.waitForFunction(() => !document.querySelector('#start').disabled);
  assert.match(await page.locator('#hud').textContent(), /ДИППЕР/);
  assert.match(await page.locator('#hud').textContent(), /DR\. KARATE/);
  const art = await page.evaluate(async () => {
    const { loadFighterArt } = await import('./fighters.js');
    return (await loadFighterArt()).map(sheet => ({
      id: sheet.id, frames: sheet.frames.length,
      feet: sheet.frames.map(frame => frame.baseline),
      widths: sheet.frames.map(frame => frame.right - frame.left),
    }));
  });
  assert.equal(art.length, 4);
  for (const sheet of art) {
    assert.equal(sheet.frames, 12);
    assert.ok(sheet.widths.every(width => width > 20), `All ${sheet.id} poses contain a visible fighter`);
    assert.equal(sheet.feet[8], sheet.feet[0], 'Jump uses standing origin, preserving tucked feet');
  }
  await page.screenshot({ path: '.qa/desktop-menu.png', fullPage: true });
  await page.selectOption('#difficulty', 'easy');
  await page.click('#start');
  await page.waitForTimeout(2800);
  assert.equal(await page.locator('#hud').isVisible(), true);
  await page.keyboard.down('d');
  await page.waitForTimeout(700);
  await page.keyboard.up('d');
  await page.keyboard.down('k');
  await page.waitForTimeout(2200);
  await page.keyboard.up('k');
  assert.ok(Number(await page.locator('#cpu-hp').textContent()) < 100, 'Player attacks must damage CPU');
  await page.screenshot({ path: '.qa/desktop-fight.png', fullPage: true });
  await page.keyboard.press('p');
  assert.equal(await page.locator('#pause-menu').isVisible(), true);
  const time = await page.locator('#timer').textContent();
  await page.waitForTimeout(1200);
  assert.equal(await page.locator('#timer').textContent(), time, 'Pause freezes clock');
  await page.click('#resume');
  await page.click('#night');
  assert.equal(await page.locator('#night').getAttribute('aria-pressed'), 'true');
  await page.click('#sound');
  await page.waitForTimeout(600);
  assert.equal(await page.locator('#sound').getAttribute('aria-pressed'), 'true');
  await page.click('#sound');
  await page.screenshot({ path: '.qa/desktop-night.png', fullPage: true });
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  assert.equal(await page.locator('#pause-menu').isVisible(), true, 'Focus loss pauses game');

  const mobile = await browser.newPage({ ...devices['iPhone 13'], defaultBrowserType: undefined });
  watch(mobile);
  await mobile.goto(url);
  await mobile.waitForFunction(() => !document.querySelector('#start').disabled);
  assert.ok(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'No mobile horizontal overflow');
  await mobile.screenshot({ path: '.qa/mobile-menu.png', fullPage: true });
  await mobile.tap('#start');
  await mobile.waitForTimeout(2700);
  assert.equal(await mobile.locator('.touch-controls').isVisible(), true);
  // Real touch input gives pointer capture valid active pointers, including multi-touch.
  await mobile.locator('.touch-controls').scrollIntoViewIfNeeded();
  const cdp = await mobile.context().newCDPSession(mobile);
  const right = await mobile.locator('[data-control="right"]').boundingBox();
  const punch = await mobile.locator('[data-control="punch"]').boundingBox();
  const touchPoints = [right, punch].map((box, id) => ({ id, x: box.x + box.width / 2, y: box.y + box.height / 2 }));
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints });
  await mobile.waitForTimeout(200);
  assert.equal(await mobile.locator('.touch-controls .pressed').count(), 2, 'Movement and attack work together');
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  assert.equal(await mobile.locator('.touch-controls .pressed').count(), 0);
  await mobile.screenshot({ path: '.qa/mobile-fight.png', fullPage: true });
  await mobile.close();

  const missing = await browser.newPage();
  await missing.route('**/sprites.json', route => route.abort());
  await missing.goto(url);
  await missing.waitForFunction(() => document.querySelector('#start').textContent.includes('не загрузилась'));
  assert.equal(await missing.locator('#start').isDisabled(), true, 'Failed load must not start a broken game');
  await missing.close();
  const missingFighter = await browser.newPage();
  await missingFighter.route('**/fighters/rumble.png', route => route.abort());
  await missingFighter.goto(url);
  await missingFighter.waitForFunction(() => document.querySelector('#start').textContent.includes('не загрузилась'));
  assert.equal(await missingFighter.locator('#start').isDisabled(), true, 'Missing fighter art prevents an invisible fight');
  await missingFighter.close();
  assert.deepEqual(errors, []);
  console.log('Browser QA passed: desktop combat, pause, audio, night, focus, mobile controls, load failure.');
} finally { await browser.close(); }
