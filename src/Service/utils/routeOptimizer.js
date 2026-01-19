// Simple Route Optimization (Nearest Neighbor)
const { calculateDistance } = require('./geoutils');

function optimizeRoute(startPoint, destinations) {
  if (destinations.length === 0) return [];
  if (destinations.length === 1) return destinations;

  const route = [];
  const unvisited = [...destinations];
  let current = startPoint;

  while (unvisited.length > 0) {
    let nearest = null;
    let minDistance = Infinity;
    let nearestIndex = -1;

    unvisited.forEach((dest, index) => {
      const distance = calculateDistance(
        current.lat, current.lng,
        dest.lat, dest.lng
      );

      if (distance < minDistance) {
        minDistance = distance;
        nearest = dest;
        nearestIndex = index;
      }
    });

    route.push({ ...nearest, distance: minDistance });
    unvisited.splice(nearestIndex, 1);
    current = nearest;
  }

  return route;
}

// Calculate total route distance
function calculateRouteDistance(points) {
  let total = 0;
  for (let i = 0; i < points.length - 1; i++) {
    total += calculateDistance(
      points[i].lat, points[i].lng,
      points[i + 1].lat, points[i + 1].lng
    );
  }
  return total;
}

module.exports = {
  optimizeRoute,
  calculateRouteDistance
};