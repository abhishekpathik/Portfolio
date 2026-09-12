// Bug Hunt easter egg: green gun-reticle cursor + 12 huntable ladybugs entering from below.
// Desktop-only (needs a real mouse), skipped for touch devices and reduced-motion users.
// Toggleable via the pill switch injected into the top-right corner.
(function () {
  if (!window.matchMedia('(pointer: fine)').matches) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const BUG_COUNT = 12;
  const HIT_RADIUS = 32;
  const FLEE_RADIUS = 25;

  let gameOn = false;
  let bugs = [];
  let killCount = 0;
  let rafId = null;
  let cursor = null;
  let mouseX = -999;
  let mouseY = -999;
  let ammoLeft = 0;
  let roundWon = false;
  let animInterval = null;
  let idleTimeout = null;
  let bubbleTimeout = null;
  const MAX_AMMO = 40;

  // ---------- Cute ladybug ----------
  const bugSvg = `<img src="assets/ladybug-sprite.png" width="28" height="30" alt="" style="display:block;">`;


  const bloodSvg = `
    <svg width="46" height="46" viewBox="0 0 46 46" fill="none">
      <path d="M23 4 C27 10 33 12 36 17 C40 23 37 31 29 34 C22 37 12 35 8 28 C4 21 8 12 15 8 C18 6.2 20.5 5 23 4Z" fill="#A32C21"/>
      <circle cx="10" cy="30" r="3.5" fill="#A32C21"/>
      <circle cx="35" cy="10" r="2.5" fill="#A32C21"/>
      <circle cx="38" cy="24" r="2" fill="#A32C21"/>
    </svg>`;

  // ---------- Sound ----------
  let audioCtx = null;
  function playGunshot() {
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      const dur = 0.15;
      const bufferSize = Math.floor(audioCtx.sampleRate * dur);
      const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 2);
      }
      const noise = audioCtx.createBufferSource();
      noise.buffer = buffer;
      const filter = audioCtx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 1400;
      const gain = audioCtx.createGain();
      gain.gain.setValueAtTime(0.5, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + dur);
      noise.connect(filter).connect(gain).connect(audioCtx.destination);
      noise.start();
      noise.stop(audioCtx.currentTime + dur);
    } catch (e) { /* fail silently */ }
  }

  // ---------- Cursor ----------
  function createCursor() {
    cursor = document.createElement('div');
    cursor.className = 'custom-cursor';
    cursor.innerHTML = `
      <svg width="42" height="42" viewBox="0 0 42 42" fill="none">
        <circle cx="21" cy="21" r="12" stroke="currentColor" stroke-width="2"/>
        <circle cx="21" cy="21" r="2.2" fill="currentColor"/>
        <line x1="21" y1="0" x2="21" y2="8" stroke="currentColor" stroke-width="2"/>
        <line x1="21" y1="34" x2="21" y2="42" stroke="currentColor" stroke-width="2"/>
        <line x1="0" y1="21" x2="8" y2="21" stroke="currentColor" stroke-width="2"/>
        <line x1="34" y1="21" x2="42" y2="21" stroke="currentColor" stroke-width="2"/>
      </svg>`;
    document.body.appendChild(cursor);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('pointermove', onMouseMove);
    document.addEventListener('mouseover', onMouseMove, { once: true });
    document.addEventListener('mouseleave', onMouseLeave);
  }
  function destroyCursor() {
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('pointermove', onMouseMove);
    document.removeEventListener('mouseleave', onMouseLeave);
    document.documentElement.classList.remove('custom-cursor-active');
    if (cursor) { cursor.remove(); cursor = null; }
    cursorVisible = false;
  }
  let cursorVisible = false;
  let lastAimAngle = null;
  function updateAvatarAim(mx, my) {
    if (roundWon) return;
    const wrap = document.querySelector('.avatar-wrap');
    const avatar = document.getElementById('hero-avatar');
    if (!wrap || !avatar) return;
    const rect = wrap.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height * 0.4; // roughly gun height, not full box center
    const dx = mx - cx;
    const dy = my - cy;
    // Convention: 0° = UP, 90° = RIGHT, 180° = DOWN, 270° = LEFT (clockwise from up).
    let deg = Math.atan2(dx, -dy) * (180 / Math.PI);
    if (deg < 0) deg += 360;
    const snapped = (Math.round(deg / 15) % 24) * 15;
    if (snapped === lastAimAngle) return; // avoid redundant image swaps on tiny mouse jitter
    lastAimAngle = snapped;
    avatar.src = `assets/aim-${String(snapped).padStart(3, '0')}.png`;
  }

  function onMouseMove(e) {
    if (!cursor) return;
    mouseX = e.clientX;
    mouseY = e.clientY;
    cursor.style.left = e.clientX + 'px';
    cursor.style.top = e.clientY + 'px';

    const overNav = !!e.target.closest('.nav, .bug-toggle');
    if (overNav) {
      cursor.classList.remove('is-visible');
      cursorVisible = false;
      return;
    }

    if (!cursorVisible) {
      cursorVisible = true;
      cursor.classList.add('is-visible');
      document.documentElement.classList.add('custom-cursor-active');
    }
  }
  function onMouseLeave() {
    cursorVisible = false;
    if (cursor) cursor.classList.remove('is-visible');
    document.documentElement.classList.remove('custom-cursor-active');
  }

  // ---------- Bugs: spawn evenly distributed, entering from the bottom ----------
  function shuffledSlots() {
    const w = window.innerWidth;
    const slotWidth = w / BUG_COUNT;
    const slots = [];
    for (let i = 0; i < BUG_COUNT; i++) slots.push(i);
    // Fisher-Yates shuffle — different origin order every time the game resets
    for (let i = slots.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [slots[i], slots[j]] = [slots[j], slots[i]];
    }
    return slots.map((slotIndex) => slotIndex * slotWidth + slotWidth * (0.2 + Math.random() * 0.6));
  }

  function spawnBug(startX) {
    const el = document.createElement('div');
    el.className = 'bug';
    const inner = document.createElement('div');
    inner.className = 'bug-inner';
    const body = document.createElement('div');
    body.className = 'bug-body';
    body.innerHTML = bugSvg;
    inner.appendChild(body);
    el.appendChild(inner);
    document.body.appendChild(el);

    const bug = {
      el, inner,
      x: startX,
      y: window.innerHeight + 20,
      targetY: 60 + Math.random() * (window.innerHeight - 120), // spread evenly across full height
      angle: -Math.PI / 2 + (Math.random() - 0.5) * 0.5, // climb mostly straight up
      speed: (0.4 + Math.random() * 0.5) * 1.12, // +12% difficulty bump
      alive: true,
      settled: false,
    };
    bugs.push(bug);

    el.addEventListener('mouseenter', () => { if (bug.alive && cursor) cursor.classList.add('is-hovering'); });
    el.addEventListener('mouseleave', () => { if (cursor) cursor.classList.remove('is-hovering'); });
  }

  function clearAnimTimers() {
    if (animInterval) { clearInterval(animInterval); animInterval = null; }
    if (idleTimeout) { clearTimeout(idleTimeout); idleTimeout = null; }
  }

  function setAvatarExpression(name) {
    clearAnimTimers();
    const avatar = document.getElementById('hero-avatar');
    if (avatar) avatar.src = `assets/avatar-${name}.png`;
  }

  function showAvatarBubble(text, duration) {
    const wrap = document.querySelector('.avatar-wrap');
    if (!wrap) return;
    let bubble = document.getElementById('avatar-bubble');
    if (!bubble) {
      bubble = document.createElement('div');
      bubble.id = 'avatar-bubble';
      bubble.className = 'avatar-bubble';
      wrap.appendChild(bubble);
    }
    bubble.textContent = text;
    // force reflow so re-triggering the animation works even if already visible
    void bubble.offsetWidth;
    bubble.classList.add('is-visible');
    if (bubbleTimeout) clearTimeout(bubbleTimeout);
    if (duration) {
      bubbleTimeout = setTimeout(() => bubble.classList.remove('is-visible'), duration);
    }
  }

  function hideAvatarBubble() {
    if (bubbleTimeout) { clearTimeout(bubbleTimeout); bubbleTimeout = null; }
    const bubble = document.getElementById('avatar-bubble');
    if (bubble) bubble.classList.remove('is-visible');
  }

  function playExpressionAnimation(prefix, frameCount, frameDuration, onComplete) {
    clearAnimTimers();
    const avatar = document.getElementById('hero-avatar');
    if (!avatar) { if (onComplete) onComplete(); return; }
    const durations = Array.isArray(frameDuration)
      ? frameDuration
      : new Array(frameCount).fill(frameDuration);
    let i = 1;
    avatar.src = `assets/${prefix}-01.png`;
    function step() {
      idleTimeout = setTimeout(() => {
        i++;
        if (i > frameCount) {
          if (onComplete) onComplete();
          return;
        }
        avatar.src = `assets/${prefix}-${String(i).padStart(2, '0')}.png`;
        step();
      }, durations[i - 1] || 80);
    }
    step();
  }

  // Real per-frame timing extracted from the source animation, for authentic playback.
  const ANGER_DURATIONS = [380,70,70,70,70,70,70,80,80,80,80,80,80,70,50,50,50,50,50,50,50,50,50,50,40,40,60,60,60,60,60,60,60,60,60,60,220,110,110,110,110,110,110,110,110,420,180,280];
  const ANGER_FRAME_COUNT = 48;
  const THUMBSUP_DURATIONS = [600,110,140,160,70,90,90,420,130,90,500,120,110,400];
  const THUMBSUP_FRAME_COUNT = 14;

  // Persistent header animation: a looping "please help me" nudge toward the game,
  // running whenever nothing more important (a kill, out-of-ammo, victory) is happening.
  function startIdleAngerLoop() {
    clearAnimTimers();
    function cycle() {
      showAvatarBubble("I hate bugs on website");
      idleTimeout = setTimeout(() => {
        showAvatarBubble("Help me get rid of them");
        idleTimeout = setTimeout(cycle, 5000);
      }, 5000);
    }
    cycle();
  }

  const VICTORY_MESSAGES = [
    "The UI is finally bug-free!",
    "Wow, you're really good at this!",
    "Looks like you hate bugs too.",
  ];
  let victoryMsgIndex = 0;

  function startVictoryLoop() {
    clearAnimTimers();
    function cycle() {
      showAvatarBubble(VICTORY_MESSAGES[victoryMsgIndex % VICTORY_MESSAGES.length]);
      victoryMsgIndex++;
      playExpressionAnimation('thumbsup', THUMBSUP_FRAME_COUNT, THUMBSUP_DURATIONS, () => {
        idleTimeout = setTimeout(cycle, 3500);
      });
    }
    cycle();
  }

  function stopIdleLoop() {
    clearAnimTimers();
    hideAvatarBubble();
  }

  const INTRO_MESSAGES = [
    "Hi, I'm Abhishek.",
    "Does your product need some design love?",
    "I'd love to help you fix that.",
  ];
  let introMsgIndex = 0;

  function startIntroLoop() {
    clearAnimTimers();
    introMsgIndex = 0;
    function cycle() {
      showAvatarBubble(INTRO_MESSAGES[introMsgIndex % INTRO_MESSAGES.length]);
      introMsgIndex++;
      idleTimeout = setTimeout(cycle, 3500);
    }
    cycle();
  }

  function showClearedMessage() {
    const msg = document.createElement('div');
    msg.className = 'bugs-cleared-toast';
    msg.textContent = "🎯 Pest control complete. The tiles are safe again.";
    document.body.appendChild(msg);
    setTimeout(() => { msg.style.opacity = '0'; setTimeout(() => msg.remove(), 600); }, 3500);
    roundWon = true;
    startVictoryLoop();
  }

  function killBug(bug) {
    if (!bug.alive) return;
    bug.alive = false;
    killCount++;
    playGunshot();
    updateStatsPanel();

    // Splat stays for the rest of this round — a little trail of "achievements".
    const splat = document.createElement('div');
    splat.className = 'blood-splat';
    splat.innerHTML = bloodSvg;
    splat.style.left = bug.x + 'px';
    splat.style.top = bug.y + 'px';
    document.body.appendChild(splat);

    bug.el.classList.add('is-dead');
    if (cursor) cursor.classList.remove('is-hovering');

    setTimeout(() => {
      bug.el.remove();
      const idx = bugs.indexOf(bug);
      if (idx > -1) bugs.splice(idx, 1);
      if (killCount >= BUG_COUNT) showClearedMessage();
    }, 900);
  }

  function showMuzzleFlash(x, y) {
    const flash = document.createElement('div');
    flash.className = 'muzzle-flash';
    flash.style.left = x + 'px';
    flash.style.top = y + 'px';
    document.body.appendChild(flash);
    setTimeout(() => flash.remove(), 250);
  }

  // Out of ammo: just a plain notice. No special animation — the default angry idle
  // loop keeps running in the background exactly as always. Only a manual toggle
  // off/on restarts the round with fresh ammo.
  function showOutOfAmmoMessage() {
    const msg = document.createElement('div');
    msg.className = 'bugs-cleared-toast';
    msg.textContent = "🔫 Out of ammo! Toggle off and on to reload.";
    document.body.appendChild(msg);
    setTimeout(() => { msg.style.opacity = '0'; setTimeout(() => msg.remove(), 600); }, 3000);
  }

  function triggerAvatarMuzzle() {
    const muzzle = document.getElementById('avatar-muzzle');
    if (!muzzle) return;
    muzzle.classList.remove('is-firing');
    void muzzle.offsetWidth; // force reflow so rapid clicks can re-trigger
    muzzle.classList.add('is-firing');
  }

  function onClick(e) {
    if (e.target.closest('a, button, .btn, .work-card, .bug-toggle, .nav')) return;
    if (roundWon) return;
    if (ammoLeft <= 0) { showOutOfAmmoMessage(); return; }

    ammoLeft--;
    updateStatsPanel();
    triggerAvatarMuzzle();

    let hit = false;
    for (const bug of bugs) {
      if (!bug.alive) continue;
      const dx = e.clientX - bug.x;
      const dy = e.clientY - bug.y;
      if (Math.sqrt(dx * dx + dy * dy) < HIT_RADIUS) { killBug(bug); hit = true; break; }
    }
    if (!hit) {
      playGunshot();
      showMuzzleFlash(e.clientX, e.clientY);
    }
    if (ammoLeft === 0 && killCount < BUG_COUNT) showOutOfAmmoMessage();
    if (cursor) {
      cursor.classList.add('is-firing');
      setTimeout(() => cursor && cursor.classList.remove('is-firing'), 100);
    }
  }

  function tick() {
    updateAvatarAim(mouseX, mouseY);

    // The fewer bugs left alive, the faster and more frantic the survivors get.
    const speedRamp = 1 + (BUG_COUNT - bugs.length) * 0.0112; // +12% difficulty bump

    for (const bug of bugs) {
      if (!bug.alive) continue;

      // Climb straight up toward this bug's assigned resting height, then settle into normal wandering.
      if (!bug.settled && bug.y <= bug.targetY) {
        bug.settled = true;
        bug.angle = Math.random() * Math.PI * 2;
      }

      let currentSpeed = bug.speed * speedRamp;
      let fleeing = false;

      if (bug.settled) {
        const dx = bug.x - mouseX;
        const dy = bug.y - mouseY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < FLEE_RADIUS) {
          // Turn to run directly away from the cursor, with a burst of extra speed.
          bug.angle = Math.atan2(dy, dx);
          currentSpeed *= 1.05;
          fleeing = true;
        } else if (Math.random() < 0.02) {
          bug.angle += (Math.random() - 0.5) * 1.0;
        }
      }

      bug.x += Math.cos(bug.angle) * currentSpeed;
      bug.y += Math.sin(bug.angle) * currentSpeed;

      if (bug.x < 10) { bug.x = 10; bug.angle = Math.PI - bug.angle; }
      if (bug.x > window.innerWidth - 10) { bug.x = window.innerWidth - 10; bug.angle = Math.PI - bug.angle; }
      if (bug.settled) {
        if (bug.y < 10) { bug.y = 10; bug.angle = -bug.angle; }
        if (bug.y > window.innerHeight - 10) { bug.y = window.innerHeight - 10; bug.angle = -bug.angle; }
      }

      bug.el.classList.toggle('is-fleeing', fleeing);
      bug.el.style.transform = `translate(${bug.x}px, ${bug.y}px)`;
      bug.inner.style.transform = `rotate(${(bug.angle * 180) / Math.PI + 90}deg)`;
    }
    rafId = requestAnimationFrame(tick);
  }

  // ---------- Start / stop (every "on" is a full reset) ----------
  function startGame() {
    // Wipe any leftover splats from the previous round — fresh start every toggle-on.
    document.querySelectorAll('.blood-splat').forEach((el) => el.remove());
    killCount = 0;
    ammoLeft = MAX_AMMO;
    roundWon = false;
    victoryMsgIndex = 0;
    lastAimAngle = null;

    createCursor();
    const slots = shuffledSlots();
    slots.forEach((x) => spawnBug(x));
    document.addEventListener('click', onClick);
    rafId = requestAnimationFrame(tick);
    updateStatsPanel();
    startIdleAngerLoop();
  }
  function stopGame() {
    destroyCursor();
    document.removeEventListener('click', onClick);
    if (rafId) cancelAnimationFrame(rafId);
    bugs.forEach((b) => b.el.remove());
    bugs = [];
    document.querySelectorAll('.blood-splat').forEach((el) => el.remove());
    updateStatsPanel();
    stopIdleLoop();
    setAvatarExpression('neutral');
    startIntroLoop();
  }

  function preloadAllFrames() {
    const paths = ['avatar-neutral', 'avatar-determined', 'avatar-celebration', 'avatar-facepalm', 'avatar-thumbsup']
      .map((n) => `assets/${n}.png`);
    for (let i = 1; i <= ANGER_FRAME_COUNT; i++) paths.push(`assets/anger-${String(i).padStart(2, '0')}.png`);
    for (let i = 1; i <= THUMBSUP_FRAME_COUNT; i++) paths.push(`assets/thumbsup-${String(i).padStart(2, '0')}.png`);
    for (let a = 0; a < 360; a += 15) paths.push(`assets/aim-${String(a).padStart(3, '0')}.png`);
    paths.forEach((src) => { const img = new Image(); img.src = src; });
  }

  // ---------- Toggle switch (top right) ----------
  const STORAGE_KEY = 'bugHuntOn';
  function loadSavedPreference() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved === null ? true : saved === '1'; // default ON for first-ever visit
    } catch (e) {
      return true; // localStorage unavailable (privacy mode, etc.) — just default ON
    }
  }
  function savePreference(on) {
    try { localStorage.setItem(STORAGE_KEY, on ? '1' : '0'); } catch (e) { /* ignore */ }
  }

  function toggleGame() {
    gameOn = !gameOn;
    const wrap = document.getElementById('bug-toggle-panel');
    const btn = document.querySelector('.bug-toggle-switch');
    const heroBtn = document.getElementById('hero-game-toggle');
    if (btn) btn.setAttribute('aria-pressed', String(gameOn));
    if (wrap) wrap.classList.toggle('is-off', !gameOn);
    if (heroBtn) heroBtn.textContent = gameOn ? 'Kill the game' : 'Start the game';
    savePreference(gameOn);
    if (gameOn) startGame(); else stopGame();
    updateStatsPanel();
  }

  function updateStatsPanel() {
    const stats = document.getElementById('bug-toggle-stats');
    const bugsEl = document.getElementById('bugs-left-count');
    const ammoEl = document.getElementById('ammo-left-count');
    if (!stats) return;
    if (!gameOn) {
      stats.style.display = 'none';
      return;
    }
    stats.style.display = '';
    if (bugsEl) bugsEl.textContent = Math.max(0, BUG_COUNT - killCount);
    if (ammoEl) ammoEl.textContent = Math.max(0, ammoLeft);
  }

  function buildToggle(initialOn) {
    const wrap = document.createElement('div');
    wrap.id = 'bug-toggle-panel';
    wrap.className = 'bug-toggle' + (initialOn ? '' : ' is-off');
    wrap.title = 'Warning: contains mildly violent cartoon ladybugs';
    wrap.innerHTML = `
      <div class="bug-toggle-header">
        <span class="bug-toggle-label">🐞 Bug Hunt</span>
        <button class="bug-toggle-switch" aria-pressed="${initialOn}"><span class="knob"></span></button>
      </div>
      <div class="bug-toggle-stats" id="bug-toggle-stats">
        <div class="bug-toggle-stat"><span>Bugs Left</span><span id="bugs-left-count">${BUG_COUNT}</span></div>
        <div class="bug-toggle-stat"><span>Ammo Left</span><span id="ammo-left-count">${MAX_AMMO}</span></div>
      </div>
    `;
    document.body.appendChild(wrap);
    wrap.querySelector('.bug-toggle-switch').addEventListener('click', toggleGame);

    const heroBtn = document.getElementById('hero-game-toggle');
    if (heroBtn) {
      heroBtn.textContent = initialOn ? 'Kill the game' : 'Start the game';
      heroBtn.addEventListener('click', toggleGame);
    }
  }

  // Respect whatever the user last chose, on any page — instead of always defaulting back to ON.
  preloadAllFrames();
  gameOn = loadSavedPreference();
  buildToggle(gameOn);
  if (gameOn) {
    startGame();
  } else {
    const avatar = document.getElementById('hero-avatar');
    if (avatar) avatar.src = 'assets/avatar-neutral.png';
    updateStatsPanel();
    startIntroLoop();
  }
})();
