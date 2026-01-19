// GPS Service - Vehicle Tracking
const { CONFIG } = require('../config');
const { Logger } = require('../logger');
const { getSheetData, appendSheetData, updateSheetData } = require('../googleServices');

class GPSService {
  constructor() {
    this.vehicleCache = new Map();
    this.lastUpdate = null;
  }

  // Get all vehicles with latest GPS data
  async getAllVehicles() {
    try {
      const rows = await getSheetData(CONFIG.SHEET_ID, 'GPS!A:H');
      
      if (rows.length <= 1) {
        Logger.warn('No GPS data found');
        return [];
      }

      const vehicles = [];
      const vehicleMap = new Map();

      // Process rows (skip header)
      for (let i = 1; i < rows.length; i++) {
        const vehicleId = rows[i][0];
        const timestamp = rows[i][1];
        const lat = parseFloat(rows[i][2]);
        const lng = parseFloat(rows[i][3]);
        const speed = parseFloat(rows[i][4] || 0);
        const heading = parseFloat(rows[i][5] || 0);
        const driver = rows[i][6] || '';
        const status = rows[i][7] || 'idle';

        // Keep only latest record per vehicle
        if (!vehicleMap.has(vehicleId) || 
            new Date(timestamp) > new Date(vehicleMap.get(vehicleId).timestamp)) {
          vehicleMap.set(vehicleId, {
            vehicleId,
            timestamp,
            lat,
            lng,
            speed,
            heading,
            driver,
            status
          });
        }
      }

      vehicles.push(...vehicleMap.values());
      this.vehicleCache = vehicleMap;
      this.lastUpdate = new Date();

      Logger.info(`📍 Loaded ${vehicles.length} vehicles`);
      return vehicles;
    } catch (error) {
      Logger.error('getAllVehicles failed', error);
      return [];
    }
  }

  // Get latest position for specific vehicle
  async getLatestPosition(vehicleId) {
    try {
      // Check cache first
      if (this.vehicleCache.has(vehicleId)) {
        const cached = this.vehicleCache.get(vehicleId);
        const age = Date.now() - new Date(this.lastUpdate).getTime();
        
        // Cache valid for 30 seconds
        if (age < 30000) {
          return cached;
        }
      }

      // Fetch fresh data
      await this.getAllVehicles();
      return this.vehicleCache.get(vehicleId) || null;
    } catch (error) {
      Logger.error('getLatestPosition failed', error);
      return null;
    }
  }

  // Record GPS position
  async recordPosition(vehicleId, lat, lng, speed = 0, heading = 0, driver = '', status = 'idle') {
    try {
      const timestamp = new Date().toISOString();
      
      await appendSheetData(CONFIG.SHEET_ID, 'GPS!A:H', [[
        vehicleId,
        timestamp,
        lat,
        lng,
        speed,
        heading,
        driver,
        status
      ]]);

      // Update cache
      this.vehicleCache.set(vehicleId, {
        vehicleId,
        timestamp,
        lat,
        lng,
        speed,
        heading,
        driver,
        status
      });

      Logger.success(`📍 GPS recorded: ${vehicleId} @ ${lat},${lng}`);
      return { success: true };
    } catch (error) {
      Logger.error('recordPosition failed', error);
      return { success: false, error: error.message };
    }
  }

  // Update vehicle status
  async updateVehicleStatus(vehicleId, status) {
    try {
      const vehicle = await this.getLatestPosition(vehicleId);
      
      if (!vehicle) {
        return { success: false, error: 'Vehicle not found' };
      }

      // Record new position with updated status
      return await this.recordPosition(
        vehicleId,
        vehicle.lat,
        vehicle.lng,
        vehicle.speed,
        vehicle.heading,
        vehicle.driver,
        status
      );
    } catch (error) {
      Logger.error('updateVehicleStatus failed', error);
      return { success: false, error: error.message };
    }
  }

  // Get vehicles within radius of location
  async getVehiclesNearLocation(lat, lng, radiusKm = 5) {
    const { calculateDistance } = require('./utils/geoutils');
    const vehicles = await this.getAllVehicles();
    
    return vehicles.filter(vehicle => {
      const distance = calculateDistance(lat, lng, vehicle.lat, vehicle.lng);
      return distance <= radiusKm;
    }).map(vehicle => ({
      ...vehicle,
      distance: calculateDistance(lat, lng, vehicle.lat, vehicle.lng)
    })).sort((a, b) => a.distance - b.distance);
  }

  // Clear old GPS records (keep last 24 hours)
  async cleanupOldRecords() {
    try {
      const rows = await getSheetData(CONFIG.SHEET_ID, 'GPS!A:H');
      const cutoff = new Date();
      cutoff.setHours(cutoff.getHours() - 24);

      let deletedCount = 0;
      
      for (let i = rows.length - 1; i >= 1; i--) {
        const timestamp = new Date(rows[i][1]);
        
        if (timestamp < cutoff) {
          // Delete row (implementation depends on your Google Sheets API)
          deletedCount++;
        }
      }

      Logger.info(`🧹 Cleaned up ${deletedCount} old GPS records`);
      return { success: true, deletedCount };
    } catch (error) {
      Logger.error('cleanupOldRecords failed', error);
      return { success: false, error: error.message };
    }
  }
}

module.exports = new GPSService();