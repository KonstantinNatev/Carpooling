document.addEventListener("DOMContentLoaded", async () => {
  window.appState.map = window.initMap();
  window.registerDomListeners();

  try {
    const { allStops, allRoutes } = await window.loadAllScrapedRoutes();
    const graph = window.buildStopGraph(allStops, allRoutes);

    window.appState.allStopMarkers = [];
    window.appState.allRoutes = allRoutes;
    window.appState.stopGraph = graph;

    if (typeof window.renderMapData === "function") {
      window.renderMapData({ features: [...allStops, ...allRoutes] });
    } else {
      console.warn("⚠️ renderMapData не е дефинирана");
    }
  } catch (error) {
    console.error("❌ Грешка при инициализацията на картата:", error);
  }
});
