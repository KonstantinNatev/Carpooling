window.colorPalette = [
  "#e41a1c",
  "#377eb8",
  "#4daf4a",
  "#984ea3",
  "#ff7f00",
  "#ffff33",
  "#a65628",
  "#f781bf",
  "#999999",
];

window.getRouteColor = function (count) {
  if (count === 1) return "#004aad";
  if (count === 2) return "#28a745";
  if (count === 3) return "#ffc107";
  if (count >= 4) return "#dc3545";
  return "#6c757d";
};

window.blueIcon = new L.Icon({
  iconUrl: "https://maps.google.com/mapfiles/ms/icons/blue-dot.png",
  iconSize: [32, 32],
  iconAnchor: [16, 32],
});

window.redIcon = new L.Icon({
  iconUrl: "https://maps.gstatic.com/mapfiles/ms2/micons/red-dot.png",
  iconSize: [32, 32],
  iconAnchor: [16, 32],
});

window.clearMapHighlights = function () {
  // 🧹 Почисти слоеве от търсене (маршрути)
  if (Array.isArray(window.appState.foundRouteLayers)) {
    window.appState.foundRouteLayers.forEach((layer) => {
      if (!layer) return;
      if (typeof layer.eachLayer === "function") {
        layer.eachLayer((subLayer) => {
          if (window.appState.map.hasLayer(subLayer)) {
            window.appState.map.removeLayer(subLayer);
          }
        });
      }
      if (window.appState.map.hasLayer(layer)) {
        window.appState.map.removeLayer(layer);
      }
    });
    window.appState.foundRouteLayers = [];

    const resultBox = document.getElementById("route-search-result");
    if (resultBox) {
      resultBox.remove();
    }
  }

  // 🧹 Изчистване на активни линии
  if (window.appState.highlightedRoute) {
    if (typeof window.appState.highlightedRoute.eachLayer === "function") {
      window.appState.highlightedRoute.eachLayer((l) => {
        if (window.appState.map.hasLayer(l)) {
          window.appState.map.removeLayer(l);
        }
      });
    }
    if (window.appState.map.hasLayer(window.appState.highlightedRoute)) {
      window.appState.map.removeLayer(window.appState.highlightedRoute);
    }
    window.appState.highlightedRoute = null;
  }

  // 🧹 Изчистване на начална/крайна точка
  if (window.startMarker && window.appState.map.hasLayer(window.startMarker)) {
    window.appState.map.removeLayer(window.startMarker);
  }
  if (window.endMarker && window.appState.map.hasLayer(window.endMarker)) {
    window.appState.map.removeLayer(window.endMarker);
  }

  // 🧹 Изчистване на временни маркери
  if (Array.isArray(window.appState.searchMarkers)) {
    window.appState.searchMarkers.forEach((m) => {
      if (window.appState.map.hasLayer(m)) {
        window.appState.map.removeLayer(m);
      }
    });
    window.appState.searchMarkers = [];
  }

  if (window.appState.highlightedStopLayerGroup) {
    window.appState.highlightedStopLayerGroup.clearLayers(); // (по желание)
  }

  // Върни цвета на временно подчертаните спирки (не ги трий!)
  if (Array.isArray(window.appState.highlightedStopMarkers)) {
    window.appState.highlightedStopMarkers.forEach((m) => {
      if (typeof m.setStyle === "function") {
        m.setStyle({
          color: "#343a40",
          weight: window.appState.debugSettings.pointSize,
          radius: window.appState.debugSettings.pointSize,
        }).bringToBack();

        if (m._originalMarker && !window.stopClusterGroup.hasLayer(m._originalMarker)) {
          window.stopClusterGroup.addLayer(m._originalMarker);
        }
      }
    });
  } 

  // 🧼 Reset state
  window.startMarker = null;
  window.endMarker = null;
  window.appState.selectedRouteLabel = "";
  window.updateDynamicLegend?.([]);
};

window.updateDynamicLegend = (routeColorPairs) => {
  const legendRoutes = document.getElementById("legend-routes");
  if (!legendRoutes) return;
  const selected = window.appState.selectedRouteLabel
    ? `<div style="margin-bottom:4px;"><strong style="color:#004aad;">✅ ${window.appState.selectedRouteLabel}</strong></div>`
    : "";
  const hoverList = routeColorPairs
    .map(
      ([color, label]) => `
      <div>
        <span style="display:inline-block; width:16px; height:10px; background:${color}; margin-right:6px;"></span>
        ${label}
      </div>`
    )
    .join("");
  legendRoutes.innerHTML = selected + hoverList;
};

window.showSchedulePanel = function (encodedHtml) {
  const panel = document.getElementById("schedule-panel");
  const content = document.getElementById("schedule-content");
  if (!panel || !content) return;

  const decodedHtml = decodeURIComponent(encodedHtml);
  content.innerHTML = decodedHtml;
  panel.style.display = "block";
};
