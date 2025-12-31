/**
 * Background Service Worker for TikTok Order Unmasker
 *
 * Handles:
 * - External messages from web app (Processed.jsx)
 * - Internal messages from popup
 * - Supabase communication
 * - Order processing loop
 */

// Supabase configuration
const SUPABASE_URL = 'https://rfvocvjwlxpiaxbciqnn.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJmdm9jdmp3bHhwaWF4YmNpcW5uIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjI4Njk4OCwiZXhwIjoyMDgxODYyOTg4fQ.Y2EjxYd9F6KnfSSnCPuDJZJTEdTkpgRU8_mLEP9sqgM';

// State
let state = {
  isRunning: false,
  shouldStop: false,
  currentTabId: null,
  credentialId: null,
  email: null,
  processed: 0,
  total: 0,
  success: 0,
  failed: 0,
  orders: [],
  currentOrderIndex: 0,
  externalPort: null  // For web app communication
};

// Listen for EXTERNAL messages from web app
chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  console.log('[Background] External message from:', sender.origin, message.type);

  switch (message.type) {
    case 'PING':
      // Web app checking if extension is installed
      sendResponse({ type: 'PONG', success: true, version: '1.0.0' });
      return false;

    case 'START_UNMASK':
      handleStartFromWebApp(message, sender).then(sendResponse);
      return true;

    case 'STOP_UNMASK':
      handleStop();
      sendResponse({ stopped: true });
      return false;

    case 'GET_STATUS':
      sendResponse({
        isRunning: state.isRunning,
        processed: state.processed,
        total: state.total,
        success: state.success,
        failed: state.failed
      });
      return false;
  }
});

// Listen for INTERNAL messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[Background] Internal message:', message.type);

  switch (message.type) {
    case 'START_UNMASK':
      handleStartFromPopup(message).then(sendResponse);
      return true;

    case 'STOP_UNMASK':
      handleStop();
      sendResponse({ stopped: true });
      return false;

    case 'GET_STATUS':
      sendResponse({
        isRunning: state.isRunning,
        processed: state.processed,
        total: state.total,
        success: state.success,
        failed: state.failed
      });
      return false;
  }
});

// Listen for long-lived connections from web app
chrome.runtime.onConnectExternal.addListener((port) => {
  console.log('[Background] External port connected:', port.name);
  state.externalPort = port;

  // Send initial status to confirm connection
  port.postMessage({
    type: 'CONNECTED',
    isRunning: state.isRunning,
    processed: state.processed,
    total: state.total
  });

  port.onMessage.addListener((message) => {
    console.log('[Background] Port message:', message.type);

    if (message.type === 'START_UNMASK') {
      handleStartFromWebApp(message, { origin: port.sender?.origin });
    } else if (message.type === 'STOP_UNMASK') {
      handleStop();
    }
  });

  port.onDisconnect.addListener(() => {
    console.log('[Background] External port disconnected');
    state.externalPort = null;
  });
});

// Listen for tab updates (for navigation)
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (tabId === state.currentTabId && changeInfo.status === 'complete' && state.isRunning) {
    console.log('[Background] Tab loaded:', tab.url);
    // Continue processing after navigation
    setTimeout(() => {
      if (state.isRunning && !state.shouldStop) {
        processCurrentOrder();
      }
    }, 2000);
  }
});

/**
 * Handle start from web app
 */
async function handleStartFromWebApp(message, sender) {
  const { orderIds } = message;

  if (state.isRunning) {
    return { error: 'Already running' };
  }

  if (!orderIds || orderIds.length === 0) {
    return { error: 'No order IDs provided' };
  }

  // Reset state
  state = {
    isRunning: true,
    shouldStop: false,
    currentTabId: null,
    credentialId: null,
    email: null,
    processed: 0,
    total: 0,
    success: 0,
    failed: 0,
    orders: [],
    currentOrderIndex: 0,
    externalPort: state.externalPort
  };

  try {
    // Use provided order IDs directly
    const orders = orderIds.map(id => ({ order_id: id }));

    state.orders = orders;
    state.total = orders.length;

    broadcastStatus({
      type: 'STATUS',
      status: 'running',
      message: `Processing ${orders.length} orders...`,
      total: orders.length
    });

    // Open TikTok Seller Center in a new tab
    const tab = await chrome.tabs.create({
      url: 'https://seller-my.tiktok.com/order',
      active: true
    });
    state.currentTabId = tab.id;

    // Wait for tab to load, then start processing
    setTimeout(() => {
      processNextOrder();
    }, 3000);

    return { success: true, total: orders.length };

  } catch (error) {
    console.error('[Background] Start error:', error);
    state.isRunning = false;
    broadcastStatus({ type: 'ERROR', message: error.message });
    return { error: error.message };
  }
}

/**
 * Handle start from popup (existing functionality)
 */
async function handleStartFromPopup(message) {
  const { email, tabId } = message;

  if (state.isRunning) {
    return { error: 'Already running' };
  }

  // Reset state
  state = {
    isRunning: true,
    shouldStop: false,
    currentTabId: tabId,
    credentialId: null,
    email: email,
    processed: 0,
    total: 0,
    success: 0,
    failed: 0,
    orders: [],
    currentOrderIndex: 0,
    externalPort: null
  };

  try {
    broadcastStatus({ type: 'STATUS', status: 'connecting', message: 'Logging in...' });

    const credential = await getCredentialByEmail(email);
    if (!credential) {
      state.isRunning = false;
      return { error: 'Email not found. Please check your email.' };
    }

    state.credentialId = credential.id;
    broadcastStatus({
      type: 'LOGIN_SUCCESS',
      email: email,
      shopName: credential.shop_name
    });

    broadcastStatus({ type: 'STATUS', status: 'connecting', message: 'Fetching orders...' });

    const orders = await getMaskedOrders(credential.id);
    if (orders.length === 0) {
      state.isRunning = false;
      broadcastStatus({ type: 'COMPLETE', message: 'No orders need unmasking!', processed: 0, total: 0, success: 0, failed: 0 });
      return { success: true, message: 'No orders to process' };
    }

    state.orders = orders;
    state.total = orders.length;
    state.currentOrderIndex = 0;

    broadcastStatus({
      type: 'STATUS',
      status: 'running',
      message: `Found ${orders.length} orders to unmask`,
      total: orders.length
    });

    processNextOrder();

    return { success: true };

  } catch (error) {
    console.error('[Background] Start error:', error);
    state.isRunning = false;
    return { error: error.message };
  }
}

/**
 * Handle stop request
 */
function handleStop() {
  state.shouldStop = true;
  state.isRunning = false;

  broadcastStatus({
    type: 'STOPPED',
    processed: state.processed,
    total: state.total,
    success: state.success,
    failed: state.failed
  });

  // Tell content script to stop
  if (state.currentTabId) {
    chrome.tabs.sendMessage(state.currentTabId, { type: 'STOP' }).catch(() => {});
  }
}

/**
 * Process next order in the queue
 */
async function processNextOrder() {
  if (state.shouldStop || !state.isRunning) {
    return;
  }

  if (state.currentOrderIndex >= state.orders.length) {
    // All done
    state.isRunning = false;
    broadcastStatus({
      type: 'COMPLETE',
      message: 'All orders processed!',
      processed: state.processed,
      total: state.total,
      success: state.success,
      failed: state.failed
    });
    return;
  }

  const order = state.orders[state.currentOrderIndex];
  const orderId = order.order_id;
  const orderIdShort = orderId.slice(-8);

  broadcastStatus({
    type: 'PROCESSING',
    orderId: orderId,
    orderIdShort: orderIdShort,
    index: state.currentOrderIndex + 1,
    total: state.total,
    processed: state.processed,
    success: state.success,
    failed: state.failed
  });

  // Navigate to order detail page
  const url = `https://seller-my.tiktok.com/order/detail?order_no=${orderId}&shop_region=MY`;

  try {
    await chrome.tabs.update(state.currentTabId, { url: url });
    // Tab update listener will call processCurrentOrder when page loads
  } catch (error) {
    console.error('[Background] Navigation error:', error);
    handleOrderFailure(orderId, orderIdShort, 'Navigation failed');
  }
}

/**
 * Process the current order (after page load)
 */
async function processCurrentOrder() {
  if (state.shouldStop || !state.isRunning) return;
  if (state.currentOrderIndex >= state.orders.length) return;

  const order = state.orders[state.currentOrderIndex];
  const orderId = order.order_id;
  const orderIdShort = orderId.slice(-8);

  try {
    // Wait a bit for page to fully render
    await sleep(2000);

    // Check if page is valid
    const pageCheck = await sendToContentScript({ type: 'CHECK_PAGE' });

    if (!pageCheck.isLoggedIn) {
      throw new Error('Not logged in to TikTok. Please log in and try again.');
    }

    // Extract customer data (content script will click reveal buttons)
    const customerData = await sendToContentScript({ type: 'EXTRACT_DATA' });

    if (!customerData.hasData) {
      throw new Error('Could not extract customer data');
    }

    if (customerData.isMasked) {
      throw new Error('Data still masked - reveal may have failed');
    }

    // Update in Supabase
    const updated = await updateOrderInSupabase(orderId, customerData);

    if (updated) {
      state.success++;
      broadcastStatus({
        type: 'ORDER_SUCCESS',
        orderId: orderId,
        orderIdShort: orderIdShort,
        name: customerData.name,
        phone: customerData.phone_number,
        address: customerData.full_address?.substring(0, 40) + '...',
        processed: state.processed + 1,
        total: state.total,
        success: state.success,
        failed: state.failed
      });
    } else {
      throw new Error('Failed to save to database');
    }

  } catch (error) {
    console.error(`[Background] Order ${orderIdShort} error:`, error);
    handleOrderFailure(orderId, orderIdShort, error.message);
  }

  state.processed++;
  state.currentOrderIndex++;

  // Random delay before next order (human-like)
  const delay = 2000 + Math.random() * 3000;
  setTimeout(() => processNextOrder(), delay);
}

/**
 * Handle order failure
 */
function handleOrderFailure(orderId, orderIdShort, reason) {
  state.failed++;
  state.processed++;
  state.currentOrderIndex++;

  broadcastStatus({
    type: 'ORDER_FAILED',
    orderId: orderId,
    orderIdShort: orderIdShort,
    reason: reason,
    processed: state.processed,
    total: state.total,
    success: state.success,
    failed: state.failed
  });

  // Continue with next order
  setTimeout(() => processNextOrder(), 1000);
}

/**
 * Send message to content script
 */
function sendToContentScript(message) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(state.currentTabId, message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(response);
      }
    });
  });
}

/**
 * Broadcast status to popup and external web app
 */
function broadcastStatus(message) {
  // Send to popup
  chrome.runtime.sendMessage(message).catch(() => {
    // Popup might be closed, ignore
  });

  // Send to web app via port if connected
  if (state.externalPort) {
    try {
      state.externalPort.postMessage(message);
    } catch (e) {
      // Port might be disconnected
      state.externalPort = null;
    }
  }
}

/**
 * Get credential by email from Supabase
 */
async function getCredentialByEmail(email) {
  // First find user by email
  const userResponse = await fetch(
    `${SUPABASE_URL}/rest/v1/users?email=eq.${encodeURIComponent(email)}&select=id`,
    {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`
      }
    }
  );

  const users = await userResponse.json();
  if (!users || users.length === 0) {
    return null;
  }

  const userId = users[0].id;

  // Then find credentials by user_id
  const credResponse = await fetch(
    `${SUPABASE_URL}/rest/v1/credentials?user_id=eq.${userId}&select=id,shop_name`,
    {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`
      }
    }
  );

  const credentials = await credResponse.json();
  if (!credentials || credentials.length === 0) {
    return null;
  }

  return credentials[0];
}

/**
 * Get masked orders from Supabase
 */
async function getMaskedOrders(credentialId) {
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/orders?credential_id=eq.${credentialId}&select=*`,
    {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`
      }
    }
  );

  const orders = await response.json();

  // Filter for masked orders with shipped status
  return orders.filter(order => {
    const orderData = order.order_data;
    if (!orderData || !orderData.recipient_address) return false;

    // Must be shipped status
    const isShippedStatus = ['AWAITING_COLLECTION', 'IN_TRANSIT', 'DELIVERED'].includes(orderData.status);
    if (!isShippedStatus) return false;

    // Check if already unmasked
    if (order.is_unmasked) return false;

    const { name, phone_number, full_address } = orderData.recipient_address;

    // Check if any field is masked
    const hasMasked = (
      !name || name.includes('***') ||
      !phone_number || phone_number.includes('***') ||
      !full_address || full_address.includes('***')
    );

    return hasMasked;
  });
}

/**
 * Update order in Supabase with unmasked data
 */
async function updateOrderInSupabase(orderId, customerData) {
  // First get existing order
  const getResponse = await fetch(
    `${SUPABASE_URL}/rest/v1/orders?order_id=eq.${orderId}&select=order_data`,
    {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`
      }
    }
  );

  const orders = await getResponse.json();
  if (!orders || orders.length === 0) {
    return false;
  }

  const existingOrderData = orders[0].order_data;

  // Update recipient_address
  const updatedOrderData = {
    ...existingOrderData,
    recipient_address: {
      ...existingOrderData.recipient_address,
      name: customerData.name || existingOrderData.recipient_address?.name,
      phone_number: customerData.phone_number || existingOrderData.recipient_address?.phone_number,
      full_address: customerData.full_address || existingOrderData.recipient_address?.full_address
    }
  };

  // Check if fully unmasked
  const finalName = updatedOrderData.recipient_address.name;
  const finalPhone = updatedOrderData.recipient_address.phone_number;
  const finalAddress = updatedOrderData.recipient_address.full_address;

  const isUnmasked = (
    finalName && !finalName.includes('***') &&
    finalPhone && !finalPhone.includes('***') &&
    finalAddress && !finalAddress.includes('***')
  );

  // Update order
  const updateResponse = await fetch(
    `${SUPABASE_URL}/rest/v1/orders?order_id=eq.${orderId}`,
    {
      method: 'PATCH',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({
        customer_name: finalName,
        customer_phone: finalPhone,
        customer_address: finalAddress,
        order_data: updatedOrderData,
        is_unmasked: isUnmasked
      })
    }
  );

  return updateResponse.ok;
}

/**
 * Sleep utility
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Log service worker start
console.log('[TikTok Unmasker] Background service worker started');
