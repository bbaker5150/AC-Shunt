const { app, BrowserWindow, Menu, ipcMain, nativeTheme } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

let mainWindow;
let backendProcess;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        title: "AC Shunt Calibration",
        icon: path.join(__dirname, 'favicon.ico'),
        autoHideMenuBar: true, // Hides File/Edit/View but allows 'Alt' to show it
        // Adding a neutral background color prevents a harsh white flash on boot in dark mode
        backgroundColor: '#2b2b2b', 
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            spellcheck: false
        },
    });

    // --- ZOOM LOGIC ---
    // Enables Ctrl + Mouse Wheel zooming
    mainWindow.webContents.on('zoom-changed', (event, zoomDirection) => {
        const currentZoom = mainWindow.webContents.getZoomFactor();
        if (zoomDirection === 'in') {
            mainWindow.webContents.setZoomFactor(currentZoom + 0.1);
        } else {
            mainWindow.webContents.setZoomFactor(Math.max(0.1, currentZoom - 0.1));
        }
    });

    // --- DEVTOOLS HOTKEY LOGIC ---
    // Listens for F12 or Ctrl+Shift+I to toggle DevTools
    mainWindow.webContents.on('before-input-event', (event, input) => {
        const isDevToolsHotkey = 
            input.key === 'F12' || 
            (input.control && input.shift && input.key.toLowerCase() === 'i');

        if (isDevToolsHotkey) {
            mainWindow.webContents.toggleDevTools();
            event.preventDefault();
        }
    });

    const isDev = !app.isPackaged;
    const startUrl = isDev
        ? 'http://localhost:3000'
        : `file://${path.join(__dirname, '../build/index.html')}`;

    mainWindow.loadURL(startUrl);

    if (isDev) {
        mainWindow.webContents.openDevTools();
    }

    mainWindow.on('closed', () => (mainWindow = null));
}

// --- THEME SYNC LOGIC ---
// Listens for the theme change from React and applies it to the native OS window
ipcMain.on('theme-changed', (event, theme) => {
    nativeTheme.themeSource = theme; // 'light' or 'dark'
});

function startBackend() {
    const isDev = !app.isPackaged;
    let backendPath;
    let backendDir;

    if (isDev) {
        // Pointing to 'dist' instead of 'build' to ensure DLLs are found
        backendDir = path.join('C:', 'Users', 'barry.baker', 'Development', 'AC Shunt', 'Backend', 'ac_shunt', 'dist', 'ac_shunt_backend');
        backendPath = path.join(backendDir, 'ac_shunt_backend.exe');
    } else {
        // Production path inside the packaged resources
        backendDir = path.join(process.resourcesPath, 'ac_shunt_backend');
        backendPath = path.join(backendDir, 'ac_shunt_backend.exe');
    }

    console.log("Launching Backend from:", backendPath);

    // spawn without shell:true is more robust for paths with spaces when providing a cwd
    backendProcess = spawn(backendPath, [], {
        cwd: backendDir,
        shell: false,
        windowsHide: true
    });

    backendProcess.stdout.on('data', (data) => {
        console.log(`Backend: ${data}`);
    });

    backendProcess.stderr.on('data', (data) => {
        const message = data.toString();
        // Categorize logs: 200/CONNECT/HANDSHAKE are normal logs, not errors
        if (message.includes('200') || message.includes('CONNECT') || message.includes('HANDSHAKING')) {
            console.log(`Backend Log: ${message}`);
        } else {
            console.error(`Backend Error: ${message}`);
        }
    });

    backendProcess.on('error', (err) => {
        console.error("Failed to start backend process. Verify the path exists:", err);
    });
}

// --- APP LIFECYCLE ---

app.on('ready', () => {
    // Nuclear option: Removes the default menu completely
    Menu.setApplicationMenu(null);
    
    startBackend();
    // 2-second delay gives the Django backend a head start before the UI loads
    setTimeout(createWindow, 2000);
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
    // Ensure the Django sidecar process is killed when Electron exits
    if (backendProcess) {
        backendProcess.kill();
    }
});