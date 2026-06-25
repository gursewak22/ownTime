// Exposes a minimal, safe flag so the frontend can detect it is running inside
// the desktop shell and render a real <webview> instead of an <iframe>.
const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('ownTimeDesktop', {
  isDesktop: true,
  platform: process.platform,
});
