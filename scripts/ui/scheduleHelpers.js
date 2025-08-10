window.getScheduleButton = function (stopId, route, stops) {
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
  };
  
  window.createLineItemHTML = function ({ icon, route, step, stops }) {
    const routeId = route.properties["@id"];
    const scheduleButtonHtml = window.getScheduleButton(step.from, route, stops);
  
    return `
      <div class="line-item">
        <div class="line-info">
          <span class="line-icon">${icon}</span>
          <span class="line-direction">${route.properties.direction}</span>
        </div>
        <div class="line-details">
          <b>${route.properties.ref}</b> от <i>${window.getStopName(
      step.from
    )}</i> до <i>${window.getStopName(step.to)}</i>
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
  };
  
  window.getStopName = function (stopId) {
    const stops = window.appState.allStopMarkers.map((m) => m._stopData);
    for (const stop of stops) {
      const rels = stop.properties["@relations"] || [];
      if (rels.some((r) => r.stop_id === stopId)) {
        return stop.properties.name || "Без име";
      }
    }
    return "Непозната спирка";
  };
  