const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { Server } = require('socket.io');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const kitchenDispatch = require('./kitchenDispatch');

let db = require('./localDb'); // default to localDb; upgraded to mysqlDb in start() if available

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const frontendDir = path.join(__dirname, '../frontend');
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  try { fs.mkdirSync(uploadsDir, { recursive: true }); } catch (e) {}
}

app.use(express.static(frontendDir));
app.use('/uploads', express.static(uploadsDir));

// Production health check for Railway
app.get('/health', (req, res) => res.json({ status: 'ok', uptime: process.uptime(), time: new Date().toISOString() }));

app.get('/favicon.ico', (req, res) => res.status(204).end());

// Clean route mappings for direct URL access without .html
app.get('/admin', (req, res) => res.sendFile(path.join(frontendDir, 'admin.html')));
app.get(['/kitchen', '/kitchen.html'], (req, res) => res.sendFile(path.join(frontendDir, 'kitchen.html')));
app.get('/login', (req, res) => res.sendFile(path.join(frontendDir, 'login.html')));
app.get('/menu', (req, res) => res.sendFile(path.join(frontendDir, 'menu.html')));
app.get('/cart', (req, res) => res.sendFile(path.join(frontendDir, 'cart.html')));
app.get('/orders', (req, res) => res.sendFile(path.join(frontendDir, 'orders.html')));
app.get('/splash', (req, res) => res.sendFile(path.join(frontendDir, 'splash.html')));


const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

let inMemorySettings = { canteenStatus: 'OPEN', hours: '8:00 AM - 8:00 PM', theme: '2. GREEN THEME' };

function getSettingsPath() {
  return process.env.VERCEL ? '/tmp/settings.json' : path.join(__dirname, 'settings.json');
}

function loadSettings() {
  try {
    const settingsPath = getSettingsPath();
    if (fs.existsSync(settingsPath)) {
      inMemorySettings = { ...inMemorySettings, ...JSON.parse(fs.readFileSync(settingsPath, 'utf8')) };
    } else if (process.env.VERCEL) {
      const fallback = path.join(__dirname, 'settings.json');
      if (fs.existsSync(fallback)) {
        inMemorySettings = { ...inMemorySettings, ...JSON.parse(fs.readFileSync(fallback, 'utf8')) };
      }
    }
  } catch (err) {}
  return inMemorySettings;
}

function saveSettings(settings) {
  inMemorySettings = { ...inMemorySettings, ...settings };
  try {
    fs.writeFileSync(getSettingsPath(), JSON.stringify(inMemorySettings, null, 2));
  } catch (err) {}
}

function getStartOfDay() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

io.on('connection', (socket) => {
  console.log('Client connected via socket:', socket.id);
  io.emit('active_users_count', io.engine.clientsCount);

  socket.on('disconnect', () => {
    io.emit('active_users_count', io.engine.clientsCount);
  });
});

let currentToken = 0;
let lastTokenDateStr = '';

async function getNextToken() {
  const startOfDay = getStartOfDay();
  if (lastTokenDateStr !== startOfDay) {
    currentToken = await db.getMaxTokenSince(startOfDay);
    lastTokenDateStr = startOfDay;
  }
  currentToken++;
  return currentToken;
}

let isProcessingOrder = false;
const orderRequestQueue = [];

function processNextOrder() {
  if (isProcessingOrder || orderRequestQueue.length === 0) return;
  isProcessingOrder = true;
  const { req, res } = orderRequestQueue.shift();

  handleCreateOrder(req, res).finally(() => {
    isProcessingOrder = false;
    processNextOrder();
  });
}

app.get('/api/menu', async (req, res) => {
  try {
    res.json(await db.getMenuItems());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/menu', upload.single('image'), async (req, res) => {
  try {
    const { name, description, price, category, available, is_special, is_my_canteen, item_type } = req.body;
    let imageUrl = req.body.image_url || null;
    if (req.file) {
      const base64Data = req.file.buffer.toString('base64');
      imageUrl = `data:${req.file.mimetype};base64,${base64Data}`;
    }
    const newItem = await db.addMenuItem({
      name, description, price, category, available, is_special, is_my_canteen, item_type, image_url: imageUrl
    });
    io.emit('refresh_menu');
    res.json(newItem);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/menu/:id', upload.single('image'), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, price, category, available, is_special, is_my_canteen, item_type } = req.body;
    const updates = {
      name, description,
      price: parseFloat(price) || 0,
      category,
      available: available === 'true' || available === true,
      is_special: is_special === 'true' || is_special === true,
      is_my_canteen: is_my_canteen === 'true' || is_my_canteen === true,
      item_type: item_type || 'Non-Packet'
    };
    if (req.file) {
      const base64Data = req.file.buffer.toString('base64');
      updates.image_url = `data:${req.file.mimetype};base64,${base64Data}`;
    }
    const updated = await db.updateMenuItem(id, updates);
    io.emit('refresh_menu');
    res.json(updated || { id, ...updates });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/menu/:id', async (req, res) => {
  try {
    const result = await db.deleteMenuItem(req.params.id);
    io.emit('refresh_menu');
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/categories', async (req, res) => {
  try {
    res.json(await db.getCategories());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/categories', async (req, res) => {
  try {
    const { name, icon_svg } = req.body;
    const newCat = await db.addCategory({ name, icon_svg });
    io.emit('refresh_categories');
    res.json(newCat);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/categories/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, icon_svg } = req.body;
    const updated = await db.updateCategory(id, { name, icon_svg });
    io.emit('refresh_categories');
    res.json(updated || { id, name, icon_svg });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/categories/:id', async (req, res) => {
  try {
    const result = await db.deleteCategory(req.params.id);
    io.emit('refresh_categories');
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


app.get('/api/favorites/:userId', async (req, res) => {
  try {
    res.json(await db.getFavorites(req.params.userId));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/favorites/toggle', async (req, res) => {
  try {
    const { userId, itemId } = req.body;
    res.json(await db.toggleFavorite(userId, itemId));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/login', async (req, res) => {
  const { id, password } = req.body;

  if (!id) return res.status(400).json({ error: 'ID or Email is required' });

  const cleanId = id.trim().toLowerCase();
  const cleanPassword = password ? password.trim() : '';

  const adminIdentifiers = (process.env.ADMIN_IDENTIFIERS || 'admin,admin@canteen.com')
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);

  const adminPasswords = (process.env.ADMIN_PASSWORDS || 'admin,admin123')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

  if (adminIdentifiers.includes(cleanId)) {
    if (adminPasswords.includes(cleanPassword)) {
      return res.json({ success: true, role: 'admin', userName: 'Admin' });
    }
    return res.status(401).json({ error: 'Incorrect admin password' });
  }

  // Check kitchen staff credentials
  const kitchenStaff = kitchenDispatch.getEmployeeById(cleanId);
  if (kitchenStaff) {
    const validKitchenPwd = cleanId === 'kitchen' ? 'kitchen123' : 'emp123';
    let isMatch = (cleanPassword === validKitchenPwd);
    try {
      const dbUser = await db.getUserById(id.trim());
      if (dbUser && (dbUser.password === cleanPassword || dbUser.dob === cleanPassword)) {
        isMatch = true;
      }
    } catch (e) {}

    if (isMatch) {
      return res.json({
        success: true,
        role: 'kitchen',
        employeeId: kitchenStaff.id,
        userName: kitchenStaff.name,
        specialization: kitchenStaff.specialization
      });
    }
    return res.status(401).json({ error: 'Incorrect kitchen credentials' });
  }

  try {
    const user = await db.getUserById(id.trim());
    if (user) {
      if (user.dob === password || (user.password && user.password === password)) {
        return res.json({
          success: true,
          role: user.role,
          userName: user.name,
          employeeId: user.user_id,
          specialization: user.specialization || null
        });
      }
      return res.status(401).json({ error: 'Incorrect credentials' });
    }
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }

  if (id.includes('@')) {
    return res.json({ success: true, role: 'visitor', userName: id.trim() });
  }

  if (!password) {
    return res.status(400).json({ error: 'Password (DOB) is required' });
  }

  return res.status(401).json({ error: 'Incorrect credentials' });
});

app.get('/api/users', async (req, res) => {
  try {
    res.json(await db.getUsers());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/users', async (req, res) => {
  try {
    const { user_id, dob, name, role } = req.body;
    res.json(await db.addUser({ user_id, dob, name, role }));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/users/bulk', async (req, res) => {
  const { users } = req.body;
  if (!Array.isArray(users)) {
    return res.status(400).json({ error: 'Invalid data format' });
  }
  try {
    const count = await db.addUsersBulk(users);
    res.json({ success: true, count });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/users/:id', async (req, res) => {
  try {
    res.json(await db.deleteUser(req.params.id));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/orders', async (req, res) => {
  try {
    res.json(await db.getOrders(getStartOfDay()));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/queue', async (req, res) => {
  try {
    const peopleAhead = await db.getQueueCount();
    const settings = loadSettings();
    res.json({
      currentQueue: peopleAhead,
      estWaitTime: peopleAhead === 0 ? 5 : peopleAhead * 3,
      canteenStatus: settings.canteenStatus,
      hours: settings.hours
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/settings', (req, res) => {
  res.json(loadSettings());
});

app.put('/api/settings/status', (req, res) => {
  const { status, hours } = req.body;
  try {
    const settings = loadSettings();
    settings.canteenStatus = status;
    if (hours) settings.hours = hours;
    saveSettings(settings);
    io.emit('refresh_status', settings);
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/settings/theme', (req, res) => {
  const { theme } = req.body;
  try {
    const settings = loadSettings();
    settings.theme = theme;
    saveSettings(settings);
    io.emit('refresh_theme', theme);
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/orders', (req, res) => {
  orderRequestQueue.push({ req, res });
  processNextOrder();
});

async function handleCreateOrder(req, res) {
  try {
    const { items, total, payment } = req.body;
    if (!items || items.length === 0) return res.status(400).json({ error: 'No items' });

    const orderId = `ORD${Date.now().toString().slice(-6)}`;
    const peopleAhead = await db.getQueueCount();
    const token = await getNextToken();

    // Intelligent Kitchen Allocation
    const allLiveOrders = await db.getOrders(getStartOfDay());
    const allocation = kitchenDispatch.allocateOrder({ items }, allLiveOrders);
    const estTime = allocation.prepEstimateMinutes || (peopleAhead === 0 ? 5 : peopleAhead * 3);

    const newOrderData = {
      id: orderId,
      token,
      status: 'Pending',
      total,
      placed_at: new Date().toISOString(),
      est_ready_in: estTime,
      people_ahead: peopleAhead,
      assigned_employee: allocation.employeeId,
      assigned_employee_name: allocation.employeeName,
      assigned_at: new Date().toISOString(),
      payment_status: (payment && payment.status) || 'PAID',
      payment_method: (payment && payment.method) || 'UPI',
      transaction_id: (payment && payment.transactionId) || `TXN_${Date.now()}`
    };

    await db.createOrder(newOrderData, items);

    io.emit('refresh_orders');
    io.emit('refresh_queue');
    io.emit('refresh_kitchen_orders');
    io.emit('order_assigned', {
      orderId: newOrderData.id,
      token: newOrderData.token,
      employeeId: allocation.employeeId,
      employeeName: allocation.employeeName,
      specialization: allocation.specialization,
      items,
      total: newOrderData.total,
      placedAt: newOrderData.placed_at,
      status: newOrderData.status,
      reasons: allocation.reasons
    });

    return res.json({
      id: newOrderData.id,
      token: newOrderData.token,
      status: newOrderData.status,
      total: newOrderData.total,
      placedAt: newOrderData.placed_at,
      estReadyIn: newOrderData.est_ready_in,
      peopleAhead: newOrderData.people_ahead,
      assigned_employee: newOrderData.assigned_employee,
      assigned_employee_name: newOrderData.assigned_employee_name,
      assigned_at: newOrderData.assigned_at,
      allocation_reasons: allocation.reasons,
      paymentStatus: newOrderData.payment_status,
      paymentMethod: newOrderData.payment_method,
      transactionId: newOrderData.transaction_id,
      items
    });
  } catch (err) {
    console.error('Create order failed:', err);
    return res.status(500).json({ error: err.message });
  }
}

// Payment Gateway Architecture Endpoints
app.post('/api/payments/create-order', (req, res) => {
  const { amount, currency = 'INR', customerId } = req.body;
  const paymentOrderId = `pay_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  res.json({
    success: true,
    paymentOrderId,
    amount,
    currency,
    keyId: process.env.PAYMENT_GATEWAY_KEY || 'sandbox_key',
    bypassActive: true
  });
});

app.post('/api/payments/verify', (req, res) => {
  const { transactionId, paymentOrderId, signature } = req.body;
  res.json({
    success: true,
    verified: true,
    status: 'PAID',
    transactionId: transactionId || `TXN_${Date.now()}`
  });
});

app.get('/api/orders/:id', async (req, res) => {
  try {
    const localOrder = await db.getOrder(req.params.id);
    if (!localOrder) return res.status(404).json({ error: 'Order not found' });
    return res.json({
      id: localOrder.id,
      token: localOrder.token,
      status: localOrder.status,
      total: localOrder.total,
      placedAt: localOrder.placed_at,
      estReadyIn: localOrder.est_ready_in,
      peopleAhead: localOrder.people_ahead,
      assigned_employee: localOrder.assigned_employee,
      assigned_employee_name: localOrder.assigned_employee_name,
      assigned_at: localOrder.assigned_at,
      cancellation_reason: localOrder.cancellation_reason || null,
      paymentStatus: localOrder.payment_status || 'PAID',
      paymentMethod: localOrder.payment_method || 'UPI',
      transactionId: localOrder.transaction_id || null,
      items: localOrder.items || []
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/orders/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, estTime } = req.body;
    const updated = await db.updateOrderStatus(id, status, estTime);
    io.emit('refresh_orders');
    io.emit('refresh_queue');
    io.emit('refresh_kitchen_orders');
    io.emit('order_status_updated', { id, status, estTime });
    res.json(updated || { id, status });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/orders/:id/cancel', async (req, res) => {
  try {
    const { reason, employeeName } = req.body || {};
    if (!reason || !reason.trim()) {
      return res.status(400).json({ error: 'Cancellation reason is required.' });
    }
    const fullReason = employeeName ? `${reason.trim()} (by ${employeeName})` : reason.trim();
    const cancelled = await db.cancelOrder(req.params.id, fullReason);
    io.emit('refresh_orders');
    io.emit('refresh_queue');
    io.emit('refresh_kitchen_orders');
    io.emit('order_status_updated', { id: req.params.id, status: 'Cancelled', reason: fullReason });
    res.json(cancelled || { id: req.params.id, status: 'Cancelled', cancellation_reason: fullReason });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Kitchen Specific Endpoints
app.get('/api/kitchen/employees', async (req, res) => {
  try {
    const allLiveOrders = await db.getOrders(getStartOfDay());
    const employees = kitchenDispatch.getEmployees(allLiveOrders);
    res.json(employees);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/kitchen/employees/:id/status', (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const emp = kitchenDispatch.setEmployeeStatus(id, status);
    if (!emp) return res.status(404).json({ error: 'Employee not found' });
    io.emit('refresh_kitchen_staff');
    res.json({ success: true, employee: emp });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/kitchen/orders', async (req, res) => {
  try {
    const { employeeId } = req.query;
    const allOrders = await db.getOrders(getStartOfDay());
    let kitchenOrders = allOrders.filter(o => 
      ['Pending', 'Preparing', 'Almost Ready', 'Ready'].includes(o.status)
    );
    if (employeeId && employeeId.toLowerCase() !== 'kitchen' && employeeId.toLowerCase() !== 'all') {
      kitchenOrders = kitchenOrders.filter(o => o.assigned_employee === employeeId);
    }
    res.json(kitchenOrders);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/kitchen/orders/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, estTime } = req.body;
    const updated = await db.updateOrderStatus(id, status, estTime);
    io.emit('refresh_orders');
    io.emit('refresh_queue');
    io.emit('refresh_kitchen_orders');
    io.emit('order_status_updated', { id, status, estTime });
    res.json(updated || { id, status });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/kitchen/orders/:id/cancel', async (req, res) => {
  try {
    const { reason, employeeId, employeeName } = req.body || {};
    if (!reason || !reason.trim()) {
      return res.status(400).json({ error: 'Cancellation reason is required' });
    }
    const fullReason = employeeName ? `${reason.trim()} (Cancelled by ${employeeName})` : reason.trim();
    const cancelled = await db.cancelOrder(req.params.id, fullReason);
    io.emit('refresh_orders');
    io.emit('refresh_queue');
    io.emit('refresh_kitchen_orders');
    io.emit('order_status_updated', { id: req.params.id, status: 'Cancelled', reason: fullReason });
    res.json(cancelled || { id: req.params.id, status: 'Cancelled', cancellation_reason: fullReason });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/kitchen/orders/:id/reassign', async (req, res) => {
  try {
    const { id } = req.params;
    const { employeeId } = req.body;
    const targetEmp = kitchenDispatch.getEmployeeById(employeeId);
    if (!targetEmp) return res.status(400).json({ error: 'Invalid employee target' });

    let updated = null;
    if (db.assignOrder) {
      updated = await db.assignOrder(id, targetEmp.id, targetEmp.name);
    } else {
      const order = await db.getOrder(id);
      if (order) {
        order.assigned_employee = targetEmp.id;
        order.assigned_employee_name = targetEmp.name;
        updated = order;
      }
    }

    io.emit('refresh_orders');
    io.emit('refresh_kitchen_orders');
    io.emit('order_assigned', {
      orderId: id,
      employeeId: targetEmp.id,
      employeeName: targetEmp.name
    });

    res.json({ success: true, order: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Fallback for HTML page navigation and bookmarks
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/') || req.path.startsWith('/uploads/') || req.path.startsWith('/socket.io/')) {
    return next();
  }
  const cleanPath = path.join(frontendDir, req.path + '.html');
  if (fs.existsSync(cleanPath)) {
    return res.sendFile(cleanPath);
  }
  res.sendFile(path.join(frontendDir, 'index.html'));
});

async function start() {
  // Try MySQL first; if unavailable, fall back to local JSON-based DB
  try {
    const mysqlDb = require('./mysqlDb');
    await mysqlDb.init();
    db = mysqlDb;
    console.log('✅ Connected to MySQL database');
  } catch (err) {
    console.warn('⚠️  MySQL unavailable:', err.message);
    console.warn('🔄 Falling back to local JSON database (localDb)...');
    db = require('./localDb');
    console.log('✅ Using local JSON database (localDb)');
  }

  if (require.main === module || !process.env.VERCEL) {
    server.listen(port, '0.0.0.0', () => {
      const os = require('os');
      const interfaces = os.networkInterfaces();
      let lanIp = 'localhost';
      for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
          if (iface.family === 'IPv4' && !iface.internal) {
            lanIp = iface.address;
            break;
          }
        }
      }

      console.log(`\n======================================================`);
      console.log(`🍕 Pizza Monk Production Backend Ready`);
      console.log(`➜ Local:   http://localhost:${port}`);
      console.log(`➜ Network: http://${lanIp}:${port} (Access from other devices on Wi-Fi)`);
      console.log(`======================================================\n`);
    });
  }
}

start().catch((err) => {
  console.error('❌ Failed to start server:', err);
  process.exit(1);
});

module.exports = app;
