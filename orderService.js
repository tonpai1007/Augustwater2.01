const deliveryService = require('./deliveryService');

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
    
    Logger.success(`✅ Order #${orderNo} created: ${customer} - ${totalAmount}฿`);

    return {
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

  } catch (error) {
    Logger.error('createOrderTransaction failed', error);
    return {
      success: false,
      error: `❌ ไม่สามารถสร้างออเดอร์ได้: ${error.message}`
    };
  }

  // Auto-assign delivery if enabled
  if (CONFIG.AUTO_ASSIGN_DELIVERY) {
    const customer = await getCustomerInfo(orderData.customer);
    
    if (customer && customer.lat && customer.lng) {
      const deliveryResult = await deliveryService.assignDelivery(
        orderNo,
        { lat: customer.lat, lng: customer.lng },
        customer.name
      );

      if (deliveryResult.success) {
        Logger.success(`🚚 Auto-assigned delivery: ${deliveryResult.vehicleId}`);
      }
    }
  }

  return result;
}