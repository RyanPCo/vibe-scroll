import * as express from 'express';
import * as http from 'http';
import * as WebSocket from 'ws';
import { EventEmitter } from 'events';
import { PuppeteerController } from '../controller/puppeteerController';
import { VolumeService } from '../services/volumeService';

export interface MediaBridgeConfig {
    port: number;
    corsOrigin: string;
}

export class MediaBridge extends EventEmitter {
    private app: express.Application;
    private server: http.Server;
    private wss: WebSocket.Server;
    private config: MediaBridgeConfig;
    private isRunning: boolean = false;
    private currentReelId: string = 'DKLNoc-MgPM';
    private puppeteerController: PuppeteerController | null = null;
    private volumeService: VolumeService | null = null;

    constructor(config: MediaBridgeConfig) {
        super();
        this.config = config;
        this.app = express();
        this.server = http.createServer(this.app);
        this.wss = new WebSocket.Server({ server: this.server });
        
        this.setupRoutes();
        this.setupWebSocket();
    }

    public setPuppeteerController(controller: PuppeteerController): void {
        this.puppeteerController = controller;
        
        // Listen for reel changes from puppeteer
        controller.on('reelChanged', async () => {
            const reelData = await controller.getCurrentReelInfo();
            if (reelData) {
                this.updateCurrentReel(reelData.reelId);
            }
        });
        
        // Listen for reel collection events
        controller.on('reelsCollected', (data: any) => {
            console.log(`Reels collected: ${data.collected} new, ${data.total} total in queue`);
            this.broadcast({ 
                type: 'reels-collected', 
                collected: data.collected,
                total: data.total,
                queueSize: controller.getReelQueueSize(),
                debugInfo: controller.getQueueDebugInfo()
            });
        });

        // Listen for reel changes and send debug info
        controller.on('reelChanged', async () => {
            const reelData = await controller.getCurrentReelInfo();
            if (reelData) {
                this.updateCurrentReel(reelData.reelId);
                this.broadcast({
                    type: 'reel-changed',
                    debugInfo: controller.getQueueDebugInfo()
                });
            }
        });
    }

    public setVolumeService(volumeService: VolumeService): void {
        this.volumeService = volumeService;
        console.log('Volume service connected to media bridge');
        console.log('Platform support:', volumeService.getPlatformInfo());
    }

    private setupRoutes(): void {
        // JSON body parser
        this.app.use(express.json());
        
        // Enable CORS for webview
        this.app.use((req, res, next) => {
            res.header('Access-Control-Allow-Origin', this.config.corsOrigin);
            res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
            res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
            if (req.method === 'OPTIONS') {
                res.sendStatus(200);
            } else {
                next();
            }
        });

        // Root route - serves the current Instagram embed
        this.app.get('/', (req, res) => {
            const reelId = req.query.reelId as string || this.currentReelId;
            const htmlContent = this.generateInstagramEmbedHTML(reelId);
            
            res.writeHead(200, { 
                'Content-Type': 'text/html',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization'
            });
            res.end(htmlContent);
        });

        // Health check endpoint
        this.app.get('/health', (req, res) => {
            res.json({ status: 'ok', timestamp: new Date().toISOString() });
        });

        // Navigation endpoints
        this.app.post('/api/next', async (req, res) => {
            try {
                if (this.puppeteerController) {
                    await this.puppeteerController.scrollToNextReel();
                    res.json({ success: true, message: 'Scrolled to next reel' });
                } else {
                    res.status(503).json({ error: 'Puppeteer controller not available' });
                }
            } catch (error) {
                console.error('Error scrolling to next reel:', error);
                res.status(500).json({ error: 'Failed to scroll to next reel' });
            }
        });

        this.app.post('/api/previous', async (req, res) => {
            try {
                if (this.puppeteerController) {
                    await this.puppeteerController.scrollToPreviousReel();
                    res.json({ success: true, message: 'Scrolled to previous reel' });
                } else {
                    res.status(503).json({ error: 'Puppeteer controller not available' });
                }
            } catch (error) {
                console.error('Error scrolling to previous reel:', error);
                res.status(500).json({ error: 'Failed to scroll to previous reel' });
            }
        });

        // Interaction endpoints
        this.app.post('/api/like', async (req, res) => {
            try {
                if (this.puppeteerController) {
                    await this.puppeteerController.likeCurrentReel();
                    res.json({ success: true, message: 'Reel liked' });
                } else {
                    res.status(503).json({ error: 'Puppeteer controller not available' });
                }
            } catch (error) {
                console.error('Error liking reel:', error);
                res.status(500).json({ error: 'Failed to like reel' });
            }
        });

        this.app.post('/api/save', async (req, res) => {
            try {
                if (this.puppeteerController) {
                    await this.puppeteerController.saveCurrentReel();
                    res.json({ success: true, message: 'Reel saved' });
                } else {
                    res.status(503).json({ error: 'Puppeteer controller not available' });
                }
            } catch (error) {
                console.error('Error saving reel:', error);
                res.status(500).json({ error: 'Failed to save reel' });
            }
        });

        this.app.get('/api/open-browser', async (req, res) => {
            try {
                if (this.puppeteerController) {
                    const url = await this.puppeteerController.openCurrentReelInBrowser();
                    res.json({ success: true, url });
                } else {
                    res.status(503).json({ error: 'Puppeteer controller not available' });
                }
            } catch (error) {
                console.error('Error getting reel URL:', error);
                res.status(500).json({ error: 'Failed to get reel URL' });
            }
        });

        this.app.post('/api/refresh', async (req, res) => {
            try {
                if (this.puppeteerController) {
                    const reelData = await this.puppeteerController.getCurrentReelInfo();
                    if (reelData) {
                        this.updateCurrentReel(reelData.reelId);
                        res.json({ success: true, reelId: reelData.reelId });
                    } else {
                        res.status(404).json({ error: 'No reel data available' });
                    }
                } else {
                    res.status(503).json({ error: 'Puppeteer controller not available' });
                }
            } catch (error) {
                console.error('Error refreshing reel:', error);
                res.status(500).json({ error: 'Failed to refresh reel' });
            }
        });

        // Debug endpoint to get queue info
        this.app.get('/api/debug/queue', (req, res) => {
            try {
                if (this.puppeteerController) {
                    const debugInfo = this.puppeteerController.getQueueDebugInfo();
                    res.json({ success: true, ...debugInfo });
                } else {
                    res.status(503).json({ error: 'Puppeteer controller not available' });
                }
            } catch (error) {
                console.error('Error getting queue debug info:', error);
                res.status(500).json({ error: 'Failed to get queue info' });
            }
        });

        // Debug endpoint to get media elements info
        this.app.get('/api/debug/media', (req, res) => {
            res.json({ 
                success: true, 
                message: 'Check browser console for detailed media element logs',
                note: 'Volume control may be limited by Instagram security policies'
            });
        });

        // Volume control endpoints
        this.app.get('/api/volume', async (req, res) => {
            try {
                if (this.volumeService) {
                    const volume = await this.volumeService.getSystemVolume();
                    const muted = await this.volumeService.getSystemMuted();
                    res.json({ 
                        success: true, 
                        volume: volume,
                        muted: muted,
                        platform: this.volumeService.getPlatformInfo()
                    });
                } else {
                    res.status(503).json({ error: 'Volume service not available' });
                }
            } catch (error) {
                console.error('Error getting volume:', error);
                res.status(500).json({ error: 'Failed to get volume' });
            }
        });

        this.app.post('/api/volume', async (req, res) => {
            try {
                if (this.volumeService) {
                    const { volume } = req.body;
                    if (typeof volume !== 'number' || volume < 0 || volume > 100) {
                        res.status(400).json({ error: 'Volume must be a number between 0 and 100' });
                        return;
                    }
                    
                    const success = await this.volumeService.setSystemVolume(volume);
                    if (success) {
                        res.json({ success: true, volume: volume });
                        // Broadcast volume change to connected clients
                        this.broadcast({
                            type: 'volume-changed',
                            volume: volume,
                            muted: await this.volumeService.getSystemMuted()
                        });
                    } else {
                        res.status(500).json({ error: 'Failed to set volume' });
                    }
                } else {
                    res.status(503).json({ error: 'Volume service not available' });
                }
            } catch (error) {
                console.error('Error setting volume:', error);
                res.status(500).json({ error: 'Failed to set volume' });
            }
        });

        this.app.post('/api/volume/mute', async (req, res) => {
            try {
                if (this.volumeService) {
                    const { muted } = req.body;
                    if (typeof muted !== 'boolean') {
                        res.status(400).json({ error: 'Muted must be a boolean' });
                        return;
                    }
                    
                    const success = await this.volumeService.setSystemMuted(muted);
                    if (success) {
                        res.json({ success: true, muted: muted });
                        // Broadcast mute change to connected clients
                        this.broadcast({
                            type: 'volume-changed',
                            volume: await this.volumeService.getSystemVolume(),
                            muted: muted
                        });
                    } else {
                        res.status(500).json({ error: 'Failed to set mute state' });
                    }
                } else {
                    res.status(503).json({ error: 'Volume service not available' });
                }
            } catch (error) {
                console.error('Error setting mute state:', error);
                res.status(500).json({ error: 'Failed to set mute state' });
            }
        });

        this.app.post('/api/volume/toggle-mute', async (req, res) => {
            try {
                if (this.volumeService) {
                    const success = await this.volumeService.toggleMute();
                    if (success) {
                        const currentState = this.volumeService.getLastKnownState();
                        res.json({ success: true, muted: currentState.muted });
                        // Broadcast mute change to connected clients
                        this.broadcast({
                            type: 'volume-changed',
                            volume: currentState.volume,
                            muted: currentState.muted
                        });
                    } else {
                        res.status(500).json({ error: 'Failed to toggle mute' });
                    }
                } else {
                    res.status(503).json({ error: 'Volume service not available' });
                }
            } catch (error) {
                console.error('Error toggling mute:', error);
                res.status(500).json({ error: 'Failed to toggle mute' });
            }
        });

        this.app.post('/api/volume/adjust', async (req, res) => {
            try {
                if (this.volumeService) {
                    const { delta } = req.body;
                    if (typeof delta !== 'number') {
                        res.status(400).json({ error: 'Delta must be a number' });
                        return;
                    }
                    
                    const newVolume = await this.volumeService.adjustVolume(delta);
                    res.json({ success: true, volume: newVolume });
                    // Broadcast volume change to connected clients
                    this.broadcast({
                        type: 'volume-changed',
                        volume: newVolume,
                        muted: await this.volumeService.getSystemMuted()
                    });
                } else {
                    res.status(503).json({ error: 'Volume service not available' });
                }
            } catch (error) {
                console.error('Error adjusting volume:', error);
                res.status(500).json({ error: 'Failed to adjust volume' });
            }
        });

        // Error handling middleware
        this.app.use((error: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
            console.error('Express error:', error);
            res.status(500).json({ error: 'Internal server error' });
        });
    }

    private generateInstagramEmbedHTML(reelId: string): string {
        const reelUrl = `https://www.instagram.com/reel/${reelId}/`;
        
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Instagram Reel</title>
    <style>
        body, html {
            margin: 0;
            padding: 0;
            height: 100vh;
            background: #000;
            font-family: Arial, sans-serif;
            position: relative;
        }
        .container {
            height: 100vh;
            max-width: 540px;
            width: 100%;
            margin: 0 auto;
            padding: 20px;
            box-sizing: border-box;
            position: relative;
            overflow: hidden;
        }
        
        .embed-wrapper {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 100%;
            max-width: 500px;
            height: 80vh;
            overflow-y: auto;
            overflow-x: hidden;
        }
        .loading {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            color: white;
            text-align: center;
            padding: 20px;
            z-index: 10;
        }
        
        /* Navigation Buttons */
        .nav-btn {
            position: absolute;
            top: 50%;
            transform: translateY(-50%);
            background: rgba(0, 0, 0, 0.7);
            color: #fff;
            border: none;
            width: 60px;
            height: 60px;
            border-radius: 50%;
            font-size: 24px;
            cursor: pointer;
            transition: all 0.2s;
            z-index: 1000;
            backdrop-filter: blur(10px);
            font-weight: bold;
        }
        
        .nav-btn:hover {
            background: rgba(0, 0, 0, 0.9);
            transform: translateY(-50%) scale(1.1);
        }
        
        .nav-btn:active {
            transform: translateY(-50%) scale(0.95);
        }
        
        .nav-btn:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }
        
        .nav-btn-left {
            left: 20px;
        }
        
        .nav-btn-right {
            right: 20px;
        }
        
        /* Volume Control */
        .volume-control {
            position: absolute;
            bottom: 30px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(0, 0, 0, 0.7);
            border-radius: 25px;
            padding: 10px 20px;
            display: flex;
            align-items: center;
            gap: 12px;
            z-index: 1000;
            backdrop-filter: blur(10px);
            transition: opacity 0.3s ease;
        }
        
        .volume-control:hover {
            background: rgba(0, 0, 0, 0.9);
        }
        
        .volume-icon {
            color: #fff;
            font-size: 18px;
            cursor: pointer;
            min-width: 20px;
            text-align: center;
        }
        
        .volume-slider {
            width: 100px;
            height: 4px;
            background: rgba(255, 255, 255, 0.3);
            border-radius: 2px;
            outline: none;
            cursor: pointer;
            position: relative;
        }
        
        .volume-slider::-webkit-slider-thumb {
            appearance: none;
            width: 16px;
            height: 16px;
            background: #fff;
            border-radius: 50%;
            cursor: pointer;
            box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
        }
        
        .volume-slider::-moz-range-thumb {
            width: 16px;
            height: 16px;
            background: #fff;
            border-radius: 50%;
            cursor: pointer;
            border: none;
            box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
        }
        
        .volume-percentage {
            color: #fff;
            font-size: 12px;
            min-width: 30px;
            text-align: center;
        }
        
        /* Notification */
        .notification {
            position: fixed;
            top: 20px;
            right: 20px;
            background: #4caf50;
            color: white;
            padding: 12px 20px;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
            z-index: 2000;
            transform: translateX(100%);
            transition: transform 0.3s ease-out;
        }
        
        .notification.show {
            transform: translateX(0);
        }
        
        .notification.error {
            background: #f44336;
        }
        
        /* Collection Indicator */
        .preload-indicator {
            position: absolute;
            top: 20px;
            left: 20px;
            background: rgba(0, 0, 0, 0.7);
            color: #fff;
            padding: 8px 12px;
            border-radius: 20px;
            font-size: 12px;
            z-index: 1000;
            backdrop-filter: blur(10px);
            opacity: 0;
            transition: opacity 0.3s ease;
            display: flex;
            align-items: center;
            gap: 8px;
        }
        
        .preload-indicator.show {
            opacity: 1;
        }
        
        .preload-indicator .spinner {
            width: 12px;
            height: 12px;
            border: 2px solid #fff;
            border-top: 2px solid transparent;
            border-radius: 50%;
            animation: spin 1s linear infinite;
        }
        
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
        
        /* Debug Panel */
        .debug-panel {
            position: fixed;
            top: 10px;
            right: 10px;
            width: 300px;
            max-height: 80vh;
            background: rgba(0, 0, 0, 0.9);
            color: #fff;
            border-radius: 8px;
            padding: 15px;
            font-family: 'Courier New', monospace;
            font-size: 11px;
            z-index: 2000;
            overflow-y: auto;
            backdrop-filter: blur(10px);
            border: 1px solid rgba(255, 255, 255, 0.2);
        }
        
        .debug-panel h3 {
            margin: 0 0 10px 0;
            color: #4caf50;
            font-size: 14px;
            text-align: center;
        }
        
        .debug-stats {
            margin-bottom: 15px;
            padding: 8px;
            background: rgba(255, 255, 255, 0.1);
            border-radius: 4px;
        }
        
        .debug-stats div {
            margin: 3px 0;
        }
        
        .debug-queue {
            max-height: 50vh;
            overflow-y: auto;
        }
        
        .queue-item {
            padding: 4px 8px;
            margin: 2px 0;
            border-radius: 4px;
            background: rgba(255, 255, 255, 0.1);
            font-size: 10px;
            word-break: break-all;
            position: relative;
        }
        
        .queue-item.current {
            background: #4caf50;
            color: #000;
            font-weight: bold;
        }
        
        .queue-item.viewed {
            background: rgba(255, 255, 255, 0.05);
            color: #888;
        }
        
        .queue-item .index {
            display: inline-block;
            width: 20px;
            color: #ccc;
            font-size: 9px;
        }
        
        .debug-panel.minimized {
            width: 60px;
            height: 60px;
            padding: 8px;
            cursor: pointer;
        }
        
        .debug-panel.minimized h3 {
            font-size: 10px;
            margin: 0;
        }
        
        .debug-panel.minimized .debug-content {
            display: none;
        }
        
        .debug-toggle {
            position: absolute;
            top: 5px;
            right: 8px;
            background: none;
            border: none;
            color: #fff;
            cursor: pointer;
            font-size: 16px;
            padding: 0;
            width: 20px;
            height: 20px;
        }
        
        /* Responsive */
        @media (max-width: 480px) {
            .nav-btn {
                width: 50px;
                height: 50px;
                font-size: 20px;
            }
            
            .nav-btn-left {
                left: 10px;
            }
            
            .nav-btn-right {
                right: 10px;
            }
            

            
            .debug-panel {
                width: calc(100vw - 20px);
                right: 10px;
                max-height: 50vh;
                font-size: 10px;
            }
            
            .debug-panel.minimized {
                width: 50px;
                height: 50px;
            }
            
            .volume-control {
                bottom: 20px;
                padding: 8px 16px;
                gap: 8px;
            }
            
            .volume-slider {
                width: 80px;
            }
            
            .volume-icon {
                font-size: 16px;
            }
            
            .volume-percentage {
                font-size: 11px;
                min-width: 25px;
            }
        }
    </style>
</head>
<body>
            <div class="container">
        <button id="prev-btn" class="nav-btn nav-btn-left">⬆</button>
        
        <div class="loading" id="loading">
            <div style="color: white; text-align: center;">
                <h3>Loading Instagram Reel...</h3>
                <p>Reel ID: ${reelId}</p>
                <p>If the reel doesn't load, Instagram's embed service might be unavailable.</p>
                <button onclick="window.location.reload()" style="background: #e91e63; color: white; border: none; padding: 10px 20px; border-radius: 5px; cursor: pointer; margin-top: 10px;">Retry</button>
            </div>
        </div>
        
        <div class="preload-indicator" id="preload-indicator">
            <div class="spinner"></div>
            <span>Building reel buffer...</span>
        </div>
        
        <div class="embed-wrapper">
            <blockquote class="instagram-media" data-instgrm-captioned data-instgrm-permalink="${reelUrl}?utm_source=ig_embed&amp;utm_campaign=loading" data-instgrm-version="14" data-instgrm-autoplay="true" style="background:#FFF; border:0; border-radius:3px; box-shadow:0 0 1px 0 rgba(0,0,0,0.5),0 1px 10px 0 rgba(0,0,0,0.15); margin: 1px; max-width:540px; min-width:326px; padding:0; width:99.375%; width:-webkit-calc(100% - 2px); width:calc(100% - 2px);">
                <div style="padding:16px;">
                    <a href="${reelUrl}?utm_source=ig_embed&amp;utm_campaign=loading" style="background:#FFFFFF; line-height:0; padding:0 0; text-align:center; text-decoration:none; width:100%;" target="_blank">
                        <div style="display: flex; flex-direction: row; align-items: center;">
                            <div style="background-color: #F4F4F4; border-radius: 50%; flex-grow: 0; height: 40px; margin-right: 14px; width: 40px;"></div>
                            <div style="display: flex; flex-direction: column; flex-grow: 1; justify-content: center;">
                                <div style="background-color: #F4F4F4; border-radius: 4px; flex-grow: 0; height: 14px; margin-bottom: 6px; width: 100px;"></div>
                                <div style="background-color: #F4F4F4; border-radius: 4px; flex-grow: 0; height: 14px; width: 60px;"></div>
                            </div>
                        </div>
                        <div style="padding: 19% 0;"></div>
                        <div style="display:block; height:50px; margin:0 auto 12px; width:50px;">
                            <svg width="50px" height="50px" viewBox="0 0 60 60" version="1.1" xmlns="https://www.w3.org/2000/svg" xmlns:xlink="https://www.w3.org/1999/xlink">
                                <g stroke="none" stroke-width="1" fill="none" fill-rule="evenodd">
                                    <g transform="translate(-511.000000, -20.000000)" fill="#000000">
                                        <g>
                                            <path d="M556.869,30.41 C554.814,30.41 553.148,32.076 553.148,34.131 C553.148,36.186 554.814,37.852 556.869,37.852 C558.924,37.852 560.59,36.186 560.59,34.131 C560.59,32.076 558.924,30.41 556.869,30.41 M541,60.657 C535.114,60.657 530.342,55.887 530.342,50 C530.342,44.114 535.114,39.342 541,39.342 C546.887,39.342 551.658,44.114 551.658,50 C551.658,55.887 546.887,60.657 541,60.657 M541,33.886 C532.1,33.886 524.886,41.1 524.886,50 C524.886,58.899 532.1,66.113 541,66.113 C549.9,66.113 557.115,58.899 557.115,50 C557.115,41.1 549.9,33.886 541,33.886 M565.378,62.101 C565.244,65.022 564.756,66.606 564.346,67.663 C563.803,69.06 563.154,70.057 562.106,71.106 C561.058,72.155 560.06,72.803 558.662,73.347 C557.607,73.757 556.021,74.244 553.102,74.378 C549.944,74.521 548.997,74.552 541,74.552 C533.003,74.552 532.056,74.521 528.898,74.378 C525.979,74.244 524.393,73.757 523.338,73.347 C521.94,72.803 520.942,72.155 519.894,71.106 C518.846,70.057 518.197,69.06 517.654,67.663 C517.244,66.606 516.755,65.022 516.623,62.101 C516.479,58.943 516.448,57.996 516.448,50 C516.448,42.003 516.479,41.056 516.623,37.899 C516.755,34.978 517.244,33.391 517.654,32.338 C518.197,30.938 518.846,29.942 519.894,28.894 C520.942,27.846 521.94,27.196 523.338,26.654 C524.393,26.244 525.979,25.756 528.898,25.623 C532.057,25.479 533.004,25.448 541,25.448 C548.997,25.448 549.943,25.479 553.102,25.623 C556.021,25.756 557.607,26.244 558.662,26.654 C560.06,27.196 561.058,27.846 562.106,28.894 C563.154,29.942 563.803,30.938 564.346,32.338 C564.756,33.391 565.244,34.978 565.378,37.899 C565.522,41.056 565.552,42.003 565.552,50 C565.552,57.996 565.522,58.943 565.378,62.101 M570.82,37.631 C570.674,34.438 570.167,32.258 569.425,30.349 C568.659,28.377 567.633,26.702 565.965,25.035 C564.297,23.368 562.623,22.342 560.652,21.575 C558.743,20.834 556.562,20.326 553.369,20.18 C550.169,20.033 549.148,20 541,20 C532.853,20 531.831,20.033 528.631,20.18 C525.438,20.326 523.257,20.834 521.349,21.575 C519.376,22.342 517.703,23.368 516.035,25.035 C514.368,26.702 513.342,28.377 512.574,30.349 C511.834,32.258 511.326,34.438 511.181,37.631 C511.035,40.831 511,41.851 511,50 C511,58.147 511.035,59.17 511.181,62.369 C511.326,65.562 511.834,67.743 512.574,69.651 C513.342,71.625 514.368,73.296 516.035,74.965 C517.703,76.634 519.376,77.658 521.349,78.425 C523.257,79.167 525.438,79.673 528.631,79.82 C531.831,79.965 532.853,80.001 541,80.001 C549.148,80.001 550.169,79.965 553.369,79.82 C556.562,79.673 558.743,79.167 560.652,78.425 C562.623,77.658 564.297,76.634 565.965,74.965 C567.633,73.296 568.659,71.625 569.425,69.651 C570.167,67.743 570.674,65.562 570.82,62.369 C570.966,59.17 571,58.147 571,50 C571,41.851 570.966,40.831 570.82,37.631"></path>
                                        </g>
                                    </g>
                                </g>
                            </svg>
                        </div>
                        <div style="padding-top: 8px;">
                            <div style="color:#3897f0; font-family:Arial,sans-serif; font-size:14px; font-style:normal; font-weight:550; line-height:18px;">View this post on Instagram</div>
                        </div>
                        <div style="padding: 12.5% 0;"></div>
                        <div style="display: flex; flex-direction: row; margin-bottom: 14px; align-items: center;">
                            <div>
                                <div style="background-color: #F4F4F4; border-radius: 50%; height: 12.5px; width: 12.5px; transform: translateX(0px) translateY(7px);"></div>
                                <div style="background-color: #F4F4F4; height: 12.5px; transform: rotate(-45deg) translateX(3px) translateY(1px); width: 12.5px; flex-grow: 0; margin-right: 14px; margin-left: 2px;"></div>
                                <div style="background-color: #F4F4F4; border-radius: 50%; height: 12.5px; width: 12.5px; transform: translateX(9px) translateY(-18px);"></div>
                            </div>
                            <div style="margin-left: 8px;">
                                <div style="background-color: #F4F4F4; border-radius: 50%; flex-grow: 0; height: 20px; width: 20px;"></div>
                                <div style="width: 0; height: 0; border-top: 2px solid transparent; border-left: 6px solid #f4f4f4; border-bottom: 2px solid transparent; transform: translateX(16px) translateY(-4px) rotate(30deg)"></div>
                            </div>
                            <div style="margin-left: auto;">
                                <div style="width: 0px; border-top: 8px solid #F4F4F4; border-right: 8px solid transparent; transform: translateY(16px);"></div>
                                <div style="background-color: #F4F4F4; flex-grow: 0; height: 12px; width: 16px; transform: translateY(-4px);"></div>
                                <div style="width: 0; height: 0; border-top: 8px solid #F4F4F4; border-left: 8px solid transparent; transform: translateY(-4px) translateX(8px);"></div>
                            </div>
                        </div>
                        <div style="display: flex; flex-direction: column; flex-grow: 1; justify-content: center; margin-bottom: 24px;">
                            <div style="background-color: #F4F4F4; border-radius: 4px; flex-grow: 0; height: 14px; margin-bottom: 6px; width: 224px;"></div>
                            <div style="background-color: #F4F4F4; border-radius: 4px; flex-grow: 0; height: 14px; width: 144px;"></div>
                        </div>
                    </a>
                    <p style="color:#c9c8cd; font-family:Arial,sans-serif; font-size:14px; line-height:17px; margin-bottom:0; margin-top:8px; overflow:hidden; padding:8px 0 7px; text-align:center; text-overflow:ellipsis; white-space:nowrap;">
                        <a href="${reelUrl}?utm_source=ig_embed&amp;utm_campaign=loading" style="color:#c9c8cd; font-family:Arial,sans-serif; font-size:14px; font-style:normal; font-weight:normal; line-height:17px; text-decoration:none;" target="_blank">A post shared on Instagram</a>
                    </p>
                </div>
            </blockquote>
        </div>
        
        <button id="next-btn" class="nav-btn nav-btn-right">⬇</button>
        

    </div>
    
    <!-- Debug Panel 
    <div class="debug-panel" id="debug-panel">
        <button class="debug-toggle" id="debug-toggle">−</button>
        <h3>Reel Queue Debug</h3>
        <div class="debug-content">
            <div class="debug-stats" id="debug-stats">
                <div>Current Index: <span id="current-index">0</span></div>
                <div>Total Reels: <span id="total-reels">0</span></div>
                <div>Remaining: <span id="remaining-reels">0</span></div>
                <div>Collecting: <span id="is-collecting">No</span></div>
            </div>
            <div class="debug-queue" id="debug-queue">
                <!-- Queue items will be populated by JavaScript -->
            </div>
        </div>
    </div> -->


    
    <script async src="//www.instagram.com/embed.js"></script>
    <script>
        let isLoading = false;
        let preloadCount = 0;
        
        function initializeApp() {
            document.getElementById('loading').style.display = 'none';
            setupEventListeners();
            setupKeyboardShortcuts();
            setupWebSocket();
            setupDebugPanel();
            setupPostMessageListener();
            loadInitialDebugInfo();
            
            // Initialize Instagram embed
            if (window.instgrm) {
                window.instgrm.Embeds.process();
            }
        }
        
        // Initialize when DOM is ready
        document.addEventListener('DOMContentLoaded', function() {
            console.log('DOM loaded, initializing app...');
            initializeApp();
            
            // Set up Instagram embed retry mechanism
            let retryCount = 0;
            const maxRetries = 5;
            
            function tryProcessEmbed() {
                console.log('Attempting to process Instagram embed, attempt:', retryCount + 1);
                
                if (window.instgrm && window.instgrm.Embeds) {
                    console.log('Instagram embed script loaded, processing...');
                    window.instgrm.Embeds.process();
                    document.getElementById('loading').style.display = 'none';
                } else {
                    retryCount++;
                    if (retryCount < maxRetries) {
                        console.log('Instagram script not ready, retrying in 1 second...');
                        setTimeout(tryProcessEmbed, 1000);
                    } else {
                        console.error('Instagram embed failed to load after', maxRetries, 'attempts');
                        document.getElementById('loading').innerHTML = 
                            '<div style="color: white; text-align: center;">' +
                            '<h3>Unable to load Instagram embed</h3>' +
                            '<p>Reel ID: ${reelId}</p>' +
                            '<p>Please check your internet connection or try again later.</p>' +
                            '<button onclick="window.location.reload()" style="background: #e91e63; color: white; border: none; padding: 10px 20px; border-radius: 5px; cursor: pointer; margin-top: 10px;">Retry</button>' +
                            '</div>';
                    }
                }
            }
            
            // Start trying to process embed
            setTimeout(tryProcessEmbed, 500);
        });
        
        // Also initialize when Instagram script loads
        window.addEventListener('load', function() {
            console.log('Window loaded, checking Instagram script...');
            if (window.instgrm && window.instgrm.Embeds) {
                console.log('Processing Instagram embeds on window load...');
                window.instgrm.Embeds.process();
                document.getElementById('loading').style.display = 'none';
            }
        });
        
        function setupWebSocket() {
            try {
                const ws = new WebSocket('ws://localhost:3000');
                
                ws.onmessage = (event) => {
                    try {
                        const data = JSON.parse(event.data);
                        handleWebSocketMessage(data);
                    } catch (error) {
                        console.error('Error parsing WebSocket message:', error);
                    }
                };
                
                ws.onopen = () => {
                    console.log('WebSocket connected');
                };
                
                ws.onclose = () => {
                    console.log('WebSocket disconnected');
                    // Attempt to reconnect after a delay
                    setTimeout(setupWebSocket, 3000);
                };
                
                ws.onerror = (error) => {
                    console.error('WebSocket error:', error);
                };
            } catch (error) {
                console.error('Error setting up WebSocket:', error);
            }
        }
        
        function handleWebSocketMessage(data) {
            switch (data.type) {
                case 'reels-collected':
                    handleReelsCollected(data);
                    break;
                case 'reel-changed':
                    // Hide collection indicator when reel changes
                    hidePreloadIndicator();
                    // Update debug panel
                    if (data.debugInfo) {
                        updateDebugPanel(data.debugInfo);
                    }
                    break;
                default:
                    console.log('Unknown WebSocket message:', data);
            }
        }
        
        function handleReelsCollected(data) {
            const queueSize = data.queueSize || data.total || 0;
            console.log('Reels collected: ' + data.collected + ' new, ' + queueSize + ' total in queue');
            
            // Show brief notification only for significant collections
            if (data.collected > 0) {
                // showNotification('Buffer updated: ' + queueSize + ' reels ready! 🎬', 'success');
            }
            
            // Update debug panel
            if (data.debugInfo) {
                updateDebugPanel(data.debugInfo);
            }
            
            // Hide the collection indicator
            hidePreloadIndicator();
        }
        
        function setupDebugPanel() {
            const debugToggle = document.getElementById('debug-toggle');
            const debugPanel = document.getElementById('debug-panel');
            
            debugToggle.addEventListener('click', () => {
                debugPanel.classList.toggle('minimized');
                debugToggle.textContent = debugPanel.classList.contains('minimized') ? '+' : '−';
            });
            
            // Click to expand when minimized
            debugPanel.addEventListener('click', () => {
                if (debugPanel.classList.contains('minimized')) {
                    debugPanel.classList.remove('minimized');
                    debugToggle.textContent = '−';
                }
            });
        }
        
        function loadInitialDebugInfo() {
            fetch('/api/debug/queue')
                .then(response => response.json())
                .then(data => {
                    if (data.success) {
                        updateDebugPanel(data);
                    }
                })
                .catch(error => {
                    console.error('Error loading initial debug info:', error);
                });
        }
        
        function updateDebugPanel(debugInfo) {
            try {
                // Update stats
                document.getElementById('current-index').textContent = debugInfo.currentIndex;
                document.getElementById('total-reels').textContent = debugInfo.queue.length;
                document.getElementById('remaining-reels').textContent = debugInfo.bufferStatus.remaining;
                document.getElementById('is-collecting').textContent = debugInfo.bufferStatus.isCollecting ? 'Yes' : 'No';
                
                // Update queue display
                const queueContainer = document.getElementById('debug-queue');
                queueContainer.innerHTML = '';
                
                debugInfo.queue.forEach((reelId, index) => {
                    const queueItem = document.createElement('div');
                    queueItem.className = 'queue-item';
                    
                    // Add status classes
                    if (index === debugInfo.currentIndex) {
                        queueItem.classList.add('current');
                    } else if (index < debugInfo.currentIndex) {
                        queueItem.classList.add('viewed');
                    }
                    
                    // Truncate reel ID for display
                    const displayId = reelId.length > 20 ? reelId.substring(0, 20) + '...' : reelId;
                    
                    queueItem.innerHTML = '<span class="index">' + index + ':</span> ' + displayId;
                    queueContainer.appendChild(queueItem);
                });
                
                // Scroll current reel into view
                const currentItem = queueContainer.querySelector('.queue-item.current');
                if (currentItem) {
                    currentItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            } catch (error) {
                console.error('Error updating debug panel:', error);
            }
        }
        
        function showPreloadIndicator() {
            const indicator = document.getElementById('preload-indicator');
            indicator.classList.add('show');
        }
        
        function hidePreloadIndicator() {
            const indicator = document.getElementById('preload-indicator');
            indicator.classList.remove('show');
        }
        
        function setupEventListeners() {
            // Navigation buttons
            document.getElementById('prev-btn').addEventListener('click', () => handleAction('/api/previous'));
            document.getElementById('next-btn').addEventListener('click', () => handleAction('/api/next'));
        }
        

        
        function setupKeyboardShortcuts() {
            document.addEventListener('keydown', (e) => {
                // Skip if user is typing in an input field
                if (e.target.tagName === 'INPUT' && e.target.type !== 'range') return;
                if (e.target.tagName === 'TEXTAREA') return;
                
                switch(e.key.toLowerCase()) {
                    case 'arrowdown':
                    case 'j':
                        e.preventDefault();
                        document.getElementById('next-btn').click();
                        break;
                    case 'arrowup':
                    case 'k':
                        e.preventDefault();
                        document.getElementById('prev-btn').click();
                        break;
                }
            });
        }
        
        function setupPostMessageListener() {
            window.addEventListener('message', (event) => {
                // Accept messages from the parent webview (more flexible origin checking)
                if (!event.origin.includes('vscode-webview') && event.origin !== 'null' && !event.origin.includes('localhost')) return;
                
                const message = event.data;
                if (message.type === 'setVolume') {
                    console.log('Received volume command from webview:', Math.round(message.volume * 100) + '%');
                    
                    // Try to apply volume to any video elements
                    applyVolumeToVideos(message.volume);
                }
            });
        }
        
        function applyVolumeToVideos(volumeLevel) {
            try {
                console.log('applyVolumeToVideos called with volume:', volumeLevel);
                
                // Find all video elements in the page
                const videos = document.querySelectorAll('video');
                console.log('Found', videos.length, 'video elements on page');
                
                if (videos.length === 0) {
                    console.log('No video elements found. Page content:', document.body.innerHTML.substring(0, 500));
                }
                
                videos.forEach((video, index) => {
                    try {
                        const oldVolume = video.volume;
                        video.volume = volumeLevel;
                        if (volumeLevel === 0) {
                            video.muted = true;
                        } else {
                            video.muted = false;
                        }
                        console.log('Video', index, '- Changed volume from', oldVolume, 'to', video.volume, ', muted:', video.muted);
                    } catch (error) {
                        console.log('Could not control video', index, 'volume:', error);
                    }
                });
                
                // Try to find Instagram embed iframe and send message to it
                const iframes = document.querySelectorAll('iframe');
                console.log('Found', iframes.length, 'iframes on page');
                
                iframes.forEach((iframe, index) => {
                    console.log('Iframe', index, 'src:', iframe.src);
                    try {
                        if (iframe.src && iframe.src.includes('instagram.com')) {
                            iframe.contentWindow.postMessage({
                                type: 'setVolume',
                                volume: volumeLevel
                            }, '*');
                            console.log('Sent volume command to Instagram iframe', index, ':', volumeLevel);
                        }
                    } catch (error) {
                        console.log('Could not send volume message to Instagram iframe', index, ':', error);
                    }
                });
                
                // Check for any audio elements too
                const audioElements = document.querySelectorAll('audio');
                console.log('Found', audioElements.length, 'audio elements on page');
                audioElements.forEach((audio, index) => {
                    try {
                        audio.volume = volumeLevel;
                        audio.muted = volumeLevel === 0;
                        console.log('Set audio element', index, 'volume to', volumeLevel);
                    } catch (error) {
                        console.log('Could not control audio element', index, ':', error);
                    }
                });
                
                // Use a mutation observer to catch dynamically added videos
                if (!window.volumeObserver) {
                    console.log('Setting up mutation observer for dynamic content');
                    window.volumeObserver = new MutationObserver((mutations) => {
                        mutations.forEach((mutation) => {
                            mutation.addedNodes.forEach((node) => {
                                if (node.nodeType === Node.ELEMENT_NODE) {
                                    const videos = node.querySelectorAll ? node.querySelectorAll('video') : [];
                                    const audios = node.querySelectorAll ? node.querySelectorAll('audio') : [];
                                    
                                    if (videos.length > 0) {
                                        console.log('Mutation observer found', videos.length, 'new video elements');
                                        videos.forEach(video => {
                                            try {
                                                video.volume = window.currentVolume || 0.75;
                                                console.log('Applied volume to dynamically added video:', video.volume);
                                            } catch (error) {
                                                console.log('Could not control dynamic video volume:', error);
                                            }
                                        });
                                    }
                                    
                                    if (audios.length > 0) {
                                        console.log('Mutation observer found', audios.length, 'new audio elements');
                                        audios.forEach(audio => {
                                            try {
                                                audio.volume = window.currentVolume || 0.75;
                                                console.log('Applied volume to dynamically added audio:', audio.volume);
                                            } catch (error) {
                                                console.log('Could not control dynamic audio volume:', error);
                                            }
                                        });
                                    }
                                }
                            });
                        });
                    });
                    
                    window.volumeObserver.observe(document.body, {
                        childList: true,
                        subtree: true
                    });
                }
                
                // Store current volume globally
                window.currentVolume = volumeLevel;
                console.log('Stored global volume:', window.currentVolume);
                
            } catch (error) {
                console.error('Error applying volume to videos:', error);
            }
        }
        
        async function handleAction(endpoint, successMessage = null) {
            if (isLoading) return;
            
            try {
                setLoading(true);
                
                // Show collection indicator for next reel navigation (triggers buffer maintenance)
                if (endpoint.includes('/api/next')) {
                    showPreloadIndicator();
                }
                
                const response = await fetch(endpoint, { method: 'POST' });
                const data = await response.json();
                
                if (data.success) {
                    if (successMessage) {
                        showNotification(successMessage);
                    }
                    
                    // For navigation actions, reload the page after a delay
                    if (endpoint.includes('/api/next') || endpoint.includes('/api/previous')) {
                        setTimeout(() => {
                            window.location.reload();
                        }, 1000);
                    }
                } else {
                    showNotification(data.error || 'Action failed', 'error');
                }
            } catch (error) {
                console.error('Error performing action:', error);
                showNotification('Network error occurred', 'error');
            } finally {
                setLoading(false);
            }
        }
        
        function setLoading(loading) {
            isLoading = loading;
            const buttons = ['prev-btn', 'next-btn'];
            
            buttons.forEach(id => {
                const btn = document.getElementById(id);
                if (btn) {
                    btn.disabled = loading;
                    if (loading) {
                        btn.style.opacity = '0.5';
                        if (id === 'next-btn') btn.textContent = '⏳';
                        if (id === 'prev-btn') btn.textContent = '⏳';
                    } else {
                        btn.style.opacity = '1';
                        if (id === 'next-btn') btn.textContent = '⬇';
                        if (id === 'prev-btn') btn.textContent = '⬆';
                    }
                }
            });
        }
        
        function showNotification(message, type = 'success') {
            const notification = document.createElement('div');
            notification.className = 'notification' + (type === 'error' ? ' error' : '');
            notification.textContent = message;
            
            document.body.appendChild(notification);
            
            // Trigger animation
            setTimeout(() => notification.classList.add('show'), 10);
            
            // Remove after 3 seconds
            setTimeout(() => {
                notification.classList.remove('show');
                setTimeout(() => notification.remove(), 300);
            }, 3000);
        }
    </script>
</body>
</html>`;
    }

    private setupWebSocket(): void {
        this.wss.on('connection', (ws: WebSocket) => {
            console.log('WebSocket client connected');
            
            ws.on('message', (message: string) => {
                try {
                    const data = JSON.parse(message);
                    this.handleWebSocketMessage(ws, data);
                } catch (error) {
                    console.error('WebSocket message parsing error:', error);
                    ws.send(JSON.stringify({ error: 'Invalid message format' }));
                }
            });

            ws.on('close', () => {
                console.log('WebSocket client disconnected');
            });

            ws.on('error', (error) => {
                console.error('WebSocket error:', error);
            });

            // Send welcome message
            ws.send(JSON.stringify({ 
                type: 'connected', 
                message: 'Connected to Instagram Reels media bridge' 
            }));
        });
    }

    private handleWebSocketMessage(ws: WebSocket, data: any): void {
        switch (data.type) {
            case 'ping':
                ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
                break;
            
            case 'requestMedia':
                // Handle media requests from webview
                this.emit('mediaRequest', data.payload);
                break;
            
            case 'controlCommand':
                // Handle control commands from webview
                this.emit('controlCommand', data.payload);
                break;
            
            default:
                console.log('Unknown WebSocket message type:', data.type);
        }
    }

    public async start(): Promise<void> {
        return new Promise((resolve, reject) => {
            if (this.isRunning) {
                resolve();
                return;
            }

            this.server.listen(this.config.port, () => {
                this.isRunning = true;
                console.log(`Media bridge server running on port ${this.config.port}`);
                this.emit('started');
                resolve();
            });

            this.server.on('error', (error) => {
                console.error('Server error:', error);
                this.emit('error', error);
                reject(error);
            });
        });
    }

    public async stop(): Promise<void> {
        return new Promise((resolve) => {
            if (!this.isRunning) {
                resolve();
                return;
            }

            this.wss.close(() => {
                this.server.close(() => {
                    this.isRunning = false;
                    console.log('Media bridge server stopped');
                    this.emit('stopped');
                    resolve();
                });
            });
        });
    }

    public getServerUrl(): string {
        return `http://localhost:${this.config.port}`;
    }

    public isServerRunning(): boolean {
        return this.isRunning;
    }

    public broadcast(message: any): void {
        const messageStr = JSON.stringify(message);
        this.wss.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(messageStr);
            }
        });
    }

    public updateCurrentReel(reelId: string): void {
        this.currentReelId = reelId;
        console.log(`Updated current reel to: ${reelId}`);
    }

    public getCurrentReelId(): string {
        return this.currentReelId;
    }
} 