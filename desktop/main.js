// Electron main process for the ownTime desktop shell.
//
// In dev it loads the running Vite dev server; when packaged it loads the
// frontend's built dist. The renderer runs with contextIsolation on and
// nodeIntegration off; `webviewTag: true` is what lets the Web service embed a
// real browser view (unlike an <iframe>, an Electron <webview> is not blocked
// by a site's X-Frame-Options / CSP frame-ancestors).
const { app, BrowserWindow, shell } = require('electron');
const path = require('path');

const isDev = !app.isPackaged;
const DEV_URL = process.env.OWNTIME_DEV_URL || 'http://localhost:5173';
const PROD_INDEX = path.join(__dirname, '../webBrowser/frontend/dist/index.html');

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    backgroundColor: '#0b0b0c',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
      sandbox: false,
    },
  });

  if (isDev) {
    win.loadURL(DEV_URL);
  } else {
    win.loadFile(PROD_INDEX);
  }

  // Let real new-window requests (e.g. "Open in new tab") go to the OS browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
