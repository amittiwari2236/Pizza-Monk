const API_URL = `/api`;
const socket = io(``);

// State
let menuItems = [];
let orders = [];
let categories = [];

// DOM Elements
const views = document.querySelectorAll('.view');
const navItems = document.querySelectorAll('.nav-item');
const menuModal = document.getElementById('menu-modal');
const menuForm = document.getElementById('menu-form');

// Initialization
document.addEventListener('DOMContentLoaded', () => {
  setupNavigation();
  fetchStats();
  fetchOrders();
  fetchMenu();
  fetchCategories();
  fetchKitchenStaff();
  fetchEtaAnalytics();
  fetchFeedbackData();
  
  // Load canteen status
  fetchSettings();

  // Setup socket listeners
  socket.on('refresh_queue', fetchStats);
  socket.on('refresh_orders', () => { fetchOrders(); fetchKitchenStaff(); fetchEtaAnalytics(); });
  socket.on('refresh_kitchen_staff', fetchKitchenStaff);
  socket.on('order_assigned', () => { fetchOrders(); fetchKitchenStaff(); fetchEtaAnalytics(); });
  socket.on('order_status_updated', () => { fetchOrders(); fetchKitchenStaff(); fetchEtaAnalytics(); });
  socket.on('order_eta_updated', () => { fetchEtaAnalytics(); });
  socket.on('feedback_submitted', () => { fetchFeedbackData(); });
  socket.on('refresh_menu', fetchMenu);
  socket.on('refresh_categories', fetchCategories);
  socket.on('refresh_status', (settings) => updateAdminStatusIndicator(settings.canteenStatus));
  socket.on('settings_updated', (settings) => {
    if (settings.canteenStatus) updateAdminStatusIndicator(settings.canteenStatus);
    if (settings.dynamicBuffer) renderBufferAnalytics(settings.dynamicBuffer);
  });
  socket.on('active_users_count', (count) => {
    const el = document.getElementById('stat-active-users');
    if(el) el.innerHTML = `${count} <span>online</span>`;
  });

  window.addEventListener("pageshow", function(event) {
    if (event.persisted && socket.disconnected) {
      socket.connect();
    }
  });

  // Polling Fallback for cloud environments
  setInterval(() => {
    if (!socket.connected) {
      fetchStats();
      fetchOrders();
      fetchKitchenStaff();
      fetchSettings();
      fetchEtaAnalytics();
      fetchFeedbackData();
    }
  }, 5000);
});

// --- NAVIGATION ---
function setupNavigation() {
  navItems.forEach(item => {
    item.addEventListener('click', (e) => {
      if(item.classList.contains('logout')) return;
      e.preventDefault();
      const viewId = item.getAttribute('data-view');
      switchView(viewId);
      if (viewId === 'dashboard') {
        setTimeout(updateCharts, 100);
      }
    });
  });
}

function switchView(viewId) {
  navItems.forEach(nav => {
    if(nav.getAttribute('data-view') === viewId) nav.classList.add('active');
    else nav.classList.remove('active');
  });
  
  views.forEach(view => {
    if(view.id === `view-${viewId}`) view.classList.add('active');
    else view.classList.remove('active');
  });
}

// --- DATA FETCHING ---
async function fetchStats() {
  try {
    const res = await fetch(`${API_URL}/queue`);
    const data = await res.json();
    const el = document.getElementById('stat-queue');
    if (el) el.innerHTML = `${data.currentQueue} <span>orders</span>`;
  } catch (err) {
    console.error('Error fetching stats:', err);
  }
}

async function fetchOrders() {
  try {
    const res = await fetch(`${API_URL}/orders`);
    orders = await res.json();
    
    // Compute comprehensive analytics
    calculateAnalytics();
    
    // Update legacy views
    renderLiveOrders();
    fetchKitchenStaff();
  } catch (err) {
    console.error('Error fetching orders:', err);
  }
}

async function fetchMenu() {
  try {
    const res = await fetch(`${API_URL}/menu`);
    menuItems = await res.json();
    renderMenuTable();
  } catch (err) {
    console.error('Error fetching menu:', err);
  }
}

async function fetchCategories() {
  try {
    const res = await fetch(`${API_URL}/categories`);
    categories = await res.json();
    renderCategoryTable();
    populateCategoryDropdown();
  } catch (err) {
    console.error('Error fetching categories:', err);
  }
}

// --- SETTINGS ---
function closeSettingsModal() {
  const m = document.getElementById('settings-modal');
  if(m) m.style.display = 'none';
}

async function fetchSettings() {
  try {
    const res = await fetch(`/api/settings`);
    const settings = await res.json();
    updateAdminStatusIndicator(settings.canteenStatus);
  } catch (err) {
    console.error('Error fetching settings:', err);
  }
}

function updateAdminStatusIndicator(status) {
  const el = document.getElementById('admin-status-indicator');
  if (!el) return;
  if (status === 'OPEN') {
    el.innerHTML = `<div style="width:12px; height:12px; border-radius:50%; background:#10b981;"></div> <span style="color:#10b981;">OPEN</span>`;
  } else {
    el.innerHTML = `<div style="width:12px; height:12px; border-radius:50%; background:#ef4444;"></div> <span style="color:#ef4444;">CLOSED</span>`;
  }
}

window.openCanteen = async function() {
  const hours = prompt("Enter active hours (e.g., 8:00 AM - 8:00 PM):", "8:00 AM - 8:00 PM");
  if (hours !== null) {
    try {
      await fetch(`/api/settings/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'OPEN', hours })
      });
      fetchSettings();
    } catch(err) {
      console.error(err);
    }
  }
};

window.closeCanteen = async function() {
  try {
    await fetch(`/api/settings/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'CLOSED' })
    });
    fetchSettings();
  } catch(err) {
    console.error(err);
  }
};

window.updateTheme = async function(themeName) {
  try {
    await fetch(`/api/settings/theme`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ theme: themeName })
    });
  } catch(err) {
    console.error(err);
    alert('Failed to update theme.');
  }
};

// --- RENDERING ---
function renderDashboardOrders() {
  const tbody = document.getElementById('dash-orders-table');
  if (!tbody) return;
  tbody.innerHTML = '';
  
  const recent = orders.slice(0, 5); // top 5
  recent.forEach(order => {
    const time = new Date(order.placed_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    let statusClass = 'status-preparing';
    if(order.status === 'Ready' || order.status === 'Received') statusClass = 'status-ready';
    const itemsCount = (order.order_items || order.items || []).length;
    
    tbody.innerHTML += `
      <tr>
        <td><strong>${order.id}</strong><br><small>Token: ${order.token}</small></td>
        <td>${itemsCount} items</td>
        <td>₹${order.total}</td>
        <td><span class="status-badge ${statusClass}">${order.status}</span></td>
        <td>${time}</td>
      </tr>
    `;
  });
}

function renderLiveOrders() {
  const kanban = document.getElementById('orders-kanban');
  if (!kanban) return;
  kanban.innerHTML = '';
  
  const statuses = ['Pending', 'Preparing', 'Almost Ready', 'Ready', 'Cancelled'];
  
  statuses.forEach(status => {
    const columnOrders = orders.filter(o => o.status === status);
    
    let cardsHtml = '';
    columnOrders.forEach(order => {
      const items = order.order_items || order.items || [];
      const itemsHtml = items.map(i => `<li>${i.quantity || 1}x ${i.menu_items?.name || i.name || 'Item'}</li>`).join('');
      const isCancelled = status === 'Cancelled';
      
      const assignedBadge = `
        <div style="font-size: 11px; margin: 6px 0; padding: 4px 8px; background: #fff7ed; border: 1px solid #fed7aa; border-radius: 6px; color: #c2410c; font-weight: 600; display: flex; align-items: center; gap: 4px;">
          <span>👨‍🍳</span> Chef: <strong>${order.assigned_employee_name || order.assigned_employee || 'Auto-Routing'}</strong>
        </div>
      `;

      const cancellationHtml = (isCancelled && order.cancellation_reason) ? `
        <div style="font-size: 11px; margin: 4px 0; padding: 4px 8px; background: #fee2e2; border: 1px solid #fecaca; border-radius: 6px; color: #b91c1c; font-weight: 500;">
          <strong>Reason:</strong> ${order.cancellation_reason}
        </div>
      ` : '';

      cardsHtml += `
        <div class="order-card" style="${isCancelled ? 'opacity: 0.85; border-left: 4px solid #ef4444;' : ''}">
          <div class="order-card-header">
            <span>Token: ${order.token}</span>
            <span>₹${order.total}</span>
          </div>
          <small>${order.id}</small>
          ${assignedBadge}
          <ul class="order-items-list">
            ${itemsHtml}
          </ul>
          ${cancellationHtml}
            <div class="order-actions">
              ${isCancelled ? '<span style="color:red; font-weight:bold; font-size:12px;">CANCELLED</span>' : `
              <select onchange="updateOrderStatus('${order.id}', this.value)">
                <option value="Pending" ${status === 'Pending' ? 'selected' : ''}>Pending</option>
                <option value="Preparing" ${status === 'Preparing' ? 'selected' : ''}>Preparing</option>
                <option value="Almost Ready" ${status === 'Almost Ready' ? 'selected' : ''}>Almost Ready</option>
                <option value="Ready" ${status === 'Ready' ? 'selected' : ''}>Ready</option>
                <option value="Received" ${status === 'Received' ? 'selected' : ''}>Completed (Received)</option>
                <option value="Cancelled">Cancel Order</option>
              </select>`}
              <button onclick="printInvoice('${order.id}')" style="padding: 0.3rem; border: none; background: #eee; border-radius: 4px; cursor: pointer;">Print</button>
              ${!isCancelled && status !== 'Ready' && status !== 'Received' ? `<button onclick="updateEstTime('${order.id}')" style="padding: 0.3rem; border: none; background: #00b020; color: white; border-radius: 4px; cursor: pointer;">Set Time</button>` : ''}
            </div>
        </div>
      `;
    });
    
    kanban.innerHTML += `
      <div class="kanban-column">
        <h4>${status} (${columnOrders.length})</h4>
        <div class="kanban-cards">
          ${cardsHtml}
        </div>
      </div>
    `;
  });
}

function renderMenuTable() {
  const container = document.getElementById('menu-grid-container');
  const filterSelect = document.getElementById('admin-menu-filter');
  
  if (!container) return;
  container.innerHTML = '';
  
  const selectedCategory = filterSelect ? filterSelect.value : 'All';
  
  // Group items by category
  const grouped = {};
  menuItems.forEach(item => {
    if (selectedCategory !== 'All' && item.category !== selectedCategory) return;
    if (!grouped[item.category]) grouped[item.category] = [];
    grouped[item.category].push(item);
  });
  
  for (const [catName, items] of Object.entries(grouped)) {
    let html = `<div class="category-section">
      <h2 style="margin-bottom: 16px; border-bottom: 2px solid var(--border-color); padding-bottom: 8px;">${catName}</h2>
      <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 16px;">
    `;
    
    items.forEach(item => {
      const imgUrl = item.image_url 
        ? (item.image_url.startsWith('http') ? item.image_url : `${item.image_url}`) 
        : '/assets/masala_dosa.jpg';
      
      html += `
        <div class="admin-food-card" style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 14px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.06); display: flex; flex-direction: column; transition: transform 0.2s, box-shadow 0.2s; ${!item.available ? 'opacity: 0.75;' : ''}">
          <div class="img-container" style="height: 150px; background: #f1f5f9; position: relative; overflow: hidden;">
            <img src="${imgUrl}" alt="${item.name}" onerror="this.onerror=null;this.src='/assets/masala_dosa.jpg';" style="width: 100%; height: 100%; object-fit: cover;">
            <div style="position: absolute; top: 10px; right: 10px; display: flex; gap: 6px;">
              ${item.available 
                ? `<span style="background: #10b981; color: white; padding: 3px 8px; border-radius: 20px; font-size: 11px; font-weight: 700; box-shadow: 0 2px 4px rgba(0,0,0,0.2);">Available</span>`
                : `<span style="background: #ef4444; color: white; padding: 3px 8px; border-radius: 20px; font-size: 11px; font-weight: 700; box-shadow: 0 2px 4px rgba(0,0,0,0.2);">Out of Stock</span>`}
            </div>
          </div>
          <div class="content" style="padding: 16px; display: flex; flex-direction: column; flex-grow: 1;">
            <h3 style="font-size: 17px; font-weight: 700; color: #0f172a; margin: 0 0 6px 0; line-height: 1.3;">${item.name}</h3>
            <p style="font-size: 13px; color: #475569; margin: 0 0 12px 0; line-height: 1.45; min-height: 38px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">${item.description || 'Freshly prepared canteen special.'}</p>
            <div style="font-size: 20px; font-weight: 800; color: #047857; margin-bottom: 12px;">₹${item.price}</div>
            <div style="font-size: 11px; margin-bottom: 16px; display: flex; gap: 6px; flex-wrap: wrap;">
              <span style="background: #f1f5f9; color: #334155; padding: 4px 8px; border-radius: 6px; font-weight: 600; border: 1px solid #e2e8f0;">${item.item_type || 'Non-Packet'}</span>
              ${item.is_special ? `<span style="background: #fef3c7; color: #92400e; padding: 4px 8px; border-radius: 6px; font-weight: 600; border: 1px solid #fde68a;">⭐ Today's Special</span>` : ''}
              ${item.is_my_canteen ? `<span style="background: #fce7f3; color: #9d174d; padding: 4px 8px; border-radius: 6px; font-weight: 600; border: 1px solid #fbcfe8;">❤️ My Canteen</span>` : ''}
            </div>
            <div style="margin-top: auto; display: flex; gap: 10px;">
              <button class="btn btn-secondary" style="flex: 1; padding: 8px 12px; font-size: 13px; font-weight: 600; border-radius: 8px;" onclick='editMenuItem(${JSON.stringify(item)})'>✏️ Edit</button>
              <button class="btn" style="flex: 1; padding: 8px 12px; font-size: 13px; font-weight: 600; background: #fee2e2; color: #dc2626; border: 1px solid #fecaca; border-radius: 8px;" onclick="deleteMenuItem('${item.id}')">🗑️ Delete</button>
            </div>
          </div>
        </div>
      `;
    });
    
    html += `</div></div>`;
    container.innerHTML += html;
  }
  
  if (Object.keys(grouped).length === 0) {
    container.innerHTML = '<div style="text-align: center; padding: 40px; color: var(--text-gray);">No menu items found. Add some to get started!</div>';
  }
}

function renderCategoryTable() {
  const tbody = document.getElementById('category-table-body');
  if(!tbody) return;
  tbody.innerHTML = '';
  
  categories.forEach(cat => {
    const iconHtml = (cat.icon_svg && typeof cat.icon_svg === 'string' && cat.icon_svg.startsWith('data:image'))
      ? `<img src='${cat.icon_svg}' style='width:100%; height:100%; object-fit:contain;'>`
      : (cat.icon_svg || '🍕');

    tbody.innerHTML += `
      <tr>
        <td>${cat.id}</td>
        <td><strong>${cat.name}</strong></td>
        <td>
          <div style="width: 32px; height: 32px; display: inline-flex; align-items: center; justify-content: center; font-size: 20px;">
            ${iconHtml}
          </div>
        </td>
        <td class="actions-cell">
          <button onclick='editCategory(${JSON.stringify(cat)})'><span class="material-symbols-outlined">edit</span></button>
          <button onclick="deleteCategoryReq('${cat.id}')"><span class="material-symbols-outlined">delete</span></button>
        </td>
      </tr>
    `;
  });
}

function populateCategoryDropdown() {
  const select = document.getElementById('item-category');
  const filterSelect = document.getElementById('admin-menu-filter');
  
  if(select) {
    select.innerHTML = '';
    categories.forEach(cat => {
      select.innerHTML += `<option value="${cat.name}">${cat.name}</option>`;
    });
  }
  
  if(filterSelect) {
    const currentVal = filterSelect.value;
    filterSelect.innerHTML = '<option value="All">All Categories</option>';
    categories.forEach(cat => {
      filterSelect.innerHTML += `<option value="${cat.name}">${cat.name}</option>`;
    });
    filterSelect.value = currentVal || 'All';
  }
}

// --- ACTIONS ---
async function updateOrderStatus(orderId, newStatus) {
  try {
    const payload = { status: newStatus };
    
    // If Admin cancels, require mandatory cancellation reason!
    if (newStatus === 'Cancelled') {
      const reason = prompt("Enter mandatory cancellation reason:");
      if (!reason || !reason.trim()) {
        alert("Cancellation reason is mandatory.");
        fetchOrders();
        return;
      }
      await fetch(`${API_URL}/orders/${orderId}/cancel`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason.trim(), employeeName: 'Admin' })
      });
      fetchOrders();
      return;
    }

    // Automatically prompt for estimated time if moving to Preparing
    if (newStatus === 'Preparing') {
      const time = prompt("Enter estimated preparation time in minutes (e.g., 8):", "10");
      if (time && !isNaN(time)) {
        payload.estTime = parseInt(time, 10);
      }
    }

    await fetch(`${API_URL}/orders/${orderId}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    fetchOrders(); // refresh
  } catch (err) {
    console.error('Error updating status:', err);
    alert('Failed to update status');
  }
}

async function fetchKitchenStaff() {
  const container = document.getElementById('kitchen-staff-grid');
  if (!container) return;
  try {
    const res = await fetch('/api/kitchen/employees');
    if (!res.ok) return;
    const employees = await res.json();
    
    container.innerHTML = employees.map(emp => {
      let statusColor = '#10b981';
      if (emp.status === 'busy') statusColor = '#f59e0b';
      if (emp.status === 'offline') statusColor = '#ef4444';

      return `
        <div style="background: white; border: 1px solid #e2e8f0; border-radius: 12px; padding: 18px; box-shadow: 0 4px 12px rgba(0,0,0,0.05); display: flex; flex-direction: column; gap: 10px;">
          <div style="display: flex; justify-content: space-between; align-items: flex-start;">
            <div style="display: flex; align-items: center; gap: 10px;">
              <div style="font-size: 26px; width: 44px; height: 44px; background: #f8fafc; border-radius: 10px; display: flex; align-items: center; justify-content: center; border: 1px solid #e2e8f0;">
                ${emp.avatar || '👨‍🍳'}
              </div>
              <div>
                <h4 style="margin: 0; font-size: 15px; font-weight: 700;">${emp.name}</h4>
                <div style="font-size: 12px; color: #ff7a00; font-weight: 600;">${emp.specialization}</div>
              </div>
            </div>
            <span style="font-size: 11px; font-weight: 700; color: ${statusColor}; background: ${statusColor}15; border: 1px solid ${statusColor}40; padding: 2px 8px; border-radius: 12px; text-transform: capitalize;">
              ${emp.status}
            </span>
          </div>

          <div style="font-size: 12px; color: #64748b;">
            <strong>Skills:</strong> ${(emp.skills || []).join(', ')}
          </div>

          <div style="display: flex; justify-content: space-between; align-items: center; padding-top: 8px; border-top: 1px solid #f1f5f9;">
            <span style="font-size: 12px; color: #64748b;">Active Queue:</span>
            <span style="font-size: 14px; font-weight: 800; color: ${emp.activeOrdersCount > 2 ? '#ef4444' : '#10b981'};">
              ${emp.activeOrdersCount || 0} orders
            </span>
          </div>
        </div>
      `;
    }).join('');
  } catch (err) {
    console.error('Error fetching kitchen staff:', err);
  }
}

async function updateEstTime(orderId) {
  const time = prompt("Enter new estimated preparation time in minutes (e.g., 8):");
  if (time && !isNaN(time)) {
    try {
      const order = orders.find(o => o.id === orderId);
      if (!order) return;
      
      await fetch(`${API_URL}/orders/${orderId}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: order.status, estTime: parseInt(time, 10) })
      });
      fetchOrders();
    } catch (err) {
      console.error('Error updating est time:', err);
      alert('Failed to update estimated time');
    }
  }
}

// --- MENU MODAL ---
function openMenuModal() {
  document.getElementById('modal-title').innerText = 'Add Menu Item';
  document.getElementById('item-id').value = '';
  menuForm.reset();
  menuModal.classList.add('active');
}

function closeMenuModal() {
  menuModal.classList.remove('active');
}

function editMenuItem(item) {
  document.getElementById('modal-title').innerText = 'Edit Menu Item';
  document.getElementById('item-id').value = item.id;
  document.getElementById('item-name').value = item.name;
  document.getElementById('item-desc').value = item.description || '';
  document.getElementById('item-price').value = item.price;
  document.getElementById('item-category').value = item.category;
  document.getElementById('item-type').value = item.item_type || 'Non-Packet';
  document.getElementById('item-available').checked = item.available;
  document.getElementById('item-special').checked = item.is_special;
  document.getElementById('item-mycanteen').checked = item.is_my_canteen;
  
  menuModal.classList.add('active');
}

menuForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const id = document.getElementById('item-id').value;
  const formData = new FormData();
  formData.append('name', document.getElementById('item-name').value);
  formData.append('description', document.getElementById('item-desc').value);
  const priceEl = document.getElementById('item-price');
  formData.append('price', priceEl.value);
  formData.append('category', document.getElementById('item-category').value);
  formData.append('item_type', document.getElementById('item-type').value);
  formData.append('available', document.getElementById('item-available').checked);
  formData.append('is_special', document.getElementById('item-special').checked);
  formData.append('is_my_canteen', document.getElementById('item-mycanteen').checked);
  
  const imageFile = document.getElementById('item-image').files[0];
  if(imageFile) {
    formData.append('image', imageFile);
  }

  try {
    const url = id ? `${API_URL}/menu/${id}` : `${API_URL}/menu`;
    const method = id ? 'PUT' : 'POST';
    
    await fetch(url, {
      method: method,
      body: formData
    });
    
    closeMenuModal();
    fetchMenu(); // refresh
  } catch(err) {
    console.error('Error saving item:', err);
    alert('Failed to save menu item.');
  }
});

async function deleteMenuItem(id) {
  if(!confirm('Are you sure you want to delete this item?')) return;
  
  try {
    await fetch(`${API_URL}/menu/${id}`, { method: 'DELETE' });
    fetchMenu();
  } catch(err) {
    console.error('Error deleting item:', err);
    alert('Failed to delete item.');
  }
}

// --- PRINT INVOICE ---
function printInvoice(orderId) {
  const order = orders.find(o => o.id === orderId);
  if (!order) return;
  
  const receiptDiv = document.getElementById('print-receipt');
  
  const items = order.order_items || order.items || [];
  const itemsHtml = items.map(item => `
    <tr>
      <td>${item.quantity || 1}x ${item.menu_items?.name || item.name || 'Item'}</td>
      <td class="right">₹${(item.price_at_time || item.price || 0) * (item.quantity || 1)}</td>
    </tr>
  `).join('');
  
  const time = new Date(order.placed_at).toLocaleString();
  
  receiptDiv.innerHTML = `
    <div class="receipt-header">
      <h2>Smart Canteen</h2>
      <p>Token Number: <strong>${order.token}</strong></p>
      <p>Order ID: ${order.id}</p>
      <p>${time}</p>
    </div>
    <div class="receipt-details">
      <table class="receipt-items">
        ${itemsHtml}
      </table>
      <div class="receipt-total">
        <span>Total:</span>
        <span>₹${order.total}</span>
      </div>
    </div>
  `;
  
  window.print();
}

// --- KITCHEN DISPATCH & ALLOCATION ---
async function fetchKitchenStaff() {
  const container = document.getElementById('kitchen-staff-grid');
  if (!container) return;
  try {
    const res = await fetch(`${API_URL}/kitchen/employees`);
    if (!res.ok) return;
    const staff = await res.json();
    if (!Array.isArray(staff)) return;

    container.innerHTML = '';
    staff.forEach(emp => {
      const activeOrdersCount = Array.isArray(emp.activeOrders) ? emp.activeOrders.length : 0;
      let statusHtml = '<span style="background: #dcfce7; color: #15803d; font-size: 11px; padding: 3px 10px; border-radius: 999px; font-weight: 700;">🟢 AVAILABLE</span>';
      if (emp.status === 'Busy') {
        statusHtml = '<span style="background: #fef3c7; color: #b45309; font-size: 11px; padding: 3px 10px; border-radius: 999px; font-weight: 700;">🟡 BUSY</span>';
      } else if (emp.status === 'Break') {
        statusHtml = '<span style="background: #fee2e2; color: #b91c1c; font-size: 11px; padding: 3px 10px; border-radius: 999px; font-weight: 700;">🔴 BREAK</span>';
      }

      const skillsHtml = (emp.skills || []).map(s => `<span style="background: #f1f5f9; color: #334155; font-size: 11px; padding: 2px 8px; border-radius: 6px; font-weight: 600;">${s}</span>`).join(' ');

      container.innerHTML += `
        <div class="card" style="padding: 18px; border-radius: 12px; border: 1px solid var(--border-color); background: #ffffff; box-shadow: 0 2px 8px rgba(0,0,0,0.04);">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px;">
            <div>
              <div style="font-weight: 700; font-size: 16px; color: #111827;">${emp.name}</div>
              <div style="font-size: 12px; color: #6b7280; font-weight: 500;">${emp.specialization || 'Chef Station'}</div>
            </div>
            ${statusHtml}
          </div>
          <div style="margin: 10px 0; display: flex; flex-wrap: wrap; gap: 4px;">
            ${skillsHtml}
          </div>
          <div style="display: flex; justify-content: space-between; font-size: 12px; margin-top: 14px; padding-top: 10px; border-top: 1px solid #f1f5f9; color: #4b5563;">
            <div><strong>ID:</strong> ${emp.id.toUpperCase()}</div>
            <div><strong>Active Orders:</strong> ${activeOrdersCount}</div>
            <div><strong>Est. Load:</strong> ${emp.currentLoadMinutes || 0}m</div>
          </div>
        </div>
      `;
    });
  } catch (err) {
    console.error('Error fetching kitchen staff in admin:', err);
  }
}

// --- STUDENT MANAGEMENT (Hidden from Admin Panel) ---
async function fetchStudents() {
  const tbody = document.getElementById('student-table-body');
  if (!tbody) return;
  try {
    const res = await fetch(`${API_URL}/users`);
    const users = await res.json();
    const students = users.filter(u => u.role === 'student');
    tbody.innerHTML = '';
    
    students.forEach(student => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${student.id}</td>
        <td><strong>${student.user_id}</strong></td>
        <td>${student.dob}</td>
        <td>${student.name}</td>
        <td>
          <div style="display: flex; gap: 8px;">
            <button class="icon-btn" onclick="deleteStudent(${student.id})" style="color: #EF4444;" title="Delete">
              <span class="material-symbols-outlined">delete</span>
            </button>
          </div>
        </td>
      `;
      tbody.appendChild(tr);
    });
  } catch(e) {
    console.error("Error fetching students:", e);
  }
}

// Student Modal (conditionally initialized if present)
const studentModal = document.getElementById('student-modal');
const studentForm = document.getElementById('student-form');

function openStudentModal() {
  if (studentForm && studentModal) {
    studentForm.reset();
    studentModal.classList.add('active');
  }
}

function closeStudentModal() {
  if (studentModal) studentModal.classList.remove('active');
}

if (studentForm) {
  studentForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = {
      user_id: document.getElementById('student-id').value,
      dob: document.getElementById('student-dob').value,
      name: document.getElementById('student-name').value,
      role: 'student'
    };

    try {
      const res = await fetch(`${API_URL}/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if(res.ok) {
        closeStudentModal();
        fetchStudents();
      } else {
        alert("Error adding student. Make sure Scholar ID is unique.");
      }
    } catch(e) {
      console.error("Error adding student:", e);
    }
  });
}

async function deleteStudent(id) {
  if(!confirm("Are you sure you want to delete this student?")) return;
  try {
    await fetch(`${API_URL}/users/${id}`, { method: 'DELETE' });
    fetchStudents();
  } catch(e) {
    console.error("Error deleting student:", e);
  }
}

// Bulk Student Modal (conditionally initialized if present)
const bulkStudentModal = document.getElementById('bulk-student-modal');
const bulkStudentForm = document.getElementById('bulk-student-form');

function openBulkStudentModal() {
  if (bulkStudentForm && bulkStudentModal) {
    bulkStudentForm.reset();
    bulkStudentModal.classList.add('active');
  }
}

function closeBulkStudentModal() {
  if (bulkStudentModal) bulkStudentModal.classList.remove('active');
}

if (bulkStudentForm) {
  bulkStudentForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const rawData = document.getElementById('bulk-student-data').value;
    const lines = rawData.split('\\n');
    const users = [];

    lines.forEach(line => {
      const parts = line.split(',');
      if(parts.length >= 2) {
        users.push({
          user_id: parts[0].trim(),
          dob: parts[1].trim(),
          name: parts[2] ? parts[2].trim() : 'Student',
          role: 'student'
        });
      }
    });

    if(users.length === 0) {
      alert("No valid data found. Format must be: ScholarID,DOB,Name");
      return;
    }

    try {
      const res = await fetch(`${API_URL}/users/bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ users })
      });
      
      if(res.ok) {
        const data = await res.json();
        alert(`Successfully added ${data.count} students.`);
        closeBulkStudentModal();
        fetchStudents();
      } else {
        alert("Error adding students in bulk. Check for duplicates.");
      }
    } catch(e) {
      console.error("Error bulk adding students:", e);
    }
  });
}

// --- CATEGORY MODAL & CRUD ---
const categoryModal = document.getElementById('category-modal');
const categoryForm = document.getElementById('category-form');

function openCategoryModal() {
  document.getElementById('category-modal-title').innerText = 'Add Category';
  document.getElementById('category-id').value = '';
  if(categoryForm) categoryForm.reset();
  if(categoryModal) categoryModal.classList.add('active');
}

function closeCategoryModal() {
  if(categoryModal) categoryModal.classList.remove('active');
}

function editCategory(cat) {
  document.getElementById('category-modal-title').innerText = 'Edit Category';
  document.getElementById('category-id').value = cat.id;
  document.getElementById('category-name').value = cat.name;
  document.getElementById('category-icon').value = cat.icon_svg;
  if(categoryModal) categoryModal.classList.add('active');
}

if(categoryForm) {
  categoryForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('category-id').value;
    const name = document.getElementById('category-name').value;
    const icon_svg = document.getElementById('category-icon').value;
    
    if(id) {
      await updateCategory(id, { name, icon_svg });
    } else {
      await createCategory({ name, icon_svg });
    }
    
    closeCategoryModal();
    fetchCategories(); // Refresh categories
  });
}

async function deleteCategoryReq(id) {
  if(confirm('Are you sure you want to delete this category?')) {
    await deleteCategory(id);
    fetchCategories();
  }
}

async function seedMockItems() {
  if(!confirm('This will insert 10 mock food items per category. Are you sure?')) return;
  const res = await seedCategories();
  if(res && res.success) {
    alert(`Successfully inserted ${res.inserted} mock items!`);
    fetchMenu();
  } else {
    alert('Failed to seed items.');
  }
}

// --- REAL-TIME ANALYTICS ---
let chartOrdersTime = null;
let chartStatusDist = null;
let chartPopularItems = null;

function calculateAnalytics() {
  if (!orders) return;
  
  let totalOrders = orders.length;
  let pending = 0;
  let preparing = 0;
  let completed = 0;
  let cancelled = 0;
  let revenue = 0;
  
  orders.forEach(o => {
    if (o.status === 'Pending') pending++;
    else if (o.status === 'Preparing' || o.status === 'Almost Ready') preparing++;
    else if (o.status === 'Ready' || o.status === 'Received') {
      completed++;
      revenue += (o.total || 0);
    }
    else if (o.status === 'Cancelled') cancelled++;
  });
  
  // Update KPI Cards
  const elTotal = document.getElementById('stat-total-orders');
  if(elTotal) elTotal.innerText = totalOrders;
  
  const elPending = document.getElementById('stat-pending');
  if(elPending) elPending.innerText = pending;
  
  const elPreparing = document.getElementById('stat-preparing');
  if(elPreparing) elPreparing.innerText = preparing;
  
  const elCompleted = document.getElementById('stat-completed');
  if(elCompleted) elCompleted.innerText = completed;
  
  const elCancelled = document.getElementById('stat-cancelled');
  if(elCancelled) elCancelled.innerText = cancelled;
  
  const elRevenue = document.getElementById('stat-revenue');
  if(elRevenue) elRevenue.innerText = '₹' + revenue;
  
  updateCharts();
  renderLiveActivityFeed();
}

function initCharts() {
  const ctxTime = document.getElementById('chart-orders-time');
  const ctxStatus = document.getElementById('chart-status-dist');
  const ctxPopular = document.getElementById('chart-popular-items');
  
  if (!ctxTime || !ctxStatus || !ctxPopular || typeof Chart === 'undefined') return;

  Chart.defaults.font.family = 'Inter, sans-serif';
  Chart.defaults.color = '#6b7280';
  
  chartOrdersTime = new Chart(ctxTime, {
    type: 'line',
    data: { labels: [], datasets: [{ label: 'Orders placed', data: [], borderColor: '#10b981', backgroundColor: 'rgba(16, 185, 129, 0.1)', fill: true, tension: 0.4 }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } } }
  });

  chartStatusDist = new Chart(ctxStatus, {
    type: 'doughnut',
    data: { labels: ['Pending', 'Preparing', 'Completed', 'Cancelled'], datasets: [{ data: [0, 0, 0, 0], backgroundColor: ['#f59e0b', '#3b82f6', '#10b981', '#ef4444'] }] },
    options: { responsive: true, maintainAspectRatio: false, cutout: '70%', plugins: { legend: { position: 'bottom' } } }
  });

  chartPopularItems = new Chart(ctxPopular, {
    type: 'bar',
    data: { labels: [], datasets: [{ label: 'Quantity Ordered', data: [], backgroundColor: '#6366f1', borderRadius: 4 }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } } }
  });
}

function updateCharts() {
  if (!chartOrdersTime && typeof Chart !== 'undefined') initCharts();
  if (!chartOrdersTime || !orders) return;

  // 1. Orders Over Time (Group by hour)
  const hoursMap = {};
  orders.forEach(o => {
    const d = new Date(o.placed_at);
    const h = d.getHours() + ':00';
    hoursMap[h] = (hoursMap[h] || 0) + 1;
  });
  const sortedHours = Object.keys(hoursMap).sort((a,b) => parseInt(a) - parseInt(b));
  chartOrdersTime.data.labels = sortedHours;
  chartOrdersTime.data.datasets[0].data = sortedHours.map(h => hoursMap[h]);
  chartOrdersTime.update();

  // 2. Status Distribution
  let p=0, pr=0, c=0, cx=0;
  orders.forEach(o => {
    if(o.status === 'Pending') p++;
    else if(o.status === 'Preparing' || o.status === 'Almost Ready') pr++;
    else if(o.status === 'Ready' || o.status === 'Received') c++;
    else if(o.status === 'Cancelled') cx++;
  });
  chartStatusDist.data.datasets[0].data = [p, pr, c, cx];
  chartStatusDist.update();

  // 3. Most Popular Items
  const itemsMap = {};
  orders.forEach(o => {
    const items = o.order_items || o.items || [];
    if (o.status !== 'Cancelled' && items.length > 0) {
      items.forEach(oi => {
        const name = oi.menu_items?.name || oi.name || 'Unknown';
        itemsMap[name] = (itemsMap[name] || 0) + (oi.quantity || 1);
      });
    }
  });
  
  const sortedItems = Object.entries(itemsMap).sort((a,b) => b[1] - a[1]).slice(0, 5);
  chartPopularItems.data.labels = sortedItems.map(i => i[0].substring(0,15) + (i[0].length>15?'...':''));
  chartPopularItems.data.datasets[0].data = sortedItems.map(i => i[1]);
  chartPopularItems.update();
}

function renderLiveActivityFeed() {
  const feed = document.getElementById('live-activity-feed');
  if (!feed) return;
  
  feed.innerHTML = '';
  // Top 10 most recent orders/updates
  const recent = [...orders].sort((a,b) => new Date(b.placed_at) - new Date(a.placed_at)).slice(0, 15);
  
  if (recent.length === 0) {
    feed.innerHTML = '<div style="text-align: center; color: #888; margin-top: 40px;">No activity yet today.</div>';
    return;
  }
  
  recent.forEach(order => {
    const time = new Date(order.placed_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    let icon = 'receipt_long';
    let statusClass = 'status-new';
    let text = `New order #${order.token} placed!`;
    
    if (order.status === 'Cancelled') {
      icon = 'cancel'; statusClass = 'status-complete';
      text = `Order #${order.token} was cancelled.`;
    } else if (order.status === 'Ready' || order.status === 'Received') {
      icon = 'check_circle'; statusClass = 'status-complete';
      text = `Order #${order.token} is completed!`;
    } else if (order.status === 'Preparing' || order.status === 'Almost Ready') {
      icon = 'skillet'; statusClass = 'status-update';
      text = `Order #${order.token} is being prepared.`;
    }

    const itemsCount = (order.order_items || order.items || []).length;

    feed.innerHTML += `
      <div class="activity-item ${statusClass}">
        <div class="activity-icon"><span class="material-symbols-outlined">${icon}</span></div>
        <div class="activity-content">
          <p>${text}</p>
          <small>₹${order.total} • ${itemsCount} items</small>
        </div>
        <div class="activity-time">${time}</div>
      </div>
    `;
  });
}

// --- DYNAMIC ETA ANALYTICS & BUFFER CONTROLS ---
async function fetchEtaAnalytics() {
  try {
    const res = await fetch('/api/eta/analytics');
    if (!res.ok) return;
    const data = await res.json();
    renderBufferAnalytics(data.safetyBuffer, data);
  } catch (err) {
    console.error('Error fetching ETA analytics:', err);
  }
}

function renderBufferAnalytics(bufData, fullData) {
  if (!bufData) return;
  const currentBuf = bufData.currentEffectiveBuffer || 5;
  const isOverride = !!bufData.isManualOverride;

  // 1. KPI Card
  const elBufKpi = document.getElementById('stat-safety-buffer');
  if (elBufKpi) {
    elBufKpi.innerHTML = `${currentBuf}m <span id="stat-buffer-mode" style="font-size:11px; font-weight:700; color:${isOverride ? '#d97706' : '#059669'}; background:${isOverride ? '#fef3c7' : '#d1fae5'}; padding:2px 6px; border-radius:10px;">${isOverride ? 'MANUAL' : 'AUTO'}</span>`;
  }

  // 2. Kitchen View Buffer Card
  const elBufVal = document.getElementById('analytics-buffer-val');
  if (elBufVal) elBufVal.textContent = `${currentBuf} mins`;

  const elModeBadge = document.getElementById('buffer-mode-badge');
  if (elModeBadge) {
    elModeBadge.innerHTML = isOverride 
      ? `<span class="pulse-dot" style="background: #f59e0b;"></span> Manual Override Active` 
      : `<span class="pulse-dot" style="background: #10b981;"></span> Auto-Tuned Dynamic Buffer`;
    elModeBadge.style.background = isOverride ? '#fef3c7' : '#d1fae5';
    elModeBadge.style.color = isOverride ? '#92400e' : '#065f46';
  }

  const elBufDesc = document.getElementById('analytics-buffer-desc');
  if (elBufDesc) {
    if (isOverride) {
      elBufDesc.textContent = 'Manually Locked by Admin';
      elBufDesc.style.color = '#d97706';
    } else if (currentBuf > 7) {
      elBufDesc.textContent = 'Elevated (Peak Rush Load)';
      elBufDesc.style.color = '#ef4444';
    } else if (currentBuf < 4) {
      elBufDesc.textContent = 'Reduced (Low Queue Velocity)';
      elBufDesc.style.color = '#10b981';
    } else {
      elBufDesc.textContent = 'Normal Kitchen Workload';
      elBufDesc.style.color = '#10b981';
    }
  }

  const inputEl = document.getElementById('manual-buffer-input');
  if (inputEl && !document.activeElement?.isSameNode(inputEl)) {
    inputEl.value = currentBuf;
  }

  if (fullData) {
    const elRatio = document.getElementById('analytics-learning-ratio');
    if (elRatio && fullData.historical) {
      elRatio.textContent = (fullData.historical.learningRatio || 1.00).toFixed(2) + 'x';
    }
    const elRush = document.getElementById('analytics-rush-load');
    if (elRush && fullData.kitchenCapacity) {
      elRush.textContent = (fullData.kitchenCapacity.rushFactor || 1.0).toFixed(1) + 'x';
    }
    const elDelay = document.getElementById('analytics-delay-freq');
    if (elDelay && fullData.historical) {
      elDelay.textContent = Math.round((fullData.historical.delayFrequency || 0) * 100) + '%';
    }
  }
}

window.applyManualBuffer = async function(isOverride) {
  const inputEl = document.getElementById('manual-buffer-input');
  const manualMins = inputEl ? parseInt(inputEl.value, 10) : 5;

  try {
    const res = await fetch('/api/settings/buffer', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        manual_buffer: manualMins,
        is_manual_override: isOverride
      })
    });
    const data = await res.json();
    if (data.success) {
      alert(isOverride ? `Safety Buffer manually set to ${manualMins} minutes.` : 'Safety Buffer reset to dynamic auto-tuning.');
      fetchEtaAnalytics();
    } else {
      alert(data.error || 'Failed to update buffer setting.');
    }
  } catch (err) {
    console.error('Error applying buffer:', err);
    alert('Failed to update buffer settings.');
  }
};

// --- CUSTOMER FEEDBACK DATA STREAM ---
async function fetchFeedbackData() {
  try {
    const res = await fetch('/api/feedback/stats');
    if (!res.ok) return;
    const data = await res.json();

    // 1. KPI Card
    const elRating = document.getElementById('stat-customer-rating');
    if (elRating) {
      const avg = (data.averageRating || 5.0).toFixed(1);
      elRating.innerHTML = `⭐ ${avg} <span id="stat-feedback-count" style="font-size:12px; font-weight:500; color:#6b7280;">(${data.total || 0} reviews)</span>`;
    }

    const badge = document.getElementById('feedback-summary-badge');
    if (badge) {
      badge.textContent = `⭐ ${(data.averageRating || 5.0).toFixed(1)} / 5.0 (${data.total || 0} reviews)`;
    }

    // 2. Feedback Stream List
    const container = document.getElementById('feedback-stream-container');
    if (!container) return;

    if (!data.recentFeedback || data.recentFeedback.length === 0) {
      container.innerHTML = '<div style="text-align: center; color: var(--text-gray); padding: 30px;">No reviews recorded yet. Reviews will stream here live as customers complete orders!</div>';
      return;
    }

    container.innerHTML = data.recentFeedback.map(fb => {
      const stars = '★'.repeat(fb.rating || 5) + '☆'.repeat(5 - (fb.rating || 5));
      const timeStr = fb.created_at ? new Date(fb.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
      const tagsHtml = (fb.tags && fb.tags.length > 0)
        ? fb.tags.map(t => `<span style="background: rgba(245,158,11,0.14); color: #b45309; font-size: 11px; font-weight: 700; padding: 2px 7px; border-radius: 10px;">${escapeHtml(t)}</span>`).join(' ')
        : '';
      const itemsList = (fb.items && fb.items.length > 0)
        ? fb.items.map(i => i.name).join(', ')
        : '';

      return `
        <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px; box-shadow: 0 1px 3px rgba(0,0,0,0.04);">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 6px;">
            <div>
              <div style="display: flex; align-items: center; gap: 8px;">
                <strong style="font-size: 14px; color: #1e293b;">${escapeHtml(fb.user_name || 'Customer')}</strong>
                <span style="font-size: 11px; color: #64748b; background: #f1f5f9; padding: 1px 6px; border-radius: 4px;">Order #${fb.order_id}</span>
                ${fb.assigned_employee_name ? `<span style="font-size: 11px; font-weight: 600; color: #c2410c; background: #fff7ed; border: 1px solid #ffedd5; padding: 1px 6px; border-radius: 4px;">👨‍🍳 ${escapeHtml(fb.assigned_employee_name)}</span>` : ''}
              </div>
              <div style="color: #f59e0b; font-size: 15px; letter-spacing: 1px; margin-top: 3px;">${stars}</div>
            </div>
            <span style="font-size: 12px; color: #94a3b8;">${timeStr}</span>
          </div>

          ${fb.comment ? `<p style="font-size: 13px; color: #334155; margin: 6px 0; font-style: italic;">"${escapeHtml(fb.comment)}"</p>` : ''}
          
          <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; margin-top: 8px;">
            <div style="display: flex; gap: 6px; flex-wrap: wrap;">${tagsHtml}</div>
            ${itemsList ? `<small style="color: #94a3b8; font-size: 11px;">Items: ${escapeHtml(itemsList)}</small>` : ''}
          </div>
        </div>
      `;
    }).join('');

  } catch (err) {
    console.error('Error fetching feedback stats:', err);
  }
}

