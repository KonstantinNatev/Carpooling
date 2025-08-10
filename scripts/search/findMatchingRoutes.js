window.findMatchingRoutes = function (startStopName, endStopName) {
  window.clearMapHighlights();
  const stops = window.appState.allStopMarkers.map((m) => m._stopData);

  let resultBox = document.getElementById("route-search-result");
  if (!resultBox) {
    resultBox = document.createElement("div");
    resultBox.id = "route-search-result";
    resultBox.className = "route-search-result";
    const tabExtra = document.getElementById("tab-extra");
    if (tabExtra) tabExtra.appendChild(resultBox);
  }

  resultBox.innerHTML = "";

  const normalize = (name) => name.trim().toLowerCase();
  const startCandidates = stops.filter(
    (s) => s.properties.name?.toLowerCase() === normalize(startStopName)
  );
  const endCandidates = stops.filter(
    (s) => s.properties.name?.toLowerCase() === normalize(endStopName)
  );

  if (startCandidates.length === 0 || endCandidates.length === 0) {
    resultBox.innerHTML = "<p>Невалидни имена на спирки.</p>";
    resultBox.style.display = "block";
    return;
  }

  const htmlList = [];
  const matchingRoutes = [];

  for (const start of startCandidates) {
    for (const end of endCandidates) {
      const startRels = start.properties["@relations"] || [];
      const endRels = end.properties["@relations"] || [];

      for (const sr of startRels) {
        for (const er of endRels) {
          if (
            sr.route === er.route &&
            sr.direction === er.direction &&
            sr.index < er.index
          ) {
            const route = window.appState.allRoutes.find(
              (r) => r.properties["@id"] === sr.route
            );
            if (!route) continue;
            matchingRoutes.push({
              route,
              startIdx: sr.index,
              endIdx: er.index,
            });
          }
        }
      }
    }
  }

  if (matchingRoutes.length > 0) {
    for (const match of matchingRoutes) {
      const coords = match.route.geometry.coordinates.slice(
        match.startIdx,
        match.endIdx + 1
      );
      const partial = {
        type: "Feature",
        geometry: {
          type: "LineString",
          coordinates: coords,
        },
        properties: match.route.properties,
      };
      const color = match.route.properties.tr_color || "#007bff";
      const layer = L.geoJSON(partial, {
        style: {
          color,
          weight: window.appState.debugSettings.highlightWeight,
          opacity: 1,
        },
      }).addTo(window.appState.map);
      window.appState.foundRouteLayers.push(layer);

      htmlList.push(
        `<li><b>${match.route.properties.ref}</b> от <i>${startStopName}</i> до <i>${endStopName}</i></li>`
      );
    }

    window.appState.map.fitBounds(
      L.featureGroup(window.appState.foundRouteLayers).getBounds().pad(0.2)
    );

    resultBox.innerHTML = `<p><b>Директни маршрути:</b></p><ul>${htmlList.join("")}</ul>`;
    resultBox.style.display = "block";
    return;
  }

  // 🔁 Път с прекачване
  const getValidIds = (candidates) =>
    candidates
      .flatMap((s) =>
        (s.properties["@relations"] || []).map((r) => {
          const valid = r.stop_id && window.appState.stopGraph.has(r.stop_id);
          if (!valid) {
            console.warn(`⚠️ stop_id ${r.stop_id} липсва в графа`);
          }
          return r.stop_id;
        })
      )
      .filter((id) => id && window.appState.stopGraph.has(id));
  

  const startIds = getValidIds(startCandidates);
  const endIds = getValidIds(endCandidates);

  let bestPath = null;
  for (const sid of startIds) {
    for (const eid of endIds) {
      const path = window.findBestRouteWithTransfers(sid, eid);
      if (path) {
        bestPath = path;
        break;
      }
    }
    if (bestPath) break;
  }

  if (!bestPath) {
    resultBox.innerHTML =
      "<p>Не беше намерен маршрут с прекачване между тези спирки.</p>";
    resultBox.style.display = "block";
    return;
  }

  // ➕ Оптимизиране на стъпките
  const simplifiedSteps = [];
  let lastRoute = null;
  let currentSegment = null;

  for (const segment of bestPath) {
    const routeId = segment.via.routeId;
    if (!routeId) {
      if (currentSegment) {
        currentSegment.to = segment.from;
        simplifiedSteps.push(currentSegment);
        currentSegment = null;
      }
      simplifiedSteps.push({
        line: "Прекачване",
        from: segment.from,
        to: segment.to,
      });
      lastRoute = null;
      continue;
    }

    const route = window.appState.allRoutes.find((r) => r.properties["@id"] === routeId);
    if (!route) continue;

    if (!currentSegment || route.properties["@id"] !== lastRoute) {
      if (currentSegment) {
        currentSegment.to = segment.from;
        simplifiedSteps.push(currentSegment);
      }
      currentSegment = {
        routeId: route.properties["@id"],
        line: route.properties.ref,
        from: segment.from,
        to: segment.to,
      };
      lastRoute = route.properties["@id"];
    } else {
      currentSegment.to = segment.to;
    }
  }
  if (currentSegment) simplifiedSteps.push(currentSegment);

  // 🔍 Визуализация
  let firstCoord = null;
  let lastCoord = null;
  const shownSteps = simplifiedSteps.filter((s) => s.routeId);

  for (const step of shownSteps) {
    const route = window.appState.allRoutes.find((r) => r.properties["@id"] === step.routeId);
    if (!route) continue;

    const coords = route.geometry.coordinates;
    const latlngs = coords.map(([lng, lat]) => L.latLng(lat, lng));

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

    const fromStop = route.properties.segments.find((s) => s.stop?.id === step.from);
    const toStop = route.properties.segments.find((s) => s.stop?.id === step.to);
    if (!fromStop || !toStop) continue;

    const fromLatLng = L.latLng(fromStop.stop.latitude, fromStop.stop.longitude);
    const toLatLng = L.latLng(toStop.stop.latitude, toStop.stop.longitude);

    const fromIdx = findClosestIndex(fromLatLng);
    const toIdx = findClosestIndex(toLatLng);
    const [startIdx, endIdx] = fromIdx < toIdx ? [fromIdx, toIdx] : [toIdx, fromIdx];
    const slicedCoords = coords.slice(startIdx, endIdx + 1);

    if (!firstCoord) firstCoord = slicedCoords[0];
    lastCoord = slicedCoords[slicedCoords.length - 1];

    const partial = {
      type: "Feature",
      geometry: { type: "LineString", coordinates: slicedCoords },
      properties: route.properties,
    };

    const color = route.properties.tr_color || "#007bff";
    const layer = L.geoJSON(partial, {
      style: {
        color,
        weight: window.appState.debugSettings.highlightWeight,
        opacity: 1,
      },
    }).addTo(window.appState.map);
    window.appState.foundRouteLayers.push(layer);

    htmlList.push(
      `<li><b>${route.properties.ref}</b> от <i>${startStopName}</i> до <i>${endStopName}</i></li>`
    );
  }

  window.appState.map.fitBounds(
    L.featureGroup(window.appState.foundRouteLayers).getBounds().pad(0.2)
  );

  // 🟢 Маркери за старт и край
  const startMarker = L.marker([firstCoord[1], firstCoord[0]], { icon: window.blueIcon }).addTo(window.appState.map);
  const endMarker = L.marker([lastCoord[1], lastCoord[0]], { icon: window.redIcon }).addTo(window.appState.map);
  window.appState.searchMarkers.push(startMarker, endMarker);

  resultBox.innerHTML = `<p><b>Маршрути с прекачвания:</b></p><ul>${htmlList.join("")}</ul>`;
  resultBox.style.display = "block";
};
