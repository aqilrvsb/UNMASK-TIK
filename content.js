/**
 * Content Script for TikTok Order Unmasker
 *
 * This script runs on TikTok Seller Center pages and handles:
 * - Finding the Shipping address section
 * - Clicking reveal icons (eye_invisible SVGs) using proper mouse events
 * - Extracting unmasked customer information
 */

// Configuration
const CONFIG = {
  timing: {
    waitAfterClick: 2500,
    waitBetweenClicks: 1000,
    waitForData: 2000
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
 * Simulate a real mouse click on an element
 * This is more reliable than just element.click()
 */
function simulateClick(element) {
  if (!element) return false;

  try {
    // Get element position
    const rect = element.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;

    // Create and dispatch mousedown event
    const mouseDownEvent = new MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX: x,
      clientY: y
    });
    element.dispatchEvent(mouseDownEvent);

    // Create and dispatch mouseup event
    const mouseUpEvent = new MouseEvent('mouseup', {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX: x,
      clientY: y
    });
    element.dispatchEvent(mouseUpEvent);

    // Create and dispatch click event
    const clickEvent = new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX: x,
      clientY: y
    });
    element.dispatchEvent(clickEvent);

    // Also try the native click
    element.click();

    return true;
  } catch (e) {
    console.log('[Content] simulateClick error:', e.message);
    return false;
  }
}

/**
 * Scroll to Shipping address section
 */
async function scrollToShippingAddress() {
  console.log('[Content] Looking for Shipping address section...');

  // First scroll down the page to load all content
  window.scrollTo(0, 500);
  await sleep(300);

  // Find the div containing "Shipping address" text
  const allDivs = document.querySelectorAll('div');
  let shippingLabel = null;

  for (const div of allDivs) {
    const text = div.textContent?.trim();
    if (text === 'Shipping address' && div.children.length === 0) {
      shippingLabel = div;
      console.log('[Content] Found "Shipping address" label');
      break;
    }
  }

  if (shippingLabel) {
    // Scroll the label into view
    shippingLabel.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await sleep(500);
    return shippingLabel;
  }

  // Fallback: scroll down more
  console.log('[Content] Shipping address label not found, scrolling more...');
  window.scrollTo(0, 800);
  await sleep(500);

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
  const shippingLabel = await scrollToShippingAddress();
  await sleep(800);

  // Method 1: Find SVGs with data-log_click_for="open_phone_plaintext"
  const revealIcons = document.querySelectorAll('svg[data-log_click_for="open_phone_plaintext"]');
  console.log('[Content] Found', revealIcons.length, 'reveal icons with data-log_click_for');

  for (const icon of revealIcons) {
    try {
      const rect = icon.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        console.log('[Content] Clicking reveal icon at position:', rect.left, rect.top);

        // Scroll icon into view first
        icon.scrollIntoView({ behavior: 'smooth', block: 'center' });
        await sleep(300);

        // Use simulated click
        simulateClick(icon);
        clickedCount++;

        // Also try clicking the parent span
        const parentSpan = icon.closest('span');
        if (parentSpan) {
          await sleep(200);
          simulateClick(parentSpan);
        }

        await sleep(CONFIG.timing.waitBetweenClicks);
      }
    } catch (e) {
      console.log('[Content] Click error:', e.message);
    }
  }

  // Method 2: Find SVGs with class containing "eye_invisible" or "arco-icon"
  const eyeIcons = document.querySelectorAll('svg.arco-icon-eye_invisible, svg[class*="eye_invisible"]');
  console.log('[Content] Found', eyeIcons.length, 'eye_invisible icons');

  for (const icon of eyeIcons) {
    // Skip if already clicked (check by data attribute)
    if (icon.dataset.clicked === 'true') continue;

    try {
      const rect = icon.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        console.log('[Content] Clicking eye_invisible icon...');

        icon.scrollIntoView({ behavior: 'smooth', block: 'center' });
        await sleep(300);

        simulateClick(icon);
        icon.dataset.clicked = 'true';
        clickedCount++;

        // Also click parent
        const parent = icon.parentElement;
        if (parent) {
          await sleep(200);
          simulateClick(parent);
        }

        await sleep(CONFIG.timing.waitBetweenClicks);
      }
    } catch (e) {
      console.log('[Content] Click error:', e.message);
    }
  }

  // Method 3: Find clickable cursor-pointer elements in the customer section
  if (shippingLabel) {
    const parentSection = shippingLabel.parentElement?.parentElement;
    if (parentSection) {
      const clickableIcons = parentSection.querySelectorAll('.cursor-pointer, [class*="cursor-pointer"]');
      console.log('[Content] Found', clickableIcons.length, 'cursor-pointer elements in section');

      for (const icon of clickableIcons) {
        if (icon.dataset.clicked === 'true') continue;

        try {
          const rect = icon.getBoundingClientRect();
          if (rect.width > 0 && rect.width < 50 && rect.height > 0 && rect.height < 50) {
            console.log('[Content] Clicking cursor-pointer element...');

            icon.scrollIntoView({ behavior: 'smooth', block: 'center' });
            await sleep(200);

            simulateClick(icon);
            icon.dataset.clicked = 'true';
            clickedCount++;

            await sleep(CONFIG.timing.waitBetweenClicks);
          }
        } catch (e) {
          console.log('[Content] Click error:', e.message);
        }
      }
    }
  }

  // Method 4: Click any SVG that's inside a span near masked text
  const maskedTexts = document.querySelectorAll('div');
  for (const div of maskedTexts) {
    const text = div.textContent || '';
    // Look for masked patterns
    if ((text.includes('***') || text.includes('****')) && text.length < 80) {
      // Find sibling or nearby span with SVG
      const parent = div.parentElement;
      if (parent) {
        const nearbySpan = parent.querySelector('span');
        if (nearbySpan) {
          const svg = nearbySpan.querySelector('svg');
          if (svg && svg.dataset.clicked !== 'true') {
            console.log('[Content] Found SVG near masked text:', text.substring(0, 20));

            svg.scrollIntoView({ behavior: 'smooth', block: 'center' });
            await sleep(200);

            simulateClick(svg);
            simulateClick(nearbySpan);
            svg.dataset.clicked = 'true';
            clickedCount++;

            await sleep(CONFIG.timing.waitBetweenClicks);
          }
        }
      }
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
    if (div.textContent?.trim() === 'Shipping address' && div.children.length === 0) {
      shippingContainer = div.parentElement;
      break;
    }
  }

  if (shippingContainer) {
    console.log('[Content] Found shipping container');

    // Get all text from nested divs
    const allTextDivs = shippingContainer.querySelectorAll('div');
    const texts = [];

    for (const div of allTextDivs) {
      // Only get leaf text nodes
      if (div.children.length === 0 || div.querySelector('svg')) {
        let text = '';
        // Get direct text content, not from child elements
        for (const node of div.childNodes) {
          if (node.nodeType === Node.TEXT_NODE) {
            text += node.textContent;
          }
        }
        text = text.trim();

        if (text && text.length > 1 && text !== 'Shipping address') {
          texts.push(text);
          console.log('[Content] Found text:', text);
        }
      }
    }

    // Also try getting text from divs with specific classes
    const grayTextDivs = shippingContainer.querySelectorAll('div.text-gray-1, div[class*="text-gray"]');
    for (const div of grayTextDivs) {
      const text = div.textContent?.trim();
      if (text && text.length > 1 && !texts.includes(text)) {
        texts.push(text);
        console.log('[Content] Found gray text:', text);
      }
    }

    data.raw_texts = texts;

    // Parse the texts
    for (const text of texts) {
      // Skip if still masked
      if (text.includes('***') || text.includes('****')) {
        console.log('[Content] Skipping masked text:', text);
        continue;
      }

      // Skip labels
      if (text === 'Shipping address' || text === 'User name') continue;

      // Phone number detection (+60... or 01...)
      if (!data.phone_number) {
        const phoneMatch = text.match(/\+?60\d{8,11}|\(\+60\)\d{8,11}|01\d{8,9}/);
        if (phoneMatch) {
          data.phone_number = phoneMatch[0];
          console.log('[Content] Found phone:', data.phone_number);
          continue;
        }
      }

      // Address detection (contains Malaysia or postal code or is long)
      if (!data.full_address && (
        text.includes('Malaysia') ||
        /\d{5}/.test(text) ||
        text.length > 35 ||
        /jalan|lorong|taman|kampung|blok|unit|no\.|tingkat|bandar|persiaran|lebuh/i.test(text)
      )) {
        data.full_address = text;
        console.log('[Content] Found address:', text);
        continue;
      }

      // Name detection (shorter text, mostly letters)
      if (!data.name && text.length >= 2 && text.length < 50) {
        const letterCount = (text.match(/[a-zA-Z\s]/g) || []).length;
        const digitCount = (text.match(/\d/g) || []).length;
        if (letterCount > text.length * 0.6 && digitCount < 3) {
          data.name = text;
          console.log('[Content] Found name:', text);
          continue;
        }
      }
    }
  }

  // Method 2: Search entire page for unmasked data if not found
  const pageText = document.body.innerText;

  if (!data.phone_number) {
    const phoneMatches = pageText.match(/\+60\d{9,11}|\(\+60\)\d{9,11}|01\d{8,9}/g);
    if (phoneMatches) {
      for (const match of phoneMatches) {
        if (!match.includes('*')) {
          data.phone_number = match;
          console.log('[Content] Found phone from page scan:', match);
          break;
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

  console.log('[Content] Final extraction result:', {
    hasData: data.hasData,
    isMasked: data.isMasked,
    name: data.name,
    phone: data.phone_number,
    address: data.full_address?.substring(0, 50)
  });

  return data;
}

// Log that content script is loaded
console.log('[TikTok Unmasker] Content script loaded on:', window.location.href);
