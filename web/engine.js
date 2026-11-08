export const FLOOR = 330;
export const ATTACKS = Object.freeze({
  punch: { windup: 0.09, active: 0.09, duration: 0.34, range: 63, damage: 8 },
  kick: { windup: 0.19, active: 0.12, duration: 0.57, range: 88, damage: 13 },
});
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

function fighter(x, facing) {
  return { x, y: 0, vy: 0, facing, hp: 100, attack: null, attackTime: 0,
    connected: false, stun: 0, blocking: false, moving: false, walk: 0 };
}

export class Game {
  constructor({ random = Math.random, onEvent = () => {} } = {}) {
    this.random = random;
    this.onEvent = onEvent;
    this.wins = [0, 0];
    this.phase = 'menu';
    this.paused = false;
    this.difficulty = 'normal';
    this.round = 1;
    this.resetFighters();
  }

  resetFighters() {
    this.fighters = [fighter(220, 1), fighter(420, -1)];
    this.time = 60;
    this.aiWait = 0.6;
    this.aiGuard = false;
    this.freeze = 0;
  }

  start(difficulty = 'normal') {
    this.difficulty = difficulty;
    this.wins = [0, 0];
    this.round = 1;
    this.paused = false;
    this.nextRound();
  }

  nextRound() {
    this.resetFighters();
    this.phase = 'countdown';
    this.phaseTime = 2.4;
    this.onEvent({ type: 'round', round: this.round });
  }

  pause(value = !this.paused) {
    if (!['menu', 'matchEnd'].includes(this.phase)) this.paused = value;
  }

  ai(dt) {
    const [player, cpu] = this.fighters;
    const distance = Math.abs(player.x - cpu.x);
    const input = {};
    this.aiWait -= dt;
    if (distance > 56) input[cpu.x > player.x ? 'left' : 'right'] = true;
    if (distance < 43) input[cpu.x > player.x ? 'right' : 'left'] = true;
    if (this.aiWait <= 0) {
      this.aiWait = this.difficulty === 'easy' ? 0.65 + this.random() * 0.6 : 0.28 + this.random() * 0.5;
      this.aiGuard = this.random() < (this.difficulty === 'easy' ? 0.25 : 0.55);
      if (distance < 89) input[distance <= 63 && this.random() < 0.55 ? 'punch' : 'kick'] = true;
      if (distance > 130 && this.random() < 0.15) input.jump = true;
    }
    input.block = !!(this.aiGuard && player.attack && distance < 115 && cpu.y === 0);
    return input;
  }

  move(f, input, dt) {
    f.stun = Math.max(0, f.stun - dt);
    f.blocking = !!input.block && !f.attack && f.stun === 0 && f.y === 0;
    f.moving = false;
    if (f.stun === 0) {
      if (!f.attack && !f.blocking) {
        const direction = Number(!!input.right) - Number(!!input.left);
        f.x += direction * 135 * dt;
        f.moving = direction !== 0;
        f.walk += Math.abs(direction) * dt * 12;
        if (input.jump && f.y === 0) {
          f.vy = -360;
          this.onEvent({ type: 'jump', x: f.x });
        }
        const attack = input.kick ? 'kick' : input.punch ? 'punch' : null;
        if (attack) {
          f.attack = attack;
          f.attackTime = 0;
          f.connected = false;
          this.onEvent({ type: 'swing', attack });
        }
      }
    }
    if (f.y < 0 || f.vy < 0) {
      f.vy += 1050 * dt;
      f.y += f.vy * dt;
      if (f.y >= 0) { f.y = 0; f.vy = 0; }
    }
    f.x = clamp(f.x, 35, 605);
    if (f.attack) {
      f.attackTime += dt;
      if (f.attackTime >= ATTACKS[f.attack].duration) f.attack = null;
    }
  }

  strike(attacker, defender) {
    const a = ATTACKS[attacker.attack];
    if (!a || attacker.connected || attacker.attackTime < a.windup || attacker.attackTime > a.windup + a.active) return;
    const dx = defender.x - attacker.x;
    if (dx * attacker.facing < 0 || Math.abs(dx) > a.range || Math.abs(attacker.y - defender.y) > 48) return;
    attacker.connected = true;
    const blocked = defender.blocking && defender.facing === -attacker.facing;
    defender.hp = Math.max(0, defender.hp - (blocked ? 1 : a.damage));
    defender.stun = blocked ? 0.07 : 0.2;
    if (!blocked) defender.attack = null;
    defender.x = clamp(defender.x + attacker.facing * (blocked ? 4 : 12), 35, 605);
    this.freeze = 0.055;
    this.onEvent({ type: blocked ? 'block' : 'hit', x: defender.x, y: FLOOR + defender.y - 48, direction: attacker.facing });
  }

  finishRound() {
    const [p, c] = this.fighters;
    this.roundWinner = p.hp === c.hp ? -1 : p.hp > c.hp ? 0 : 1;
    if (this.roundWinner >= 0) this.wins[this.roundWinner]++;
    this.phase = 'roundEnd';
    this.phaseTime = 2.6;
    this.onEvent({ type: 'roundEnd', winner: this.roundWinner });
  }

  update(dt, input = {}, cpuInput) {
    if (this.paused || this.phase === 'menu' || this.phase === 'matchEnd') return;
    if (this.phase === 'countdown' || this.phase === 'roundEnd') {
      this.phaseTime -= dt;
      if (this.phaseTime <= 0) {
        if (this.phase === 'countdown') {
          this.phase = 'fight';
          this.onEvent({ type: 'fight' });
        } else if (this.wins.some(n => n >= 2)) {
          this.phase = 'matchEnd';
          this.onEvent({ type: 'matchEnd', winner: this.wins[0] >= 2 ? 0 : 1 });
        } else {
          this.round++;
          this.nextRound();
        }
      }
      return;
    }
    if (this.freeze > 0) { this.freeze -= dt; return; }
    this.time = Math.max(0, this.time - dt);
    const [p, c] = this.fighters;
    this.move(p, input, dt);
    this.move(c, cpuInput ?? this.ai(dt), dt);
    // Grounded fighters cannot pass through each other; jumping can cross sides.
    if (Math.abs(p.y - c.y) < 55 && Math.abs(p.x - c.x) < 34) {
      const sign = p.x <= c.x ? 1 : -1;
      const center = clamp((p.x + c.x) / 2, 52, 588);
      p.x = center - sign * 17;
      c.x = center + sign * 17;
    }
    if (!p.attack) p.facing = p.x < c.x ? 1 : -1;
    if (!c.attack) c.facing = c.x < p.x ? 1 : -1;
    this.strike(p, c);
    this.strike(c, p);
    if (p.hp <= 0 || c.hp <= 0 || this.time <= 0) this.finishRound();
  }
}
