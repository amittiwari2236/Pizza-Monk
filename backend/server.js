const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { Server } = require('socket.io');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const kitchenDispatch = require('./kitchenDispatch');
const etaEngine = require('./etaEngine');

let db = require('./localDb'); // default to localDb; upgraded to mysqlDb in start() if available

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  transports: ['websocket', 'polling']
});

const port = process.env.PORT || 3000;

app.use(cors({
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin']
}));
app.options('*', cors());
app.use(express.json());

const frontendDir = path.join(__dirname, '../frontend');
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  try { fs.mkdirSync(uploadsDir, { recursive: true }); } catch (e) {}
}

app.use(express.static(frontendDir));
app.use('/uploads', express.static(uploadsDir));

// Production health check for Railway/Render
app.get('/health', (req, res) => res.json({ status: 'ok', uptime: process.uptime(), time: new Date().toISOString() }));

app.get('/favicon.ico', (req, res) => res.status(204).end());

// Clean route mappings for direct URL access without .html
app.get(['/admin', '/admin/', '/admin.html'], (req, res) => res.sendFile(path.join(frontendDir, 'admin.html')));
app.get(['/kitchen', '/kitchen/', '/kitchen.html'], (req, res) => res.sendFile(path.join(frontendDir, 'kitchen.html')));
app.get(['/login', '/login/', '/login.html'], (req, res) => res.sendFile(path.join(frontendDir, 'login.html')));
app.get(['/menu', '/menu/', '/menu.html'], (req, res) => res.sendFile(path.join(frontendDir, 'menu.html')));
app.get(['/cart', '/cart/', '/cart.html'], (req, res) => res.sendFile(path.join(frontendDir, 'cart.html')));
app.get(['/orders', '/orders/', '/orders.html'], (req, res) => res.sendFile(path.join(frontendDir, 'orders.html')));
app.get(['/splash', '/splash/', '/splash.html'], (req, res) => res.sendFile(path.join(frontendDir, 'splash.html')));


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

  const adminIdentifiers = Array.from(new Set([
    'admin',
    'admin@canteen.com',
    ...(process.env.ADMIN_IDENTIFIERS ? process.env.ADMIN_IDENTIFIERS.split(',') : [])
  ])).map(s => s.trim().toLowerCase()).filter(Boolean);

  const rawAdminPasswords = process.env.ADMIN_PASSWORDS ? process.env.ADMIN_PASSWORDS.split(',') : ['admin', 'admin123', 'Admin@123'];
  const adminPasswords = Array.from(new Set(['admin', 'admin123', 'Admin@123', ...rawAdminPasswords.map(s => s.trim())])).filter(Boolean);

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

    // Intelligent Kitchen Allocation & Dynamic ETA Engine
    const allLiveOrders = await db.getOrders(getStartOfDay());
    const completedOrders = (db.getCompletedOrders ? await db.getCompletedOrders(50) : []);
    const activeEmployees = kitchenDispatch.getEmployees(allLiveOrders);
    const allocation = kitchenDispatch.allocateOrder({ items }, allLiveOrders);
    const assignedEmp = kitchenDispatch.getEmployeeById(allocation.employeeId);
    const currentSettings = loadSettings();

    const etaResult = etaEngine.calculateOrderEta({
      items,
      assignedEmployee: assignedEmp,
      allLiveOrders,
      completedOrders,
      activeEmployees,
      settings: currentSettings
    });

    const newOrderData = {
      id: orderId,
      token,
      status: 'Pending',
      total,
      placed_at: new Date().toISOString(),
      est_ready_in: etaResult.estReadyIn,
      estimated_ready_at: etaResult.estimatedReadyAt,
      safety_buffer_minutes: etaResult.safetyBufferMinutes,
      is_delayed: false,
      delay_minutes: 0,
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
      estReadyIn: newOrderData.est_ready_in,
      estimatedReadyAt: newOrderData.estimated_ready_at,
      safetyBufferMinutes: newOrderData.safety_buffer_minutes,
      reasons: allocation.reasons,
      etaReasons: etaResult.reasons
    });

    io.emit('order_eta_updated', {
      orderId: newOrderData.id,
      token: newOrderData.token,
      status: newOrderData.status,
      estReadyIn: newOrderData.est_ready_in,
      estimatedReadyAt: newOrderData.estimated_ready_at,
      remainingMinutes: newOrderData.est_ready_in,
      safetyBufferMinutes: newOrderData.safety_buffer_minutes,
      isDelayed: false,
      delayMinutes: 0
    });

    return res.json({
      id: newOrderData.id,
      token: newOrderData.token,
      status: newOrderData.status,
      total: newOrderData.total,
      placedAt: newOrderData.placed_at,
      estReadyIn: newOrderData.est_ready_in,
      estimatedReadyAt: newOrderData.estimated_ready_at,
      safetyBufferMinutes: newOrderData.safety_buffer_minutes,
      remainingMinutes: newOrderData.est_ready_in,
      isDelayed: false,
      delayMinutes: 0,
      peopleAhead: newOrderData.people_ahead,
      assigned_employee: newOrderData.assigned_employee,
      assigned_employee_name: newOrderData.assigned_employee_name,
      assigned_at: newOrderData.assigned_at,
      allocation_reasons: allocation.reasons,
      eta_reasons: etaResult.reasons,
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

    const allLiveOrders = await db.getOrders(getStartOfDay());
    const completedOrders = (db.getCompletedOrders ? await db.getCompletedOrders(50) : []);
    const activeEmployees = kitchenDispatch.getEmployees(allLiveOrders);
    const settings = loadSettings();

    const recalc = etaEngine.recalculateOrderRemainingEta(localOrder, allLiveOrders, completedOrders, activeEmployees, settings);
    const feedback = db.getFeedback ? await db.getFeedback(localOrder.id) : null;

    const etaInfo = {
      remaining_minutes: recalc.remainingMinutes,
      estimated_ready_at: localOrder.estimated_ready_at || null,
      dynamic_buffer_minutes: localOrder.safety_buffer_minutes || recalc.dynamicBufferMinutes || 5.0,
      is_delayed: recalc.isDelayed,
      delay_minutes: recalc.delayMinutes,
      prep_minutes: recalc.prepMinutes || 8,
      queue_wait_minutes: recalc.queueWaitMinutes || 0,
      progress_percent: recalc.progressPercent || 50,
      station: localOrder.assigned_employee || 'Kitchen',
      employee_name: localOrder.assigned_employee_name || 'Chef Station'
    };

    return res.json({
      id: localOrder.id,
      token: localOrder.token,
      status: localOrder.status,
      total: localOrder.total,
      placedAt: localOrder.placed_at,
      estReadyIn: localOrder.est_ready_in,
      estimatedReadyAt: localOrder.estimated_ready_at || null,
      remainingMinutes: recalc.remainingMinutes,
      isDelayed: recalc.isDelayed,
      delayMinutes: recalc.delayMinutes,
      safetyBufferMinutes: localOrder.safety_buffer_minutes || recalc.dynamicBufferMinutes || 5.0,
      startedPreparingAt: localOrder.started_preparing_at || null,
      readyAt: localOrder.ready_at || null,
      actualPrepMinutes: localOrder.actual_prep_minutes || null,
      peopleAhead: localOrder.people_ahead,
      assigned_employee: localOrder.assigned_employee,
      assigned_employee_name: localOrder.assigned_employee_name,
      assigned_at: localOrder.assigned_at,
      cancellation_reason: localOrder.cancellation_reason || null,
      paymentStatus: localOrder.payment_status || 'PAID',
      paymentMethod: localOrder.payment_method || 'UPI',
      transactionId: localOrder.transaction_id || null,
      feedbackSubmitted: Boolean(localOrder.feedback_submitted || feedback),
      feedback_submitted: Boolean(localOrder.feedback_submitted || feedback),
      feedbackRating: localOrder.feedback_rating || (feedback ? feedback.rating : null),
      feedback: feedback || null,
      eta_info: etaInfo,
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
    io.emit('order_status_updated', {
      id,
      status,
      estTime,
      startedPreparingAt: updated ? updated.started_preparing_at : null,
      readyAt: updated ? updated.ready_at : null,
      actualPrepMinutes: updated ? updated.actual_prep_minutes : null
    });
    res.json(updated || { id, status });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/orders/:id/cancel', async (req, res) => {
  try {
    const { reason, employeeName } = req.body || {};
    const effectiveReason = (reason && reason.trim()) ? reason.trim() : 'Cancelled by user';
    const fullReason = employeeName ? `${effectiveReason} (by ${employeeName})` : effectiveReason;
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
    io.emit('order_status_updated', {
      id,
      status,
      estTime,
      startedPreparingAt: updated ? updated.started_preparing_at : null,
      readyAt: updated ? updated.ready_at : null,
      actualPrepMinutes: updated ? updated.actual_prep_minutes : null
    });
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

// =========================================================================
// CUSTOMER FEEDBACK SYSTEM ENDPOINTS
// =========================================================================
app.post('/api/feedback', async (req, res) => {
  try {
    const orderId = req.body.orderId || req.body.order_id;
    const rating = req.body.rating;
    const comment = req.body.comment;
    const tags = req.body.tags;
    const userName = req.body.userName || req.body.user_name;
    const userId = req.body.userId || req.body.user_id;
    const assignedEmployee = req.body.assigned_employee || req.body.assignedEmployee;
    const assignedEmployeeName = req.body.assigned_employee_name || req.body.assignedEmployeeName;
    const items = req.body.items;

    if (!orderId) {
      return res.status(400).json({ error: 'Order ID is required' });
    }
    const numRating = parseInt(rating, 10);
    if (!numRating || numRating < 1 || numRating > 5) {
      return res.status(400).json({ error: 'Rating must be an integer between 1 and 5' });
    }

    const order = await db.getOrder(orderId);
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    if (db.getFeedback) {
      const existing = await db.getFeedback(orderId);
      if (existing) {
        return res.status(400).json({ error: 'Feedback already submitted for this order', feedback: existing });
      }
    }

    const feedbackData = {
      order_id: orderId,
      user_id: userId || order.user_id || 'guest',
      user_name: userName || order.user_name || 'Customer',
      rating: numRating,
      comment: (comment || '').trim(),
      tags: Array.isArray(tags) ? tags.join(', ') : (tags || ''),
      assigned_employee: assignedEmployee || order.assigned_employee || null,
      assigned_employee_name: assignedEmployeeName || order.assigned_employee_name || null,
      items: Array.isArray(items) ? items : (order.items || [])
    };

    const saved = db.saveFeedback ? await db.saveFeedback(feedbackData) : feedbackData;

    io.emit('feedback_submitted', saved);
    io.emit('refresh_orders');

    res.json({ success: true, feedback: saved });
  } catch (err) {
    console.error('Submit feedback error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/feedback', async (req, res) => {
  try {
    const { orderId } = req.query;
    if (orderId && db.getFeedback) {
      const fb = await db.getFeedback(orderId);
      return res.json(fb ? [fb] : []);
    }
    const all = db.getFeedback ? await db.getFeedback() : [];
    res.json(all);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/feedback/stats', async (req, res) => {
  try {
    const stats = db.getFeedbackStats ? await db.getFeedbackStats() : { totalReviews: 0, averageRating: 5.0, recentFeedback: [] };
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =========================================================================
// DYNAMIC ETA DIAGNOSTICS & MANUAL BUFFER OVERRIDE
// =========================================================================
app.get('/api/eta/analytics', async (req, res) => {
  try {
    const allLiveOrders = await db.getOrders(getStartOfDay());
    const completedOrders = (db.getCompletedOrders ? await db.getCompletedOrders(50) : []);
    const activeEmployees = kitchenDispatch.getEmployees(allLiveOrders);
    const settings = loadSettings();
    const historical = etaEngine.calculateHistoricalLearningRatio(completedOrders);
    const activeStaff = activeEmployees.filter(e => e.status !== 'offline');
    const autoBuffer = etaEngine.calculateDynamicSafetyBuffer(
      allLiveOrders.length,
      activeStaff.length,
      historical.delayFrequency,
      2,
      false,
      settings
    );

    res.json({
      safetyBuffer: {
        baseline: 5,
        currentEffectiveBuffer: autoBuffer,
        isManualOverride: Boolean(settings.manualBufferOverride),
        manualMinutes: settings.manualBufferMinutes || null
      },
      kitchenCapacity: {
        activeStaffCount: activeStaff.length,
        activeOrdersCount: allLiveOrders.length,
        rushFactor: activeStaff.length > 0 ? Number((allLiveOrders.length / activeStaff.length).toFixed(2)) : 1.0
      },
      historical: {
        completedCount: historical.completedCount,
        avgActualMinutes: historical.avgActualPrep,
        avgEstimatedMinutes: historical.avgEstimatedPrep,
        learningRatio: historical.learningRatio,
        delayFrequency: historical.delayFrequency
      },
      activeLiveOrders: allLiveOrders.length,
      activeStaffCount: activeStaff.length,
      currentAutoBuffer: autoBuffer,
      manualBufferOverride: Boolean(settings.manualBufferOverride),
      manualBufferMinutes: settings.manualBufferMinutes || null,
      learningRatio: historical.learningRatio,
      delayFrequency: historical.delayFrequency,
      completedOrdersCount: historical.completedCount
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/settings/buffer', (req, res) => {
  try {
    const isOverride = Boolean(req.body.is_manual_override !== undefined ? req.body.is_manual_override : req.body.manualBufferOverride);
    const manualMinutes = typeof req.body.manual_buffer === 'number' ? req.body.manual_buffer : (typeof req.body.manualBufferMinutes === 'number' ? req.body.manualBufferMinutes : 5);
    const updatedSettings = {
      manualBufferOverride: isOverride,
      manualBufferMinutes: isOverride ? Math.max(1, Math.min(30, manualMinutes)) : null
    };
    saveSettings(updatedSettings);
    const currentSettings = loadSettings();
    const dynamicBufferInfo = {
      baseline: 5,
      currentEffectiveBuffer: isOverride ? manualMinutes : 5,
      isManualOverride: isOverride,
      manualBufferMinutes: isOverride ? manualMinutes : null
    };

    io.emit('refresh_settings', currentSettings);
    io.emit('settings_updated', {
      ...currentSettings,
      dynamicBuffer: dynamicBufferInfo
    });

    res.json({
      success: true,
      settings: currentSettings,
      dynamicBuffer: dynamicBufferInfo
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =========================================================================
// REAL-TIME DYNAMIC ETA & DELAY BACKGROUND MONITOR (Runs every 15s)
// =========================================================================
setInterval(async () => {
  try {
    const liveOrders = await db.getOrders(getStartOfDay());
    const inProgress = liveOrders.filter(o => ['Pending', 'Preparing', 'Almost Ready'].includes(o.status));
    if (inProgress.length === 0) return;

    const completed = (db.getCompletedOrders ? await db.getCompletedOrders(50) : []);
    const activeStaff = kitchenDispatch.getEmployees(liveOrders);
    const settings = loadSettings();

    for (const order of inProgress) {
      const recalc = etaEngine.recalculateOrderRemainingEta(order, liveOrders, completed, activeStaff, settings);
      const stateChanged = (Boolean(order.is_delayed) !== Boolean(recalc.isDelayed)) ||
                           (Number(order.delay_minutes) !== Number(recalc.delayMinutes));

      if (stateChanged && db.updateOrderEta) {
        await db.updateOrderEta(order.id, {
          is_delayed: recalc.isDelayed,
          delay_minutes: recalc.delayMinutes,
          safety_buffer_minutes: recalc.dynamicBufferMinutes
        });
      }

      io.emit('order_eta_updated', {
        orderId: order.id,
        token: order.token,
        status: order.status,
        estReadyIn: order.est_ready_in,
        estimatedReadyAt: order.estimated_ready_at,
        remainingMinutes: recalc.remainingMinutes,
        isDelayed: recalc.isDelayed,
        delayMinutes: recalc.delayMinutes,
        safetyBufferMinutes: recalc.dynamicBufferMinutes || order.safety_buffer_minutes || 5.0,
        elapsedMinutes: recalc.elapsedMinutes
      });
    }
  } catch (e) {
    // Non-blocking background monitor
  }
}, 15000);

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
