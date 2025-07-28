window.map = L.map("map").setView([42.6977, 23.3219], 13);

L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: "&copy; OpenStreetMap contributors",
}).addTo(window.map);

window.highlightedStopLayerGroup = L.layerGroup().addTo(map);

window.window.highlightedRoute = null;
window.startMarker = null;
window.endMarker = null;
let geoLayer = null;
window.selectedRouteLabel = "";
let currentPopup = null;
let popupCloseTimeout = null;
window.searchMarkers = []; // за да изчистим маркерите при всяко търсене

window.hopartialverLayerGroup = null;
window.debugSettings = {
  pointSize: 5,
  lineWeight: 4,
  highlightWeight: 6,
};

const urlParams = new URLSearchParams(window.location.search);
const debug = urlParams.get("debug");

document.addEventListener("click", function (event) {
  const target = event.target;
  if (target && target.id === "btn-schedule-view") {
    const panelContent = target.getAttribute("data-schedule-html");
    if (panelContent) {
      showSchedulePanel(panelContent);
    }
  }
});

document
  .getElementById("reverse-direction-btn")
  .addEventListener("click", () => {
    const startInput = document.getElementById("start-stop");
    const endInput = document.getElementById("end-stop");

    const temp = startInput.value;
    startInput.value = endInput.value;
    endInput.value = temp;

    const startName = startInput.value.trim().toLowerCase();
    const endName = endInput.value.trim().toLowerCase();

    findMatchingRoutes(startName, endName);
  });

function getStopName(stopId) {
  const stops = window.allStopMarkers.map((m) => m._stopData);
  for (const stop of stops) {
    const rels = stop.properties["@relations"] || [];
    if (rels.some((r) => r.stop_id === stopId)) {
      return stop.properties.name || "Без име";
    }
  }
  return "Непозната спирка";
}

function showSchedulePanel(encodedHtml) {
  const panel = document.getElementById("schedule-panel");
  const content = document.getElementById("schedule-content");

  if (!panel || !content) {
    console.warn("Липсва елемент с ID schedule-panel или schedule-content.");
    return;
  }

  content.innerHTML = decodeURIComponent(encodedHtml);
  panel.style.display = "block";
}

async function loadAllScrapedRoutes() {
  try {
    const res = await fetch("./schedules/index.json");
    const files = await res.json();
    const allStops = [];
    const allRoutes = [];

    for (const file of files) {
      const data = await fetch(`./schedules/${file}`).then((r) => r.json());
      const routes = data.routes || [];

      for (const route of routes) {
        if (!route?.details?.polyline) continue;

        const stops = route?.segments?.map((s) => s.stop).filter(Boolean) || [];
        const lineName = data.line?.name || "";
        const refId = `relation/${data.line?.id}`;
        const from = route?.details?.from || "-";
        const to = route?.details?.to || "-";
        const rawType = (data.line.tr_name || "")
          .trim()
          .toLowerCase()
          .replace(/[\s_]/g, "");
        const typeMap = {
          трамвай: "tram",
          тролейбус: "trolleybus",
          автобус: "bus",
          tram: "tram",
          trolleybus: "trolleybus",
          bus: "bus",
        };
        const type = typeMap[rawType] || rawType;

        const direction = route.name;
        const polyline = route?.details?.polyline || "";

        const coords = polyline
          .replace("LINESTRING (", "")
          .replace(")", "")
          .split(", ")
          .map((pair) => {
            const [lng, lat] = pair.split(" ").map(Number);
            return [lat, lng];
          });

        const geometry = {
          type: "LineString",
          coordinates: coords.map(([lat, lng]) => [lng, lat]),
        };

        allRoutes.push({
          type: "Feature",
          geometry,
          properties: {
            ref: lineName,
            direction,
            type,
            "@id": `${refId}_${route.id}`,
            tr_color: data.line?.tr_color || "#888",
            tr_icon: data.line?.tr_icon || "",
            line_id: data.line?.id,
            route_id: route?.id,
            from,
            to,
            segments: route?.segments || [],
          },
        });

        for (const stop of stops) {
          const lat = parseFloat(stop.latitude);
          const lng = parseFloat(stop.longitude);

          const existing = allStops.find((s) => {
            const [sLng, sLat] = s.geometry.coordinates;
            return (
              Math.abs(sLat - lat) < 0.00001 && Math.abs(sLng - lng) < 0.00001
            );
          });

          const scheduleMap = {};
          for (const timeEntry of stop.times || []) {
            const label = timeEntry.code || "Няма етикет";
            if (!scheduleMap[label]) scheduleMap[label] = new Set();
            scheduleMap[label].add(timeEntry.time);
          }

          const relation = {
            rel: data.line?.id,
            ref: data.line?.name,
            direction: route.name,
            stop_id: stop.id,
            schedule: Object.entries(scheduleMap).map(([label, times]) => ({
              label,
              times: Array.from(times).sort(),
            })),
          };

          if (existing) {
            if (
              !existing.properties["@relations"].some(
                (r) => r.rel === relation.rel
              )
            ) {
              existing.properties["@relations"].push(relation);
            }
          } else {
            allStops.push({
              type: "Feature",
              geometry: {
                type: "Point",
                coordinates: [lng, lat],
              },
              properties: {
                name: stop.name,
                "@relations": [relation],
              },
            });
          }
        }
      }
    }

    const data = { features: [...allStops, ...allRoutes] };

    // 🧭 Първо създаваме празен граф
    window.stopGraph = new Map();

    // 🤝 Добавяне на прекачвания между спирки със съвпадащи координати
    for (let i = 0; i < allStops.length; i++) {
      for (let j = i + 1; j < allStops.length; j++) {
        const a = allStops[i];
        const b = allStops[j];

        const [lng1, lat1] = a.geometry.coordinates;
        const [lng2, lat2] = b.geometry.coordinates;
        const dist = Math.sqrt((lat1 - lat2) ** 2 + (lng1 - lng2) ** 2);

        if (dist < 0.0001) {
          const aId = a.properties["@relations"]?.[0]?.stop_id;
          const bId = b.properties["@relations"]?.[0]?.stop_id;
          if (!aId || !bId || aId === bId) continue;

          if (!window.stopGraph.has(aId)) window.stopGraph.set(aId, []);
          if (!window.stopGraph.has(bId)) window.stopGraph.set(bId, []);

          window.stopGraph.get(aId).push({
            stopId: bId,
            line: "прекачване",
            direction: "↔",
            routeId: null,
            type: "transfer",
            weight: 1,
          });

          window.stopGraph.get(bId).push({
            stopId: aId,
            line: "прекачване",
            direction: "↔",
            routeId: null,
            type: "transfer",
            weight: 1,
          });
        }
      }
    }

    // 🧱 Създаване на връзки по маршрути
    for (const feature of data.features) {
      if (feature.geometry.type !== "LineString") continue;

      const segments = feature.properties?.segments || [];
      for (let i = 0; i < segments.length - 1; i++) {
        const from = segments[i]?.stop;
        const to = segments[i + 1]?.stop;
        if (!from || !to) continue;

        const fromId = from.id;
        const toId = to.id;

        if (!window.stopGraph.has(fromId)) window.stopGraph.set(fromId, []);
        if (!window.stopGraph.has(toId)) window.stopGraph.set(toId, []);

        const commonData = {
          routeId: feature.properties["@id"],
          line: feature.properties.ref,
          type: feature.properties.type,
          direction: feature.properties.direction,
          weight: 1,
        };

        window.stopGraph.get(fromId).push({ stopId: toId, ...commonData });
        window.stopGraph.get(toId).push({ stopId: fromId, ...commonData });
      }
    }

    // 🧷 Свързване на спирки с еднакъв stop_id (различни линии, еднакво име)
    for (const stop of allStops) {
      const stopId = stop.properties?.["@relations"]?.[0]?.stop_id;
      if (!stopId) continue;

      const connections = stop.properties?.["@relations"] || [];

      for (const rel of connections) {
        for (const rel2 of connections) {
          if (rel === rel2) continue;

          if (!window.stopGraph.has(rel.stop_id))
            window.stopGraph.set(rel.stop_id, []);
          window.stopGraph.get(rel.stop_id).push({
            stopId: rel2.stop_id,
            routeId: null,
            line: "прекачване",
            type: "transfer",
            direction: "↔",
            weight: 1,
          });
        }
      }
    }

    renderMapData(data);

    showStopsForLine("60");
    showStopsForLine("73");
    showStopsForLine("11");

    // 🔁 Свързване на всички спирки с еднакъв stop_id, но от различни линии (прекачвания)
    for (const stop of allStops) {
      const stopId = stop.properties?.["@relations"]?.[0]?.stop_id;
      if (!stopId) continue;

      const connections = stop.properties?.["@relations"] || [];

      // Свържи тази спирка с други нейни копия (ако съществуват в други позиции)
      for (const rel of connections) {
        for (const rel2 of connections) {
          if (rel === rel2) continue;

          // Добавяме връзка между тях в графа – това е прекачване
          if (!window.stopGraph.has(rel.stop_id))
            window.stopGraph.set(rel.stop_id, []);
          window.stopGraph.get(rel.stop_id).push({
            stopId: rel2.stop_id,
            routeId: null,
            line: "прекачване",
            type: "transfer",
            direction: "↔",
            weight: 1, // или 0 ако искаш да не влияе на разстоянието
          });
        }
      }
    }
  } catch (err) {
    console.error("Грешка при зареждане на JSON файловете:", err);
  }
}

window.renderStopPanel = function (stop) {
  const allRelations = stop.properties?.["@relations"] || [];
  const stopName = stop.properties.name || "Без име";

  // Остави за сега !!!
  // Фокусирам отново точката (спирката) и зумвам на нея
  // map.setView(
  //   L.latLng(stop.geometry.coordinates[1], stop.geometry.coordinates[0]),
  //   Math.max(map.getZoom(), 16),
  //   { animate: true }
  // );

  // Ресет на всички маркери
  window.allStopMarkers.forEach((m) =>
    m.setStyle({ color: "#343a40", weight: window.debugSettings.pointSize })
  );

  // Активен маркер
  const matchedMarker = window.allStopMarkers.find((m) => m._stopData === stop);
  if (matchedMarker) {
    matchedMarker.setStyle({
      color: "#007bff",
      weight: window.debugSettings.pointSize + 2,
    });
  }

  // Обновяване на име на спирка
  document.getElementById("stop-name").textContent = stopName;

  const routes = window.allRoutes;
  const selectedRouteId = window.selectedRouteLabel; // 🔧 вярно прочетено
  const lineGroups = allRelations.reduce((acc, rel) => {
    if (!acc[rel.ref]) acc[rel.ref] = [];
    acc[rel.ref].push(rel);
    return acc;
  }, {});

  const iconMap = {
    tram: "🚋",
    trolleybus: "🚎",
    bus: "🚌",
  };

  let html = "";
  Object.entries(lineGroups).forEach(([lineLabel, group]) => {
    html += `
      <div class="panel-section">
        <div class="panel-header">
          <span class="line-ref">${lineLabel}</span>
        </div>
        <div class="line-items">
    `;

    group.forEach((rel) => {
      const route = routes.find(
        (r) =>
          r.properties.line_id === rel.rel &&
          r.properties.direction === rel.direction
      );
      if (!route) return;

      const routeId = route.properties["@id"];
      const icon = iconMap[route.properties.type] || "🚌";
      console.log("routeId", routeId);
      console.log("selectedRouteId", selectedRouteId);

      const isSelected = routeId === selectedRouteId;

      html += `
        <div class="line-item ${isSelected ? "active" : ""}">
          <div class="line-info">
            <span class="line-icon">${icon}</span>
            <span class="line-direction">${rel.direction}</span>
            ${isSelected ? `<span class="line-tag">Избран</span>` : ""}
          </div>
          <div class="line-actions">
            <button 
              class="action-btn preview-btn ${isSelected ? "selected" : ""}" 
              data-route-id="${routeId}"
              onclick="window.highlightRoute('${routeId}')">
              ${isSelected ? "Премахни" : "Преглед"}
            </button>
            <button class="action-btn secondary schedule-btn" data-schedule-html="${encodeURIComponent(
              window.scheduleTemplate([rel], stopName)
            )}">Разписание</button>
          </div>
        </div>
      `;
    });

    html += `</div></div>`;
  });

  const stopContent = document.getElementById("stop-info-content");
  stopContent.innerHTML = html;
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    const tabId = btn.getAttribute("data-tab");
    const isStopTab = tabId === "tab-stop";

    btn.classList.toggle("active", isStopTab);
    document.getElementById(tabId)?.classList.toggle("active", isStopTab);
  });

  window.lastSelectedStop = stop;

  // Ако все още няма избрана линия – селектирай първата от списъка
  // ⚠️ Не избирай автоматично, ако вече сме в процес на деселекция
  if (!window.selectedRouteLabel && !window.skipAutoSelection) {
    const firstBtn = document.querySelector(".preview-btn");
    if (firstBtn) {
      const firstRouteId = firstBtn.getAttribute("data-route-id");
      if (firstRouteId) {
        window.highlightRoute(firstRouteId);
      }
    }
  }

  document.querySelectorAll(".schedule-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const html = btn.getAttribute("data-schedule-html");
      if (html) {
        showSchedulePanel(html);
      }
    });
  });
};

function renderMapData(data) {
  const stops = data.features.filter((f) => f.geometry.type === "Point");
  const routes = data.features.filter((f) => f.geometry.type.includes("Line"));

  geoLayer = L.geoJSON(routes, {
    style: { color: "#888", weight: 2, opacity: 0.5 },
    onEachFeature: (feature, layer) => {
      layer.feature = feature;
    },
  }).addTo(map);

  window.allRoutes = routes;

  window.highlightRoute = (routeId) => {
    if (window.selectedRouteLabel === routeId) {
      console.error("same route clicked → deselecting");
      window.clearMapHighlights();
      window.selectedRouteLabel = "";

      // ⛔️ Забраняваме автоматичното избиране на първа линия
      window.skipAutoSelection = true;
      if (window.lastSelectedStop) {
        window.renderStopPanel(window.lastSelectedStop);
      }
      window.skipAutoSelection = false;

      return;
    }

    window.clearMapHighlights();

    const selectedRoute = window.allRoutes.find(
      (r) => r.properties?.["@id"] === routeId
    );
    if (!selectedRoute) return;

    const color = selectedRoute.properties.tr_color || window.getRouteColor(1);

    window.highlightedRoute = L.geoJSON(selectedRoute.geometry, {
      style: {
        color,
        weight: window.debugSettings.highlightWeight,
        opacity: 1,
      },
    }).addTo(map);

    // ⛳️ Добавяме спирки по този маршрут
    const routeStopCoords = selectedRoute.properties.segments
      .map((seg) => seg.stop)
      .filter(Boolean)
      .map((stop) => [parseFloat(stop.latitude), parseFloat(stop.longitude)]);

    window.highlightedStopMarkers = [];

    const matchedMarkers = window.allStopMarkers.filter((marker) => {
      const latlng = marker.getLatLng();
      return routeStopCoords.some(([lat, lng]) => {
        return (
          Math.abs(latlng.lat - lat) < 0.0001 &&
          Math.abs(latlng.lng - lng) < 0.0001
        );
      });
    });

    matchedMarkers.forEach((marker) => {
      marker.setStyle({
        color: "#28a745",
        weight: window.debugSettings.pointSize + 1,
        radius: window.debugSettings.pointSize + 1,
      });

      // 👉 махаме marker от клъстера (ако съществува) и го клонираме в нов слой
      if (window.stopClusterGroup?.hasLayer(marker)) {
        window.stopClusterGroup.removeLayer(marker);
      }

      // ❗️ важно: създаваме нов независим маркер с копирани данни
      const newMarker = L.circleMarker(marker.getLatLng(), {
        radius: marker.options.radius,
        color: marker.options.color,
        fillColor: marker.options.fillColor,
        fillOpacity: marker.options.fillOpacity,
        weight: marker.options.weight,
      });

      // ✅ Копираме данните от оригиналния marker
      newMarker._stopData = marker._stopData;

      // ✅ Добавяме същите събития
      newMarker.on("mouseover", (e) => marker.fire("mouseover", e));
      newMarker.on("mouseout", (e) => marker.fire("mouseout", e));
      newMarker.on("click", (e) => marker.fire("click", e));

      // ✅ Добавяме към слоя и масива
      window.highlightedStopLayerGroup.addLayer(newMarker);
      window.highlightedStopMarkers.push(newMarker);
    });

    // Премества markers най-отгоре
    window.highlightedStopMarkers.forEach((m) => m.bringToFront());

    window.highlightedRoute.on("click", () => {
      window.clearMapHighlights();
      if (window.lastSelectedStop) {
        window.renderStopPanel(window.lastSelectedStop);
      }
    });

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
    window.selectedRouteLabel = routeId;

    if (window.lastSelectedStop) {
      window.renderStopPanel(window.lastSelectedStop);
    }
  };

  window.allStopMarkers = [];

  const stopClusterGroup = L.markerClusterGroup({
    disableClusteringAtZoom: 18, // автоматично показва маркерите при по-близък zoom
  });
  map.addLayer(stopClusterGroup);
  stops.forEach((stop) => {
    const latlng = L.latLng(
      stop.geometry.coordinates[1],
      stop.geometry.coordinates[0]
    );

    const marker = L.circleMarker(latlng, {
      radius: window.debugSettings.pointSize,
      fillColor: "#ffc107",
      color: "#343a40",
      weight: window.debugSettings.pointSize,
      opacity: 1,
      fillOpacity: 0.9,
    });

    marker._stopData = stop;
    window.allStopMarkers.push(marker);

    const allRelations = stop.properties?.["@relations"] || [];

    marker.on("mouseover", () => {
      clearTimeout(popupCloseTimeout);

      const { html } = window.popUpTemplate(stop, routes);
      marker._popup = L.popup({
        closeButton: false,
        autoClose: false,
      })
        .setLatLng(latlng)
        .setContent(html)
        .openOn(map);

      const relIds = allRelations.map((r) => r.rel);
      const matchedRoutes = routes.filter((r) =>
        relIds.includes(r.properties?.line_id)
      );

      if (window.hoverLayerGroup) map.removeLayer(window.hoverLayerGroup);
      window.hoverLayerGroup = L.layerGroup().addTo(map);

      const routeColorPairs = [];

      matchedRoutes.forEach((route, index) => {
        const color = window.colorPalette[index % window.colorPalette.length];
        const hoverLayer = L.geoJSON(route.geometry, {
          style: {
            color,
            dashArray: "10",
            weight: window.debugSettings.lineWeight,
            opacity: 0.8,
          },
        });
        window.hoverLayerGroup.addLayer(hoverLayer);
        const { ref = "?", direction = "-" } = route.properties;
        routeColorPairs.push([color, `Маршрут ${ref}: ${direction}`]);
      });

      window.updateDynamicLegend(routeColorPairs);
    });

    marker.on("mouseout", () => {
      popupCloseTimeout = setTimeout(() => {
        if (window.hoverLayerGroup) {
          map.removeLayer(window.hoverLayerGroup);
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
  const filterRoutesAndStops = () => {
    const checkedTypes = Array.from(
      document.querySelectorAll(".route-type:checked")
    ).map((cb) => cb.value.trim().toLowerCase());

    if (!geoLayer) return;

    // Обновяване на маршрутите
    geoLayer.clearLayers();
    const filteredRoutes = window.allRoutes.filter((feature) => {
      const rawType = feature.properties.type || "";
      const normalized = rawType.trim().toLowerCase().replace(/[\s_]/g, "");
      return checkedTypes.includes(normalized);
    });
    geoLayer.addData(filteredRoutes);

    // Обновяване на спирките
    window.allStopMarkers.forEach((marker) => {
      const stop = marker._stopData;
      const relations = stop?.properties?.["@relations"] || [];

      const isMatch = relations.some((rel) =>
        checkedTypes.includes(
          (
            window.allRoutes.find((r) => r.properties.line_id === rel.rel)
              ?.properties?.type || ""
          )
            .trim()
            .toLowerCase()
            .replace(/[\s_]/g, "")
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

  // Слушатели за чекбокси
  document.querySelectorAll(".route-type").forEach((cb) => {
    cb.addEventListener("change", filterRoutesAndStops);
  });
}

const legend = L.control({ position: "bottomright" });
legend.onAdd = function () {
  const div = L.DomUtil.create("div", "info legend");
  div.innerHTML = window.legendTemplate();
  return div;
};
legend.addTo(map);

loadAllScrapedRoutes();

document.addEventListener("DOMContentLoaded", () => {
  if (debug !== "true") {
    const debugPanel = document.getElementById("debug-panel");
    if (debugPanel) {
      debugPanel.style.display = "none";
    }
  }

  const { pointSize, lineWeight, highlightWeight } = debugSettings;
  document.getElementById("pointSizeInput").value = pointSize;
  document.getElementById("lineWeightInput").value = lineWeight;
  document.getElementById("highlightWeightInput").value = highlightWeight;
});

document.addEventListener("click", (e) => {
  const btn = e.target.closest(".schedule-btn");
  if (btn) {
    const html = decodeURIComponent(btn.dataset.scheduleHtml || "");
    if (typeof showSchedulePanel === "function") {
      showSchedulePanel(html);
    } else {
      console.warn("⚠️ showSchedulePanel не е дефинирана!");
    }
  }
});

document.addEventListener("click", function (event) {
  const target = event.target;
  if (target && target.id === "applySettingsBtn") {
    document
      .getElementById("applySettingsBtn")
      .addEventListener("click", () => {
        const pointSize = parseFloat(
          document.getElementById("pointSizeInput").value
        );
        const lineWeight = parseFloat(
          document.getElementById("lineWeightInput").value
        );
        const highlightWeight = parseFloat(
          document.getElementById("highlightWeightInput").value
        );

        window.debugSettings.pointSize = pointSize;
        window.debugSettings.lineWeight = lineWeight;
        window.debugSettings.highlightWeight = highlightWeight;

        // Обновяване на маршрутите
        if (window.hoverLayerGroup) {
          window.hoverLayerGroup.eachLayer((layer) => {
            if (layer.setStyle) {
              layer.setStyle({
                weight: window.debugSettings.lineWeight,
              });
            }
          });
        }

        // Обновяване на спирките
        if (Array.isArray(window.allStopMarkers)) {
          window.allStopMarkers.forEach((marker) => {
            marker.setRadius(pointSize);
          });
        }

        // Обновяване на маркирания маршрут (ако има)
        if (window.highlightedRoute) {
          window.highlightedRoute.setStyle({
            weight: highlightWeight,
          });
        }
      });
  }
});

function getScheduleButton(stopId, route, stops) {
  const stopObj = stops.find((s) =>
    (s.properties["@relations"] || []).some((r) => r.stop_id === stopId)
  );
  if (!stopObj) return "";

  const rel = stopObj.properties["@relations"]?.find(
    (r) =>
      r.rel === route.properties.line_id &&
      r.direction === route.properties.direction
  );
  if (!rel || !rel.schedule) return "";

  const stopName = stopObj.properties.name || "Непозната спирка";
  const scheduleHtml = encodeURIComponent(
    window.scheduleTemplate([rel], stopName)
  );

  return `
    <button class="action-btn secondary schedule-btn" data-schedule-html="${scheduleHtml}">
      Разписание
    </button>
  `;
}

function createLineItemHTML({ icon, route, step, stops }) {
  const routeId = route.properties["@id"];

  // Използваме само спирката за качване
  const scheduleButtonHtml = getScheduleButton(step.from, route, stops);

  return `
    <div class="line-item">
      <div class="line-info">
        <span class="line-icon">${icon}</span>
        <span class="line-direction">${route.properties.direction}</span>
      </div>
      <div class="line-details">
        <b>${route.properties.ref}</b> от <i>${getStopName(
    step.from
  )}</i> до <i>${getStopName(step.to)}</i>
      </div>
      <div class="line-actions">
        <button 
          class="action-btn preview-btn" 
          data-route-id="${routeId}"
          onclick="window.highlightRoute('${routeId}')">
          Преглед
        </button>
        ${scheduleButtonHtml}
      </div>
    </div>
  `;
}

window.foundRouteLayers = [];

async function findMatchingRoutes(startStopName, endStopName) {
  window.clearMapHighlights();
  const stops = window.allStopMarkers.map((m) => m._stopData);
 
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
            const route = window.allRoutes.find(
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
    const group = L.featureGroup();
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
          weight: window.debugSettings.highlightWeight,
          opacity: 1,
        },
      }).addTo(map);
      window.foundRouteLayers.push(layer); // 🆕 запомни този слой

      const startName = startStopName;
      const endName = endStopName;
      htmlList.push(
        `<li><b>${match.route.properties.ref}</b> от <i>${startName}</i> до <i>${endName}</i></li>`
      );
    }
    map.fitBounds(L.featureGroup(window.foundRouteLayers).getBounds().pad(0.2));

    resultBox.innerHTML = `<p><b>Директни маршрути:</b></p><ul>${htmlList.join(
      ""
    )}</ul>`;
    resultBox.style.display = "block";
    return;
  }

  const getValidIds = (candidates) =>
    candidates
      .flatMap((s) => (s.properties["@relations"] || []).map((r) => r.stop_id))
      .filter((id) => window.stopGraph.has(id));

  const startIds = getValidIds(startCandidates);
  const endIds = getValidIds(endCandidates);

  let bestPath = null;
  for (const sid of startIds) {
    for (const eid of endIds) {
      const path = findBestRouteWithTransfers(sid, eid);
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

    const route = window.allRoutes.find((r) => r.properties["@id"] === routeId);
    if (!route) continue;

    if (!currentSegment || route.properties.ref !== lastRoute) {
      if (currentSegment) {
        currentSegment.to = segment.from;
        simplifiedSteps.push(currentSegment);
      }
      currentSegment = {
        line: route.properties.ref,
        from: segment.from,
        to: segment.to,
      };
      lastRoute = route.properties.ref;
    } else {
      currentSegment.to = segment.to;
    }
  }
  if (currentSegment) {
    simplifiedSteps.push(currentSegment);
  }

  const group = L.featureGroup();
  let firstCoord = null;
  let lastCoord = null;
  const shownSteps = simplifiedSteps.filter((s) => s.line !== "Прекачване");

  for (const step of shownSteps) {
    const route = window.allRoutes.find((r) => r.properties.ref === step.line);
    if (!route) continue;

    const coords = route.geometry.coordinates;
    const latlngs = coords.map(([lng, lat]) => L.latLng(lat, lng));

    const findClosestIndex = (target) => {
      let min = Infinity,
        idx = -1;
      latlngs.forEach((p, i) => {
        const d = p.distanceTo(target);
        if (d < min) {
          min = d;
          idx = i;
        }
      });
      return idx;
    };

    const fromStop = route.properties.segments.find(
      (s) => s.stop?.id === step.from
    );
    const toStop = route.properties.segments.find(
      (s) => s.stop?.id === step.to
    );
    if (!fromStop || !toStop) continue;

    const fromLatLng = L.latLng(
      fromStop.stop.latitude,
      fromStop.stop.longitude
    );
    const toLatLng = L.latLng(toStop.stop.latitude, toStop.stop.longitude);

    const fromIdx = findClosestIndex(fromLatLng);
    const toIdx = findClosestIndex(toLatLng);
    const [startIdx, endIdx] =
      fromIdx < toIdx ? [fromIdx, toIdx] : [toIdx, fromIdx];
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
        weight: window.debugSettings.highlightWeight,
        opacity: 1,
      },
    }).addTo(map);
    window.foundRouteLayers.push(layer); // 🆕 запомни този слой

    if (route) {
      const routeId = route.properties["@id"];
      const icon = route.properties.route_type === "bus" ? "🚌" : "🚋";
      htmlList.push(createLineItemHTML({ icon, route, step, stops }));
    }
  }

  map.fitBounds(L.featureGroup(window.foundRouteLayers).getBounds().pad(0.2));

  const startMarker = L.marker([firstCoord[1], firstCoord[0]], {
    icon: window.blueIcon,
  }).addTo(map);
  const endMarker = L.marker([lastCoord[1], lastCoord[0]], {
    icon: window.redIcon,
  }).addTo(map);
  window.searchMarkers.push(startMarker, endMarker);

  // 🔍 1. Намери всички ID-та на спирки, на които има прекачване (сменя се линията)
  const transferStopIds = new Set();
  for (let i = 1; i < bestPath.length; i++) {
    const prevRoute = bestPath[i - 1].via?.routeId;
    const currRoute = bestPath[i].via?.routeId;
    if (prevRoute && currRoute && prevRoute !== currRoute) {
      transferStopIds.add(bestPath[i].from);
    }
  }

  // 🔧 2. Създай Map, която свързва stop_id → stopFeature
  // stop_id → [всички спирки, които го съдържат в @relations]
  const stopIdToFeatures = new Map();
  for (const stop of stops) {
    const rels = stop.properties["@relations"] || [];
    for (const rel of rels) {
      if (!stopIdToFeatures.has(rel.stop_id)) {
        stopIdToFeatures.set(rel.stop_id, []);
      }
      stopIdToFeatures.get(rel.stop_id).push(stop);
    }
  }

  // 📦 3. Извлечи линиите за всяка спирка за прекачване
  const transferLinesMap = new Map();

  for (const stopId of transferStopIds) {
    const stopFeatures = stopIdToFeatures.get(stopId) || [];
    for (const stopFeature of stopFeatures) {
      const stopName = stopFeature.properties.name || `Спирка ${stopId}`;
      const lines = (stopFeature.properties["@relations"] || [])
        .map((r) => r.ref)
        .filter(Boolean);

      if (lines.length > 0) {
        const uniqueLines = [...new Set(lines)];
        if (!transferLinesMap.has(stopName)) {
          transferLinesMap.set(stopName, new Set(uniqueLines));
        } else {
          const existing = transferLinesMap.get(stopName);
          uniqueLines.forEach((l) => existing.add(l));
        }
      }
    }

    if (!stopFeature) continue;

    const stopName = stopFeature.properties.name || `Спирка ${stopId}`;
    const lines = (stopFeature.properties["@relations"] || [])
      .map((r) => r.ref)
      .filter(Boolean);

    if (lines.length > 0) {
      transferLinesMap.set(stopName, [...new Set(lines)]);
    }
  }

  // 📋 4. Покажи всички линии за всяка спирка за прекачване
  if (transferLinesMap.size > 0) {
    htmlList.push(
      "<li><b>Други линии, минаващи през спирките за прекачване:</b><ul>"
    );
    for (const [stopName, lines] of transferLinesMap.entries()) {
      htmlList.push(`<li>${stopName}: ${Array.from(lines).join(", ")}</li>`);
    }
    htmlList.push("</ul></li>");
  }

  resultBox.innerHTML = `<p><b>Маршрути с прекачвания:</b></p><ul>${htmlList.join(
    ""
  )}</ul>`;
  resultBox.style.display = "block";
}

function findBestRouteWithTransfers(startId, endId) {
  const distances = new Map(); // Минимално известно разстояние до всяка спирка
  const previous = new Map(); // За проследяване на пътя назад
  const visited = new Set(); // Посетени спирки
  const queue = new Set(); // Опашка от спирки за обхождане

  distances.set(startId, 0);
  queue.add(startId);

  while (queue.size > 0) {
    // Намери най-близката спирка в момента
    let currentId = null;
    let minDistance = Infinity;

    for (const id of queue) {
      const dist = distances.get(id) ?? Infinity;
      if (dist < minDistance) {
        minDistance = dist;
        currentId = id;
      }
    }

    if (currentId === null) break; // Няма достижима спирка

    queue.delete(currentId);
    visited.add(currentId);

    if (currentId === endId) {
      // Стигнахме до крайната спирка, сглобяваме пътя
      const path = [];
      let u = endId;
      while (previous.has(u)) {
        const prev = previous.get(u);
        path.unshift({
          from: prev.from,
          to: u,
          via: prev.via, // съдържа routeId, direction и др.
        });
        u = prev.from;
      }
      return path;
    }

    const neighbors = window.stopGraph.get(currentId) || [];

    for (const neighbor of neighbors) {
      const neighborId = neighbor.stopId;
      const weight = neighbor.weight ?? 1;

      if (visited.has(neighborId)) continue;

      const newDistance = (distances.get(currentId) ?? Infinity) + weight;
      const oldDistance = distances.get(neighborId) ?? Infinity;

      const prevEntry = previous.get(neighborId);
      const isDifferentRoute =
        prevEntry && prevEntry.via?.routeId !== neighbor.routeId;

      // Записваме, ако е по-къс път или различна линия (прекачване)
      if (newDistance < oldDistance || isDifferentRoute) {
        distances.set(neighborId, newDistance);
        previous.set(neighborId, {
          from: currentId,
          via: neighbor,
        });
        queue.add(neighborId);
      }
    }
  }

  return null; // няма валиден път
}

function getValidStopId(stop) {
  const candidates = stop.properties?.["@relations"] || [];
  for (const rel of candidates) {
    if (window.stopGraph.has(rel.stop_id)) {
      return rel.stop_id;
    }
  }
  return null;
}

// превключване на табовете
document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const selectedTab = btn.getAttribute("data-tab");

    // Премахни всички активни табове и бутони
    document
      .querySelectorAll(".tab-btn")
      .forEach((b) => b.classList.remove("active"));
    document
      .querySelectorAll(".tab-content")
      .forEach((tab) => tab.classList.remove("active"));

    // Активирай избрания
    btn.classList.add("active");
    document.getElementById(selectedTab)?.classList.add("active");
  });
});

document.getElementById("route-search-form").addEventListener("submit", (e) => {
  e.preventDefault();

  // 🔍 Взимаме името на началната и крайната спирка от формата
  const startName = document
    .getElementById("start-stop")
    .value.trim()
    .toLowerCase();
  const endName = document
    .getElementById("end-stop")
    .value.trim()
    .toLowerCase();

  findMatchingRoutes(startName, endName);
  // 🗺️ Взимаме всички спирки от маркерите на картата
  const stops = window.allStopMarkers.map((m) => m._stopData);

  // 🔎 Търсим съвпадения по име
  const start = stops.find(
    (s) => s.properties.name?.toLowerCase() === startName
  );
  const end = stops.find((s) => s.properties.name?.toLowerCase() === endName);

  if (!start || !end) {
    alert("Не са намерени спирки с тези имена.");
    return;
  }

  // 🆔 Взимаме всички валидни stop_id за старт и край
  const startIds = (start.properties?.["@relations"] || [])
    .map((r) => r.stop_id)
    .filter((id) => window.stopGraph.has(id));
  const endIds = (end.properties?.["@relations"] || [])
    .map((r) => r.stop_id)
    .filter((id) => window.stopGraph.has(id));

  if (startIds.length === 0 || endIds.length === 0) {
    alert("Няма връзка в графа за начална или крайна спирка.");
    return;
  }

  // 🚍 Търсим най-добрия път с прекачвания
  let bestPath = null;
  for (const startId of startIds) {
    for (const endId of endIds) {
      const path = findBestRouteWithTransfers(startId, endId);
      if (path) {
        bestPath = path;
        break;
      }
    }
    if (bestPath) break;
  }

  if (!bestPath) {
    alert("Не беше намерен маршрут с прекачване.");
    return;
  }

  // 🧹 Изчистваме предишни резултати
  if (window.highlightedRoute) map.removeLayer(window.highlightedRoute);
  window.searchMarkers.forEach((m) => map.removeLayer(m));
  window.searchMarkers = [];

  // 🎯 Рисуваме само нужните участъци от маршрути
  const group = L.featureGroup();
  for (const segment of bestPath) {
    const routeId = segment.via.routeId;
    if (!routeId) continue; // пропускаме прекачвания

    const route = window.allRoutes.find((r) => r.properties["@id"] === routeId);
    if (!route) continue;

    const fromId = segment.from;
    const toId = segment.to;

    const fromStop = route.properties.segments.find(
      (s) => s.stop?.id === fromId
    );
    const toStop = route.properties.segments.find((s) => s.stop?.id === toId);
    if (!fromStop || !toStop) continue;

    const coords = route.geometry.coordinates;
    const latlngs = coords.map(([lng, lat]) => L.latLng(lat, lng));

    const findClosestIndex = (target) => {
      let minDist = Infinity;
      let idx = -1;
      latlngs.forEach((p, i) => {
        const dist = p.distanceTo(target);
        if (dist < minDist) {
          minDist = dist;
          idx = i;
        }
      });
      return idx;
    };

    const fromCoord = L.latLng(fromStop.stop.latitude, fromStop.stop.longitude);
    const toCoord = L.latLng(toStop.stop.latitude, toStop.stop.longitude);

    const fromIdx = findClosestIndex(fromCoord);
    const toIdx = findClosestIndex(toCoord);
    if (fromIdx === -1 || toIdx === -1) continue;

    const [startIdx, endIdx] =
      fromIdx < toIdx ? [fromIdx, toIdx] : [toIdx, fromIdx];
    const sliced = route.geometry.coordinates.slice(startIdx, endIdx + 1);

    const partial = {
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates: sliced,
      },
      properties: route.properties,
    };

    const color = route.properties.tr_color || "#007bff";
    const layer = L.geoJSON(partial, {
      style: {
        color,
        weight: window.debugSettings.highlightWeight,
        opacity: 1,
      },
    }).addTo(map);

    window.foundRouteLayers.push(layer);
  }

  // 🔎 Фокус върху маршрута
  map.fitBounds(L.featureGroup(window.foundRouteLayers).getBounds().pad(0.2));

  const startCoord = start.geometry.coordinates;
  const endCoord = end.geometry.coordinates;

  const startMarker = L.marker([startCoord[1], startCoord[0]], {
    icon: window.blueIcon,
  }).addTo(map);

  const endMarker = L.marker([endCoord[1], endCoord[0]], {
    icon: window.redIcon,
  }).addTo(map);

  window.searchMarkers.push(startMarker, endMarker);

  // ✂️ Показваме само участъците от линиите между нужните спирки
  for (const segment of bestPath) {
    const routeId = segment.via.routeId;
    if (!routeId) continue;

    const route = window.allRoutes.find((r) => r.properties["@id"] === routeId);
    if (!route) continue;

    const fromId = segment.from;
    const toId = segment.to;

    const fromStop = route.properties.segments.find(
      (s) => s.stop?.id === fromId
    );
    const toStop = route.properties.segments.find((s) => s.stop?.id === toId);
    if (!fromStop || !toStop) continue;

    const coords = route.geometry.coordinates;
    const latlngs = coords.map(([lng, lat]) => L.latLng(lat, lng));

    const findClosestIndex = (target) => {
      let minDist = Infinity;
      let idx = -1;
      latlngs.forEach((p, i) => {
        const dist = p.distanceTo(target);
        if (dist < minDist) {
          minDist = dist;
          idx = i;
        }
      });
      return idx;
    };

    const fromCoord = L.latLng(fromStop.stop.latitude, fromStop.stop.longitude);
    const toCoord = L.latLng(toStop.stop.latitude, toStop.stop.longitude);

    const fromIdx = findClosestIndex(fromCoord);
    const toIdx = findClosestIndex(toCoord);
    if (fromIdx === -1 || toIdx === -1) continue;

    const [startIdx, endIdx] =
      fromIdx < toIdx ? [fromIdx, toIdx] : [toIdx, fromIdx];
    const sliced = route.geometry.coordinates.slice(startIdx, endIdx + 1);

    const partial = {
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates: sliced,
      },
      properties: route.properties,
    };

    const color = route.properties.tr_color || "#007bff";
    const layer = L.geoJSON(partial, {
      style: {
        color,
        weight: window.debugSettings.highlightWeight,
        opacity: 1,
      },
    }).addTo(map);

    window.foundRouteLayers.push(layer);
  }

  map.fitBounds(L.featureGroup(window.foundRouteLayers).getBounds().pad(0.2));
});

function showStopsForLine(ref) {
  const stops = window.allStopMarkers.map((m) => m._stopData);
  const list = [];

  for (const stop of stops) {
    const rels = stop.properties["@relations"] || [];
    if (rels.some((r) => r.ref === ref)) {
      const stopId = rels.find((r) => r.ref === ref)?.stop_id;
      const inGraph = window.stopGraph.has(stopId);
      list.push({ name: stop.properties.name, stopId, inGraph });
    }
  }

  console.table(list);
}

document.addEventListener("DOMContentLoaded", () => {
  const infoPanel = document.getElementById("info-panel");
  const expandBtn = document.getElementById("expand-info-btn");

  if (infoPanel && expandBtn) {
    expandBtn.addEventListener("click", () => {
      const isCollapsed = infoPanel.classList.contains("collapsed");
      infoPanel.classList.toggle("collapsed", !isCollapsed);
      infoPanel.classList.toggle("expanded", isCollapsed);
      expandBtn.textContent = isCollapsed ? "⬇️" : "⬆️";
    });

    // по подразбиране на мобилно: collapsed
    if (window.innerWidth <= 768) {
      infoPanel.classList.add("collapsed");
    }
  }
});
