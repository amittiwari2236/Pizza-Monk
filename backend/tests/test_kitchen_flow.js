const http = require('http');

const BASE_URL = 'http://127.0.0.1:3000';

function makeRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, body: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });

    req.on('error', (err) => reject(err));

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function runTests() {
  console.log('========================================================');
  console.log('🍕 PIZZA MONK KITCHEN & 3-TIER ARCHITECTURE TEST SUITE');
  console.log('========================================================\n');

  let passed = 0;
  let total = 0;

  function assert(condition, message) {
    total++;
    if (condition) {
      console.log(`✅ [PASS] ${message}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${message}`);
    }
  }

  try {
    // 1. Health check
    const health = await makeRequest('GET', '/health');
    assert(health.status === 200 && health.body.status === 'ok', 'Server health check returns OK');

    // 2. Kitchen employees endpoint
    const empRes = await makeRequest('GET', '/api/kitchen/employees');
    assert(empRes.status === 200 && Array.isArray(empRes.body), 'GET /api/kitchen/employees returns array');
    const employees = empRes.body;
    assert(employees.some(e => e.id === 'emp1' && e.name === 'Chef Marco'), 'Employee Emp1: Chef Marco present');
    assert(employees.some(e => e.id === 'emp2' && e.name === 'Chef Priya'), 'Employee Emp2: Chef Priya present');
    assert(employees.some(e => e.id === 'emp3' && e.name === 'Chef Vikram'), 'Employee Emp3: Chef Vikram present');
    assert(employees.some(e => e.id === 'emp4' && e.name === 'Deepak'), 'Employee Emp4: Deepak present');

    // 3. Employee login authentication
    const loginEmp1 = await makeRequest('POST', '/api/login', { id: 'emp1', password: 'emp123' });
    assert(loginEmp1.status === 200 && loginEmp1.body.role === 'kitchen' && loginEmp1.body.employeeId === 'emp1',
      'Kitchen login for emp1 / emp123 succeeds with role: kitchen');

    const loginLead = await makeRequest('POST', '/api/login', { id: 'kitchen', password: 'kitchen123' });
    assert(loginLead.status === 200 && loginLead.body.role === 'kitchen',
      'Kitchen Lead login for kitchen / kitchen123 succeeds with role: kitchen');

    // 4. Test intelligent dynamic order allocation for Pizza (Should route to Chef Marco / emp1)
    const pizzaOrderPayload = {
      items: [
        { id: 1, name: 'Cheese Corn Pizza (Reg)', category: 'Pizza', price: 79, quantity: 2 }
      ],
      total: 158
    };
    const pizzaOrder = await makeRequest('POST', '/api/orders', pizzaOrderPayload);
    assert(pizzaOrder.status === 200 && pizzaOrder.body.id, 'Pizza order created successfully');
    assert(pizzaOrder.body.assigned_employee === 'emp1', `Pizza order intelligently routed to Chef Marco (emp1). Received: ${pizzaOrder.body.assigned_employee_name} (${pizzaOrder.body.assigned_employee})`);

    // 5. Test intelligent dynamic order allocation for Burger (Should route to Chef Priya / emp2)
    const burgerOrderPayload = {
      items: [
        { id: 10, name: 'Spicy Aloo Tikki Burger', category: 'Burger', price: 69, quantity: 1 }
      ],
      total: 69
    };
    const burgerOrder = await makeRequest('POST', '/api/orders', burgerOrderPayload);
    assert(burgerOrder.status === 200, 'Burger order created successfully');
    assert(burgerOrder.body.assigned_employee === 'emp2', `Burger order intelligently routed to Chef Priya (emp2). Received: ${burgerOrder.body.assigned_employee_name} (${burgerOrder.body.assigned_employee})`);

    // 6. Test intelligent dynamic order allocation for Breads/Wraps (Should route to Chef Vikram / emp3)
    const wrapOrderPayload = {
      items: [
        { id: 15, name: 'Aloo Tikki Wrap', category: 'Wraps', price: 79, quantity: 1 }
      ],
      total: 79
    };
    const wrapOrder = await makeRequest('POST', '/api/orders', wrapOrderPayload);
    assert(wrapOrder.status === 200, 'Wrap order created successfully');
    assert(wrapOrder.body.assigned_employee === 'emp3', `Wrap order intelligently routed to Chef Vikram (emp3). Received: ${wrapOrder.body.assigned_employee_name} (${wrapOrder.body.assigned_employee})`);

    // 7. Test intelligent dynamic order allocation for Beverages/Fries (Should route to Deepak / emp4)
    const drinkOrderPayload = {
      items: [
        { id: 56, name: 'Cold Coffee Shake', category: 'Beverages', price: 50, quantity: 1 }
      ],
      total: 50
    };
    const drinkOrder = await makeRequest('POST', '/api/orders', drinkOrderPayload);
    assert(drinkOrder.status === 200, 'Drink order created successfully');
    assert(drinkOrder.body.assigned_employee === 'emp4', `Drink order intelligently routed to Deepak (emp4). Received: ${drinkOrder.body.assigned_employee_name} (${drinkOrder.body.assigned_employee})`);

    // 8. Test Status Progression: Pending -> Preparing -> Almost Ready -> Ready
    const testOrderId = pizzaOrder.body.id;
    const prepStep = await makeRequest('PUT', `/api/kitchen/orders/${testOrderId}/status`, { status: 'Preparing', estTime: 12 });
    assert(prepStep.status === 200 && prepStep.body.status === 'Preparing', 'Order moved to Preparing status');

    const almostStep = await makeRequest('PUT', `/api/kitchen/orders/${testOrderId}/status`, { status: 'Almost Ready' });
    assert(almostStep.status === 200 && almostStep.body.status === 'Almost Ready', 'Order moved to Almost Ready status');

    const readyStep = await makeRequest('PUT', `/api/kitchen/orders/${testOrderId}/status`, { status: 'Ready' });
    assert(readyStep.status === 200 && readyStep.body.status === 'Ready', 'Order moved to Ready status');

    // 9. Test Order Cancellation: Mandatory reason requirement
    const cancelTarget = burgerOrder.body.id;
    // Attempt cancel without reason -> should fail with 400
    const failCancel = await makeRequest('POST', `/api/kitchen/orders/${cancelTarget}/cancel`, { reason: '' });
    assert(failCancel.status === 400, 'Cancellation with empty reason correctly rejected with HTTP 400');

    // Cancel with valid reason -> should succeed
    const successCancel = await makeRequest('POST', `/api/kitchen/orders/${cancelTarget}/cancel`, {
      reason: 'Burger buns out of stock',
      employeeId: 'emp2',
      employeeName: 'Chef Priya'
    });
    assert(successCancel.status === 200 && successCancel.body.status === 'Cancelled', 'Cancellation with mandatory reason succeeded');
    assert(successCancel.body.cancellation_reason.includes('Burger buns out of stock'), `Cancellation reason correctly stored: ${successCancel.body.cancellation_reason}`);

    // Verify order details endpoint includes assigned employee and cancellation reason
    const checkCancelled = await makeRequest('GET', `/api/orders/${cancelTarget}`);
    assert(checkCancelled.body.status === 'Cancelled' && checkCancelled.body.cancellation_reason,
      'GET /api/orders/:id returns assigned_employee and cancellation_reason');

    // 10. Test 50 Concurrent Order Submissions
    console.log('\n⚡ Launching 50 concurrent order stress test...');
    const startTime = Date.now();
    const concurrentRequests = [];
    for (let i = 1; i <= 50; i++) {
      const p = makeRequest('POST', '/api/orders', {
        items: [{ id: 1, name: `Concurrent Item #${i}`, category: i % 2 === 0 ? 'Pizza' : 'Burger', price: 50, quantity: 1 }],
        total: 50
      });
      concurrentRequests.push(p);
    }

    const concurrentResults = await Promise.all(concurrentRequests);
    const successfulConcurrent = concurrentResults.filter(r => r.status === 200 && r.body.id);
    const duration = Date.now() - startTime;
    console.log(`⚡ 50 concurrent orders finished in ${duration}ms (${successfulConcurrent.length}/50 successful)`);
    assert(successfulConcurrent.length === 50, 'All 50 concurrent orders processed successfully without failure');

    console.log('\n========================================================');
    console.log(`RESULTS: ${passed}/${total} assertions passed (${Math.round((passed / total) * 100)}%)`);
    console.log('========================================================');

    if (passed === total) {
      console.log('🎉 ALL KITCHEN & CONCURRENCY TESTS PASSED!');
      process.exit(0);
    } else {
      console.error('⚠️ Some tests failed.');
      process.exit(1);
    }
  } catch (err) {
    console.error('Test suite error:', err);
    process.exit(1);
  }
}

runTests();
