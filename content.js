/**
 * Content Script for TikTok Order Unmasker
 *
 * This script runs on TikTok Seller Center pages and handles:
 * - Finding the Shipping address section
 * - Clicking reveal icons (eye_invisible SVGs)
 * - Extracting unmasked customer information
 */

// Configuration
const CONFIG = {
  timing: {
    waitAfterClick: 2000,
    waitBetweenClicks: 800,
    waitForData: 1500
  }
};

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[Content] Received message:', message.type);

  switch (message.type) {
    case 'EXTRACT_DATA':
      extractCustomerData().then(data => {
        sendResponse(data);
      });
      return true;

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
      sendResponse({ stopped: true });
      return false;
  }
});

/**
 * Check if current page is the order detail page
 */
function isOrderDetailPage() {
  return window.location.href.includes('order/detail');
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
  window.location.href = url;
  return { navigating: true };
}

/**
 * Sleep utility
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Scroll to Shipping address section
 */
async function scrollToShippingAddress() {
  console.log('[Content] Looking for Shipping address section...');

  // Find the div containing "Shipping address" text
  const allDivs = document.querySelectorAll('div');
  let shippingSection = null;

  for (const div of allDivs) {
    // Look for exact match of "Shipping address" label
    if (div.textContent.trim() === 'Shipping address' && div.children.length === 0) {
      console.log('[Content] Found "Shipping address" label');
      // Get the parent container which has the reveal icons
      shippingSection = div.closest('div.sc-jRsXiD, div.hYGmsW') || div.parentElement?.parentElement;
      break;
    }
  }

  if (shippingSection) {
    console.log('[Content] Scrolling to Shipping address section...');
    shippingSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await sleep(500);
    return shippingSection;
  }

  // Fallback: scroll down the page to reveal more content
  console.log('[Content] Shipping address section not found, scrolling page...');
  window.scrollTo(0, 500);
  await sleep(300);
  window.scrollTo(0, 800);
  await sleep(300);

  return null;
}

/**
 * Find and click all reveal icons (eye_invisible SVGs)
 * Target: svg[data-log_click_for="open_phone_plaintext"]
 */
async function clickRevealButtons() {
  console.log('[Content] Looking for reveal icons...');
  let clickedCount = 0;

  // First, scroll to shipping address section
  await scrollToShippingAddress();
  await sleep(500);

  // Method 1: Find SVGs with data-log_click_for="open_phone_plaintext"
  // This is the exact attribute from the TikTok HTML
  const revealIcons = document.querySelectorAll('svg[data-log_click_for="open_phone_plaintext"]');
  console.log('[Content] Found', revealIcons.length, 'reveal icons with data-log_click_for');

  for (const icon of revealIcons) {
    try {
      const rect = icon.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        console.log('[Content] Clicking reveal icon...');

        // Try clicking the icon itself
        icon.click();
        clickedCount++;
        await sleep(CONFIG.timing.waitBetweenClicks);

        // Also try clicking the parent span (sc-jVOTke class)
        const parentSpan = icon.closest('span');
        if (parentSpan) {
          parentSpan.click();
          await sleep(300);
        }
      }
    } catch (e) {
      console.log('[Content] Click error:', e.message);
    }
  }

  // Method 2: Find SVGs with class containing "eye_invisible"
  const eyeIcons = document.querySelectorAll('svg[class*="eye_invisible"]');
  console.log('[Content] Found', eyeIcons.length, 'eye_invisible icons');

  for (const icon of eyeIcons) {
    try {
      const rect = icon.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        // Check if not already clicked
        const isVisible = icon.classList.contains('arco-icon-eye') && !icon.classList.contains('arco-icon-eye_invisible');
        if (!isVisible) {
          console.log('[Content] Clicking eye_invisible icon...');
          icon.click();
          clickedCount++;
          await sleep(CONFIG.timing.waitBetweenClicks);
        }
      }
    } catch (e) {
      console.log('[Content] Click error:', e.message);
    }
  }

  // Method 3: Find any arco-icon that's clickable in the shipping section
  const arcoIcons = document.querySelectorAll('.arco-icon.cursor-pointer');
  console.log('[Content] Found', arcoIcons.length, 'clickable arco-icons');

  for (const icon of arcoIcons) {
    try {
      const rect = icon.getBoundingClientRect();
      // Only click icons that are in the right area (customer details section, usually right side)
      if (rect.width > 0 && rect.height > 0 && rect.left > window.innerWidth / 2) {
        console.log('[Content] Clicking arco-icon...');
        icon.click();
        clickedCount++;
        await sleep(CONFIG.timing.waitBetweenClicks);
      }
    } catch (e) {
      console.log('[Content] Click error:', e.message);
    }
  }

  // Method 4: Find clickable spans near masked data
  const spans = document.querySelectorAll('span.sc-jVOTke');
  console.log('[Content] Found', spans.length, 'sc-jVOTke spans');

  for (const span of spans) {
    try {
      const svg = span.querySelector('svg');
      if (svg) {
        const rect = span.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          console.log('[Content] Clicking span with svg...');
          span.click();
          clickedCount++;
          await sleep(CONFIG.timing.waitBetweenClicks);
        }
      }
    } catch (e) {
      console.log('[Content] Click error:', e.message);
    }
  }

  console.log('[Content] Total clicks attempted:', clickedCount);

  // Wait for data to load after clicking
  if (clickedCount > 0) {
    await sleep(CONFIG.timing.waitAfterClick);
  }

  return { clickedCount };
}

/**
 * Extract customer data from the page
 */
async function extractCustomerData() {
  console.log('[Content] Starting data extraction...');

  // First, scroll and click reveal buttons
  await scrollToShippingAddress();
  await sleep(500);
  const clickResult = await clickRevealButtons();
  console.log('[Content] Clicked', clickResult.clickedCount, 'buttons');

  // Wait for data to appear
  await sleep(CONFIG.timing.waitForData);

  // Initialize data object
  const data = {
    name: null,
    phone_number: null,
    full_address: null,
    raw_texts: [],
    hasData: false,
    isMasked: true
  };

  // Find the Shipping address section container
  let shippingContainer = null;
  const allDivs = document.querySelectorAll('div');

  for (const div of allDivs) {
    if (div.textContent.trim() === 'Shipping address' && div.children.length === 0) {
      // Go up to find the parent container that has all the data
      shippingContainer = div.parentElement;
      break;
    }
  }

  if (shippingContainer) {
    console.log('[Content] Found shipping container');

    // Get all text divs with class "text-base font-regular text-gray-1"
    const textDivs = shippingContainer.querySelectorAll('div.text-base.font-regular.text-gray-1');
    const texts = [];

    for (const div of textDivs) {
      const text = div.textContent.trim();
      if (text && text.length > 0) {
        texts.push(text);
        console.log('[Content] Found text:', text);
      }
    }

    data.raw_texts = texts;

    // Parse the texts
    for (const text of texts) {
      // Skip if still masked
      if (text.includes('***') || text.includes('****')) {
        continue;
      }

      // Phone number detection (+60...)
      if (!data.phone_number && /^\+?60/.test(text) && /\d{9,}/.test(text.replace(/\D/g, ''))) {
        data.phone_number = text;
        console.log('[Content] Found phone:', text);
      }
      // Phone number detection (starts with 0)
      else if (!data.phone_number && /^0\d{2}/.test(text) && /\d{9,}/.test(text.replace(/\D/g, ''))) {
        data.phone_number = text;
        console.log('[Content] Found phone:', text);
      }
      // Address detection (contains Malaysia or postal code or address keywords)
      else if (!data.full_address && (
        text.includes('Malaysia') ||
        /\d{5}/.test(text) ||
        text.length > 30 ||
        /jalan|lorong|taman|kampung|blok|unit|no\.|tingkat|bandar|persiaran|lebuh/i.test(text)
      )) {
        data.full_address = text;
        console.log('[Content] Found address:', text);
      }
      // Name detection (shorter text, mostly letters)
      else if (!data.name && text.length >= 2 && text.length < 60) {
        // Check it's mostly letters (name)
        const letterCount = (text.match(/[a-zA-Z]/g) || []).length;
        if (letterCount > text.length * 0.5) {
          data.name = text;
          console.log('[Content] Found name:', text);
        }
      }
    }
  }

  // Method 2: Search entire page for unmasked data
  if (!data.phone_number || !data.name || !data.full_address) {
    console.log('[Content] Searching entire page for data...');
    const pageText = document.body.innerText;

    // Find phone numbers
    if (!data.phone_number) {
      const phoneMatches = pageText.match(/\+60\d{9,11}|\(\+60\)\d{9,11}|60\d{9,11}|01\d{8,9}/g);
      if (phoneMatches) {
        for (const match of phoneMatches) {
          if (!match.includes('*')) {
            data.phone_number = match;
            console.log('[Content] Found phone from page:', match);
            break;
          }
        }
      }
    }
  }

  // Check if we got any useful unmasked data
  data.hasData = !!(data.name || data.phone_number || data.full_address);

  // Check if data is still masked
  const hasMaskedData =
    (data.name && data.name.includes('*')) ||
    (data.phone_number && data.phone_number.includes('*')) ||
    (data.full_address && data.full_address.includes('*'));

  data.isMasked = !data.hasData || hasMaskedData;

  console.log('[Content] Extraction result:', {
    hasData: data.hasData,
    isMasked: data.isMasked,
    name: data.name,
    phone: data.phone_number,
    address: data.full_address?.substring(0, 50) + '...'
  });

  return data;
}

// Log that content script is loaded
console.log('[TikTok Unmasker] Content script loaded on:', window.location.href);
