const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

const DB_NAME = process.env.MYSQL_DATABASE || 'smart_canteen';
const LOCAL_DATA_FILE = path.join(__dirname, 'local_data.json');

let pool = null;

function toIso(value) {
  if (!value) return value;
  if (value instanceof Date) return value.toISOString();
  return value;
}

function mapMenuItem(row) {
  if (!row) return null;
  return {
    ...row,
    price: Number(row.price),
    available: Boolean(row.available),
    is_special: Boolean(row.is_special),
    is_my_canteen: Boolean(row.is_my_canteen)
  };
}

function mapOrder(row) {
  if (!row) return null;
  return {
    ...row,
    total: Number(row.total),
    placed_at: toIso(row.placed_at),
    cancelled_at: row.cancelled_at ? toIso(row.cancelled_at) : null
  };
}

async function connectServer() {
  return mysql.createConnection({
    host: process.env.MYSQL_HOST || '127.0.0.1',
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || '',
    multipleStatements: true
  });
}

async function init() {
  const admin = await connectServer();
  await admin.query(`CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await admin.end();

  pool = mysql.createPool({
    host: process.env.MYSQL_HOST || '127.0.0.1',
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || '',
    database: DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    multipleStatements: true,
    dateStrings: false,
    typeCast(field, next) {
      if (field.type === 'TINY' && field.length === 1) {
        return field.string() === '1';
      }
      if (field.type === 'NEWDECIMAL') {
        const v = field.string();
        return v === null ? null : parseFloat(v);
      }
      return next();
    }
  });

  const schema = fs.readFileSync(path.join(__dirname, '../db/schema.sql'), 'utf8');
  await pool.query(schema);
  await seedIfEmpty();
  return pool;
}

function getPool() {
  if (!pool) throw new Error('MySQL pool not initialized');
  return pool;
}

async function seedIfEmpty() {
  const [cats] = await pool.query('SELECT COUNT(*) AS c FROM categories');
  if (cats[0].c > 0) return;

  if (!fs.existsSync(LOCAL_DATA_FILE)) {
    console.warn('No local_data.json found to seed MySQL.');
    return;
  }

  const data = JSON.parse(fs.readFileSync(LOCAL_DATA_FILE, 'utf8'));
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    for (const c of data.categories || []) {
      await conn.query(
        'INSERT INTO categories (id, name, icon_svg) VALUES (?, ?, ?)',
        [c.id, c.name, c.icon_svg || null]
      );
    }

    for (const m of data.menu_items || []) {
      await conn.query(
        `INSERT INTO menu_items
          (id, name, description, price, category, available, image_url, is_special, is_my_canteen, item_type)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          m.id, m.name, m.description || '', m.price, m.category,
          m.available ? 1 : 0, m.image_url || null,
          m.is_special ? 1 : 0, m.is_my_canteen ? 1 : 0,
          m.item_type || 'Non-Packet'
        ]
      );
    }

    for (const u of data.users || []) {
      await conn.query(
        'INSERT INTO users (id, user_id, role, dob, name, password) VALUES (?, ?, ?, ?, ?, ?)',
        [u.id, u.user_id, u.role, u.dob, u.name, u.password || null]
      );
    }

    for (const o of data.orders || []) {
      await conn.query(
        `INSERT INTO orders (id, token, status, total, placed_at, est_ready_in, people_ahead, cancelled_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          o.id, o.token, o.status, o.total,
          o.placed_at ? new Date(o.placed_at) : new Date(),
          o.est_ready_in || null, o.people_ahead || 0,
          o.cancelled_at ? new Date(o.cancelled_at) : null
        ]
      );
    }

    for (const oi of data.order_items || []) {
      await conn.query(
        'INSERT INTO order_items (order_id, item_id, quantity, price_at_time, notes) VALUES (?, ?, ?, ?, ?)',
        [oi.order_id, Number(oi.item_id), oi.quantity, oi.price_at_time, oi.notes || '']
      );
    }

    for (const f of data.user_favorites || []) {
      await conn.query(
        'INSERT IGNORE INTO user_favorites (user_id, item_id) VALUES (?, ?)',
        [f.user_id, Number(f.item_id)]
      );
    }

    await conn.query('ALTER TABLE categories AUTO_INCREMENT = 100');
    await conn.query('ALTER TABLE menu_items AUTO_INCREMENT = 100');
    await conn.query('ALTER TABLE users AUTO_INCREMENT = 100');
    await conn.commit();
    console.log('MySQL database seeded from local_data.json');
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

async function getCategories() {
  const [rows] = await getPool().query('SELECT * FROM categories ORDER BY id');
  return rows;
}

async function addCategory({ name, icon_svg }) {
  const [result] = await getPool().query(
    'INSERT INTO categories (name, icon_svg) VALUES (?, ?)',
    [name, icon_svg || '']
  );
  const [rows] = await getPool().query('SELECT * FROM categories WHERE id = ?', [result.insertId]);
  return rows[0];
}

async function updateCategory(id, { name, icon_svg }) {
  await getPool().query('UPDATE categories SET name = ?, icon_svg = ? WHERE id = ?', [name, icon_svg, id]);
  const [rows] = await getPool().query('SELECT * FROM categories WHERE id = ?', [id]);
  return rows[0] || null;
}

async function deleteCategory(id) {
  await getPool().query('DELETE FROM categories WHERE id = ?', [id]);
  return { success: true };
}

async function getMenuItems() {
  const [rows] = await getPool().query('SELECT * FROM menu_items ORDER BY id');
  return rows.map(mapMenuItem);
}

async function addMenuItem(item) {
  const [result] = await getPool().query(
    `INSERT INTO menu_items
      (name, description, price, category, available, image_url, is_special, is_my_canteen, item_type)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      item.name,
      item.description || '',
      parseFloat(item.price) || 0,
      item.category,
      item.available === 'true' || item.available === true ? 1 : 0,
      item.image_url || null,
      item.is_special === 'true' || item.is_special === true ? 1 : 0,
      item.is_my_canteen === 'true' || item.is_my_canteen === true ? 1 : 0,
      item.item_type || 'Non-Packet'
    ]
  );
  const [rows] = await getPool().query('SELECT * FROM menu_items WHERE id = ?', [result.insertId]);
  return mapMenuItem(rows[0]);
}

async function updateMenuItem(id, updates) {
  const fields = [];
  const values = [];
  const map = {
    name: updates.name,
    description: updates.description,
    price: updates.price !== undefined ? parseFloat(updates.price) : undefined,
    category: updates.category,
    available: updates.available !== undefined ? (updates.available ? 1 : 0) : undefined,
    is_special: updates.is_special !== undefined ? (updates.is_special ? 1 : 0) : undefined,
    is_my_canteen: updates.is_my_canteen !== undefined ? (updates.is_my_canteen ? 1 : 0) : undefined,
    item_type: updates.item_type,
    image_url: updates.image_url
  };
  for (const [key, val] of Object.entries(map)) {
    if (val !== undefined) {
      fields.push(`${key} = ?`);
      values.push(val);
    }
  }
  if (fields.length) {
    values.push(id);
    await getPool().query(`UPDATE menu_items SET ${fields.join(', ')} WHERE id = ?`, values);
  }
  const [rows] = await getPool().query('SELECT * FROM menu_items WHERE id = ?', [id]);
  return mapMenuItem(rows[0]);
}

async function deleteMenuItem(id) {
  await getPool().query('DELETE FROM menu_items WHERE id = ?', [id]);
  return { success: true };
}

async function getUsers() {
  const [rows] = await getPool().query('SELECT * FROM users ORDER BY id DESC');
  return rows;
}

async function getUserById(userId) {
  const [rows] = await getPool().query('SELECT * FROM users WHERE user_id = ?', [userId]);
  return rows[0] || null;
}

async function addUser(user) {
  const [result] = await getPool().query(
    'INSERT INTO users (user_id, dob, name, role) VALUES (?, ?, ?, ?)',
    [user.user_id, user.dob, user.name || 'Student', user.role || 'student']
  );
  const [rows] = await getPool().query('SELECT * FROM users WHERE id = ?', [result.insertId]);
  return rows[0];
}

async function addUsersBulk(usersList) {
  let count = 0;
  for (const u of usersList) {
    const existing = await getUserById(u.user_id);
    if (!existing) {
      await addUser(u);
      count++;
    }
  }
  return count;
}

async function deleteUser(id) {
  await getPool().query('DELETE FROM users WHERE id = ?', [id]);
  return { success: true };
}

async function getFavorites(userId) {
  const [rows] = await getPool().query('SELECT item_id FROM user_favorites WHERE user_id = ?', [userId]);
  return rows.map(r => r.item_id);
}

async function toggleFavorite(userId, itemId) {
  const [existing] = await getPool().query(
    'SELECT id FROM user_favorites WHERE user_id = ? AND item_id = ?',
    [userId, itemId]
  );
  if (existing.length) {
    await getPool().query('DELETE FROM user_favorites WHERE user_id = ? AND item_id = ?', [userId, itemId]);
    return { action: 'removed' };
  }
  await getPool().query('INSERT INTO user_favorites (user_id, item_id) VALUES (?, ?)', [userId, itemId]);
  return { action: 'added' };
}

async function getOrders(startOfDay) {
  const [orders] = await getPool().query(
    'SELECT * FROM orders WHERE placed_at >= ? ORDER BY placed_at DESC',
    [new Date(startOfDay)]
  );
  const now = Date.now();
  const result = [];
  for (const order of orders) {
    const mapped = mapOrder(order);
    if (mapped.status === 'Cancelled' && mapped.cancelled_at) {
      const diffMins = (now - new Date(mapped.cancelled_at).getTime()) / (1000 * 60);
      if (diffMins > 30) continue;
    }
    const [items] = await getPool().query(
      `SELECT oi.quantity, oi.price_at_time, oi.notes, oi.item_id,
              mi.name, mi.image_url, mi.item_type
       FROM order_items oi
       LEFT JOIN menu_items mi ON mi.id = oi.item_id
       WHERE oi.order_id = ?`,
      [order.id]
    );
    mapped.order_items = items.map(it => ({
      quantity: it.quantity,
      price_at_time: Number(it.price_at_time),
      notes: it.notes || '',
      menu_items: it.name ? { name: it.name, image_url: it.image_url, item_type: it.item_type } : null
    }));
    result.push(mapped);
  }
  return result;
}

async function getOrder(id) {
  const [orders] = await getPool().query('SELECT * FROM orders WHERE id = ?', [id]);
  if (!orders.length) return null;
  const order = mapOrder(orders[0]);
  const [items] = await getPool().query(
    `SELECT oi.item_id, oi.quantity, oi.price_at_time, oi.notes, mi.name, mi.item_type
     FROM order_items oi
     LEFT JOIN menu_items mi ON mi.id = oi.item_id
     WHERE oi.order_id = ?`,
    [id]
  );
  order.items = items.map(it => ({
    id: it.item_id,
    name: it.name || 'Unknown',
    itemType: it.item_type || 'Non-Packet',
    quantity: it.quantity,
    price: Number(it.price_at_time),
    notes: it.notes || ''
  }));
  return order;
}

async function createOrder(orderData, items) {
  const conn = await getPool().getConnection();
  try {
    await conn.beginTransaction();
    await conn.query(
      `INSERT INTO orders (id, token, status, total, placed_at, est_ready_in, people_ahead)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        orderData.id, orderData.token, orderData.status, orderData.total,
        orderData.placed_at ? new Date(orderData.placed_at) : new Date(),
        orderData.est_ready_in, orderData.people_ahead
      ]
    );
    for (const it of items) {
      await conn.query(
        'INSERT INTO order_items (order_id, item_id, quantity, price_at_time, notes) VALUES (?, ?, ?, ?, ?)',
        [orderData.id, it.id, it.quantity, it.price, it.notes || '']
      );
    }
    await conn.commit();
    return orderData;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

async function updateOrderStatus(id, status, estTime) {
  if (estTime !== undefined) {
    await getPool().query('UPDATE orders SET status = ?, est_ready_in = ? WHERE id = ?', [status, estTime, id]);
  } else {
    await getPool().query('UPDATE orders SET status = ? WHERE id = ?', [status, id]);
  }
  const [rows] = await getPool().query('SELECT * FROM orders WHERE id = ?', [id]);
  return mapOrder(rows[0]);
}

async function cancelOrder(id) {
  const [rows] = await getPool().query('SELECT status FROM orders WHERE id = ?', [id]);
  if (!rows.length) return null;
  if (rows[0].status !== 'Pending') return mapOrder((await getPool().query('SELECT * FROM orders WHERE id = ?', [id]))[0][0]);
  await getPool().query(
    'UPDATE orders SET status = ?, cancelled_at = ? WHERE id = ?',
    ['Cancelled', new Date(), id]
  );
  const [updated] = await getPool().query('SELECT * FROM orders WHERE id = ?', [id]);
  return mapOrder(updated[0]);
}

async function getQueueCount() {
  const [rows] = await getPool().query(
    `SELECT COUNT(*) AS c FROM orders WHERE status IN ('Pending', 'Preparing', 'Almost Ready')`
  );
  return rows[0].c;
}

async function getMaxTokenSince(startOfDay) {
  const [rows] = await getPool().query(
    'SELECT MAX(token) AS maxToken FROM orders WHERE placed_at >= ?',
    [new Date(startOfDay)]
  );
  return rows[0].maxToken || 0;
}

module.exports = {
  init,
  getCategories,
  addCategory,
  updateCategory,
  deleteCategory,
  getMenuItems,
  addMenuItem,
  updateMenuItem,
  deleteMenuItem,
  getUsers,
  getUserById,
  addUser,
  addUsersBulk,
  deleteUser,
  getFavorites,
  toggleFavorite,
  getOrders,
  getOrder,
  createOrder,
  updateOrderStatus,
  cancelOrder,
  getQueueCount,
  getMaxTokenSince
};
