// content.js

let settings = {
  enabled: true,
  modifier: "none", // "none", "alt", "shift", "ctrl"
  excludedDomains: []
};

// Custom Title State
let customTitle = null;
let originalTitle = "";
let titleObserver = null;
let isApplyingCustomTitle = false;

// Load settings
function updateSettings() {
  chrome.storage.sync.get({
    enabled: true,
    modifier: "none",
    excludedDomains: []
  }, (items) => {
    settings = items;
  });
}

updateSettings();

// Listen for settings changes
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync') {
    updateSettings();
  }
});

// Check if domain is excluded
function isExcluded() {
  const currentHost = window.location.hostname;
  return settings.excludedDomains.some(domain => {
    const trimmed = domain.trim().toLowerCase();
    if (!trimmed) return false;
    return currentHost === trimmed || currentHost.endsWith('.' + trimmed);
  });
}

// Lock page title to custom title
function applyAndLockTitle() {
  if (!customTitle) return;
  
  if (document.title !== customTitle) {
    if (!originalTitle) {
      originalTitle = document.title;
    }
    isApplyingCustomTitle = true;
    document.title = customTitle;
    isApplyingCustomTitle = false;
  }

  if (titleObserver) return; // Already observing

  titleObserver = new MutationObserver(() => {
    if (isApplyingCustomTitle) return;
    
    if (customTitle && document.title !== customTitle) {
      // The page changed the title (e.g. YouTube video change, notification badges).
      // Save it as the new original title, so if the user resets, they get the correct title.
      originalTitle = document.title;
      
      isApplyingCustomTitle = true;
      document.title = customTitle;
      isApplyingCustomTitle = false;
    }
  });

  titleObserver.observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true
  });
}

// Unlock and restore original page title
function unlockAndRestoreTitle() {
  if (titleObserver) {
    titleObserver.disconnect();
    titleObserver = null;
  }
  customTitle = null;
  if (originalTitle) {
    isApplyingCustomTitle = true;
    document.title = originalTitle;
    isApplyingCustomTitle = false;
  }
}

// Query custom title for this tab on script initialization
function initCustomTitle() {
  chrome.runtime.sendMessage({ action: "get_tab_title" }, (response) => {
    if (chrome.runtime.lastError) return;
    if (response && response.customTitle) {
      customTitle = response.customTitle;
      // Wait for documentElement to be available if needed
      if (document.documentElement) {
        applyAndLockTitle();
      } else {
        document.addEventListener('DOMContentLoaded', applyAndLockTitle);
      }
    }
  });
}

initCustomTitle();

// Listen for messages from background/popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "update_title_on_page") {
    const newTitle = message.title;
    if (newTitle && newTitle.trim().length > 0) {
      if (!customTitle) {
        originalTitle = document.title; // Save original before first override
      }
      customTitle = newTitle;
      applyAndLockTitle();
    } else {
      unlockAndRestoreTitle();
    }
  }

  if (message.action === "trigger_rename_dialog") {
    showRenameDialog();
  }
});

// Double click to close tab listener
document.addEventListener('dblclick', (event) => {
  // If extension double-click behavior is disabled globally or domain is excluded, do nothing
  if (!settings.enabled) return;
  if (isExcluded()) return;

  // Check modifier keys
  const modifier = settings.modifier;
  if (modifier === 'alt' && !event.altKey) return;
  if (modifier === 'shift' && !event.shiftKey) return;
  if (modifier === 'ctrl' && !(event.ctrlKey || event.metaKey)) return; // Ctrl or Cmd key
  if (modifier === 'none' && (event.altKey || event.shiftKey || event.ctrlKey || event.metaKey)) {
    // If modifier is none, but a key is pressed, ignore to prevent interference with other shortcuts
    return;
  }

  // Find target element
  const target = event.target;
  if (!target) return;

  // List of interactive tags we should ignore
  const interactiveTags = [
    'A', 'BUTTON', 'INPUT', 'TEXTAREA', 'SELECT', 'OPTION', 
    'LABEL', 'AUDIO', 'VIDEO', 'EMBED', 'OBJECT', 'IFRAME',
    'DETAILS', 'SUMMARY', 'CANVAS', 'SVG', 'PATH', 'IMAGE'
  ];
  
  if (interactiveTags.includes(target.tagName)) {
    return;
  }

  // Check interactive ARIA roles
  const interactiveRoles = [
    'button', 'link', 'checkbox', 'radio', 'textbox', 
    'menuitem', 'menuitemcheckbox', 'menuitemradio', 
    'tab', 'treeitem', 'option', 'switch', 'combobox'
  ];
  const role = target.getAttribute('role');
  if (role && interactiveRoles.includes(role.toLowerCase())) {
    return;
  }

  // Check if target is inside an interactive element
  if (target.closest('a, button, input, textarea, select, [role="button"], [role="link"]')) {
    return;
  }

  // Check if click was inside an editable element
  if (target.isContentEditable || target.closest('[contenteditable="true"]')) {
    return;
  }

  // Check if there is active text selection
  const selection = window.getSelection();
  if (selection && selection.toString().trim().length > 0) {
    return;
  }

  // Check CSS cursor. If cursor is pointer, it's likely a clickable item.
  const style = window.getComputedStyle(target);
  if (style && style.cursor === 'pointer') {
    if (target.tagName !== 'BODY' && target.tagName !== 'HTML') {
      return;
    }
  }

  // All safety checks passed. Send message to background script to close this tab.
  chrome.runtime.sendMessage({ action: "close_tab" });
});

// Beautiful Glassmorphic Tab Rename Modal (Shadow DOM Isolated)
function showRenameDialog() {
  // Check if dialog already exists
  let dialogContainer = document.getElementById('chrome-double-click-rename-dialog');
  if (dialogContainer) {
    const shadowRoot = dialogContainer.shadowRoot;
    const input = shadowRoot.querySelector('#rename-input');
    if (input) {
      input.focus();
      input.select();
    }
    return;
  }

  // Create container
  dialogContainer = document.createElement('div');
  dialogContainer.id = 'chrome-double-click-rename-dialog';
  dialogContainer.style.position = 'fixed';
  dialogContainer.style.top = '0';
  dialogContainer.style.left = '0';
  dialogContainer.style.width = '100vw';
  dialogContainer.style.height = '100vh';
  dialogContainer.style.zIndex = '9999999999';
  dialogContainer.style.display = 'flex';
  dialogContainer.style.justifyContent = 'center';
  dialogContainer.style.alignItems = 'center';
  dialogContainer.style.pointerEvents = 'auto';

  // Attach shadow root
  const shadowRoot = dialogContainer.attachShadow({ mode: 'open' });

  // HTML and CSS structure
  shadowRoot.innerHTML = `
    <style>
      :host {
        all: initial;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      }
      .backdrop {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(11, 13, 25, 0.4);
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
        opacity: 0;
        transition: opacity 0.3s ease;
      }
      .modal {
        position: relative;
        background: rgba(20, 22, 37, 0.85);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 16px;
        padding: 24px;
        width: 380px;
        box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4),
                    0 0 20px rgba(139, 92, 246, 0.15);
        backdrop-filter: blur(16px);
        -webkit-backdrop-filter: blur(16px);
        color: #f3f4f6;
        transform: scale(0.9);
        opacity: 0;
        transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.3s ease;
        box-sizing: border-box;
      }
      .modal.show, .backdrop.show {
        opacity: 1;
      }
      .modal.show {
        transform: scale(1);
      }
      .title {
        font-size: 16px;
        font-weight: 600;
        margin-bottom: 8px;
        background: linear-gradient(135deg, #ffffff, #9ca3af);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
      }
      .subtitle {
        font-size: 11px;
        color: #9ca3af;
        margin-bottom: 16px;
        line-height: 1.4;
      }
      .input-wrapper {
        position: relative;
        margin-bottom: 20px;
      }
      input {
        width: 100%;
        box-sizing: border-box;
        background: rgba(255, 255, 255, 0.04);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 8px;
        padding: 10px 14px;
        color: #f3f4f6;
        font-size: 14px;
        outline: none;
        transition: border-color 0.25s, box-shadow 0.25s;
      }
      input:focus {
        border-color: #8b5cf6;
        box-shadow: 0 0 0 2px rgba(139, 92, 246, 0.2);
      }
      .actions {
        display: flex;
        justify-content: flex-end;
        gap: 10px;
        align-items: center;
      }
      button {
        padding: 8px 16px;
        font-size: 12px;
        font-weight: 600;
        border-radius: 8px;
        cursor: pointer;
        border: none;
        transition: opacity 0.25s, transform 0.1s;
      }
      button:active {
        transform: scale(0.98);
      }
      .btn-cancel {
        background: rgba(255, 255, 255, 0.05);
        color: #f3f4f6;
        border: 1px solid rgba(255, 255, 255, 0.05);
      }
      .btn-cancel:hover {
        background: rgba(255, 255, 255, 0.1);
      }
      .btn-clear {
        background: rgba(239, 68, 68, 0.1);
        color: #ef4444;
        border: 1px solid rgba(239, 68, 68, 0.15);
        margin-right: auto;
      }
      .btn-clear:hover {
        background: rgba(239, 68, 68, 0.15);
      }
      .btn-save {
        background: linear-gradient(135deg, #8b5cf6, #ec4899);
        color: #ffffff;
        box-shadow: 0 2px 8px rgba(139, 92, 246, 0.3);
      }
      .btn-save:hover {
        opacity: 0.9;
      }
    </style>
    <div class="backdrop"></div>
    <div class="modal">
      <div class="title">タブの名前を変更</div>
      <div class="subtitle">このタブの新しい名前を入力してください。元の名前に戻すには「リセット」をクリックします。</div>
      <div class="input-wrapper">
        <input type="text" id="rename-input" placeholder="新しいタブ名" value="${customTitle || ''}">
      </div>
      <div class="actions">
        ${customTitle ? '<button class="btn-clear" id="btn-clear-title">リセット</button>' : ''}
        <button class="btn-cancel" id="btn-cancel-rename">キャンセル</button>
        <button class="btn-save" id="btn-save-rename">保存</button>
      </div>
    </div>
  `;

  document.body.appendChild(dialogContainer);

  const backdrop = shadowRoot.querySelector('.backdrop');
  const modal = shadowRoot.querySelector('.modal');
  const input = shadowRoot.querySelector('#rename-input');
  const btnCancel = shadowRoot.querySelector('#btn-cancel-rename');
  const btnSave = shadowRoot.querySelector('#btn-save-rename');
  const btnClear = shadowRoot.querySelector('#btn-clear-title');

  // Trigger animations
  setTimeout(() => {
    backdrop.classList.add('show');
    modal.classList.add('show');
    input.focus();
    input.select();
  }, 10);

  // Close Dialog function
  function closeDialog() {
    backdrop.classList.remove('show');
    modal.classList.remove('show');
    setTimeout(() => {
      dialogContainer.remove();
    }, 300);
  }

  // Event handlers
  btnCancel.addEventListener('click', closeDialog);
  backdrop.addEventListener('click', closeDialog);

  if (btnClear) {
    btnClear.addEventListener('click', () => {
      chrome.runtime.sendMessage({ action: "set_tab_title", title: null }, (res) => {
        if (res && res.success) {
          closeDialog();
        }
      });
    });
  }

  function handleSave() {
    const value = input.value.trim();
    chrome.runtime.sendMessage({ action: "set_tab_title", title: value ? value : null }, (res) => {
      if (res && res.success) {
        closeDialog();
      }
    });
  }

  btnSave.addEventListener('click', handleSave);

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      closeDialog();
    }
  });
}
