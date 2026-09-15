const fs = require('fs');
const path = require('path');
const http = require('http');

async function migrateLegacy({ BrowserWindow, userData, targetUrl }) {
  const marker = path.join(userData, 'dsb-legacy-migration.json');
  if (fs.existsSync(marker)) return;
  const storage = path.join(userData, 'Local Storage', 'leveldb');
  if (!fs.existsSync(storage)) return;
  const origins = new Set();
  for (const name of fs.readdirSync(storage)) {
    if (!/\.(ldb|log)$/.test(name)) continue;
    try {
      const content = fs.readFileSync(path.join(storage, name)).toString('latin1');
      for (const match of content.matchAll(/http:\/\/localhost:(\d{1,5})/g)) origins.add(Number(match[1]));
    } catch { /* Chromium can briefly lock an active log. */ }
  }
  const customers = [], failed = [];
  for (const port of origins) {
    if (port < 1024 || port > 65535 || port === Number(new URL(targetUrl).port)) continue;
    const server = http.createServer((req, res) => { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end('<!doctype html><html><body></body></html>'); });
    const opened = await new Promise(resolve => { server.once('error', () => resolve(false)); server.listen(port, '127.0.0.1', () => resolve(true)); });
    if (!opened) { failed.push(port); continue; }
    const window = new BrowserWindow({ show: false, webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false } });
    try {
      await window.loadURL(`http://localhost:${port}`);
      const records = await window.webContents.executeJavaScript('JSON.parse(localStorage.getItem("outreach-desk-leads") || "[]")');
      if (Array.isArray(records)) customers.push(...records);
    } catch { failed.push(port); }
    finally { window.destroy(); await new Promise(resolve => server.close(resolve)); }
  }
  if (customers.length) {
    const response = await fetch(targetUrl + '/api/workspace/migrate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ customers }) });
    if (!response.ok) throw new Error('旧客户数据迁移未完成；原始数据已保留');
  }
  if (!failed.length) fs.writeFileSync(marker, JSON.stringify({ completedAt: new Date().toISOString(), scannedOrigins: origins.size, recovered: customers.length }));
}
module.exports = { migrateLegacy };
