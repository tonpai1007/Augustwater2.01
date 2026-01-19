// Delivery Management Service
const { CONFIG } = require('../config');
const { Logger } = require('../logger');
const { getSheetData, appendSheetData, updateSheetData } = require('../googleServices');
const gpsService = require('./gpsService');
const { calculateDistance } = require('../utils/geoUtils');
const { optimizeRoute } = require('../utils/routeOptimizer');

class DeliveryService {
  // Assign delivery to nearest available vehicle
  async assignDelivery(orderId, orderLocation, customer) {
    try {
      Logger.info(`🚚 Assigning delivery for order ${orderId}`);

      // Get all active vehicles
      const vehicles = await gpsService.getAllVehicles();
      
      // Filter available vehicles (not currently delivering)
      const availableVehicles = vehicles.filter(v => v.speed < 5); // Stopped vehicles
      
      if (availableVehicles.length === 0) {
        return {
          success: false,
          error: 'ไม่มีรถว่าง',
          suggestion: 'กรุณารอสักครู่ หรือมอบหมายด้วยตนเอง'
        };
      }

      // Find nearest vehicle
      let nearestVehicle = null;
      let minDistance = Infinity;

      availableVehicles.forEach(vehicle => {
        const distance = calculateDistance(
          vehicle.lat, vehicle.lng,
          orderLocation.lat, orderLocation.lng
        );

        if (distance < minDistance) {
          minDistance = distance;
          nearestVehicle = vehicle;
        }
      });

      // Create delivery assignment
      await appendSheetData(CONFIG.SHEET_ID, 'Deliveries!A:H', [[
        orderId,
        nearestVehicle.vehicleId,
        customer,
        new Date().toISOString(),
        'assigned',
        orderLocation.lat,
        orderLocation.lng,
        minDistance.toFixed(2)
      ]]);

      Logger.success(`✅ Assigned ${nearestVehicle.vehicleId} to order ${orderId} (${minDistance.toFixed(1)}km)`);

      return {
        success: true,
        vehicleId: nearestVehicle.vehicleId,
        distance: minDistance,
        eta: Math.ceil((minDistance / 40) * 60) // Rough ETA in minutes
      };
    } catch (error) {
      Logger.error('Delivery assignment failed', error);
      return { success: false, error: error.message };
    }
  }

  // Update delivery status
  async updateDeliveryStatus(orderId, status, notes = '') {
    try {
      const rows = await getSheetData(CONFIG.SHEET_ID, 'Deliveries!A:H');
      
      let rowIndex = -1;
      for (let i = 1; i < rows.length; i++) {
        if (rows[i][0] === orderId) {
          rowIndex = i + 1;
          break;
        }
      }

      if (rowIndex === -1) {
        return { success: false, error: 'ไม่พบข้อมูลการจัดส่ง' };
      }

      await updateSheetData(CONFIG.SHEET_ID, `Deliveries!E${rowIndex}`, [[status]]);
      
      if (status === 'completed') {
        await updateSheetData(CONFIG.SHEET_ID, `Deliveries!I${rowIndex}`, [[new Date().toISOString()]]);
      }

      Logger.success(`✅ Delivery ${orderId}: ${status}`);

      return { success: true, orderId, status };
    } catch (error) {
      Logger.error('Delivery status update failed', error);
      return { success: false, error: error.message };
    }
  }

  // Get delivery for order
  async getDeliveryInfo(orderId) {
    try {
      const rows = await getSheetData(CONFIG.SHEET_ID, 'Deliveries!A:I');
      
      const delivery = rows.slice(1).find(row => row[0] === orderId);
      
      if (!delivery) return null;

      return {
        orderId: delivery[0],
        vehicleId: delivery[1],
        customer: delivery[2],
        assignedAt: delivery[3],
        status: delivery[4],
        destination: {
          lat: parseFloat(delivery[5]),
          lng: parseFloat(delivery[6])
        },
        distance: parseFloat(delivery[7]),
        completedAt: delivery[8]
      };
    } catch (error) {
      Logger.error('Get delivery info failed', error);
      return null;
    }
  }
}

module.exports = new DeliveryService();