window.renderStopPanel = function (stop) {
  const allRelations = stop.properties?.["@relations"] || [];
  const stopName = stop.properties.name || "Без име";

  // Обнови стиловете на всички маркери
  window.appState.allStopMarkers.forEach((m) =>
    m.setStyle({
      color: "#343a40",
      weight: window.appState.debugSettings.pointSize,
      radius: window.appState.debugSettings.pointSize,
    })
  );

  // Обнови заглавието
  document.getElementById("stop-name").textContent = stopName;

  const routes = window.appState.allRoutes || [];
  const selectedRouteId = window.appState.selectedRouteLabel;

  // Групирай по линия
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

  // Активирай таб
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    const tabId = btn.getAttribute("data-tab");
    const isStopTab = tabId === "tab-stop";

    btn.classList.toggle("active", isStopTab);
    document.getElementById(tabId)?.classList.toggle("active", isStopTab);
  });

  window.appState.lastSelectedStop = stop;

  if (!window.appState.selectedRouteLabel && !window.appState.skipAutoSelection) {
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
        window.showSchedulePanel?.(html);
      }
    });
  });
};
  