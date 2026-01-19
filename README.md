# 🚚 Order Management & GPS Tracking System

ระบบจัดการคำสั่งซื้อพร้อม GPS Tracking และการจัดการขนส่งอัตโนมัติ

## ✨ Features

- 📦 **Order Management** - รับ-จัดการคำสั่งซื้อผ่านแชท
- 🗺️ **GPS Tracking** - ติดตามรถส่งของแบบเรียลไทม์
- 🚀 **Auto Delivery Assignment** - มอบหมายรถส่งของอัตโนมัติ (รถใกล้ที่สุด)
- 📊 **Dashboard** - แดชบอร์ดสำหรับดูภาพรวม
- 💰 **Payment Tracking** - ติดตามสถานะการชำระเงิน
- 📈 **Stock Management** - จัดการสต็อกสินค้า
- 🤖 **AI-Powered** - ประมวลผลคำสั่งด้วย AI

## 🏗️ Architecture

```
┌─────────────┐
│   Chat UI   │ ← พิมพ์คำสั่ง
└──────┬──────┘
       │
       ▼
┌─────────────────────────┐
│  Message Handler        │ ← แปลความหมาย
│  (AI Processing)        │
└──────┬──────────────────┘
       │
       ├─────► Order Service ──► Google Sheets
       │
       ├─────► GPS Service ────► Track Vehicles
       │
       └─────► Delivery Service ► Auto-Assign
```

## 📋 Prerequisites

- Node.js 16+ 
- Google Account (สำหรับ Google Sheets API)
- GPS Tracking Device (สำหรับรถส่งของ)

## 🚀 Quick Start

### 1. Installation

```bash
# Clone repository
git clone <your-repo>
cd order-gps-tracking-system

# Run setup script
chmod +x setup.sh
./setup.sh

# Or manual installation
npm install
cp .env.example .env
```

### 2. Google Sheets Setup

1. สร้าง Google Spreadsheet ใหม่
2. สร้าง Sheet ดังนี้:

**Sheet: GPS** (A-H)
```
| Vehicle ID | Timestamp | Lat | Lng | Speed | Heading | Driver | Status |
```

**Sheet: Deliveries** (A-I)
```
| Order ID | Vehicle ID | Customer | Assigned At | Status | Lat | Lng | Distance | Completed At |
```

**Sheet: ลูกค้า** (เพิ่ม D-E)
```
| Name | Phone | Address | Lat | Lng |
```

3. Setup Google API:
   - ไปที่ https://console.cloud.google.com
   - สร้าง Service Account
   - Download credentials.json
   - วางใน `credentials/google-credentials.json`
   - Share Sheet กับ service account email

### 3. Configuration

แก้ไข `.env`:
```env
GOOGLE_SHEET_ID=your-sheet-id-here
GOOGLE_APPLICATION_CREDENTIALS=./credentials/google-credentials.json
PORT=3000
AUTO_ASSIGN_DELIVERY=true
```

### 4. Run Application

```bash
# Development
npm run dev

# Production
npm start
```

Server จะรันที่: `http://localhost:3000`

## 📡 API Endpoints

### GPS Endpoints

```bash
# Update GPS Position
POST /api/gps/update
{
  "vehicleId": "กข1234",
  "lat": 13.7563,
  "lng": 100.5018,
  "speed": 45,
  "heading": 90,
  "driver": "พี่แดง",
  "status": "delivering"
}

# Get All Vehicles
GET /api/gps/vehicles

# Get Specific Vehicle
GET /api/gps/vehicle/กข1234

# Get Nearby Vehicles
GET /api/gps/nearby?lat=13.7563&lng=100.5018&radius=5

# Update Vehicle Status
PUT /api/gps/vehicle/กข1234/status
{
  "status": "idle"
}
```

### Delivery Endpoints

```bash
# Assign Delivery
POST /api/delivery/assign
{
  "orderId": "123",
  "location": { "lat": 13.7563, "lng": 100.5018 },
  "customer": "คุณสมชาย"
}

# Update Delivery Status
PUT /api/delivery/123/status
{
  "status": "delivering"
}

# Get Delivery Info
GET /api/delivery/123

# Get Active Deliveries
GET /api/delivery/active

# Complete Delivery
POST /api/delivery/complete
{
  "orderId": "123"
}
```

### Message/Chat Endpoints

```bash
# Process Message (Order, Payment, etc.)
POST /api/message
{
  "text": "น้ำแข็ง 2 ถุง คุณสมชาย",
  "userId": "user123"
}
```

## 💬 Chat Commands

### Order Commands
```
น้ำแข็ง 2 ถุง คุณสมชาย
→ สร้างออเดอร์ใหม่

เบียร์สิงห์ 3 ลัง ร้านเจ้แอน
→ สร้างออเดอร์พร้อมระบุลูกค้า
```

### Payment Commands
```
จ่าย
→ จ่ายออเดอร์ล่าสุด

จ่าย #123
→ จ่ายออเดอร์เลขที่ 123
```

### Delivery Commands
```
ส่ง พี่แดง
→ มอบหมายพี่แดงส่งออเดอร์ล่าสุด

ส่ง #123 พี่ดำ
→ มอบหมายพี่ดำส่งออเดอร์ 123

เช็ค #123
→ ตรวจสอบสถานะการส่ง
```

### System Commands
```
สรุป
→ สรุปยอดขายวันนี้

สต็อก
→ ดูสต็อกปัจจุบัน

inbox
→ ดูประวัติคำสั่ง

รีเฟรช
→ รีเฟรชข้อมูล
```

## 🧪 Testing

```bash
# Run test suite
npm test

# Test individual endpoints
curl http://localhost:3000/health

curl -X POST http://localhost:3000/api/gps/update \
  -H "Content-Type: application/json" \
  -d '{"vehicleId":"TEST001","lat":13.7563,"lng":100.5018,"speed":0}'

curl -X POST http://localhost:3000/api/message \
  -H "Content-Type: application/json" \
  -d '{"text":"น้ำแข็ง 2 ถุง คุณสมชาย","userId":"admin"}'
```

## 📁 Project Structure

```
project/
├── src/
│   ├── app.js                    # Main application
│   ├── config.js                 # Configuration
│   ├── logger.js                 # Logging utility
│   │
│   ├── handlers/
│   │   ├── messageHandlerService.js  # Chat message processing
│   │   ├── gpsHandler.js             # GPS API handlers
│   │   └── deliveryHandler.js        # Delivery API handlers
│   │
│   ├── service/
│   │   ├── gpsService.js             # GPS tracking logic
│   │   ├── deliveryService.js        # Delivery management
│   │   ├── customerService.js        # Customer management
│   │   └── integration/
│   │       └── orderService.js       # Order processing
│   │
│   └── utils/
│       ├── dateUtils.js              # Date/time utilities
│       ├── geoUtils.js               # Geospatial calculations
│       └── routeOptimizer.js         # Route optimization
│
├── credentials/
│   └── google-credentials.json   # Google API credentials
│
├── package.json
├── .env
└── README.md
```

## 🔧 Configuration Options

### GPS Settings
```javascript
GPS_UPDATE_INTERVAL: 30000        // GPS update frequency (ms)
GPS_CACHE_TTL: 30000              // Cache validity (ms)
VEHICLE_IDLE_SPEED_THRESHOLD: 5   // Speed threshold (km/h)
```

### Delivery Settings
```javascript
AUTO_ASSIGN_DELIVERY: true        // Enable auto-assignment
DELIVERY_RADIUS_KM: 10            // Search radius
MAX_DELIVERY_DISTANCE_KM: 50      // Maximum distance
```

## 🐛 Troubleshooting

### GPS not updating
1. ตรวจสอบ GPS device ทำงานปกติ
2. ตรวจสอบ API endpoint ได้รับข้อมูล
3. ดู logs: `tail -f logs/app.log`

### Delivery not auto-assigned
1. ตรวจสอบ `AUTO_ASSIGN_DELIVERY=true`
2. ตรวจสอบลูกค้ามี lat/lng ใน Sheet
3. ตรวจสอบรถมีสถานะ 'idle'

### Import errors
1. ตรวจสอบ path ในไฟล์ต่างๆ
2. ลบ folder `src/Service/` (ตัวพิมพ์ใหญ่)
3. ใช้แค่ `src/service/` (ตัวพิมพ์เล็ก)

## 📊 Performance

- GPS cache: 30 วินาที
- ประมวลผลคำสั่ง: < 2 วินาที
- Auto-assignment: < 1 วินาที (100 รถ)

## 🔐 Security

- Google Service Account authentication
- API rate limiting (ควรเพิ่ม)
- Input validation
- Error handling

## 🚀 Deployment

### Production Checklist
- [ ] Set `NODE_ENV=production`
- [ ] Configure proper Google credentials
- [ ] Setup process manager (PM2)
- [ ] Configure reverse proxy (Nginx)
- [ ] Setup SSL certificate
- [ ] Configure monitoring
- [ ] Setup backup for Google Sheets

### PM2 Deployment
```bash
npm install -g pm2
pm2 start src/app.js --name "order-gps"
pm2 save
pm2 startup
```

## 📈 Future Enhancements

- [ ] Real-time map visualization
- [ ] Push notifications (Line/SMS)
- [ ] Machine learning for ETA prediction
- [ ] Multi-stop route optimization
- [ ] Traffic integration
- [ ] Mobile app for drivers
- [ ] Customer delivery preferences
- [ ] Analytics dashboard

## 🤝 Contributing

1. Fork the repository
2. Create feature branch
3. Commit changes
4. Push to branch
5. Create Pull Request

## 📝 License

MIT License

## 📞 Support

For issues or questions:
- Check logs in `logs/` directory
- Review error messages
- Check Google Sheets API quota
- Verify all environment variables

---

**Made with ❤️ for efficient delivery management**
