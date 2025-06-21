# Vibe Scroll - Instagram Viewer

A VSCode extension that displays Instagram.com within the Visual Studio Code editor.

## Features

- Opens Instagram.com in a webview panel within VSCode
- Responsive design with a custom header
- Error handling for loading issues
- Retry functionality if Instagram fails to load

## Installation & Usage

### Development Setup

1. Clone this repository
2. Run `npm install` to install dependencies
3. Press `F5` to run the extension in a new Extension Development Host window

### Using the Extension

1. Open the Command Palette (`Cmd+Shift+P` on Mac, `Ctrl+Shift+P` on Windows/Linux)
2. Type "Vibe Scroll: Open Instagram" and press Enter
3. Instagram will open in a new webview panel

## Commands

- `vibe-scroll.openInstagram`: Opens Instagram in a webview panel

## Notes

- Instagram may block embedded access due to their security policies
- If Instagram doesn't load, the extension provides fallback options
- The extension maintains session state when the panel is hidden

## Development

- `npm run compile`: Compile TypeScript to JavaScript
- `npm run watch`: Watch for changes and compile automatically
- Use F5 in VSCode to launch the extension in debug mode

## Requirements

- VSCode 1.74.0 or higher
- Internet connection to access Instagram

## Known Limitations

- Instagram may not allow embedding due to X-Frame-Options headers
- Some Instagram features may not work properly in the embedded view
- Authentication state may not persist between sessions 