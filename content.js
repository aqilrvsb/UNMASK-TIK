/**
 * Content Script for TikTok Order Unmasker
 *
 * This script runs on TikTok Seller Center pages and handles:
 * - Scrolling to Customer details section
 * - Clicking reveal buttons to unmask customer data
 * - Extracting customer information from the page
 */

// Configuration
const CONFIG = {
  timing: {
    waitAfterClick: 1500,
    waitForPageLoad: 3000,
    waitBetweenClicks: 500
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
 * Scroll to Customer details section
 */
async function scrollToCustomerDetails() {
  console.log('[Content] Scrolling to find Customer details...');

  // Try to find "Customer details" text on the page
  const allElements = document.querySelectorAll('*');
  let customerDetailsSection = null;

  for (const el of allElements) {
    if (el.textContent && el.textContent.trim() === 'Customer details') {
      customerDetailsSection = el;
      break;
    }
  }

  if (customerDetailsSection) {
    console.log('[Content] Found Customer details section, scrolling...');
    customerDetailsSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await sleep(500);
    return true;
  }

  // Fallback: scroll down the page
  console.log('[Content] Customer details not found by text, scrolling page...');
  window.scrollTo(0, 500);
  await sleep(300);
  window.scrollTo(0, 1000);
  await sleep(300);

  return false;
}

/**
 * Find and click all reveal/unmask icons
 * These are the small arrow icons (∨) next to masked data like "h****************e"
 */
async function clickRevealButtons() {
  console.log('[Content] Looking for reveal buttons...');
  let clickedCount = 0;

  // First, scroll to Customer details section
  await scrollToCustomerDetails();
  await sleep(500);

  // Method 1: Find clickable elements near masked text (contains ***)
  const allSpans = document.querySelectorAll('span, div, p');
  const maskedElements = [];

  for (const el of allSpans) {
    const text = el.textContent || '';
    // Look for masked patterns like "h****************e" or "(+60)138****36" or "f*******"
    if (text.includes('***') && text.length < 100) {
      maskedElements.push(el);
    }
  }

  console.log('[Content] Found', maskedElements.length, 'masked elements');

  // For each masked element, find nearby clickable icons
  for (const maskedEl of maskedElements) {
    // Look for clickable siblings or nearby elements
    const parent = maskedEl.parentElement;
    if (!parent) continue;

    // Look within parent and grandparent for clickable icons
    const searchAreas = [parent, parent.parentElement, parent.parentElement?.parentElement].filter(Boolean);

    for (const area of searchAreas) {
      // Find SVG icons, buttons, or clickable spans
      const clickables = area.querySelectorAll('svg, button, [role="button"], span[class*="icon"], div[class*="icon"], [class*="click"], [class*="reveal"], [class*="show"]');

      for (const clickable of clickables) {
        try {
          const rect = clickable.getBoundingClientRect();
          // Check if visible and reasonable size (icon size)
          if (rect.width > 0 && rect.width < 50 && rect.height > 0 && rect.height < 50) {
            console.log('[Content] Clicking element near masked text...');
            clickable.click();
            clickedCount++;
            await sleep(CONFIG.timing.waitBetweenClicks);
          }
        } catch (e) {
          console.log('[Content] Click error:', e.message);
        }
      }
    }
  }

  // Method 2: Find elements by common TikTok patterns
  const revealSelectors = [
    // SVG icons that are clickable
    'svg[class*="arco"]',
    '[class*="arco-icon"]',
    // Buttons near customer info
    '[class*="customer"] button',
    '[class*="customer"] svg',
    '[class*="recipient"] button',
    '[class*="recipient"] svg',
    // Generic reveal patterns
    '[class*="reveal"]',
    '[class*="unmask"]',
    '[class*="show-detail"]',
    '[class*="view-detail"]',
    // Data view buttons
    '[data-log_click_for*="plaintext"]',
    '[data-log_click_for*="reveal"]',
    '[data-log_click_for*="view"]'
  ];

  for (const selector of revealSelectors) {
    try {
      const elements = document.querySelectorAll(selector);
      for (const el of elements) {
        const rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          console.log('[Content] Clicking:', selector);
          el.click();
          clickedCount++;
          await sleep(CONFIG.timing.waitBetweenClicks);
        }
      }
    } catch (e) {
      // Continue with next selector
    }
  }

  // Method 3: Click all small clickable elements in the Customer details area
  // Find the right sidebar (usually contains customer info)
  const rightSidebar = document.querySelector('[class*="right-content"], [class*="sidebar"], [class*="detail-right"]');
  if (rightSidebar) {
    console.log('[Content] Found right sidebar, looking for clickable icons...');
    const icons = rightSidebar.querySelectorAll('svg, [class*="icon"]');
    for (const icon of icons) {
      try {
        const rect = icon.getBoundingClientRect();
        if (rect.width > 5 && rect.width < 40 && rect.height > 5 && rect.height < 40) {
          // Check if it's near the bottom of the sidebar (customer details area)
          if (rect.top > 200) {
            console.log('[Content] Clicking sidebar icon...');
            icon.click();
            clickedCount++;
            await sleep(CONFIG.timing.waitBetweenClicks);
          }
        }
      } catch (e) {
        // Continue
      }
    }
  }

  // Method 4: Find and click any expand/dropdown icons near masked text
  const expandIcons = document.querySelectorAll('[class*="expand"], [class*="dropdown"], [class*="arrow"], [class*="chevron"]');
  for (const icon of expandIcons) {
    try {
      const rect = icon.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0 && rect.top > 200) {
        // Check if this icon is near masked text
        const nearbyText = icon.parentElement?.textContent || '';
        if (nearbyText.includes('***')) {
          console.log('[Content] Clicking expand icon near masked text...');
          icon.click();
          clickedCount++;
          await sleep(CONFIG.timing.waitBetweenClicks);
        }
      }
    } catch (e) {
      // Continue
    }
  }

  console.log('[Content] Total clicked:', clickedCount);

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
  console.log('[Content] Extracting customer data...');

  // First, scroll to customer details and click reveal buttons
  await scrollToCustomerDetails();
  await sleep(500);
  await clickRevealButtons();
  await sleep(1500);

  // Initialize data object
  const data = {
    name: null,
    phone_number: null,
    full_address: null,
    raw_texts: [],
    hasData: false,
    isMasked: true
  };

  // Get all text content from the page
  const pageText = document.body.innerText;

  // Method 1: Look for unmasked phone number pattern (+60...)
  const phonePatterns = [
    /\+60\d{9,11}/g,                    // +60123456789
    /\+60[\d\s\-]{9,14}/g,              // +60 12-345 6789
    /\(\+60\)\d{9,11}/g,                // (+60)123456789
    /\(\+60\)[\d\s\-]{9,14}/g,          // (+60) 12-345 6789
    /60\d{9,11}/g,                       // 60123456789
    /0\d{2}[\s\-]?\d{3,4}[\s\-]?\d{4}/g // 012-345 6789
  ];

  for (const pattern of phonePatterns) {
    const matches = pageText.match(pattern);
    if (matches) {
      for (const match of matches) {
        // Make sure it's not masked
        if (!match.includes('*')) {
          data.phone_number = match.trim();
          console.log('[Content] Found phone:', data.phone_number);
          break;
        }
      }
    }
    if (data.phone_number) break;
  }

  // Method 2: Find Customer details section and extract text
  const allElements = document.querySelectorAll('*');
  let inCustomerSection = false;
  const customerTexts = [];

  for (const el of allElements) {
    const text = el.textContent?.trim() || '';

    if (text === 'Customer details') {
      inCustomerSection = true;
      continue;
    }

    if (inCustomerSection && text && text.length > 2 && text.length < 200) {
      // Skip if it's a section header or common UI text
      if (['What you earned', 'Order history', 'Logistics', 'Parcel'].some(skip => text.startsWith(skip))) {
        inCustomerSection = false;
        continue;
      }

      // Skip if masked
      if (!text.includes('***')) {
        customerTexts.push(text);
      }
    }
  }

  data.raw_texts = customerTexts.slice(0, 15);
  console.log('[Content] Customer texts:', customerTexts);

  // Parse the collected texts
  for (const text of customerTexts) {
    // Skip labels
    if (['User name', 'Shipping address', 'Customer details'].includes(text)) continue;

    // Phone detection
    if (!data.phone_number && /^[\+\(]?[\d\s\-\(\)]{8,}$/.test(text.replace(/\s/g, ''))) {
      data.phone_number = text;
    }
    // Address detection (long text with address keywords or postal code)
    else if (!data.full_address && (
      text.length > 40 ||
      /\d{5}/.test(text) ||
      /jalan|lorong|taman|kampung|blok|unit|no\.|floor|tingkat|bandar|malaysia/i.test(text)
    )) {
      data.full_address = text;
    }
    // Name detection (shorter text, no many numbers, not a label)
    else if (!data.name && text.length >= 3 && text.length < 60 && !/\d{3,}/.test(text)) {
      data.name = text;
    }
  }

  // Method 3: Try to find specific elements by looking at the DOM structure
  // TikTok often uses specific class patterns
  const possibleNameElements = document.querySelectorAll('[class*="name"], [class*="recipient"], [class*="buyer"], [class*="customer"]');
  for (const el of possibleNameElements) {
    const text = el.textContent?.trim();
    if (text && text.length > 2 && text.length < 50 && !text.includes('***') && !text.includes('User name')) {
      if (!data.name) {
        data.name = text;
        console.log('[Content] Found name from element:', data.name);
      }
    }
  }

  // Method 4: Scan all visible text near "User name", "Shipping address" labels
  const labels = ['User name', 'Shipping address'];
  for (const label of labels) {
    const labelElements = Array.from(document.querySelectorAll('*')).filter(el =>
      el.textContent?.trim() === label && el.children.length === 0
    );

    for (const labelEl of labelElements) {
      // Get the next sibling or parent's next child
      let nextEl = labelEl.nextElementSibling;
      if (!nextEl && labelEl.parentElement) {
        nextEl = labelEl.parentElement.nextElementSibling;
      }

      if (nextEl) {
        const text = nextEl.textContent?.trim();
        if (text && !text.includes('***')) {
          if (label === 'User name' && !data.name && text.length < 60) {
            data.name = text;
          } else if (label === 'Shipping address' && !data.full_address) {
            data.full_address = text;
          }
        }
      }
    }
  }

  // Check if we got any useful data
  data.hasData = !!(data.name || data.phone_number || data.full_address);
  data.isMasked = !data.hasData ||
    (data.name?.includes('***')) ||
    (data.phone_number?.includes('***')) ||
    (data.full_address?.includes('***'));

  console.log('[Content] Extracted data:', data);

  return data;
}

// Log that content script is loaded
console.log('[TikTok Unmasker] Content script loaded on:', window.location.href);
