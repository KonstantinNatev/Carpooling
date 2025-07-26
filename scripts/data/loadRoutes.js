window.loadAllScrapedRoutes = async function () {
    const res = await fetch("../../schedules/index.json");
    const files = await res.json();
    const allStops = [];
    const allRoutes = [];
  
    for (const file of files) {
      const data = await fetch(`../../schedules/${file}`).then((r) => r.json());
      const routes = data.routes || [];
  
      for (const route of routes) {
        if (!route?.details?.polyline) continue;
  
        const stops = route?.segments?.map((s) => s.stop).filter(Boolean) || [];
        const lineName = data.line?.name || "";
        const refId = `relation/${data.line?.id}`;
        const from = route?.details?.from || "-";
        const to = route?.details?.to || "-";
  
        const rawType = (data.line.tr_name || "").trim().toLowerCase().replace(/[\s_]/g, "");
        const typeMap = {
          трамвай: "tram",
          тролейбус: "trolleybus",
          автобус: "bus",
          tram: "tram",
          trolleybus: "trolleybus",
          bus: "bus",
        };
        const type = typeMap[rawType] || rawType;
  
        const coords = route.details.polyline
          .replace("LINESTRING (", "")
          .replace(")", "")
          .split(", ")
          .map((pair) => {
            const [lng, lat] = pair.split(" ").map(Number);
            return [lat, lng];
          });
  
        const geometry = {
          type: "LineString",
          coordinates: coords.map(([lat, lng]) => [lng, lat]),
        };
  
        allRoutes.push({
          type: "Feature",
          geometry,
          properties: {
            ref: lineName,
            direction: route.name,
            type,
            "@id": `${refId}_${route.id}`,
            tr_color: data.line?.tr_color || "#888",
            tr_icon: data.line?.tr_icon || "",
            line_id: data.line?.id,
            route_id: route.id,
            from,
            to,
            segments: route.segments || [],
          },
        });
  
        for (const stop of stops) {
          const lat = parseFloat(stop.latitude);
          const lng = parseFloat(stop.longitude);
  
          const existing = allStops.find((s) => {
            const [sLng, sLat] = s.geometry.coordinates;
            return Math.abs(sLat - lat) < 0.00001 && Math.abs(sLng - lng) < 0.00001;
          });
  
          const scheduleMap = {};
          for (const entry of stop.times || []) {
            const label = entry.code || "Няма етикет";
            if (!scheduleMap[label]) scheduleMap[label] = new Set();
            scheduleMap[label].add(entry.time);
          }
  
          const relation = {
            rel: data.line?.id,
            ref: data.line?.name,
            direction: route.name,
            stop_id: stop.id,
            schedule: Object.entries(scheduleMap).map(([label, times]) => ({
              label,
              times: Array.from(times).sort(),
            })),
          };
  
          if (existing) {
            const already = existing.properties["@relations"].some(r => r.rel === relation.rel);
            if (!already) existing.properties["@relations"].push(relation);
          } else {
            allStops.push({
              type: "Feature",
              geometry: { type: "Point", coordinates: [lng, lat] },
              properties: {
                name: stop.name,
                "@relations": [relation],
              },
            });
          }
        }
      }
    }
  
    return { allStops, allRoutes };
  };
  