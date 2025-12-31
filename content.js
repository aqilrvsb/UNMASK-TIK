/**
 * Content Script for TikTok Order Unmasker
 *
 * This script runs on TikTok Seller Center pages and handles:
 * - Clicking reveal buttons to unmask customer data
 * - Extracting customer information from the page
 * - Navigating between order pages
 */

// Configuration
const CONFIG = {
  selectors: {
    // Reveal button selectors (multiple options for different TikTok versions)
    revealButtons: [
      '[data-log_click_for="open_phone_plaintext"]',
      'button[class*="reveal"]',
      '[class*="unmask"]',
      '[class*="show-phone"]',
      '[class*="view-detail"]'
    ],
    // Shipping section selectors
    shippingSection: [
      '[class*="shipping-to"]',
      '[class*="recipient"]',
      '[class*="address-info"]',
      '[class*="buyer-info"]',
      '.index-shipping-to'
    ],
    // Order detail page indicator
    orderDetailPage: '[class*="order-detail"]',
    // Name field
    nameField: '[class*="recipient-name"], [class*="buyer-name"]',
    // Phone field
    phoneField: '[class*="phone"], [class*="mobile"]',
    // Address field
    addressField: '[class*="address"], [class*="location"]'
  },
  timing: {
    waitAfterClick: 2000,
    waitForPageLoad: 3000,
    delayBetweenOrders: 2000
  }
};

// State
let isRunning = false;
let shouldStop = false;

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[Content] Received message:', message.type);

  switch (message.type) {
    case 'EXTRACT_DATA':
      extractCustomerData().then(data => {
        sendResponse(data);
      });
      return true; // Keep channel open for async response

    case 'CLICK_REVEAL':
      clickRevealButtons().then(result => {
        sendResponse(result);
      });
      return true;

    case 'NAVIGATE_TO_ORDER':
      navigateToOrder(message.orderId).then(result => {
        sendResponse(result);
      });
      return true;

    case 'CHECK_PAGE':
      sendResponse({
        isOrderDetail: isOrderDetailPage(),
        url: window.location.href,
        isLoggedIn: !isLoginPage()
      });
      return false;

    case 'STOP':
      shouldStop = true;
      isRunning = false;
      sendResponse({ stopped: true });
      return false;
  }
});

/**
 * Check if current page is the order detail page
 */
function isOrderDetailPage() {
  return CONFIG.selectors.orderDetailPage.some(selector => {
    return document.querySelector(selector) !== null;
  }) || window.location.href.includes('order/detail');
}

/**
 * Check if current page is login page
 */
function isLoginPage() {
  const url = window.location.href.toLowerCase();
  return url.includes('login') || url.includes('signin') || url.includes('passport');
}

/**
 * Navigate to a specific order detail page
 */
async function navigateToOrder(orderId) {
  const url = `https://seller-my.tiktok.com/order/detail?order_no=${orderId}&shop_region=MY`;

  // Navigate to the order
  window.location.href = url;

  // Wait for navigation to complete
  return new Promise((resolve) => {
    // The page will reload, so this promise won't resolve
    // Background script should handle this with tab update listener
    setTimeout(() => resolve({ navigating: true }), 100);
  });
}

/**
 * Wait for element to appear
 */
function waitForElement(selectors, timeout = 10000) {
  return new Promise((resolve) => {
    const startTime = Date.now();

    const check = () => {
      // Try each selector
      for (const selector of selectors) {
        const element = document.querySelector(selector);
        if (element) {
          resolve(element);
          return;
        }
      }

      // Timeout check
      if (Date.now() - startTime > timeout) {
        resolve(null);
        return;
      }

      // Keep checking
      requestAnimationFrame(check);
    };

    check();
  });
}

/**
 * Click all reveal buttons on the page
 */
async function clickRevealButtons() {
  let clickedCount = 0;
  const results = [];

  // Try each reveal button selector
  for (const selector of CONFIG.selectors.revealButtons) {
    const buttons = document.querySelectorAll(selector);

    for (const button of buttons) {
      try {
        // Check if button is visible and clickable
        const rect = button.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          // Simulate human-like click
          button.click();
          clickedCount++;
          results.push({ selector, success: true });

          // Small delay between clicks
          await sleep(300 + Math.random() * 200);
        }
      } catch (e) {
        results.push({ selector, success: false, error: e.message });
      }
    }
  }

  // Also try clicking any element with "reveal" or "show" text
  const allButtons = document.querySelectorAll('button, [role="button"], a');
  for (const btn of allButtons) {
    const text = btn.textContent?.toLowerCase() || '';
    if ((text.includes('reveal') || text.includes('show') || text.includes('view')) &&
        text.length < 30) {
      try {
        const rect = btn.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          btn.click();
          clickedCount++;
          await sleep(300);
        }
      } catch (e) {
        // Ignore
      }
    }
  }

  // Wait for data to load after clicking
  if (clickedCount > 0) {
    await sleep(CONFIG.timing.waitAfterClick);
  }

  return { clickedCount, results };
}

/**
 * Extract customer data from the page
 */
async function extractCustomerData() {
  // First, click reveal buttons
  await clickRevealButtons();

  // Wait a bit for data to appear
  await sleep(1000);

  // Try to find shipping/recipient section
  let shippingSection = null;
  for (const selector of CONFIG.selectors.shippingSection) {
    shippingSection = document.querySelector(selector);
    if (shippingSection) break;
  }

  // Extract data
  const data = {
    name: null,
    phone_number: null,
    full_address: null,
    raw_texts: []
  };

  // Method 1: Try specific selectors
  const nameEl = document.querySelector('[class*="recipient-name"], [class*="buyer-name"]');
  const phoneEl = document.querySelector('[class*="phone-number"], [class*="mobile"]');
  const addressEl = document.querySelector('[class*="full-address"], [class*="delivery-address"]');

  if (nameEl) data.name = cleanText(nameEl.textContent);
  if (phoneEl) data.phone_number = cleanText(phoneEl.textContent);
  if (addressEl) data.full_address = cleanText(addressEl.textContent);

  // Method 2: Search in shipping section
  if (shippingSection) {
    const textElements = shippingSection.querySelectorAll('span, div, p');
    const texts = [];

    for (const el of textElements) {
      const text = cleanText(el.textContent);
      if (text && text.length > 0 && !text.includes('***')) {
        texts.push(text);
      }
    }

    data.raw_texts = texts.slice(0, 10);

    // Parse texts to identify name, phone, address
    for (const text of texts) {
      // Phone detection: starts with + or has 8+ digits
      if (!data.phone_number && /^[\+]?[\d\s\-]{8,}$/.test(text.replace(/\s/g, ''))) {
        data.phone_number = text;
      }
      // Address detection: long text or contains address keywords
      else if (!data.full_address && (text.length > 30 || /\d{5}|jalan|lorong|taman|blok|unit|no\.|floor/i.test(text))) {
        data.full_address = text;
      }
      // Name detection: shorter text without many numbers
      else if (!data.name && text.length < 50 && text.length > 2 && !/\d{3,}/.test(text)) {
        data.name = text;
      }
    }
  }

  // Method 3: Look for any unmasked text in the page
  if (!data.name || !data.phone_number || !data.full_address) {
    const pageText = document.body.innerText;

    // Find phone number pattern
    if (!data.phone_number) {
      const phoneMatch = pageText.match(/(?:\+?60|0)[\d\s\-]{8,12}/);
      if (phoneMatch) {
        data.phone_number = phoneMatch[0].trim();
      }
    }
  }

  // Check if we got useful data
  data.hasData = !!(data.name || data.phone_number || data.full_address);
  data.isMasked = (data.name?.includes('***') || data.phone_number?.includes('***') || data.full_address?.includes('***'));

  return data;
}

/**
 * Clean text - remove extra whitespace
 */
function cleanText(text) {
  if (!text) return '';
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Sleep utility
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Log that content script is loaded
console.log('[TikTok Unmasker] Content script loaded on:', window.location.href);
