// popup.js

document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements
  const toggleEnabled = document.getElementById('toggle-enabled');
  const selectModifier = document.getElementById('select-modifier');
  const toggleIconClick = document.getElementById('toggle-icon-click');
  const textareaExclusions = document.getElementById('textarea-exclusions');
  const btnSaveExclusions = document.getElementById('btn-save-exclusions');
  const saveStatus = document.getElementById('save-status');
  const iconClickInfo = document.getElementById('icon-click-info');
  const globalStatusBadge = document.getElementById('global-status');
  const globalStatusText = globalStatusBadge.querySelector('.status-text');

  // Tab Rename DOM Elements
  const inputTabName = document.getElementById('input-tab-name');
  const btnSaveTabName = document.getElementById('btn-save-tab-name');
  const btnResetTabName = document.getElementById('btn-reset-tab-name');
  const renameStatus = document.getElementById('rename-status');

  // Load Settings
  chrome.storage.sync.get({
    enabled: true,
    modifier: 'none',
    iconClickClosesTab: false,
    excludedDomains: [
      "github.com",
      "docs.google.com",
      "sheets.google.com",
      "slides.google.com"
    ]
  }, (settings) => {
    toggleEnabled.checked = settings.enabled;
    selectModifier.value = settings.modifier;
    toggleIconClick.checked = settings.iconClickClosesTab;
    textareaExclusions.value = settings.excludedDomains.join('\n');
    
    // Initial UI state updates
    updateStatusBadge(settings.enabled);
    updateIconClickAlert(settings.iconClickClosesTab);
  });

  // Query and display active tab's custom title
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const activeTab = tabs[0];
    if (activeTab && activeTab.id !== chrome.tabs.TAB_ID_NONE) {
      chrome.storage.local.get(['customTitles'], (result) => {
        const titles = result.customTitles || {};
        const currentCustomTitle = titles[activeTab.id] || "";
        inputTabName.value = currentCustomTitle;
      });
    }
  });

  // Event Listeners for Tab Renaming
  btnSaveTabName.addEventListener('click', () => {
    const newName = inputTabName.value.trim();
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTab = tabs[0];
      if (activeTab && activeTab.id !== chrome.tabs.TAB_ID_NONE) {
        chrome.runtime.sendMessage({
          action: "set_tab_title",
          tabId: activeTab.id,
          title: newName ? newName : null
        }, (response) => {
          if (response && response.success) {
            showRenameStatus();
          }
        });
      }
    });
  });

  btnResetTabName.addEventListener('click', () => {
    inputTabName.value = "";
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTab = tabs[0];
      if (activeTab && activeTab.id !== chrome.tabs.TAB_ID_NONE) {
        chrome.runtime.sendMessage({
          action: "set_tab_title",
          tabId: activeTab.id,
          title: null
        }, (response) => {
          if (response && response.success) {
            showRenameStatus();
          }
        });
      }
    });
  });

  // Event Listeners for Automatic Saving of General Settings
  toggleEnabled.addEventListener('change', () => {
    const isEnabled = toggleEnabled.checked;
    chrome.storage.sync.set({ enabled: isEnabled }, () => {
      updateStatusBadge(isEnabled);
    });
  });

  selectModifier.addEventListener('change', () => {
    chrome.storage.sync.set({ modifier: selectModifier.value });
  });

  toggleIconClick.addEventListener('change', () => {
    const isIconClickClose = toggleIconClick.checked;
    chrome.storage.sync.set({ iconClickClosesTab: isIconClickClose }, () => {
      updateIconClickAlert(isIconClickClose);
    });
  });

  // Save Exclusions Button
  btnSaveExclusions.addEventListener('click', () => {
    const text = textareaExclusions.value;
    // Parse domains: split by line, trim spaces, remove empty lines
    const domains = text.split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);

    chrome.storage.sync.set({ excludedDomains: domains }, () => {
      // Update textarea value to normalized domains
      textareaExclusions.value = domains.join('\n');
      
      // Show success animation
      saveStatus.classList.add('show');
      setTimeout(() => {
        saveStatus.classList.remove('show');
      }, 2000);
    });
  });

  // Helper Functions
  function updateStatusBadge(enabled) {
    if (enabled) {
      globalStatusBadge.classList.remove('disabled');
      globalStatusText.textContent = 'Active';
    } else {
      globalStatusBadge.classList.add('disabled');
      globalStatusText.textContent = 'Disabled';
    }
  }

  function updateIconClickAlert(enabled) {
    if (enabled) {
      iconClickInfo.style.display = 'flex';
    } else {
      iconClickInfo.style.display = 'none';
    }
  }

  function showRenameStatus() {
    renameStatus.classList.add('show');
    setTimeout(() => {
      renameStatus.classList.remove('show');
    }, 2000);
  }
});
