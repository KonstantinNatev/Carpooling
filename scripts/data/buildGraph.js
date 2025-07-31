window.buildStopGraph = function (allStops, allRoutes) {
  const graph = new Map();

  // 1. Прекачвания на базата на близки координати
  for (let i = 0; i < allStops.length; i++) {
    for (let j = i + 1; j < allStops.length; j++) {
      const a = allStops[i], b = allStops[j];
      const [lng1, lat1] = a.geometry.coordinates;
      const [lng2, lat2] = b.geometry.coordinates;
      const dist = Math.sqrt((lat1 - lat2) ** 2 + (lng1 - lng2) ** 2);

      if (dist < 0.0001) {
        const aId = a.properties["@relations"]?.[0]?.stop_id;
        const bId = b.properties["@relations"]?.[0]?.stop_id;
        if (!aId || !bId || aId === bId) continue;

        if (!graph.has(aId)) graph.set(aId, []);
        if (!graph.has(bId)) graph.set(bId, []);

        graph.get(aId).push({
          stopId: bId,
          line: "прекачване",
          direction: "↔",
          routeId: null,
          type: "transfer",
          weight: 1,
        });

        graph.get(bId).push({
          stopId: aId,
          line: "прекачване",
          direction: "↔",
          routeId: null,
          type: "transfer",
          weight: 1,
        });
      }
    }
  }

  // 2. Връзки по маршрути
  for (const feature of allRoutes) {
    const segments = feature.properties?.segments || [];
    for (let i = 0; i < segments.length - 1; i++) {
      const from = segments[i]?.stop, to = segments[i + 1]?.stop;
      if (!from || !to) continue;

      if (!graph.has(from.id)) graph.set(from.id, []);
      if (!graph.has(to.id)) graph.set(to.id, []);

      const common = {
        routeId: feature.properties["@id"],
        line: feature.properties.ref,
        type: feature.properties.type,
        direction: feature.properties.direction,
        weight: 1,
      };

      graph.get(from.id).push({ stopId: to.id, ...common });
      graph.get(to.id).push({ stopId: from.id, ...common });
    }
  }

  // 3. Свържи всички спирки със същия stop_id (прекачвания между различни линии)
  const stopIdToPhysicalIds = new Map();
  for (const stop of allStops) {
    const rels = stop.properties["@relations"] || [];
    for (const rel of rels) {
      if (!stopIdToPhysicalIds.has(rel.stop_id)) {
        stopIdToPhysicalIds.set(rel.stop_id, new Set());
      }
      stopIdToPhysicalIds.get(rel.stop_id).add(rel.stop_id); // в някои случаи може да искаш физически ID
    }
  }

  for (const [stopId, ids] of stopIdToPhysicalIds.entries()) {
    for (const fromId of ids) {
      for (const toId of ids) {
        if (fromId === toId) continue;
        if (!graph.has(fromId)) graph.set(fromId, []);
        graph.get(fromId).push({
          stopId: toId,
          routeId: null,
          line: "прекачване",
          direction: "↔",
          type: "transfer",
          weight: 1,
        });
      }
    }
  }

  // console.log("✅ Изграден граф с", graph.size, "спирки");
  return graph;
};
