// scripts/ui/bottomSheet.js
(function () {
  const LEVELS = { peek: 140, half: 0.55, full: 0.9 }; // px | vh ratio
  const SNAP_LOW = 0.30;  // под 30% → peek
  const SNAP_HIGH = 0.75; // над 75% → full

  let _panel, _handle, _level = 'peek', _drag = null;

  function _vhpx(ratio) { return Math.round(window.innerHeight * ratio); }
  function _resolve(h) { return (h <= 1 ? _vhpx(h) : Math.round(h)); }

  function _applyHeight(px, withTransition = true) {
    if (!_panel) return;
    if (!withTransition) _panel.classList.add('dragging'); else _panel.classList.remove('dragging');
    _panel.style.height = px + 'px';
  }

  function _snapToNearest(px) {
    const vh = window.innerHeight;
    const ratio = px / vh;

    if (ratio < SNAP_LOW) return open('peek');
    if (ratio > SNAP_HIGH) return open('full');

    // иначе → half
    return open('half');
  }

  function open(level) {
    if (!_panel) return;
    const vh = window.innerHeight;
    let target;
    if (level === 'peek') target = _resolve(LEVELS.peek);
    else if (level === 'half') target = _resolve(LEVELS.half);
    else target = _resolve(LEVELS.full);

    _applyHeight(target, true);
    _panel.setAttribute('data-level', level);
    _level = level;

    // излъчваме евент
    window.dispatchEvent(new CustomEvent('sheet:change', { detail: { level } }));
  }

  function toggle() {
    if (_level === 'peek') return open('half');
    if (_level === 'half') return open('full');
    return open('peek');
  }

  function currentLevel() { return _level; }

  function _onDown(e) {
    if (!_panel) return;
    const y = ('touches' in e) ? e.touches[0].clientY : e.clientY;
    _drag = {
      startY: y,
      startH: _panel.getBoundingClientRect().height
    };
    _panel.classList.add('dragging');
    e.preventDefault(); // спира скрола докато влачим дръжката
  }

  function _onMove(e) {
    if (!_drag || !_panel) return;
    const y = ('touches' in e) ? e.touches[0].clientY : e.clientY;
    const dy = _drag.startY - y;
    const nextH = Math.max(120, Math.min(_drag.startH + dy, Math.round(window.innerHeight * 0.95)));
    _applyHeight(nextH, false);
  }

  function _onUp() {
    if (!_drag || !_panel) return;
    const h = _panel.getBoundingClientRect().height;
    _drag = null;
    _panel.classList.remove('dragging');
    _snapToNearest(h);
  }

  function initBottomSheet(panelEl) {
    _panel = panelEl || document.getElementById('info-panel');
    if (!_panel) return;

    // клас за стил
    _panel.classList.add('spark-sheet');

    // дръжка (ползваме твоята или слагаме наша)
    _handle = _panel.querySelector('.spark-sheet-handle') || _panel.querySelector('.sheet-handle');
    if (!_handle) {
      _handle = document.createElement('div');
      _handle.className = 'spark-sheet-handle';
      _panel.prepend(_handle);
    }

    // начално ниво
    open('peek');

    // жестове само върху дръжката
    _handle.addEventListener('pointerdown', _onDown, { passive: false });
    window.addEventListener('pointermove', _onMove, { passive: false });
    window.addEventListener('pointerup', _onUp, { passive: true });
    window.addEventListener('touchstart', ()=>{}, { passive:true }); // iOS quirk

    // resize → запази логическо ниво
    window.addEventListener('resize', () => open(_level));
  }

  

  // публичен API
  window.bottomSheet = { initBottomSheet, open, toggle, currentLevel };
})();
