import React, { useState, useEffect } from 'react';
import { MapPin, Truck, Package, Phone, Navigation, Clock, DollarSign, Users, TrendingUp } from 'lucide-react';

const UnifiedOrderGPSSystem = () => {
  const [activeTab, setActiveTab] = useState('overview');
  const [orders, setOrders] = useState([
    {
      id: 'ORD001',
      customer: 'คุณสมชาย',
      items: 'น้ำแข็งหลอด 60฿ x2, โค้ก 30฿ x5',
      total: 270,
      status: 'pending',
      payment: 'unpaid',
      delivery: null,
      timestamp: '2026-01-19 14:30:00',
      location: { lat: 13.7563, lng: 100.5018 }
    },
    {
      id: 'ORD002',
      customer: 'เจ้แอน',
      items: 'เบียร์สิงห์ 720฿ x3',
      total: 2160,
      status: 'delivering',
      payment: 'paid',
      delivery: 'พี่แดง',
      timestamp: '2026-01-19 13:15:00',
      location: { lat: 13.7449, lng: 100.5386 }
    }
  ]);

  const [vehicles, setVehicles] = useState([
    {
      id: 'กข1234',
      driver: 'พี่แดง',
      location: { lat: 13.7449, lng: 100.5386 },
      speed: 45,
      status: 'delivering',
      currentOrder: 'ORD002',
      lastUpdate: '2026-01-19 14:45:00'
    },
    {
      id: 'กง5678',
      driver: 'พี่ดำ',
      location: { lat: 13.7278, lng: 100.5208 },
      speed: 0,
      status: 'idle',
      currentOrder: null,
      lastUpdate: '2026-01-19 14:40:00'
    }
  ]);

  const [customers, setCustomers] = useState([
    {
      id: 'CUST001',
      name: 'คุณสมชาย',
      phone: '081-234-5678',
      address: 'ถนนสุขุมวิท กรุงเทพฯ',
      location: { lat: 13.7563, lng: 100.5018 },
      orderCount: 12
    },
    {
      id: 'CUST002',
      name: 'เจ้แอน',
      phone: '082-345-6789',
      address: 'ถนนเยาวราช กรุงเทพฯ',
      location: { lat: 13.7449, lng: 100.5386 },
      orderCount: 8
    }
  ]);

  const [stats, setStats] = useState({
    totalOrders: 15,
    activeDeliveries: 3,
    totalRevenue: 45680,
    avgDeliveryTime: 28
  });

  // Calculate distance between two points (simplified)
  const calculateDistance = (loc1, loc2) => {
    const dx = loc1.lat - loc2.lat;
    const dy = loc1.lng - loc2.lng;
    return Math.sqrt(dx * dx + dy * dy) * 111; // Rough km conversion
  };

  // Assign delivery to nearest vehicle
  const assignDelivery = (orderId) => {
    const order = orders.find(o => o.id === orderId);
    if (!order) return;

    const idleVehicles = vehicles.filter(v => v.status === 'idle');
    if (idleVehicles.length === 0) {
      alert('ไม่มีรถว่าง');
      return;
    }

    // Find nearest vehicle
    let nearestVehicle = idleVehicles[0];
    let minDistance = calculateDistance(order.location, nearestVehicle.location);

    idleVehicles.forEach(vehicle => {
      const distance = calculateDistance(order.location, vehicle.location);
      if (distance < minDistance) {
        minDistance = distance;
        nearestVehicle = vehicle;
      }
    });

    // Update order and vehicle
    setOrders(orders.map(o => 
      o.id === orderId 
        ? { ...o, status: 'delivering', delivery: nearestVehicle.driver }
        : o
    ));

    setVehicles(vehicles.map(v => 
      v.id === nearestVehicle.id
        ? { ...v, status: 'delivering', currentOrder: orderId }
        : v
    ));

    alert(`✅ มอบหมาย ${nearestVehicle.driver} (${nearestVehicle.id}) ส่งของให้ ${order.customer}\nระยะทาง: ${minDistance.toFixed(1)} กม.`);
  };

  // Complete delivery
  const completeDelivery = (orderId) => {
    setOrders(orders.map(o => 
      o.id === orderId 
        ? { ...o, status: 'completed' }
        : o
    ));

    const order = orders.find(o => o.id === orderId);
    setVehicles(vehicles.map(v => 
      v.currentOrder === orderId
        ? { ...v, status: 'idle', currentOrder: null }
        : v
    ));

    alert(`✅ ส่งสำเร็จ: ${order?.customer}`);
  };

  const OverviewPanel = () => (
    <div className="space-y-4">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-blue-50 p-4 rounded-lg border-l-4 border-blue-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">ออเดอร์วันนี้</p>
              <p className="text-2xl font-bold text-blue-600">{stats.totalOrders}</p>
            </div>
            <Package className="text-blue-500" size={32} />
          </div>
        </div>

        <div className="bg-green-50 p-4 rounded-lg border-l-4 border-green-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">กำลังส่ง</p>
              <p className="text-2xl font-bold text-green-600">{stats.activeDeliveries}</p>
            </div>
            <Truck className="text-green-500" size={32} />
          </div>
        </div>

        <div className="bg-purple-50 p-4 rounded-lg border-l-4 border-purple-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">ยอดขาย</p>
              <p className="text-2xl font-bold text-purple-600">{stats.totalRevenue.toLocaleString()}฿</p>
            </div>
            <DollarSign className="text-purple-500" size={32} />
          </div>
        </div>

        <div className="bg-orange-50 p-4 rounded-lg border-l-4 border-orange-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">เวลาเฉลี่ย</p>
              <p className="text-2xl font-bold text-orange-600">{stats.avgDeliveryTime} นาที</p>
            </div>
            <Clock className="text-orange-500" size={32} />
          </div>
        </div>
      </div>

      {/* Active Deliveries */}
      <div className="bg-white rounded-lg shadow p-4">
        <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
          <Truck size={20} />
          กำลังจัดส่ง
        </h3>
        <div className="space-y-3">
          {orders.filter(o => o.status === 'delivering').map(order => (
            <div key={order.id} className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
              <div className="flex-1">
                <p className="font-semibold">{order.customer}</p>
                <p className="text-sm text-gray-600">{order.items}</p>
                <p className="text-xs text-gray-500">ผู้ส่ง: {order.delivery}</p>
              </div>
              <button
                onClick={() => completeDelivery(order.id)}
                className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600"
              >
                ส่งสำเร็จ
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const OrdersPanel = () => (
    <div className="space-y-4">
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-bold text-lg">รายการคำสั่งซื้อ</h3>
        <div className="flex gap-2">
          <button className="px-3 py-1 bg-blue-100 text-blue-700 rounded">ทั้งหมด ({orders.length})</button>
          <button className="px-3 py-1 bg-gray-100 text-gray-700 rounded">รอส่ง ({orders.filter(o => o.status === 'pending').length})</button>
        </div>
      </div>

      {orders.map(order => (
        <div key={order.id} className="bg-white rounded-lg shadow p-4">
          <div className="flex justify-between items-start mb-3">
            <div>
              <p className="font-bold text-lg">#{order.id}</p>
              <p className="text-sm text-gray-600">{order.timestamp}</p>
            </div>
            <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
              order.status === 'completed' ? 'bg-green-100 text-green-700' :
              order.status === 'delivering' ? 'bg-blue-100 text-blue-700' :
              'bg-yellow-100 text-yellow-700'
            }`}>
              {order.status === 'completed' ? 'ส่งแล้ว' :
               order.status === 'delivering' ? 'กำลังส่ง' :
               'รอส่ง'}
            </span>
          </div>

          <div className="space-y-2 mb-3">
            <div className="flex items-center gap-2">
              <Users size={16} className="text-gray-500" />
              <span className="font-semibold">{order.customer}</span>
            </div>
            <div className="flex items-center gap-2">
              <Package size={16} className="text-gray-500" />
              <span className="text-sm">{order.items}</span>
            </div>
            <div className="flex items-center gap-2">
              <DollarSign size={16} className="text-gray-500" />
              <span className="font-semibold text-green-600">{order.total.toLocaleString()}฿</span>
            </div>
            {order.delivery && (
              <div className="flex items-center gap-2">
                <Truck size={16} className="text-gray-500" />
                <span className="text-sm">ผู้ส่ง: {order.delivery}</span>
              </div>
            )}
          </div>

          {order.status === 'pending' && (
            <button
              onClick={() => assignDelivery(order.id)}
              className="w-full px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 flex items-center justify-center gap-2"
            >
              <Truck size={18} />
              มอบหมายรถส่งของ
            </button>
          )}
        </div>
      ))}
    </div>
  );

  const VehiclesPanel = () => (
    <div className="space-y-4">
      <h3 className="font-bold text-lg mb-4">รถส่งของ</h3>
      {vehicles.map(vehicle => (
        <div key={vehicle.id} className="bg-white rounded-lg shadow p-4">
          <div className="flex justify-between items-start mb-3">
            <div>
              <p className="font-bold text-lg">{vehicle.id}</p>
              <p className="text-sm text-gray-600">คนขับ: {vehicle.driver}</p>
            </div>
            <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
              vehicle.status === 'delivering' ? 'bg-blue-100 text-blue-700' :
              'bg-gray-100 text-gray-700'
            }`}>
              {vehicle.status === 'delivering' ? 'กำลังส่งของ' : 'พร้อมใช้งาน'}
            </span>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <MapPin size={16} className="text-gray-500" />
              <span className="text-sm">
                {vehicle.location.lat.toFixed(4)}, {vehicle.location.lng.toFixed(4)}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Navigation size={16} className="text-gray-500" />
              <span className="text-sm">ความเร็ว: {vehicle.speed} กม./ชม.</span>
            </div>
            <div className="flex items-center gap-2">
              <Clock size={16} className="text-gray-500" />
              <span className="text-sm">อัปเดต: {vehicle.lastUpdate}</span>
            </div>
            {vehicle.currentOrder && (
              <div className="mt-3 p-2 bg-blue-50 rounded">
                <p className="text-sm font-semibold">กำลังส่ง: {vehicle.currentOrder}</p>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );

  const CustomersPanel = () => (
    <div className="space-y-4">
      <h3 className="font-bold text-lg mb-4">ลูกค้า</h3>
      {customers.map(customer => (
        <div key={customer.id} className="bg-white rounded-lg shadow p-4">
          <div className="flex justify-between items-start mb-3">
            <div>
              <p className="font-bold text-lg">{customer.name}</p>
              <p className="text-sm text-gray-600">{customer.id}</p>
            </div>
            <span className="px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-xs font-semibold">
              {customer.orderCount} ออเดอร์
            </span>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Phone size={16} className="text-gray-500" />
              <span className="text-sm">{customer.phone}</span>
            </div>
            <div className="flex items-center gap-2">
              <MapPin size={16} className="text-gray-500" />
              <span className="text-sm">{customer.address}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <Truck className="text-blue-500" size={32} />
            ระบบสั่งของ + GPS Tracking
          </h1>
          <p className="text-sm text-gray-600">Order Management & Delivery Tracking System</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex gap-4">
            <button
              onClick={() => setActiveTab('overview')}
              className={`px-4 py-3 border-b-2 font-semibold ${
                activeTab === 'overview' 
                  ? 'border-blue-500 text-blue-600' 
                  : 'border-transparent text-gray-600 hover:text-gray-800'
              }`}
            >
              ภาพรวม
            </button>
            <button
              onClick={() => setActiveTab('orders')}
              className={`px-4 py-3 border-b-2 font-semibold ${
                activeTab === 'orders' 
                  ? 'border-blue-500 text-blue-600' 
                  : 'border-transparent text-gray-600 hover:text-gray-800'
              }`}
            >
              คำสั่งซื้อ
            </button>
            <button
              onClick={() => setActiveTab('vehicles')}
              className={`px-4 py-3 border-b-2 font-semibold ${
                activeTab === 'vehicles' 
                  ? 'border-blue-500 text-blue-600' 
                  : 'border-transparent text-gray-600 hover:text-gray-800'
              }`}
            >
              รถส่งของ
            </button>
            <button
              onClick={() => setActiveTab('customers')}
              className={`px-4 py-3 border-b-2 font-semibold ${
                activeTab === 'customers' 
                  ? 'border-blue-500 text-blue-600' 
                  : 'border-transparent text-gray-600 hover:text-gray-800'
              }`}
            >
              ลูกค้า
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        {activeTab === 'overview' && <OverviewPanel />}
        {activeTab === 'orders' && <OrdersPanel />}
        {activeTab === 'vehicles' && <VehiclesPanel />}
        {activeTab === 'customers' && <CustomersPanel />}
      </div>
    </div>
  );
};

export default UnifiedOrderGPSSystem;