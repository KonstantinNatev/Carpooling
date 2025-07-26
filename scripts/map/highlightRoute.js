window.highlightRoute = function (routeId) {
    const map = window.appState.map;
  
    if (window.appState.selectedRouteLabel === routeId) {
      window.clearMapHighlights();
      window.appState.selectedRouteLabel = "";
  
      // Деактивирай автоматичен избор след клик
      window.appState.skipAutoSelection = true;
      if (window.appState.lastSelectedStop) {
        window.renderStopPanel(window.appState.lastSelectedStop);
      }
      window.appState.skipAutoSelection = false;
  
      return;
    }
  
    window.clearMapHighlights();
  
    const selectedRoute = window.appState.allRoutes.find(
      (r) => r.properties?.["@id"] === routeId
    );
    if (!selectedRoute) return;
  
    const color = selectedRoute.properties.tr_color || window.getRouteColor(1);
  
    // Добави линия на картата
    window.appState.highlightedRoute = L.geoJSON(selectedRoute.geometry, {
      style: {
        color,
        weight: window.appState.debugSettings.highlightWeight,
        opacity: 1,
      },
    }).addTo(map);
  
    // Добави спирките по маршрута
    const routeStopCoords = selectedRoute.properties.segments
      .map((seg) => seg.stop)
      .filter(Boolean)
      .map((stop) => [parseFloat(stop.latitude), parseFloat(stop.longitude)]);
  
    window.appState.highlightedStopMarkers = [];
  
    const matchedMarkers = window.appState.allStopMarkers.filter((marker) => {
      const latlng = marker.getLatLng();
      return routeStopCoords.some(([lat, lng]) =>
        Math.abs(latlng.lat - lat) < 0.0001 && Math.abs(latlng.lng - lng) < 0.0001
      );
    });
  
    matchedMarkers.forEach((marker) => {
      marker.setStyle({
        color: "#28a745",
        weight: window.appState.debugSettings.pointSize + 1,
        radius: window.appState.debugSettings.pointSize + 1,
      });
  
      // Клониране за независим слой
      if (window.stopClusterGroup?.hasLayer(marker)) {
        window.stopClusterGroup.removeLayer(marker);
      }
  
      const newMarker = L.circleMarker(marker.getLatLng(), {
        radius: marker.options.radius,
        color: marker.options.color,
        fillColor: marker.options.fillColor,
        fillOpacity: marker.options.fillOpacity,
        weight: marker.options.weight,
      });
  
      newMarker._stopData = marker._stopData;
      newMarker.on("mouseover", (e) => marker.fire("mouseover", e));
      newMarker.on("mouseout", (e) => marker.fire("mouseout", e));
      newMarker.on("click", (e) => marker.fire("click", e));
  
      window.appState.highlightedStopLayerGroup.addLayer(newMarker);
      window.appState.highlightedStopMarkers.push(newMarker);
    });
  
    window.appState.highlightedStopMarkers.forEach((m) => m.bringToFront());
  
    window.appState.highlightedRoute.on("click", () => {
      window.clearMapHighlights();
      if (window.appState.lastSelectedStop) {
        window.renderStopPanel(window.appState.lastSelectedStop);
      }
    });
  
    // Сложи начална и крайна точка
    const coords = turf.getCoords(selectedRoute.geometry);
    const [firstCoord, lastCoord] =
      selectedRoute.geometry.type === "LineString"
        ? [coords[0], coords[coords.length - 1]]
        : (() => {
            const longest = coords.sort((a, b) => b.length - a.length)[0];
            return [longest[0], longest[longest.length - 1]];
          })();
  
    window.startMarker = L.marker([firstCoord[1], firstCoord[0]], {
      icon: window.blueIcon,
    }).addTo(map);
  
    window.endMarker = L.marker([lastCoord[1], lastCoord[0]], {
      icon: window.redIcon,
    }).addTo(map);
  
    window.updateDynamicLegend([]);
    window.appState.selectedRouteLabel = routeId;
  
    if (window.appState.lastSelectedStop) {
      window.renderStopPanel(window.appState.lastSelectedStop);
    }
};
  