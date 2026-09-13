const fs = require('fs');
const path = require('path');

const DB_FILE = process.env.VERCEL ? '/tmp/local_data.json' : path.join(__dirname, 'local_data.json');

let INITIAL_DATA = {};
try {
  INITIAL_DATA = JSON.parse(fs.readFileSync(path.join(__dirname, 'local_data.json'), 'utf8'));
} catch (e) {
  INITIAL_DATA = { categories: [], menu_items: [], users: [], orders: [], order_items: [], user_favorites: [] };
}

class LocalDb {
  constructor() {
    this.data = this.loadData();
  }

  loadData() {
    try {
      if (fs.existsSync(DB_FILE)) {
        const raw = fs.readFileSync(DB_FILE, 'utf8');
        return JSON.parse(raw);
      } else if (process.env.VERCEL) {
        const fallback = path.join(__dirname, 'local_data.json');
        if (fs.existsSync(fallback)) {
          const raw = fs.readFileSync(fallback, 'utf8');
          const data = JSON.parse(raw);
          this.saveData(data);
          return data;
        }
      }
    } catch (e) {
      console.error('Error loading local DB, initializing new:', e);
    }
    this.saveData(INITIAL_DATA);
    return JSON.parse(JSON.stringify(INITIAL_DATA));
  }

  saveData(data = this.data) {
    try {
      fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
    } catch (e) {
      console.error('Error saving local DB:', e);
    }
  }

  // Categories
  getCategories() {
    return [...this.data.categories];
  }

  addCategory({ name, icon_svg }) {
    const id = this.data.categories.length > 0 
      ? Math.max(...this.data.categories.map(c => Number(c.id) || 0)) + 1 
      : 1;
    const newCat = { id, name, icon_svg: icon_svg || '' };
    this.data.categories.push(newCat);
    this.saveData();
    return newCat;
  }

  updateCategory(id, { name, icon_svg }) {
    const cat = this.data.categories.find(c => String(c.id) === String(id));
    if (cat) {
      if (name !== undefined) cat.name = name;
      if (icon_svg !== undefined) cat.icon_svg = icon_svg;
      this.saveData();
      return cat;
    }
    return null;
  }

  deleteCategory(id) {
    this.data.categories = this.data.categories.filter(c => String(c.id) !== String(id));
    this.saveData();
    return { success: true };
  }

  // Menu items
  getMenuItems() {
    return [...this.data.menu_items];
  }

  addMenuItem(item) {
    const id = this.data.menu_items.length > 0 
      ? Math.max(...this.data.menu_items.map(m => Number(m.id) || 0)) + 1 
      : 1;
    const newItem = {
      id,
      name: item.name,
      description: item.description || '',
      price: parseFloat(item.price) || 0,
      category: item.category,
      available: item.available === 'true' || item.available === true,
      is_special: item.is_special === 'true' || item.is_special === true,
      is_my_canteen: item.is_my_canteen === 'true' || item.is_my_canteen === true,
      item_type: item.item_type || 'Non-Packet',
      image_url: item.image_url || null
    };
    this.data.menu_items.push(newItem);
    this.saveData();
    return newItem;
  }

  updateMenuItem(id, updates) {
    const item = this.data.menu_items.find(m => String(m.id) === String(id));
    if (item) {
      if (updates.name !== undefined) item.name = updates.name;
      if (updates.description !== undefined) item.description = updates.description;
      if (updates.price !== undefined) item.price = parseFloat(updates.price);
      if (updates.category !== undefined) item.category = updates.category;
      if (updates.available !== undefined) item.available = updates.available;
      if (updates.is_special !== undefined) item.is_special = updates.is_special;
      if (updates.is_my_canteen !== undefined) item.is_my_canteen = updates.is_my_canteen;
      if (updates.item_type !== undefined) item.item_type = updates.item_type;
      if (updates.image_url !== undefined) item.image_url = updates.image_url;
      this.saveData();
      return item;
    }
    return null;
  }

  deleteMenuItem(id) {
    this.data.menu_items = this.data.menu_items.filter(m => String(m.id) !== String(id));
    this.saveData();
    return { success: true };
  }

  // Users
  getUsers() {
    return [...this.data.users];
  }

  getUserById(userId) {
    return this.data.users.find(u => u.user_id === userId) || null;
  }

  addUser(user) {
    const id = this.data.users.length > 0 
      ? Math.max(...this.data.users.map(u => Number(u.id) || 0)) + 1 
      : 1;
    const newUser = {
      id,
      user_id: user.user_id,
      dob: user.dob,
      name: user.name || 'Student',
      role: user.role || 'student'
    };
    this.data.users.push(newUser);
    this.saveData();
    return newUser;
  }

  addUsersBulk(usersList) {
    let count = 0;
    for (const u of usersList) {
      if (!this.data.users.some(existing => existing.user_id === u.user_id)) {
        this.addUser(u);
        count++;
      }
    }
    return count;
  }

  deleteUser(id) {
    this.data.users = this.data.users.filter(u => String(u.id) !== String(id));
    this.saveData();
    return { success: true };
  }

  // Favorites
  getFavorites(userId) {
    return this.data.user_favorites
      .filter(f => String(f.user_id) === String(userId))
      .map(f => f.item_id);
  }

  toggleFavorite(userId, itemId) {
    const idx = this.data.user_favorites.findIndex(
      f => String(f.user_id) === String(userId) && Number(f.item_id) === Number(itemId)
    );
    if (idx >= 0) {
      this.data.user_favorites.splice(idx, 1);
      this.saveData();
      return { action: 'removed' };
    } else {
      this.data.user_favorites.push({ user_id: userId, item_id: Number(itemId) });
      this.saveData();
      return { action: 'added' };
    }
  }

  // Orders
  getOrders(startOfDay) {
    const startDate = startOfDay ? new Date(startOfDay) : new Date(0);
    return this.data.orders
      .filter(o => new Date(o.placed_at) >= startDate)
      .map(o => {
        const orderItems = this.data.order_items
          .filter(oi => oi.order_id === o.id)
          .map(oi => {
            const mi = this.data.menu_items.find(m => Number(m.id) === Number(oi.item_id));
            return {
              quantity: oi.quantity,
              price_at_time: oi.price_at_time,
              notes: oi.notes || '',
              menu_items: mi ? { name: mi.name, image_url: mi.image_url, item_type: mi.item_type } : null
            };
          });
        return {
          ...o,
          order_items: orderItems
        };
      })
      .sort((a, b) => new Date(b.placed_at) - new Date(a.placed_at));
  }

  getOrder(id) {
    const order = this.data.orders.find(o => o.id === id);
    if (!order) return null;
    const items = this.data.order_items
      .filter(oi => oi.order_id === id)
      .map(oi => {
        const mi = this.data.menu_items.find(m => Number(m.id) === Number(oi.item_id));
        return {
          id: oi.item_id,
          name: mi ? mi.name : 'Unknown',
          itemType: mi ? mi.item_type : 'Non-Packet',
          quantity: oi.quantity,
          price: oi.price_at_time,
          notes: oi.notes || ''
        };
      });
    return {
      ...order,
      items
    };
  }

  createOrder(orderData, items) {
    this.data.orders.push(orderData);
    for (const it of items) {
      this.data.order_items.push({
        order_id: orderData.id,
        item_id: it.id,
        quantity: it.quantity,
        price_at_time: it.price,
        notes: it.notes || ''
      });
    }
    this.saveData();
    return orderData;
  }

  updateOrderStatus(id, status, estTime) {
    const order = this.data.orders.find(o => o.id === id);
    if (order) {
      order.status = status;
      if (estTime !== undefined) order.est_ready_in = estTime;
      if (status === 'Ready') order.ready_at = new Date().toISOString();
      this.saveData();
      return order;
    }
    return null;
  }

  assignOrder(id, employeeId, employeeName) {
    const order = this.data.orders.find(o => o.id === id);
    if (order) {
      order.assigned_employee = employeeId;
      order.assigned_employee_name = employeeName;
      order.assigned_at = new Date().toISOString();
      this.saveData();
      return order;
    }
    return null;
  }

  cancelOrder(id, reason = '') {
    const order = this.data.orders.find(o => o.id === id);
    if (order) {
      order.status = 'Cancelled';
      order.cancellation_reason = reason || 'Cancelled by kitchen/admin';
      order.cancelled_at = new Date().toISOString();
      this.saveData();
      return order;
    }
    return null;
  }

  getQueueCount() {
    return this.data.orders.filter(o => 
      ['Pending', 'Preparing', 'Almost Ready'].includes(o.status)
    ).length;
  }

  getMaxTokenSince(startOfDay) {
    const startDate = startOfDay ? new Date(startOfDay) : new Date(0);
    const dayOrders = this.data.orders.filter(o => new Date(o.placed_at) >= startDate);
    if (dayOrders.length === 0) return 0;
    return Math.max(...dayOrders.map(o => Number(o.token) || 0));
  }
}

module.exports = new LocalDb();
