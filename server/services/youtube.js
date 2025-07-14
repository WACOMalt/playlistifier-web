const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const setupManager = require('../utils/setup');

class YouTubeService {
    constructor() {
        this.ytDlpPath = null;
        this.initialized = false;
    }

    async initialize() {
        if (this.initialized) return;
        
        try {
            // Setup tools if needed
            await setupManager.setup();
            
            // Get the path to yt-dlp
            this.ytDlpPath = setupManager.getYtDlpPath();
            
            this.initialized = true;
        } catch (error) {
            console.error('YouTube service initialization failed:', error);
            throw error;
        }
    }

    async runYtDlp(args) {
        return new Promise((resolve, reject) => {
            const process = spawn(this.ytDlpPath, args);
            let stdout = '';
            let stderr = '';

            process.stdout.on('data', (data) => {
                stdout += data.toString();
            });

            process.stderr.on('data', (data) => {
                stderr += data.toString();
            });

            process.on('close', (code) => {
                if (code === 0) {
                    resolve(stdout);
                } else {
                    reject(new Error(`yt-dlp failed with code ${code}: ${stderr}`));
                }
            });

            process.on('error', (error) => {
                reject(new Error(`Failed to run yt-dlp: ${error.message}`));
            });
        });
    }

    async runYtDlpWithOutput(args) {
        return new Promise((resolve, reject) => {
            const process = spawn(this.ytDlpPath, args);
            let stdout = '';
            let stderr = '';

            process.stdout.on('data', (data) => {
                stdout += data.toString();
            });

            process.stderr.on('data', (data) => {
                stderr += data.toString();
            });

            process.on('close', (code) => {
                resolve({ stdout, stderr, code });
            });

            process.on('error', (error) => {
                reject(new Error(`Failed to run yt-dlp: ${error.message}`));
            });
        });
    }

    async extractInfo(url) {
        await this.initialize();
        
        try {
            const args = [
                '--dump-json',
                '--flat-playlist',
                '--no-warnings',
                url
            ];

            const output = await this.runYtDlp(args);
            const lines = output.trim().split('\n');
            const entries = [];

            for (const line of lines) {
                if (line.trim()) {
                    try {
                        const entry = JSON.parse(line);
                        entries.push(entry);
                    } catch (error) {
                        console.warn('Failed to parse JSON line:', line);
                    }
                }
            }

            return entries;
        } catch (error) {
            throw new Error(`Failed to extract info: ${error.message}`);
        }
    }

    async getVideoInfo(url) {
        await this.initialize();
        
        try {
            const args = [
                '--dump-json',
                '--no-playlist',
                '--no-warnings',
                url
            ];

            const output = await this.runYtDlp(args);
            const info = JSON.parse(output.trim());
            
            return {
                id: info.id,
                title: info.title,
                uploader: info.uploader,
                duration: info.duration,
                description: info.description,
                view_count: info.view_count,
                upload_date: info.upload_date,
                thumbnail: info.thumbnail,
                tracks: [this.formatTrack(info)],
                total: 1
            };
        } catch (error) {
            throw new Error(`Failed to get video info: ${error.message}`);
        }
    }

    async getPlaylistInfo(url) {
        try {
            const entries = await this.extractInfo(url);
            
            if (entries.length === 0) {
                throw new Error('No entries found in playlist');
            }

            const playlistInfo = entries[0];
            const tracks = entries.filter(entry => entry._type === 'video')
                                 .map(entry => this.formatTrack(entry));

            return {
                id: playlistInfo.id,
                title: playlistInfo.title || 'YouTube Playlist',
                uploader: playlistInfo.uploader,
                description: playlistInfo.description,
                tracks: tracks,
                total: tracks.length
            };
        } catch (error) {
            throw new Error(`Failed to get playlist info: ${error.message}`);
        }
    }

    async getChannelInfo(url) {
        try {
            const entries = await this.extractInfo(url);
            
            const videos = entries.filter(entry => entry._type === 'video')
                                 .slice(0, 50) // Limit to first 50 videos
                                 .map(entry => this.formatTrack(entry));

            const channelInfo = entries[0];

            return {
                id: channelInfo.channel_id || channelInfo.id,
                title: `${channelInfo.uploader} - Latest Videos`,
                uploader: channelInfo.uploader,
                description: channelInfo.description,
                tracks: videos,
                total: videos.length
            };
        } catch (error) {
            throw new Error(`Failed to get channel info: ${error.message}`);
        }
    }

    formatTrack(entry) {
        return {
            id: entry.id,
            title: entry.title,
            artist: entry.uploader || 'Unknown Channel',
            album: 'YouTube',
            duration: this.formatDuration(entry.duration),
            duration_ms: (entry.duration || 0) * 1000,
            url: entry.url || entry.webpage_url,
            thumbnail: entry.thumbnail,
            view_count: entry.view_count,
            upload_date: entry.upload_date,
            description: entry.description,
            search_query: `${entry.title} ${entry.uploader}`.trim()
        };
    }

    formatDuration(seconds) {
        if (!seconds) return 'Unknown';
        
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    extractIdFromUrl(url) {
        // YouTube URL patterns
        const patterns = [
            {
                regex: /(?:youtube\.com\/playlist\?list=|youtu\.be\/playlist\?list=)([a-zA-Z0-9_-]+)/,
                type: 'playlist'
            },
            {
                regex: /(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)/,
                type: 'video'
            },
            {
                regex: /youtube\.com\/channel\/([a-zA-Z0-9_-]+)/,
                type: 'channel'
            },
            {
                regex: /youtube\.com\/@([a-zA-Z0-9_-]+)/,
                type: 'channel'
            }
        ];

        for (const pattern of patterns) {
            const match = url.match(pattern.regex);
            if (match) {
                return {
                    type: pattern.type,
                    id: match[1]
                };
            }
        }

        return null;
    }

    async extractContent(url) {
        const extracted = this.extractIdFromUrl(url);
        
        if (!extracted) {
            throw new Error('Invalid YouTube URL format');
        }

        switch (extracted.type) {
            case 'playlist':
                return await this.getPlaylistInfo(url);
            case 'video':
                return await this.getVideoInfo(url);
            case 'channel':
                return await this.getChannelInfo(url);
            default:
                throw new Error('Unsupported YouTube content type');
        }
    }

    async download(url, outputPath, onProgress) {
        await this.initialize();
        
        return new Promise((resolve, reject) => {
            const args = [
                '--extract-audio',
                '--audio-format', 'mp3',
                '--audio-quality', '0',
                '--output', path.join(outputPath, '%(title)s.%(ext)s'),
                '--no-warnings',
                url
            ];

            const process = spawn(this.ytDlpPath, args);
            let stdout = '';
            let stderr = '';

            process.stdout.on('data', (data) => {
                const output = data.toString();
                stdout += output;
                
                // Parse progress if callback provided
                if (onProgress) {
                    const progressMatch = output.match(/\[download\]\s+(\d+(?:\.\d+)?)%/);
                    if (progressMatch) {
                        onProgress(parseFloat(progressMatch[1]));
                    }
                }
            });

            process.stderr.on('data', (data) => {
                stderr += data.toString();
            });

            process.on('close', (code) => {
                if (code === 0) {
                    resolve(stdout);
                } else {
                    reject(new Error(`Download failed with code ${code}: ${stderr}`));
                }
            });

            process.on('error', (error) => {
                reject(new Error(`Failed to run download: ${error.message}`));
            });
        });
    }

    async searchTrack(query) {
        await this.initialize();
        
        try {
            const args = [
                '--dump-json',
                '--no-warnings',
                '--quiet',
                `ytsearch1:${query}`
            ];

            const result = await this.runYtDlpWithOutput(args);
            
            // Even if there are errors, we might still have useful output
            // Let's try to parse the stdout first
            if (result.stdout) {
                const lines = result.stdout.trim().split('\n');
                
                // Find the line with the actual video information
                for (const line of lines) {
                    if (line.trim()) {
                        try {
                            const info = JSON.parse(line);
                            // Check if this is a video entry (not just metadata)
                            if (info && info.id && info.webpage_url) {
                                return {
                                    url: info.webpage_url,
                                    title: info.title,
                                    uploader: info.uploader,
                                    duration: info.duration
                                };
                            }
                        } catch (parseError) {
                            // Skip lines that aren't valid JSON
                            continue;
                        }
                    }
                }
            }
            
            // If we reach here, no valid video info was found
            console.error('YouTube search failed for query:', query);
            if (result.stderr) {
                console.error('stderr:', result.stderr);
            }
            return null;
        } catch (error) {
            console.error('YouTube search error:', error);
            return null;
        }
    }

    async checkAvailability() {
        try {
            await this.initialize();
            await this.runYtDlp(['--version']);
            return true;
        } catch (error) {
            return false;
        }
    }
}

module.exports = new YouTubeService();
