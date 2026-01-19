const { Logger } = require('./logger');
const { parseOrder } = require('./orderParser');
const { createOrderTransaction, updateOrderPaymentStatus, getLastOrderNumber } = require('./src/assingment/integration/orderService');
const { parseAdjustmentCommand, adjustStock, generateVarianceReport, viewCurrentStock } = require('./stockAdjustment');
const { autoAddCustomer } = require('./customerService');
const { applySmartCorrection, shouldAutoProcess, monitor } = require('./aggressiveAutoConfig');
const { smartLearner } = require('./smartOrderLearning');
const { saveToInbox, cancelOrder } = require('./inboxService');
const { generateDailySummary, generateInboxSummary } = require('./dashboardService');
const { loadStockCache, loadCustomerCache } = require('./cacheManager');
const { CONFIG } = require('./src/config');
const { getSheetData, updateSheetData } = require('./googleServices');
const deliveryService = require('./deliveryService');
const gpsService = require('./gpsService');

// ============================================================================
// STOCK WARNING HELPERS
// ============================================================================

function checkStockWarnings(items) {
  const warnings = [];
  const criticalItems = [];
  
  items.forEach(item => {
    const remaining = item.stockItem.stock - item.quantity;
    
    if (remaining < 0) {
      warnings.push({
        level: 'critical',
        message: `⚠️ สต็อกไม่พอ!\n${item.stockItem.item}: มี ${item.stockItem.stock} เหลือ (สั่ง ${item.quantity})`,
        canProceed: false
      });
      criticalItems.push(item.stockItem.item);
    } else if (remaining <= 3) {
      warnings.push({
        level: 'critical',
        message: `⚠️ สต็อกเหลือน้อยมาก!\n${item.stockItem.item}: จะเหลือ ${remaining} ${item.stockItem.unit}`,
        canProceed: true
      });
    } else if (remaining <= 10) {
      warnings.push({
        level: 'warning',
        message: `💡 สต็อกใกล้หมด\n${item.stockItem.item}: จะเหลือ ${remaining} ${item.stockItem.unit}`,
        canProceed: true
      });
    }
  });
  
  return {
    hasWarnings: warnings.length > 0,
    hasCritical: criticalItems.length > 0,
    warnings,
    criticalItems
  };
}

function formatStockWarnings(checkResult) {
  if (!checkResult.hasWarnings) return null;
  
  if (checkResult.hasCritical) {
    return '🔴 สต็อกไม่พอ!\n\n' + 
           checkResult.warnings
             .filter(w => !w.canProceed)
             .map(w => w.message)
             .join('\n\n') +
           '\n\n❌ ไม่สามารถสร้างออเดอร์ได้';
  }
  
  return checkResult.warnings.map(w => w.message).join('\n');
}

// ============================================================================
// ENHANCED MESSAGE FORMATTERS
// ============================================================================

function formatOrderSuccess(orderNo, customer, items, totalAmount, confidence) {
  const summary = items.map(i => {
    const itemName = i.productName || i.stockItem?.item || 'สินค้า';
    const newStock = i.newStock !== undefined ? i.newStock : 0;
    
    let stockIcon = '✅';
    if (newStock <= 3) stockIcon = '🔴';
    else if (newStock <= 10) stockIcon = '🟡';
    
    return `${stockIcon} ${itemName} x${i.quantity} (${newStock} เหลือ)`;
  }).join('\n');
  
  return `✅ บันทึกออเดอร์สำเร็จ!\n\n` +
         `📋 คำสั่งซื้อ #${orderNo}\n` +
         `👤 ${customer}\n\n` +
         `${summary}\n\n` +
         `💰 รวม: ${totalAmount.toLocaleString()}฿\n` +
         `🎯 ความมั่นใจ: ${confidence}\n\n` +
         `━━━━━━━━━━━━━━━━━━━━\n` +
         `⚡ Quick Actions:\n` +
         `• "จ่าย" - จ่ายออเดอร์นี้\n` +
         `• "ส่ง พี่แดง" - อัปเดตการจัดส่ง\n` +
         `• "ยกเลิก" - ยกเลิกออเดอร์นี้`;
}

function formatPaymentSuccess(orderNo, customer, totalAmount) {
  return `✅ อัปเดตการชำระเงินสำเร็จ\n\n` +
         `📋 #${orderNo} | ${customer}\n` +
         `💰 ${totalAmount.toLocaleString()}฿\n\n` +
         `━━━━━━━━━━━━━━━━━━━━\n` +
         `⚡ Next Actions:\n` +
         `• "ส่ง พี่แดง" - อัปเดตการจัดส่ง\n` +
         `• "สรุป" - ดูยอดขายวันนี้`;
}

function formatCancelSuccess(orderNo, customer, stockRestored) {
  const restoredList = stockRestored
    .map(s => `   ${s.item} +${s.restored} → ${s.newStock} ${s.unit || 'ชิ้น'}`)
    .join('\n');
  
  return `✅ ยกเลิกออเดอร์สำเร็จ\n\n` +
         `📋 ออเดอร์ #${orderNo}\n` +
         `👤 ${customer}\n\n` +
         `📦 คืนสต็อก:\n${restoredList}\n\n` +
         `━━━━━━━━━━━━━━━━━━━━\n` +
         `✨ สต็อกถูกคืนกลับเรียบร้อยแล้ว`;
}

function formatError(errorType, details = {}) {
  const errors = {
    'order_not_found': `❌ ไม่พบออเดอร์${details.orderNo ? ` #${details.orderNo}` : ''}\n\n` +
                       `━━━━━━━━━━━━━━━━━━━━\n` +
                       `💡 แก้ไข:\n` +
                       `• ตรวจสอบเลขออเดอร์\n` +
                       `• ออเดอร์อาจถูกยกเลิกไปแล้ว\n` +
                       `• พิมพ์ "inbox" เพื่อดูประวัติ`,
    
    'parse_failed': `❌ ไม่เข้าใจคำสั่ง\n\n` +
                    `"${details.input}"\n\n` +
                    `━━━━━━━━━━━━━━━━━━━━\n` +
                    `💡 ตัวอย่างที่ถูกต้อง:\n` +
                    `• "น้ำแข็ง 2 ถุง ร้านเจ๊แดง"\n` +
                    `• "จ่าย" - จ่ายออเดอร์ล่าสุด\n` +
                    `• "เติมน้ำแข็ง 20"\n\n` +
                    `พิมพ์ "help" เพื่อดูคำสั่งทั้งหมด`
  };
  
  return errors[errorType] || `❌ เกิดข้อผิดพลาด\n\n${details.message || 'Unknown error'}`;
}

// ============================================================================
// MAIN MESSAGE HANDLER
// ============================================================================
async function handleMessage(text, userId) {
  try {
    const lower = text.toLowerCase().trim();

    // 1. [PRIORITY] SYSTEM COMMANDS
    if (lower === 'สรุป' || lower.includes('สรุปวันนี้')) {
      return { success: true, message: await generateDailySummary() };
    }
    if (lower === 'inbox' || lower.includes('ประวัติ')) {
      return { success: true, message: await generateInboxSummary(20) };
    }
    if (lower === 'สต็อก') {
      return { success: true, message: await viewCurrentStock() };
    }
    if (lower === 'รีเฟรช') {
      await loadStockCache(true);
      await loadCustomerCache(true);
      return { success: true, message: '✅ รีเฟรชข้อมูลสำเร็จ' };
    }

    // 2. DELIVERY STATUS CHECK
    if (lower.includes('เช็ค') || lower.includes('สถานะ')) {
      const orderNo = text.match(/#(\d+)/)?.[1];
      
      if (orderNo) {
        const delivery = await deliveryService.getDeliveryInfo(orderNo);
        
        if (delivery) {
          const vehicle = await gpsService.getLatestPosition(delivery.vehicleId);
          
          if (vehicle) {
            return {
              success: true,
              message: `📦 สถานะการจัดส่ง #${orderNo}\n\n` +
                      `🚚 รถ: ${delivery.vehicleId}\n` +
                      `👤 คนขับ: ${vehicle.driver}\n` +
                      `📍 ตำแหน่ง: ${vehicle.lat.toFixed(4)}, ${vehicle.lng.toFixed(4)}\n` +
                      `🏁 สถานะ: ${delivery.status}\n` +
                      `⏱️ ระยะทาง: ${delivery.distance.toFixed(1)} กม.`
            };
          }
        }
        
        return { success: false, message: `❌ ไม่พบข้อมูลการจัดส่งสำหรับออเดอร์ #${orderNo}` };
      }
    }

    // 3. DELIVERY UPDATE
    if (lower.includes('ส่ง') && (lower.includes('#') || lower.includes('พี่') || lower.includes('คุณ'))) {
      const orderNo = text.match(/#(\d+)/)?.[1] || await getLastOrderNumber();
      const driverMatch = text.match(/ส่ง\s+(พี่|คุณ)?(.+)/);
      const driver = driverMatch ? driverMatch[2].trim() : '';
      
      if (orderNo && driver) {
        const result = await updateDeliveryPerson(orderNo, driver);
        
        if (result.success) {
          await deliveryService.updateDeliveryStatus(orderNo, 'delivering');
          return { 
            success: true, 
            message: `✅ อัปเดตการจัดส่ง #${orderNo}\n\n` +
                    `🚚 ผู้ส่ง: ${driver}\n` +
                    `👤 ลูกค้า: ${result.customer}\n` +
                    `💰 ${result.totalAmount.toLocaleString()}฿`
          };
        }
      }
    }

    // 4. [CORE] MULTI-INTENT AI PROCESSING
    const aiResults = await parseOrder(text);
    
    if (!aiResults || aiResults.length === 0) {
      return { success: false, message: "❌ ไม่เข้าใจคำสั่ง ลองพูดใหม่ชัดๆ นะคะ" };
    }

    let finalResponses = [];

    for (const res of aiResults) {
      Logger.info(`🤖 Processing AI Intent: ${res.intent} for ${res.customer}`);

      switch (res.intent) {
        case 'order':
          finalResponses.push(await executeOrderLogic(res, userId, text));
          break;

        case 'payment':
          finalResponses.push(await executePaymentLogic(res, userId, text));
          break;

        case 'stock_adj':
          finalResponses.push(await executeStockAdjLogic(res, userId, text));
          break;

        case 'cancel':
          finalResponses.push(await executeCancelLogic(res, userId, text));
          break;
      }
    }

    return { 
      success: true, 
      message: finalResponses.join('\n\n' + '━'.repeat(15) + '\n\n') 
    };

  } catch (error) {
    Logger.error('handleMessage error', error);
    return { success: false, message: '❌ เกิดข้อผิดพลาด ลองใหม่อีกครั้งค่ะ' };
  }
}

// ============================================================================
// EXECUTION HELPERS
// ============================================================================

async function executeOrderLogic(parsed, userId, rawInput) {
  if (parsed.customer && parsed.customer !== 'ไม่ระบุ') {
    await smartLearner.loadOrderHistory();
    const exactMatch = smartLearner.findExactOrderMatch(parsed.customer, parsed.items);
    if (exactMatch) {
      return (await createOrderDirectly(parsed.customer, parsed.items, 'high', exactMatch.message, userId, rawInput)).message;
    }
  }
  
  return (await processWithAutomationRules(parsed, userId)).message;
}

async function executePaymentLogic(res, userId, rawInput) {
  let orderNo = res.orderNo || await getLastOrderNumber();
  const result = await updateOrderPaymentStatus(orderNo, 'จ่ายแล้ว');
  
  if (result.success) {
    return formatPaymentSuccess(result.orderNo, result.customer, result.totalAmount);
  }
  
  return formatError('order_not_found', { orderNo });
}

async function executeStockAdjLogic(res, userId, rawInput) {
  let reports = [];
  for (const item of res.items) {
    const adj = await adjustStock(item.stockItem.item, item.quantity, res.operation || 'set', 'AI_Adjustment');
    if (adj.success) {
      reports.push(`📦 ${adj.item}: ${adj.oldStock} → ${adj.newStock}`);
    }
  }
  return `✅ ปรับสต็อกสำเร็จ:\n${reports.join('\n')}`;
}

async function executeCancelLogic(res, userId, rawInput) {
  const orderNo = res.orderNo || await getLastOrderNumber();
  
  if (!orderNo) {
    return formatError('order_not_found');
  }
  
  const result = await cancelOrder(orderNo);
  
  if (result.success) {
    return formatCancelSuccess(result.orderNo, result.customer, result.stockRestored);
  }
  
  return formatError('order_not_found', { orderNo });
}

// ============================================================================
// UPDATE DELIVERY PERSON
// ============================================================================

async function updateDeliveryPerson(orderNo, deliveryPerson) {
  try {
    const rows = await getSheetData(CONFIG.SHEET_ID, 'คำสั่งซื้อ!A:I');
    const orderRows = [];
    let customer = '';
    let totalAmount = 0;
    let paymentStatus = '';
    
    for (let i = 1; i < rows.length; i++) {
      if (rows[i][0] == orderNo) {
        orderRows.push({ index: i + 1, data: rows[i] });
        customer = rows[i][2];
        totalAmount += parseFloat(rows[i][8] || 0);
        paymentStatus = rows[i][7];
      }
    }

    if (orderRows.length === 0) {
      return { success: false, error: `ไม่พบออเดอร์ #${orderNo}` };
    }

    for (const orderRow of orderRows) {
      await updateSheetData(CONFIG.SHEET_ID, `คำสั่งซื้อ!G${orderRow.index}`, [[deliveryPerson]]);
    }
    
    Logger.success(`🚚 Delivery updated: #${orderNo} → ${deliveryPerson}`);

    return {
      success: true,
      orderNo,
      customer,
      deliveryPerson,
      totalAmount,
      paymentStatus
    };
  } catch (error) {
    Logger.error('updateDeliveryPerson failed', error);
    return { success: false, error: error.message };
  }
}

// ============================================================================
// VIEW DELIVERY STATUS
// ============================================================================

async function viewDeliveryStatus() {
  try {
    const rows = await getSheetData(CONFIG.SHEET_ID, 'คำสั่งซื้อ!A:I');
    
    if (rows.length <= 1) {
      return '📦 ไม่มีออเดอร์ในระบบ';
    }

    const orders = new Map();
    
    for (let i = 1; i < rows.length; i++) {
      const orderNo = rows[i][0];
      const customer = rows[i][2];
      const deliveryPerson = rows[i][6] || '';
      const paymentStatus = rows[i][7];
      const amount = parseFloat(rows[i][8] || 0);
      
      if (!orders.has(orderNo)) {
        orders.set(orderNo, {
          orderNo,
          customer,
          deliveryPerson,
          paymentStatus,
          totalAmount: 0,
          itemCount: 0
        });
      }
      
      const order = orders.get(orderNo);
      order.totalAmount += amount;
      order.itemCount++;
    }

    const delivered = [];
    const pending = [];
    
    orders.forEach(order => {
      if (order.deliveryPerson) {
        delivered.push(order);
      } else {
        pending.push(order);
      }
    });

    let msg = `📦 สถานะการจัดส่ง\n${'='.repeat(40)}\n\n`;
    
    if (pending.length > 0) {
      msg += `⏳ รอจัดส่ง (${pending.length} ออเดอร์):\n\n`;
      pending.slice(0, 10).forEach(order => {
        const payIcon = order.paymentStatus === 'จ่ายแล้ว' ? '💰' : '⏳';
        msg += `${payIcon} #${order.orderNo} │ ${order.customer}\n`;
        msg += `   ${order.totalAmount.toLocaleString()}฿ │ ${order.itemCount} รายการ\n\n`;
      });
      
      if (pending.length > 10) {
        msg += `   ... และอีก ${pending.length - 10} ออเดอร์\n\n`;
      }
    }

    if (delivered.length > 0) {
      msg += `✅ ส่งแล้ว (${delivered.length} ออเดอร์ล่าสุด):\n\n`;
      delivered.slice(-5).reverse().forEach(order => {
        const payIcon = order.paymentStatus === 'จ่ายแล้ว' ? '💰' : '⏳';
        msg += `${payIcon} #${order.orderNo} │ ${order.customer}\n`;
        msg += `   🚚 ${order.deliveryPerson} │ ${order.totalAmount.toLocaleString()}฿\n\n`;
      });
    }

    msg += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `📊 สรุป: ${pending.length} รอส่ง │ ${delivered.length} ส่งแล้ว\n\n`;
    msg += `💡 พิมพ์ "ส่ง พี่แดง" เพื่ออัปเดตออเดอร์ล่าสุด`;

    return msg;

  } catch (error) {
    Logger.error('viewDeliveryStatus failed', error);
    return `❌ ไม่สามารถดูสถานะได้: ${error.message}`;
  }
}

// ============================================================================
// ORDER PROCESSING HELPERS
// ============================================================================

async function createOrderDirectly(customer, items, confidence, successMessage, userId) {
  const stockCheck = checkStockWarnings(items);
  
  if (stockCheck.hasCritical) {
    return { success: false, message: formatStockWarnings(stockCheck) };
  }

  if (customer && customer !== 'ไม่ระบุ') {
    await autoAddCustomer(customer);
  }

  const result = await createOrderTransaction({
    customer,
    items,
    paymentStatus: 'unpaid'
  });

  if (result.success) {
    await saveToInbox(userId, `Order #${result.orderNo}: ${customer}`, 'order_success');
    
    const msg = formatOrderSuccess(
      result.orderNo,
      result.customer,
      result.items,
      result.totalAmount,
      confidence
    );
    
    let finalMsg = msg;
    if (successMessage) {
      finalMsg = `🎯 ${successMessage}\n\n` + msg;
    }
    
    if (stockCheck.hasWarnings) {
      const warnings = stockCheck.warnings.map(w => w.message).join('\n');
      finalMsg += '\n\n━━━━━━━━━━━━━━━━━━━━\n⚠️ แจ้งเตือนสต็อก:\n' + warnings;
    }

    Logger.success(`✅ Direct order created: #${result.orderNo}`);
    return { success: true, message: finalMsg };
  } else {
    return { 
      success: false, 
      message: `❌ ไม่สามารถสร้างออเดอร์ได้\n\n${result.error}\n\n💡 พิมพ์ "สต็อก" เพื่อดูสต็อกปัจจุบัน`
    };
  }
}

async function processWithAutomationRules(parsed, userId) {
  const corrected = applySmartCorrection(parsed);
  const stockCheck = checkStockWarnings(corrected.items);
  
  if (stockCheck.hasCritical) {
    await saveToInbox(userId, parsed.rawInput || '', 'สต็อกไม่พอ', 'order_failed');
    return { success: false, message: formatStockWarnings(stockCheck) };
  }

  const orderValue = corrected.items.reduce((sum, item) => 
    sum + (item.quantity * item.stockItem.price), 0
  );

  const decision = shouldAutoProcess(corrected, orderValue);

  if (decision.shouldAuto) {
    if (corrected.customer && corrected.customer !== 'ไม่ระบุ') {
      await autoAddCustomer(corrected.customer);
    }
    
    const result = await createOrderTransaction({
      customer: corrected.customer,
      items: corrected.items,
      paymentStatus: corrected.paymentStatus || 'unpaid'
    });

    if (result.success) {
      const itemsSummary = corrected.items.map(i => `${i.stockItem.item} x${i.quantity}`).join(', ');
      await saveToInbox(
        userId, 
        parsed.rawInput || '', 
        `สร้างออเดอร์ #${result.orderNo} - ${corrected.customer} - ${itemsSummary} - ${result.totalAmount.toLocaleString()}฿`,
        'order'
      );
      
      const msg = formatOrderSuccess(
        result.orderNo,
        result.customer,
        result.items,
        result.totalAmount,
        corrected.confidence
      );
      
      let finalMsg = msg;
      if (stockCheck.hasWarnings) {
        const warnings = stockCheck.warnings.map(w => w.message).join('\n');
        finalMsg += '\n\n━━━━━━━━━━━━━━━━━━━━\n⚠️ แจ้งเตือนสต็อก:\n' + warnings;
      }
      
      monitor.recordDecision(decision, result.orderNo);
      Logger.success(`✅ Auto-processed order: #${result.orderNo}`);
      
      return { success: true, message: finalMsg };
    } else {
      await saveToInbox(userId, parsed.rawInput || '', result.error, 'order_failed');
      return { 
        success: false, 
        message: `❌ ไม่สามารถสร้างออเดอร์ได้\n\n${result.error}\n\n💡 พิมพ์ "สต็อก" เพื่อดูสต็อกปัจจุบัน`
      };
    }
  } else {
    const guess = corrected.items.map(i => `${i.stockItem.item} x${i.quantity}`).join(', ');
    await saveToInbox(
      userId, 
      parsed.rawInput || '', 
      `รอตรวจสอบ: ${corrected.customer} - ${guess} - ${orderValue.toLocaleString()}฿`,
      'pending'
    );
    
    monitor.recordDecision(decision, 'pending');
    
    return { 
      success: true, 
      message: `📝 รับคำสั่งแล้ว (รอตรวจสอบ)\n\n"${parsed.rawInput}"\n\n` +
              `🤖 ระบบเดา:\n• ลูกค้า: ${corrected.customer}\n• สินค้า: ${guess}\n` +
              `• ยอดรวม: ${orderValue.toLocaleString()}฿\n\n⚠️ เหตุผล: ${decision.reason}\n` +
              `💡 แอดมินจะตรวจสอบและบันทึกให้`
    };
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  handleMessage,
  updateDeliveryPerson,
  viewDeliveryStatus
};