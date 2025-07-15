const fs = require('fs').promises;
const path = require('path');
const { spawn } = require('child_process');
const fetch = require('node-fetch');
const youtubeService = require('./youtube');
const setupManager = require('../utils/setup');

class DownloadService {
    constructor() {
        this.downloads = new Map();
        this.sessionFiles = new Map(); // Track files by session ID
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
                const filename = this.generateFilename(track, i, download.options);
                download.results.push({
                    trackId: i,
                    track: track,
                    status: 'completed',
                    filename: filename
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
        console.log(`downloadFromSearch: ENTRY - Starting download for ${track.artist} - ${track.title}`);
        
        // Search for the track on YouTube
        const searchQuery = `${track.artist} ${track.title}`;
        
        try {
            // Generate the expected filename using Spotify metadata
            const expectedFilename = this.generateFilename(track, trackIndex, options);
            const outputTemplate = path.join(outputPath, expectedFilename);
            
            console.log(`downloadFromSearch: Searching for ${searchQuery}`);
            console.log(`downloadFromSearch: Expected filename: ${expectedFilename}`);
            console.log(`downloadFromSearch: Output template: ${outputTemplate}`);
            console.log(`downloadFromSearch: Output path: ${outputPath}`);
            
            // Use yt-dlp to search and download with a temporary filename first
            const tempFilename = `temp_${Date.now()}.%(ext)s`;
            const tempOutputTemplate = path.join(outputPath, tempFilename);
            
            // If the track already has a URL, use it directly; otherwise, search
            const downloadTarget = track.url || `ytsearch1:${searchQuery}`;
            
            const args = [
                '--extract-audio',
                '--audio-format', 'mp3',
                '--audio-quality', '0',
                '--output', tempOutputTemplate,
                '--no-warnings',
                '--no-playlist',
                downloadTarget
            ];

            console.log(`downloadFromSearch: About to run yt-dlp with args:`, args);
            console.log(`downloadFromSearch: Downloading ${downloadTarget} to temporary file`);
            
            try {
                await this.runCommand('yt-dlp', args);
                console.log(`downloadFromSearch: yt-dlp command completed successfully`);
            } catch (ytdlpError) {
                console.error(`downloadFromSearch: yt-dlp command failed:`, ytdlpError);
                throw ytdlpError;
            }
            
            // Find the downloaded temporary file
            console.log(`downloadFromSearch: Reading directory ${outputPath}`);
            const files = await fs.readdir(outputPath);
            console.log(`downloadFromSearch: Files in directory after download:`, files);
            const tempFile = files.find(f => f.startsWith('temp_') && f.endsWith('.mp3'));
            
            if (tempFile) {
                const tempFilePath = path.join(outputPath, tempFile);
                console.log(`downloadFromSearch: Found temp file: ${tempFile}`);
                console.log(`downloadFromSearch: Temp file path: ${tempFilePath}`);
                console.log(`downloadFromSearch: Target path: ${outputTemplate}`);
                
                // Rename to the expected filename with Spotify metadata
                await fs.rename(tempFilePath, outputTemplate);
                console.log(`downloadFromSearch: Successfully renamed temp file to: ${expectedFilename}`);
            } else {
                console.error(`downloadFromSearch: No temp file found in:`, files);
                throw new Error('Downloaded file not found');
            }
            
        } catch (error) {
            console.error(`downloadFromSearch: Error downloading ${track.title}:`, error);
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
            
            // Add release year if available
            if (track.release_year) {
                args.splice(-1, 0, '-metadata', `date=${track.release_year}`);
            }
        } else {
            args = [
                '-i', filepath,
                '-metadata', `title=${track.title}`,
                '-metadata', `artist=${track.artist}`,
                '-metadata', `album=${track.album || 'Unknown Album'}`,
                '-codec', 'copy',
                tempFile
            ];
            
            // Add release year if available
            if (track.release_year) {
                args.splice(-1, 0, '-metadata', `date=${track.release_year}`);
            }
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
    
    async addMetadataToFile(track, filePath, trackIndex = null, options = {}) {
        // Check if file exists
        try {
            await fs.access(filePath);
        } catch {
            console.warn(`File not found for metadata processing: ${filePath}`);
            return; // File doesn't exist, skip metadata
        }
        
        console.log(`Adding metadata to file: ${filePath}`);
        
        // Get directory for temporary files
        const outputDir = path.dirname(filePath);
        
        // Download and embed album art
        const imageUrl = track.images && track.images.length > 0 ? track.images[0].url : null;
        let imagePath = null;
        if (imageUrl) {
            const imageFileName = `album_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.jpg`;
            imagePath = path.join(outputDir, imageFileName);
            
            try {
                const imageResponse = await fetch(imageUrl);
                const buffer = await imageResponse.buffer();
                await fs.writeFile(imagePath, buffer);
            } catch (error) {
                console.warn(`Failed to download album art for ${track.title}:`, error.message);
                imagePath = null;
            }
        }
        
        const tempFile = filePath.replace('.mp3', '_temp.mp3');
        let args;
        
        if (imagePath) {
            args = [
                '-i', filePath,
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
            
            // Add release year if available
            if (track.release_year) {
                args.splice(-1, 0, '-metadata', `date=${track.release_year}`);
            }
        } else {
            args = [
                '-i', filePath,
                '-metadata', `title=${track.title}`,
                '-metadata', `artist=${track.artist}`,
                '-metadata', `album=${track.album || 'Unknown Album'}`,
                '-codec', 'copy',
                tempFile
            ];
            
            // Add release year if available
            if (track.release_year) {
                args.splice(-1, 0, '-metadata', `date=${track.release_year}`);
            }
        }
        
        try {
            await this.runCommand('ffmpeg', args);
            
            // Replace original file with metadata-enriched version
            await fs.rename(tempFile, filePath);
            console.log(`Metadata successfully added to: ${filePath}`);
            
        } catch (error) {
            console.warn(`Failed to add metadata to ${filePath}:`, error.message);
            
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
        // Sanitize filename - remove problematic characters including ? for Windows compatibility
        const sanitize = (str) => {
            return str.replace(/[<>:"/\\|*?]/g, '_').replace(/\s+/g, ' ').trim();
        };
        
        // For Spotify tracks, use the original Spotify metadata for filename
        // For YouTube tracks, use the track data as is
        const artist = sanitize(track.artist || 'Unknown Artist');
        const title = sanitize(track.title || 'Unknown Title');
        
        // Calculate padding for track numbers based on total tracks
        const totalTracks = options.totalTracks || 100;
        const padding = Math.max(2, totalTracks.toString().length);
        
        // Add track number if requested
        if (options.includeTrackNumbers && trackIndex !== null) {
            const trackNumber = String(trackIndex + 1).padStart(padding, '0');
            return `${trackNumber} - ${artist} - ${title}.mp3`;
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
        // Use setup manager paths for tools (setup is done at app startup)
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

    async createSingleDownload(track, trackId, options = {}) {
        const downloadId = `single-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        
        const download = {
            id: downloadId,
            track: track,
            trackId: trackId,
            options: {
                format: 'mp3',
                quality: 'best',
                includeTrackNumbers: false,
                ...options
            },
            status: 'pending',
            startTime: new Date(),
            downloadPath: null,
            filename: null,
            filePath: null
        };

        this.downloads.set(downloadId, download);
        return downloadId;
    }

    async downloadSingleTrack(downloadId, socketIo) {
        const download = this.downloads.get(downloadId);
        if (!download) {
            return { success: false, error: 'Download not found' };
        }

        console.log(`Starting single track download ${downloadId}: ${download.track.artist} - ${download.track.title}`);
        
        download.status = 'downloading';
        
        try {
            // Create temporary download directory
            const tempDir = path.join(this.defaultDownloadPath, 'temp', downloadId);
            await fs.mkdir(tempDir, { recursive: true });
            download.downloadPath = tempDir;
            
            // Download the track
            // For single track downloads, always use downloadFromSearch to ensure proper filename handling
            // even if the track has a URL (which would normally use downloadFromYouTube)
            console.log(`downloadSingleTrack: About to call downloadFromSearch for ${download.track.artist} - ${download.track.title}`);
            console.log(`downloadSingleTrack: Track has URL: ${!!download.track.url}`);
            console.log(`downloadSingleTrack: Track object:`, download.track);
            try {
                await this.downloadFromSearch(download.track, download.downloadPath, socketIo, downloadId, download.trackId, download.options);
                console.log(`downloadSingleTrack: downloadFromSearch completed successfully`);
            } catch (downloadError) {
                console.error(`downloadSingleTrack: downloadFromSearch failed:`, downloadError);
                throw downloadError;
            }
            
            // Generate the expected filename using Spotify metadata
            download.filename = this.generateFilename(download.track, download.trackId, download.options);
            download.filePath = path.join(download.downloadPath, download.filename);
            
            console.log(`Expected filename: ${download.filename}`);
            console.log(`Expected file path: ${download.filePath}`);
            
            // The file should already be renamed by downloadFromSearch, so check if it exists
            try {
                await fs.access(download.filePath);
                console.log(`File exists at expected path: ${download.filePath}`);
            } catch (error) {
                console.error(`File not found at expected path: ${download.filePath}`);
                throw new Error('Downloaded file not found at expected location');
            }
            
            // Now add metadata to the correct file
            await this.addMetadataToFile(download.track, download.filePath, download.trackId, download.options);
            
            console.log(`Full path: ${download.filePath}`);
            
            // Verify file exists
            try {
                await fs.access(download.filePath);
                download.status = 'completed';
                console.log(`Single track download completed: ${download.filename}`);
                return { success: true, filePath: download.filePath, filename: download.filename };
            } catch (error) {
                throw new Error('Downloaded file not found');
            }
            
        } catch (error) {
            download.status = 'failed';
            download.error = error.message;
            console.error(`Single track download ${downloadId} failed:`, error);
            return { success: false, error: error.message };
        }
    }

    cleanupSingleDownload(downloadId) {
        const download = this.downloads.get(downloadId);
        if (download && download.downloadPath) {
            // Clean up temporary files
            fs.rm(download.downloadPath, { recursive: true, force: true }).catch(error => {
                console.error('Failed to cleanup temp directory:', error);
            });
            this.downloads.delete(downloadId);
        }
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

    // Track a file for a session
    trackFileForSession(sessionId, filePath) {
        if (!this.sessionFiles.has(sessionId)) {
            this.sessionFiles.set(sessionId, new Set());
        }
        this.sessionFiles.get(sessionId).add(filePath);
        console.log(`Tracking file for session ${sessionId}: ${filePath}`);
    }

    // Track a directory for a session
    trackDirectoryForSession(sessionId, dirPath) {
        if (!this.sessionFiles.has(sessionId)) {
            this.sessionFiles.set(sessionId, new Set());
        }
        this.sessionFiles.get(sessionId).add(dirPath);
        console.log(`Tracking directory for session ${sessionId}: ${dirPath}`);
    }

    // Clean up all files for a session (instant deletion, no recycle bin)
    async cleanupSessionFiles(sessionId) {
        const sessionFiles = this.sessionFiles.get(sessionId);
        if (!sessionFiles) {
            return;
        }

        console.log(`Cleaning up ${sessionFiles.size} files/directories for session ${sessionId}`);
        
        // First, clean up all files
        const directories = new Set();
        for (const filePath of sessionFiles) {
            try {
                const stats = await fs.stat(filePath);
                if (stats.isFile()) {
                    await fs.unlink(filePath);
                    console.log(`Deleted file: ${filePath}`);
                    // Add parent directory to cleanup list
                    const parentDir = path.dirname(filePath);
                    if (parentDir.includes('temp') || parentDir.includes('download-')) {
                        directories.add(parentDir);
                    }
                } else if (stats.isDirectory()) {
                    directories.add(filePath);
                }
            } catch (error) {
                if (error.code === 'ENOENT') {
                    console.log(`File/directory already deleted: ${filePath}`);
                } else {
                    console.log(`Error handling ${filePath}: ${error.message}`);
                }
                // Still try to add to directories if it looks like a temp directory
                if (filePath.includes('temp') || filePath.includes('download-')) {
                    directories.add(filePath);
                }
            }
        }

        // Now clean up directories - use a more robust approach
        await this.cleanupDirectories(directories);

        this.sessionFiles.delete(sessionId);
        console.log(`Session ${sessionId} cleanup completed`);
    }

    // Helper method to clean up directories with better error handling
    async cleanupDirectories(directories) {
        for (const dir of directories) {
            try {
                // First check if directory exists
                await fs.access(dir);
                
                // Try to remove it recursively
                await fs.rm(dir, { recursive: true, force: true });
                console.log(`Deleted directory: ${dir}`);
            } catch (error) {
                if (error.code === 'ENOENT') {
                    console.log(`Directory already deleted: ${dir}`);
                } else {
                    console.log(`Directory cleanup failed: ${dir} - ${error.message}`);
                    
                    // If direct deletion fails, try to find and clean similar directories
                    await this.cleanupSimilarDirectories(dir);
                }
            }
        }
    }

    // Helper method to find and clean up directories with similar names
    async cleanupSimilarDirectories(targetDir) {
        try {
            const parentDir = path.dirname(targetDir);
            const targetName = path.basename(targetDir);
            
            // Only proceed if it's a temp directory
            if (!targetName.startsWith('single-')) {
                return;
            }
            
            const files = await fs.readdir(parentDir);
            
            // Look for directories that match the pattern but might have slight differences
            const pattern = targetName.split('-').slice(0, 2).join('-'); // e.g., "single-1752586605612"
            
            for (const file of files) {
                const filePath = path.join(parentDir, file);
                try {
                    const stats = await fs.stat(filePath);
                    if (stats.isDirectory() && file.startsWith(pattern)) {
                        await fs.rm(filePath, { recursive: true, force: true });
                        console.log(`Cleaned up similar directory: ${filePath}`);
                    }
                } catch (cleanupError) {
                    console.log(`Failed to clean similar directory ${filePath}: ${cleanupError.message}`);
                }
            }
        } catch (error) {
            console.log(`Error during similar directory cleanup: ${error.message}`);
        }
    }

    // Clean up all temporary files and directories
    async cleanupAllTempFiles() {
        try {
            const tempPath = path.join(this.defaultDownloadPath, 'temp');
            await fs.access(tempPath);
            const tempDirs = await fs.readdir(tempPath);
            
            console.log(`Found ${tempDirs.length} temporary directories to clean up`);
            
            for (const dir of tempDirs) {
                const dirPath = path.join(tempPath, dir);
                try {
                    await fs.rm(dirPath, { recursive: true, force: true });
                    console.log(`Cleaned up temp directory: ${dirPath}`);
                } catch (error) {
                    console.log(`Failed to clean temp directory: ${dirPath} - ${error.message}`);
                }
            }
            
            console.log('Temporary directory cleanup completed');
        } catch (error) {
            if (error.code === 'ENOENT') {
                console.log('No temp directory exists to clean up');
            } else {
                console.log(`Error during temp cleanup: ${error.message}`);
            }
        }
    }
    
    // Initialize the service and clean up any leftover temp files
    async initialize() {
        console.log('Initializing download service...');
        await this.cleanupAllTempFiles();
        console.log('Download service initialized');
    }
}

module.exports = new DownloadService();
