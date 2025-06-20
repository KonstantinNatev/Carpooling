const map = L.map("map").setView([42.6977, 23.3219], 13);

let highlightedRoute = null;
let startMarker = null;
let endMarker = null;
let geoLayer = null;
let selectedRouteLabel = "";
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

L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: "&copy; OpenStreetMap contributors",
}).addTo(map);

const clearMapHighlights = () => {
  if (highlightedRoute) map.removeLayer(highlightedRoute);
  if (startMarker) map.removeLayer(startMarker);
  if (endMarker) map.removeLayer(endMarker);
  highlightedRoute = startMarker = endMarker = null;
  selectedRouteLabel = "";
  updateDynamicLegend([]);
};

const updateDynamicLegend = (routeColorPairs) => {
  const legendRoutes = document.getElementById("legend-routes");
  if (!legendRoutes) return;
  const selected = selectedRouteLabel
    ? `<div style="margin-bottom:4px;"><strong style="color:#004aad;">✅ ${selectedRouteLabel}</strong></div>`
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
    // Ако вече е избрана същата линия – деселектирай я
    if (selectedRouteLabel && selectedRouteLabel.includes(routeId)) {
      clearMapHighlights();
      return;
    }
  
    clearMapHighlights();
  
    const selectedRoute = window.allRoutes.find(
      (r) => r.properties?.["@id"] === routeId
    );
    if (!selectedRoute) return;
  
    const color = selectedRoute.properties.tr_color || window.getRouteColor(1);
  
    highlightedRoute = L.geoJSON(selectedRoute.geometry, {
      style: {
        color,
        weight: window.debugSettings.highlightWeight,
        opacity: 1,
      },
    }).addTo(map);

    // Показваме спирките над селектираната линия
    if (Array.isArray(window.allStopMarkers)) {
      window.allStopMarkers.forEach((marker) => {
        marker.bringToFront();
      });
    }

    highlightedRoute.on("click", () => {
      clearMapHighlights();
    });
  
    const coords = turf.getCoords(selectedRoute.geometry);
    const [firstCoord, lastCoord] =
      selectedRoute.geometry.type === "LineString"
        ? [coords[0], coords[coords.length - 1]]
        : (() => {
            const longest = coords.sort((a, b) => b.length - a.length)[0];
            return [longest[0], longest[longest.length - 1]];
          })();
  
    startMarker = L.marker([firstCoord[1], firstCoord[0]], {
      icon: window.blueIcon,
    }).addTo(map);
  
    endMarker = L.marker([lastCoord[1], lastCoord[0]], {
      icon: window.redIcon,
    }).addTo(map);
  
    selectedRouteLabel = `${routeId}`; // Променено да се използва routeId за сравнение по-горе
    updateDynamicLegend([]);
  };

  window.allStopMarkers = [];

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
    }).addTo(map);

    marker._stopData = stop;
    window.allStopMarkers.push(marker);

    const allRelations = stop.properties?.["@relations"] || [];

    marker.on("mouseover", () => {
      const { html } = window.popUpTemplate(stop, routes);
      marker._popup = L.popup().setLatLng(latlng).setContent(html).openOn(map);

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

      updateDynamicLegend(routeColorPairs);

      marker.once("mouseout", () => {
        if (window.hoverLayerGroup) {
          map.removeLayer(window.hoverLayerGroup);
          window.hoverLayerGroup = null;
        }
        updateDynamicLegend([]);
        if (marker._popup) map.closePopup(marker._popup);

        popupCloseTimeout = setTimeout(() => {
          if (window.hoverLayerGroup) {
            map.removeLayer(window.hoverLayerGroup);
            window.hoverLayerGroup = null;
          }
          updateDynamicLegend([]);
          if (marker._popup) map.closePopup(marker._popup);
        }, 200); // 200ms буфер
      });

      clearTimeout(popupCloseTimeout);
    });

    marker.on("click", () => {
      /**
       * Проверяваме дали същестува ли pop up
       * Различни ли са кординатите му от тези на предния спрямо точката
       * И накрая проверяваме  дали дадения layer е добавен към картата
       */
      if (
        currentPopup &&
        !currentPopup.getLatLng().equals(latlng) &&
        map.hasLayer(currentPopup)
      ) {
        map.closePopup(currentPopup);
      }

      if (
        currentPopup &&
        currentPopup.getLatLng().equals(latlng) &&
        map.hasLayer(currentPopup)
      ) {
        return
      }

      const { html, scheduleHtml } = window.popUpTemplate(stop, routes);

      const firstRelation = allRelations[0];
      if (firstRelation && firstRelation.rel) {
        // Намираме съответния маршрут по line_id и име на direction (ако е нужно)
        const route = routes.find(
          (r) =>
            r.properties.line_id === firstRelation.rel &&
            r.properties.direction === firstRelation.direction
        );

        if (route) {
          // Извикваме съществуващата функция за селекция
          window.highlightRoute(route.properties["@id"]);
        }
      }

      const popup = L.popup({
        closeButton: false,
        autoClose: false,
        closeOnClick: false,
      })
        .setLatLng(latlng)
        .setContent(html);

      popup.on("add", () => {
        const btn = document.getElementById("btn-schedule-view");
        if (btn) {
          btn.addEventListener("click", () => {
            showSchedulePanel(scheduleHtml);
          });
        }

        const closeBtn = document.getElementById("popup-close-btn");
        if (closeBtn && currentPopup) {
          closeBtn.addEventListener("click", () => {
            map.closePopup(popup);
            currentPopup = null;
          });
        }
      });

      popup.openOn(map);
      currentPopup = popup;
    });
  });

  document.querySelectorAll(".route-type").forEach((cb) => {
    cb.addEventListener("change", () => {
      const checkedTypes = Array.from(
        document.querySelectorAll(".route-type:checked")
      ).map((cb) => cb.value.trim().toLowerCase());

      if (!geoLayer) return;

      geoLayer.clearLayers();
      const filteredRoutes = window.allRoutes.filter((feature) => {
        const rawType = feature.properties.type || "";
        const normalized = rawType.trim().toLowerCase().replace(/[\s_]/g, "");
        return checkedTypes.includes(normalized);
      });
      geoLayer.addData(filteredRoutes);

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
          if (!map.hasLayer(marker)) marker.addTo(map);
        } else {
          if (map.hasLayer(marker)) map.removeLayer(marker);
        }
      });
    });
  });

  document.querySelectorAll(".route-type").forEach((cb) => {
    cb.addEventListener("change", () => {
      document.getElementById("applySettingsBtn").click();
    });
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
        if (highlightedRoute) {
          highlightedRoute.setStyle({
            weight: highlightWeight,
          });
        }
      });
  }
});
