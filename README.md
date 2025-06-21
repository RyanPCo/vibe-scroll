# 🎬 Vibe Scroll - Instagram Reels Viewer

A VSCode extension that lets you browse Instagram Reels directly within your code editor using headless browser automation.

## ✨ Features

- **Browse Instagram Reels** - View Reels in a beautiful, native VSCode webview
- **Seamless Navigation** - Use keyboard shortcuts or buttons to scroll through Reels
- **Interact with Content** - Like and save Reels directly from VSCode
- **Session Management** - Automatic login persistence with secure cookie storage
- **Modern UI** - Instagram-like interface optimized for VSCode
- **Keyboard Shortcuts** - Efficient navigation with vim-like keybindings

## 🚀 Quick Start

1. **Install Dependencies**: The extension will automatically install required dependencies
2. **Open Command Palette**: `Cmd/Ctrl + Shift + P`
3. **Run Command**: Type "Instagram Reels: Start Scrolling" and press Enter
4. **Login**: Complete Instagram login in the browser window that opens
5. **Start Scrolling**: Enjoy browsing Reels in VSCode!

## ⌨️ Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `↓` or `j` | Next Reel |
| `↑` or `k` | Previous Reel |
| `l` | Like Current Reel |
| `s` | Save Current Reel |
| `o` | Open in Browser |
| `r` | Refresh |

## 🎯 Commands

- `Instagram Reels: Start Scrolling` - Launch the Reels viewer

## 🛠️ Technical Details

### Architecture

- **Puppeteer Controller** - Handles Instagram automation and reel extraction
- **Webview Panel** - Provides the user interface within VSCode
- **Media Bridge** - Optional local server for media proxying
- **Session Management** - Secure cookie storage for login persistence

### Dependencies

- **Puppeteer** - For browser automation
- **Express** - Media bridge server
- **WebSocket** - Real-time communication
- **TypeScript** - Type-safe development

## 🔧 Configuration

The extension works out of the box with no configuration required. Session cookies are automatically stored in:
```
<extension-path>/cookies/instagram.json
```

## 🐛 Troubleshooting

### Chrome Not Found
If you get a Chrome executable error:
1. Make sure Google Chrome is installed
2. Check the path in `puppeteerController.ts` matches your Chrome installation

### Login Issues
- Clear cookies by deleting `cookies/instagram.json`
- Try logging in through the browser manually first
- Check if Instagram has any security restrictions on your account

### Performance Issues
- Close other browser instances to free up memory
- Restart VSCode if the extension becomes unresponsive

## 🔐 Privacy & Security

- **Local Storage**: All session data is stored locally on your machine
- **No Data Collection**: This extension does not collect or transmit any user data
- **Secure Authentication**: Uses Instagram's official login flow
- **Cookie Management**: Session cookies are encrypted and stored securely

## 📦 Development

### Setup
```bash
npm install
npm run compile
```

### Debug
1. Open this project in VSCode
2. Press `F5` to launch Extension Development Host
3. Run the extension command in the new window

### Build
```bash
npm run vscode:prepublish
```

## 🤝 Contributing

Contributions are welcome! Please feel free to submit issues and pull requests.

## 📄 License

MIT License - see LICENSE file for details.

## ⚠️ Disclaimer

This extension is for educational and personal use only. Please respect Instagram's Terms of Service and rate limits. The extension uses automated browsing which may be subject to Instagram's policies.

---

**Note**: This extension requires an active Instagram account and Google Chrome browser to function properly. 