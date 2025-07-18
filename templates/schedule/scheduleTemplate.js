window.scheduleTemplate = (allRelations, stopName = "") => {
  if (!allRelations.length)
    return `<em class="empty-state">Няма налично разписание</em>`;

  return (
    allRelations
      .filter(
        (relation) =>
          Array.isArray(relation.schedule) && relation.schedule.length
      )
      .map((relation) => {
        const blocks = relation.schedule
          .map((entry) => {
            const timeTags = (entry.times || [])
              .map((time) => `<span class="time-tag">${time}</span>`)
              .join("");
            return `
                <div class="schedule-block">
                    <div class="schedule-label">
                        ${entry.label}
                    </div>
                    <div class="schedule-times">
                        ${timeTags}
                    </div>
                </div>
            `;
          })
          .join("");

        return `
            <div class="schedule-group">
                <div class="schedule-group-title">
                    Спирка <b>${stopName}</b>
                    </br>
                    </br>
                    Маршрут <b>${relation.ref}</b>: ${relation.direction}
                </div>
                ${blocks}
            </div>`;
      })
      .join("") || `<em class="empty-state">Няма налично разписание</em>`
  );
};
