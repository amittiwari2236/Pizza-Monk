// =========================================================================
// Category Sliding Row & Filter Modal Engine (Inspired by Reference Images)
// =========================================================================

// Category image map with accurate appetizing plate photos
const CATEGORY_PLATE_IMAGES = {
  'All': '/assets/veg_thali.jpg',
  'Pizza': '/assets/food/cheese_corn_pizza.jpg',
  'Breads': '/assets/food/spicy_stuffed_garlic_bread.jpg',
  'Burger': '/assets/food/tandoori_paneer_burger.jpg',
  'Sandwich': '/assets/food/veggie_cheese_sandwich.jpg',
  'Pasta': '/assets/food/red_sauce_pasta.jpg',
  'French Fries': '/assets/food/masala_fries.jpg',
  'Wraps': '/assets/food/paneer_wrap.jpg',
  'Beverages': '/assets/masala_chai.jpg'
};

// Filter State
window.appFilterState = {
  category: 'All',
  sortBy: 'relevance',      // 'relevance', 'ratingDesc', 'priceAsc', 'priceDesc'
  minRating: null,          // null, 3.5, 4.0
  priceRange: null,         // null, 'under150', '150-300', 'above300', 'under80'
  pureVeg: false,           // boolean
  bestseller: false,        // boolean
  special: false,           // boolean
  collection: null          // null, 'pocketFriendly', 'cheeseLovers', 'snacks'
};

let rawCategories = [];
let rawMenuItems = [];

/**
 * Initializes the Category & Filter system.
 */
function initCategoryAndFilter(menuItems, categories) {
  rawMenuItems = Array.isArray(menuItems) ? menuItems : [];
  rawCategories = Array.isArray(categories) ? categories : [];

  renderCategorySlidingRow(rawCategories);
  setupFilterModalDOM();
  setupAllCategoriesModalDOM(rawCategories);
  updateFilterUIState();
}

/**
 * Renders the single horizontal right-to-left sliding category row.
 * Shows EXACTLY 7 categories initially, followed by the "+ See All" button.
 */
function renderCategorySlidingRow(categories) {
  const track = document.getElementById('category-sliding-track');
  if (!track) return;
  track.innerHTML = '';

  // 1. First item is always "All"
  const allItem = { id: 0, name: 'All' };

  // Combine All with dynamic categories
  const fullList = [allItem, ...categories];

  // Pick initial 7 categories
  const initial7 = fullList.slice(0, 7);

  initial7.forEach(cat => {
    const isSelected = window.appFilterState.category === cat.name;
    const imgUrl = CATEGORY_PLATE_IMAGES[cat.name] || (cat.icon_svg && cat.icon_svg.startsWith('http') ? cat.icon_svg : '/assets/food/cheese_corn_pizza.jpg');

    const itemEl = document.createElement('div');
    itemEl.className = `category-slide-item ${isSelected ? 'active' : ''}`;
    itemEl.setAttribute('data-category', cat.name);
    itemEl.onclick = () => selectCategory(cat.name);

    itemEl.innerHTML = `
      <div class="category-plate">
        <img src="${imgUrl}" alt="${cat.name}" onerror="this.onerror=null;this.src='/assets/food/cheese_corn_pizza.jpg';">
      </div>
      <span class="category-label" title="${cat.name}">${cat.name}</span>
      <div class="category-active-bar"></div>
    `;
    track.appendChild(itemEl);
  });

  // 2. Append the "See All" button after 7 categories
  const seeAllEl = document.createElement('div');
  seeAllEl.className = 'category-slide-item category-see-all-item';
  seeAllEl.onclick = openAllCategoriesModal;
  seeAllEl.innerHTML = `
    <div class="category-plate see-all-plate">
      <svg viewBox="0 0 24 24" width="22" height="22" fill="#8B1E2D">
        <path d="M4 8h4V4H4v4zm6 12h4v-4h-4v4zm-6 0h4v-4H4v4zm0-6h4v-4H4v4zm6 0h4v-4h-4v4zm6-10v4h4V4h-4zm-6 4h4V4h-4v4zm6 6h4v-4h-4v4zm0 6h4v-4h-4v4z"/>
      </svg>
    </div>
    <span class="category-label" style="font-weight: 700; color: #8B1E2D;">See All</span>
    <div class="category-active-bar" style="opacity: 0;"></div>
  `;
  track.appendChild(seeAllEl);
}

/**
 * Handles selecting a category (filters items and updates active indicator).
 */
function selectCategory(categoryName) {
  window.appFilterState.category = categoryName;

  // Update horizontal row active indicators
  const items = document.querySelectorAll('.category-slide-item');
  items.forEach(it => {
    if (it.getAttribute('data-category') === categoryName) {
      it.classList.add('active');
    } else {
      it.classList.remove('active');
    }
  });

  applyFilters();
}

/**
 * Opens the "See All Categories" modal popup.
 */
function openAllCategoriesModal() {
  const modal = document.getElementById('all-categories-modal');
  if (modal) {
    modal.classList.add('open');
    document.body.style.overflow = 'hidden';
  }
}

function closeAllCategoriesModal() {
  const modal = document.getElementById('all-categories-modal');
  if (modal) {
    modal.classList.remove('open');
    document.body.style.overflow = '';
  }
}

/**
 * Builds the "See All Categories" modal markup.
 */
function setupAllCategoriesModalDOM(categories) {
  let modal = document.getElementById('all-categories-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'all-categories-modal';
    modal.className = 'custom-modal-overlay';
    document.body.appendChild(modal);
  }

  const allCategories = [{ id: 0, name: 'All' }, ...categories];

  modal.innerHTML = `
    <div class="custom-modal-sheet">
      <div class="custom-modal-header">
        <div>
          <h3>All Categories</h3>
          <p style="font-size: 12px; color: var(--text-gray); margin: 0;">Select a category to filter the menu</p>
        </div>
        <button class="modal-close-btn" onclick="closeAllCategoriesModal()">✕</button>
      </div>
      <div class="all-categories-grid">
        ${allCategories.map(cat => {
          const imgUrl = CATEGORY_PLATE_IMAGES[cat.name] || '/assets/food/cheese_corn_pizza.jpg';
          const isSelected = window.appFilterState.category === cat.name;
          const count = cat.name === 'All' ? rawMenuItems.length : rawMenuItems.filter(i => i.category === cat.name).length;
          return `
            <div class="all-cat-card ${isSelected ? 'active' : ''}" onclick="selectCategoryFromModal('${cat.name.replace(/'/g, "\\'")}')">
              <div class="all-cat-img">
                <img src="${imgUrl}" alt="${cat.name}" onerror="this.onerror=null;this.src='/assets/food/cheese_corn_pizza.jpg';">
              </div>
              <div class="all-cat-info">
                <h4>${cat.name}</h4>
                <span>${count} items</span>
              </div>
              ${isSelected ? `<div class="all-cat-check">✓</div>` : ''}
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;
}

function selectCategoryFromModal(categoryName) {
  closeAllCategoriesModal();
  selectCategory(categoryName);
}

/**
 * Builds the "Filters and sorting" modal markup matching Reference Images 2 & 3.
 * IMPORTANT: All Time and Schedule related sections have been completely removed!
 */
function setupFilterModalDOM() {
  let modal = document.getElementById('filter-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'filter-modal';
    modal.className = 'custom-modal-overlay';
    document.body.appendChild(modal);
  }

  modal.innerHTML = `
    <div class="filter-modal-dialog">
      <!-- Floating Close Button -->
      <button class="floating-close-circle" onclick="closeFilterModal()" title="Close">✕</button>

      <!-- Modal Header -->
      <div class="filter-dialog-header">
        <h2>Filters and sorting</h2>
        <button class="clear-all-link" onclick="clearAllFiltersInModal()">Clear all</button>
      </div>

      <!-- Two-Column Body -->
      <div class="filter-dialog-body">
        <!-- Left Sidebar Tabs (NO Time / Schedule!) -->
        <div class="filter-sidebar">
          <div class="filter-tab-btn active" data-tab="sort" onclick="switchFilterTab('sort')">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M3 18h6v-2H3v2zM3 6v2h18V6H3zm0 7h12v-2H3v2z"/></svg>
            <span>Sort By</span>
          </div>
          <div class="filter-tab-btn" data-tab="rating" onclick="switchFilterTab('rating')">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>
            <span>Rating</span>
          </div>
          <div class="filter-tab-btn" data-tab="price" onclick="switchFilterTab('price')">
            <span style="font-weight: 800; font-size: 15px; line-height: 1;">₹</span>
            <span>Dish Price</span>
          </div>
          <div class="filter-tab-btn" data-tab="trust" onclick="switchFilterTab('trust')">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z"/></svg>
            <span>Trust Markers</span>
          </div>
          <div class="filter-tab-btn" data-tab="collections" onclick="switchFilterTab('collections')">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg>
            <span>Collections</span>
          </div>
        </div>

        <!-- Right Content Area -->
        <div class="filter-content-area" id="filter-content-area">
          <!-- 1. Sort By Panel -->
          <div class="filter-pane" id="pane-sort">
            <h4 class="pane-title">Sort by</h4>
            <div class="sort-options-list">
              <label class="sort-option-row">
                <span class="sort-label">Relevance</span>
                <input type="radio" name="sort_radio" value="relevance" onchange="onModalSortChange('relevance')">
                <span class="radio-custom"></span>
              </label>
              <label class="sort-option-row">
                <span class="sort-label">Rating: High to Low</span>
                <input type="radio" name="sort_radio" value="ratingDesc" onchange="onModalSortChange('ratingDesc')">
                <span class="radio-custom"></span>
              </label>
              <label class="sort-option-row">
                <span class="sort-label">Cost: Low to High</span>
                <input type="radio" name="sort_radio" value="priceAsc" onchange="onModalSortChange('priceAsc')">
                <span class="radio-custom"></span>
              </label>
              <label class="sort-option-row">
                <span class="sort-label">Cost: High to Low</span>
                <input type="radio" name="sort_radio" value="priceDesc" onchange="onModalSortChange('priceDesc')">
                <span class="radio-custom"></span>
              </label>
            </div>
          </div>

          <!-- 2. Rating Panel -->
          <div class="filter-pane" id="pane-rating" style="display:none;">
            <h4 class="pane-title">Restaurant / Dish Rating</h4>
            <div class="rating-chips-row">
              <div class="rating-chip" id="chip-rate-35" onclick="onModalRatingToggle(3.5)">
                <span class="green-star">★</span> Rated 3.5+
              </div>
              <div class="rating-chip" id="chip-rate-40" onclick="onModalRatingToggle(4.0)">
                <span class="green-star">★</span> Rated 4.0+
              </div>
            </div>
          </div>

          <!-- 3. Dish Price Panel -->
          <div class="filter-pane" id="pane-price" style="display:none;">
            <h4 class="pane-title">Dish Price</h4>
            <div class="price-cards-grid">
              <div class="price-card" id="card-price-under150" onclick="onModalPriceToggle('under150')">
                <div class="price-symbol">₹</div>
                <div class="price-name">Under ₹150</div>
              </div>
              <div class="price-card" id="card-price-150-300" onclick="onModalPriceToggle('150-300')">
                <div class="price-symbol">₹₹</div>
                <div class="price-name">₹150 - ₹300</div>
              </div>
              <div class="price-card" id="card-price-above300" onclick="onModalPriceToggle('above300')">
                <div class="price-symbol">₹₹₹</div>
                <div class="price-name">Above ₹300</div>
              </div>
              <div class="price-card" id="card-price-under80" onclick="onModalPriceToggle('under80')">
                <div class="price-symbol">₹</div>
                <div class="price-name">Pocket: Under ₹80</div>
              </div>
            </div>
          </div>

          <!-- 4. Trust Markers Panel -->
          <div class="filter-pane" id="pane-trust" style="display:none;">
            <h4 class="pane-title">Trust Markers</h4>
            <div class="trust-list">
              <div class="trust-item-card" id="card-trust-veg" onclick="onModalTrustToggle('pureVeg')">
                <div class="trust-info">
                  <div class="veg-badge-square"><span class="veg-dot"></span></div>
                  <div>
                    <h5>Pure Veg</h5>
                    <p>100% vegetarian dishes only</p>
                  </div>
                </div>
                <div class="trust-checkbox" id="check-trust-veg"></div>
              </div>

              <div class="trust-item-card" id="card-trust-bestseller" onclick="onModalTrustToggle('bestseller')">
                <div class="trust-info">
                  <span style="font-size: 20px;">🔥</span>
                  <div>
                    <h5>Bestseller</h5>
                    <p>Most demanded dishes across canteen</p>
                  </div>
                </div>
                <div class="trust-checkbox" id="check-trust-bestseller"></div>
              </div>

              <div class="trust-item-card" id="card-trust-special" onclick="onModalTrustToggle('special')">
                <div class="trust-info">
                  <span style="font-size: 20px;">⭐</span>
                  <div>
                    <h5>Chef's Special</h5>
                    <p>Specially curated items & signature recipes</p>
                  </div>
                </div>
                <div class="trust-checkbox" id="check-trust-special"></div>
              </div>
            </div>
          </div>

          <!-- 5. Collections Panel -->
          <div class="filter-pane" id="pane-collections" style="display:none;">
            <h4 class="pane-title">Curated Collections</h4>
            <div class="trust-list">
              <div class="trust-item-card" id="card-col-pocket" onclick="onModalCollectionToggle('pocketFriendly')">
                <div class="trust-info">
                  <span style="font-size: 20px;">💰</span>
                  <div>
                    <h5>Pocket Friendly</h5>
                    <p>Value meals and treats under ₹100</p>
                  </div>
                </div>
                <div class="trust-checkbox" id="check-col-pocket"></div>
              </div>

              <div class="trust-item-card" id="card-col-cheese" onclick="onModalCollectionToggle('cheeseLovers')">
                <div class="trust-info">
                  <span style="font-size: 20px;">🧀</span>
                  <div>
                    <h5>Cheese Lovers</h5>
                    <p>Loaded with mozzarella, cheese burst & stretches</p>
                  </div>
                </div>
                <div class="trust-checkbox" id="check-col-cheese"></div>
              </div>

              <div class="trust-item-card" id="card-col-snacks" onclick="onModalCollectionToggle('snacks')">
                <div class="trust-info">
                  <span style="font-size: 20px;">🍟</span>
                  <div>
                    <h5>Quick Snacks & Bites</h5>
                    <p>Fries, garlic breads, parcels & sides</p>
                  </div>
                </div>
                <div class="trust-checkbox" id="check-col-snacks"></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Modal Footer -->
      <div class="filter-dialog-footer">
        <button class="footer-close-text-btn" onclick="closeFilterModal()">Close</button>
        <button class="footer-apply-primary-btn" id="modal-apply-btn" onclick="applyModalFilters()">
          Show results
        </button>
      </div>
    </div>
  `;
}

/**
 * Opens the Filter Modal.
 */
function openFilterModal() {
  const modal = document.getElementById('filter-modal');
  if (!modal) return;
  syncModalControlsWithFilterState();
  updateModalResultCount();
  modal.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeFilterModal() {
  const modal = document.getElementById('filter-modal');
  if (modal) {
    modal.classList.remove('open');
    document.body.style.overflow = '';
  }
}

/**
 * Switches the active tab on the left of the Filter Modal.
 */
function switchFilterTab(tabName) {
  const tabs = document.querySelectorAll('.filter-tab-btn');
  tabs.forEach(t => {
    if (t.getAttribute('data-tab') === tabName) t.classList.add('active');
    else t.classList.remove('active');
  });

  const panes = document.querySelectorAll('.filter-pane');
  panes.forEach(p => p.style.display = 'none');

  const activePane = document.getElementById(`pane-${tabName}`);
  if (activePane) activePane.style.display = 'block';
}

/**
 * Modal selection handlers.
 */
function onModalSortChange(val) {
  window.appFilterState.sortBy = val;
  updateModalResultCount();
}

function onModalRatingToggle(rating) {
  if (window.appFilterState.minRating === rating) {
    window.appFilterState.minRating = null;
  } else {
    window.appFilterState.minRating = rating;
  }
  syncModalControlsWithFilterState();
  updateModalResultCount();
}

function onModalPriceToggle(range) {
  if (window.appFilterState.priceRange === range) {
    window.appFilterState.priceRange = null;
  } else {
    window.appFilterState.priceRange = range;
  }
  syncModalControlsWithFilterState();
  updateModalResultCount();
}

function onModalTrustToggle(marker) {
  window.appFilterState[marker] = !window.appFilterState[marker];
  syncModalControlsWithFilterState();
  updateModalResultCount();
}

function onModalCollectionToggle(col) {
  if (window.appFilterState.collection === col) {
    window.appFilterState.collection = null;
  } else {
    window.appFilterState.collection = col;
  }
  syncModalControlsWithFilterState();
  updateModalResultCount();
}

function clearAllFiltersInModal() {
  clearAllFilters();
  syncModalControlsWithFilterState();
  updateModalResultCount();
}

function applyModalFilters() {
  closeFilterModal();
  applyFilters();
}

/**
 * Synchronizes modal UI controls with current window.appFilterState.
 */
function syncModalControlsWithFilterState() {
  // Sort radios
  const radios = document.querySelectorAll('input[name="sort_radio"]');
  radios.forEach(r => {
    r.checked = r.value === window.appFilterState.sortBy;
  });

  // Rating chips
  const c35 = document.getElementById('chip-rate-35');
  const c40 = document.getElementById('chip-rate-40');
  if (c35) c35.classList.toggle('active', window.appFilterState.minRating === 3.5);
  if (c40) c40.classList.toggle('active', window.appFilterState.minRating === 4.0);

  // Price cards
  const p150 = document.getElementById('card-price-under150');
  const p150300 = document.getElementById('card-price-150-300');
  const pAbove300 = document.getElementById('card-price-above300');
  const p80 = document.getElementById('card-price-under80');
  if (p150) p150.classList.toggle('active', window.appFilterState.priceRange === 'under150');
  if (p150300) p150300.classList.toggle('active', window.appFilterState.priceRange === '150-300');
  if (pAbove300) pAbove300.classList.toggle('active', window.appFilterState.priceRange === 'above300');
  if (p80) p80.classList.toggle('active', window.appFilterState.priceRange === 'under80');

  // Trust markers
  const tVeg = document.getElementById('card-trust-veg');
  const chkVeg = document.getElementById('check-trust-veg');
  if (tVeg) tVeg.classList.toggle('active', window.appFilterState.pureVeg);
  if (chkVeg) chkVeg.innerText = window.appFilterState.pureVeg ? '✓' : '';

  const tBest = document.getElementById('card-trust-bestseller');
  const chkBest = document.getElementById('check-trust-bestseller');
  if (tBest) tBest.classList.toggle('active', window.appFilterState.bestseller);
  if (chkBest) chkBest.innerText = window.appFilterState.bestseller ? '✓' : '';

  const tSpec = document.getElementById('card-trust-special');
  const chkSpec = document.getElementById('check-trust-special');
  if (tSpec) tSpec.classList.toggle('active', window.appFilterState.special);
  if (chkSpec) chkSpec.innerText = window.appFilterState.special ? '✓' : '';

  // Collections
  const colPocket = document.getElementById('card-col-pocket');
  const chkPocket = document.getElementById('check-col-pocket');
  if (colPocket) colPocket.classList.toggle('active', window.appFilterState.collection === 'pocketFriendly');
  if (chkPocket) chkPocket.innerText = window.appFilterState.collection === 'pocketFriendly' ? '✓' : '';

  const colCheese = document.getElementById('card-col-cheese');
  const chkCheese = document.getElementById('check-col-cheese');
  if (colCheese) colCheese.classList.toggle('active', window.appFilterState.collection === 'cheeseLovers');
  if (chkCheese) chkCheese.innerText = window.appFilterState.collection === 'cheeseLovers' ? '✓' : '';

  const colSnacks = document.getElementById('card-col-snacks');
  const chkSnacks = document.getElementById('check-col-snacks');
  if (colSnacks) colSnacks.classList.toggle('active', window.appFilterState.collection === 'snacks');
  if (chkSnacks) chkSnacks.innerText = window.appFilterState.collection === 'snacks' ? '✓' : '';
}

/**
 * Updates "Show results" count inside modal in real time.
 */
function updateModalResultCount() {
  const filtered = computeFilteredItems(rawMenuItems, window.appFilterState);
  const btn = document.getElementById('modal-apply-btn');
  if (btn) {
    btn.innerText = `Show ${filtered.length} ${filtered.length === 1 ? 'item' : 'results'}`;
  }
}

/**
 * Handles Quick Filter pills on the homepage bar.
 */
function toggleQuickFilter(type) {
  if (type === 'under150') {
    window.appFilterState.priceRange = window.appFilterState.priceRange === 'under150' ? null : 'under150';
  } else if (type === 'pureVeg') {
    window.appFilterState.pureVeg = !window.appFilterState.pureVeg;
  } else if (type === 'specials') {
    window.appFilterState.special = !window.appFilterState.special;
  } else if (type === 'priceAsc') {
    window.appFilterState.sortBy = window.appFilterState.sortBy === 'priceAsc' ? 'relevance' : 'priceAsc';
  } else if (type === 'bestseller') {
    window.appFilterState.bestseller = !window.appFilterState.bestseller;
  }

  applyFilters();
}

/**
 * Computes filtered and sorted items from state.
 */
function computeFilteredItems(items, state) {
  let list = [...items];

  // 1. Category
  if (state.category && state.category !== 'All') {
    list = list.filter(i => i.category === state.category);
  }

  // 2. Price Range
  if (state.priceRange === 'under150') {
    list = list.filter(i => i.price <= 150);
  } else if (state.priceRange === '150-300') {
    list = list.filter(i => i.price >= 150 && i.price <= 300);
  } else if (state.priceRange === 'above300') {
    list = list.filter(i => i.price > 300);
  } else if (state.priceRange === 'under80') {
    list = list.filter(i => i.price <= 80);
  }

  // 3. Min Rating / Specials
  if (state.minRating === 4.0 || state.special) {
    list = list.filter(i => i.is_special || (i.price <= 120 && i.available));
  } else if (state.minRating === 3.5) {
    list = list.filter(i => i.available);
  }

  // 4. Trust Markers
  if (state.pureVeg) {
    list = list.filter(i => !i.name.toLowerCase().includes('egg') && !i.name.toLowerCase().includes('chicken'));
  }
  if (state.bestseller) {
    list = list.filter(i => i.is_special || i.is_my_canteen || i.price <= 99);
  }

  // 5. Collections
  if (state.collection === 'pocketFriendly') {
    list = list.filter(i => i.price <= 100);
  } else if (state.collection === 'cheeseLovers') {
    list = list.filter(i => i.name.toLowerCase().includes('cheese') || (i.description && i.description.toLowerCase().includes('cheese')));
  } else if (state.collection === 'snacks') {
    list = list.filter(i => i.category === 'French Fries' || i.category === 'Breads' || i.category === 'Wraps');
  }

  // 6. Sorting
  if (state.sortBy === 'priceAsc') {
    list.sort((a, b) => a.price - b.price);
  } else if (state.sortBy === 'priceDesc') {
    list.sort((a, b) => b.price - a.price);
  } else if (state.sortBy === 'ratingDesc') {
    list.sort((a, b) => (b.is_special ? 1 : 0) - (a.is_special ? 1 : 0));
  }

  return list;
}

/**
 * Counts how many active filters are currently applied (excluding category All & relevance).
 */
function getActiveFilterCount() {
  let count = 0;
  if (window.appFilterState.sortBy !== 'relevance') count++;
  if (window.appFilterState.minRating) count++;
  if (window.appFilterState.priceRange) count++;
  if (window.appFilterState.pureVeg) count++;
  if (window.appFilterState.bestseller) count++;
  if (window.appFilterState.special) count++;
  if (window.appFilterState.collection) count++;
  return count;
}

/**
 * Updates filter pills and badge UI.
 */
function updateFilterUIState() {
  const count = getActiveFilterCount();
  const filterBtn = document.getElementById('open-filter-modal-btn');
  const countBadge = document.getElementById('filter-active-count');

  if (filterBtn && countBadge) {
    if (count > 0) {
      filterBtn.classList.add('has-active');
      countBadge.style.display = 'inline-flex';
      countBadge.innerText = count;
    } else {
      filterBtn.classList.remove('has-active');
      countBadge.style.display = 'none';
    }
  }

  // Quick pills
  const p150 = document.getElementById('pill-under-150');
  const pVeg = document.getElementById('pill-pure-veg');
  const pSpec = document.getElementById('pill-specials');
  const pAsc = document.getElementById('pill-price-asc');
  const pBest = document.getElementById('pill-bestseller');

  if (p150) p150.classList.toggle('active', window.appFilterState.priceRange === 'under150');
  if (pVeg) pVeg.classList.toggle('active', window.appFilterState.pureVeg);
  if (pSpec) pSpec.classList.toggle('active', window.appFilterState.special);
  if (pAsc) pAsc.classList.toggle('active', window.appFilterState.sortBy === 'priceAsc');
  if (pBest) pBest.classList.toggle('active', window.appFilterState.bestseller);
}

/**
 * Clears all filters back to default.
 */
function clearAllFilters() {
  window.appFilterState = {
    category: 'All',
    sortBy: 'relevance',
    minRating: null,
    priceRange: null,
    pureVeg: false,
    bestseller: false,
    special: false,
    collection: null
  };

  // Reset category row
  const items = document.querySelectorAll('.category-slide-item');
  items.forEach(it => {
    if (it.getAttribute('data-category') === 'All') it.classList.add('active');
    else it.classList.remove('active');
  });

  applyFilters();
}

/**
 * Applies current filterState and renders items.
 */
function applyFilters() {
  updateFilterUIState();

  const isFiltering = (window.appFilterState.category !== 'All') || (getActiveFilterCount() > 0);
  const filteredSection = document.getElementById('filtered-results-section');
  const regularSections = [
    document.getElementById('quick-reorder-wrapper'),
    document.querySelector('.specials-header'),
    document.getElementById('specials-container'),
    document.querySelectorAll('.specials-header')[1],
    document.getElementById('trending-container'),
    document.getElementById('my-canteen-wrapper')
  ];

  if (!isFiltering) {
    // Normal Homepage Mode: Hide filtered grid, show regular sections
    if (filteredSection) filteredSection.style.display = 'none';
    regularSections.forEach(el => {
      if (el) el.style.display = '';
    });
    return;
  }

  // Filtered Mode: Show filtered grid, hide regular sections
  if (filteredSection) filteredSection.style.display = 'block';
  regularSections.forEach(el => {
    if (el) el.style.display = 'none';
  });

  const filteredItems = computeFilteredItems(rawMenuItems, window.appFilterState);

  // Update Title & Count
  const titleEl = document.getElementById('filtered-section-title');
  const countEl = document.getElementById('filtered-section-count');
  if (titleEl) {
    if (window.appFilterState.category !== 'All') {
      titleEl.innerText = `${window.appFilterState.category} Dishes`;
    } else {
      titleEl.innerText = 'Filtered Results';
    }
  }
  if (countEl) {
    countEl.innerText = `${filteredItems.length} ${filteredItems.length === 1 ? 'dish' : 'dishes'} available`;
  }

  // Render active chips bar
  renderActiveChips();

  // Render items into the filtered grid
  const grid = document.getElementById('filtered-items-grid');
  if (!grid) return;
  grid.innerHTML = '';

  if (filteredItems.length === 0) {
    grid.innerHTML = `
      <div class="empty-filter-state">
        <div style="font-size: 36px; margin-bottom: 8px;">🍽️</div>
        <h3>No dishes match these filters</h3>
        <p style="font-size: 13px; color: var(--text-gray); margin-top: 4px;">Try clearing some filters or pick a different category.</p>
        <button class="primary-btn" onclick="clearAllFilters()" style="margin-top: 14px; max-width: 200px; padding: 10px 16px; font-size: 13px;">
          Reset Filters
        </button>
      </div>
    `;
    return;
  }

  filteredItems.forEach(item => {
    if (typeof renderFoodCard === 'function') {
      renderFoodCard(item, grid, true);
    }
  });
}

/**
 * Renders small removable chips for currently applied filters.
 */
function renderActiveChips() {
  const chipsRow = document.getElementById('active-chips-row');
  if (!chipsRow) return;

  const chips = [];
  if (window.appFilterState.category !== 'All') {
    chips.push({ label: window.appFilterState.category, onRemove: () => selectCategory('All') });
  }
  if (window.appFilterState.priceRange === 'under150') {
    chips.push({ label: 'Under ₹150', onRemove: () => toggleQuickFilter('under150') });
  } else if (window.appFilterState.priceRange === '150-300') {
    chips.push({ label: '₹150 - ₹300', onRemove: () => { window.appFilterState.priceRange = null; applyFilters(); } });
  } else if (window.appFilterState.priceRange === 'above300') {
    chips.push({ label: 'Above ₹300', onRemove: () => { window.appFilterState.priceRange = null; applyFilters(); } });
  } else if (window.appFilterState.priceRange === 'under80') {
    chips.push({ label: 'Under ₹80', onRemove: () => { window.appFilterState.priceRange = null; applyFilters(); } });
  }
  if (window.appFilterState.pureVeg) {
    chips.push({ label: 'Pure Veg', onRemove: () => toggleQuickFilter('pureVeg') });
  }
  if (window.appFilterState.special) {
    chips.push({ label: 'Specials / 4.0+', onRemove: () => toggleQuickFilter('specials') });
  }
  if (window.appFilterState.bestseller) {
    chips.push({ label: 'Bestseller', onRemove: () => toggleQuickFilter('bestseller') });
  }
  if (window.appFilterState.sortBy === 'priceAsc') {
    chips.push({ label: 'Cost: Low to High', onRemove: () => toggleQuickFilter('priceAsc') });
  } else if (window.appFilterState.sortBy === 'priceDesc') {
    chips.push({ label: 'Cost: High to Low', onRemove: () => { window.appFilterState.sortBy = 'relevance'; applyFilters(); } });
  }

  if (chips.length === 0) {
    chipsRow.style.display = 'none';
    chipsRow.innerHTML = '';
    return;
  }

  chipsRow.style.display = 'flex';
  chipsRow.innerHTML = chips.map((c, idx) => `
    <div class="active-filter-chip" onclick="removeChip(${idx})">
      <span>${c.label}</span>
      <span class="chip-x">✕</span>
    </div>
  `).join('');

  window._activeChipCallbacks = chips.map(c => c.onRemove);
}

function removeChip(idx) {
  if (window._activeChipCallbacks && window._activeChipCallbacks[idx]) {
    window._activeChipCallbacks[idx]();
  }
}
