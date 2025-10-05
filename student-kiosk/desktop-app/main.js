const { app, BrowserWindow, ipcMain, screen, dialog, globalShortcut, desktopCapturer } = require('electron');
const path = require('path');
const os = require('os');

const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

// Enable screen capturing
app.commandLine.appendSwitch('enable-usermedia-screen-capturing');
app.commandLine.appendSwitch('auto-select-desktop-capture-source', 'Entire screen');
app.commandLine.appendSwitch('enable-features', 'MediaStream,GetDisplayMedia');
app.commandLine.appendSwitch('disable-features', 'OutOfBlinkCors');
app.commandLine.appendSwitch('disable-web-security');

let mainWindow = null;
let currentSession = null;
let sessionActive = false;

const SERVER_URL = 'http://10.10.46.182:8000';
const LAB_ID = process.env.LAB_ID || "LAB-01";

function createWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  mainWindow = new BrowserWindow({
    width,
    height,
    frame: true,
    fullscreen: false,
    alwaysOnTop: false,
    skipTaskbar: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      enableBlinkFeatures: 'GetDisplayMedia',
      webSecurity: false
    }
  });

  mainWindow.webContents.session.setPermissionRequestHandler((webContents, permission, callback) => {
    console.log('🔐 Permission requested:', permission);
    if (permission === 'media' || permission === 'display-capture') {
      callback(true);
    } else {
      callback(false);
    }
  });

  mainWindow.webContents.session.setPermissionCheckHandler((webContents, permission) => {
    console.log('🔐 Permission check:', permission);
    return true;
  });

  mainWindow.loadFile('student-interface.html');

  // Open DevTools in detached mode for debugging
  mainWindow.webContents.openDevTools({ mode: 'detach' });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();
    
    globalShortcut.registerAll([
      'Alt+F4', 'Ctrl+W', 'Ctrl+Alt+Delete', 'Ctrl+Shift+Escape', 
      'Alt+Tab', 'Escape', 'F11', 'Ctrl+R', 'F5', 'Ctrl+Shift+I', 
      'F12', 'Ctrl+U'
    ], () => {
      console.log('🚫 Keyboard shortcut blocked');
      return false;
    });
  });

  mainWindow.on('close', (e) => {
    if (!sessionActive) {
      e.preventDefault();
      dialog.showMessageBox(mainWindow, {
        type: 'warning',
        buttons: ['OK'],
        title: 'Operation Denied',
        message: 'You must be logged in to close the application.'
      });
    }
  });
}

// Handle screen sources request
ipcMain.handle('get-screen-sources', async () => {
  try {
    const sources = await desktopCapturer.getSources({ 
      types: ['screen', 'window'],
      thumbnailSize: { width: 1920, height: 1080 }
    });
    console.log('✅ desktopCapturer returned', sources.length, 'sources');
    return sources;
  } catch (error) {
    console.error('❌ desktopCapturer error:', error);
    throw error;
  }
});

// Handle student login
ipcMain.handle('student-login', async (event, credentials) => {
  try {
    const creds = {
      studentId: credentials.studentId,
      password: credentials.password,
      labId: LAB_ID,
    };

    console.log('🔐 Attempting authentication for:', creds.studentId);

    const authRes = await fetch(`${SERVER_URL}/api/student-authenticate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(creds),
    });
    const authData = await authRes.json();

    if (!authData.success) {
      console.error('❌ Authentication failed:', authData.error);
      return { success: false, error: authData.error || 'Authentication failed' };
    }

    console.log('✅ Authentication successful for:', authData.student.name);

    const sessionRes = await fetch(`${SERVER_URL}/api/student-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        studentName: authData.student.name,
        studentId: authData.student.studentId,
        computerName: os.hostname(),
        labId: LAB_ID,
        systemNumber: credentials.systemNumber || "default"
      }),
    });
    const sessionData = await sessionRes.json();

    if (!sessionData.success) {
      console.error('❌ Session creation failed:', sessionData.error);
      return { success: false, error: sessionData.error || 'Session creation failed' };
    }

    console.log('✅ Session created:', sessionData.sessionId);

    currentSession = { id: sessionData.sessionId, student: authData.student };
    sessionActive = true;

    // Notify renderer to start screen streaming with delay
    setTimeout(() => {
      console.log('🎬 Sending session-created event to renderer:', sessionData.sessionId);
      mainWindow.webContents.send('session-created', {
        sessionId: sessionData.sessionId,
        serverUrl: SERVER_URL
      });
    }, 1000);

    // Don't minimize during testing - comment out for production
    // setTimeout(() => {
    //   mainWindow.minimize();
    // }, 1500);

    return { 
      success: true, 
      student: authData.student, 
      sessionId: sessionData.sessionId 
    };
  } catch (error) {
    console.error('❌ Login error:', error);
    return { success: false, error: error.message || 'Unknown error' };
  }
});

// Handle student logout
ipcMain.handle('student-logout', async () => {
  if (!sessionActive || !currentSession) {
    return { success: false, error: 'No active session' };
  }

  try {
    console.log('🚪 Logging out session:', currentSession.id);

    mainWindow.webContents.send('stop-live-stream');

    await fetch(`${SERVER_URL}/api/student-logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: currentSession.id }),
    });

    console.log('✅ Logout successful');

    sessionActive = false;
    currentSession = null;

    mainWindow.restore();
    mainWindow.focus();

    return { success: true };
  } catch (error) {
    console.error('❌ Logout error:', error);
    return { success: false, error: error.message || 'Unknown error' };
  }
});

// Get system information
ipcMain.handle('get-system-info', async () => {
  return {
    hostname: os.hostname(),
    platform: os.platform(),
    arch: os.arch(),
    cpus: os.cpus(),
    memory: os.totalmem()
  };
});

// Get server URL
ipcMain.handle('get-server-url', async () => {
  return SERVER_URL;
});

app.whenReady().then(createWindow);

app.on('window-all-closed', (e) => {
  e.preventDefault();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

function gracefulLogout() {
  if (sessionActive && currentSession) {
    const payload = { sessionId: currentSession.id };
    fetch(`${SERVER_URL}/api/student-logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).finally(() => {
      app.quit();
    });
  } else {
    app.quit();
  }
}

process.on('SIGINT', (signal) => {
  console.log('SIGINT received, logging out and quitting...');
  gracefulLogout();
});

process.on('SIGTERM', (signal) => {
  console.log('SIGTERM received, logging out and quitting...');
  gracefulLogout();
});

app.on('before-quit', (e) => {
  if (sessionActive) {
    e.preventDefault();
    gracefulLogout();
  }
});
