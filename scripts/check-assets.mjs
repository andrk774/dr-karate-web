import { readFile, stat } from 'node:fs/promises';
import assert from 'node:assert/strict';
const root = new URL('../web/', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('assets/sprites.json', root)));
for (const [key, data] of Object.entries(manifest)) {
  const png = await readFile(new URL(`assets/${data.file}`, root));
  assert.equal(png.subarray(1, 4).toString(), 'PNG', `PNG signature: ${key}`);
  assert.equal(png.readUInt32BE(16), data.width, `PNG width: ${key}`);
  assert.equal(png.readUInt32BE(20), data.height, `PNG height: ${key}`);
}
const required = [];
for (let i = 0; i < 20; i++) { required.push(`0,${i}`, `4,${i}`); }
for (let i = 0; i < 11; i++) required.push(`3,${i}`);
for (let i = 0; i < 6; i++) required.push(`2,${i}`, `5,${i}`);
required.push('1,0', '6,0', '6,1');
for (const key of required) assert.ok(manifest[key], `Missing stage frame ${key}`);
for (const file of ['index.html', 'style.css', 'game.js', 'engine.js', 'favicon.svg', 'assets/DrKarate1.mp3', 'assets/DrKarate2.mp3']) {
  assert.ok((await stat(new URL(file, root))).size > 0, `Empty resource: ${file}`);
}
console.log(`Verified ${required.length} required sprite frames and all page/audio resources.`);
