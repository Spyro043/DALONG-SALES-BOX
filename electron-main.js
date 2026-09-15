const { app, BrowserWindow, shell, Menu } = require("electron");
const path = require("path");
const { startServer } = require("./server");
const { migrateLegacy } = require('./legacy-migration');
if (process.env.DSB_DATA_DIR) app.setPath('userData', process.env.DSB_DATA_DIR);

let mainWindow;
let serverHandle;

async function createWindow() {
  Menu.setApplicationMenu(null);
  serverHandle = await startServer({
    port: 0,
    configDir: app.getPath("userData"),
    renderPdf: async (html) => {
      const preview = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
      try {
        await preview.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
        return await preview.webContents.printToPDF({ pageSize: 'A4', printBackground: true, preferCSSPageSize: true });
      } finally { preview.destroy(); }
    },
  });

  mainWindow = new BrowserWindow({
    show: false,
    autoHideMenuBar: true,
    width: 1480,
    height: 940,
    minWidth: 1100,
    minHeight: 720,
    title: "于大龙外贸助手 · Dragon sales box",
    icon: path.join(__dirname, 'assets', 'dsb.png'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url) || /^mailto:/i.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });

  await migrateLegacy({ BrowserWindow, userData: app.getPath('userData'), targetUrl: serverHandle.url });
  await mainWindow.loadURL(serverHandle.url);
  mainWindow.show();
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (serverHandle?.server) serverHandle.server.close();
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
