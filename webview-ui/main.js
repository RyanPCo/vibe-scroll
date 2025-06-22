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
    
    // Volume control elements
    const volumeControl = document.getElementById('volume-control');
    const volumeSlider = document.getElementById('volume-slider');
    const volumeIcon = document.getElementById('volume-icon');
    const volumePercentage = document.getElementById('volume-percentage');
    
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
        setupVolumeControl();
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
    
    function setupVolumeControl() {
        if (!volumeSlider || !volumeIcon || !volumePercentage) {
            console.log('Volume control elements not found');
            return;
        }
        
        // Load current system volume
        loadInitialVolume();
        
        // Volume slider event listener
        volumeSlider.addEventListener('input', (e) => {
            const volume = e.target.value;
            updateVolumeDisplay(volume);
            setVolume(volume);
            localStorage.setItem('instagram-volume', volume);
        });
        
        // Volume icon click to mute/unmute
        volumeIcon.addEventListener('click', async () => {
            try {
                const response = await fetch('http://localhost:3000/api/volume/toggle-mute', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    }
                });
                
                const data = await response.json();
                
                if (data.success) {
                    // Update UI based on mute state
                    if (data.muted) {
                        volumeIcon.textContent = '🔇';
                        showNotification('🔇 System muted');
                    } else {
                        // Get current volume to update icon
                        const volumeResponse = await fetch('http://localhost:3000/api/volume');
                        const volumeData = await volumeResponse.json();
                        if (volumeData.success) {
                            volumeSlider.value = volumeData.volume;
                            updateVolumeDisplay(volumeData.volume);
                            localStorage.setItem('instagram-volume', volumeData.volume);
                        }
                        showNotification('🔊 System unmuted');
                    }
                } else {
                    console.error('Failed to toggle mute:', data.error);
                    showNotification('❌ Failed to toggle mute', 'error');
                }
            } catch (error) {
                console.error('Error toggling mute:', error);
                showNotification('❌ Mute control unavailable', 'error');
            }
        });
    }
    
    async function loadInitialVolume() {
        try {
            const response = await fetch('http://localhost:3000/api/volume');
            const data = await response.json();
            
            if (data.success) {
                volumeSlider.value = data.volume;
                updateVolumeDisplay(data.volume);
                localStorage.setItem('instagram-volume', data.volume);
                
                // Update mute icon if system is muted
                if (data.muted) {
                    volumeIcon.textContent = '🔇';
                }
                
                console.log('Loaded system volume:', data.volume + '%', 'Platform:', data.platform);
                showNotification('🔊 Connected to ' + data.platform, 'success');
            } else {
                console.error('Failed to get system volume:', data.error);
                // Fall back to saved volume
                const savedVolume = localStorage.getItem('instagram-volume') || '75';
                volumeSlider.value = savedVolume;
                updateVolumeDisplay(savedVolume);
                showNotification('⚠️ Using saved volume - system control unavailable', 'warning');
            }
        } catch (error) {
            console.error('Error loading system volume:', error);
            // Fall back to saved volume
            const savedVolume = localStorage.getItem('instagram-volume') || '75';
            volumeSlider.value = savedVolume;
            updateVolumeDisplay(savedVolume);
            showNotification('⚠️ System volume unavailable - using saved settings', 'warning');
        }
    }
    
    function setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // Skip if user is typing in an input field
            if (e.target.tagName === 'INPUT' && e.target.type !== 'range') return;
            if (e.target.tagName === 'TEXTAREA') return;
            
            switch(e.key.toLowerCase()) {
                case 'arrowleft':
                    e.preventDefault();
                    adjustVolume(-5);
                    break;
                case 'arrowright':
                    e.preventDefault();
                    adjustVolume(5);
                    break;
                case 'm':
                    e.preventDefault();
                    volumeIcon.click();
                    break;
                case '0':
                case '1':
                case '2':
                case '3':
                case '4':
                case '5':
                case '6':
                case '7':
                case '8':
                case '9':
                    e.preventDefault();
                    const volume = parseInt(e.key) * 10;
                    setVolumeLevel(volume);
                    break;
                case 'd':
                    e.preventDefault();
                    debugVolumeControl();
                    break;
            }
        });
    }
    
    function updateVolumeDisplay(volume) {
        volumePercentage.textContent = volume + '%';
        
        if (volume == 0) {
            volumeIcon.textContent = '🔇';
        } else if (volume < 30) {
            volumeIcon.textContent = '🔉';
        } else {
            volumeIcon.textContent = '🔊';
        }
    }
    
    async function setVolume(volume) {
        try {
            // Use system volume control via API
            const response = await fetch('http://localhost:3000/api/volume', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ volume: volume })
            });
            
            const data = await response.json();
            
            if (data.success) {
                console.log('System volume set to:', volume + '%');
                
                // Show success notification on first volume change
                if (volume === 75) { // Only show on first load
                    showNotification('🔊 Controlling system volume - ' + (data.platform || 'Unknown platform'), 'success');
                }
            } else {
                console.error('Failed to set system volume:', data.error);
                showNotification('❌ Failed to control system volume', 'error');
            }
            
        } catch (error) {
            console.error('Error setting system volume:', error);
            showNotification('❌ Volume control unavailable', 'error');
        }
    }
    
    async function adjustVolume(delta) {
        try {
            const response = await fetch('http://localhost:3000/api/volume/adjust', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ delta: delta })
            });
            
            const data = await response.json();
            
            if (data.success) {
                volumeSlider.value = data.volume;
                updateVolumeDisplay(data.volume);
                localStorage.setItem('instagram-volume', data.volume);
                
                // Show brief volume feedback
                showNotification('Volume: ' + data.volume + '%');
            } else {
                console.error('Failed to adjust volume:', data.error);
                showNotification('❌ Failed to adjust volume', 'error');
            }
        } catch (error) {
            console.error('Error adjusting volume:', error);
            showNotification('❌ Volume adjustment unavailable', 'error');
        }
    }
    
    async function setVolumeLevel(volume) {
        try {
            const success = await setVolume(volume);
            if (success !== false) {
                volumeSlider.value = volume;
                updateVolumeDisplay(volume);
                localStorage.setItem('instagram-volume', volume);
                
                showNotification('Volume: ' + volume + '%');
            }
        } catch (error) {
            console.error('Error setting volume level:', error);
            showNotification('❌ Failed to set volume level', 'error');
        }
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
        
        // Hide volume control by default
        if (volumeControl) {
            volumeControl.style.display = 'none';
        }
        
        // Show requested screen
        const screen = document.getElementById(screenName);
        if (screen) {
            screen.style.display = 'flex';
            
            // Show volume control when main content is visible
            if (screenName === 'main-content' && volumeControl) {
                volumeControl.style.display = 'flex';
            }
        } else {
            console.error('Screen not found:', screenName);
        }
    }
    
    function showError(message) {
        errorMessage.textContent = message;
        showScreen('error');
    }
    
    function setLoading(loading) {
        isLoading = loading;
        console.log('Loading state:', loading);
    }
    
    function sendMessage(message) {
        vscode.postMessage(message);
    }
    
    function showNotification(text, type = 'success') {
        // Remove existing notifications
        const existingNotifications = document.querySelectorAll('.notification');
        existingNotifications.forEach(n => n.remove());
        
        // Create new notification
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = text;
        
        document.body.appendChild(notification);
        
        // Remove after 3 seconds
        setTimeout(() => {
            notification.remove();
        }, 3000);
    }
    
    // Utility functions
    function formatNumber(num) {
        if (num >= 1000000) {
            return (num / 1000000).toFixed(1) + 'M';
        }
        if (num >= 1000) {
            return (num / 1000).toFixed(1) + 'K';
        }
        return num.toString();
    }
    

    
    // Debug function to test volume control
    function debugVolumeControl() {
        console.log('=== DEBUG VOLUME CONTROL ===');
        console.log('Instagram iframe element:', instagramIframe);
        console.log('Instagram iframe src:', instagramIframe ? instagramIframe.src : 'N/A');
        console.log('Volume control elements present:', {
            volumeSlider: !!volumeSlider,
            volumeIcon: !!volumeIcon,
            volumePercentage: !!volumePercentage
        });
        
        // Test volume setting
        console.log('Testing volume setting to 50%...');
        setVolume(50);
        
        showNotification('🔍 Check console for volume debug info', 'warning');
    }

    // Export for debugging
    window.debugReelsViewer = {
        currentReel,
        isLoading,
        sendMessage,
        showNotification,
        setLoading,
        loadReel,
        debugVolumeControl,
        setVolume
    };
})(); 