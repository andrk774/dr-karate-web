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
  if (game.level.atmosphere === 'moonlight') {
    ctx.fillStyle = '#10245099'; ctx.fillRect(0, 0, 640, 360);
    ctx.fillStyle = '#e2f3cf'; ctx.beginPath(); ctx.arc(526 - offset * .08, 75, 22, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#1b3558'; ctx.beginPath(); ctx.arc(536 - offset * .08, 68, 20, 0, Math.PI * 2); ctx.fill();
  } else if (game.level.atmosphere === 'rift') {
    ctx.fillStyle = '#36144d66'; ctx.fillRect(0, 0, 640, 360);
  }
}

export function drawWorldObjects(ctx, game, time) {
  if (game.level.atmosphere === 'moonlight') {
    for (let x = 100; x < game.level.length; x += 110) {
      const y = FLOOR - 70 + Math.sin(x + time * .7) * 35;
      ctx.fillStyle = '#c7f3aa35'; ctx.fillRect(x - 3, y - 3, 8, 8);
      ctx.fillStyle = '#e5ffb5'; ctx.fillRect(x, y, 2, 2);
    }
  }
  if (game.level.atmosphere === 'rift') {
    const x = game.level.length - 70;
    const closed = game.phase === 'levelEnd' && game.fighters[0].hp > 0;
    ctx.save(); ctx.translate(x, FLOOR - 54);
    const glow = ctx.createRadialGradient(0, 0, 4, 0, 0, 84);
    glow.addColorStop(0, '#eed5ff88'); glow.addColorStop(1, '#a657ee00');
    ctx.fillStyle = glow; ctx.fillRect(-84, -84, 168, 168);
    for (let i = 0; i < 3; i++) {
      ctx.strokeStyle = ['#dcb7ff', '#9e70ed', '#8ce7e8'][i]; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(0, 0, closed ? 6 + i * 3 : 27 + i * 5, closed ? 9 + i * 3 : 46 + i * 7, Math.sin(time * .8 + i) * .15, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
  }
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
