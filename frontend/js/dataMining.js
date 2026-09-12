// =========================================================================
// Pizza Monk's x My Canteen - Data Mining & Dynamic 7-Banner Engine
// =========================================================================

/**
 * Mines order history, local user interactions, favorites, and time-of-day
 * to discover demand patterns, popular dishes, and personalized recommendations.
 */
function mineOrderInsights(menuItems, orders = [], userFavorites = []) {
  const itemCounts = {};
  const categoryCounts = {};

  // 1. Mine system orders
  if (Array.isArray(orders)) {
    orders.forEach(order => {
      const items = order.items || order.order_items || [];
      items.forEach(it => {
        const id = it.id || it.item_id;
        const qty = Number(it.quantity) || 1;
        if (id) {
          itemCounts[id] = (itemCounts[id] || 0) + qty;
        }
      });
    });
  }

  // 2. Mine local user interaction frequency
  try {
    const localFreq = JSON.parse(localStorage.getItem('item_freq') || '{}');
    for (const [id, count] of Object.entries(localFreq)) {
      itemCounts[id] = (itemCounts[id] || 0) + (Number(count) * 2);
    }
  } catch (e) {}

  // 3. Map categories and compute popularity
  menuItems.forEach(item => {
    const ordersCount = itemCounts[item.id] || 0;
    categoryCounts[item.category] = (categoryCounts[item.category] || 0) + ordersCount;
  });

  // Current time-of-day heuristics
  const hour = new Date().getHours();
  let timeSlot = 'evening'; // default
  let timeGreeting = 'Evening Feast';
  let timeTagline = 'Perfect for your evening craving';
  let timeTargetCategory = 'Pizza';

  if (hour >= 5 && hour < 11) {
    timeSlot = 'morning';
    timeGreeting = 'Morning Fuel ☀️';
    timeTagline = 'Freshly baked breads & breakfast favorites';
    timeTargetCategory = 'Breads';
  } else if (hour >= 11 && hour < 16) {
    timeSlot = 'afternoon';
    timeGreeting = 'Midday Energy ⚡';
    timeTagline = 'Hearty burgers, pasta & delicious combos';
    timeTargetCategory = 'Burger';
  } else if (hour >= 16 && hour < 22) {
    timeSlot = 'evening';
    timeGreeting = 'Dinner & Cravings 🍕';
    timeTagline = 'Hot stone-baked pizzas & loaded sides';
    timeTargetCategory = 'Pizza';
  } else {
    timeSlot = 'latenight';
    timeGreeting = 'Late Night Bites 🌙';
    timeTagline = 'Cheesy snacks, fries & ice-cold shakes';
    timeTargetCategory = 'French Fries';
  }

  // Sort items by mined score
  const scoredItems = menuItems.map(item => {
    const count = itemCounts[item.id] || 0;
    const isFav = userFavorites.includes(item.id);
    let score = count * 3;
    if (isFav) score += 6;
    if (item.is_special) score += 3;
    if (item.category === timeTargetCategory) score += 4;
    return { item, score, count };
  });

  scoredItems.sort((a, b) => b.score - a.score);

  return {
    itemCounts,
    categoryCounts,
    scoredItems: scoredItems.map(s => s.item),
    timeSlot,
    timeGreeting,
    timeTagline,
    timeTargetCategory
  };
}

/**
 * Builds EXACTLY 7 Dynamic Hero Banners according to collected data,
 * demand patterns, Pizza Monk's signature deals, and time-of-day.
 */
function build7DynamicBanners(menuItems, insights) {
  if (!Array.isArray(menuItems) || menuItems.length === 0) return [];

  const { scoredItems, timeGreeting, timeTagline, timeTargetCategory, itemCounts } = insights;

  // Helper to safely find item by criteria with fallbacks
  const findItem = (predicate, fallbackIdx = 0) => {
    const found = scoredItems.find(predicate);
    return found || scoredItems[fallbackIdx % scoredItems.length] || menuItems[0];
  };

  // BANNER 1: 🔥 Mined #1 Bestseller across canteen orders
  const topItem = scoredItems[0] || findItem(i => i.name.includes('Cheese Corn') || i.category === 'Pizza');
  const topOrders = (itemCounts && itemCounts[topItem.id]) ? `${itemCounts[topItem.id]}+ orders today` : 'Most Loved Choice';

  // BANNER 2: 🕒 Time-Smart Meal Spotlight (Dynamic by morning/afternoon/evening)
  const timeItem = findItem(i => i.category === timeTargetCategory && i.id !== topItem.id, 1);

  // BANNER 3: 🎯 Personalized Pick / Recommended for User
  const personalItem = findItem(i => (i.is_special || i.is_my_canteen) && i.id !== topItem.id && i.id !== timeItem.id, 2);

  // BANNER 4: 🍕 Pizza Monk's Signature Deal (Starting @ ₹79 reference)
  const signatureItem = findItem(i => i.category === 'Pizza' && i.price <= 99, 0);

  // BANNER 5: 🧀 Cheesy Indulgence (Stuffed Garlic Bread or Cheese Burst)
  const cheeseItem = findItem(i => i.name.toLowerCase().includes('garlic bread') || i.name.toLowerCase().includes('cheese'), 3);

  // BANNER 6: 🍟 Crunchy Sides & Snack Rush (Fries or Parcel Pocket)
  const snackItem = findItem(i => i.category === 'French Fries' || i.category === 'Breads', 4);

  // BANNER 7: 🥤 Chilled Refreshment (Cold Coffee, Shake, or Mojito)
  const drinkItem = findItem(i => i.category === 'Beverages', 5);

  // Return EXACTLY 7 banners
  return [
    {
      id: 1,
      badgeClass: 'trending',
      badgeText: '🔥 #1 Most Demanded',
      title: topItem.name,
      description: `${topOrders} • ${topItem.description || 'Hot, fresh and bursting with flavor'}`,
      price: topItem.price,
      item: topItem,
      bgGradient: 'linear-gradient(135deg, #7F1D1D 0%, #3B0764 100%)'
    },
    {
      id: 2,
      badgeClass: 'smart-time',
      badgeText: `⏰ ${timeGreeting}`,
      title: timeItem.name,
      description: `${timeTagline} • Freshly prepared on order`,
      price: timeItem.price,
      item: timeItem,
      bgGradient: 'linear-gradient(135deg, #7C2D12 0%, #1E293B 100%)'
    },
    {
      id: 3,
      badgeClass: 'personal',
      badgeText: '✨ Recommended For You',
      title: personalItem.name,
      description: `Tailored to your taste • ${personalItem.description || 'Highly rated by foodies'}`,
      price: personalItem.price,
      item: personalItem,
      bgGradient: 'linear-gradient(135deg, #4C1D95 0%, #1E1B4B 100%)'
    },
    {
      id: 4,
      badgeClass: 'signature',
      badgeText: '🍕 Pizza Monk Deal @ ₹79',
      title: signatureItem.name,
      description: '100% Fresh Hand-Tossed Dough with rich mozzarella & herbs',
      price: signatureItem.price,
      item: signatureItem,
      bgGradient: 'linear-gradient(135deg, #8B1E2D 0%, #450A0A 100%)'
    },
    {
      id: 5,
      badgeClass: 'cheese',
      badgeText: '🧀 Cheese Overload',
      title: cheeseItem.name,
      description: `${cheeseItem.description || 'Golden baked with molten mozzarella cheese stretch'}`,
      price: cheeseItem.price,
      item: cheeseItem,
      bgGradient: 'linear-gradient(135deg, #854D0E 0%, #18181B 100%)'
    },
    {
      id: 6,
      badgeClass: 'snack',
      badgeText: '🍟 Crunch & Munch',
      title: snackItem.name,
      description: `Crispy & addictive sides • ${snackItem.description || 'Perfect canteen snack'}`,
      price: snackItem.price,
      item: snackItem,
      bgGradient: 'linear-gradient(135deg, #065F46 0%, #0F172A 100%)'
    },
    {
      id: 7,
      badgeClass: 'refresh',
      badgeText: '🥤 Chillers & Shakes',
      title: drinkItem.name,
      description: `Thick, chilled & refreshing • ${drinkItem.description || 'The ultimate sweet treat'}`,
      price: drinkItem.price,
      item: drinkItem,
      bgGradient: 'linear-gradient(135deg, #0E7490 0%, #1E1B4B 100%)'
    }
  ];
}

/**
 * Initializes and manages the 7-banner carousel on the DOM.
 */
let carouselInterval = null;
let currentSlideIndex = 0;

function setupBannerCarousel(banners, containerId = 'dynamic-carousel-mount') {
  const mount = document.getElementById(containerId);
  if (!mount || !banners || banners.length !== 7) return;

  currentSlideIndex = 0;
  if (carouselInterval) clearInterval(carouselInterval);

  mount.innerHTML = `
    <div class="carousel-container" id="pizza-monk-carousel">
      <div class="carousel-viewport" id="carousel-viewport">
        <div class="carousel-track" id="carousel-track">
          ${banners.map(b => {
            const img = b.item.image_url || '/assets/food/cheese_corn_pizza.jpg';
            return `
              <div class="carousel-slide" style="background: ${b.bgGradient};" onclick="handleBannerClick(${b.item.id})">
                <div class="slide-overlay"></div>
                <div class="slide-content">
                  <span class="slide-badge ${b.badgeClass}">${b.badgeText}</span>
                  <h2 class="slide-title">${b.title}</h2>
                  <p class="slide-desc">${b.description}</p>
                  <div class="slide-action-row">
                    <span class="slide-price">₹${b.price}</span>
                    <button class="slide-btn" onclick="event.stopPropagation(); quickAddFromBanner(${b.item.id}, '${b.item.name.replace(/'/g, "\\'")}')">
                      <svg viewBox="0 0 24 24"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
                      Quick Add
                    </button>
                  </div>
                </div>
                <div class="slide-food-image">
                  <img src="${img}" alt="${b.title}" onerror="this.onerror=null;this.src='/assets/food/cheese_corn_pizza.jpg';">
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>

      <!-- Left / Right Navigation Controls -->
      <button class="carousel-nav-btn prev" aria-label="Previous Banner" onclick="moveCarousel(-1)">
        <svg viewBox="0 0 24 24"><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>
      </button>
      <button class="carousel-nav-btn next" aria-label="Next Banner" onclick="moveCarousel(1)">
        <svg viewBox="0 0 24 24"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>
      </button>

      <!-- 7 Indicator Dots -->
      <div class="carousel-controls" id="carousel-dots">
        ${banners.map((_, i) => `
          <div class="carousel-dot ${i === 0 ? 'active' : ''}" onclick="goToSlide(${i})"></div>
        `).join('')}
      </div>
    </div>
  `;

  // Autoplay with pause on hover
  const carouselEl = document.getElementById('pizza-monk-carousel');
  const startAutoplay = () => {
    if (carouselInterval) clearInterval(carouselInterval);
    carouselInterval = setInterval(() => {
      moveCarousel(1);
    }, 4500);
  };
  const stopAutoplay = () => {
    if (carouselInterval) clearInterval(carouselInterval);
  };

  carouselEl.addEventListener('mouseenter', stopAutoplay);
  carouselEl.addEventListener('mouseleave', startAutoplay);
  carouselEl.addEventListener('touchstart', stopAutoplay, { passive: true });
  carouselEl.addEventListener('touchend', startAutoplay, { passive: true });

  // Swipe gesture support
  let touchStartX = 0;
  carouselEl.addEventListener('touchstart', (e) => {
    touchStartX = e.changedTouches[0].screenX;
  }, { passive: true });

  carouselEl.addEventListener('touchend', (e) => {
    const touchEndX = e.changedTouches[0].screenX;
    const diff = touchStartX - touchEndX;
    if (Math.abs(diff) > 40) {
      if (diff > 0) moveCarousel(1);
      else moveCarousel(-1);
    }
  }, { passive: true });

  startAutoplay();
}

function updateCarouselDOM() {
  const track = document.getElementById('carousel-track');
  const dots = document.querySelectorAll('.carousel-dot');
  if (track) {
    track.style.transform = `translateX(-${currentSlideIndex * 100}%)`;
  }
  dots.forEach((dot, idx) => {
    if (idx === currentSlideIndex) dot.classList.add('active');
    else dot.classList.remove('active');
  });
}

function moveCarousel(direction) {
  currentSlideIndex = (currentSlideIndex + direction + 7) % 7;
  updateCarouselDOM();
}

function goToSlide(index) {
  currentSlideIndex = index % 7;
  updateCarouselDOM();
}

function handleBannerClick(itemId) {
  window.location.href = `menu.html`;
}

function quickAddFromBanner(itemId, itemName) {
  if (typeof updateQty === 'function') {
    updateQty(itemId, 1);
  }
  showToastFeedback(`Added ${itemName} to Cart! 🛒`);
}

function showToastFeedback(message) {
  let toast = document.getElementById('app-toast-msg');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'app-toast-msg';
    toast.className = 'toast-msg';
    document.body.appendChild(toast);
  }
  toast.innerHTML = `
    <svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
    <span>${message}</span>
  `;
  toast.classList.add('show');
  setTimeout(() => {
    toast.classList.remove('show');
  }, 2300);
}
