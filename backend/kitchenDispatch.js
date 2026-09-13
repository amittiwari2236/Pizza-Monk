/**
 * Pizza Monk Kitchen Intelligent Dispatch & Allocation Engine
 * 
 * Dynamically routes incoming orders to kitchen employees (Emp1, Emp2, Emp3, Emp4...)
 * based on:
 *  1. Food preparation time & item complexity
 *  2. Employee skills & specialization (Cooking vs Grilling vs Assembly vs Beverages/Packing)
 *  3. Employee availability (Available, Busy, Offline)
 *  4. Real-time active workload balancing
 */

class KitchenDispatch {
  constructor() {
    this.employees = [
      {
        id: 'emp1',
        name: 'Chef Marco',
        role: 'kitchen',
        specialization: 'Pizza & Pasta Master',
        skills: ['pizza', 'pasta', 'baking', 'italian'],
        status: 'available', // available | busy | offline
        avatar: '👨‍🍳'
      },
      {
        id: 'emp2',
        name: 'Chef Priya',
        role: 'kitchen',
        specialization: 'Burger & Grill Specialist',
        skills: ['burger', 'sandwich', 'grill', 'frying', 'sides'],
        status: 'available',
        avatar: '👩‍🍳'
      },
      {
        id: 'emp3',
        name: 'Chef Vikram',
        role: 'kitchen',
        specialization: 'Breads & Wraps Chef',
        skills: ['breads', 'wraps', 'bread', 'cooking', 'roti'],
        status: 'available',
        avatar: '👨‍🍳'
      },
      {
        id: 'emp4',
        name: 'Deepak',
        role: 'kitchen',
        specialization: 'Beverages & Fast Packing',
        skills: ['beverages', 'french fries', 'shakes', 'drinks', 'packaging', 'packet'],
        status: 'available',
        avatar: '🧑‍🍳'
      },
      {
        id: 'kitchen',
        name: 'Kitchen Station Lead',
        role: 'kitchen',
        specialization: 'Head Chef & All-Station Dispatch',
        skills: ['all'],
        status: 'available',
        avatar: '⭐'
      }
    ];

    // Item category baseline prep times (in minutes)
    this.prepTimeTable = {
      'pizza': 12,
      'pasta': 10,
      'burger': 8,
      'sandwich': 6,
      'breads': 7,
      'wraps': 7,
      'french fries': 5,
      'beverages': 3,
      'default': 8
    };
  }

  getEmployees(activeOrders = []) {
    return this.employees.map(emp => {
      // Calculate real-time active load
      const activeCount = activeOrders.filter(o => 
        o.assigned_employee === emp.id && 
        ['Pending', 'Preparing', 'Almost Ready'].includes(o.status)
      ).length;

      return {
        ...emp,
        activeOrdersCount: activeCount
      };
    });
  }

  getEmployeeById(empId) {
    return this.employees.find(e => e.id.toLowerCase() === String(empId).toLowerCase().trim()) || null;
  }

  setEmployeeStatus(empId, status) {
    const emp = this.getEmployeeById(empId);
    if (!emp) return null;
    if (['available', 'busy', 'offline'].includes(status.toLowerCase())) {
      emp.status = status.toLowerCase();
    }
    return emp;
  }

  estimateOrderPrepTime(items = []) {
    let maxBasePrep = 0;
    let totalItemsCount = 0;

    for (const item of items) {
      const name = (item.name || '').toLowerCase();
      const cat = (item.category || '').toLowerCase();
      const qty = parseInt(item.quantity, 10) || 1;
      totalItemsCount += qty;

      let itemPrep = this.prepTimeTable.default;
      for (const [key, minutes] of Object.entries(this.prepTimeTable)) {
        if (cat.includes(key) || name.includes(key)) {
          itemPrep = minutes;
          break;
        }
      }

      // If multiple quantities, slight prep scaling (+1.5m per additional piece)
      const scaledItemPrep = itemPrep + Math.max(0, (qty - 1) * 1.5);
      if (scaledItemPrep > maxBasePrep) {
        maxBasePrep = scaledItemPrep;
      }
    }

    // Return rounded estimate with minimum 5 mins
    return Math.max(5, Math.round(maxBasePrep));
  }

  /**
   * Intelligently allocate order to the most optimal employee
   * @param {Object} order - Order data containing items array
   * @param {Array} activeOrders - Current live orders in database
   */
  allocateOrder(order, activeOrders = []) {
    const items = order.items || [];
    const prepMinutes = this.estimateOrderPrepTime(items);

    // Analyze order categories & skills required
    const orderKeywords = [];
    items.forEach(it => {
      if (it.name) orderKeywords.push(...it.name.toLowerCase().split(/\s+/));
      if (it.category) orderKeywords.push(it.category.toLowerCase());
    });

    // Determine candidate employees (exclude 'kitchen' head chef from automated single routing if specific chefs available)
    const eligibleEmployees = this.employees.filter(e => e.id !== 'kitchen');

    // Calculate score for each employee
    const scoredCandidates = eligibleEmployees.map(emp => {
      // 1. Skill & Specialization match
      let skillMatchCount = 0;
      emp.skills.forEach(skill => {
        orderKeywords.forEach(kw => {
          if (kw.includes(skill) || skill.includes(kw)) {
            skillMatchCount++;
          }
        });
      });

      // 2. Workload penalty (orders in progress)
      const currentLoad = activeOrders.filter(o => 
        o.assigned_employee === emp.id && 
        ['Pending', 'Preparing', 'Almost Ready'].includes(o.status)
      ).length;

      // 3. Availability modifier
      let availabilityScore = 0;
      if (emp.status === 'available') availabilityScore = 15;
      else if (emp.status === 'busy') availabilityScore = 2;
      else if (emp.status === 'offline') availabilityScore = -100; // Heavily penalize offline

      // Final composite score
      // High skill match (+25 per match), heavy workload deduction (-12 per active order)
      const totalScore = (skillMatchCount * 25) + availabilityScore - (currentLoad * 12);

      return {
        employee: emp,
        score: totalScore,
        skillMatchCount,
        currentLoad,
        status: emp.status
      };
    });

    // Sort descending by composite score
    scoredCandidates.sort((a, b) => b.score - a.score);

    // Select the best candidate (fallback to Emp1 if all somehow offline)
    const bestCandidate = scoredCandidates[0] || {
      employee: this.employees[0],
      score: 0,
      skillMatchCount: 0,
      currentLoad: 0
    };

    const chosen = bestCandidate.employee;

    const reasons = [
      bestCandidate.skillMatchCount > 0 ? `Specialization match: ${chosen.specialization}` : 'General kitchen availability',
      `Current station load: ${bestCandidate.currentLoad} orders`,
      `Status: ${chosen.status}`
    ];

    return {
      employeeId: chosen.id,
      employeeName: chosen.name,
      specialization: chosen.specialization,
      prepEstimateMinutes: prepMinutes,
      score: bestCandidate.score,
      reasons: reasons.join(' | ')
    };
  }
}

module.exports = new KitchenDispatch();
