interface PopupState {
  enabled: boolean;
  connected: boolean;
  reconnecting: boolean;
  serverAddress: string;
  tabCount: number;
}

const toggleEl = document.getElementById('toggle') as HTMLInputElement;
const toggleLabelEl = document.getElementById('toggle-label')!;
const statusDotEl = document.getElementById('status-dot')!;
const statusTextEl = document.getElementById('status-text')!;
const addressInputEl = document.getElementById('address-input') as HTMLInputElement;
const saveBtnEl = document.getElementById('save-btn')!;
const tabCountEl = document.getElementById('tab-count')!;

function updateUI(state: PopupState) {
  // Toggle
  toggleEl.checked = state.enabled;
  toggleLabelEl.textContent = state.enabled ? 'ON' : 'OFF';

  // Connection status
  statusDotEl.className = 'status-dot';
  if (state.reconnecting) {
    statusDotEl.classList.add('reconnecting');
    statusTextEl.textContent = 'Reconnecting';
  } else if (state.connected) {
    statusDotEl.classList.add('connected');
    statusTextEl.textContent = 'Connected';
  } else {
    statusDotEl.classList.add('disconnected');
    statusTextEl.textContent = 'Disconnected';
  }

  // Server address
  addressInputEl.value = state.serverAddress;

  // Tab count
  tabCountEl.textContent = String(state.tabCount);
}

// Load initial state
chrome.runtime.sendMessage({ action: 'getState' }, (response: PopupState) => {
  if (response) {
    updateUI(response);
  }
});

// Toggle handler
toggleEl.addEventListener('change', () => {
  chrome.runtime.sendMessage({ action: 'toggle' }, () => {
    // Re-fetch full state after toggle
    chrome.runtime.sendMessage({ action: 'getState' }, (state: PopupState) => {
      if (state) updateUI(state);
    });
  });
});

// Save address handler
saveBtnEl.addEventListener('click', () => {
  const address = addressInputEl.value.trim();
  if (!address) return;
  chrome.runtime.sendMessage({ action: 'setAddress', address }, () => {
    // Re-fetch full state after address change
    setTimeout(() => {
      chrome.runtime.sendMessage({ action: 'getState' }, (state: PopupState) => {
        if (state) updateUI(state);
      });
    }, 300);
  });
});
