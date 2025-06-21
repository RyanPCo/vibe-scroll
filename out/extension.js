"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mediaBridge = exports.puppeteerController = exports.deactivate = exports.activate = void 0;
const vscode = require("vscode");
const puppeteerController_1 = require("./controller/puppeteerController");
const reelsWebview_1 = require("./panels/reelsWebview");
const mediaBridge_1 = require("./server/mediaBridge");
let puppeteerController;
exports.puppeteerController = puppeteerController;
let mediaBridge;
exports.mediaBridge = mediaBridge;
function activate(context) {
    console.log('🎬 Instagram Reels Viewer extension is now active!');
    // Register the main command
    const disposable = vscode.commands.registerCommand('instagramReels.scroll', async () => {
        try {
            await startInstagramReelsViewer(context);
        }
        catch (error) {
            console.error('Failed to start Instagram Reels viewer:', error);
            vscode.window.showErrorMessage(`Failed to start Instagram Reels viewer: ${error.message}`);
        }
    });
    context.subscriptions.push(disposable);
    // Handle extension deactivation
    context.subscriptions.push(new vscode.Disposable(() => {
        cleanup();
    }));
}
exports.activate = activate;
async function startInstagramReelsViewer(context) {
    try {
        // Show progress while initializing
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Starting Instagram Reels Viewer",
            cancellable: true
        }, async (progress, token) => {
            // Check if already running
            if (puppeteerController?.isInitialized()) {
                reelsWebview_1.ReelsWebviewPanel.createOrShow(context.extensionUri, puppeteerController);
                return;
            }
            progress.report({ increment: 20, message: "Initializing Puppeteer controller..." });
            // Initialize Puppeteer controller
            exports.puppeteerController = puppeteerController = new puppeteerController_1.PuppeteerController(context.extensionPath);
            // Set up controller event handlers
            setupControllerEventHandlers();
            progress.report({ increment: 40, message: "Starting media bridge server..." });
            // Initialize media bridge (optional)
            try {
                exports.mediaBridge = mediaBridge = new mediaBridge_1.MediaBridge({
                    port: 3000,
                    corsOrigin: '*'
                });
                await mediaBridge.start();
            }
            catch (error) {
                console.warn('Failed to start media bridge:', error);
                // Continue without media bridge
            }
            progress.report({ increment: 70, message: "Creating webview panel..." });
            // Create and show webview panel
            reelsWebview_1.ReelsWebviewPanel.createOrShow(context.extensionUri, puppeteerController);
            progress.report({ increment: 100, message: "Instagram Reels Viewer ready!" });
            // Show success message
            vscode.window.showInformationMessage('🎬 Instagram Reels Viewer started! The browser window will open for Instagram login if needed.');
        });
    }
    catch (error) {
        console.error('Error starting Instagram Reels viewer:', error);
        throw error;
    }
}
function setupControllerEventHandlers() {
    if (!puppeteerController)
        return;
    puppeteerController.on('initialized', () => {
        console.log('✅ Puppeteer controller initialized');
    });
    puppeteerController.on('loginRequired', () => {
        vscode.window.showWarningMessage('🔐 Instagram login required. Please click "Login to Instagram" in the webview.', 'Open Webview').then(selection => {
            if (selection === 'Open Webview') {
                vscode.commands.executeCommand('instagramReels.scroll');
            }
        });
    });
    puppeteerController.on('manualLoginRequired', () => {
        vscode.window.showInformationMessage('🌐 Please complete your Instagram login in the browser window that opened.');
    });
    puppeteerController.on('reelsLoaded', () => {
        console.log('✅ Instagram Reels loaded successfully');
    });
    puppeteerController.on('reelChanged', (index) => {
        console.log(`📱 Switched to reel #${index + 1}`);
    });
    puppeteerController.on('reelLiked', () => {
        vscode.window.showInformationMessage('❤️ Reel liked!');
    });
    puppeteerController.on('reelSaved', () => {
        vscode.window.showInformationMessage('📖 Reel saved!');
    });
    puppeteerController.on('error', (error) => {
        console.error('Puppeteer controller error:', error);
        vscode.window.showErrorMessage(`Instagram Reels error: ${error.message}`);
    });
}
async function cleanup() {
    try {
        console.log('🧹 Cleaning up Instagram Reels Viewer...');
        // Clean up Puppeteer controller
        if (puppeteerController) {
            await puppeteerController.cleanup();
            exports.puppeteerController = puppeteerController = undefined;
        }
        // Stop media bridge
        if (mediaBridge) {
            await mediaBridge.stop();
            exports.mediaBridge = mediaBridge = undefined;
        }
        console.log('✅ Cleanup completed');
    }
    catch (error) {
        console.error('Error during cleanup:', error);
    }
}
function deactivate() {
    return cleanup();
}
exports.deactivate = deactivate;
//# sourceMappingURL=extension.js.map