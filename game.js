// Bug Hunt easter egg: green gun-reticle cursor + 12 huntable ladybugs entering from below.
// Desktop-only (needs a real mouse), skipped for touch devices and reduced-motion users.
// Toggleable via the pill switch injected into the top-right corner.
(function () {
  if (!window.matchMedia('(pointer: fine)').matches) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const BUG_COUNT = 12;
  const HIT_RADIUS = 20;

  let gameOn = false;
  let bugs = [];
  let killCount = 0;
  let rafId = null;
  let cursor = null;

  // ---------- Cute ladybug ----------
  const bugSvg = `
    <svg width="28" height="20" viewBox="0 0 28 20" fill="none">
      <g class="bug-legs">
        <path d="M9 6 Q3 3 -1 1" stroke="#1B1B1B" stroke-width="1.5" stroke-linecap="round" fill="none"/>
        <path d="M8 10 Q1 10 -3 10" stroke="#1B1B1B" stroke-width="1.5" stroke-linecap="round" fill="none"/>
        <path d="M9 14 Q3 17 -1 19" stroke="#1B1B1B" stroke-width="1.5" stroke-linecap="round" fill="none"/>
        <path d="M19 6 Q25 3 29 1" stroke="#1B1B1B" stroke-width="1.5" stroke-linecap="round" fill="none"/>
        <path d="M20 10 Q27 10 31 10" stroke="#1B1B1B" stroke-width="1.5" stroke-linecap="round" fill="none"/>
        <path d="M19 14 Q25 17 29 19" stroke="#1B1B1B" stroke-width="1.5" stroke-linecap="round" fill="none"/>
      </g>
      <ellipse cx="14" cy="11" rx="9" ry="7" fill="#E63946"/>
      <path d="M14 4.5 L14 17.5" stroke="#1B1B1B" stroke-width="1"/>
      <circle cx="9.5" cy="7.5" r="1.4" fill="#1B1B1B"/>
      <circle cx="8" cy="12.5" r="1.6" fill="#1B1B1B"/>
      <circle cx="11" cy="15.5" r="1.2" fill="#1B1B1B"/>
      <circle cx="18.5" cy="7.5" r="1.4" fill="#1B1B1B"/>
      <circle cx="20" cy="12.5" r="1.6" fill="#1B1B1B"/>
      <circle cx="17" cy="15.5" r="1.2" fill="#1B1B1B"/>
      <ellipse cx="11" cy="9" rx="2.4" ry="1.6" fill="#FFFFFF" opacity="0.35"/>
      <circle cx="14" cy="4" r="3.4" fill="#1B1B1B"/>
      <circle cx="12.6" cy="3.2" r="0.85" fill="#FFFFFF"/>
      <circle cx="12.6" cy="3.2" r="0.4" fill="#1B1B1B"/>
      <circle cx="15.4" cy="3.2" r="0.85" fill="#FFFFFF"/>
      <circle cx="15.4" cy="3.2" r="0.4" fill="#1B1B1B"/>
      <path d="M12 1.5 Q10 -1 8.5 -1.8" stroke="#1B1B1B" stroke-width="0.9" stroke-linecap="round" fill="none"/>
      <path d="M16 1.5 Q18 -1 19.5 -1.8" stroke="#1B1B1B" stroke-width="0.9" stroke-linecap="round" fill="none"/>
    </svg>`;

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
  function onMouseMove(e) {
    if (!cursor) return;
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
      angle: -Math.PI / 2 + (Math.random() - 0.5) * 0.7, // mostly upward, climbing into view
      speed: 0.4 + Math.random() * 0.5,
      alive: true,
      settled: false,
    };
    bugs.push(bug);

    el.addEventListener('mouseenter', () => { if (bug.alive && cursor) cursor.classList.add('is-hovering'); });
    el.addEventListener('mouseleave', () => { if (cursor) cursor.classList.remove('is-hovering'); });
  }

  function showClearedMessage() {
    const msg = document.createElement('div');
    msg.className = 'bugs-cleared-toast';
    msg.textContent = "🎯 Pest control complete. The tiles are safe again.";
    document.body.appendChild(msg);
    setTimeout(() => { msg.style.opacity = '0'; setTimeout(() => msg.remove(), 600); }, 3500);
  }

  function killBug(bug) {
    if (!bug.alive) return;
    bug.alive = false;
    killCount++;
    playGunshot();

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

  function onClick(e) {
    if (e.target.closest('a, button, .btn, .work-card, .bug-toggle, .nav')) return;
    let hit = false;
    for (const bug of bugs) {
      if (!bug.alive) continue;
      const dx = e.clientX - bug.x;
      const dy = e.clientY - bug.y;
      if (Math.sqrt(dx * dx + dy * dy) < HIT_RADIUS) { killBug(bug); hit = true; break; }
    }
    if (!hit) { playGunshot(); showMuzzleFlash(e.clientX, e.clientY); }
    if (cursor) {
      cursor.classList.add('is-firing');
      setTimeout(() => cursor && cursor.classList.remove('is-firing'), 100);
    }
  }

  function tick() {
    for (const bug of bugs) {
      if (!bug.alive) continue;

      // Once a bug has climbed into the visible area, switch to normal wandering behavior.
      if (!bug.settled && bug.y < window.innerHeight - 60 - Math.random() * 200) {
        bug.settled = true;
        bug.angle = Math.random() * Math.PI * 2;
      }
      if (Math.random() < 0.02) bug.angle += (Math.random() - 0.5) * 1.0;

      bug.x += Math.cos(bug.angle) * bug.speed;
      bug.y += Math.sin(bug.angle) * bug.speed;

      if (bug.x < 10) { bug.x = 10; bug.angle = Math.PI - bug.angle; }
      if (bug.x > window.innerWidth - 10) { bug.x = window.innerWidth - 10; bug.angle = Math.PI - bug.angle; }
      if (bug.settled) {
        if (bug.y < 10) { bug.y = 10; bug.angle = -bug.angle; }
        if (bug.y > window.innerHeight - 10) { bug.y = window.innerHeight - 10; bug.angle = -bug.angle; }
      }

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

    createCursor();
    const slots = shuffledSlots();
    slots.forEach((x) => spawnBug(x));
    document.addEventListener('click', onClick);
    rafId = requestAnimationFrame(tick);
  }
  function stopGame() {
    destroyCursor();
    document.removeEventListener('click', onClick);
    if (rafId) cancelAnimationFrame(rafId);
    bugs.forEach((b) => b.el.remove());
    bugs = [];
    document.querySelectorAll('.blood-splat').forEach((el) => el.remove());
  }

  // ---------- Toggle switch (top right) ----------
  function buildToggle() {
    const wrap = document.createElement('div');
    wrap.className = 'bug-toggle';
    wrap.title = 'Warning: contains mildly violent cartoon ladybugs';
    wrap.innerHTML = `
      <span class="bug-toggle-label">🐞 Bug Hunt</span>
      <button class="bug-toggle-switch" aria-pressed="false"><span class="knob"></span></button>
    `;
    document.body.appendChild(wrap);
    const btn = wrap.querySelector('.bug-toggle-switch');
    btn.addEventListener('click', () => {
      gameOn = !gameOn;
      btn.setAttribute('aria-pressed', String(gameOn));
      wrap.classList.toggle('is-off', !gameOn);
      if (gameOn) startGame(); else stopGame();
    });

    const hint = document.createElement('div');
    hint.className = 'bug-toggle-hint';
    hint.innerHTML = `
      <svg width="80" height="70" viewBox="0 0 80 70" fill="none">
        <path d="M6 62 C 22 48, 34 22, 64 8" stroke="#2E6F40" stroke-width="2.2" stroke-linecap="round" fill="none"/>
        <path d="M64 8 L52 10 M64 8 L60 19" stroke="#2E6F40" stroke-width="2.2" stroke-linecap="round"/>
      </svg>
      <span>Switch off the game from here</span>
    `;
    document.body.appendChild(hint);
  }

  buildToggle();
  // Start OFF by default? No — matches the earlier "cursor active as soon as mouse enters" request.
  gameOn = true;
  document.querySelector('.bug-toggle-switch').setAttribute('aria-pressed', 'true');
  startGame();
})();
