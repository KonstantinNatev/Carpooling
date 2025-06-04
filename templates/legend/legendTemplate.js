export const legendTemplate = () => {
  return `
    <div class="legend-container">
      <strong class="legend-title">🗺️ Легенда</strong><br>
      <div class="legend-stop">
        <span class="legend-dot"></span> Спирка
      </div>
      <div>
        <img class="legend-icon" src="https://maps.google.com/mapfiles/ms/icons/blue-dot.png" /> Начална точка
      </div>
      <div>
        <img class="legend-icon" src="https://maps.gstatic.com/mapfiles/ms2/micons/red-dot.png" /> Крайна точка
      </div>
      <hr>
      <div id="legend-routes"></div>
    </div>`;
};
