window.findMatchingRoutes = async function (startStopName, endStopName) {
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
  
    const getValidIds = (candidates) =>
      candidates
        .flatMap((s) => (s.properties["@relations"] || []).map((r) => r.stop_id))
        .filter((id) => window.appState.stopGraph.has(id));
  
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

    const htmlList = window.visualizeRouteWithTransfers(bestPath, stops);
    resultBox.innerHTML = `
    <p><b>Маршрути с прекачвания:</b></p>
    <ul>${htmlList.join("")}</ul>
    `;
    resultBox.style.display = "block";

  };
  