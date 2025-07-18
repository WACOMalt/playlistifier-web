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
            // Get the path to yt-dlp (setup is done at app startup)
            this.ytDlpPath = setupManager.getYtDlpPath();
            
            this.initialized = true;
        } catch (error) {
            console.error('YouTube service initialization failed:', error);
            throw error;
        }
    }

    async runYtDlp(args) {
        return new Promise((resolve, reject) => {
            const process = spawn(this.ytDlpPath, args, {
                stdio: ['pipe', 'pipe', 'pipe'],
                shell: false
            });
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
            
            // Close stdin to prevent process from waiting for input
            process.stdin.end();
        });
    }

    async runYtDlpWithOutput(args, timeoutMs = 60000) {
        return new Promise((resolve, reject) => {
            const process = spawn(this.ytDlpPath, args, {
                stdio: ['pipe', 'pipe', 'pipe'],
                shell: false
            });
            let stdout = '';
            let stderr = '';
            let isComplete = false;

            // Set up timeout
            const timeout = setTimeout(() => {
                if (!isComplete) {
                    isComplete = true;
                    console.log('yt-dlp process timed out, killing process');
                    process.kill('SIGTERM');
                    // Try force kill after 2 seconds if still not dead
                    setTimeout(() => {
                        try {
                            process.kill('SIGKILL');
                        } catch (e) {
                            // Process already dead
                        }
                    }, 2000);
                    reject(new Error(`yt-dlp process timed out after ${timeoutMs}ms`));
                }
            }, timeoutMs);

            process.stdout.on('data', (data) => {
                stdout += data.toString();
            });

            process.stderr.on('data', (data) => {
                stderr += data.toString();
            });

            process.on('close', (code) => {
                if (!isComplete) {
                    isComplete = true;
                    clearTimeout(timeout);
                    resolve({ stdout, stderr, code });
                }
            });

            process.on('error', (error) => {
                if (!isComplete) {
                    isComplete = true;
                    clearTimeout(timeout);
                    reject(new Error(`Failed to run yt-dlp: ${error.message}`));
                }
            });
            
            // Close stdin to prevent process from waiting for input
            process.stdin.end();
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
            // Filter entries that are actual video entries (either 'video' or 'url' type)
            const tracks = entries.filter(entry => 
                entry._type === 'video' || 
                (entry._type === 'url' && entry.id && entry.title)
            ).map(entry => this.formatTrack(entry));

            return {
                id: playlistInfo.playlist_id || playlistInfo.id,
                title: playlistInfo.playlist_title || playlistInfo.title || 'YouTube Playlist',
                uploader: playlistInfo.playlist_uploader || playlistInfo.uploader,
                description: playlistInfo.description,
                tracks: tracks,
                total: tracks.length,
                platform: 'youtube',
                name: playlistInfo.playlist_title || playlistInfo.title || 'YouTube Playlist'
            };
        } catch (error) {
            throw new Error(`Failed to get playlist info: ${error.message}`);
        }
    }

    async getChannelInfo(url) {
        try {
            const entries = await this.extractInfo(url);
            
            const videos = entries.filter(entry => 
                entry._type === 'video' || 
                (entry._type === 'url' && entry.id && entry.title)
            ).slice(0, 50) // Limit to first 50 videos
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
        // Generate thumbnail URL from video ID if not provided
        let thumbnailUrl = entry.thumbnail;
        if (!thumbnailUrl && entry.id) {
            // Use high-quality YouTube thumbnail URL
            thumbnailUrl = `https://i.ytimg.com/vi/${entry.id}/maxresdefault.jpg`;
        }
        
        return {
            id: entry.id,
            title: entry.title,
            artist: entry.uploader || 'Unknown Channel',
            album: 'YouTube',
            duration: this.formatDuration(entry.duration),
            duration_ms: (entry.duration || 0) * 1000,
            url: entry.url || entry.webpage_url || `https://www.youtube.com/watch?v=${entry.id}`,
            thumbnail: thumbnailUrl,
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
        // Check for playlist first - any URL with list= parameter
        const listMatch = url.match(/[?&]list=([a-zA-Z0-9_-]+)/);
        if (listMatch) {
            return {
                type: 'playlist',
                id: listMatch[1]
            };
        }
        
        // Check for individual video
        const videoMatch = url.match(/[?&]v=([a-zA-Z0-9_-]+)/);
        if (videoMatch) {
            return {
                type: 'video',
                id: videoMatch[1]
            };
        }
        
        // Check for youtu.be short URLs
        const youtubeMatch = url.match(/youtu\.be\/([a-zA-Z0-9_-]+)/);
        if (youtubeMatch) {
            return {
                type: 'video',
                id: youtubeMatch[1]
            };
        }
        
        // Check for channel URLs
        const channelMatch = url.match(/youtube\.com\/channel\/([a-zA-Z0-9_-]+)/);
        if (channelMatch) {
            return {
                type: 'channel',
                id: channelMatch[1]
            };
        }
        
        // Check for @ channel URLs
        const atChannelMatch = url.match(/youtube\.com\/@([a-zA-Z0-9_-]+)/);
        if (atChannelMatch) {
            return {
                type: 'channel',
                id: atChannelMatch[1]
            };
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

    async searchTrack(query, expectedDurationMs = null) {
        await this.initialize();
        
        try {
            const args = [
                '--dump-json',
                '--flat-playlist',
                '--no-warnings',
                '--quiet',
                `ytsearch10:${query}`  // Search for 10 videos
            ];

            const result = await this.runYtDlpWithOutput(args, 30000); // 30 second timeout
            
            // Even if there are errors, we might still have useful output
            if (result.stdout) {
                const lines = result.stdout.trim().split('\n');
                const videos = [];
                
                // Parse all video results
                for (const line of lines) {
                    if (line.trim()) {
                        try {
                            const info = JSON.parse(line);
                            // Check if this is a video entry (not just metadata) and has a valid duration
                            if (info && info.id && info.webpage_url && typeof info.duration === 'number' && !isNaN(info.duration)) {
                                // Generate thumbnail URL from video ID if not provided
                                let thumbnailUrl = info.thumbnail;
                                if (!thumbnailUrl && info.id) {
                                    // Use high-quality YouTube thumbnail URL
                                    thumbnailUrl = `https://i.ytimg.com/vi/${info.id}/maxresdefault.jpg`;
                                }
                                
                                videos.push({
                                    url: info.webpage_url,
                                    title: info.title,
                                    uploader: info.uploader,
                                    duration: info.duration,
                                    view_count: info.view_count || 0,
                                    thumbnail: thumbnailUrl,
                                    id: info.id
                                });
                            }
                        } catch (parseError) {
                            // Skip lines that aren't valid JSON
                            continue;
                        }
                    }
                }
                
                if (videos.length === 0) {
                    console.error('No videos found for query:', query);
                    return null;
                }
                
                // If we have an expected duration, use enhanced scoring
                if (expectedDurationMs) {
                    return this.selectBestMatch(videos, expectedDurationMs);
                }
                
                // Otherwise, return the first (highest ranked) result
                return videos[0];
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
    
    selectBestMatch(videos, expectedDurationMs) {
        const expectedDurationSec = expectedDurationMs / 1000;
        
        // Calculate length differences for normalization
        const lengthDifferences = videos.map(video => {
            const videoDuration = video.duration || 0;
            return Math.abs(videoDuration - expectedDurationSec);
        });
        
        const maxLengthDiff = Math.max(...lengthDifferences);
        
        // Score each video
        const scoredVideos = videos.map((video, index) => {
            const lengthDiff = lengthDifferences[index];
            
            // Length match score (normalized 0-10, lower is better)
            const lengthScore = maxLengthDiff > 0 ? (lengthDiff / maxLengthDiff) * 10 : 0;
            
            // YouTube ranking score (0-9 based on position, lower is better)
            const rankingScore = index;
            
            // Total score (lower is better)
            const totalScore = lengthScore + rankingScore;
            
            return {
                ...video,
                lengthScore,
                rankingScore,
                totalScore,
                lengthDiff: lengthDiff,
                expectedDuration: expectedDurationSec
            };
        });
        
        // Sort by total score (ascending - lower is better)
        scoredVideos.sort((a, b) => a.totalScore - b.totalScore);
        
        const bestMatch = scoredVideos[0];
        
        console.log(`Best match for expected duration ${expectedDurationSec}s: "${bestMatch.title}" (actual: ${bestMatch.duration}s, diff: ${bestMatch.lengthDiff}s, score: ${bestMatch.totalScore.toFixed(2)})`);
        
        return bestMatch;
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
