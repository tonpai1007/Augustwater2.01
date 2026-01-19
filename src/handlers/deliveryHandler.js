// Delivery Handler - Handle delivery-related HTTP requests
const deliveryService = require('../service/deliveryService');
const { Logger } = require('../logger');

class DeliveryHandler {
  // POST /api/delivery/assign - Assign delivery to vehicle
  async assignDelivery(req, res) {
    try {
      const { orderId, location, customer } = req.body;

      // Validate required fields
      if (!orderId || !location || !location.lat || !location.lng || !customer) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: orderId, location (lat, lng), customer'
        });
      }

      const result = await deliveryService.assignDelivery(
        orderId,
        { lat: parseFloat(location.lat), lng: parseFloat(location.lng) },
        customer
      );

      if (result.success) {
        Logger.success(`Delivery assigned: ${orderId} -> ${result.vehicleId}`);
        return res.status(200).json(result);
      } else {
        return res.status(400).json(result);
      }
    } catch (error) {
      Logger.error('Assign delivery failed', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  // PUT /api/delivery/:orderId/status - Update delivery status
  async updateStatus(req, res) {
    try {
      const { orderId } = req.params;
      const { status, notes } = req.body;

      if (!status) {
        return res.status(400).json({
          success: false,
          error: 'Missing status field'
        });
      }

      const result = await deliveryService.updateDeliveryStatus(
        orderId,
        status,
        notes || ''
      );

      if (result.success) {
        return res.status(200).json(result);
      } else {
        return res.status(404).json(result);
      }
    } catch (error) {
      Logger.error('Update delivery status failed', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  // GET /api/delivery/:orderId - Get delivery info
  async getDeliveryInfo(req, res) {
    try {
      const { orderId } = req.params;
      const delivery = await deliveryService.getDeliveryInfo(orderId);

      if (delivery) {
        return res.status(200).json({
          success: true,
          delivery
        });
      } else {
        return res.status(404).json({
          success: false,
          error: 'Delivery not found'
        });
      }
    } catch (error) {
      Logger.error('Get delivery info failed', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  // GET /api/delivery/active - Get all active deliveries
  async getActiveDeliveries(req, res) {
    try {
      const { getSheetData } = require('../googleServices');
      const { CONFIG } = require('../config');
      
      const rows = await getSheetData(CONFIG.SHEET_ID, 'Deliveries!A:I');
      
      const activeDeliveries = rows.slice(1)
        .filter(row => row[4] === 'assigned' || row[4] === 'delivering')
        .map(row => ({
          orderId: row[0],
          vehicleId: row[1],
          customer: row[2],
          assignedAt: row[3],
          status: row[4],
          destination: {
            lat: parseFloat(row[5]),
            lng: parseFloat(row[6])
          },
          distance: parseFloat(row[7])
        }));

      return res.status(200).json({
        success: true,
        count: activeDeliveries.length,
        deliveries: activeDeliveries
      });
    } catch (error) {
      Logger.error('Get active deliveries failed', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  // POST /api/delivery/complete - Complete delivery
  async completeDelivery(req, res) {
    try {
      const { orderId } = req.body;

      if (!orderId) {
        return res.status(400).json({
          success: false,
          error: 'Missing orderId field'
        });
      }

      const result = await deliveryService.updateDeliveryStatus(
        orderId,
        'completed'
      );

      if (result.success) {
        Logger.success(`Delivery completed: ${orderId}`);
        return res.status(200).json({
          success: true,
          message: 'Delivery completed',
          orderId
        });
      } else {
        return res.status(404).json(result);
      }
    } catch (error) {
      Logger.error('Complete delivery failed', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
}

module.exports = new DeliveryHandler();