window.findBestRouteWithTransfers = function (startId, endId) {
    const distances = new Map();
    const previous = new Map();
    const visited = new Set();
    const queue = new Set();
  
    distances.set(startId, 0);
    queue.add(startId);
  
    while (queue.size > 0) {
      let currentId = null;
      let minDistance = Infinity;
  
      for (const id of queue) {
        const dist = distances.get(id) ?? Infinity;
        if (dist < minDistance) {
          minDistance = dist;
          currentId = id;
        }
      }
  
      if (currentId === null) break;
  
      queue.delete(currentId);
      visited.add(currentId);
  
      if (currentId === endId) {
        const path = [];
        let u = endId;
        while (previous.has(u)) {
          const prev = previous.get(u);
          path.unshift({
            from: prev.from,
            to: u,
            via: prev.via,
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
  
    return null;
  };
  