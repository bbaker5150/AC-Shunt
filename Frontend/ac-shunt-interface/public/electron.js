const { app, BrowserWindow, Menu, MenuItem, ipcMain, nativeTheme } = require('electron');
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
        autoHideMenuBar: true,
        backgroundColor: '#2b2b2b', 
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            spellcheck: false
        },
    });

    const isDev = !app.isPackaged;

    // --- CONTEXT MENU (INSPECT ELEMENT) ---
    mainWindow.webContents.on('context-menu', (event, params) => {
        if (isDev) {
            const menu = new Menu();
            menu.append(new MenuItem({
                label: 'Inspect Element',
                click: () => {
                    mainWindow.webContents.inspectElement(params.x, params.y);
                }
            }));
            menu.popup({ window: mainWindow, x: params.x, y: params.y });
        }
    });

    // --- ZOOM LOGIC ---
    mainWindow.webContents.on('zoom-changed', (event, zoomDirection) => {
        const currentZoom = mainWindow.webContents.getZoomFactor();
        if (zoomDirection === 'in') {
            mainWindow.webContents.setZoomFactor(currentZoom + 0.1);
        } else {
            mainWindow.webContents.setZoomFactor(Math.max(0.1, currentZoom - 0.1));
        }
    });

    // --- DEVTOOLS HOTKEY ---
    mainWindow.webContents.on('before-input-event', (event, input) => {
        const isDevToolsHotkey = 
            input.key === 'F12' || 
            (input.control && input.shift && input.key.toLowerCase() === 'i');
        if (isDevToolsHotkey) {
            mainWindow.webContents.toggleDevTools();
            event.preventDefault();
        }
    });

    const startUrl = isDev
        ? 'http://localhost:3000'
        : `file://${path.join(__dirname, '../build/index.html')}`;

    mainWindow.loadURL(startUrl);
    
    if (isDev) mainWindow.webContents.openDevTools();

    mainWindow.on('closed', () => (mainWindow = null));
}

ipcMain.on('theme-changed', (event, theme) => {
    nativeTheme.themeSource = theme;
});

function startBackend() {
    const isDev = !app.isPackaged;
    let backendPath;
    let backendArgs = [];
    let backendDir;

    if (isDev) {
        // Adjust the number of '..' based on where electron.js is. 
        // If in public/electron.js, '..', '..', '..' hits the Root.
        const projectRoot = path.join(__dirname, '..', '..', '..');

        backendDir = path.join(projectRoot, 'Backend', 'ac_shunt');
        backendPath = path.join(projectRoot, 'venv', 'Scripts', 'python.exe');
        backendArgs = [path.join(backendDir, 'entry_point.py')]; 
    } else {
        backendDir = path.join(process.resourcesPath, 'ac_shunt_backend');
        backendPath = path.join(backendDir, 'ac_shunt_backend.exe');
    }

    console.log("Launching Backend from:", backendPath);

    backendProcess = spawn(backendPath, backendArgs, {
        cwd: backendDir,
        shell: false,
        windowsHide: true
    });

    backendProcess.stdout.on('data', (data) => {
        console.log(`Backend: ${data}`);
    });

    backendProcess.stderr.on('data', (data) => {
        const message = data.toString();
        if (message.includes('200') || message.includes('CONNECT') || message.includes('HANDSHAKE')) {
            // console.log(`Backend Log: ${message}`);
        } else {
            // console.error(`Backend Error: ${message}`);
        }
    });

    backendProcess.on('error', (err) => {
        console.error("Backend failed to start:", err);
    });
}

app.on('ready', () => {
    Menu.setApplicationMenu(null);
    startBackend();
    setTimeout(createWindow, 5000);
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
    if (backendProcess) {
        backendProcess.kill();
    }
});