// background.js

// Initialize popup configuration based on settings
function updateActionBehavior() {
  chrome.storage.sync.get({
    iconClickClosesTab: false
  }, (items) => {
    if (items.iconClickClosesTab) {
      // Clear popup so that chrome.action.onClicked fires
      chrome.action.setPopup({ popup: "" });
    } else {
      // Restore popup
      chrome.action.setPopup({ popup: "popup.html" });
    }
  });
}

// Update behavior on startup and when storage changes
chrome.runtime.onInstalled.addListener(() => {
  // Set default settings
  chrome.storage.sync.get({
    enabled: true,
    modifier: "none",
    iconClickClosesTab: false,
    excludedDomains: [
      "github.com",
      "docs.google.com",
      "sheets.google.com",
      "slides.google.com"
    ]
  }, (items) => {
    chrome.storage.sync.set(items);
    updateActionBehavior();
  });
});

chrome.runtime.onStartup.addListener(updateActionBehavior);

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && changes.iconClickClosesTab) {
    updateActionBehavior();
  }
});

// Listen for messages from content scripts and popups
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Action: close_tab
  if (message.action === "close_tab") {
    if (sender.tab && sender.tab.id !== chrome.tabs.TAB_ID_NONE) {
      chrome.tabs.remove(sender.tab.id);
    }
  }

  // Action: get_tab_title
  if (message.action === "get_tab_title") {
    const tabId = sender.tab?.id;
    if (tabId) {
      chrome.storage.local.get(['customTitles'], (result) => {
        const titles = result.customTitles || {};
        sendResponse({ customTitle: titles[tabId] || null });
      });
      return true; // Keep async response channel open
    } else {
      sendResponse({ customTitle: null });
    }
  }

  // Action: set_tab_title
  if (message.action === "set_tab_title") {
    const tabId = message.tabId || sender.tab?.id;
    const title = message.title; // Could be a string or null (to reset)
    if (tabId) {
      chrome.storage.local.get(['customTitles'], (result) => {
        let titles = result.customTitles || {};
        if (title && title.trim().length > 0) {
          titles[tabId] = title;
        } else {
          delete titles[tabId];
        }
        chrome.storage.local.set({ customTitles: titles }, () => {
          // Tell all frames in this tab to update title
          chrome.tabs.sendMessage(tabId, { action: "update_title_on_page", title: title });
          sendResponse({ success: true });
        });
      });
      return true; // Keep async response channel open
    } else {
      sendResponse({ success: false, error: "No active tab ID found" });
    }
  }
});

// Listen for action click (only fires if popup is cleared)
chrome.action.onClicked.addListener((tab) => {
  if (tab && tab.id !== chrome.tabs.TAB_ID_NONE) {
    chrome.tabs.remove(tab.id);
  }
});

// Listen for shortcut commands
chrome.commands.onCommand.addListener((command) => {
  if (command === "rename_tab") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTab = tabs[0];
      if (activeTab && activeTab.id !== chrome.tabs.TAB_ID_NONE) {
        chrome.tabs.sendMessage(activeTab.id, { action: "trigger_rename_dialog" });
      }
    });
  }
});

// Cleanup stored custom titles when a tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
  chrome.storage.local.get(['customTitles'], (result) => {
    let titles = result.customTitles || {};
    if (titles[tabId]) {
      delete titles[tabId];
      chrome.storage.local.set({ customTitles: titles });
    }
  });
});
