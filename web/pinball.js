export const PINBALL_GOAL = 3000;
export const BUMPERS = [{ x: 113, y: 163, r: 26 }, { x: 270, y: 163, r: 26 }, { x: 193, y: 270, r: 30 }];
export const TARGETS = [{ x: 70, y: 337, r: 15 }, { x: 193, y: 385, r: 15 }, { x: 315, y: 337, r: 15 }];
const WALLS = [[18, 60, 18, 482], [18, 60, 65, 20], [65, 20, 332, 20], [332, 20, 405, 70],
  [405, 70, 405, 680], [18, 482, 18, 680], [365, 205, 365, 680], [18, 482, 139, 555], [365, 482, 281, 555]];
export const TABLE_WALLS = WALLS;
export class Pinball {
  constructor({ onEvent = () => {} } = {}) { this.onEvent = onEvent; this.reset(); }
  reset() {
    this.score = 0; this.lives = 3; this.phase = 'ready'; this.paused = false; this.time = 0;
    this.targets = [false, false, false]; this.cooldowns = Array(6).fill(0);
    this.flippers = [0.42, Math.PI - 0.42]; this.ball = { x: 386, y: 585, vx: 0, vy: 0, r: 8 };
  }
  launch() {
    if (this.phase !== 'ready' || this.paused) return false;
    this.ball = { x: 386, y: 585, vx: 0, vy: -950, r: 8 };
    this.phase = 'playing'; this.onEvent({ type: 'launch' }); return true;
  }
  pause(value = !this.paused) { if (this.phase === 'playing') this.paused = value; }
  addScore(points) {
    this.score += points; this.onEvent({ type: 'score', points });
    if (this.score >= PINBALL_GOAL) { this.phase = 'won'; this.onEvent({ type: 'won' }); }
  }
  segment(ax, ay, bx, by, boost = 0, restitution = 0.8) {
    const b = this.ball, dx = bx - ax, dy = by - ay;
    const t = Math.max(0, Math.min(1, ((b.x - ax) * dx + (b.y - ay) * dy) / (dx * dx + dy * dy)));
    const px = ax + t * dx, py = ay + t * dy, nx0 = b.x - px, ny0 = b.y - py;
    const distance = Math.hypot(nx0, ny0), radius = b.r + 4;
    if (distance >= radius) return;
    const nx = distance > 0.001 ? nx0 / distance : -dy / Math.hypot(dx, dy);
    const ny = distance > 0.001 ? ny0 / distance : dx / Math.hypot(dx, dy);
    b.x = px + nx * radius; b.y = py + ny * radius;
    const approach = b.vx * nx + b.vy * ny;
    if (approach < 0) { b.vx -= (1 + restitution) * approach * nx; b.vy -= (1 + restitution) * approach * ny; }
    // Only the upper face of an engaged flipper launches the ball back up-table.
    if (boost && ny < -0.1 && b.vy > -500) { b.vy = -640; b.vx = boost * (170 + t * 110); }
  }
  circle(target, index, dt) {
    const b = this.ball, dx = b.x - target.x, dy = b.y - target.y, distance = Math.hypot(dx, dy), radius = target.r + b.r;
    this.cooldowns[index] = Math.max(0, this.cooldowns[index] - dt);
    if (distance >= radius) return;
    const nx = distance > 0.001 ? dx / distance : 0, ny = distance > 0.001 ? dy / distance : -1;
    b.x = target.x + nx * radius; b.y = target.y + ny * radius;
    const dot = b.vx * nx + b.vy * ny;
    if (dot < 0) { b.vx -= 2 * dot * nx; b.vy -= 2 * dot * ny; }
    b.vx += nx * 110; b.vy += ny * 110;
    if (this.cooldowns[index] > 0) return;
    this.cooldowns[index] = 0.18;
    if (index < 3) this.addScore(50);
    else {
      const i = index - 3;
      if (!this.targets[i]) {
        this.targets[i] = true; this.addScore(150);
        if (this.targets.every(Boolean)) { this.addScore(300); this.targets.fill(false); this.onEvent({ type: 'bonus' }); }
      } else this.addScore(25);
    }
  }
  update(dt, input = {}) {
    if (this.paused || this.phase !== 'playing') return;
    // Small fixed upper bound avoids tunnelling through rails at low frame rates.
    let remaining = Math.max(0, Math.min(dt, 0.1));
    while (remaining > 0 && this.phase === 'playing') {
      const step = Math.min(remaining, 1 / 240); remaining -= step; this.time += step;
      const b = this.ball;
      this.flippers[0] += ((input.left ? -0.48 : 0.42) - this.flippers[0]) * Math.min(1, step * 25);
      this.flippers[1] += ((input.right ? Math.PI + 0.48 : Math.PI - 0.42) - this.flippers[1]) * Math.min(1, step * 25);
      b.vy += 520 * step; b.vx *= 1 - 0.08 * step;
      b.x += b.vx * step; b.y += b.vy * step;
      for (const wall of WALLS) this.segment(...wall);
      BUMPERS.forEach((p, i) => this.circle(p, i, step));
      TARGETS.forEach((p, i) => this.circle(p, i + 3, step));
      for (let i = 0; i < 2; i++) {
        const ax = i === 0 ? 139 : 281, a = this.flippers[i];
        this.segment(ax, 555, ax + Math.cos(a) * 60, 555 + Math.sin(a) * 60, input[i === 0 ? 'left' : 'right'] ? (i === 0 ? 1 : -1) : 0, 0.2);
      }
      const speed = Math.hypot(b.vx, b.vy);
      if (speed > 1100) { b.vx *= 1100 / speed; b.vy *= 1100 / speed; }
      if (b.y > 670 && this.phase === 'playing') {
        this.lives--; this.phase = this.lives > 0 ? 'ready' : 'lost';
        this.ball = { x: 386, y: 585, vx: 0, vy: 0, r: 8 };
        this.onEvent({ type: 'drain' });
      }
    }
  }
}
