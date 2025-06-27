import * as puppeteer from 'puppeteer';
import * as fs from 'fs';
import * as path from 'path';
import { EventEmitter } from 'events';

export interface ReelData {
    reelId: string;
    reelUrl: string;
    caption: string;
    username: string;
    likes: string;
    comments: string;
    hashtags: string[];
    profilePicture: string;
}

export class PuppeteerController extends EventEmitter {
    private browser: puppeteer.Browser | null = null;
    private page: puppeteer.Page | null = null;
    private cookiesPath: string;
    private currentReelIndex: number = 0;
    private reelIdQueue: string[] = [];
    private isCollectingReels: boolean = false;
    private reelCollectionCount: number = 0;
    private maxReelsBeforeReload: number = 3;
    private collectionPage: puppeteer.Page | null = null;
    private minBufferSize: number = 5; // Always keep at least 5 reels ahead
    private isBackgroundCollecting: boolean = false;

    constructor(extensionPath: string) {
        super();
        this.cookiesPath = path.join(extensionPath, 'cookies', 'instagram.json');
    }

    async initialize(): Promise<void> {
        try {
            console.log('Initializing Puppeteer...');
            
            // Determine Chrome executable path based on OS
            let executablePath: string | undefined;
            const platform = process.platform;
            
            if (platform === 'darwin') {
                // macOS
                executablePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
            } else if (platform === 'win32') {
                // Windows - check multiple possible locations
                const windowsChromePaths = [
                    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
                    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
                    `C:\\Users\\${process.env.USERNAME}\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe`
                ];
                
                for (const chromePath of windowsChromePaths) {
                    if (fs.existsSync(chromePath)) {
                        executablePath = chromePath;
                        console.log(`Found Chrome at: ${chromePath}`);
                        break;
                    }
                }
            } else if (platform === 'linux') {
                // Linux
                executablePath = '/usr/bin/google-chrome';
            }
            
            // Check if Chrome exists at the expected path
            if (executablePath && !fs.existsSync(executablePath)) {
                console.warn('Chrome not found at expected path, will use Puppeteer default');
                executablePath = undefined;
            }

            // Windows-compatible Chrome arguments (avoid problematic flags)
            const chromeArgs = [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-web-security',
                '--no-first-run'
            ];

            // Add platform-specific args
            if (platform === 'win32') {
                // Windows-specific safe args
                chromeArgs.push(
                    '--disable-gpu',
                    '--disable-features=VizDisplayCompositor'
                );
            } else {
                // Mac/Linux can handle more args
                chromeArgs.push(
                    '--disable-accelerated-2d-canvas',
                    '--no-zygote',
                    '--disable-background-timer-throttling',
                    '--disable-backgrounding-occluded-windows',
                    '--disable-renderer-backgrounding'
                );
            }

            this.browser = await puppeteer.launch({
                headless: true,
                defaultViewport: { width: 1280, height: 720 },
                executablePath, // Use system Chrome if available
                args: chromeArgs
            });

            this.page = await this.browser.newPage();
            
            // Set user agent to avoid detection
            await this.page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
            
            await this.loadCookies();
            await this.navigateToReels();
            
            this.emit('initialized');
        } catch (error) {
            console.error('Failed to initialize Puppeteer:', error);
            this.emit('error', error);
        }
    }

    async loadCookies(): Promise<void> {
        // No longer using cookies/session - using reload-based approach
        console.log('Skipping cookie loading - using anonymous access with reloads');
    }

    async saveCookies(): Promise<void> {
        // No longer saving cookies
        console.log('Skipping cookie saving - using anonymous access');
    }

    async navigateToReels(): Promise<void> {
        try {
            console.log('Navigating to Instagram Reels (anonymous access)...');
            await this.page!.goto('https://www.instagram.com/reels/', { 
                waitUntil: 'networkidle2',
                timeout: 30000 
            });

            // Wait for reels to load
            await this.page!.waitForTimeout(3003);
            await this.waitForReelsToLoad();
            
            console.log('Reels loaded - starting reel collection');
            this.emit('reelsLoaded');
            
            // Start collecting reel IDs
            this.startReelCollection();
        } catch (error) {
            console.error('Failed to navigate to reels:', error);
            this.emit('error', error);
        }
    }

    async waitForReelsToLoad(): Promise<void> {
        try {
            // Wait for video elements to be present
            await this.page!.waitForSelector('video', { timeout: 15000 });
            console.log('Reels loaded successfully');
        } catch (error) {
            console.error('Failed to wait for reels to load:', error);
            throw error;
        }
    }

    async getCurrentReelInfo(): Promise<ReelData | null> {
        try {
            if (!this.page) {
                return null;
            }

            // Return reel from queue if available
            const currentReelId = this.reelIdQueue[this.currentReelIndex];
            if (currentReelId) {
                const reelUrl = `https://www.instagram.com/reel/${currentReelId}/`;
                console.log(`Using queued reel ID: ${currentReelId}`);
                
                return {
                    reelId: currentReelId,
                    reelUrl,
                    caption: '',
                    username: '',
                    likes: '',
                    comments: '',
                    hashtags: [],
                    profilePicture: ''
                };
            }

            // If no queued reel, try to extract from current page
            const currentUrl = this.page.url();
            const reelIdMatch = currentUrl.split('/').filter(Boolean).pop();
            
            if (reelIdMatch && reelIdMatch !== 'reels') {
                const reelId = reelIdMatch;
                const reelUrl = `https://www.instagram.com/reel/${reelId}/`;
                
                console.log(`Extracted reel ID from current page: ${reelId}`);
                
                // Add to queue if not already there
                if (!this.reelIdQueue.includes(reelId)) {
                    this.reelIdQueue.push(reelId);
                }
                
                return {
                    reelId,
                    reelUrl,
                    caption: '',
                    username: '',
                    likes: '',
                    comments: '',
                    hashtags: [],
                    profilePicture: ''
                };
            }

            return null;
        } catch (error) {
            console.error('Failed to get current reel info:', error);
            return null;
        }
    }

    async scrollToNextReel(): Promise<void> {
        try {
            if (!this.page) {
                throw new Error('Page not initialized');
            }

            this.currentReelIndex++;
            
            // If we've run out of reels, wait for immediate collection
            if (this.currentReelIndex >= this.reelIdQueue.length) {
                console.log('Out of reels - immediate collection needed');
                await this.collectMoreReels();
            } else {
                // Always trigger background collection to maintain buffer
                this.triggerBackgroundCollection();
            }
            
            this.emit('reelChanged', this.currentReelIndex);
        } catch (error) {
            console.error('Failed to scroll to next reel:', error);
            this.emit('error', error);
        }
    }

    async scrollToPreviousReel(): Promise<void> {
        try {
            if (!this.page) {
                throw new Error('Page not initialized');
            }

            this.currentReelIndex = Math.max(0, this.currentReelIndex - 1);
            this.emit('reelChanged', this.currentReelIndex);
        } catch (error) {
            console.error('Failed to scroll to previous reel:', error);
            this.emit('error', error);
        }
    }

    private async startReelCollection(): Promise<void> {
        try {
            console.log('Starting initial reel collection...');
            await this.collectReelsFromCurrentPage();
            
            // Immediately start background collection to build buffer
            console.log('Starting initial background collection to build buffer...');
            this.triggerBackgroundCollection();
        } catch (error) {
            console.error('Failed to start reel collection:', error);
        }
    }

    private async collectMoreReels(): Promise<void> {
        try {
            console.log('Collecting more reels by reloading page...');
            await this.page!.reload({ waitUntil: 'networkidle2' });
            await this.page!.waitForTimeout(3003);
            await this.waitForReelsToLoad();
            await this.collectReelsFromCurrentPage();
        } catch (error) {
            console.error('Failed to collect more reels:', error);
        }
    }

    private triggerBackgroundCollection(): void {
        // Check if we need more reels in buffer
        const remainingReels = this.reelIdQueue.length - this.currentReelIndex;
        
        if (remainingReels <= this.minBufferSize && !this.isBackgroundCollecting) {
            console.log(`Buffer low (${remainingReels} remaining), starting background collection...`);
            this.startBackgroundCollection();
        }
    }

    private async startBackgroundCollection(): Promise<void> {
        if (this.isBackgroundCollecting || !this.browser) {
            return;
        }

        try {
            this.isBackgroundCollecting = true;
            console.log('Starting background reel collection...');

            // Create a separate page for background collection
            this.collectionPage = await this.browser.newPage();
            
            // Set same user agent
            await this.collectionPage.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
            
            // Navigate to reels page
            await this.collectionPage.goto('https://www.instagram.com/reels/', { 
                waitUntil: 'networkidle2',
                timeout: 15000 
            });
            
            await this.collectionPage.waitForTimeout(3003);
            
            // Check if collection page still exists (might be closed during cleanup)
            if (!this.collectionPage || this.collectionPage.isClosed()) {
                console.log('Collection page closed during background collection setup');
                return;
            }
            
            await this.collectionPage.waitForSelector('video', { timeout: 15000 });
            
            // Collect reels in background
            await this.collectReelsFromBackgroundPage();
            
        } catch (error) {
            console.error('Failed to start background collection:', error);
        } finally {
            // Clean up background page
            if (this.collectionPage) {
                try {
                    await this.collectionPage.close();
                } catch (e) {
                    console.error('Error closing collection page:', e);
                }
                this.collectionPage = null;
            }
            this.isBackgroundCollecting = false;
        }
    }

    private async collectReelsFromBackgroundPage(): Promise<void> {
        try {
            if (!this.collectionPage) return;
            
            let collectedCount = 0;
            const targetCount = 8; // Collect more reels in background
            
            // Collect reels by scrolling through the page
            for (let i = 0; i < targetCount; i++) {
                try {
                    // Wait for current reel to load
                    await this.collectionPage.waitForTimeout(1500);
                    
                    // Extract reel ID from current URL
                    const currentUrl = this.collectionPage.url();
                    const reelIdMatch = currentUrl.split('/').filter(Boolean).pop();
                    
                    if (reelIdMatch && reelIdMatch !== 'reels' && !this.reelIdQueue.includes(reelIdMatch)) {
                        this.reelIdQueue.push(reelIdMatch);
                        collectedCount++;
                        console.log(`Background collected reel ID: ${reelIdMatch} (${collectedCount}/8, total queue: ${this.reelIdQueue.length})`);
                    }
                    
                    // Scroll to next reel
                    if (i < targetCount - 1) {
                        await this.collectionPage.keyboard.press('ArrowDown');
                    }
                } catch (error) {
                    console.error('Error collecting reel in background at position', i, error);
                    // Continue collecting even if one fails
                }
            }
            
            console.log(`Background collection completed: ${collectedCount} new reels. Total in queue: ${this.reelIdQueue.length}`);
            this.emit('reelsCollected', { collected: collectedCount, total: this.reelIdQueue.length });
        } catch (error) {
            console.error('Failed to collect reels from background page:', error);
        }
    }

    private async collectReelsFromCurrentPage(): Promise<void> {
        try {
            this.isCollectingReels = true;
            let collectedCount = 0;
            
            // Collect reels by scrolling through the page
            for (let i = 0; i < this.maxReelsBeforeReload && collectedCount < 10; i++) {
                try {
                    // Wait for current reel to load
                    await this.page!.waitForTimeout(1500);
                    
                    // Extract reel ID from current URL
                    const currentUrl = this.page!.url();
                    const reelIdMatch = currentUrl.split('/').filter(Boolean).pop();
                    
                    if (reelIdMatch && reelIdMatch !== 'reels' && !this.reelIdQueue.includes(reelIdMatch)) {
                        this.reelIdQueue.push(reelIdMatch);
                        collectedCount++;
                        console.log(`Collected reel ID: ${reelIdMatch} (${collectedCount} total in queue: ${this.reelIdQueue.length})`);
                    }
                    
                    // Scroll to next reel
                    if (i < this.maxReelsBeforeReload - 1) {
                        await this.page!.keyboard.press('ArrowDown');
                    }
                } catch (error) {
                    console.error('Error collecting reel at position', i, error);
                    break;
                }
            }
            
            console.log(`Collected ${collectedCount} new reels. Total in queue: ${this.reelIdQueue.length}`);
            this.emit('reelsCollected', { collected: collectedCount, total: this.reelIdQueue.length });
        } catch (error) {
            console.error('Failed to collect reels from current page:', error);
        } finally {
            this.isCollectingReels = false;
        }
    }

    async likeCurrentReel(): Promise<void> {
        try {
            if (!this.page) {
                throw new Error('Page not initialized');
            }

            // Find and click like button
            const likeButton = await this.page.$('svg[aria-label*="like"], svg[aria-label*="Like"]');
            if (likeButton) {
                await likeButton.click();
                this.emit('reelLiked');
            }
        } catch (error) {
            console.error('Failed to like reel:', error);
            this.emit('error', error);
        }
    }

    async saveCurrentReel(): Promise<void> {
        try {
            if (!this.page) {
                throw new Error('Page not initialized');
            }

            // Find and click save button
            const saveButton = await this.page.$('svg[aria-label*="save"], svg[aria-label*="Save"]');
            if (saveButton) {
                await saveButton.click();
                this.emit('reelSaved');
            }
        } catch (error) {
            console.error('Failed to save reel:', error);
            this.emit('error', error);
        }
    }

    async openCurrentReelInBrowser(): Promise<string> {
        try {
            if (!this.page) {
                throw new Error('Page not initialized');
            }

            const currentReelId = this.reelIdQueue[this.currentReelIndex];
            if (currentReelId) {
                return `https://www.instagram.com/reel/${currentReelId}/`;
            }

            return this.page.url();
        } catch (error) {
            console.error('Failed to get current URL:', error);
            return '';
        }
    }

    getReelQueueSize(): number {
        return this.reelIdQueue.length;
    }

    getCurrentReelIndex(): number {
        return this.currentReelIndex;
    }

    getBufferStatus(): { remaining: number, total: number, isCollecting: boolean } {
        return {
            remaining: this.reelIdQueue.length - this.currentReelIndex,
            total: this.reelIdQueue.length,
            isCollecting: this.isBackgroundCollecting
        };
    }

    getQueueDebugInfo(): { queue: string[], currentIndex: number, bufferStatus: any } {
        return {
            queue: [...this.reelIdQueue], // Copy of the queue
            currentIndex: this.currentReelIndex,
            bufferStatus: this.getBufferStatus()
        };
    }

    async cleanup(): Promise<void> {
        try {
            // Stop background collection
            this.isBackgroundCollecting = false;
            
            // Close collection page if open
            if (this.collectionPage) {
                try {
                    await this.collectionPage.close();
                } catch (e) {
                    console.error('Error closing collection page during cleanup:', e);
                }
                this.collectionPage = null;
            }
            
            // Close main browser
            if (this.browser) {
                await this.browser.close();
                this.browser = null;
                this.page = null;
            }
            
            this.reelIdQueue = [];
        } catch (error) {
            console.error('Failed to cleanup browser:', error);
        }
    }

    isInitialized(): boolean {
        return this.browser !== null && this.page !== null;
    }
} 