// scripts/ui/infoPanelMode.js
(function () {
  const DESKTOP_BP = 1024; // px
  let mode = null; // 'side' | 'sheet'
  let panelEl;

  function isDesktop(){ return window.innerWidth >= DESKTOP_BP; }

  function mapInvalidate(){
    const map = window.appState?.map || window.map;
    if (map && map.invalidateSize) {
      // изчакай layout-а да се стабилизира
      setTimeout(() => map.invalidateSize(true), 60);
    }
  }

  // --- Активиране на SIDE режим (desktop)
  function enableSide(){
    if (mode === 'side') return;
    panelEl.classList.add('info-panel--side');
    panelEl.classList.remove('spark-sheet');
    panelEl.style.height = '';           // махни sheet-височини, ако има
    panelEl.removeAttribute('data-level');

    // ако bottomSheet има destroy – извикай го; иначе просто блокирай дръжката
    try { window.bottomSheet?.destroy?.(); } catch(_) {}
    const handle = panelEl.querySelector('.spark-sheet-handle');
    if (handle) handle.style.pointerEvents = 'none';

    mode = 'side';
    window.dispatchEvent(new CustomEvent('infoPanel:mode-change', { detail: { mode } }));
    mapInvalidate();
  }

  // --- Активиране на SHEET режим (mobile/tablet)
  function enableSheet(){
    if (mode === 'sheet') return;
    panelEl.classList.remove('info-panel--side');
    panelEl.classList.add('spark-sheet');

    const handle = panelEl.querySelector('.spark-sheet-handle');
    if (handle) handle.style.pointerEvents = ''; // отново позволи drag

    // инициализирай/рестартирай bottom sheet
    try { window.bottomSheet?.initBottomSheet?.(panelEl); } catch(_) {}

    mode = 'sheet';
    window.dispatchEvent(new CustomEvent('infoPanel:mode-change', { detail: { mode } }));
    mapInvalidate();
  }

  function applyInfoPanelMode(){
    panelEl = panelEl || document.getElementById('info-panel');
    if (!panelEl) return;

    if (isDesktop()) enableSide();
    else enableSheet();
  }

  // debounce за resize
  let rAF = null;
  function onResize(){
    if (rAF) cancelAnimationFrame(rAF);
    rAF = requestAnimationFrame(applyInfoPanelMode);
  }

  // Публичен API
  window.infoPanelMode = {
    applyInfoPanelMode,
    currentMode: () => mode
  };

  window.addEventListener('DOMContentLoaded', applyInfoPanelMode);
  window.addEventListener('resize', onResize);
})();
