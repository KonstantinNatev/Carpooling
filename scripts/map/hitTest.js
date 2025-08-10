// scripts/map/hitTest.js
(function () {
  const R = 6378137; // меркаторен радиус (EPSG:3857)

  function projectToMeters(lat, lng) {
    // Leaflet's WebMercator projection (същата формула, опростена)
    const x = (lng * Math.PI / 180) * R;
    const y = Math.log(Math.tan((Math.PI / 4) + (lat * Math.PI / 360))) * R;
    return { x, y };
  }

  function metersPerPixelAtLat(lat, zoom) {
    // 156543.03392 * cos(lat) / 2^zoom
    return 156543.03392 * Math.cos(lat * Math.PI / 180) / Math.pow(2, zoom);
  }

  function buildStopIndex(allStopMarkers) {
    // Прост grid‑index по меркаторни метри
    const cellSizeM = 120; // ≈ квартал; достатъчно за бърз nearest scan
    const grid = new Map();

    function key(cx, cy) { return `${cx}:${cy}`; }

    const entries = allStopMarkers.map((marker) => {
      const ll = marker.getLatLng();
      const { x, y } = projectToMeters(ll.lat, ll.lng);
      const cx = Math.floor(x / cellSizeM);
      const cy = Math.floor(y / cellSizeM);
      const rels = (marker._stopData?.properties?.["@relations"] || []).length;
      const e = { marker, lat: ll.lat, lng: ll.lng, x, y, cx, cy, importance: rels };
      const k = key(cx, cy);
      if (!grid.has(k)) grid.set(k, []);
      grid.get(k).push(e);
      return e;
    });

    function queryNearest(latlng, map, pxTolerance) {
      if (!map) return null;
      const z = map.getZoom();
      const tolM = pxTolerance * metersPerPixelAtLat(latlng.lat, z);

      const { x, y } = projectToMeters(latlng.lat, latlng.lng);
      const cx = Math.floor(x / cellSizeM);
      const cy = Math.floor(y / cellSizeM);

      // обхождаме клетката и 8‑те съседни
      let best = null;
      let bestDist = Infinity;

      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          const arr = grid.get(`${cx + dx}:${cy + dy}`);
          if (!arr) continue;
          for (const e of arr) {
            const d = Math.hypot(e.x - x, e.y - y);
            if (d <= tolM) {
              if (d < bestDist) { bestDist = d; best = e; }
              else if (Math.abs(d - bestDist) < 1e-6) {
                // равни разстояния → по‑важна спирка (повече relations)
                if (best && e.importance > best.importance) best = e;
              }
            }
          }
        }
      }

      return best ? best.marker : null;
    }

    return { queryNearest };
  }

  window.hitTest = { buildStopIndex, metersPerPixelAtLat };
})();
