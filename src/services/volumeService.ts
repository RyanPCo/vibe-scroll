import * as loudness from 'loudness';

export interface VolumeChangeEvent {
    volume: number;
    muted: boolean;
}

export class VolumeService {
    private lastKnownVolume: number = 75;
    private lastKnownMuted: boolean = false;

    constructor() {
        this.initialize();
    }

    private async initialize(): Promise<void> {
        try {
            // Get initial volume state
            this.lastKnownVolume = await this.getSystemVolume();
            this.lastKnownMuted = await this.getSystemMuted();
            console.log('VolumeService initialized:', { 
                volume: this.lastKnownVolume, 
                muted: this.lastKnownMuted 
            });
        } catch (error) {
            console.warn('VolumeService initialization failed:', error);
            // Use default values if system volume is unavailable
        }
    }

    public async getSystemVolume(): Promise<number> {
        try {
            const volume = await loudness.getVolume();
            this.lastKnownVolume = volume;
            return volume;
        } catch (error) {
            console.error('Failed to get system volume:', error);
            return this.lastKnownVolume;
        }
    }

    public async setSystemVolume(volume: number): Promise<boolean> {
        try {
            // Clamp volume between 0 and 100
            const clampedVolume = Math.max(0, Math.min(100, Math.round(volume)));
            
            await loudness.setVolume(clampedVolume);
            this.lastKnownVolume = clampedVolume;
            
            console.log(`System volume set to: ${clampedVolume}%`);
            return true;
        } catch (error) {
            console.error('Failed to set system volume:', error);
            return false;
        }
    }

    public async getSystemMuted(): Promise<boolean> {
        try {
            const muted = await loudness.getMuted();
            this.lastKnownMuted = muted;
            return muted;
        } catch (error) {
            console.error('Failed to get system mute state:', error);
            return this.lastKnownMuted;
        }
    }

    public async setSystemMuted(muted: boolean): Promise<boolean> {
        try {
            await loudness.setMuted(muted);
            this.lastKnownMuted = muted;
            
            console.log(`System mute set to: ${muted}`);
            return true;
        } catch (error) {
            console.error('Failed to set system mute state:', error);
            return false;
        }
    }

    public async toggleMute(): Promise<boolean> {
        try {
            const currentMuted = await this.getSystemMuted();
            return await this.setSystemMuted(!currentMuted);
        } catch (error) {
            console.error('Failed to toggle mute:', error);
            return false;
        }
    }

    public async adjustVolume(delta: number): Promise<number> {
        try {
            const currentVolume = await this.getSystemVolume();
            const newVolume = Math.max(0, Math.min(100, currentVolume + delta));
            
            if (await this.setSystemVolume(newVolume)) {
                return newVolume;
            }
            return currentVolume;
        } catch (error) {
            console.error('Failed to adjust volume:', error);
            return this.lastKnownVolume;
        }
    }

    public async setVolumeLevel(volume: number): Promise<boolean> {
        return await this.setSystemVolume(volume);
    }

    public getLastKnownState(): VolumeChangeEvent {
        return {
            volume: this.lastKnownVolume,
            muted: this.lastKnownMuted
        };
    }

    public isSupported(): boolean {
        try {
            // Test if loudness is available on this platform
            return typeof loudness.getVolume === 'function';
        } catch (error) {
            return false;
        }
    }

    public getPlatformInfo(): string {
        const platform = process.platform;
        switch (platform) {
            case 'win32':
                return 'Windows (System Volume)';
            case 'darwin':
                return 'macOS (System Volume)';
            case 'linux':
                return 'Linux (ALSA)';
            default:
                return `${platform} (Unknown)`;
        }
    }
} 