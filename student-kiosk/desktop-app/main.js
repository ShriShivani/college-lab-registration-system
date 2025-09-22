const { app, BrowserWindow, ipcMain, screen, dialog, globalShortcut, desktopCapturer } = require('electron');
const path = require('path');
const os = require('os');

// Use dynamic import for fetch which works across node versions and Electron
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

let mainWindow = null;
let currentSession = null;
let sessionActive = false;
let screenshotInterval = null;

const SERVER_URL = process.env.SERVER_URL || "http://localhost:5000";
const LAB_ID = process.env.LAB_ID || "LAB-01";

function createWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  mainWindow = new BrowserWindow({
    width,
    height,
    frame: false,
    fullscreen: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
    }
  });

  mainWindow.loadFile('student-interface.html');

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();

    globalShortcut.registerAll([
      'Alt+F4', 'Ctrl+W', 'Ctrl+Alt+Delete', 'Ctrl+Shift+Escape', 'Alt+Tab',
      'Escape', 'F11', 'Ctrl+R', 'F5', 'Ctrl+Shift+I', 'F12', 'Ctrl+U'
    ], () => false);
  });

  mainWindow.on('close', e => {
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

async function loginHandler(event, credentials) {
  try {
    const creds = {
      studentId: credentials.studentId,
      password: credentials.password,
      labId: LAB_ID,
    };

    const authRes = await fetch(`${SERVER_URL}/api/student-authenticate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(creds),
    });
    const authData = await authRes.json();

    if (!authData.success) return { success: false, error: authData.error || 'Authentication failed' };

    const sessionRes = await fetch(`${SERVER_URL}/api/student-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        studentName: authData.student.name,
        studentId: authData.student.studentId,
        computerName: os.hostname(),
        labId: LAB_ID,
        systemNumber: credentials.systemNumber
      }),
    });
    const sessionData = await sessionRes.json();

    if (!sessionData.success) return { success: false, error: sessionData.error || 'Session creation failed' };

    currentSession = { id: sessionData.sessionId, student: authData.student };
    sessionActive = true;

    mainWindow.minimize();

    startScreenshotStreaming();

    return { success: true, student: authData.student };
  } catch (error) {
    return { success: false, error: error.message || 'Unknown error' };
  }
}

// Handle both 'login' and 'student-login' for compatibility
ipcMain.handle('login', loginHandler);
ipcMain.handle('student-login', loginHandler);

ipcMain.handle('logout', async () => {
  if (!sessionActive || !currentSession) return { success: false, error: 'No active session' };

  try {
    stopScreenshotStreaming();

    await fetch(`${SERVER_URL}/api/student-logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: currentSession.id }),
    });

    sessionActive = false;
    currentSession = null;

    mainWindow.restore();
    mainWindow.focus();

    return { success: true };
  } catch (error) {
    return { success: false, error: error.message || 'Unknown error' };
  }
});

async function captureScreenshot() {
  if (!sessionActive || !currentSession) return;

  try {
    const primaryDisplay = screen.getPrimaryDisplay();
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: {
        width: primaryDisplay.size.width,
        height: primaryDisplay.size.height
      }
    });

    if (sources.length > 0) {
      const screenshot = sources[0].thumbnail.toDataURL();

      await fetch(`${SERVER_URL}/api/update-screenshot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: currentSession.id, screenshot }),
      });
    }
  } catch (err) {
    console.error('Screenshot capture error:', err);
  }
}

function startScreenshotStreaming() {
  if (screenshotInterval) return;
  screenshotInterval = setInterval(captureScreenshot, 10000);
}

function stopScreenshotStreaming() {
  if (screenshotInterval) {
    clearInterval(screenshotInterval);
    screenshotInterval = null;
  }
}

app.whenReady().then(createWindow);

app.on('window-all-closed', e => {
  e.preventDefault();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  stopScreenshotStreaming();
});

function gracefulLogout() {
  if (sessionActive && currentSession) {
    const payload = { sessionId: currentSession.id };
    fetch(`${SERVER_URL}/api/student-logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).finally(() => {
      // allow graceful shutdown after notifying
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
