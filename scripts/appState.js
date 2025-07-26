window.appState = {
  map: null,
  allRoutes: [],
  allStopMarkers: [],
  stopGraph: new Map(),
  selectedRouteLabel: "",
  highlightedRoute: null,
  highlightedStopMarkers: [],
  highlightedStopLayerGroup: null,
  searchMarkers: [],
  foundRouteLayers: [],
  hoverLayerGroup: null,
  lastSelectedStop: null,
  skipAutoSelection: false,
  debugSettings: {
    pointSize: 5,
    lineWeight: 4,
    highlightWeight: 6,
  }
};