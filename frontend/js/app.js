// State management
let cart = JSON.parse(localStorage.getItem('canteen_cart')) || {};

function saveCart() {
  localStorage.setItem('canteen_cart', JSON.stringify(cart));
  updateCartBadge();
}

function getCartQuantity(id) {
  return cart[id] || 0;
}

function updateQty(id, change) {
  const current = getCartQuantity(id);
  const newQty = current + change;
  
  if (newQty <= 0) {
    delete cart[id];
  } else {
    cart[id] = newQty;
  }
  
  saveCart();
  
  // Update DOM if element exists
  const qtyEl = document.getElementById(`qty-${id}`);
  if (qtyEl) {
    qtyEl.innerText = getCartQuantity(id);
  }
  
  // Dispatch event for other listeners (like cart page)
  document.dispatchEvent(new CustomEvent('cartUpdated'));
}

function removeFromCart(id) {
  delete cart[id];
  saveCart();
  document.dispatchEvent(new CustomEvent('cartUpdated'));
}

function getCartItems() {
  return cart;
}

function clearCart() {
  cart = {};
  saveCart();
}

function updateCartBadge() {
  const badge = document.getElementById('cart-badge');
  if (!badge) return;
  
  const totalItems = Object.values(cart).reduce((sum, qty) => sum + qty, 0);
  if (totalItems > 0) {
    badge.innerText = totalItems;
    badge.style.display = 'flex';
  } else {
    badge.style.display = 'none';
  }
}

// Initial badge update
document.addEventListener('DOMContentLoaded', updateCartBadge);

// Order History & Recommendations
function trackOrderHistory(orderId, itemsArr) {
  let myOrders = JSON.parse(localStorage.getItem('my_orders') || '[]');
  myOrders.push(orderId);
  localStorage.setItem('my_orders', JSON.stringify(myOrders));

  let freq = JSON.parse(localStorage.getItem('item_freq') || '{}');
  itemsArr.forEach(item => {
    freq[item.id] = (freq[item.id] || 0) + item.quantity;
  });
  localStorage.setItem('item_freq', JSON.stringify(freq));
}

function getRecommendations(menuItems) {
  let freq = JSON.parse(localStorage.getItem('item_freq') || '{}');
  const orderedIds = Object.keys(freq).sort((a, b) => freq[b] - freq[a]);
  
  let recommended = [];
  
  if (orderedIds.length > 0) {
    // Return top frequently ordered items
    orderedIds.slice(0, 4).forEach(id => {
      const item = menuItems.find(m => m.id == id);
      if (item && item.available) recommended.push(item);
    });
  }
  
  // If no history or not enough items, fallback to specials or first items
  if (recommended.length < 4) {
    const specials = menuItems.filter(m => m.is_special && m.available && !recommended.find(r => r.id === m.id));
    const others = menuItems.filter(m => m.available && !m.is_special && !recommended.find(r => r.id === m.id));
    
    recommended = [...recommended, ...specials, ...others].slice(0, 4);
  }
  
  return {
    items: recommended,
    isFrequent: orderedIds.length > 0
  };
}

function renderRecommendationsHtml(recommendedData) {
  if (!recommendedData || !recommendedData.items.length) return '';
  
  const title = recommendedData.isFrequent ? 'Order Again / Frequently Ordered' : 'Recommended for You';
  
  let cardsHtml = '';
  recommendedData.items.forEach(item => {
    const imgUrl = item.image_url ? (item.image_url.startsWith('http') ? item.image_url : `${item.image_url}`) : '';
    cardsHtml += `
      <div class="food-card">
        <div class="img-container">
          <img src="${imgUrl}" alt="${item.name}">
        </div>
        <div class="content">
          <h3>${item.name}</h3>
          <p class="desc">${item.description || ''}</p>
          <div style="flex:1;"></div>
          <div class="price">₹${item.price}</div>
          <button class="primary-btn mt-2" style="padding: 8px; font-size: 13px;" onclick="updateQty(${item.id}, 1)">Add to Cart</button>
        </div>
      </div>
    `;
  });

  return `
    <div class="recommendations-section">
      <h3>${title}</h3>
      <div class="specials-scroll" style="margin:0; padding-left:0; padding-right:0;">
        ${cardsHtml}
      </div>
    </div>
  `;
}
