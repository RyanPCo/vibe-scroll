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
    private isLoggedIn: boolean = false;
    private currentReelIndex: number = 0;

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
                // Windows
                executablePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
            } else if (platform === 'linux') {
                // Linux
                executablePath = '/usr/bin/google-chrome';
            }
            
            // Check if Chrome exists at the expected path
            if (executablePath && !fs.existsSync(executablePath)) {
                console.warn('Chrome not found at expected path, will use Puppeteer default');
                executablePath = undefined;
            }

            this.browser = await puppeteer.launch({
                headless: false, // Set to true for production
                defaultViewport: { width: 1280, height: 720 },
                executablePath, // Use system Chrome if available
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--no-first-run',
                    '--no-zygote',
                    '--disable-gpu',
                    '--disable-web-security',
                    '--disable-features=VizDisplayCompositor'
                ]
            });

            this.page = await this.browser.newPage();
            
            // Set user agent to avoid detection
            await this.page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
            
            await this.loadCookies();
            await this.navigateToReels();
            
            this.emit('initialized');
        } catch (error) {
            console.error('Failed to initialize Puppeteer:', error);
            this.emit('error', error);
        }
    }

    async loadCookies(): Promise<void> {
        try {
            // First navigate to Instagram to set domain for cookies
            await this.page!.goto('https://www.instagram.com', { waitUntil: 'domcontentloaded' });
            
            // Set the specific sessionid cookie
            const sessionCookie = {
                name: 'sessionid',
                value: '75619196791%3AGvXksZhHYAh1xa%3A1%3AAYcBNg7pqIRxWz0x5OLtRdrMavKXj1cnvgUtA9-JYg',
                domain: '.instagram.com',
                path: '/',
                httpOnly: true,
                secure: true,
                sameSite: 'None' as const
            };
            
            await this.page!.setCookie(sessionCookie);
            console.log('Session cookie set successfully');
            
            // Load additional cookies from file if they exist
            if (fs.existsSync(this.cookiesPath)) {
                const cookiesString = fs.readFileSync(this.cookiesPath, 'utf8');
                const cookies = JSON.parse(cookiesString);
                await this.page!.setCookie(...cookies);
                console.log('Additional cookies loaded from file');
            }
            
            this.isLoggedIn = true;
            console.log('Cookies loaded successfully');
        } catch (error) {
            console.error('Failed to load cookies:', error);
        }
    }

    async saveCookies(): Promise<void> {
        try {
            const cookies = await this.page!.cookies();
            fs.mkdirSync(path.dirname(this.cookiesPath), { recursive: true });
            fs.writeFileSync(this.cookiesPath, JSON.stringify(cookies, null, 2));
            console.log('Cookies saved successfully');
        } catch (error) {
            console.error('Failed to save cookies:', error);
        }
    }

    async navigateToReels(): Promise<void> {
        try {
            console.log('Navigating to Instagram Reels...');
            await this.page!.goto('https://www.instagram.com/reels/', { 
                waitUntil: 'networkidle2',
                timeout: 30000 
            });

            // Wait for login redirect or reels to load
            await this.page!.waitForTimeout(3000);

            // Check if we need to login
            const currentUrl = this.page!.url();
            if (currentUrl.includes('/accounts/login/')) {
                console.log('Login required');
                this.isLoggedIn = false;
                this.emit('loginRequired');
                return;
            }

            // Wait for reels to load
            await this.waitForReelsToLoad();
            this.isLoggedIn = true;
            this.emit('reelsLoaded');
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
            if (!this.page || !this.isLoggedIn) {
                return null;
            }

            // Get current URL to extract reel ID
            const currentUrl = this.page.url();
            // split by / and get last nonempty entry
            const reelIdMatch = currentUrl.split('/').filter(Boolean).pop();
            
            if (!reelIdMatch) {
                console.error('Could not extract reel ID from URL:', currentUrl);
                return null;
            }

            const reelId = reelIdMatch;
            const reelUrl = `https://www.instagram.com/reel/${reelId}/`;
            
            console.log(`Extracted reel ID: ${reelId} from URL: ${currentUrl}`);

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
        } catch (error) {
            console.error('Failed to get current reel info:', error);
            return null;
        }
    }

    async scrollToNextReel(): Promise<void> {
        try {
            if (!this.page || !this.isLoggedIn) {
                throw new Error('Page not initialized or not logged in');
            }

            // Scroll down to next reel
            await this.page.keyboard.press('ArrowDown');
            
            // Wait for new reel to load
            await this.page.waitForTimeout(2000);
            
            this.currentReelIndex++;
            this.emit('reelChanged', this.currentReelIndex);
        } catch (error) {
            console.error('Failed to scroll to next reel:', error);
            this.emit('error', error);
        }
    }

    async scrollToPreviousReel(): Promise<void> {
        try {
            if (!this.page || !this.isLoggedIn) {
                throw new Error('Page not initialized or not logged in');
            }

            // Scroll up to previous reel
            await this.page.keyboard.press('ArrowUp');
            
            // Wait for reel to load
            await this.page.waitForTimeout(2000);
            
            this.currentReelIndex = Math.max(0, this.currentReelIndex - 1);
            this.emit('reelChanged', this.currentReelIndex);
        } catch (error) {
            console.error('Failed to scroll to previous reel:', error);
            this.emit('error', error);
        }
    }

    async likeCurrentReel(): Promise<void> {
        try {
            if (!this.page || !this.isLoggedIn) {
                throw new Error('Page not initialized or not logged in');
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
            if (!this.page || !this.isLoggedIn) {
                throw new Error('Page not initialized or not logged in');
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
            if (!this.page || !this.isLoggedIn) {
                throw new Error('Page not initialized or not logged in');
            }

            return this.page.url();
        } catch (error) {
            console.error('Failed to get current URL:', error);
            return '';
        }
    }

    async performLogin(): Promise<void> {
        try {
            if (!this.page) {
                throw new Error('Page not initialized');
            }

            // Navigate to login page
            await this.page.goto('https://www.instagram.com/accounts/login/', {
                waitUntil: 'networkidle2'
            });

            // Wait for user to login manually
            console.log('Please login manually in the browser window...');
            this.emit('manualLoginRequired');

            // Wait for login to complete (redirect to main page)
            await this.page.waitForNavigation({ 
                waitUntil: 'networkidle2',
                timeout: 300000 // 5 minutes timeout for manual login
            });

            // Save cookies after successful login
            await this.saveCookies();
            this.isLoggedIn = true;
            
            // Navigate to reels
            await this.navigateToReels();
        } catch (error) {
            console.error('Login failed:', error);
            this.emit('error', error);
        }
    }

    async cleanup(): Promise<void> {
        try {
            if (this.browser) {
                await this.browser.close();
                this.browser = null;
                this.page = null;
            }
        } catch (error) {
            console.error('Failed to cleanup browser:', error);
        }
    }

    isInitialized(): boolean {
        return this.browser !== null && this.page !== null;
    }

    getLoginStatus(): boolean {
        return this.isLoggedIn;
    }
} 