window.renderMapData = function (data) {
    const map = window.appState.map;
    const stops = data.features.filter((f) => f.geometry.type === "Point");
    const routes = data.features.filter((f) => f.geometry.type.includes("Line"));
    const isMobile = window.appState.isMobile;
    
    // ➤ Добави маршрутите към карта
    const geoLayer = L.geoJSON(routes, {
      style: { color: "#888", weight: 2, opacity: 0.5 },
      onEachFeature: (feature, layer) => {
        layer.feature = feature;
      },
    }).addTo(map);
  
    window.appState.allRoutes = routes;
    window.appState.geoLayer = geoLayer;
  
  const stopClusterGroup = L.markerClusterGroup({
    disableClusteringAtZoom: 19,
    zoomToBoundsOnClick: true,
    spiderfyOnMaxZoom: false,
    spiderfyDistanceMultiplier: isMobile ? 0.7 : 1.0,
  });
    map.addLayer(stopClusterGroup);
    window.stopClusterGroup = stopClusterGroup;


  /* --- Guard срещу селекция при tap върху кластер (mobile) --- */
  let suppressTapUntil = 0;
  let isZooming = false;
  let isSpiderfying = false;
  let downOnCluster = false;

  const isMobileView = () => window.matchMedia('(max-width: 1024px)').matches;

  // zoom събития
  map.on('zoomstart', () => { 
    isZooming = true; 
    suppressTapUntil = performance.now() + 350; 
  });
  map.on('zoomend', () => { isZooming = false; });

  // MarkerCluster събития
  stopClusterGroup.on('clusterclick', () => { 
    // не override-ваме поведението – само супресираме селекцията
    suppressTapUntil = performance.now() + 350; 
  });
  stopClusterGroup.on('spiderfied', () => { 
    isSpiderfying = true; 
    suppressTapUntil = performance.now() + 350; 
  });
  stopClusterGroup.on('unspiderfied', () => { isSpiderfying = false; });
  stopClusterGroup.on('animationend', () => { suppressTapUntil = performance.now() + 150; });

  // слушатели на контейнера – за да знаем дали down е върху кластер
  const mapContainer = map.getContainer();
  mapContainer.addEventListener('pointerdown', (e) => {
    downOnCluster = !!(e.target && e.target.closest && e.target.closest('.marker-cluster'));
  }, { passive: true });

    const basePoint = window.appState.debugSettings?.pointSize || 5;
    const pointSize = isMobile ? Math.max(basePoint + 2, 7) : basePoint;
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
  
      if (!isMobile) {
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
      }

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
        // На мобилно игнорирай клик, ако току-що е имало clusterclick/zoom/spiderfy
        if (isMobileView()) {
          const now = performance.now();
          if (now < suppressTapUntil || isZooming || isSpiderfying) {
            return;
          }
        }
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

  // === Хит‑тест индекс за бърз nearest на мобилно ===
  const index = window.hitTest.buildStopIndex(window.appState.allStopMarkers);
  function adaptivePxTolerance() {
    const z = map.getZoom();
    return z >= 16 ? 20 : 26; // px
  }

  // === Tap guard + кластер гард ===
  let downPt = null;
  const container = map.getContainer();

  container.addEventListener('pointerdown', (e) => {
    downPt = { x: e.clientX, y: e.clientY, t: performance.now() };
    // запомни дали тапът започна върху кластер балон
    downOnCluster = !!(e.target && e.target.closest && e.target.closest('.marker-cluster'));
  }, { passive: true });

  container.addEventListener('pointercancel', () => {
    downPt = null;
    downOnCluster = false;
  }, { passive: true });

  container.addEventListener('pointerup', (e) => {
    // работим мобилно/таблет; на десктоп селекцията идва от click на маркера
    if (!isMobileView()) return;
    if (!downPt) return;

    const dx = e.clientX - downPt.x;
    const dy = e.clientY - downPt.y;
    const dt = performance.now() - downPt.t;
    const moved = Math.hypot(dx, dy) > 8;
    const longPress = dt >= 350;

    const now = performance.now();
    const upOnCluster = !!(e.target && e.target.closest && e.target.closest('.marker-cluster'));

    // ⛔️ Критичен гард: ако тапваме върху кластер или тече zoom/spiderfy → НЕ селектираме
    if (downOnCluster || upOnCluster || now < suppressTapUntil || isZooming || isSpiderfying) {
      downPt = null;
      downOnCluster = false;
      return;
    }

    downPt = null;
    downOnCluster = false;

    if (moved) return;     // pan/drag
    if (longPress) return; // бъдещ контекст

    // продължаваме с hitTest едва след гардовете
    const rect = container.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const ll = map.containerPointToLatLng([cx, cy]);

    // визуален halo
    const halo = document.createElement('div');
    halo.className = 'tap-halo';
    halo.style.left = `${cx}px`;
    halo.style.top = `${cy}px`;
    container.appendChild(halo);
    setTimeout(() => halo.remove(), 420);

    const marker = index.queryNearest(ll, map, adaptivePxTolerance());
    if (marker) {
      window.clearMapHighlights();
      window.renderStopPanel(marker._stopData);
      document.querySelector('[data-tab="tab-stop"]').click();
    }
  }, { passive: true });
};
  