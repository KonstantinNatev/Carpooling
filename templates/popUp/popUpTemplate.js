window.popUpTemplate = (stop, routes) => {
  const name = stop.properties.name || "Неизвестна спирка";
  const allRelations = stop.properties?.["@relations"] || [];

  const uniqueLines = allRelations
    .map((rel) => {
      const route = routes.find(
        (r) =>
          r.properties.line_id === rel.rel &&
          r.properties.direction === rel.direction
      );
      if (!route) return null;

      const ref = route.properties.ref || "?";
      const color = route.properties.tr_color || "#888";
      return { ref, color };
    })
    .filter(Boolean)
    .reduce((acc, curr) => {
      if (!acc.some((l) => l.ref === curr.ref)) acc.push(curr);
      return acc;
    }, []);

  const lineBadges = uniqueLines
    .map(
      ({ ref, color }) =>
        `<span class="line-badge" style="background:${color}">${ref}</span>`
    )
    .join("");

  const html = `
    <div class="popup-container">
      <div class="popup-title">📍 ${name}</div>
      <div class="popup-badges">${lineBadges || "<em>Няма налични линии</em>"}</div>
    </div>
  `;

  return { html }; // scheduleHtml вече не е нужен за hover
};
