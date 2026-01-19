const { Logger } = require('../../logger');
const { getSheetData, appendSheetData, updateSheetData } = require('../../googleServices');
const { loadStockCache } = require('../../cacheManager');
const { getThaiDateTimeString } = require('../../utils/dateUtils');
const deliveryService = require('../deliveryService');

// ============================================================================
// GET LAST ORDER NUMBER
// ============================================================================
async function getLastOrderNumber() {
  try {
    const rows = await getSheetData(CONFIG.SHEET_ID, 'คำสั่งซื้อ!A:I');
    if (rows.length <= 1) return null;
    
    // Get the most recent order number (last row)
    return rows[rows.length - 1][0];
  } catch (error) {
    Logger.error('getLastOrderNumber failed', error);
    return null;
  }
}

// ============================================================================
// GET CUSTOMER INFO
// ============================================================================
async function getCustomerInfo(customerName) {
  try {
    const rows = await getSheetData(CONFIG.SHEET_ID, 'ลูกค้า!A:E');
    
    for (let i = 1; i < rows.length; i++) {
      if (rows[i][0] === customerName) {
        return {
          name: rows[i][0],
          phone: rows[i][1],
          address: rows[i][2],
          lat: parseFloat(rows[i][3]) || null,
          lng: parseFloat(rows[i][4]) || null
        };
      }
    }
    
    return null;
  } catch (error) {
    Logger.error('getCustomerInfo failed', error);
    return null;
  }
}

// ============================================================================
// CREATE ORDER TRANSACTION
// ============================================================================
async function createOrderTransaction(orderData) {
  const { customer, items, deliveryPerson = '', paymentStatus = 'unpaid' } = orderData;
  
  if (!customer || !items || !Array.isArray(items) || items.length === 0) {
    return {
      success: false,
      error: 'ข้อมูลไม่ครบถ้วน: ต้องมีลูกค้าและรายการสินค้า'
    };
  }

  try {
    const orderRows = await getSheetData(CONFIG.SHEET_ID, 'คำสั่งซื้อ!A:I');
    const orderNo = orderRows.length || 1;
    
    // Get stock data
    const stockRows = await getSheetData(CONFIG.SHEET_ID, 'สต็อก!A:G');
    const stockMap = new Map();
    
    for (let i = 1; i < stockRows.length; i++) {
      const name = (stockRows[i][0] || '').toLowerCase().trim();
      const unit = (stockRows[i][3] || '').toLowerCase().trim();
      const stock = parseInt(stockRows[i][4] || 0);
      const key = `${name}|${unit}`;
      stockMap.set(key, { stock, rowIndex: i + 1 });
    }

    // Verify stock availability BEFORE any updates
    for (const item of items) {
      const key = `${item.stockItem.item.toLowerCase().trim()}|${item.stockItem.unit.toLowerCase().trim()}`;
      const stockInfo = stockMap.get(key);
      
      if (!stockInfo) {
        return {
          success: false,
          error: `❌ ไม่พบสินค้า: ${item.stockItem.item}`
        };
      }
      
      if (stockInfo.stock < item.quantity) {
        return {
          success: false,
          error: `❌ สต็อกไม่พอ: ${item.stockItem.item}\nมี ${stockInfo.stock} ต้องการ ${item.quantity}`
        };
      }
    }

    // Create rows and update stock
    const rowsToAdd = [];
    const timestamp = getThaiDateTimeString();
    const paymentText = paymentStatus === 'paid' ? 'จ่ายแล้ว' : 'ยังไม่จ่าย';
    
    for (const item of items) {
      const key = `${item.stockItem.item.toLowerCase().trim()}|${item.stockItem.unit.toLowerCase().trim()}`;
      const stockInfo = stockMap.get(key);
      const newStock = stockInfo.stock - item.quantity;
      
      // Update stock
      await updateSheetData(CONFIG.SHEET_ID, `สต็อก!E${stockInfo.rowIndex}`, [[newStock]]);
      
      // Create order row (9 columns total)
      const row = [
        orderNo,                              // A - รหัส
        timestamp,                            // B - วันที่
        customer,                             // C - ลูกค้า
        item.stockItem.item,                  // D - สินค้า
        item.quantity,                        // E - จำนวน
        '',                                   // F - หมายเหตุ
        deliveryPerson,                       // G - ผู้ส่ง
        paymentText,                          // H - จ่ายแล้วหรือยัง
        item.quantity * item.stockItem.price  // I - ยอดเงิน
      ];
      
      rowsToAdd.push(row);
      Logger.success(`📦 ${item.stockItem.item}: ${stockInfo.stock} → ${newStock}`);
    }

    // Add all rows at once
    await appendSheetData(CONFIG.SHEET_ID, 'คำสั่งซื้อ!A:I', rowsToAdd);
    await loadStockCache(true);

    const totalAmount = rowsToAdd.reduce((sum, row) => sum + row[8], 0);
    
    const result = {
      success: true,
      orderNo,
      customer,
      totalAmount,
      items: items.map((item, idx) => ({
        productName: item.stockItem.item,
        quantity: item.quantity,
        unit: item.stockItem.unit,
        unitPrice: item.stockItem.price,
        lineTotal: rowsToAdd[idx][8],
        newStock: stockMap.get(`${item.stockItem.item.toLowerCase().trim()}|${item.stockItem.unit.toLowerCase().trim()}`).stock - item.quantity,
        stockItem: item.stockItem
      }))
    };

    Logger.success(`✅ Order #${orderNo} created: ${customer} - ${totalAmount}฿`);

    // Auto-assign delivery if enabled
    if (CONFIG.AUTO_ASSIGN_DELIVERY) {
      const customerInfo = await getCustomerInfo(customer);
      
      if (customerInfo && customerInfo.lat && customerInfo.lng) {
        const deliveryResult = await deliveryService.assignDelivery(
          orderNo,
          { lat: customerInfo.lat, lng: customerInfo.lng },
          customer
        );

        if (deliveryResult.success) {
          Logger.success(`🚚 Auto-assigned delivery: ${deliveryResult.vehicleId}`);
          result.autoDelivery = deliveryResult;
        }
      }
    }

    return result;

  } catch (error) {
    Logger.error('createOrderTransaction failed', error);
    return {
      success: false,
      error: `❌ ไม่สามารถสร้างออเดอร์ได้: ${error.message}`
    };
  }
}

// ============================================================================
// UPDATE ORDER PAYMENT STATUS
// ============================================================================
async function updateOrderPaymentStatus(orderNo, status = 'จ่ายแล้ว') {
  try {
    const rows = await getSheetData(CONFIG.SHEET_ID, 'คำสั่งซื้อ!A:I');
    const orderRows = [];
    let customer = '';
    let totalAmount = 0;
    
    for (let i = 1; i < rows.length; i++) {
      if (rows[i][0] == orderNo) {
        orderRows.push({ index: i + 1, data: rows[i] });
        customer = rows[i][2];
        totalAmount += parseFloat(rows[i][8] || 0);
      }
    }

    if (orderRows.length === 0) {
      return { success: false, error: `ไม่พอออเดอร์ #${orderNo}` };
    }

    for (const orderRow of orderRows) {
      await updateSheetData(CONFIG.SHEET_ID, `คำสั่งซื้อ!H${orderRow.index}`, [[status]]);
    }
    
    Logger.success(`💰 Payment updated: #${orderNo} → ${status}`);

    return {
      success: true,
      orderNo,
      customer,
      totalAmount,
      status
    };
  } catch (error) {
    Logger.error('updateOrderPaymentStatus failed', error);
    return { success: false, error: error.message };
  }
}

// ============================================================================
// EXPORTS
// ============================================================================
module.exports = {
  createOrderTransaction,
  updateOrderPaymentStatus,
  getLastOrderNumber,
  getCustomerInfo
};