const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods to renderer process
contextBridge.exposeInMainWorld('electronAPI', {
    // Student authentication
    studentLogin: (credentials) => ipcRenderer.invoke('student-login', credentials),
    studentLogout: () => ipcRenderer.invoke('student-logout'),
    
    // System information
    getSystemInfo: () => ipcRenderer.invoke('get-system-info'),
    
    // Forgot password functionality
    forgotPassword: (data) => ipcRenderer.invoke('forgot-password', data),
    verifyDob: (data) => ipcRenderer.invoke('verify-dob', data),
    resetPassword: (data) => ipcRenderer.invoke('reset-password', data)
});

// Security measures
console.log('🔒 Kiosk preload script loaded - Security active');

// Block right-click context menu
window.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    console.log('🚫 Context menu blocked');
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

// Block certain keyboard shortcuts in renderer
window.addEventListener('keydown', (e) => {
    // Block developer tools and other shortcuts
    if (
        (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'J')) ||
        (e.ctrlKey && e.key === 'u') ||
        (e.key === 'F12')
    ) {
        e.preventDefault();
        console.log('🚫 Blocked shortcut:', e.key);
    }
});
