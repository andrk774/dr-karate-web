import { FLOOR } from './engine.js';

export async function loadWorldArt() {
  const images = await Promise.all(['map', 'stages'].map(async name => {
    const image = new Image();
    image.src = new URL(`./assets/adventure/${name}.png`, import.meta.url).href;
    await image.decode();
    return image;
  }));
  if (images[1].naturalHeight % 3) throw new Error('Invalid stage atlas');
  return { map: images[0], stages: images[1] };
}

export function drawWorldBackground(ctx, game, art, camera) {
  const stripHeight = art.naturalHeight / 3;
  const width = art.naturalWidth * 360 / stripHeight;
  const offset = camera / Math.max(1, game.level.length - 640) * (width - 640);
  ctx.drawImage(art, 0, game.level.terrain * stripHeight, art.naturalWidth, stripHeight,
    -Math.round(offset), 0, width, 360);
}

export function drawWorldObjects(ctx, game, time) {
  for (let i = 0; i < game.level.pages.length; i++) {
    if (game.collected.has(i)) continue;
    const x = game.level.pages[i], y = FLOOR - 38 + Math.sin(time * 4 + i) * 3;
    ctx.fillStyle = '#f8d46b35'; ctx.fillRect(x - 17, y - 20, 34, 40);
    ctx.fillStyle = '#6b3825'; ctx.fillRect(x - 10, y - 15, 21, 29);
    ctx.fillStyle = '#ffe5a1'; ctx.fillRect(x - 8, y - 13, 17, 24);
    ctx.fillStyle = '#8b4a32'; ctx.font = 'bold 13px monospace'; ctx.fillText('3', x - 4, y + 1);
    ctx.fillRect(x - 5, y + 5, 10, 1);
  }
  if (game.enemyActive && game.phase !== 'encounterEnd') {
    ctx.fillStyle = '#74dedb65';
    for (let y = FLOOR - 75; y < FLOOR; y += 8) ctx.fillRect(game.bounds.right + 9, y, 3, 5);
  }
  const exit = game.level.length - 70;
  ctx.fillStyle = '#533f2a'; ctx.fillRect(exit, FLOOR - 56, 5, 57);
  ctx.fillStyle = '#d3b776'; ctx.fillRect(exit - 28, FLOOR - 63, 61, 24);
  ctx.fillStyle = '#343f32'; ctx.font = 'bold 10px monospace'; ctx.fillText('ВЫХОД', exit - 23, FLOOR - 47);
}
