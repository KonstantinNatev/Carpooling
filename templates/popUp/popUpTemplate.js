import { scheduleTemplate } from "../schedule/scheduleTemplate.js";

export const popUpTemplate = (stop, routes) => {
  const name = stop.properties.name || "Неизвестна спирка";
  const allRelations = stop.properties?.["@relations"] || [];

  const groupedByLine = allRelations.reduce((acc, rel) => {
    if (!acc[rel.ref]) acc[rel.ref] = [];
    acc[rel.ref].push(rel.rel);
    return acc;
  }, {});

  const allLines = Object.entries(groupedByLine)
    .map(([lineLabel, lineIds]) => {
      const matchedRoutes = routes.filter((r) =>
        lineIds.includes(r.properties?.line_id)
      );
      const buttons = matchedRoutes
        .map((route) => {
          const { direction = "", type = "" } = route.properties;
          const icon = type === "tram" ? "🚋" : "🚌";
          return `
            <button
              onclick="window.highlightRoute('${route.properties["@id"]}')" 
              class="direction-button">
              ${icon} <span>${direction}</span>
            </button>
          `;
        })
        .join("");

      return `
        <div class="line-group">
          <div class="line-label">Линия: ${lineLabel}</div>
          ${buttons}
        </div>
      `;
    })
    .join("");

  const scheduleHtml = scheduleTemplate(allRelations);

  const html = `
    <div class="popup-container">
      <button onclick="this.closest('.leaflet-popup').remove();" class="popup-close-btn">✖</button>
      <div class="popup-inner">
        <div class="popup-title">Спирка: ${name}</div>
        <div class="popup-subtitle">Избери посока:</div>
        ${allLines}
        <hr>
        <div class="schedule-label">Разписание:</div>
        <button id="btn-schedule-view"
          data-schedule-html="${encodeURIComponent(scheduleHtml)}"
          class="schedule-btn">
          Виж пълно разписание
        </button>
      </div>
    </div>
  `;

  return { html, scheduleHtml };
};
