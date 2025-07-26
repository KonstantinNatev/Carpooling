window.initMap = function () {
    const map = L.map("map").setView([42.6977, 23.3219], 13);
  
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap contributors",
    }).addTo(map);
  
    // Съхрани референция в appState
    window.appState.map = map;
  
    // Добави слой за подчертаване на спирки
    window.appState.highlightedStopLayerGroup = L.layerGroup().addTo(map);

    return map;
  };
  