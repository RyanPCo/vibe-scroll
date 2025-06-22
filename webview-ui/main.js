(function() {
    // Get the VS Code API
    const vscode = acquireVsCodeApi();
    
    // DOM elements
    const loadingScreen = document.getElementById('loading');
    const loginScreen = document.getElementById('login-required');
    const manualLoginScreen = document.getElementById('manual-login');
    const mainContent = document.getElementById('main-content');
    const errorScreen = document.getElementById('error');
    
    // Main content elements
    const instagramIframe = document.getElementById('instagram-iframe');
    
    // Error elements
    const errorMessage = document.getElementById('error-message');
    const manualLoginMessage = document.getElementById('manual-login-message');
    const retryBtn = document.getElementById('retry-btn');
    const loginBtn = document.getElementById('login-btn');
    
    // State
    let currentReel = null;
    let isLoading = false;
    
    // Initialize
    document.addEventListener('DOMContentLoaded', function() {
        setupEventListeners();
        setupKeyboardShortcuts();
        showScreen('loading');
        
        console.log('Webview DOM loaded');
        console.log('Instagram iframe element:', instagramIframe);
        
        // Load initial iframe content even without reel data
        if (instagramIframe) {
            console.log('Loading initial iframe content...');
            instagramIframe.src = `http://localhost:3000?_t=${Date.now()}`;
        }
        
        // Notify extension that webview is ready
        sendMessage({ command: 'ready' });
        
        // Show main content after a short delay if no other content is shown
        setTimeout(() => {
            if (loadingScreen.style.display !== 'none') {
                console.log('Auto-showing main content after timeout');
                showScreen('main-content');
            }
        }, 3000);
    });
    
    function setupEventListeners() {
        // Basic iframe loading handling
        if (instagramIframe) {
            instagramIframe.addEventListener('load', () => {
                console.log('Instagram iframe loaded');
                setLoading(false);
            });
            
            instagramIframe.addEventListener('error', () => {
                console.error('Instagram iframe failed to load');
                showError('Failed to load Instagram embed');
            });
        }
        
        // Login and retry buttons
        if (loginBtn) {
            loginBtn.addEventListener('click', () => {
                sendMessage({ command: 'performLogin' });
                showScreen('manual-login');
            });
        }
        
        if (retryBtn) {
            retryBtn.addEventListener('click', () => {
                showScreen('loading');
                sendMessage({ command: 'ready' });
            });
        }
    }
    
    function setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // Skip if user is typing in an input field
            if (e.target.tagName === 'INPUT' && e.target.type !== 'range') return;
            if (e.target.tagName === 'TEXTAREA') return;
            
            // No keyboard shortcuts currently implemented
        });
    }
    
    // Message handling from extension
    window.addEventListener('message', event => {
        const message = event.data;
        handleMessage(message);
    });
    
    function handleMessage(message) {
        console.log('Received message:', message);
        
        switch (message.command) {
            case 'controllerInitialized':
                console.log('Controller initialized');
                break;
                
            case 'loginRequired':
                showScreen('login-required');
                break;
                
            case 'manualLoginRequired':
                showScreen('manual-login');
                if (message.message) {
                    manualLoginMessage.textContent = message.message;
                }
                break;
                
            case 'reelLoaded':
                setLoading(false);
                loadReel(message.data);
                showScreen('main-content');
                break;
                
            case 'reelLiked':
                showNotification('❤️ Reel liked!', 'success');
                break;
                
            case 'reelSaved':
                showNotification('📖 Reel saved!', 'success');
                break;
                
            case 'error':
                setLoading(false);
                showError(message.message || 'An error occurred');
                break;
                
            default:
                console.log('Unknown message command:', message.command);
        }
    }
    
    function loadReel(reelData) {
        if (!reelData || !reelData.reelId) {
            console.log('No reel data provided, loading default reel');
            // Load default reel if no data provided
            const newSrc = `http://localhost:3000?_t=${Date.now()}`;
            if (instagramIframe) {
                instagramIframe.src = newSrc;
            }
            return;
        }
        
        currentReel = reelData;
        
        // Update iframe src with new reel ID
        const newSrc = `http://localhost:3000?reelId=${reelData.reelId}&_t=${Date.now()}`;
        console.log('Loading reel:', reelData.reelId, 'URL:', newSrc);
        
        if (instagramIframe) {
            instagramIframe.src = newSrc;
        } else {
            console.error('Instagram iframe not found');
        }
    }
    
    function showScreen(screenName) {
        // Hide all screens
        loadingScreen.style.display = 'none';
        loginScreen.style.display = 'none';
        manualLoginScreen.style.display = 'none';
        mainContent.style.display = 'none';
        errorScreen.style.display = 'none';
        
        // Show requested screen
        const screen = document.getElementById(screenName);
        if (screen) {
            screen.style.display = 'flex';
            
            console.log('Showing screen:', screenName);
        } else {
            console.error('Screen not found:', screenName);
            showScreen('error');
        }
    }
    
    function showError(message) {
        errorMessage.textContent = message;
        showScreen('error');
    }
    
    function setLoading(loading) {
        isLoading = loading;
    }
    
    function sendMessage(message) {
        vscode.postMessage(message);
    }
    
    function showNotification(text, type = 'success') {
        console.log(`[${type.toUpperCase()}] ${text}`);
        
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.textContent = text;
        
        // Add to DOM
        document.body.appendChild(notification);
        
        // Auto remove after 3 seconds
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 3000);
    }
    
    function formatNumber(num) {
        if (num >= 1000000) {
            return (num / 1000000).toFixed(1) + 'M';
        } else if (num >= 1000) {
            return (num / 1000).toFixed(1) + 'K';
        }
        return num.toString();
    }

})(); 