// Geospatial Utilities
const EARTH_RADIUS_KM = 6371;

// Haversine formula for distance calculation
function calculateDistance(lat1, lon1, lat2, lon2) {
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  
  return EARTH_RADIUS_KM * c;
}

function toRadians(degrees) {
  return degrees * (Math.PI / 180);
}

// Check if point is within radius of location
function isWithinRadius(point, center, radiusKm) {
  const distance = calculateDistance(
    point.lat, point.lng,
    center.lat, center.lng
  );
  return distance <= radiusKm;
}

// Find nearest point from array
function findNearest(origin, points) {
  let nearest = null;
  let minDistance = Infinity;

  points.forEach(point => {
    const distance = calculateDistance(
      origin.lat, origin.lng,
      point.lat, point.lng
    );

    if (distance < minDistance) {
      minDistance = distance;
      nearest = { ...point, distance };
    }
  });

  return nearest;
}

module.exports = {
  calculateDistance,
  isWithinRadius,
  findNearest,
  toRadians
};