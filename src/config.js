// Configuration File
module.exports.CONFIG = {
  // Google Sheets
  SHEET_ID: process.env.GOOGLE_SHEET_ID || 'your-sheet-id-here',
  
  // Auto-processing thresholds
  AUTO_PROCESS_THRESHOLD: 0.85,
  AUTO_PROCESS_MAX_VALUE: 5000,
  
  // GPS & Delivery Settings
  AUTO_ASSIGN_DELIVERY: true,
  GPS_UPDATE_INTERVAL: 30000, // 30 seconds
  DELIVERY_RADIUS_KM: 10, // Search radius for available vehicles
  MAX_DELIVERY_DISTANCE_KM: 50, // Maximum delivery distance
  VEHICLE_IDLE_SPEED_THRESHOLD: 5, // Speed (km/h) below which vehicle is considered idle
  
  // Geofencing
  WAREHOUSE_LOCATION: {
    lat: 13.7563,
    lng: 100.5018,
    name: 'โกดังหลัก'
  },
  
  // Delivery zones
  DELIVERY_ZONES: [
    {
      name: 'กรุงเทพเหนือ',
      center: { lat: 13.8, lng: 100.5 },
      radius: 15
    },
    {
      name: 'กรุงเทพใต้',
      center: { lat: 13.7, lng: 100.5 },
      radius: 15
    }
  ],
  
  // Performance settings
  GPS_CACHE_TTL: 30000, // GPS cache time-to-live (30 seconds)
  GPS_CLEANUP_HOURS: 24, // Clean up GPS records older than 24 hours
  
  // Notifications
  ENABLE_DELIVERY_NOTIFICATIONS: true,
  NOTIFY_ON_DELIVERY_ASSIGNED: true,
  NOTIFY_ON_DELIVERY_COMPLETED: true,
  
  // Emergency contacts
  EMERGENCY_CONTACTS: [
    { name: 'Admin', phone: '081-234-5678' },
    { name: 'Warehouse', phone: '082-345-6789' }
  ]
};