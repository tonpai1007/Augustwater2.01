// GPS Handler - Handle GPS-related HTTP requests
const gpsService = require('../service/gpsService');
const { Logger } = require('../logger');

class GPSHandler {
  // POST /api/gps/update - Update vehicle GPS position
  async updatePosition(req, res) {
    try {
      const { vehicleId, lat, lng, speed, heading, driver, status } = req.body;

      // Validate required fields
      if (!vehicleId || lat === undefined || lng === undefined) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: vehicleId, lat, lng'
        });
      }

      const result = await gpsService.recordPosition(
        vehicleId,
        parseFloat(lat),
        parseFloat(lng),
        parseFloat(speed || 0),
        parseFloat(heading || 0),
        driver || '',
        status || 'idle'
      );

      if (result.success) {
        Logger.success(`GPS updated: ${vehicleId}`);
        return res.status(200).json({
          success: true,
          message: 'GPS position updated',
          vehicleId
        });
      } else {
        return res.status(500).json({
          success: false,
          error: result.error
        });
      }
    } catch (error) {
      Logger.error('GPS update failed', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  // GET /api/gps/vehicles - Get all vehicles
  async getAllVehicles(req, res) {
    try {
      const vehicles = await gpsService.getAllVehicles();
      
      return res.status(200).json({
        success: true,
        count: vehicles.length,
        vehicles
      });
    } catch (error) {
      Logger.error('Get vehicles failed', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  // GET /api/gps/vehicle/:vehicleId - Get specific vehicle
  async getVehicle(req, res) {
    try {
      const { vehicleId } = req.params;
      const vehicle = await gpsService.getLatestPosition(vehicleId);

      if (vehicle) {
        return res.status(200).json({
          success: true,
          vehicle
        });
      } else {
        return res.status(404).json({
          success: false,
          error: 'Vehicle not found'
        });
      }
    } catch (error) {
      Logger.error('Get vehicle failed', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  // GET /api/gps/nearby - Get vehicles near location
  async getNearbyVehicles(req, res) {
    try {
      const { lat, lng, radius } = req.query;

      if (!lat || !lng) {
        return res.status(400).json({
          success: false,
          error: 'Missing required query params: lat, lng'
        });
      }

      const vehicles = await gpsService.getVehiclesNearLocation(
        parseFloat(lat),
        parseFloat(lng),
        parseFloat(radius || 5)
      );

      return res.status(200).json({
        success: true,
        count: vehicles.length,
        vehicles
      });
    } catch (error) {
      Logger.error('Get nearby vehicles failed', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  // PUT /api/gps/vehicle/:vehicleId/status - Update vehicle status
  async updateVehicleStatus(req, res) {
    try {
      const { vehicleId } = req.params;
      const { status } = req.body;

      if (!status) {
        return res.status(400).json({
          success: false,
          error: 'Missing status field'
        });
      }

      const result = await gpsService.updateVehicleStatus(vehicleId, status);

      if (result.success) {
        return res.status(200).json({
          success: true,
          message: 'Vehicle status updated',
          vehicleId,
          status
        });
      } else {
        return res.status(500).json({
          success: false,
          error: result.error
        });
      }
    } catch (error) {
      Logger.error('Update vehicle status failed', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  // POST /api/gps/cleanup - Clean up old GPS records
  async cleanup(req, res) {
    try {
      const result = await gpsService.cleanupOldRecords();

      return res.status(200).json({
        success: true,
        message: 'GPS cleanup completed',
        deletedCount: result.deletedCount
      });
    } catch (error) {
      Logger.error('GPS cleanup failed', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
}

module.exports = new GPSHandler();