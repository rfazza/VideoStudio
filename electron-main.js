const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

// 0. ABSOLUTE FIX FOR NATIVE BINDING RESOLUTION
const Module = require("module");
const originalRequire = Module.prototype.require;

Module.prototype.require = function(id) {
  if (id === '@rspack/binding' && process.env.NODE_ENV !== 'development' && process.resourcesPath) {
    let bindingPath;
    try {
      bindingPath = Module._resolveFilename(id, this);
    } catch (e) {
      bindingPath = path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', '@rspack', 'binding', 'index.js');
    }
    
    if (bindingPath && bindingPath.includes('app.asar') && !bindingPath.includes('app.asar.unpacked')) {
      bindingPath = bindingPath.replace('app.asar', 'app.asar.unpacked');
    }
    
    if (bindingPath) {
      return originalRequire.call(this, bindingPath);
    }
  }
  return originalRequire.apply(this, arguments);
};

// Force Node.js module resolution to look inside app.asar.unpacked and resources root
if (process.env.NODE_ENV !== 'development' && process.resourcesPath) {
  module.paths.unshift(path.join(process.resourcesPath, "node_modules"));
  module.paths.unshift(path.join(process.resourcesPath, "app.asar.unpacked", "node_modules"));
}

// IPC Handlers
ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  });
  
  if (result.canceled) {
    return null;
  } else {
    return result.filePaths[0];
  }
});

// Simple isDev check to avoid dependency issues if npm install is delayed
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

// Production Log Path
const logPath = path.join(app.getPath('userData'), 'main.log');

function logToFile(msg) {
  const timestamp = new Date().toISOString();
  const formattedMsg = `[${timestamp}] ${msg}\n`;
  try {
    fs.appendFileSync(logPath, formattedMsg);
  } catch (e) {
    // Fallback if writing fails
  }
  console.log(msg);
}

let mainWindow;
let renderServerProcess;

/**
 * AUTO-START RENDER SERVER
 * Starts the existing render-server.js as a background child process.
 */
function startRenderServer() {
  logToFile('--- STARTING RENDER SERVER DIAGNOSTICS ---');
  logToFile(`App Packaged: ${app.isPackaged}`);
  logToFile(`Electron Version: ${process.versions.electron}`);
  logToFile(`Resources Path: ${process.resourcesPath}`);
  logToFile(`__dirname: ${__dirname}`);
  logToFile(`CWD: ${process.cwd()}`);

  // Test possible locations for the render server
  const possiblePaths = [
    path.join(process.resourcesPath, 'render-server.js'),
    path.join(process.resourcesPath, 'app.asar', 'render-server.js'),
    path.join(__dirname, 'render-server.js'),
    path.join(__dirname.replace('app.asar', 'app.asar.unpacked'), 'render-server.js'),
    path.join(app.getAppPath(), 'render-server.js')
  ];

  let serverPath = null;
  possiblePaths.forEach(p => {
    const exists = fs.existsSync(p);
    logToFile(`Path Check: ${p} -> ${exists ? 'EXISTS' : 'NOT FOUND'}`);
    if (exists && !serverPath) serverPath = p;
  });

  if (!serverPath) {
    logToFile('❌ CRITICAL ERROR: Could not locate render-server.js in any bundle location.');
    return;
  }

  const workingDir = isDev ? __dirname : process.resourcesPath;
  logToFile(`✅ Launching Render Server from CWD: ${workingDir}`);
  logToFile(`✅ Server executable path: ${serverPath}`);

  // Use spawn with process.execPath to avoid relying on system Node.js
  renderServerProcess = spawn(process.execPath, [serverPath], {
    stdio: ['ignore', 'pipe', 'pipe'],
    cwd: workingDir,
    env: { 
      ...process.env, 
      PORT: 3001, 
      IS_ELECTRON: 'true',
      ELECTRON_RUN_AS_NODE: '1',
      NODE_ENV: isDev ? 'development' : 'production'
    }
  });


  // Capture stdout
  renderServerProcess.stdout.on('data', (data) => {
    logToFile(`[Server Stdout]: ${data.toString().trim()}`);
  });

  // Capture stderr
  renderServerProcess.stderr.on('data', (data) => {
    logToFile(`[Server Stderr]: ${data.toString().trim()}`);
  });

  renderServerProcess.on('error', (err) => {
    logToFile(`❌ Render Server Process Error: ${err.message}`);
  });

  renderServerProcess.on('exit', (code) => {
    logToFile(`⚠️ Render Server Process Exited with code: ${code}`);
  });
}



function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 768,
    title: 'VideoStudio - By zzrco',
    icon: path.join(__dirname, 'public/icon.ico'),
    backgroundColor: '#0a0a0f', // Dark background for smooth loading
    show: false, // Don't show until ready-to-show to prevent flicker
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'), // Optional: if we need to expose APIs later
    },
  });

  // Hide native menu bar for cleaner look
  mainWindow.setMenuBarVisibility(false);

  // Load App: Dev Server or Static Build
  const startUrl = isDev 
    ? 'http://localhost:5173' 
    : `file://${path.join(__dirname, 'dist/index.html')}`;

  mainWindow.loadURL(startUrl);

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    if (isDev) {
      mainWindow.webContents.openDevTools({ mode: 'detach' });
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.on('ready', () => {
  startRenderServer();
  createWindow();
});

// Ensure the background render server is killed when the app quits
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  if (renderServerProcess) {
    console.log('[Electron Main] Shutting down background services...');
    renderServerProcess.kill();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});
