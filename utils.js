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
  if (window.highlightedRoute) window.map.removeLayer(window.highlightedRoute);
  if (window.startMarker) window.map.removeLayer(window.startMarker);
  if (window.endMarker) window.map.removeLayer(window.endMarker);
  window.highlightedRoute = window.startMarker = window.endMarker = null;
  window.selectedRouteLabel = "";
  window.updateDynamicLegend([]);

  if (Array.isArray(window.allStopMarkers)) {
    window.allStopMarkers.forEach((m) =>
      m.setStyle({
        color: "#343a40",
        weight: window.debugSettings.pointSize,
      })
    );
  }
};

window.updateDynamicLegend = (routeColorPairs) => {
  const legendRoutes = document.getElementById("legend-routes");
  if (!legendRoutes) return;
  const selected = window.selectedRouteLabel
    ? `<div style="margin-bottom:4px;"><strong style="color:#004aad;">✅ ${window.selectedRouteLabel}</strong></div>`
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
