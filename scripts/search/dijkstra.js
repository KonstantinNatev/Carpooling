window.findBestRouteWithTransfers = function (startId, endId) {
  // console.log("🚀 Търсене от", startId, "до", endId);
  // console.log("Граф:", window.appState.stopGraph);

  const distances = new Map(); // Минимално известно разстояние до всяка спирка
  const previous = new Map(); // За проследяване на пътя назад
  const visited = new Set(); // Посетени спирки
  const queue = new Set(); // Опашка от спирки за обхождане

  distances.set(startId, 0);
  queue.add(startId);

  while (queue.size > 0) {
    // Намери най-близката спирка в момента
    let currentId = null;
    let minDistance = Infinity;

    for (const id of queue) {
      const dist = distances.get(id) ?? Infinity;
      if (dist < minDistance) {
        minDistance = dist;
        currentId = id;
      }
    }

    if (currentId === null) break; // Няма достижима спирка

    queue.delete(currentId);
    visited.add(currentId);

    if (currentId === endId) {
      // Стигнахме до крайната спирка, сглобяваме пътя
      const path = [];
      let u = endId;
      while (previous.has(u)) {
        const prev = previous.get(u);
        path.unshift({
          from: prev.from,
          to: u,
          via: prev.via, // съдържа routeId, direction и др.
        });
        u = prev.from;
      }
      
      return path;
    }

    const neighbors = window.appState.stopGraph.get(currentId) || [];
    for (const neighbor of neighbors) {
      const neighborId = neighbor.stopId;
      const weight = neighbor.weight ?? 1;

      if (visited.has(neighborId)) continue;

      const newDistance = (distances.get(currentId) ?? Infinity) + weight;
      const oldDistance = distances.get(neighborId) ?? Infinity;

      const prevEntry = previous.get(neighborId);
      const isDifferentRoute =
        prevEntry && prevEntry.via?.routeId !== neighbor.routeId;

      // Записваме, ако е по-къс път или различна линия (прекачване)
      if (newDistance < oldDistance || isDifferentRoute) {
        distances.set(neighborId, newDistance);
        previous.set(neighborId, {
          from: currentId,
          via: neighbor,
        });
        queue.add(neighborId);
      }
    }
  }

  return null; // няма валиден път
};
  