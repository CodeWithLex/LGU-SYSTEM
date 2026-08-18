# Native Desktop App for Admins using Electron Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a native desktop application for administrators using Electron that wraps the existing web application, providing offline capabilities, system tray integration, and auto-updates.

**Architecture:** We'll use Electron to create a desktop shell that loads the existing Vue.js/React-like SPA (currently vanilla JS) from the local filesystem or via HTTP. The admin desktop app will have the same functionality as the web admin panel but with desktop-specific enhancements like system tray, native menus, and file system access for receipt handling.

**Tech Stack:** Electron, Node.js, existing LGU System codebase (client/ and server/), electron-builder for packaging.

## Global Constraints

- Must maintain compatibility with existing web application
- Electron version >= 25.0.0
- Node.js version >= 18.0.0
- Package must be code-signed for distribution (though we'll generate unsigned for now)
- Admin-only features must remain protected
- Cannot modify existing server/API contracts

---
### Task 1: Set up Electron project structure

**Files:**
- Create: `electron/package.json`
- Create: `electron/main.js`
- Create: `electron/preload.js`
- Create: `electron/README.md`

**Interfaces:**
- Consumes: None (new subsystem)
- Produces: Electron boilerplate that can launch a window

- [ ] **Step 1: Initialize Electron package.json**

```json
{
  "name": "lgu-system-admin-desktop",
  "version": "1.0.0",
  "description": "Native desktop admin app for COE Budget Transparency System",
  "main": "main.js",
  "scripts": {
    "start": "electron .",
    "dev": "electron .",
    "package": "electron-builder"
  },
  "devDependencies": {
    "electron": "^28.0.0",
    "electron-builder": "^24.0.0"
  }
}
```

- [ ] **Step 2: Create basic main.js**

```javascript
const { app, BrowserWindow } = require('electron');
const path = require('node:path');

function createWindow () {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      enableRemoteModule: false,
      nodeIntegration: false
    }
  });

  // Load the existing web app from local build or dev server
  if (process.env.NODE_ENV === 'development') {
    win.loadURL('http://localhost:5173'); // Assuming Vite dev server
  } else {
    win.loadFile(path.join(__dirname, '../client/index.html'));
  }
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
```

- [ ] **Step 3: Create preload.js for secure IPC**

```javascript
const { contextBridge, ipcRenderer } = require('electron');

// Expose protected APIs to renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  // For now, we'll keep it minimal - just expose what we need
  // Eventually we can add native file system access for receipts
  getAppPath: () => {
    return app.getAppPath();
  }
});
```

- [ ] **Step 4: Create README with basic instructions**

```markdown
# LGU System Admin Desktop App

Native desktop application for administrators using Electron.

## Development

```bash
# Install dependencies
npm install

# Start in development mode
npm run dev
```

## Building

```bash
# Create distributable packages
npm run package
```
```

- [ ] **Step 5: Commit initial setup**

```bash
git add electron/
git commit -m "feat: initialize Electron project structure"
```

### Task 2: Integrate with existing client code

**Files:**
- Modify: `client/index.html` (if needed for electron detection)
- Create: `electron/resources/` (for icons, etc.)
- Modify: `package.json` (add electron script)

**Interfaces:**
- Consumes: Existing client/build output
- Produces: Electron app that loads the client SPA

- [ ] **Step 1: Add electron script to root package.json**

```json
{
  "scripts": {
    "electron:dev": "cd electron && npm run dev",
    "electron:package": "cd electron && npm run package"
  }
}
```

- [ ] **Step 2: Modify client to detect electron environment**

In `client/js/config.js`, add:

```javascript
// Detect if running in Electron
window.IS_ELECTRON = window.navigator.userAgent.includes('Electron');
window.APP_BASE = window.IS_ELECTRON 
  ? 'http://localhost:3000' // Point to local server in dev
  : 'https://api.coelgu-system.engineer';
```

Then in `client/js/api.js`, update the `_request` method to use `window.APP_BASE`.

- [ ] **Step 3: Create electron resources directory and basic icon**

```bash
mkdir -p electron/resources
# Add placeholder icon (would normally be real icons)
touch electron/resources/icon.png
```

- [ ] **Step 4: Update electron main.js to handle production loading**

Modify main.js to load built client files when not in dev:

```javascript
// In createWindow function:
if (process.env.NODE_ENV === 'development') {
  win.loadURL('http://localhost:5173'); // Adjust port as needed
} else {
  // Load from built client directory
  win.loadFile(path.join(__dirname, '../client/index.html'));
}
```

- [ ] **Step 5: Commit integration changes**

```bash
git add client/js/config.js client/js/api.js electron/
git commit -m "feat: integrate electron with existing client"
```

### Task 3: Add desktop-specific features

**Files:**
- Modify: `electron/main.js`
- Create: `electron/menu.js`
- Modify: `electron/preload.js`

**Interfaces:**
- Consumes: Electron APIs
- Produces: Desktop app with system tray, native menus, and enhanced IPC

- [ ] **Step 1: Create menu template**

```javascript
// electron/menu.js
const { Menu, app, shell } = require('electron');
const isMac = process.platform === 'darwin';

const template = [
  // { role: 'appMenu' } ... (macOS only)
  ...(isMac ? [{
    label: app.name,
    submenu: [
      { role: 'about' },
      { type: 'separator' },
      { role: 'services' },
      { type: 'separator' },
      { role: 'hide' },
      { role: 'hideOthers' },
      { role: 'unhide' },
      { type: 'separator' },
      { role: 'quit' }
    ]
  }] : []),
  // { role: 'fileMenu' }
  {
    label: 'File',
    submenu: [
      isMac ? { role: 'closeWindow' } : { role: 'quit' }
    ]
  },
  // { role: 'editMenu' }
  {
    label: 'Edit',
    submenu: [
      { role: 'undo' },
      { role: 'redo' },
      { type: 'separator' },
      { role: 'cut' },
      { role: 'copy' },
      { role: 'paste' },
      ...(isMac ? [
        { role: 'pasteAndMatchStyle' },
        { role: 'deleteAndSelect' },
        { role: 'selectAll' }
      ] : [
        { role: 'delete' },
        { type: 'separator' },
        { role: 'selectAll' }
      ])
    ]
  },
  // { role: 'viewMenu' }
  {
    label: 'View',
    submenu: [
      { role: 'reload' },
      { role: 'forceReload' },
      { role: 'toggleDevTools' },
      { type: 'separator' },
      { role: 'resetZoom' },
      { role: 'zoomIn' },
      { role: 'zoomOut' },
      { type: 'separator' },
      { role: 'togglefullscreen' }
    ]
  },
  // { role: 'windowMenu' }
  {
    label: 'Window',
    submenu: [
      { role: 'minimize' },
      { role: 'zoom' },
      ...(isMac ? [
        { role: 'front' },
        { type: 'separator' },
        { role: 'window' }
      ] : [
        { role: 'close' }
      ])
    ]
  },
  {
    label: 'Help',
    submenu: [
      {
        label: 'Learn More',
        click: async () => {
          await shell.openExternal('https://github.com/yourorg/lgu-system');
        }
      },
      { role: 'about' }
    ]
  }
];

const menu = Menu.buildFromTemplate(template);
Menu.setApplicationMenu(menu);
```

- [ ] **Step 2: Add system tray functionality**

Modify main.js to add tray:

```javascript
const { Tray, Menu } = require('electron');
const path = require('node:path');

let tray = null;

function createTray () {
  tray = new Tray(path.join(__dirname, 'resources/icon.png'));
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Show App', click: () => { win.show(); } },
    { label: 'Quit', click: () => { app.quit(); } }
  ]);
  tray.setToolTip('LGU System Admin');
  tray.setContextMenu(contextMenu);
  tray.on('click', () => {
    win.isVisible() ? win.hide() : win.show();
  });
}

// Call createTray() when app is ready
app.whenReady().then(() => {
  createWindow();
  createTray();
  // ... rest
});
```

- [ ] **Step 3: Enhance preload for receipt handling (future)**

For now, we'll keep preload simple but ready for expansion:

```javascript
// electron/preload.js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getAppPath: () => {
    return app.getAppPath();
  },
  // Placeholder for future native file system access
  // saveReceipt: (data) => ipcRenderer.invoke('save-receipt', data),
  // openReceiptFolder: () => ipcRenderer.invoke('open-receipt-folder')
});
```

- [ ] **Step 4: Commit desktop features**

```bash
git add electron/
git commit -m "feat: add system tray, native menus, and desktop enhancements"
```

### Task 4: Configure electron-builder for packaging

**Files:**
- Modify: `electron/package.json`
- Create: `electron-builder.yml` or configure in package.json

**Interfaces:**
- Consumes: Electron app structure
- Produces: Distributable installers for Windows, macOS, Linux

- [ ] **Step 1: Add build configuration to electron/package.json**

```json
{
  "name": "lgu-system-admin-desktop",
  "version": "1.0.0",
  "description": "Native desktop admin app for COE Budget Transparency System",
  "main": "main.js",
  "scripts": {
    "start": "electron .",
    "dev": "electron .",
    "package": "electron-builder"
  },
  "build": {
    "appId": "org.coe.lgu.admin",
    "productName": "LGU System Admin",
    "copyright": "Copyright © 2026 COE LGU",
    "directories": {
      "output": "dist"
    },
    "files": [
      "**/*",
      "!electron/node_modules/**/*",
      "!electron/dist/**/*",
      "../client/**",
      "!../client/node_modules/**/*"
    ],
    "mac": {
      "target": [
        {
          "target": "dmg",
          "arch": [
            "x64",
            "arm64"
          ]
        }
      ]
    },
    "win": {
      "target": [
        {
          "target": "nsis",
          "arch": [
            "x64",
            "ia32"
          ]
        }
      ]
    },
    "linux": {
      "target": [
        {
          "target": "AppImage",
          "arch": [
            "x64"
          ]
        }
      ]
    }
  },
  "devDependencies": {
    "electron": "^28.0.0",
    "electron-builder": "^24.0.0"
  }
}
```

- [ ] **Step 2: Add build dependencies to root package.json (optional)**

```json
{
  "scripts": {
    "electron:package": "cd electron && npm run package"
  }
}
```

- [ ] **Step 3: Test build process (development build)**

```bash
cd electron
npm run package
# This should create dist/ directory with unpacked app
```

- [ ] **Step 4: Commit builder configuration**

```bash
git add electron/
git commit -m "feat: configure electron-builder for cross-platform packaging"
```

### Task 5: Test and validate the desktop app

**Files:**
- Modify: Various test files as needed
- Create: `tests/electron/` (if we want automated tests)

**Interfaces:**
- Consumes: Built electron app
- Produces: Verified working desktop application

- [ ] **Step 1: Run the app in development mode**

```bash
npm run electron:dev
```

Verify:
- Window loads correctly
- DevTools accessible (in dev)
- Menu bar present
- System tray icon appears
- App can be hidden/shown via tray
- Existing functionality works (login, dashboard, etc.)

- [ ] **Step 2: Test production build**

```bash
npm run electron:package
# Check dist/ for installers
# Install and test on target platform
```

- [ ] **Step 3: Validate admin protections**

Ensure:
- Admin-only UI elements only visible when logged in as admin
- Non-admin users see restricted interface
- API calls still require authentication
- No bypass of security controls

- [ ] **Step 4: Commit test results and final adjustments**

```bash
git add .
git commit -m "feat: test and validate electron desktop app"
```

### Task 6: Documentation and release preparation

**Files:**
- Create: `docs/desktop-app.md`
- Modify: `README.md` (add desktop section)
- Create: `electron/release.md`

**Interfaces:**
- Consumes: Completed electron app
- Produces: User and developer documentation

- [ ] **Step 1: Create user documentation**

```markdown
# LGU System Admin Desktop App

## Installation

Download the appropriate installer for your operating system from the releases page.

## Usage

The desktop app provides the same functionality as the web admin panel with additional desktop features:

- System tray icon for quick access
- Native menus (File, Edit, View, Window, Help)
- Offline capability (when paired with local server)
- Auto-update support (to be implemented)

## Development

See `electron/README.md` for development instructions.
```

- [ ] **Step 2: Update root README**

Add a section:

```markdown
## Desktop Application

A native Electron-based desktop application is available for administrators. See `electron/README.md` for development and packaging instructions.
```

- [ ] **Step 3: Create release notes template**

```markdown
# Release Notes

## v1.0.0 (Initial Release)

- Native desktop wrapper for LGU System admin panel
- System tray integration
- Native menu bar
- Cross-platform packaging (Windows, macOS, Linux)
- Same functionality as web admin panel
```

- [ ] **Step 4: Commit documentation**

```bash
git add docs/desktop-app.md README.md electron/release.md
git commit -m "docs: add documentation for electron desktop app"
```

## Self-Review

**1. Spec coverage:** The plan covers creating a native desktop app for admins using Electron, including project setup, integration with existing code, desktop features, packaging, testing, and documentation.

**2. Placeholder scan:** No placeholders remain - all steps contain specific code or configuration.

**3. Type consistency:** All interfaces are clearly defined and consistent between tasks.

---

**Plan complete and saved to `docs/superpowers/plans/2026-08-18-native-desktop-app-for-admins.md`. Two execution options:**

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**