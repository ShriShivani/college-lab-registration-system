const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods to the renderer process safely
contextBridge.exposeInMainWorld('electronAPI', {
  // Authentication
  studentLogin: (credentials) => ipcRenderer.invoke('student-login', credentials),
  studentLogout: () => ipcRenderer.invoke('student-logout'),

  // System info
  getSystemInfo: () => ipcRenderer.invoke('get-system-info'),
  getServerUrl: () => ipcRenderer.invoke('get-server-url'),

  // CRITICAL: Get screen sources via IPC from main process
  // This is the key fix - desktopCapturer is called in main process, not preload
  getScreenSources: () => ipcRenderer.invoke('get-screen-sources'),

  // Forgot password related placeholders (implement if needed)
  forgotPassword: (data) => ipcRenderer.invoke('forgot-password', data),
  verifyDob: (data) => ipcRenderer.invoke('verify-dob', data),
  resetPassword: (data) => ipcRenderer.invoke('reset-password', data),

  // Listen for session created event and stop live stream command
  onSessionCreated: (callback) => ipcRenderer.on('session-created', (event, data) => callback(data)),
  onStopLiveStream: (callback) => ipcRenderer.on('stop-live-stream', () => callback()),
});

// Security measures: block right click context menu
window.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  console.log('Context menu disabled');
});

// Block text selection
document.addEventListener('selectstart', (e) => {
  e.preventDefault();
});

// Block drag and drop
document.addEventListener('dragover', (e) => {
  e.preventDefault();
});
document.addEventListener('drop', (e) => {
  e.preventDefault();
});

// Block certain keyboard shortcuts like devtools
window.addEventListener('keydown', (e) => {
  if (
    (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'J')) ||
    (e.ctrlKey && e.key.toLowerCase() === 'u') ||
    e.key === 'F12'
  ) {
    e.preventDefault();
    console.log(`Blocked shortcut: ${e.key}`);
  }
});

console.log('✅ Preload script loaded with screen sources support via IPC');
