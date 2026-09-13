/**
 * Pizza Monk Dynamic Order ETA & Preparation Intelligence Engine
 * 
 * Accurately models and calculates live dynamic preparation times using:
 *  1. Item base preparation times and parallel cooking aggregation
 *  2. Specific assigned employee queue backlog (parallel station throughput)
 *  3. Current kitchen capacity and employee availability (Available vs Busy vs Break)
 *  4. Employee specialization efficiency factor
 *  5. Historical actual-vs-estimated learning ratio
 *  6. Dynamically computed Safety Buffer (baseline 5 min, auto-scales with rush and delays)
 *  7. Real-time active preparation progress and delay detection
 */

class EtaEngine {
  constructor() {
    // Base preparation times per category in minutes
    this.baseTimes = {
      'pizza': 13,
      'pasta': 10,
      'burger': 8,
      'sandwich': 6,
      'breads': 7,
      'wraps': 7,
      'french fries': 5,
      'beverages': 3,
      'packet': 2,
      'default': 7
    };
  }

  /**
   * Determine single item base prep time
   */
  getItemBaseTime(item) {
    const name = (item.name || '').toLowerCase();
    const cat = (item.category || '').toLowerCase();
    const itemType = (item.item_type || item.itemType || '').toLowerCase();

    if (itemType === 'packet') return this.baseTimes.packet;

    for (const [key, minutes] of Object.entries(this.baseTimes)) {
      if (cat.includes(key) || name.includes(key)) {
        return minutes;
      }
    }
    return this.baseTimes.default;
  }

  /**
   * Aggregate multi-item order base prep time considering parallel cooking
   * In a commercial kitchen, items cook concurrently across stations/burners.
   * Total base prep = slowest item + small incremental pipeline factor for additional items.
   */
  calculateItemsPrepTime(items = []) {
    if (!Array.isArray(items) || items.length === 0) {
      return { maxBasePrep: 5, totalItemsCount: 0, distinctCategories: 0, isPacketOnly: false };
    }

    let maxBasePrep = 0;
    let totalItemsCount = 0;
    const categoriesSet = new Set();
    let packetCount = 0;

    for (const item of items) {
      const qty = parseInt(item.quantity, 10) || 1;
      totalItemsCount += qty;
      const baseTime = this.getItemBaseTime(item);
      if (baseTime > maxBasePrep) {
        maxBasePrep = baseTime;
      }

      const cat = (item.category || 'general').toLowerCase();
      categoriesSet.add(cat);

      const itemType = (item.item_type || item.itemType || '').toLowerCase();
      if (itemType === 'packet' || baseTime <= 3) {
        packetCount += qty;
      }
    }

    // Additional items add slight pipelining delta (1.2m per additional dish, capped at +6m)
    const additionalQuantity = Math.max(0, totalItemsCount - 1);
    const pipelineDelta = Math.min(6, additionalQuantity * 1.2);
    const totalItemPrep = Math.round(maxBasePrep + pipelineDelta);

    const isPacketOnly = packetCount === totalItemsCount;

    return {
      rawItemPrepTime: isPacketOnly ? Math.max(2, totalItemsCount * 1.5) : Math.max(4, totalItemPrep),
      maxBasePrep,
      totalItemsCount,
      distinctCategories: categoriesSet.size,
      isPacketOnly
    };
  }

  /**
   * Compute employee specialization efficiency factor
   */
  getSpecializationFactor(employee, items = []) {
    if (!employee || !employee.skills) return 1.0;

    const orderKeywords = [];
    items.forEach(it => {
      if (it.name) orderKeywords.push(...it.name.toLowerCase().split(/\s+/));
      if (it.category) orderKeywords.push(it.category.toLowerCase());
    });

    let matchCount = 0;
    (employee.skills || []).forEach(skill => {
      orderKeywords.forEach(kw => {
        if (kw.includes(skill) || skill.includes(kw)) {
          matchCount++;
        }
      });
    });

    // If strong specialization match: 10% faster (0.90)
    if (matchCount >= 2) return 0.90;
    if (matchCount === 1) return 0.95;
    // Non-specialized: 1.10
    return 1.10;
  }

  /**
   * Analyze remaining workload of orders ahead at this specific employee's station
   * Because chefs work in parallel, orders at other stations don't block this station!
   */
  calculateStationQueueWorkload(assignedEmployeeId, allLiveOrders = []) {
    const stationOrders = allLiveOrders.filter(o => 
      o.assigned_employee === assignedEmployeeId && 
      ['Pending', 'Preparing', 'Almost Ready'].includes(o.status)
    );

    let remainingMinutes = 0;
    const now = Date.now();

    for (const order of stationOrders) {
      if (order.status === 'Preparing') {
        const startedAt = order.started_preparing_at ? new Date(order.started_preparing_at).getTime() : new Date(order.placed_at).getTime();
        const elapsedMins = Math.max(0, (now - startedAt) / 60000);
        const estTotal = order.est_ready_in || 10;
        const orderRemaining = Math.max(1.5, estTotal - elapsedMins);
        remainingMinutes += orderRemaining;
      } else if (order.status === 'Almost Ready') {
        remainingMinutes += 2.0; // Plating / wrapping phase
      } else if (order.status === 'Pending') {
        // Pending order queued ahead
        remainingMinutes += (order.est_ready_in ? Math.min(order.est_ready_in, 8) : 6);
      }
    }

    return {
      stationQueueOrdersCount: stationOrders.length,
      stationQueueRemainingMinutes: Math.round(remainingMinutes)
    };
  }

  /**
   * Compute historical learning ratio comparing actual vs estimated prep times
   */
  calculateHistoricalLearningRatio(completedOrders = []) {
    if (!Array.isArray(completedOrders) || completedOrders.length === 0) {
      return { learningRatio: 1.0, completedCount: 0, delayFrequency: 0 };
    }

    const validCompleted = completedOrders.filter(o => 
      (o.status === 'Ready' || o.status === 'Received') && 
      (o.actual_prep_minutes > 0 || (o.ready_at && o.placed_at))
    );

    if (validCompleted.length === 0) {
      return { learningRatio: 1.0, completedCount: 0, delayFrequency: 0 };
    }

    let totalRatio = 0;
    let delayedCount = 0;

    validCompleted.forEach(o => {
      let actualMins = o.actual_prep_minutes;
      if (!actualMins && o.ready_at && o.placed_at) {
        actualMins = Math.max(1, (new Date(o.ready_at).getTime() - new Date(o.placed_at).getTime()) / 60000);
      }

      const estimatedMins = o.est_ready_in || 10;
      const ratio = actualMins / estimatedMins;
      totalRatio += ratio;

      if (actualMins > estimatedMins + 1.0) {
        delayedCount++;
      }
    });

    const avgRatio = totalRatio / validCompleted.length;
    // Clamp learning ratio between 0.85 (very efficient) and 1.30 (kitchen running slow)
    const learningRatio = Math.max(0.85, Math.min(1.30, avgRatio));
    const delayFrequency = delayedCount / validCompleted.length;

    return {
      learningRatio: parseFloat(learningRatio.toFixed(2)),
      completedCount: validCompleted.length,
      delayFrequency: parseFloat(delayFrequency.toFixed(2))
    };
  }

  /**
   * Dynamically Calculate the Safety Buffer
   * Baseline: 5 minutes.
   * Auto-adjusts based on:
   *  - Kitchen queue surge (orders per active chef)
   *  - Historical delay frequency
   *  - Item complexity
   *  - Admin manual override (if set)
   */
  calculateDynamicSafetyBuffer(activeOrdersCount, activeStaffCount, delayFrequency, distinctCategories, isPacketOnly, settings = {}) {
    // Check for optional manual admin override
    if (settings && settings.manualBufferOverride && typeof settings.manualBufferMinutes === 'number') {
      return Math.max(1, Math.min(20, settings.manualBufferMinutes));
    }

    let buffer = 5.0; // Baseline safety buffer

    // 1. Kitchen Load / Rush Surge Factor
    const staffCount = Math.max(1, activeStaffCount);
    const rushRatio = activeOrdersCount / staffCount;

    if (rushRatio > 3.0) {
      // High workload: buffer increases
      buffer += Math.min(4.0, (rushRatio - 3.0) * 1.5);
    } else if (rushRatio < 1.0) {
      // Low workload / fast throughput: buffer decreases
      buffer -= 1.5;
    }

    // 2. Historical Delay Frequency
    if (delayFrequency > 0.35) {
      // Frequent delays: increase buffer to protect user expectations
      buffer += 2.5;
    } else if (delayFrequency > 0.15) {
      buffer += 1.0;
    } else if (delayFrequency === 0 && activeOrdersCount < 3) {
      buffer -= 1.0;
    }

    // 3. Item Complexity
    if (isPacketOnly) {
      buffer -= 2.5; // Ready packet items need negligible cooking buffer
    } else if (distinctCategories >= 3) {
      buffer += 1.5; // Diverse multi-station preparation adds coordination variance
    }

    // Dynamic buffer boundary: clamped between 2.0 and 12.0 minutes
    return parseFloat(Math.max(2.0, Math.min(12.0, buffer)).toFixed(1));
  }

  /**
   * Main Calculation: Predict complete order ETA for a newly placed or incoming order
   */
  calculateOrderEta({
    items = [],
    assignedEmployee,
    allLiveOrders = [],
    completedOrders = [],
    activeEmployees = [],
    settings = {}
  }) {
    const itemAnalysis = this.calculateItemsPrepTime(items);
    const specFactor = this.getSpecializationFactor(assignedEmployee, items);
    
    // Parallel station queue backlog
    const employeeId = assignedEmployee ? assignedEmployee.id : null;
    const stationQueue = this.calculateStationQueueWorkload(employeeId, allLiveOrders);

    // Active staff capacity
    const activeStaff = activeEmployees.filter(e => e.status !== 'offline');
    const activeStaffCount = activeStaff.length || 3;

    // Historical learning ratio & delay rate
    const historical = this.calculateHistoricalLearningRatio(completedOrders);

    // Compute dynamic safety buffer
    const safetyBuffer = this.calculateDynamicSafetyBuffer(
      allLiveOrders.length,
      activeStaffCount,
      historical.delayFrequency,
      itemAnalysis.distinctCategories,
      itemAnalysis.isPacketOnly,
      settings
    );

    // Compute base cooking duration scaled by specialization & historical learning
    const effectivePrepTime = itemAnalysis.rawItemPrepTime * specFactor * historical.learningRatio;

    // Total ETA = Station queue wait time + Pure item prep time + Dynamic Safety Buffer
    const calculatedTotalMinutes = stationQueue.stationQueueRemainingMinutes + effectivePrepTime + safetyBuffer;
    const finalEtaMinutes = Math.max(itemAnalysis.isPacketOnly ? 3 : 5, Math.round(calculatedTotalMinutes));

    const estimatedReadyAt = new Date(Date.now() + finalEtaMinutes * 60000).toISOString();

    const reasons = [
      `Item base prep: ${Math.round(itemAnalysis.rawItemPrepTime)}m`,
      stationQueue.stationQueueOrdersCount > 0 ? `Station backlog: +${stationQueue.stationQueueRemainingMinutes}m (${stationQueue.stationQueueOrdersCount} orders)` : 'Station clear (parallel cook)',
      specFactor < 1.0 ? 'Chef specialty boost (-10%)' : 'Standard station routing',
      `Dynamic safety buffer: +${safetyBuffer}m (Kitchen load: ${allLiveOrders.length} orders)`
    ];

    return {
      estReadyIn: finalEtaMinutes,
      estimatedReadyAt,
      rawItemPrepTime: Math.round(itemAnalysis.rawItemPrepTime),
      stationWaitTime: stationQueue.stationQueueRemainingMinutes,
      safetyBufferMinutes: safetyBuffer,
      learningRatio: historical.learningRatio,
      delayFrequency: historical.delayFrequency,
      reasons: reasons.join(' | ')
    };
  }

  /**
   * Recalculate remaining ETA and detect delays for existing active orders
   */
  recalculateOrderRemainingEta(order, allLiveOrders = [], completedOrders = [], activeEmployees = [], settings = {}) {
    if (!order || ['Ready', 'Received', 'Cancelled'].includes(order.status)) {
      return {
        remainingMinutes: 0,
        isDelayed: false,
        delayMinutes: 0,
        status: order ? order.status : 'Ready'
      };
    }

    const now = Date.now();
    const placedAtTime = order.placed_at ? new Date(order.placed_at).getTime() : now;
    const elapsedSincePlaced = Math.max(0, (now - placedAtTime) / 60000);
    const originalEta = order.est_ready_in || 10;

    // Check if order has exceeded its estimated preparation time
    const isDelayed = elapsedSincePlaced > originalEta;
    const delayMinutes = isDelayed ? Math.round(elapsedSincePlaced - originalEta) : 0;

    let remainingMinutes = 1;

    if (order.status === 'Pending') {
      // Re-evaluate queue
      const items = order.items || order.order_items || [];
      const recalc = this.calculateOrderEta({
        items,
        assignedEmployee: { id: order.assigned_employee },
        allLiveOrders,
        completedOrders,
        activeEmployees,
        settings
      });
      remainingMinutes = Math.max(2, recalc.estReadyIn - Math.round(elapsedSincePlaced));
    } else if (order.status === 'Preparing') {
      // Order is actively being cooked
      const startedAt = order.started_preparing_at ? new Date(order.started_preparing_at).getTime() : placedAtTime;
      const elapsedPrep = Math.max(0, (now - startedAt) / 60000);
      const itemsBase = this.calculateItemsPrepTime(order.items || order.order_items || []).rawItemPrepTime;
      
      if (isDelayed) {
        // Delayed order: provide immediate revised completion window (2-4 min)
        remainingMinutes = Math.max(2, Math.min(5, Math.round(itemsBase - elapsedPrep + 2)));
      } else {
        remainingMinutes = Math.max(1, Math.round(originalEta - elapsedSincePlaced));
      }
    } else if (order.status === 'Almost Ready') {
      // In plating/finishing step
      remainingMinutes = 2;
    }

    // Dynamic buffer adjustments under delay
    const dynamicBuffer = isDelayed ? Math.min(12, 6.0 + delayMinutes * 0.5) : 5.0;

    return {
      remainingMinutes: Math.max(1, Math.round(remainingMinutes)),
      isDelayed,
      delayMinutes,
      elapsedMinutes: Math.round(elapsedSincePlaced),
      dynamicBufferMinutes: parseFloat(dynamicBuffer.toFixed(1))
    };
  }
}

module.exports = new EtaEngine();
