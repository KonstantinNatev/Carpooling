window.initMap = function () {
  const isMobile = window.matchMedia('(max-width: 768px)').matches;
  const map = L.map("map", {
    preferCanvas: true,
    tap: true,
    tapTolerance: isMobile ? 20 : 15,
    zoomControl: true,
    inertia: true,
    maxZoom: 21,
  }).setView([42.6977, 23.3219], 13);

  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors",
  }).addTo(map);

  // Съхрани референция в appState
  window.appState.map = map;

  // Добави слой за подчертаване на спирки
  window.appState.highlightedStopLayerGroup = L.layerGroup().addTo(map);
  window.appState.isMobile = isMobile;

  return map;
};
  