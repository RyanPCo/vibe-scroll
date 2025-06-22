import * as vscode from 'vscode';
import { PuppeteerController, ReelData } from '../controller/puppeteerController';
import { MediaBridge } from '../server/mediaBridge';

export class ReelsWebviewPanel {
    public static currentPanel: ReelsWebviewPanel | undefined;
    public static readonly viewType = 'instagramReelsViewer';

    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private readonly _controller: PuppeteerController;
    private readonly _mediaBridge: MediaBridge | undefined;
    private _disposables: vscode.Disposable[] = [];

    public static createOrShow(extensionUri: vscode.Uri, controller: PuppeteerController, mediaBridge?: MediaBridge) {
        // Determine the column for the webview panel
        // If there are visible text editors, open in a new column to the right
        // Otherwise, open in the first column
        let targetColumn: vscode.ViewColumn;
        
        if (vscode.window.visibleTextEditors.length > 0) {
            // Files are open, so open in a separate panel to the right
            targetColumn = vscode.ViewColumn.Beside;
        } else {
            // No files open, use the first column
            targetColumn = vscode.ViewColumn.One;
        }

        // If we already have a panel, show it in the appropriate column
        if (ReelsWebviewPanel.currentPanel) {
            ReelsWebviewPanel.currentPanel._panel.reveal(targetColumn);
            return;
        }

        // Otherwise, create a new panel.
        const panel = vscode.window.createWebviewPanel(
            ReelsWebviewPanel.viewType,
            'Instagram Reels',
            targetColumn,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [
                    vscode.Uri.joinPath(extensionUri, 'webview-ui')
                ]
            }
        );

        ReelsWebviewPanel.currentPanel = new ReelsWebviewPanel(panel, extensionUri, controller, mediaBridge);
    }

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, controller: PuppeteerController, mediaBridge?: MediaBridge) {
        this._panel = panel;
        this._extensionUri = extensionUri;
        this._controller = controller;
        this._mediaBridge = mediaBridge;

        // Set the webview's initial html content
        this._update();

        // Listen for when the panel is disposed
        // This happens when the user closes the panel or when the panel is closed programmatically
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        // Handle messages from the webview
        this._panel.webview.onDidReceiveMessage(
            (message) => {
                this._handleMessage(message);
            },
            null,
            this._disposables
        );

        // Set up controller event listeners
        this._setupControllerListeners();
    }

    private _setupControllerListeners() {
        this._controller.on('initialized', () => {
            this._sendMessage({
                command: 'controllerInitialized'
            });
        });

        this._controller.on('loginRequired', () => {
            this._sendMessage({
                command: 'loginRequired'
            });
        });

        this._controller.on('manualLoginRequired', () => {
            this._sendMessage({
                command: 'manualLoginRequired',
                message: 'Please complete login in the browser window that opened'
            });
        });

        this._controller.on('reelsLoaded', async () => {
            await this._loadCurrentReel();
        });

        this._controller.on('reelChanged', async () => {
            await this._loadCurrentReel();
        });

        this._controller.on('reelLiked', () => {
            this._sendMessage({
                command: 'reelLiked'
            });
        });

        this._controller.on('reelSaved', () => {
            this._sendMessage({
                command: 'reelSaved'
            });
        });

        this._controller.on('error', (error: Error) => {
            this._sendMessage({
                command: 'error',
                message: error.message
            });
        });
    }

    private async _loadCurrentReel() {
        try {
            const reelData = await this._controller.getCurrentReelInfo();
            if (reelData) {
                // Update the media bridge with the new reel ID
                if (this._mediaBridge) {
                    this._mediaBridge.updateCurrentReel(reelData.reelId);
                }
                
                this._sendMessage({
                    command: 'reelLoaded',
                    data: reelData
                });
            }
        } catch (error) {
            console.error('Error loading current reel:', error);
        }
    }

    private async _handleMessage(message: any) {
        switch (message.command) {
            case 'ready':
                // Webview is ready, initialize controller if not already done
                if (!this._controller.isInitialized()) {
                    await this._controller.initialize();
                }
                break;
            // All other interactions are now handled by the server
        }
    }

    private _sendMessage(message: any) {
        this._panel.webview.postMessage(message);
    }

    public dispose() {
        ReelsWebviewPanel.currentPanel = undefined;

        // Clean up our resources
        this._panel.dispose();

        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) {
                x.dispose();
            }
        }
    }

    private _update() {
        const webview = this._panel.webview;
        this._panel.webview.html = this._getHtmlForWebview(webview);
    }

    private _getHtmlForWebview(webview: vscode.Webview) {
        // Get the local path to main script run in the webview, then convert it to a uri we can use in the webview.
        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'webview-ui', 'main.js'));
        const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'webview-ui', 'style.css'));

        // Use a nonce to only allow a specific script to be run.
        const nonce = getNonce();

        return `<!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                                 <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; img-src ${webview.cspSource} https: data:; script-src 'nonce-${nonce}'; connect-src https: http://localhost:3000; frame-src http://localhost:3000 https://www.instagram.com; child-src http://localhost:3000 https://www.instagram.com;">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <link href="${styleUri}" rel="stylesheet">
                <title>Instagram Reels</title>
            </head>
            <body>
                <div id="app">
                    <div id="loading" class="loading-screen">
                        <div class="spinner"></div>
                        <h2>Loading Instagram Reels...</h2>
                        <p>Please wait while we set up your Instagram session</p>
                    </div>
                    
                    <div id="login-required" class="login-screen" style="display: none;">
                        <div class="login-content">
                            <h2>Instagram Login Required</h2>
                            <p>You need to login to Instagram to view Reels</p>
                            <button id="login-btn" class="btn btn-primary">Login to Instagram</button>
                        </div>
                    </div>
                    
                    <div id="manual-login" class="manual-login-screen" style="display: none;">
                        <div class="manual-login-content">
                            <h2>Complete Login</h2>
                            <p id="manual-login-message">Please complete your login in the browser window that opened</p>
                            <div class="spinner"></div>
                        </div>
                    </div>
                    
                                         <div id="main-content" class="main-content" style="display: none;">
                         <iframe id="instagram-iframe" src="http://localhost:3000" style="width: 100%; height: 100vh; border: none;"></iframe>
                         
                         <!-- Volume Control
                         <div class="volume-control" id="volume-control">
                             <span class="volume-icon" id="volume-icon">🔊</span>
                             <input type="range" class="volume-slider" id="volume-slider" min="0" max="100" value="75">
                             <span class="volume-percentage" id="volume-percentage">75%</span>
                         </div>  -->
                     </div>
                    
                    <div id="error" class="error-screen" style="display: none;">
                        <div class="error-content">
                            <h2>Error</h2>
                            <p id="error-message">An error occurred</p>
                            <button id="retry-btn" class="btn btn-primary">Retry</button>
                        </div>
                    </div>
                </div>
                
                <script nonce="${nonce}" src="${scriptUri}"></script>
            </body>
            </html>`;
    }
}

function getNonce() {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
} 