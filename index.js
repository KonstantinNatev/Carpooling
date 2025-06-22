window.map = L.map("map").setView([42.6977, 23.3219], 13);

L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: "&copy; OpenStreetMap contributors",
}).addTo(window.map);

window.window.highlightedRoute = null;
window.startMarker = null;
window.endMarker = null;
let geoLayer = null;
window.selectedRouteLabel = "";
let currentPopup = null;
let popupCloseTimeout = null;

window.hoverLayerGroup = null;
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
    const res = await fetch("/schedules/index.json");
    const files = await res.json();
    const allStops = [];
    const allRoutes = [];

    for (const file of files) {
      const data = await fetch(`/schedules/${file}`).then((r) => r.json());
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
    renderMapData(data);
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
              window.scheduleTemplate([rel])
            )}">Разписание</button>
          </div>
        </div>
      `;
    });

    html += `</div></div>`;
  });

  const stopContent = document.getElementById("stop-info-content");
  stopContent.innerHTML = html;
  document.getElementById("stop-info-panel").style.display = "block";
  window.lastSelectedStop = stop;

  // Ако все още няма избрана линия – селектирай първата от списъка
  if (!window.selectedRouteLabel) {
    const firstBtn = document.querySelector(".preview-btn");
    if (firstBtn) {
      const firstRouteId = firstBtn.getAttribute("data-route-id");
      if (firstRouteId) {
        window.highlightRoute(firstRouteId);
      }
    }
  }

  //  Остави го за сега !!!
  //
  //  Добавяме event listeners след DOM рендерирането
  // document.querySelectorAll(".preview-btn").forEach((btn) => {
  //   btn.addEventListener("click", () => {
  //     const routeId = btn.getAttribute("data-route-id");
  //     if (routeId) {
  //       window.highlightRoute(routeId); //  преизареди renderStopPanel
  //     }
  //   });
  // });

  document.querySelectorAll(".schedule-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const html = btn.getAttribute("data-schedule-html");
      if (html) {
        showSchedulePanel(html);
      }
    });
  });

  document.getElementById("stop-panel-close")?.addEventListener("click", () => {
    document.getElementById("stop-info-panel").style.display = "none";
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
    if (window.selectedRouteLabel && window.selectedRouteLabel.includes(routeId)) {
      console.error("same route clicked → deselecting");
      window.clearMapHighlights();
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
  
    if (Array.isArray(window.allStopMarkers)) {
      window.allStopMarkers.forEach((marker) => {
        marker.bringToFront();
      });
    }
  
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
      }).setLatLng(latlng).setContent(html).openOn(map);

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
    })

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
        if (!stopClusterGroup.hasLayer(marker)) stopClusterGroup.addLayer(marker);
      } else {
        if (stopClusterGroup.hasLayer(marker)) stopClusterGroup.removeLayer(marker);
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
    const debugPanel = document.getElementById("debbug-panel");
    if (debugPanel) {
      debugPanel.style.display = "none";
    }
  }

  const { pointSize, lineWeight, highlightWeight } = debugSettings;
  document.getElementById("pointSizeInput").value = pointSize;
  document.getElementById("lineWeightInput").value = lineWeight;
  document.getElementById("highlightWeightInput").value = highlightWeight;
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
