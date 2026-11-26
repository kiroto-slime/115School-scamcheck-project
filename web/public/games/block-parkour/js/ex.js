// ===== 小方塊跑酷：感染開場 → 2D 跑酷 → 分數升級 → 結算 =====
const $ = s => document.querySelector(s);

// 使用外部程式初始化偏好，遵守網站僅允許同源腳本的限制。
try {
  const saved = localStorage.getItem('block-parkour-theme');
  document.documentElement.dataset.theme = saved === 'dark' || saved === 'light'
    ? saved : (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
} catch (_) { document.documentElement.dataset.theme = 'light'; }
document.documentElement.dataset.largeText = 'false';

const CLEAR_SCORE = 1000;
const MAX_LIFE = 5;          // 生命 5 格（可以是小數，會一點一點減少）
const ENERGY_PX = 3200;      // 能量：往右跑約 3200 像素（約 80 分）用完
const LIFE_DRAIN_PX = 800;   // 能量耗盡後：往右跑約 800 像素（約 20 分）扣 1 格生命
const WRONG_LOSS = 0.1;      // 答錯扣 0.1 格；連續答錯每次再乘 1.1 倍
const WRONG_RATE = 1.1;

// ----- 簡易音效（Web Audio，不需要音檔）-----
const Sfx = {
  ctx: null,
  output: null,
  enabled: true,
  play(type) {
    if (!this.enabled) return;
    try {
      if (!this.ctx) {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.output = this.ctx.createGain();
        this.output.connect(this.ctx.destination);
      }
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      const seq = {
        jump: [[520, .06], [780, .06]],
        coin: [[988, .05], [1319, .1]],
        hit: [[300, .05], [600, .08]],
        hurt: [[200, .12], [120, .18]],
        up: [[523, .08], [659, .08], [784, .08], [1047, .2]],
        over: [[392, .2], [330, .2], [262, .4]],
        glitch: [[90, .08], [1400, .04], [70, .1], [1800, .04], [60, .2]],
      }[type] || [];
      let t = this.ctx.currentTime;
      seq.forEach(([f, d]) => {
        const o = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        o.type = type === 'hurt' || type === 'glitch' ? 'sawtooth' : 'square';
        o.frequency.value = f;
        g.gain.setValueAtTime(.05, t);
        g.gain.exponentialRampToValueAtTime(.001, t + d);
        o.connect(g).connect(this.output);
        o.start(t);
        o.stop(t + d);
        t += d;
      });
    } catch (e) { /* 不支援音效就略過 */ }
  },
};

const gameText = GameLanguage.text;
const showGameText = GameLanguage.bind;

function toast(key) {
  const t = $('#ex-toast');
  showGameText(t, key);
  t.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove('show'), 3000);
}

// ===== 開場：紅色布幕 → 感染版 =====
const Intro = {
  start() {
    const curtain = $('#ex-curtain');
    const BANDS = 7;
    for (let i = 0; i < BANDS; i++) {
      const b = document.createElement('div');
      b.className = 'band';
      b.style.top = (i * 100 / BANDS) + '%';
      b.style.animationDelay = (i * 0.22) + 's';
      curtain.appendChild(b);
    }
    setTimeout(() => curtain.classList.add('falling'), 700);
    setTimeout(() => this.corrupt(), 700 + BANDS * 220 + 700);
  },

  corrupt() {
    Sfx.play('glitch');
    document.documentElement.dataset.theme = 'dark';
    document.body.classList.add('corrupted');
    showGameText($('#ex-eyebrow'), 'detected');
    showGameText($('#ex-badge'), 'infection');
    showGameText($('#ex-terminal'), 'corruptTerminal');
    showGameText($('#ex-title'), 'corruptTitle');
    showGameText($('#ex-subtitle'), 'corruptSubtitle');
    const story = $('#ex-story');
    story.replaceChildren();
    for (const key of ['story1', 'story2', 'localNames']) {
      const p = document.createElement('p');
      if (key === 'localNames') p.className = 'ex-small';
      showGameText(p, () => gameText(key, CLEAR_SCORE));
      story.appendChild(p);
    }
    const btn = $('#ex-start');
    showGameText(btn, 'start');
    btn.disabled = false;
    const input = $('#ex-name');
    input.disabled = false;
    input.focus();
    // 布幕淡出，留下紅色的感染版畫面
    const curtain = $('#ex-curtain');
    curtain.classList.add('fade');
    setTimeout(() => curtain.remove(), 1300);
  },
};

// ===== 鍵盤 =====
const Keys = { left: false, right: false, jump: false, jumpPressed: false };
const keyboardControls = new Set();
const pointerControls = new Map();
const KEYMAP = { arrowleft: 'left', a: 'left', arrowright: 'right', d: 'right', arrowup: 'jump', w: 'jump', ' ': 'jump' };

function syncControls() {
  const jump = keyboardControls.has('jump') || [...pointerControls.values()].includes('jump');
  if (jump && !Keys.jump) Keys.jumpPressed = true;
  Keys.jump = jump;
  for (const key of ['left', 'right']) {
    Keys[key] = keyboardControls.has(key) || [...pointerControls.values()].includes(key);
  }
  document.querySelectorAll('[data-control]').forEach(button => {
    button.classList.toggle('is-held', Keys[button.dataset.control]);
  });
}

function clearControls() {
  keyboardControls.clear();
  pointerControls.clear();
  Object.assign(Keys, { left: false, right: false, jump: false, jumpPressed: false });
  syncControls();
}

function pauseGame() {
  clearControls();
  if (!Run.running || Run.paused) return;
  Run.paused = 'manual';
  $('#ex-pause').hidden = false;
  $('#resume-btn').focus();
}

document.addEventListener('keydown', e => {
  if (!Run.running || Run.paused || e.ctrlKey || e.altKey || e.metaKey) return;
  const k = KEYMAP[e.key.toLowerCase()];
  if (!k) return;
  e.preventDefault();
  keyboardControls.add(k);
  syncControls();
});

document.addEventListener('keyup', e => {
  const k = KEYMAP[e.key.toLowerCase()];
  if (k) { keyboardControls.delete(k); syncControls(); }
});

window.addEventListener('blur', pauseGame);
document.addEventListener('visibilitychange', () => { if (document.hidden) pauseGame(); });

// ===== 跑酷 =====
const Quiz = {
  request: 0,
  controller: null,
  cancel() {
    this.request++;
    this.controller?.abort();
    $('#ex-quiz').hidden = true;
  },
  async ask() {
    this.controller?.abort();
    const request = ++this.request;
    const controller = this.controller = new AbortController();
    clearControls();
    Run.paused = 'quiz';
    $('#ex-quiz').hidden = false;
    showGameText($('#quiz-question'), 'loading');
    $('#quiz-options').replaceChildren();
    GameLanguage.unbind($('#quiz-feedback'));
    $('#quiz-feedback').textContent = '';
    for (const id of ['quiz-retry', 'quiz-continue', 'quiz-skip']) $('#' + id).hidden = true;
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch('/api/game/question', { signal: controller.signal, cache: 'no-store' });
      if (!response.ok) throw new Error(response.status === 404 ? 'emptyQuiz' : 'unavailable');
      const question = await response.json();
      if (typeof question.id !== 'string' || typeof question.question !== 'string' || !Array.isArray(question.options) || question.options.length < 2 || question.options.length > 4 || !question.options.every(v => typeof v === 'string') || !Number.isInteger(question.correct_index) || question.correct_index < 0 || question.correct_index >= question.options.length || typeof question.explanation !== 'string') throw new Error('invalid');
      if (request !== this.request) return;
      GameLanguage.unbind($('#quiz-question'));
      $('#quiz-question').textContent = question.question;
      question.options.forEach((option, index) => {
        const button = document.createElement('button');
        button.type = 'button'; button.className = 'ex-btn ghost'; button.textContent = option;
        button.onclick = () => {
          $('#quiz-options').querySelectorAll('button').forEach(b => b.disabled = true);
          const correct = index === question.correct_index;
          const effect = Run.answerQuiz(correct);
          showGameText($('#quiz-feedback'), () => [
            gameText(correct ? 'correct' : 'incorrect') + gameText(...effect),
            gameText('answer', question.options[question.correct_index]),
            question.explanation,
          ].join('\n'));
          try {
            const saved = JSON.parse(localStorage.getItem('scamcheck-block-parkour-practice') || '[]');
            const rows = Array.isArray(saved) ? saved.slice(-99) : [];
            rows.push({ question_id: question.id, selected_index: index, correct, score: Run.score, at: new Date().toISOString() });
            localStorage.setItem('scamcheck-block-parkour-practice', JSON.stringify(rows));
          } catch (_) { toast('practiceFailed'); }
          $('#quiz-continue').hidden = false;
          $('#quiz-continue').focus();
        };
        $('#quiz-options').appendChild(button);
      });
      $('#quiz-options button').focus();
    } catch (error) {
      if (request !== this.request) return;
      const key = error.name === 'AbortError' ? 'timedOut' : ['emptyQuiz', 'invalid'].includes(error.message) ? error.message : 'unavailable';
      showGameText($('#quiz-question'), key);
      $('#quiz-retry').hidden = false; $('#quiz-skip').hidden = false;
      $('#quiz-retry').focus();
    } finally { clearTimeout(timeout); }
  },
  resume() {
    this.cancel(); clearControls();
    if (Run.paused !== 'quiz') return;
    if (Run.life <= 0) { Run.finish(false, 'wrongEnd'); return; }
    Run.rescueFromVoid();
    Run.paused = false;
  },
};

const Run = {
  W: 960,
  H: 540,
  GROUND: 470,
  running: false,

  start(name) {
    Quiz.cancel();
    this.name = name;
    this.ctx = $('#ex-canvas').getContext('2d');
    this.p = { x: 120, y: 300, w: 34, h: 40, vx: 0, vy: 0, onGround: false, coyote: 0, face: 1, jumps: 0 };
    this.cam = 0;
    this.maxX = 120;
    this.bonus = 0;
    this.fruits = 0;
    this.life = MAX_LIFE;
    this.energy = 1;
    this.wrongStreak = 0;
    this.inv = 0;
    this.level = 1;
    this.hasCleared = false;
    this.nextLevel = 100;
    this.plats = [];
    this.items = [];
    this.enemies = [];
    this.pops = [];
    this.genX = 0;
    this.lastSafe = { x: 120, y: this.GROUND - 40 };
    this.paused = false;
    this.banner = { text: 'GAME START!', t: 100, color: '#3dff7a' };
    this.gen(this.W * 2.5);
    clearControls();

    $('#ex-origin main').hidden = true;
    document.body.classList.add('playing');
    $('#ex-result').hidden = true;
    $('#ex-pause').hidden = true;
    $('#ex-board-modal').hidden = true;
    $('#ex-game').hidden = false;
    $('#game-stage').appendChild($('#rank-btn'));
    $('#game-stage').appendChild($('#sound-btn'));
    Sfx.play('up');
    this.running = true;
    this.last = performance.now();
    this.acc = 0;
    requestAnimationFrame(t => this.loop(t));
  },

  get score() {
    return Math.floor((this.maxX - 120) / 40) + this.bonus;
  },

  // ----- 地形產生：一段段地面 + 洞 + 浮空平台 + 果子 + Bug -----
  gen(until) {
    while (this.genX < until) {
      let x, len;
      if (this.genX === 0) {
        x = 0;
        len = 1100;   // 開頭安全區
      } else {
        const hard = Math.min(1.25, 1 + this.level * 0.03);
        // 坑寬上限 ~160px：一段跳水平約 187px 一定跳得過，二段跳當作容錯
        const gap = Math.random() < 0.5 ? 0 : Math.min(160, (70 + Math.random() * 60) * hard);
        x = this.genX + gap;
        len = 320 + Math.random() * 420;
      }
      this.plats.push({ x, y: this.GROUND, w: len, h: this.H - this.GROUND, ground: true });

      if (x > 0 && len > 380 && Math.random() < 0.6) {
        const pw = 120 + Math.random() * 90;
        const px = x + 60 + Math.random() * (len - pw - 120);
        const py = this.GROUND - 105 - Math.random() * 60;
        this.plats.push({ x: px, y: py, w: pw, h: 16, ground: false });
        this.items.push({ x: px + pw / 2, y: py - 34, got: false });   // 浮空平台只放 1 顆
      }
      if (x > 0 && Math.random() < 0.35) {   // 地面約 35% 機率出 1 顆
        this.items.push({ x: x + 80 + Math.random() * Math.max(10, len - 160), y: this.GROUND - 70, got: false });
      }
      if (x > 900 && Math.random() < Math.min(0.85, 0.42 + this.level * 0.06)) {
        const speed = 1 + Math.random() * 0.8 + Math.min(this.level, 20) * 0.15;
        this.enemies.push({ x: x + len * 0.6, y: this.GROUND - 30, w: 34, h: 30, vx: -speed, minX: x + 8, maxX: x + len - 42, alive: true });
      }
      this.genX = x + len;
    }
  },

  overlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  },

  step() {
    const p = this.p;
    const dir = (Keys.right ? 1 : 0) - (Keys.left ? 1 : 0);
    p.vx = dir ? Math.max(-4.6, Math.min(4.6, p.vx + dir * 0.6)) : p.vx * 0.8;
    if (dir) p.face = dir;

    // 一段跳 + 空中二段跳（走下平台沒跳的話，空中還能跳一次）
    if (Keys.jumpPressed) {
      if (p.onGround || p.coyote > 0) {
        p.vy = -12.6;
        p.jumps = 1;
        p.onGround = false;
        p.coyote = 0;
        Sfx.play('jump');
      } else if (p.jumps < 2) {
        p.vy = -11.2;
        p.jumps = 2;
        this.pop('×2', p.x + p.w / 2, p.y + p.h, '#29e3ff');
        Sfx.play('jump');
      }
    }
    Keys.jumpPressed = false;
    if (!Keys.jump && p.vy < -5) p.vy = -5;   // 放開跳躍鍵 = 小跳
    p.vy = Math.min(p.vy + 0.62, 14);

    // 水平移動：只和地面側邊碰撞
    const startX = p.x;
    p.x += p.vx;
    if (p.x < this.cam) { p.x = this.cam; p.vx = 0; }
    for (const pl of this.plats) {
      if (!pl.ground || !this.overlap(p, pl)) continue;
      if (p.vx > 0) p.x = pl.x - p.w; else if (p.vx < 0) p.x = pl.x + pl.w;
      p.vx = 0;
    }

    // 垂直移動：地面實心，浮空平台只能從上面踩
    const prevBottom = p.y + p.h;
    p.y += p.vy;
    p.onGround = false;
    for (const pl of this.plats) {
      if (!this.overlap(p, pl)) continue;
      if (pl.ground) {
        if (p.vy > 0) { p.y = pl.y - p.h; p.vy = 0; p.onGround = true; this.markSafe(pl); }
        else if (p.vy < 0) { p.y = pl.y + pl.h; p.vy = 0; }
      } else if (p.vy > 0 && prevBottom <= pl.y + 1) {
        p.y = pl.y - p.h;
        p.vy = 0;
        p.onGround = true;
      }
    }
    p.coyote = p.onGround ? 6 : p.coyote - 1;
    if (p.onGround) p.jumps = 0;
    else if (p.coyote <= 0 && p.jumps === 0) p.jumps = 1;

    if (p.y > this.H + 80) this.hurt(true);
    if (!this.running) return;
    if (p.x > startX) { this.drain(p.x - startX); if (!this.running) return; }

    this.maxX = Math.max(this.maxX, p.x);
    this.cam = Math.max(this.cam, p.x - 320);
    this.gen(this.cam + this.W * 2.5);
    const cut = this.cam - 700;
    this.plats = this.plats.filter(o => o.x + o.w > cut);
    this.items = this.items.filter(o => o.x > cut && !o.got);
    this.enemies = this.enemies.filter(o => o.x > cut && o.alive);

    // 果子
    for (const it of this.items) {
      if (this.overlap(p, { x: it.x - 13, y: it.y - 13, w: 26, h: 26 })) {
        it.got = true;
        this.bonus += 10;
        this.fruits++;
        const gain = 0.03 + Math.random() * 0.02;   // 補 3～5% 能量
        this.energy = Math.min(1, this.energy + gain);
        this.pop(`+10 ⚡+${Math.round(gain * 100)}%`, it.x, it.y, '#3dff7a');
        Sfx.play('coin');
      }
    }

    // Bug：從上面踩扁，其他方向碰到就受傷
    for (const e of this.enemies) {
      e.x += e.vx;
      if (e.x < e.minX || e.x > e.maxX) e.vx *= -1;
      if (!this.overlap(p, e)) continue;
      if (p.vy > 0 && prevBottom <= e.y + 12) {
        e.alive = false;
        p.vy = -9;
        this.bonus += 10;
        this.pop('HIT!', e.x, e.y - 10, '#ffe14d');
        Sfx.play('hit');
      } else if (this.inv <= 0) {
        this.hurt(false);
      }
    }

    if (this.inv > 0) this.inv--;
    if (this.banner) { this.banner.t--; if (this.banner.t <= 0) this.banner = null; }
    this.pops.forEach(o => { o.y -= 0.8; o.t--; });
    this.pops = this.pops.filter(o => o.t > 0);

    if (this.life > 0 && this.score >= this.nextLevel) {
      while (this.score >= this.nextLevel) {
        this.nextLevel += 100;
        this.level++;
      }
      this.inv = Math.max(this.inv, 60);
      if (!this.hasCleared && this.score >= CLEAR_SCORE) {
        this.hasCleared = true;
        this.banner = { text: 'GAME CLEAR!', t: 130, color: '#ffe14d' };
        toast('clearToast');
      } else {
        this.banner = { text: 'LEVEL UP!', t: 100, color: '#ffe14d' };
      }
      Sfx.play('up');
      void Quiz.ask();
    }
  },

  // 站在地面中段時記錄為復活點
  markSafe(pl) {
    const p = this.p;
    if (p.x > pl.x + 20 && p.x + p.w < pl.x + pl.w - 20) this.lastSafe = { x: p.x, y: pl.y - p.h };
  },

  // 往右前進消耗能量；能量用完改成慢慢扣生命
  drain(dx) {
    let rest = dx;
    if (this.energy > 0) {
      const used = Math.min(this.energy, rest / ENERGY_PX);
      this.energy -= used;
      rest -= used * ENERGY_PX;
      if (this.energy < 1e-6) this.energy = 0;
    }
    if (rest > 0 && this.energy === 0) {
      this.life = Math.max(0, this.life - rest / LIFE_DRAIN_PX);
      if (this.life <= 1e-6) { this.life = 0; this.finish(false, 'energyEnd'); }
    }
  },

  // 作答結果：答對補滿能量並重置連錯；答錯扣 0.1 格，連錯每次 ×1.1
  answerQuiz(correct) {
    if (correct) {
      this.wrongStreak = 0;
      this.energy = 1;
      return ['fullEnergy'];
    }
    const loss = WRONG_LOSS * WRONG_RATE ** this.wrongStreak;
    this.wrongStreak++;
    this.life = Math.max(0, this.life - loss);
    if (this.life <= 1e-6) this.life = 0;
    return [this.life === 0 ? 'zeroHealth' : 'lostHealth', Number(loss.toFixed(3))];
  },

  // 出題時腳下沒有任何地面或平台：移到右邊最近一段地面上
  rescueFromVoid() {
    const p = this.p;
    const below = this.plats.some(pl => pl.x < p.x + p.w && pl.x + pl.w > p.x && pl.y >= p.y + p.h - 2);
    if (below) return;
    const next = this.plats.filter(pl => pl.ground && pl.x >= p.x).sort((a, b) => a.x - b.x)[0];
    if (!next) return;
    Object.assign(p, { x: next.x + 20, y: next.y - p.h, vx: 0, vy: 0, onGround: true, jumps: 0, coyote: 6 });
    this.cam = Math.max(this.cam, p.x - 320);
    this.lastSafe = { x: p.x, y: p.y };
  },

  hurt(fell) {
    this.life = Math.max(0, this.life - 1);
    if (this.life <= 1e-6) this.life = 0;
    this.inv = 90;
    Sfx.play('hurt');
    this.pop(fell ? 'FALL!' : 'DAMAGE!', this.p.x, this.p.y - 10, '#ff2a3d');
    if (this.life <= 0) {
      this.finish(false, fell ? 'fallEnd' : 'bugEnd');
      return;
    }
    if (fell) {
      Object.assign(this.p, { x: this.lastSafe.x, y: this.lastSafe.y - 4, vx: 0, vy: 0 });
      this.cam = Math.max(0, Math.min(this.cam, this.p.x - 200));
    } else {
      this.p.vy = -7;
      this.p.vx = -4 * this.p.face;
    }
  },

  pop(text, x, y, color) {
    this.pops.push({ text, x, y, color, t: 45 });
  },

  loop(now) {
    if (!this.running) return;
    this.acc += Math.min(100, now - this.last);
    this.last = now;
    while (this.acc >= 16.67) {
      if (!this.paused && this.running) this.step();
      this.acc -= 16.67;
    }
    this.draw();
    requestAnimationFrame(t => this.loop(t));
  },

  finish(clear, reason) {
    clear = clear || this.hasCleared;
    const alreadyCleared = this.hasCleared;
    this.running = false;
    document.body.appendChild($('#rank-btn'));
    document.body.appendChild($('#sound-btn'));
    clearControls();
    $('#ex-pause').hidden = true;
    Sfx.play(clear ? 'up' : 'over');
    const title = $('#r-title');
    showGameText(title, clear ? 'GAME CLEAR!' : 'GAME OVER');
    title.classList.toggle('clear', clear);
    showGameText($('#r-reason'), () => alreadyCleared ? gameText('clearedEnd', gameText(reason)) : gameText(reason));
    $('#r-name').textContent = this.name;
    $('#r-score').textContent = this.score;
    $('#r-level').textContent = this.level;
    $('#r-fruit').textContent = this.fruits;
    const entry = { id: Date.now(), name: this.name, score: this.score, clear };
    const rank = ExBoard.add(entry);
    showGameText($('#r-rank'), () => {
      if (rank === -1) return gameText('storeFailed');
      return rank > 0 ? gameText('yourRank', entry.name, rank) : gameText('tryRank');
    });
    ExBoard.render($('#r-board'), entry.id);
    setTimeout(() => {
      $('#ex-game').hidden = true;
      $('#ex-result').hidden = false;
      $('#r-retry').focus();
    }, clear ? 900 : 500);
  },

  // ===== 繪圖 =====
  draw() {
    const c = this.ctx, W = this.W, H = this.H, cam = this.cam;

    // 背景：深色 + 視差網格 + 機櫃剪影
    const g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#1a0626');
    g.addColorStop(1, '#3a0618');
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);
    c.strokeStyle = 'rgba(255,45,149,.12)';
    c.lineWidth = 1;
    const off = -(cam * 0.3) % 48;
    for (let x = off; x < W; x += 48) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, H); c.stroke(); }
    for (let y = 0; y < H; y += 48) { c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke(); }
    c.fillStyle = 'rgba(0,0,0,.35)';
    const rackOff = -(cam * 0.5) % 260;
    for (let x = rackOff; x < W; x += 260) {
      c.fillRect(x + 40, 210, 90, 260);
      c.fillStyle = 'rgba(61,255,122,.25)';
      for (let y = 230; y < 450; y += 28) c.fillRect(x + 52, y, 10, 4);
      c.fillStyle = 'rgba(0,0,0,.35)';
    }

    c.save();
    c.translate(-Math.round(cam), 0);

    // 平台
    for (const pl of this.plats) {
      if (pl.x > cam + W || pl.x + pl.w < cam) continue;
      if (pl.ground) {
        c.fillStyle = '#16101f';
        c.fillRect(pl.x, pl.y, pl.w, pl.h);
        c.fillStyle = '#3dff7a';
        c.fillRect(pl.x, pl.y, pl.w, 5);
        c.fillStyle = 'rgba(61,255,122,.15)';
        for (let x = pl.x + 10; x < pl.x + pl.w - 20; x += 60) c.fillRect(x, pl.y + 20, 30, 6);
      } else {
        c.fillStyle = '#ff2d95';
        c.fillRect(pl.x, pl.y, pl.w, pl.h);
        c.fillStyle = '#ffd1e8';
        c.fillRect(pl.x, pl.y, pl.w, 3);
      }
    }

    // 果子
    c.font = '26px "Segoe UI Emoji", sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    const bob = Math.sin(performance.now() / 200) * 3;
    for (const it of this.items) {
      if (it.x < cam - 30 || it.x > cam + W + 30) continue;
      c.fillText('🍎', it.x, it.y + bob);
    }

    // Bug 敵人
    for (const e of this.enemies) {
      if (e.x < cam - 50 || e.x > cam + W + 50) continue;
      c.fillStyle = '#ff7a1a';
      c.beginPath();
      c.ellipse(e.x + e.w / 2, e.y + e.h / 2 + 2, e.w / 2, e.h / 2, 0, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#7a1fff';
      for (let i = 0; i < 4; i++) c.fillRect(e.x + 4 + i * 8, e.y - 4, 4, 8);
      c.fillStyle = '#fff';
      c.fillRect(e.x + 8, e.y + 10, 7, 7);
      c.fillRect(e.x + 20, e.y + 10, 7, 7);
      c.fillStyle = '#000';
      const look = e.vx < 0 ? 0 : 3;
      c.fillRect(e.x + 9 + look, e.y + 12, 3, 4);
      c.fillRect(e.x + 21 + look, e.y + 12, 3, 4);
    }

    // 玩家：被感染的紅色小封包
    const p = this.p;
    if (!(this.inv > 0 && Math.floor(this.inv / 5) % 2)) {
      c.fillStyle = '#d4262f';
      c.fillRect(p.x, p.y, p.w, p.h);
      c.fillStyle = '#ff9aa4';
      c.fillRect(p.x + p.w / 2 - 5, p.y, 10, 9);
      c.strokeStyle = '#ff2d95';
      c.lineWidth = 2;
      c.strokeRect(p.x + 1, p.y + 1, p.w - 2, p.h - 2);
      c.fillStyle = '#fff';
      c.font = 'bold 12px sans-serif';
      c.fillText('• ᴗ •', p.x + p.w / 2 + p.face * 2, p.y + 24);
    }

    // 浮動文字
    c.font = 'italic 900 20px "Arial Black", Impact, sans-serif';
    for (const o of this.pops) {
      c.fillStyle = o.color;
      c.fillText(gameText(o.text), o.x, o.y);
    }
    c.restore();

    // HUD：玩家名、LIFE、分數、等級
    c.textAlign = 'left';
    c.textBaseline = 'top';
    c.fillStyle = '#fff';
    c.font = 'bold 16px "Microsoft JhengHei", sans-serif';
    c.fillText(`${gameText('player')} ${this.name}`, 20, 16);
    c.font = 'italic 900 14px "Arial Black", Impact, sans-serif';
    c.fillStyle = '#3dff7a';
    c.fillText(gameText('life'), 20, 42);
    for (let i = 0; i < MAX_LIFE; i++) {
      const fill = Math.max(0, Math.min(1, this.life - i));   // 這一格剩多少
      c.beginPath();
      c.moveTo(70 + i * 44, 40);
      c.lineTo(108 + i * 44, 40);
      c.lineTo(102 + i * 44, 58);
      c.lineTo(64 + i * 44, 58);
      c.closePath();
      c.fillStyle = '#3a2340';
      c.fill();
      if (fill > 0) {
        c.save();
        c.clip();
        c.fillStyle = '#ff2d95';
        c.fillRect(64 + i * 44, 40, 44 * fill, 18);
        c.restore();
      }
    }

    // 能量條：橘色外框、藍色內容
    c.fillStyle = '#ffb04d';
    c.font = 'italic 900 11px "Arial Black", Impact, sans-serif';
    c.fillText(gameText('energy'), 20, 68, 52);
    const ex = 76, ey = 66, ew = 212, eh = 14;
    c.fillStyle = '#14203a';
    c.fillRect(ex, ey, ew, eh);
    c.fillStyle = '#29a3ff';
    c.fillRect(ex, ey, ew * this.energy, eh);
    const empty = this.energy === 0;
    c.lineWidth = 2;
    c.strokeStyle = empty && Math.floor(performance.now() / 300) % 2 ? '#ff2a3d' : '#ff8a1a';
    c.strokeRect(ex, ey, ew, eh);
    if (empty) {
      c.fillStyle = '#ff6b7a';
      c.font = 'bold 12px "Microsoft JhengHei", sans-serif';
      c.fillText(gameText('draining'), ex, ey + eh + 5);
    }
    c.textAlign = 'center';
    c.fillStyle = '#ffe14d';
    c.font = 'italic 900 34px "Arial Black", Impact, sans-serif';
    c.fillText(String(this.score).padStart(5, '0'), W / 2, 14);
    c.font = 'bold 13px "Microsoft JhengHei", sans-serif';
    c.fillStyle = '#c9b8d6';
    const goal = this.hasCleared ? gameText('goalReached') : gameText('goal', CLEAR_SCORE);
    c.fillText(gameText('hud', this.level, this.nextLevel, goal), W / 2, 54, 365);

    // 大字橫幅（GAME START / LEVEL UP）
    if (this.banner) {
      const b = this.banner;
      const s = 1 + Math.max(0, (b.t - 80) / 40);
      c.save();
      c.translate(W / 2, H / 2 - 30);
      c.scale(s, s);
      c.rotate(-0.06);
      c.font = 'italic 900 72px "Arial Black", Impact, sans-serif';
      c.lineWidth = 8;
      c.strokeStyle = '#000';
      c.strokeText(gameText(b.text), 0, 0);
      c.fillStyle = b.color;
      c.fillText(gameText(b.text), 0, 0);
      c.restore();
    }
  },
};

// ===== 本機排行榜：分數高的在前，只留前 10 名 =====
const ExBoard = {
  KEY: 'scamcheck-block-parkour-leaderboard',
  MAX: 10,

  load() {
    try {
      const list = JSON.parse(localStorage.getItem(this.KEY));
      return Array.isArray(list) ? list.filter(e => e && typeof e.name === 'string' && Number.isFinite(e.score) && Number.isFinite(e.id)) : [];
    } catch (e) {
      return [];
    }
  },

  // 回傳名次（1~10）；沒進前 10 回傳 0；無法儲存回傳 -1
  add(entry) {
    const list = this.load();
    list.push(entry);
    // 同分時先完成的在前。
    list.sort((a, b) => b.score - a.score || a.id - b.id);
    const top = list.slice(0, this.MAX);
    try {
      localStorage.setItem(this.KEY, JSON.stringify(top));
    } catch (e) {
      return -1;
    }
    return top.findIndex(e => e.id === entry.id) + 1;
  },

  render(box, highlightId) {
    const list = this.load();
    if (!list.length) {
      box.innerHTML = `<p class="ex-small" data-copy="emptyRank">${gameText('emptyRank')}</p>`;
      return;
    }
    const medal = ['🥇', '🥈', '🥉'];
    const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    box.innerHTML = `<table class="ex-board">
      <thead><tr>${['rank', 'nameStat', 'score', 'result'].map(key => `<th data-copy="${key}">${gameText(key)}</th>`).join('')}</tr></thead>
      <tbody>${list.map((e, i) => `<tr class="${e.id === highlightId ? 'me' : ''}">
        <td>${medal[i] || i + 1}</td><td>${esc(e.name)}</td><td>${e.score}</td>
        <td class="${e.clear ? 'clear' : 'over'}" data-copy="${e.clear ? 'cleared' : 'finished'}">${gameText(e.clear ? 'cleared' : 'finished')}</td></tr>`).join('')}</tbody>
    </table>`;
  },

  open() {
    this.render($('#m-board'));
    const button = $('#board-clear');
    button.dataset.copy = 'clearRanks';
    GameLanguage.refreshNode(button);
    $('#ex-board-modal').hidden = false;
  },
};

// ===== 按鈕綁定 =====
window.addEventListener('DOMContentLoaded', () => {
  const soundButton = $('#sound-btn');
  try { Sfx.enabled = localStorage.getItem('scamcheck-block-parkour-sound') !== 'off'; } catch (_) { /* 儲存停用時仍可切換音效。 */ }
  const updateSound = () => {
    soundButton.textContent = Sfx.enabled ? '🔊' : '🔇';
    soundButton.dataset.copyTitle = soundButton.dataset.copyLabel = Sfx.enabled ? 'mute' : 'unmute';
    GameLanguage.refreshNode(soundButton);
    soundButton.setAttribute('aria-pressed', String(Sfx.enabled));
    if (Sfx.output) Sfx.output.gain.value = Sfx.enabled ? 1 : 0;
  };
  soundButton.onclick = () => {
    Sfx.enabled = !Sfx.enabled;
    updateSound();
    try { localStorage.setItem('scamcheck-block-parkour-sound', Sfx.enabled ? 'on' : 'off'); } catch (_) { /* 儲存停用時仍可切換音效。 */ }
  };
  updateSound();
  Intro.start();

  document.querySelectorAll('[data-control]').forEach(button => {
    button.addEventListener('pointerdown', event => {
      event.preventDefault();
      if (!Run.running || Run.paused) return;
      try { button.setPointerCapture(event.pointerId); } catch (_) { /* 觸點已取消時略過捕捉。 */ }
      pointerControls.set(event.pointerId, button.dataset.control);
      syncControls();
    });
    const release = event => {
      pointerControls.delete(event.pointerId);
      syncControls();
    };
    button.addEventListener('pointerup', release);
    button.addEventListener('pointercancel', release);
    button.addEventListener('lostpointercapture', release);
    // 跑跳已由指標事件處理，避免 iOS 把操作鍵上的快速連點解讀為放大。
    button.addEventListener('touchend', event => {
      if (event.cancelable) event.preventDefault();
    }, { passive: false });
    button.addEventListener('contextmenu', event => event.preventDefault());
  });
  $('#pause-btn').onclick = pauseGame;
  $('#quiz-retry').onclick = () => Quiz.ask();
  $('#quiz-continue').onclick = () => Quiz.resume();
  $('#quiz-skip').onclick = () => Quiz.resume();
  $('#ex-quiz').addEventListener('keydown', event => {
    if (event.key !== 'Tab') return;
    const buttons = [...$('#ex-quiz').querySelectorAll('button')].filter(button => !button.hidden && !button.disabled);
    if (!buttons.length) return;
    if (event.shiftKey && document.activeElement === buttons[0]) { event.preventDefault(); buttons.at(-1).focus(); }
    if (!event.shiftKey && document.activeElement === buttons.at(-1)) { event.preventDefault(); buttons[0].focus(); }
  });
  $('#resume-btn').onclick = () => {
    clearControls();
    $('#ex-pause').hidden = true;
    if (Run.paused === 'manual') Run.paused = false;
  };

  const startGame = () => {
    const name = $('#ex-name').value.trim();
    if (!name) {
      toast('noName');
      $('#ex-name').focus();
      return;
    }
    Run.start(name);
  };
  $('#ex-start').onclick = startGame;
  $('#ex-name').addEventListener('keydown', e => { if (e.key === 'Enter') startGame(); });

  $('#r-retry').onclick = () => Run.start(Run.name);
  $('#rank-btn').onclick = () => {
    clearControls();
    if (Run.running && !Run.paused) Run.paused = 'board';
    ExBoard.open();
  };
  $('#board-close').onclick = () => {
    $('#ex-board-modal').hidden = true;
    clearControls();
    if (Run.paused === 'board') Run.paused = false;
  };
  // 清除要按兩次確認
  $('#board-clear').onclick = e => {
    const btn = e.currentTarget;
    if (btn.dataset.copy !== 'confirmClear') {
      btn.dataset.copy = 'confirmClear';
      GameLanguage.refreshNode(btn);
      return;
    }
    try { localStorage.removeItem(ExBoard.KEY); } catch (err) { /* 無法存取就略過 */ }
    ExBoard.open();
    toast('clearedBoard');
  };
  $('#r-new').onclick = () => {
    $('#ex-result').hidden = true;
    $('#ex-origin main').hidden = false;
    document.body.classList.remove('playing');
    $('#ex-name').value = '';
    $('#ex-name').focus();
  };
});
