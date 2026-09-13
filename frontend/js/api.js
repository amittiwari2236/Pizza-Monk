const API_BASE = `/api`;

async function getMenu() {
  try {
    const res = await fetch(`${API_BASE}/menu`);
    if (!res.ok) throw new Error(`HTTP error ${res.status}`);
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.error('Error fetching menu:', err);
    return [];
  }
}

async function placeOrder(items, total, paymentInfo = {}) {
  try {
    const res = await fetch(`${API_BASE}/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items, total, payment: paymentInfo })
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || `HTTP error ${res.status}`);
    }
    return await res.json();
  } catch (err) {
    console.error('Error placing order:', err);
    return null;
  }
}

async function getOrder(id) {
  try {
    const res = await fetch(`${API_BASE}/orders/${id}`);
    if (!res.ok) throw new Error(`HTTP error ${res.status}`);
    return await res.json();
  } catch (err) {
    console.error('Error fetching order:', err);
    return null;
  }
}

// Category API
async function getCategories() {
  try {
    const res = await fetch(`${API_BASE}/categories`);
    if (!res.ok) throw new Error(`HTTP error ${res.status}`);
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.error('Error fetching categories:', err);
    return [];
  }
}

async function createCategory(data) {
  try {
    const res = await fetch(`${API_BASE}/categories`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return await res.json();
  } catch (err) {
    console.error('Error creating category:', err);
    return null;
  }
}

async function updateCategory(id, data) {
  try {
    const res = await fetch(`${API_BASE}/categories/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return await res.json();
  } catch (err) {
    console.error('Error updating category:', err);
    return null;
  }
}

async function deleteCategory(id) {
  try {
    const res = await fetch(`${API_BASE}/categories/${id}`, { method: 'DELETE' });
    return await res.json();
  } catch (err) {
    console.error('Error deleting category:', err);
    return null;
  }
}

async function seedCategories() {
  try {
    const res = await fetch(`${API_BASE}/seed`, { method: 'POST' });
    return await res.json();
  } catch (err) {
    console.error('Error seeding categories:', err);
    return null;
  }
}
// ============================
// ORDER ENDPOINTS
// ============================
async function cancelOrder(orderId, reason = 'Cancelled by user') {
  try {
    const res = await fetch(`${API_BASE}/orders/${orderId}/cancel`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to cancel order');
    }
    return await res.json();
  } catch (err) {
    console.error('Error cancelling order:', err);
    return null;
  }
}

// ============================
// FEEDBACK & ETA ENDPOINTS
// ============================
async function submitFeedback(feedbackData) {
  try {
    const res = await fetch(`${API_BASE}/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(feedbackData)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to submit feedback');
    }
    return await res.json();
  } catch (err) {
    console.error('Error submitting feedback:', err);
    return { success: false, error: err.message };
  }
}

async function getFeedbackStats() {
  try {
    const res = await fetch(`${API_BASE}/feedback/stats`);
    if (!res.ok) throw new Error('Failed to fetch feedback stats');
    return await res.json();
  } catch (err) {
    console.error('Error fetching feedback stats:', err);
    return null;
  }
}

async function getFeedbackForOrder(orderId) {
  try {
    const res = await fetch(`${API_BASE}/feedback?orderId=${orderId}`);
    if (!res.ok) return null;
    const data = await res.json();
    return Array.isArray(data) && data.length > 0 ? data[0] : null;
  } catch (err) {
    return null;
  }
}

async function getEtaAnalytics() {
  try {
    const res = await fetch(`${API_BASE}/eta/analytics`);
    if (!res.ok) throw new Error('Failed to fetch ETA analytics');
    return await res.json();
  } catch (err) {
    console.error('Error fetching ETA analytics:', err);
    return null;
  }
}

async function updateBufferSettings(settings) {
  try {
    const res = await fetch(`${API_BASE}/settings/buffer`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings)
    });
    return await res.json();
  } catch (err) {
    console.error('Error updating buffer settings:', err);
    return null;
  }
}
