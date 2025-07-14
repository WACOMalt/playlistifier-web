const fs = require('fs').promises;
const path = require('path');
const { spawn } = require('child_process');
const fetch = require('node-fetch');
const youtubeService = require('./youtube');
const setupManager = require('../utils/setup');

class DownloadService {
    constructor() {
        this.downloads = new Map();
        this.defaultDownloadPath = process.env.DOWNLOAD_PATH || './downloads';
    }

    async createDownload(tracks, options = {}) {
        const downloadId = `dl-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        
        const download = {
            id: downloadId,
            tracks: tracks,
            options: {
                format: 'mp3',
                quality: 'best',
                includeTrackNumbers: false,
                ...options
            },
            status: 'pending',
            progress: 0,
            results: [],
            startTime: new Date(),
            totalTracks: tracks.length,
            completedTracks: 0,
            failedTracks: 0,
            currentTrack: null,
            downloadPath: null
        };

        this.downloads.set(downloadId, download);
        return downloadId;
    }

    async startDownload(downloadId, socketIo) {
        const download = this.downloads.get(downloadId);
        if (!download) {
            throw new Error('Download not found');
        }

        console.log(`Starting download ${downloadId} with ${download.totalTracks} tracks`);
        
        download.status = 'downloading';
        
        try {
            download.downloadPath = await this.createDownloadDirectory(download);
            console.log(`Download directory created: ${download.downloadPath}`);
            
            await this.processDownload(download, socketIo);
            download.status = 'completed';
            download.progress = 100;
            
            console.log(`Download ${downloadId} completed successfully`);
            
            // Emit completion event
            socketIo.to(`download-${downloadId}`).emit('batch-complete', {
                downloadId,
                total: download.totalTracks,
                successful: download.completedTracks,
                failed: download.failedTracks,
                downloadPath: download.downloadPath
            });

        } catch (error) {
            download.status = 'failed';
            download.error = error.message;
            console.error(`Download ${downloadId} failed:`, error);
            
            socketIo.to(`download-${downloadId}`).emit('download-error', {
                downloadId,
                error: error.message
            });
        }
    }

    async processDownload(download, socketIo) {
        const { tracks, options } = download;
        
        for (let i = 0; i < tracks.length; i++) {
            const track = tracks[i];
            download.currentTrack = track;
            
            try {
                await this.downloadTrack(track, download, socketIo, i);
                download.completedTracks++;
                download.results.push({
                    trackId: i,
                    track: track,
                    status: 'completed',
                    filename: this.generateFilename(track, i, download.options)
                });
                
                socketIo.to(`download-${download.id}`).emit('download-complete', {
                    downloadId: download.id,
                    trackId: i,
                    track: track
                });
                
            } catch (error) {
                download.failedTracks++;
                download.results.push({
                    trackId: i,
                    track: track,
                    status: 'failed',
                    error: error.message
                });
                
                socketIo.to(`download-${download.id}`).emit('download-error', {
                    downloadId: download.id,
                    trackId: i,
                    track: track,
                    error: error.message
                });
            }
            
            // Update overall progress
            download.progress = Math.round(((i + 1) / tracks.length) * 100);
            
            socketIo.to(`download-${download.id}`).emit('progress-update', {
                downloadId: download.id,
                progress: download.progress,
                status: `Downloaded ${i + 1} of ${tracks.length} tracks`
            });
        }
    }

    async downloadTrack(track, download, socketIo, trackIndex) {
        const { downloadPath, options } = download;
        
        console.log(`Downloading track ${trackIndex + 1}/${download.totalTracks}: ${track.artist} - ${track.title}`);
        
        // For YouTube tracks, use direct URL
        if (track.url) {
            console.log(`Using direct URL: ${track.url}`);
            await this.downloadFromYouTube(track, downloadPath, (progress) => {
                socketIo.to(`download-${download.id}`).emit('progress-update', {
                    downloadId: download.id,
                    progress: Math.round(((trackIndex + progress / 100) / download.totalTracks) * 100),
                    status: `Downloading: ${track.title}`
                });
            });
        } else {
            // For Spotify tracks, search and download from YouTube
            console.log(`Searching and downloading from YouTube`);
            await this.downloadFromSearch(track, downloadPath, socketIo, download.id, trackIndex, download.options);
        }
        
        // Add metadata to the downloaded file
        console.log(`Adding metadata to: ${track.title}`);
        await this.addMetadata(track, downloadPath, trackIndex, download.options);
        
        console.log(`Successfully downloaded: ${track.title}`);
    }

    async downloadFromYouTube(track, outputPath, onProgress) {
        return await youtubeService.download(track.url, outputPath, onProgress);
    }

    async downloadFromSearch(track, outputPath, socketIo, downloadId, trackIndex = null, options = {}) {
        // Search for the track on YouTube
        const searchQuery = `${track.artist} ${track.title}`;
        
        try {
            // Ensure setup is complete
            await setupManager.setup();
            
            // Use yt-dlp to search and download
            const args = [
                '--extract-audio',
                '--audio-format', 'mp3',
                '--audio-quality', '0',
                '--output', path.join(outputPath, this.generateFilename(track, trackIndex, options)),
                '--no-warnings',
                `ytsearch:${searchQuery}`
            ];

            await this.runCommand('yt-dlp', args);
            
        } catch (error) {
            throw new Error(`Failed to download ${track.title}: ${error.message}`);
        }
    }

    async addMetadata(track, outputPath, trackIndex = null, options = {}) {
        const filename = this.generateFilename(track, trackIndex, options);
        const filepath = path.join(outputPath, filename);
        
        // Check if file exists
        try {
            await fs.access(filepath);
        } catch {
            return; // File doesn't exist, skip metadata
        }

        // Download and embed album art
        const imageUrl = track.images && track.images.length > 0 ? track.images[0].url : null;
        let imagePath = null;
        if (imageUrl) {
            const imageFileName = `album_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.jpg`;
            imagePath = path.join(outputPath, imageFileName);
            
            try {
                const imageResponse = await fetch(imageUrl);
                const buffer = await imageResponse.buffer();
                await fs.writeFile(imagePath, buffer);
            } catch (error) {
                console.warn(`Failed to download album art for ${track.title}:`, error.message);
                imagePath = null;
            }
        }

        const tempFile = filepath.replace('.mp3', '_temp.mp3');
        let args;
        
        if (imagePath) {
            args = [
                '-i', filepath,
                '-i', imagePath,
                '-map', '0',
                '-map', '1',
                '-c', 'copy',
                '-disposition:v', 'attached_pic',
                '-metadata', `title=${track.title}`,
                '-metadata', `artist=${track.artist}`,
                '-metadata', `album=${track.album || 'Unknown Album'}`,
                tempFile
            ];
        } else {
            args = [
                '-i', filepath,
                '-metadata', `title=${track.title}`,
                '-metadata', `artist=${track.artist}`,
                '-metadata', `album=${track.album || 'Unknown Album'}`,
                '-codec', 'copy',
                tempFile
            ];
        }

        try {
            await this.runCommand('ffmpeg', args);
            
            // Replace original file with metadata-enriched version
            await fs.rename(tempFile, filepath);
            
        } catch (error) {
            console.warn(`Failed to add metadata to ${filename}:`, error.message);
            
            // Clean up temp file if it exists
            try {
                await fs.unlink(tempFile);
            } catch {}
        }
        
        // Clean up album art file if it exists
        if (imagePath) {
            try {
                await fs.unlink(imagePath);
            } catch {}
        }
    }

    generateFilename(track, trackIndex = null, options = {}) {
        // Sanitize filename
        const sanitize = (str) => {
            return str.replace(/[<>:"/\\|?*]/g, '_').replace(/\s+/g, ' ').trim();
        };
        
        const artist = sanitize(track.artist || 'Unknown Artist');
        const title = sanitize(track.title || 'Unknown Title');
        
        // Add track number if requested
        if (options.includeTrackNumbers && trackIndex !== null) {
            const trackNumber = String(trackIndex + 1).padStart(2, '0');
            return `${trackNumber}. ${artist} - ${title}.mp3`;
        }
        
        return `${artist} - ${title}.mp3`;
    }

    async createDownloadDirectory(download) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const dirName = `download-${timestamp}`;
        const fullPath = path.join(this.defaultDownloadPath, dirName);
        
        try {
            await fs.mkdir(fullPath, { recursive: true });
            
            // Create a track listing file
            const trackListPath = path.join(fullPath, 'track_listing.txt');
            const trackList = download.tracks.map((track, index) => {
                return `${index + 1}. ${track.artist} - ${track.title}`;
            }).join('\n');
            
            await fs.writeFile(trackListPath, trackList, 'utf8');
            
            return fullPath;
            
        } catch (error) {
            throw new Error(`Failed to create download directory: ${error.message}`);
        }
    }

    async runCommand(command, args) {
        // Ensure setup is complete
        await setupManager.setup();
        
        // Use setup manager paths for tools
        if (command === 'ffmpeg') {
            command = setupManager.getFFmpegPath();
        } else if (command === 'yt-dlp') {
            command = setupManager.getYtDlpPath();
        }
        
        console.log(`Running command: ${command} ${args.join(' ')}`);
        
        return new Promise((resolve, reject) => {
            const process = spawn(command, args);
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
                    console.error(`Command failed with code ${code}:`);
                    console.error('stdout:', stdout);
                    console.error('stderr:', stderr);
                    reject(new Error(`Command failed with code ${code}: ${stderr}`));
                }
            });

            process.on('error', (error) => {
                console.error(`Failed to run command: ${error.message}`);
                reject(new Error(`Failed to run command: ${error.message}`));
            });
        });
    }

    getDownloadStatus(downloadId) {
        const download = this.downloads.get(downloadId);
        if (!download) {
            return null;
        }

        return {
            id: download.id,
            status: download.status,
            progress: download.progress,
            totalTracks: download.totalTracks,
            completedTracks: download.completedTracks,
            failedTracks: download.failedTracks,
            currentTrack: download.currentTrack,
            results: download.results,
            downloadPath: download.downloadPath,
            startTime: download.startTime,
            error: download.error
        };
    }

    cancelDownload(downloadId) {
        const download = this.downloads.get(downloadId);
        if (download) {
            download.status = 'cancelled';
            this.downloads.delete(downloadId);
            return true;
        }
        return false;
    }

    cleanupOldDownloads() {
        const now = Date.now();
        const maxAge = 24 * 60 * 60 * 1000; // 24 hours

        for (const [id, download] of this.downloads.entries()) {
            if (now - download.startTime.getTime() > maxAge) {
                this.downloads.delete(id);
            }
        }
    }
}

module.exports = new DownloadService();
