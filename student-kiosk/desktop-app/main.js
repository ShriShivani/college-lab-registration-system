const { app, BrowserWindow, ipcMain, screen, dialog, globalShortcut, desktopCapturer } = require('electron');
const path = require('path');
const os = require('os');
const io = require('socket.io-client');
const https = require('https');
const http = require('http');

let mainWindow = null;
let isSessionActive = false;
let currentSession = null;
let socket = null;
let screenshotInterval = null;

const CENTRAL_SERVER = 'http://localhost:5000';

// Auto-start configuration
app.setLoginItemSettings({
  openAtLogin: true,
  openAsHidden: false
});

// Single instance
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

function createKioskWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  mainWindow = new BrowserWindow({
    width: width,
    height: height,
    x: 0,
    y: 0,
    frame: false,
    alwaysOnTop: true,
    fullscreen: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    closable: false,
    skipTaskbar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      webSecurity: false
    },
    show: false
  });

  mainWindow.loadFile('student-interface.html');

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();

    globalShortcut.registerAll([
      'Alt+F4', 'Ctrl+W', 'Ctrl+Alt+Delete', 
      'Ctrl+Shift+Escape', 'Alt+Tab', 'Escape',
      'F11', 'Ctrl+R', 'F5', 'Ctrl+Shift+I',
      'F12', 'Ctrl+U', 'Ctrl+Shift+J'
    ], () => false);

    console.log('🔒 KIOSK MODE ACTIVE');
  });

  mainWindow.on('close', (event) => {
    if (!isSessionActive) {
      event.preventDefault();
      showLoginRequired();
    }
  });

  mainWindow.on('blur', () => {
    if (!isSessionActive) {
      setTimeout(() => {
        if (mainWindow && !isSessionActive) {
          mainWindow.focus();
        }
      }, 100);
    }
  });
}

function showLoginRequired() {
  if (!mainWindow) return;
  
  dialog.showMessageBox(mainWindow, {
    type: 'warning',
    title: '🔒 Student Login Required',
    message: 'You must log in to use this computer',
    buttons: ['Continue'],
    defaultId: 0
  });
}

// Connect to server
function connectToCentralServer() {
  try {
    socket = io(CENTRAL_SERVER);

    socket.on('connect', () => {
      console.log('✅ Connected to server');
      socket.emit('computer-online', {
        computerName: os.hostname(),
        timestamp: new Date().toISOString()
      });
    });

    socket.on('disconnect', () => {
      console.log('❌ Disconnected from server');
    });
  } catch (error) {
    console.error('Server connection failed:', error);
  }
}

// HTTP Request function
function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const client = urlObj.protocol === 'https:' ? https : http;
    
    const requestOptions = {
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      }
    };

    const req = client.request(url, requestOptions, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve({ success: false, error: 'Invalid response' });
        }
      });
    });
    
    req.on('error', (error) => {
      resolve({ success: false, error: error.message });
    });
    
    if (options.body) {
      req.write(options.body);
    }
    
    req.end();
  });
}

// IPC Handlers
ipcMain.handle('student-login', async (event, credentials) => {
  try {
    console.log('🔑 Login attempt:', credentials.studentId);

    // Authenticate
    const authResult = await makeRequest(`${CENTRAL_SERVER}/api/student-authenticate`, {
      method: 'POST',
      body: JSON.stringify({
        studentId: credentials.studentId,
        password: credentials.password
      })
    });
    
    if (!authResult.success) {
      return { success: false, error: authResult.error || 'Authentication failed' };
    }

    // Create session
    const sessionResult = await makeRequest(`${CENTRAL_SERVER}/api/student-login`, {
      method: 'POST',
      body: JSON.stringify({
        studentName: authResult.student.name,
        studentId: authResult.student.studentId,
        computerName: os.hostname(),
        labNumber: credentials.labNumber,
        systemNumber: credentials.systemNumber
      })
    });

    if (sessionResult.success) {
      currentSession = {
        sessionId: sessionResult.sessionId,
        student: authResult.student,
        loginTime: new Date()
      };

      isSessionActive = true;

      // UNLOCK COMPUTER
      mainWindow.setAlwaysOnTop(false);
      mainWindow.setFullScreen(false);
      mainWindow.minimize();

      startScreenSharing();

      console.log(`✅ Login successful: ${authResult.student.name}`);
      
      return { 
        success: true, 
        sessionId: sessionResult.sessionId,
        student: authResult.student
      };
    } else {
      return { success: false, error: sessionResult.error || 'Session creation failed' };
    }
  } catch (error) {
    console.error('Login error:', error);
    return { success: false, error: 'Network connection failed' };
  }
});

ipcMain.handle('student-logout', async () => {
  if (!currentSession) return { success: false, error: 'No active session' };

  try {
    await makeRequest(`${CENTRAL_SERVER}/api/student-logout`, {
      method: 'POST',
      body: JSON.stringify({ sessionId: currentSession.sessionId })
    });

    stopScreenSharing();

    currentSession = null;
    isSessionActive = false;

    // LOCK COMPUTER
    mainWindow.setAlwaysOnTop(true);
    mainWindow.setFullScreen(true);
    mainWindow.restore();
    mainWindow.focus();

    console.log('🔒 Logout successful');
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-system-info', () => ({
  computerName: os.hostname(),
  username: os.userInfo().username,
  timestamp: new Date().toISOString()
}));

ipcMain.handle('forgot-password', async (event, data) => {
  try {
    const result = await makeRequest(`${CENTRAL_SERVER}/api/forgot-password`, {
      method: 'POST',
      body: JSON.stringify(data)
    });
    return result;
  } catch (error) {
    return { success: false, error: 'Network error' };
  }
});

ipcMain.handle('verify-dob', async (event, data) => {
  try {
    const result = await makeRequest(`${CENTRAL_SERVER}/api/verify-dob`, {
      method: 'POST',
      body: JSON.stringify(data)
    });
    return result;
  } catch (error) {
    return { success: false, error: 'Network error' };
  }
});

ipcMain.handle('reset-password', async (event, data) => {
  try {
    const result = await makeRequest(`${CENTRAL_SERVER}/api/reset-password`, {
      method: 'POST',
      body: JSON.stringify(data)
    });
    return result;
  } catch (error) {
    return { success: false, error: 'Network error' };
  }
});

// Screen sharing
function startScreenSharing() {
  if (screenshotInterval) return;
  
  captureScreen();
  screenshotInterval = setInterval(captureScreen, 10000);
}

function stopScreenSharing() {
  if (screenshotInterval) {
    clearInterval(screenshotInterval);
    screenshotInterval = null;
  }
}

async function captureScreen() {
  if (!currentSession) return;

  try {
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 800, height: 600 }
    });

    if (sources.length > 0) {
      const screenshot = sources[0].thumbnail.toDataURL().split(',')[1];

      makeRequest(`${CENTRAL_SERVER}/api/update-screenshot`, {
        method: 'POST',
        body: JSON.stringify({
          sessionId: currentSession.sessionId,
          screenshot
        })
      }).catch(console.error);

      if (socket && socket.connected) {
        socket.emit('screen-share', {
          computerName: os.hostname(),
          screenshot,
          timestamp: new Date().toISOString()
        });
      }
    }
  } catch (error) {
    console.error('Screen capture error:', error);
  }
}

// App events
app.whenReady().then(() => {
  createKioskWindow();
  connectToCentralServer();
});

app.on('window-all-closed', (event) => {
  event.preventDefault();
});

app.on('before-quit', (event) => {
  if (!isSessionActive) {
    event.preventDefault();
    showLoginRequired();
  }
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  if (socket) socket.disconnect();
  stopScreenSharing();
});

console.log('🎯 COLLEGE LAB KIOSK STARTED');
console.log(`📍 Computer: ${os.hostname()}`);
