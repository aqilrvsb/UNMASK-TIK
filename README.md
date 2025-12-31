# TikTok Order Unmasker - Chrome Extension

Automatically unmask customer data from TikTok Seller Center orders.

## Installation

1. Open Chrome and go to `chrome://extensions/`
2. Enable **Developer mode** (toggle in top right)
3. Click **Load unpacked**
4. Select this folder (`unmask-extension`)
5. The extension icon will appear in your toolbar

## How to Use

1. **Log into TikTok Seller Center** in Chrome
   - Go to https://seller-my.tiktok.com/order
   - Make sure you're logged in

2. **Click the extension icon** in the toolbar

3. **Enter your email** (the one registered in the system)

4. **Click "Start Auto Unmask"**

5. Watch as the extension:
   - Navigates to each order page
   - Clicks reveal buttons
   - Extracts customer data
   - Saves to the database

## Features

- Works with your existing Chrome login session
- No external tools needed
- Shows progress in real-time
- Saves unmasked data to Supabase

## Troubleshooting

### Extension not working?
- Make sure you're on TikTok Seller Center
- Make sure you're logged in
- Try refreshing the page

### "Email not found" error?
- Check that your email is registered in the system
- Contact the administrator

### Data not being extracted?
- TikTok may have changed their page structure
- Try refreshing and running again

## Files

```
unmask-extension/
├── manifest.json     # Extension configuration
├── popup.html        # Extension popup UI
├── popup.js          # Popup logic
├── content.js        # Runs on TikTok pages
├── background.js     # Background service worker
└── icons/            # Extension icons
```

## Development

To modify the extension:
1. Edit the files
2. Go to `chrome://extensions/`
3. Click the refresh icon on the extension card
4. Test your changes

## Note

This extension only works on TikTok Seller Center pages:
- https://seller-my.tiktok.com/*
- https://seller.tiktok.com/*
