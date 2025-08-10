// scripts/ui/bottomSheet.js
(function () {
  const LEVELS = {
    peek: 200,     // ~120-200px в зависимост от съдържанието
    half: 0.55,    // 55% от височината
    full: 0.9      // 90%
  };

  function px(h) {
    return typeof h === 'number' ? `${h}px` : h;
  }

  function resolveHeight(val, vh) {
    return typeof val === 'number' && val <= 1 ? `${Math.round(val * vh)}px` : px(val);
  }

  function initBottomSheet(panel = document.getElementById('info-panel')) {
    if (!panel) return;
    const handle = panel.querySelector('.sheet-handle');
    if (!handle) return;

    let startY = 0, startH = 0, dragging = false;

    function setLevel(lvl) {
      const vh = window.innerHeight;
      panel.style.height = resolveHeight(LEVELS[lvl], vh);
      panel.classList.toggle('expanded', lvl !== 'peek');
      panel.classList.toggle('collapsed', lvl === 'peek');
    }

    function onDown(e) {
      dragging = true;
      startY = ('touches' in e) ? e.touches[0].clientY : e.clientY;
      startH = panel.getBoundingClientRect().height;
      panel.classList.add('dragging');
      e.preventDefault();
    }

    function onMove(e) {
      if (!dragging) return;
      const y = ('touches' in e) ? e.touches[0].clientY : e.clientY;
      const dy = startY - y;
      const newH = Math.min(Math.round(startH + dy), Math.round(window.innerHeight * 0.95));
      panel.style.height = `${Math.max(120, newH)}px`;
    }

    function onUp() {
      if (!dragging) return;
      dragging = false;
      panel.classList.remove('dragging');
      const h = panel.getBoundingClientRect().height;
      const vh = window.innerHeight;
      const ratio = h / vh;
      if (ratio < 0.3) setLevel('peek');
      else if (ratio < 0.75) setLevel('half');
      else setLevel('full');
    }

    handle.addEventListener('mousedown', onDown);
    handle.addEventListener('touchstart', onDown, { passive: false });
    window.addEventListener('mousemove', onMove, { passive: false });
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchend', onUp);

    // Начално състояние на мобилно
    if (window.innerWidth <= 768) setLevel('peek');
  }

  window.bottomSheet = { initBottomSheet };
})();
