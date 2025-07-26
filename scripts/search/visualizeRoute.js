window.visualizeRouteWithTransfers = function (path, stops) {
    const group = L.featureGroup();
    const htmlList = [];
    let firstCoord = null;
    let lastCoord = null;

    const shownSteps = path.filter((s) => s.via.routeId); // Пропуска "прекачване"
  
    for (const step of shownSteps) {
      const route = window.appState.allRoutes.find((r) => r.properties["@id"] === step.via.routeId);
      if (!route) continue;
  
      const coords = route.geometry.coordinates;
      const latlngs = coords.map(([lng, lat]) => L.latLng(lat, lng));
  
      const fromStop = route.properties.segments.find(s => s.stop?.id === step.from);
      const toStop = route.properties.segments.find(s => s.stop?.id === step.to);
      if (!fromStop || !toStop) continue;
  
      const fromLatLng = L.latLng(fromStop.stop.latitude, fromStop.stop.longitude);
      const toLatLng = L.latLng(toStop.stop.latitude, toStop.stop.longitude);
  
      const findClosestIndex = (target) => {
        let min = Infinity, idx = -1;
        latlngs.forEach((p, i) => {
          const d = p.distanceTo(target);
          if (d < min) {
            min = d;
            idx = i;
          }
        });
        return idx;
      };
  
      const fromIdx = findClosestIndex(fromLatLng);
      const toIdx = findClosestIndex(toLatLng);
      if (fromIdx === -1 || toIdx === -1) continue;
  
      const [startIdx, endIdx] = fromIdx < toIdx ? [fromIdx, toIdx] : [toIdx, fromIdx];
      const slicedCoords = coords.slice(startIdx, endIdx + 1);
  
      if (!firstCoord) firstCoord = slicedCoords[0];
      lastCoord = slicedCoords[slicedCoords.length - 1];
  
      const partial = {
        type: "Feature",
        geometry: {
          type: "LineString",
          coordinates: slicedCoords,
        },
        properties: route.properties,
      };
  
      const color = route.properties.tr_color || "#007bff";
      const layer = L.geoJSON(partial, {
        style: {
          color,
          weight: window.appState.debugSettings.highlightWeight,
          opacity: 1,
        },
      });
      layer.addTo(window.appState.map);
      // ne trqbva  da go ima
      // group.addLayer(layer);
      window.appState.foundRouteLayers.push(layer);
  
      const stopName = (id) => {
        for (const s of stops) {
          const rels = s.properties["@relations"] || [];
          if (rels.some(r => r.stop_id === id)) return s.properties.name || "???";
        }
        return "???";
      };
  
      htmlList.push(`<li><b>${route.properties.ref}</b> от <i>${stopName(step.from)}</i> до <i>${stopName(step.to)}</i></li>`);
    }
  
    // Старт/край маркери
    // Старт/край маркери
    if (firstCoord && lastCoord) {
      const startMarker = L.marker([firstCoord[1], firstCoord[0]], { icon: window.blueIcon }).addTo(window.appState.map);
      const endMarker = L.marker([lastCoord[1], lastCoord[0]], { icon: window.redIcon }).addTo(window.appState.map);
      window.appState.searchMarkers.push(startMarker, endMarker);
    }

    if (group.getLayers().length > 0) {
      window.appState.map.fitBounds(group.getBounds().pad(0.2));
    }

  
    return htmlList;
  };
  