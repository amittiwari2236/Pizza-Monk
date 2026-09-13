/**
 * Pizza Monk Kitchen Display Station (KDS) Controller
 * Real-time dynamic order feed, status progression, and cancellation management
 */

let currentEmployee = {
  id: sessionStorage.getItem('employeeId') || 'emp1',
  name: sessionStorage.getItem('userName') || 'Chef Marco',
  role: sessionStorage.getItem('userRole') || 'kitchen',
  specialization: sessionStorage.getItem('specialization') || 'Pizza & Pasta Master',
  status: 'available'
};

let currentTab = 'assigned'; // 'assigned' | 'all' | 'ready'
let soundEnabled = localStorage.getItem('kds_sound_enabled') !== 'false';
let allKitchenOrders = [];
let pendingCancelOrderId = null;
let socket = null;

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
  initAuthAndProfile();
  initSocket();
  loadKitchenOrders();
  fetchChefFeedbackStats();
  setupSoundUI();

  // Auto-refresh interval safety net every 30s
  setInterval(loadKitchenOrders, 30000);
});

function initAuthAndProfile() {
  const role = sessionStorage.getItem('userRole');
  const empId = sessionStorage.getItem('employeeId');

  // Allow admin to also access kitchen
  if (role !== 'kitchen' && role !== 'admin' && !empId) {
    // If not logged in as kitchen or admin, redirect to login
    window.location.href = 'login.html?redirect=kitchen.html';
    return;
  }

  if (empId) {
    currentEmployee.id = empId;
    const staffSwitcher = document.getElementById('staff-switcher');
    if (staffSwitcher) staffSwitcher.value = empId;
  }

  updateProfileBadgeUI();
}

function updateProfileBadgeUI() {
  const staffSwitcher = document.getElementById('staff-switcher');
  const empNameEl = document.getElementById('emp-name-display');
  const empSpecEl = document.getElementById('emp-spec-display');
  const empAvatarEl = document.getElementById('emp-avatar-display');

  const employeeProfiles = {
    'emp1': { name: 'Chef Marco', spec: 'Pizza & Pasta Master', avatar: '👨‍🍳' },
    'emp2': { name: 'Chef Priya', spec: 'Burger & Grill Specialist', avatar: '👩‍🍳' },
    'emp3': { name: 'Chef Vikram', spec: 'Breads & Wraps Chef', avatar: '👨‍🍳' },
    'emp4': { name: 'Deepak', spec: 'Beverages & Fast Packing', avatar: '🧑‍🍳' },
    'kitchen': { name: 'Kitchen Lead', spec: 'Head Chef & All Stations', avatar: '⭐' }
  };

  const prof = employeeProfiles[currentEmployee.id] || {
    name: currentEmployee.name,
    spec: currentEmployee.specialization,
    avatar: '👨‍🍳'
  };

  if (empNameEl) empNameEl.textContent = prof.name;
  if (empSpecEl) empSpecEl.textContent = prof.spec;
  if (empAvatarEl) empAvatarEl.textContent = prof.avatar;
  if (staffSwitcher) staffSwitcher.value = currentEmployee.id;
}

function switchEmployeeView(empId) {
  currentEmployee.id = empId;
  sessionStorage.setItem('employeeId', empId);
  const employeeProfiles = {
    'emp1': { name: 'Chef Marco', spec: 'Pizza & Pasta Master' },
    'emp2': { name: 'Chef Priya', spec: 'Burger & Grill Specialist' },
    'emp3': { name: 'Chef Vikram', spec: 'Breads & Wraps Chef' },
    'emp4': { name: 'Deepak', spec: 'Beverages & Fast Packing' },
    'kitchen': { name: 'Kitchen Lead', spec: 'Head Chef & All Stations' }
  };
  if (employeeProfiles[empId]) {
    currentEmployee.name = employeeProfiles[empId].name;
    currentEmployee.specialization = employeeProfiles[empId].spec;
    sessionStorage.setItem('userName', currentEmployee.name);
    sessionStorage.setItem('specialization', currentEmployee.specialization);
  }
  updateProfileBadgeUI();
  updateChefRatingUI();
  renderOrders();
}

function initSocket() {
  if (typeof io === 'undefined') {
    console.warn('Socket.io client script not loaded.');
    return;
  }

  socket = io();

  socket.on('connect', () => {
    console.log('Kitchen KDS connected to real-time socket:', socket.id);
  });

  // When a new order is allocated to kitchen
  socket.on('order_assigned', (data) => {
    console.log('New Order Assigned Event:', data);
    if (data.employeeId === currentEmployee.id || currentEmployee.id === 'kitchen') {
      playAlertSound();
    }
    loadKitchenOrders();
  });

  // When order status is updated by any station or customer
  socket.on('order_status_updated', () => {
    loadKitchenOrders();
  });

  socket.on('refresh_kitchen_orders', () => {
    loadKitchenOrders();
  });

  socket.on('refresh_orders', () => {
    loadKitchenOrders();
  });

  socket.on('order_eta_updated', () => {
    loadKitchenOrders();
  });

  socket.on('feedback_submitted', () => {
    fetchChefFeedbackStats();
  });
}

let cachedFeedbackStats = null;
async function fetchChefFeedbackStats() {
  try {
    const res = await fetch('/api/feedback/stats');
    if (!res.ok) return;
    cachedFeedbackStats = await res.json();
    updateChefRatingUI();
  } catch (err) {
    console.error('Failed to fetch chef feedback stats:', err);
  }
}

function updateChefRatingUI() {
  const elRating = document.getElementById('emp-rating-display');
  if (!elRating) return;

  if (cachedFeedbackStats && cachedFeedbackStats.employeeRatings) {
    const empStat = cachedFeedbackStats.employeeRatings[currentEmployee.id];
    if (empStat && empStat.count > 0) {
      elRating.textContent = `⭐ ${empStat.avg.toFixed(1)} (${empStat.count} reviews)`;
      return;
    }
  }
  const generalAvg = cachedFeedbackStats ? (cachedFeedbackStats.averageRating || 5.0).toFixed(1) : '5.0';
  elRating.textContent = `⭐ ${generalAvg} Rating`;
}

async function loadKitchenOrders() {
  try {
    const res = await fetch('/api/orders');
    if (!res.ok) throw new Error('Failed to fetch orders');
    const data = await res.json();
    allKitchenOrders = Array.isArray(data) ? data : [];
    updateMetrics();
    renderOrders();
  } catch (err) {
    console.error('Error fetching kitchen orders:', err);
  }
}

function updateMetrics() {
  const myAssigned = allKitchenOrders.filter(o => 
    o.assigned_employee === currentEmployee.id && 
    ['Pending', 'Preparing', 'Almost Ready'].includes(o.status)
  );

  const inPrep = allKitchenOrders.filter(o => o.status === 'Preparing');
  const readyOrders = allKitchenOrders.filter(o => o.status === 'Ready');

  const elAssigned = document.getElementById('count-assigned');
  const elPrep = document.getElementById('count-preparing');
  const elReady = document.getElementById('count-ready');

  if (elAssigned) elAssigned.textContent = myAssigned.length;
  if (elPrep) elPrep.textContent = inPrep.length;
  if (elReady) elReady.textContent = readyOrders.length;

  const tabAssigned = document.getElementById('tab-badge-assigned');
  const tabAll = document.getElementById('tab-badge-all');
  const tabReady = document.getElementById('tab-badge-ready');

  const activeAll = allKitchenOrders.filter(o => ['Pending', 'Preparing', 'Almost Ready'].includes(o.status));

  if (tabAssigned) tabAssigned.textContent = myAssigned.length;
  if (tabAll) tabAll.textContent = activeAll.length;
  if (tabReady) tabReady.textContent = readyOrders.length;
}

function setTab(tabName) {
  currentTab = tabName;
  document.querySelectorAll('.kds-tab').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-tab') === tabName);
  });
  renderOrders();
}

function renderOrders() {
  const container = document.getElementById('orders-container');
  if (!container) return;

  let displayOrders = [];

  if (currentTab === 'assigned') {
    if (currentEmployee.id === 'kitchen') {
      displayOrders = allKitchenOrders.filter(o => ['Pending', 'Preparing', 'Almost Ready'].includes(o.status));
    } else {
      displayOrders = allKitchenOrders.filter(o => 
        o.assigned_employee === currentEmployee.id && 
        ['Pending', 'Preparing', 'Almost Ready'].includes(o.status)
      );
    }
  } else if (currentTab === 'all') {
    displayOrders = allKitchenOrders.filter(o => ['Pending', 'Preparing', 'Almost Ready'].includes(o.status));
  } else if (currentTab === 'ready') {
    displayOrders = allKitchenOrders.filter(o => o.status === 'Ready' || o.status === 'Cancelled');
  }

  if (displayOrders.length === 0) {
    let emptyMsg = 'No active orders in this section.';
    if (currentTab === 'assigned') {
      emptyMsg = `No active orders currently assigned to ${currentEmployee.name}. Orders will automatically appear here when placed!`;
    }
    container.innerHTML = `
      <div class="empty-state">
        <span class="material-symbols-outlined">restaurant</span>
        <h3>All Caught Up!</h3>
        <p>${emptyMsg}</p>
      </div>
    `;
    return;
  }

  container.innerHTML = displayOrders.map(order => buildOrderCardHtml(order)).join('');
}

function buildOrderCardHtml(order) {
  const statusClass = (order.status || 'Pending').replace(/\s+/g, '-');
  const placedTime = order.placed_at ? new Date(order.placed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
  const elapsedMinutes = order.placed_at ? Math.max(0, Math.floor((Date.now() - new Date(order.placed_at).getTime()) / 60000)) : 0;

  // Items rows
  const items = order.order_items || order.items || [];
  const itemsHtml = items.map(it => {
    const name = it.name || (it.menu_items ? it.menu_items.name : 'Delicacy Item');
    const type = it.item_type || (it.menu_items ? it.menu_items.item_type : 'Non-Packet');
    const notes = it.notes ? `<div class="item-notes"><span class="material-symbols-outlined" style="font-size:12px;vertical-align:middle;">edit_note</span> ${escapeHtml(it.notes)}</div>` : '';

    return `
      <div class="card-item-row">
        <div class="item-left">
          <div class="item-qty">${it.quantity || 1}x</div>
          <div class="item-name-group">
            <span class="item-name">${escapeHtml(name)}</span>
            <span class="item-type-badge">${escapeHtml(type)}</span>
            ${notes}
          </div>
        </div>
      </div>
    `;
  }).join('');

  // Primary Action Button depending on current status
  let actionButtonHtml = '';
  if (order.status === 'Pending') {
    actionButtonHtml = `
      <button class="btn-step btn-start" onclick="updateStatus('${order.id}', 'Preparing')">
        <span class="material-symbols-outlined" style="font-size:18px;">skillet</span>
        Start Preparing
      </button>
    `;
  } else if (order.status === 'Preparing') {
    actionButtonHtml = `
      <button class="btn-step btn-almost" onclick="updateStatus('${order.id}', 'Almost Ready')">
        <span class="material-symbols-outlined" style="font-size:18px;">timelapse</span>
        Almost Ready
      </button>
    `;
  } else if (order.status === 'Almost Ready') {
    actionButtonHtml = `
      <button class="btn-step btn-ready" onclick="updateStatus('${order.id}', 'Ready')">
        <span class="material-symbols-outlined" style="font-size:18px;">check_circle</span>
        Ready for Pickup
      </button>
    `;
  } else if (order.status === 'Ready') {
    actionButtonHtml = `
      <button class="btn-step btn-done" disabled>
        <span class="material-symbols-outlined" style="font-size:18px;">done_all</span>
        Ready at Counter
      </button>
    `;
  }

  // Cancel button
  const cancelBtnHtml = order.status !== 'Cancelled' ? `
    <button class="btn-cancel" title="Cancel Order with Reason" onclick="openCancelModal('${order.id}')">
      <span class="material-symbols-outlined" style="font-size:18px;">close</span>
    </button>
  ` : '';

  // Cancellation reason banner if cancelled
  const cancelBanner = (order.status === 'Cancelled' && order.cancellation_reason) ? `
    <div class="cancellation-banner">
      <span class="material-symbols-outlined" style="font-size:16px;">info</span>
      <div>
        <strong>Cancellation Reason:</strong> ${escapeHtml(order.cancellation_reason)}
      </div>
    </div>
  ` : '';

  const assignedChefDisplay = order.assigned_employee_name 
    ? `${order.assigned_employee_name} (${order.assigned_employee})` 
    : 'Auto-Routing...';

  return `
    <div class="order-card status-${statusClass}" id="card-${order.id}">
      <div class="card-header">
        <div class="card-header-left">
          <div class="token-bubble">#${order.token || '--'}</div>
          <div class="order-id-meta">
            <span class="order-id">${order.id}</span>
            <span class="placed-time">Placed: ${placedTime} (${elapsedMinutes}m ago)</span>
          </div>
        </div>
        <div class="card-header-right">
          <span class="status-pill ${statusClass}">${order.status}</span>
          ${order.is_delayed ? `
          <div class="timer-badge" style="background:#ef4444; color:#fff; font-weight:700; border:1px solid #dc2626;">
            <span class="material-symbols-outlined" style="font-size:13px;">warning</span>
            DELAY +${order.delay_minutes || 0}m
          </div>
          ` : `
          <div class="timer-badge" title="Dynamic Buffer: +${order.safety_buffer_minutes || 5}m">
            <span class="material-symbols-outlined" style="font-size:13px;">timer</span>
            ETA ~${order.est_ready_in || order.estimated_prep_minutes || 8} min
          </div>
          `}
        </div>
      </div>

      <div class="card-assignee-bar">
        <span class="assignee-name">
          <span class="material-symbols-outlined" style="font-size:16px; color:var(--kds-primary);">badge</span>
          Chef: <strong>${escapeHtml(assignedChefDisplay)}</strong>
        </span>
        <span class="assignee-reason">Intelligent Allocation</span>
      </div>

      <div class="card-items">
        ${itemsHtml}
      </div>

      ${cancelBanner}

      <div class="card-actions">
        ${actionButtonHtml}
        ${cancelBtnHtml}
      </div>
    </div>
  `;
}

// Order Status Progression Handler
async function updateStatus(orderId, newStatus) {
  try {
    const res = await fetch(`/api/kitchen/orders/${orderId}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus })
    });
    if (!res.ok) throw new Error('Status update failed');
    await loadKitchenOrders();
  } catch (err) {
    alert('Error updating order status: ' + err.message);
  }
}

// Cancellation Reason Modal Controls
function openCancelModal(orderId) {
  pendingCancelOrderId = orderId;
  const modal = document.getElementById('cancel-modal');
  const title = document.getElementById('cancel-modal-order-id');
  const input = document.getElementById('cancel-reason-input');

  if (title) title.textContent = `#${orderId}`;
  if (input) input.value = '';
  if (modal) modal.classList.add('open');
}

function closeCancelModal() {
  pendingCancelOrderId = null;
  const modal = document.getElementById('cancel-modal');
  if (modal) modal.classList.remove('open');
}

function setQuickReason(reason) {
  const input = document.getElementById('cancel-reason-input');
  if (input) input.value = reason;
}

async function submitOrderCancellation() {
  if (!pendingCancelOrderId) return;
  const input = document.getElementById('cancel-reason-input');
  const reason = input ? input.value.trim() : '';

  if (!reason) {
    alert('Please provide a mandatory reason for cancelling this order.');
    if (input) input.focus();
    return;
  }

  try {
    const res = await fetch(`/api/kitchen/orders/${pendingCancelOrderId}/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reason,
        employeeId: currentEmployee.id,
        employeeName: currentEmployee.name
      })
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to cancel order');
    }

    closeCancelModal();
    await loadKitchenOrders();
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

// Employee status toggle (available / busy / offline)
async function changeEmployeeStatus(status) {
  currentEmployee.status = status;
  try {
    await fetch(`/api/kitchen/employees/${currentEmployee.id}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status })
    });
  } catch (e) {
    console.error('Status sync error:', e);
  }
}

// Audio Alerts & Settings
function setupSoundUI() {
  const btn = document.getElementById('sound-toggle-btn');
  const icon = document.getElementById('sound-icon');
  if (icon) {
    icon.textContent = soundEnabled ? 'volume_up' : 'volume_off';
  }
  if (btn) {
    btn.classList.toggle('active', soundEnabled);
  }
}

function toggleSound() {
  soundEnabled = !soundEnabled;
  localStorage.setItem('kds_sound_enabled', soundEnabled ? 'true' : 'false');
  setupSoundUI();
}

function playAlertSound() {
  if (!soundEnabled) return;
  const audio = document.getElementById('order-sound');
  if (audio) {
    audio.currentTime = 0;
    audio.play().catch(() => {});
  }
}

function logoutKitchen() {
  sessionStorage.clear();
  window.location.href = 'login.html';
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
