import * as express from 'express';
import * as http from 'http';
import * as WebSocket from 'ws';
import { EventEmitter } from 'events';

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

    constructor(config: MediaBridgeConfig) {
        super();
        this.config = config;
        this.app = express();
        this.server = http.createServer(this.app);
        this.wss = new WebSocket.Server({ server: this.server });
        
        this.setupRoutes();
        this.setupWebSocket();
    }

    private setupRoutes(): void {
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

        // Health check endpoint
        this.app.get('/health', (req, res) => {
            res.json({ status: 'ok', timestamp: new Date().toISOString() });
        });

        // Media proxy endpoint
        this.app.get('/proxy/media/:type/:id', async (req, res) => {
            try {
                const { type, id } = req.params;
                const url = req.query.url as string;
                
                if (!url) {
                    return res.status(400).json({ error: 'URL parameter required' });
                }

                // This is a placeholder for media proxying
                // In a real implementation, you would fetch the media from Instagram
                // and stream it through this endpoint to bypass CORS issues
                
                console.log(`Media proxy request: ${type}/${id} - ${url}`);
                
                // For now, just redirect to the original URL
                res.redirect(url);
            } catch (error) {
                console.error('Media proxy error:', error);
                res.status(500).json({ error: 'Failed to proxy media' });
            }
        });

        // Error handling middleware
        this.app.use((error: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
            console.error('Express error:', error);
            res.status(500).json({ error: 'Internal server error' });
        });
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
} 