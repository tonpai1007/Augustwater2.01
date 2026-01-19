// Main Application Server
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const { Logger } = require('./logger');
const { CONFIG } = require('./config');

// Import handlers
const gpsHandler = require('./handlers/gpsHandler');
const deliveryHandler = require('./handlers/deliveryHandler');
const { handleMessage } = require('./handlers/messageHandlerService');

// Import services for initialization
const gpsService = require('./service/gpsService');
const { loadStockCache, loadCustomerCache } = require('./cacheManager');

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================================================
// MIDDLEWARE
// ============================================================================
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Request logging
app.use((req, res, next) => {
  Logger.info(`${req.method} ${req.path}`);
  next();
});

// ============================================================================
// GPS ROUTES
// ============================================================================
app.post('/api/gps/update', (req, res) => gpsHandler.updatePosition(req, res));
app.get('/api/gps/vehicles', (req, res) => gpsHandler.getAllVehicles(req, res));
app.get('/api/gps/vehicle/:vehicleId', (req, res) => gpsHandler.getVehicle(req, res));
app.get('/api/gps/nearby', (req, res) => gpsHandler.getNearbyVehicles(req, res));
app.put('/api/gps/vehicle/:vehicleId/status', (req, res) => gpsHandler.updateVehicleStatus(req, res));
app.post('/api/gps/cleanup', (req, res) => gpsHandler.cleanup(req, res));

// ============================================================================
// DELIVERY ROUTES
// ============================================================================
app.post('/api/delivery/assign', (req, res) => deliveryHandler.assignDelivery(req, res));
app.put('/api/delivery/:orderId/status', (req, res) => deliveryHandler.updateStatus(req, res));
app.get('/api/delivery/:orderId', (req, res) => deliveryHandler.getDeliveryInfo(req, res));
app.get('/api/delivery/active', (req, res) => deliveryHandler.getActiveDeliveries(req, res));
app.post('/api/delivery/complete', (req, res) => deliveryHandler.completeDelivery(req, res));

// ============================================================================
// MESSAGE/CHAT ROUTES
// ============================================================================
app.post('/api/message', async (req, res) => {
  try {
    const { text, userId } = req.body;

    if (!text) {
      return res.status(400).json({
        success: false,
        error: 'Missing text field'
      });
    }

    const result = await handleMessage(text, userId || 'default');

    return res.status(200).json(result);
  } catch (error) {
    Logger.error('Message handler failed', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// HEALTH CHECK
// ============================================================================
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// ============================================================================
// ERROR HANDLER
// ============================================================================
app.use((err, req, res, next) => {
  Logger.error('Unhandled error', err);
  res.status(500).json({
    success: false,
    error: 'Internal server error'
  });
});

// ============================================================================
// INITIALIZATION & STARTUP
// ============================================================================
async function initialize() {
  try {
    Logger.info('🚀 Initializing application...');

    // Load caches
    await loadStockCache();
    await loadCustomerCache();
    Logger.success('✅ Caches loaded');

    // Load initial GPS data
    await gpsService.getAllVehicles();
    Logger.success('✅ GPS service initialized');

    // Start GPS cleanup schedule (every 24 hours)
    setInterval(async () => {
      Logger.info('Running scheduled GPS cleanup...');
      await gpsService.cleanupOldRecords();
    }, 24 * 60 * 60 * 1000);

    Logger.success('✅ All services initialized');
  } catch (error) {
    Logger.error('Initialization failed', error);
    process.exit(1);
  }
}

// Start server
initialize().then(() => {
  app.listen(PORT, () => {
    Logger.success(`🚀 Server running on port ${PORT}`);
    Logger.info(`📍 GPS tracking enabled: ${CONFIG.AUTO_ASSIGN_DELIVERY}`);
    Logger.info(`🗺️  Warehouse: ${CONFIG.WAREHOUSE_LOCATION.name}`);
  });
}).catch(error => {
  Logger.error('Failed to start server', error);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  Logger.info('SIGTERM received, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  Logger.info('SIGINT received, shutting down gracefully...');
  process.exit(0);
});

module.exports = app;