# LGU System Admin Desktop App

Native desktop application for administrators using Electron. Wraps the existing SPA located in `../client`.

## Project Structure

```
electron/
  package.json
  main.js         # Main process - creates BrowserWindow
  preload.js      # Secure bridge via contextBridge
  README.md
```

The app loads `../client/index.html` via `win.loadFile`.

## Development

```bash
# Install dependencies
npm install

# Start the app
npm start
# or
npm run dev
```

The BrowserWindow loads the local SPA from `../client/index.html`. Ensure the client build exists before running.

## Building

```bash
# Create distributable packages with electron-builder
npm run package
```

Build artifacts will be placed in `dist/`.

## Preload API

Renderer can access `window.electronAPI` with basic safe APIs:

- `electronAPI.platform`
- `electronAPI.versions`
- `electronAPI.ping()`
- `electronAPI.send(channel, data)`
- `electronAPI.receive(channel, callback)`

Extend as needed for native features.