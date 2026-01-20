const { saveToInbox, generateInboxSummary, cancelOrder } = require('../service/inboxService');
const { smartLearner } = require('../service/smartOrderLearning');
const { shouldAutoProcess, applySmartCorrection, monitor } = require('../service/aggressiveAutoConfig');
const { parseOrder } = require('../service/orderParser'); // แนะนำให้ใช้ Parser ของ TonpaiICE2
const { autoAddCustomer } = require('../service/customerService');
const { Logger } = require('../logger');

// ============================================================================
// 1. ENHANCED FORMATTERS (เอาความสวยงามจาก TonpaiICE2 มาใช้)
// ============================================================================

function formatOrderSuccess(orderNo, customer, items, totalAmount, confidence, wasAuto = false) {
  const summary = items.map(i => {
    const itemName = i.productName || i.stockItem?.item || 'สินค้า';
    const newStock = i.newStock !== undefined ? i.newStock : 0;
    
    let stockIcon = '✅';
    if (newStock <= 3) stockIcon = '🔴';
    else if (newStock <= 10) stockIcon = '🟡';
    
    return `${stockIcon} ${itemName} x${i.quantity} (${newStock} เหลือ)`;
  }).join('\n');
  
  let msg = wasAuto ? `⚡ Auto-Approved!\n\n` : `✅ บันทึกออเดอร์สำเร็จ!\n\n`;
  msg += `📋 คำสั่งซื้อ #${orderNo}\n`;
  msg += `👤 ${customer}\n\n`;
  msg += `${summary}\n\n`;
  msg += `💰 รวม: ${totalAmount.toLocaleString()}฿\n`;
  msg += `🎯 ความมั่นใจ: ${confidence}\n`;
  
  // เพิ่มส่วน Quick Actions ของ Augustwater เข้าไป
  msg += `\n━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `⚡ Quick Actions:\n`;
  msg += `• "จ่าย" - จ่ายออเดอร์นี้\n`;
  msg += `• "ส่ง พี่แดง" - อัปเดตการจัดส่ง\n`;
  msg += `• "เช็ค #${orderNo}" - ดูตำแหน่งรถ\n`; // *Feature เฉพาะ Augustwater*
  
  return msg;
}


function checkStockWarnings(items) {
  const warnings = [];
  const criticalItems = [];
  
  items.forEach(item => {
    // ป้องกัน error กรณีไม่มีข้อมูลสต็อก
    if (!item.stockItem) return;

    const remaining = item.stockItem.stock - item.quantity;
    
    // กรณีที่ 1: สต็อกไม่พอ (ติดลบ) -> ห้ามขาย
    if (remaining < 0) {
      warnings.push({
        level: 'critical',
        message: `⚠️ สต็อกไม่พอ!\n${item.stockItem.item}: มี ${item.stockItem.stock} เหลือ (สั่ง ${item.quantity})`,
        canProceed: false
      });
      criticalItems.push(item.stockItem.item);
    } 
    // กรณีที่ 2: เหลือต่ำกว่า 3 ชิ้น -> เตือนวิกฤต (แต่ขายได้)
    else if (remaining <= 3) {
      warnings.push({
        level: 'critical',
        message: `⚠️ สต็อกเหลือน้อยมาก!\n${item.stockItem.item}: จะเหลือ ${remaining} ${item.stockItem.unit}`,
        canProceed: true
      });
    } 
    // กรณีที่ 3: เหลือต่ำกว่า 10 ชิ้น -> แจ้งเตือนปกติ
    else if (remaining <= 10) {
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
  
  // ถ้ามีสินค้าที่สต็อกไม่พอ ให้แสดง Error และบล็อกการทำงาน
  if (checkResult.hasCritical) {
    return '🔴 สต็อกไม่พอ!\n\n' + 
           checkResult.warnings
             .filter(w => !w.canProceed)
             .map(w => w.message)
             .join('\n\n') +
           '\n\n❌ ไม่สามารถสร้างออเดอร์ได้';
  }
  
  // ถ้าแค่เตือนเฉยๆ (เหลือ 3-10 ชิ้น) ให้แสดงข้อความเตือน
  return checkResult.warnings.map(w => w.message).join('\n');
}
// ============================================================================
// 2. MAIN MESSAGE HANDLER (HYBRID VERSION)
// ============================================================================

async function handleMessage(text, userId) {
  try {
    const lower = text.toLowerCase().trim();

    // ✅ STEP 1: Save to Inbox (ฟีเจอร์ใหม่จาก Tonpai)
    // ช่วยให้ Admin ย้อนดูประวัติแชททั้งหมดได้
    if (saveToInbox) {
        await saveToInbox(userId, text);
    }

    // ---------------------------------------------------------
    // SYSTEM COMMANDS (ผสานความสามารถ)
    // ---------------------------------------------------------
    if (lower === 'สรุป' || lower.includes('สรุปวันนี้')) {
      const { generateDailySummary } = require('../service/dashboardService'); // ถ้ามี หรือใช้ของเดิม
      return { success: true, message: await generateDailySummary() }; // ปรับ function ตามที่มี
    }
    
    if (lower === 'inbox' || lower.includes('ประวัติ')) {
      return { success: true, message: await generateInboxSummary(20) };
    }
    
    if (lower === 'รีเฟรช') {
        // รีเฟรช Smart Learner ด้วย
        await smartLearner.loadOrderHistory();
        return { success: true, message: '✅ รีเฟรชข้อมูล & Smart Learning สำเร็จ' };
    }

    // ---------------------------------------------------------
    // AUGUSTWATER EXCLUSIVE: GPS & DELIVERY TRACKING
    // (ส่วนนี้สำคัญ ห้ามลบ เพราะ Tonpai ไม่มี)
    // ---------------------------------------------------------
    
    // เช็คตำแหน่งรถส่งของ
    if (lower.includes('เช็ค') || lower.includes('สถานะ')) {
      const orderNo = text.match(/#(\d+)/)?.[1];
      if (orderNo) {
        const delivery = await deliveryService.getDeliveryInfo(orderNo);
        if (delivery) {
          const vehicle = await gpsService.getLatestPosition(delivery.vehicleId);
          if (vehicle) {
            return {
              success: true,
              message: `📦 สถานะการจัดส่ง #${orderNo}\n` +
                      `🚚 รถ: ${delivery.vehicleId} (คนขับ: ${vehicle.driver})\n` +
                      `📍 พิกัด: ${vehicle.lat.toFixed(4)}, ${vehicle.lng.toFixed(4)}\n` +
                      `💨 ความเร็ว: ${vehicle.speed} km/h`
            };
          }
        }
      }
    }

    // อัปเดตคนส่งของ (GPS Assignment)
    if (lower.includes('ส่ง') && (lower.includes('#') || lower.includes('พี่') || lower.includes('คุณ'))) {
        const orderNo = text.match(/#(\d+)/)?.[1] || await getLastOrderNumber();
        const driverMatch = text.match(/ส่ง\s+(พี่|คุณ)?(.+)/);
        const driver = driverMatch ? driverMatch[2].trim() : '';

        if (orderNo && driver) {
             // ใช้ Logic อัปเดตของ Augustwater
             const result = await updateDeliveryPerson(orderNo, driver);
             if (result.success) {
                 await deliveryService.updateDeliveryStatus(orderNo, 'delivering');
                 return { success: true, message: `✅ มอบหมายงานสำเร็จ #${orderNo} → ${driver}` };
             }
        }
    }

    // ---------------------------------------------------------
    // INTELLIGENT ORDER PROCESSING (ยกเครื่องใหม่ด้วย Tonpai Engine)
    // ---------------------------------------------------------
    
    const aiResults = await parseOrder(text); // ใช้ parser ที่ฉลาดขึ้น
    
    if (!aiResults || aiResults.length === 0) {
      // Fallback ถ้าไม่เข้าใจ
      return { success: false, message: "❌ ไม่เข้าใจคำสั่ง ลองพูดใหม่ชัดๆ นะคะ" };
    }

    let finalResponses = [];

    for (const res of aiResults) {
      Logger.info(`🤖 AI Processing Intent: ${res.intent}`);

      switch (res.intent) {
        case 'order':
          // 🔥 ใช้ Logic ใหม่ที่มี Smart Learning
          finalResponses.push(await executeSmartOrderLogic(res, userId, text));
          break;

        case 'payment':
          finalResponses.push(await executePaymentLogic(res));
          break;

        case 'cancel':
          // เพิ่มฟีเจอร์ยกเลิกและคืนสต็อก
          const cancelRes = await cancelOrder(res.orderNo || await getLastOrderNumber());
          finalResponses.push(cancelRes.success ? `✅ ยกเลิกและคืนสต็อกแล้ว` : `❌ ผิดพลาด: ${cancelRes.error}`);
          break;
      }
    }

    return { 
      success: true, 
      message: finalResponses.join('\n\n' + '━'.repeat(15) + '\n\n') 
    };

  } catch (error) {
    Logger.error('handleMessage error', error);
    return { success: false, message: '❌ ระบบขัดข้อง' };
  }
}

// ============================================================================
// 3. SMART LOGIC (หัวใจใหม่ที่ยกมาจาก TonpaiICE2)
// ============================================================================

async function executeSmartOrderLogic(parsed, userId, rawInput) {
  try {
    // 1. Smart Correction: แก้คำผิดอัตโนมัติ
    parsed = applySmartCorrection(parsed);

    // 2. Smart Learning: ทำนายพฤติกรรมลูกค้า
    // เช่น ถ้าลูกค้าสั่ง "น้ำแข็ง" ระบบจะรู้ว่าหมายถึง "น้ำแข็งหลอดเล็ก 10 ถุง" จากประวัติ
    if (parsed.customer && parsed.customer !== 'ไม่ระบุ') {
        const prediction = smartLearner.predictOrder(parsed.customer, parsed.items);
        if (prediction.success && prediction.confidence === 'high') {
            Logger.info(`🧠 Smart Learning applied for ${parsed.customer}`);
            parsed.items = prediction.items; // ใช้ออเดอร์ที่ทำนายได้
        }
        
        // Auto-add customer ถ้าเป็นลูกค้าใหม่
        await autoAddCustomer(parsed.customer);
    }

    // 3. Stock Check
    const stockCheck = checkStockWarnings(parsed.items);
    if (stockCheck.hasCritical) {
        await saveToInbox(userId, rawInput, 'สต็อกไม่พอ', 'failed');
        return formatStockWarnings(stockCheck);
    }

    // 4. Auto-Process Decision
    const totalValue = parsed.items.reduce((sum, i) => sum + (i.quantity * i.stockItem.price), 0);
    const decision = shouldAutoProcess(parsed, totalValue);
    
    // 5. Create Order
    // ถ้ามั่นใจ (shouldAuto) -> สร้างเลย
    // ถ้าไม่มั่นใจ -> สร้างแบบ pending (รอตรวจสอบ)
    
    // ในที่นี้ Augustwater เน้นสร้างเลย แต่เราจะแปะป้ายกำกับไว้
    const result = await createOrderTransaction({
      customer: parsed.customer,
      items: parsed.items,
      paymentStatus: parsed.isPaid ? 'จ่ายแล้ว' : 'unpaid'
    });

    if (result.success) {
      // บันทึกการตัดสินใจของ AI
      monitor.recordDecision(decision, result.orderNo);
      
      // บันทึก Inbox
      await saveToInbox(userId, rawInput, `Order #${result.orderNo}`, 'success');

      return formatOrderSuccess(
        result.orderNo,
        result.customer,
        result.items,
        result.totalAmount,
        parsed.confidence || 'AI',
        decision.shouldAuto // บอก user ว่า AI อนุมัติเอง
      );
    } else {
      return `❌ สร้างออเดอร์ไม่สำเร็จ: ${result.error}`;
    }

  } catch (error) {
    Logger.error('executeSmartOrderLogic failed', error);
    return '❌ เกิดข้อผิดพลาดในการประมวลผลอัจฉริยะ';
  }
}

async function executePaymentLogic(res) {
  const orderNo = res.orderNo || await getLastOrderNumber();
  const result = await updateOrderPaymentStatus(orderNo, 'จ่ายแล้ว');
  
  if (result.success) {
    return `✅ รับเงินเรียบร้อย #${orderNo}\n💰 ยอด ${result.totalAmount.toLocaleString()}฿`;
  }
  return `❌ ไม่พบออเดอร์ #${orderNo}`;
}

// Function เดิมที่ Augustwater มีอยู่แล้ว (สำหรับการอัปเดตคนส่ง)
async function updateDeliveryPerson(orderNo, deliveryPerson) {
  // ... (ใช้ code เดิมของคุณได้เลย)
  // แต่แนะนำให้เพิ่มการ Log ลง Inbox ด้วย
  Logger.info(`Delivery assigned: #${orderNo} -> ${deliveryPerson}`);
  return { success: true }; 
}

module.exports = {
  handleMessage,
  updateDeliveryPerson
};
