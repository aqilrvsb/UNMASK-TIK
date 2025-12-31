/**
 * Popup Script for TikTok Order Unmasker Extension
 *
 * Handles UI interactions and communicates with background script and content script
 */

// DOM Elements
const emailInput = document.getElementById('email');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const loginForm = document.getElementById('loginForm');
const runningView = document.getElementById('runningView');
const statusDiv = document.getElementById('status');
const progressFill = document.getElementById('progressFill');
const progressText = document.getElementById('progressText');
const progressPercent = document.getElementById('progressPercent');
const successCount = document.getElementById('successCount');
const failedCount = document.getElementById('failedCount');
const logContainer = document.getElementById('logContainer');
const notOnTiktok = document.getElementById('notOnTiktok');

// State
let isRunning = false;

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  // Load saved email
  const saved = await chrome.storage.local.get(['email']);
  if (saved.email) {
    emailInput.value = saved.email;
  }

  // Check if we're on TikTok
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const isTikTok = tab?.url?.includes('seller-my.tiktok.com') || tab?.url?.includes('seller.tiktok.com');

  if (!isTikTok) {
    notOnTiktok.style.display = 'block';
    startBtn.disabled = true;
  }

  // Check current status from background
  chrome.runtime.sendMessage({ type: 'GET_STATUS' }, (response) => {
    if (response && response.isRunning) {
      showRunningView();
      updateProgress(response);
    }
  });

  // Listen for updates from background
  chrome.runtime.onMessage.addListener((message) => {
    handleMessage(message);
  });
});

// Start button click
startBtn.addEventListener('click', async () => {
  const email = emailInput.value.trim();

  if (!email) {
    showStatus('Please enter your email', 'error');
    return;
  }

  // Save email
  await chrome.storage.local.set({ email });

  // Get current tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab?.url?.includes('seller-my.tiktok.com') && !tab?.url?.includes('seller.tiktok.com')) {
    showStatus('Please open TikTok Seller Center first', 'error');
    return;
  }

  // Start the automation
  startBtn.disabled = true;
  startBtn.innerHTML = '<div class="spinner"></div><span>Starting...</span>';

  chrome.runtime.sendMessage({
    type: 'START_UNMASK',
    email: email,
    tabId: tab.id
  }, (response) => {
    if (response?.error) {
      showStatus(response.error, 'error');
      startBtn.disabled = false;
      startBtn.innerHTML = '<span>Start Auto Unmask</span>';
    } else {
      showRunningView();
    }
  });
});

// Stop button click
stopBtn.addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'STOP_UNMASK' });
  stopBtn.disabled = true;
  stopBtn.textContent = 'Stopping...';
});

// Show running view
function showRunningView() {
  loginForm.style.display = 'none';
  runningView.style.display = 'block';
  isRunning = true;
}

// Show login view
function showLoginView() {
  loginForm.style.display = 'block';
  runningView.style.display = 'none';
  startBtn.disabled = false;
  startBtn.innerHTML = '<span>Start Auto Unmask</span>';
  isRunning = false;
}

// Show status message
function showStatus(message, type = 'info') {
  statusDiv.textContent = message;
  statusDiv.className = `status show ${type}`;

  if (type !== 'error') {
    setTimeout(() => {
      statusDiv.classList.remove('show');
    }, 5000);
  }
}

// Update progress display
function updateProgress(data) {
  const { processed = 0, total = 0, success = 0, failed = 0 } = data;

  const percent = total > 0 ? Math.round((processed / total) * 100) : 0;

  progressFill.style.width = `${percent}%`;
  progressText.textContent = `${processed} / ${total}`;
  progressPercent.textContent = `${percent}%`;
  successCount.textContent = success;
  failedCount.textContent = failed;
}

// Add log entry
function addLog(message, type = 'info') {
  const entry = document.createElement('div');
  entry.className = `log-entry ${type}`;
  entry.textContent = message;

  // Keep only last 20 entries
  while (logContainer.children.length > 20) {
    logContainer.removeChild(logContainer.firstChild);
  }

  logContainer.appendChild(entry);
  logContainer.scrollTop = logContainer.scrollHeight;
}

// Handle messages from background script
function handleMessage(message) {
  switch (message.type) {
    case 'STATUS':
      if (message.status === 'starting') {
        addLog('Starting automation...');
      } else if (message.status === 'connecting') {
        addLog(message.message || 'Connecting...');
      } else if (message.status === 'running') {
        addLog('Automation running');
      }
      break;

    case 'PROGRESS':
      updateProgress(message);
      break;

    case 'PROCESSING':
      addLog(`Processing order ${message.orderIdShort || message.orderId?.slice(-8)}...`);
      break;

    case 'ORDER_SUCCESS':
      addLog(`Order ${message.orderIdShort}: ${message.name || 'OK'}`, 'success');
      updateProgress(message);
      break;

    case 'ORDER_FAILED':
      addLog(`Order ${message.orderIdShort || message.orderId?.slice(-8)}: ${message.reason}`, 'error');
      updateProgress(message);
      break;

    case 'COMPLETE':
      addLog(`Complete! ${message.success} succeeded, ${message.failed} failed`, 'success');
      showStatus(`Completed! ${message.success} orders unmasked`, 'success');
      setTimeout(() => showLoginView(), 3000);
      break;

    case 'STOPPED':
      addLog('Automation stopped by user');
      showStatus('Stopped', 'info');
      setTimeout(() => showLoginView(), 2000);
      break;

    case 'ERROR':
      addLog(message.message || 'An error occurred', 'error');
      showStatus(message.message || 'Error occurred', 'error');
      setTimeout(() => showLoginView(), 3000);
      break;

    case 'LOGIN_SUCCESS':
      addLog(`Logged in: ${message.shopName}`);
      break;

    case 'LOGIN_ERROR':
      showStatus(message.message || 'Login failed', 'error');
      showLoginView();
      break;
  }
}
