"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deactivate = exports.activate = void 0;
const vscode = require("vscode");
const fs = require("fs");
const path = require("path");
function activate(context) {
    console.log('Vibe Scroll extension is now active!');
    // Register the command to open Instagram
    let disposable = vscode.commands.registerCommand('vibe-scroll.openInstagram', () => {
        try {
            // Create and show Instagram panel
            const panel = vscode.window.createWebviewPanel('instagramViewer', 'Instagram', vscode.ViewColumn.One, {
                enableScripts: true,
                retainContextWhenHidden: true
            });
            // Set the HTML content for the webview
            panel.webview.html = getWebviewContent(context);
            // Handle messages from the webview (optional)
            panel.webview.onDidReceiveMessage((message) => {
                switch (message.command) {
                    case 'alert':
                        vscode.window.showInformationMessage(message.text);
                        return;
                }
            }, undefined, context.subscriptions);
        }
        catch (error) {
            console.error('Error creating Instagram webview:', error);
            vscode.window.showErrorMessage('Failed to open Instagram viewer: ' + error.message);
        }
    });
    context.subscriptions.push(disposable);
}
exports.activate = activate;
function getWebviewContent(context) {
    try {
        const templatePath = path.join(context.extensionPath, 'templates', 'instagram-viewer.html');
        return fs.readFileSync(templatePath, 'utf8');
    }
    catch (error) {
        console.error('Error loading HTML template:', error);
        // Fallback to a simple error message if template can't be loaded
        return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>Error</title>
            <style>
                body { font-family: Arial, sans-serif; padding: 20px; text-align: center; }
                .error { color: #d32f2f; }
            </style>
        </head>
        <body>
            <div class="error">
                <h2>Template Loading Error</h2>
                <p>Could not load the Instagram viewer template.</p>
                <p>Error: ${error.message}</p>
            </div>
        </body>
        </html>`;
    }
}
function deactivate() { }
exports.deactivate = deactivate;
//# sourceMappingURL=extension.js.map