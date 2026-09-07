// Custom green cursor — replaces the default pointer once the mouse enters the page.
// Skipped entirely on touch devices (no fine pointer), so it never interferes with mobile.
(function () {
  if (!window.matchMedia('(pointer: fine)').matches) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const cursor = document.createElement('div');
  cursor.className = 'custom-cursor';
  cursor.innerHTML = `
    <svg width="30" height="30" viewBox="0 0 24 24" fill="none">
      <path d="M4 2 L4 28 L11.2 21.2 L16 30 L20.2 27.8 L15.6 19.2 L24 19.2 Z"
            fill="currentColor" stroke="#FFFFFF" stroke-width="1.4" stroke-linejoin="round" transform="scale(0.78)"/>
    </svg>`;
  document.body.appendChild(cursor);

  let active = false;

  document.addEventListener('mousemove', (e) => {
    cursor.style.left = e.clientX + 'px';
    cursor.style.top = e.clientY + 'px';
    if (!active) {
      active = true;
      cursor.classList.add('is-visible');
      document.documentElement.classList.add('custom-cursor-active');
    }
  });

  document.addEventListener('mouseleave', () => {
    active = false;
    cursor.classList.remove('is-visible');
    document.documentElement.classList.remove('custom-cursor-active');
  });

  // Slightly larger/bolder when hovering anything clickable
  const interactiveSelector = 'a, button, .btn, .work-card, input, textarea';
  document.addEventListener('mouseover', (e) => {
    if (e.target.closest(interactiveSelector)) cursor.classList.add('is-hovering');
  });
  document.addEventListener('mouseout', (e) => {
    if (e.target.closest(interactiveSelector)) cursor.classList.remove('is-hovering');
  });
})();
