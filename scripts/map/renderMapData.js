window.renderMapData = function (data) {
    const map = window.appState.map;
    const stops = data.features.filter((f) => f.geometry.type === "Point");
    const routes = data.features.filter((f) => f.geometry.type.includes("Line"));
  
    // ➤ Добави маршрутите към карта
    const geoLayer = L.geoJSON(routes, {
      style: { color: "#888", weight: 2, opacity: 0.5 },
      onEachFeature: (feature, layer) => {
        layer.feature = feature;
      },
    }).addTo(map);
  
    window.appState.allRoutes = routes;
    window.appState.geoLayer = geoLayer;
  
    // ➤ Клъстер група за спирките
    const stopClusterGroup = L.markerClusterGroup({
      disableClusteringAtZoom: 18,
    });
    map.addLayer(stopClusterGroup);
    window.stopClusterGroup = stopClusterGroup;
  
    const pointSize = window.appState.debugSettings?.pointSize || 5;
    window.appState.allStopMarkers = [];
  
    stops.forEach((stop) => {
      const latlng = L.latLng(stop.geometry.coordinates[1], stop.geometry.coordinates[0]);
  
      const marker = L.circleMarker(latlng, {
        radius: pointSize,
        fillColor: "#ffc107",
        color: "#343a40",
        weight: pointSize,
        opacity: 1,
        fillOpacity: 0.9,
      });
  
      marker._stopData = stop;
      window.appState.allStopMarkers.push(marker);
  
      const allRelations = stop.properties?.["@relations"] || [];
  
      marker.on("mouseover", () => {
        clearTimeout(window.popupCloseTimeout);
  
        const { html } = window.popUpTemplate(stop, routes);
        marker._popup = L.popup({ closeButton: false, autoClose: false })
          .setLatLng(latlng)
          .setContent(html)
          .openOn(map);
  
        const relIds = allRelations.map((r) => r.rel);
        const matchedRoutes = routes.filter((r) => relIds.includes(r.properties?.line_id));
  
        if (window.appState.hoverLayerGroup) map.removeLayer(window.appState.hoverLayerGroup);
        window.appState.hoverLayerGroup = L.layerGroup().addTo(map);
  
        const routeColorPairs = [];
  
        matchedRoutes.forEach((route, index) => {
          const color = window.colorPalette[index % window.colorPalette.length];
          const hoverLayer = L.geoJSON(route.geometry, {
            style: {
              color,
              dashArray: "10",
              weight: window.appState.debugSettings.lineWeight,
              opacity: 0.8,
            },
          });
          window.appState.hoverLayerGroup.addLayer(hoverLayer);
          const { ref = "?", direction = "-" } = route.properties;
          routeColorPairs.push([color, `Маршрут ${ref}: ${direction}`]);
        });
  
        window.updateDynamicLegend(routeColorPairs);
      });
  
      marker.on("mouseout", () => {
        window.popupCloseTimeout = setTimeout(() => {
          if (window.appState.hoverLayerGroup) {
            map.removeLayer(window.appState.hoverLayerGroup);
            window.hoverLayerGroup = null;
          }
          window.updateDynamicLegend([]);
          if (marker._popup) map.closePopup(marker._popup);
        }, 200);
      });
  
      marker.on("click", () => {
        window.clearMapHighlights();
        window.renderStopPanel(marker._stopData);
        document.querySelector('[data-tab="tab-stop"]').click();
      });
  
      stopClusterGroup.addLayer(marker);
    });
  
    // ➤ Филтри за тип маршрути (трамвай, автобус и др.)
    const filterRoutesAndStops = () => {
      const checkedTypes = Array.from(
        document.querySelectorAll(".route-type:checked")
      ).map((cb) => cb.value.trim().toLowerCase());
  
      if (!geoLayer) return;
  
      geoLayer.clearLayers();
      const filteredRoutes = window.appState.allRoutes.filter((feature) => {
        const rawType = feature.properties.type || "";
        const normalized = rawType.trim().toLowerCase().replace(/[\s_]/g, "");
        return checkedTypes.includes(normalized);
      });
      geoLayer.addData(filteredRoutes);
  
      window.appState.allStopMarkers.forEach((marker) => {
        const stop = marker._stopData;
        const relations = stop?.properties?.["@relations"] || [];
  
        const isMatch = relations.some((rel) =>
          checkedTypes.includes(
            (window.appState.allRoutes.find((r) => r.properties.line_id === rel.rel)?.properties?.type || "")
              .trim().toLowerCase().replace(/[\s_]/g, "")
          )
        );
  
        if (isMatch) {
          if (!stopClusterGroup.hasLayer(marker))
            stopClusterGroup.addLayer(marker);
        } else {
          if (stopClusterGroup.hasLayer(marker))
            stopClusterGroup.removeLayer(marker);
        }
      });
    };
  
    // ➤ Свържи чекбокси
    document.querySelectorAll(".route-type").forEach((cb) => {
      cb.addEventListener("change", filterRoutesAndStops);
    });
  
    // ➤ Легенда
    const legend = L.control({ position: "bottomright" });
    legend.onAdd = function () {
      const div = L.DomUtil.create("div", "info legend");
      div.innerHTML = window.legendTemplate();
      return div;
    };
    legend.addTo(map);
};
  