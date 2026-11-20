import { ATTACKS, FLOOR } from './engine.js';

export const FIGHTER_ART = [
  { id: 'rumble', name: 'RUMBLE', file: 'rumble.png', height: 104,
    anchors: [0.48, 0.48, 0.48, 0.48, 0.46, 0.46, 0.43, 0.32, 0.48, 0.48, 0.53, 0.50] },
  { id: 'dr-karate', name: 'DR. KARATE', file: 'dr-karate.png', height: 102,
    anchors: [0.49, 0.49, 0.48, 0.48, 0.47, 0.47, 0.43, 0.31, 0.48, 0.48, 0.53, 0.50],
    // The KO head extends slightly left of its nominal grid cell. Use explicit
    // atlas rectangles so the full head appears only in the knockout frame.
    regions: { 10: { right: 0.91 }, 11: { left: -0.067, top: 0.58 } } },
  { id: 'dipper', name: 'ДИППЕР', file: 'dipper.png', height: 90,
    anchors: [0.48, 0.48, 0.48, 0.48, 0.46, 0.46, 0.43, 0.32, 0.48, 0.48, 0.53, 0.50] },
  { id: 'mabel', name: 'МЭЙБЛ', file: 'mabel.png', height: 90,
    anchors: [0.48, 0.48, 0.48, 0.48, 0.46, 0.46, 0.43, 0.32, 0.48, 0.48, 0.53, 0.50],
    regions: { 10: { right: 0.93 }, 11: { left: -0.04, top: 0.58 } } },
];
export const FRAME = Object.freeze({
  idle: 0, breathe: 1, walkA: 2, walkB: 3,
  punchReady: 4, punch: 5, kickReady: 6, kick: 7,
  jump: 8, block: 9, hurt: 10, knockout: 11,
});

export function fighterFrame(f, time) {
  if (f.hp <= 0) return FRAME.knockout;
  if (f.blocking) return FRAME.block;
  if (f.stun > 0) return FRAME.hurt;
  if (f.attack) {
    const attack = ATTACKS[f.attack];
    const ready = f.attack === 'punch' ? FRAME.punchReady : FRAME.kickReady;
    const extended = f.attack === 'punch' ? FRAME.punch : FRAME.kick;
    if (f.attackTime < attack.windup) return ready;
    if (f.attackTime <= attack.windup + attack.active + 0.04) return extended;
    return ready;
  }
  if (f.y < 0) return FRAME.jump;
  if (f.moving) return [FRAME.walkA, FRAME.idle, FRAME.walkB, FRAME.breathe][Math.floor(f.walk / 1.4) % 4];
  return Math.floor(time * 2) % 2 ? FRAME.breathe : FRAME.idle;
}

// Read opaque bounds without changing the original generated PNG. Each frame
// keeps a shared scale, its own floor baseline and an explicit hip anchor.
export function prepareFighterSheet(image, definition) {
  if (image.naturalWidth % 4 || image.naturalHeight % 3) throw new Error(`Invalid sprite grid: ${definition.id}`);
  const width = image.naturalWidth / 4;
  const height = image.naturalHeight / 3;
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(image, 0, 0);
  const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
  const frames = [];
  for (let i = 0; i < 12; i++) {
    const region = definition.regions?.[i] ?? {};
    const offsetX = Math.round((region.left ?? 0) * width);
    const offsetY = Math.round((region.top ?? 0) * height);
    const x = i % 4 * width + offsetX;
    const y = Math.floor(i / 4) * height + offsetY;
    const frameWidth = Math.round((region.right ?? 1) * width) - offsetX;
    const frameHeight = height - offsetY;
    let left = frameWidth, top = frameHeight, right = -1, bottom = -1;
    for (let py = 0; py < frameHeight; py++) {
      for (let px = 0; px < frameWidth; px++) {
        if (data[((y + py) * canvas.width + x + px) * 4 + 3] > 192) {
          left = Math.min(left, px); right = Math.max(right, px);
          top = Math.min(top, py); bottom = Math.max(bottom, py);
        }
      }
    }
    if (right < left || bottom < top) throw new Error(`Empty fighter frame: ${definition.id}/${i}`);
    frames.push({ x, y, width: frameWidth, height: frameHeight, left, top, right, bottom,
      anchor: definition.anchors[i] * width - offsetX, baseline: bottom + 1 });
  }
  // Tucked knees should stay raised relative to the shared ground origin.
  frames[FRAME.jump].baseline = frames[FRAME.idle].baseline;
  const scale = definition.height / (frames[0].bottom - frames[0].top + 1);
  return { ...definition, image, frames, scale };
}

export async function loadFighterArt() {
  return Promise.all(FIGHTER_ART.map(async definition => {
    const image = new Image();
    image.src = new URL(`./assets/fighters/${definition.file}`, import.meta.url).href;
    await image.decode();
    return prepareFighterSheet(image, definition);
  }));
}

export function drawFighterSprite(ctx, f, art, time, worldWidth = 640) {
  const frameIndex = fighterFrame(f, time);
  const frame = art.frames[frameIndex];
  const scale = art.scale;
  const knockedOut = frameIndex === FRAME.knockout;
  const x = knockedOut ? Math.max(58, Math.min(worldWidth - 58, f.x)) : f.x;
  ctx.save();
  ctx.fillStyle = '#10291d55';
  ctx.beginPath();
  ctx.ellipse(x, FLOOR + 2, knockedOut ? 41 : Math.max(11, 25 + f.y / 8), 5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.translate(Math.round(x), Math.round(FLOOR + (knockedOut ? 0 : f.y)));
  ctx.scale(f.facing, 1);
  if (f.tint) ctx.filter = f.tint;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(art.image, frame.x, frame.y, frame.width, frame.height,
    -Math.round(frame.anchor * scale), -Math.round(frame.baseline * scale),
    Math.round(frame.width * scale), Math.round(frame.height * scale));
  ctx.restore();
}
