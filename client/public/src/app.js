// Playlistifier Web Frontend Application
class PlaylistifierApp {
    constructor() {
        this.socket = null;
        this.currentDownloadId = null;
        this.currentUrl = '';
        this.currentTracks = [];
        this.authToken = null;
        this.rawUrlData = []; // Store raw URL data separately from display
        this.currentHeader = ''; // Store the header separately
        this.maxConcurrentDownloads = 10; // Default concurrent downloads
        this.searchCompleted = false; // Track if all searches are complete
        this.tracksSearchStatus = new Map(); // Track individual track search status
        
        this.initializeApp();
    }

    initializeApp() {
        this.setupEventListeners();
        this.setupWebSocket();
        this.checkAuthStatus();
        this.checkFileSystemAccessSupport();
    }

    setupEventListeners() {
        // URL input and analysis
        document.getElementById('analyze-btn').addEventListener('click', () => this.analyzeUrl());
        document.getElementById('url-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.analyzeUrl();
        });

        // Authentication
        document.getElementById('spotify-auth-btn').addEventListener('click', () => this.authenticatePlatform());

        // Downloads
document.getElementById('download-btn').addEventListener('click', () => this.saveAllTracks());
        const downloadToFolderBtn = document.getElementById('download-to-folder-btn');
        if (downloadToFolderBtn) {
            console.log('Setting up download-to-folder-btn event listener');
            downloadToFolderBtn.addEventListener('click', () => {
                console.log('download-to-folder-btn clicked!');
                this.downloadToFolder();
            });
        } else {
            console.error('download-to-folder-btn element not found!');
        }
        document.getElementById('cancel-btn').addEventListener('click', () => this.cancelDownload());

        // Navigation
        document.getElementById('restart-btn').addEventListener('click', () => this.restart());
        document.getElementById('new-download-btn').addEventListener('click', () => this.restart());
        
        // YouTube URLs functionality
        document.getElementById('search-youtube-btn').addEventListener('click', () => this.searchVideoUrls());
        document.getElementById('save-urls-btn').addEventListener('click', () => this.saveUrlsToFile());
        document.getElementById('copy-urls-btn').addEventListener('click', () => this.copyUrlsToClipboard());
        document.getElementById('track-info-checkbox').addEventListener('change', () => this.toggleTrackInfo());
        
        // Concurrent downloads configuration
        document.getElementById('max-concurrent-downloads').addEventListener('input', (e) => this.updateMaxConcurrentDownloads(e.target.value));
    }

    setupWebSocket() {
        this.socket = io();
        
        this.socket.on('progress-update', (data) => {
            this.updateDownloadProgress(data);
        });

        this.socket.on('track-download-start', (data) => {
            this.updateTrackStatus(data.trackId, 'downloading', 'Downloading...');
        });

        this.socket.on('track-progress', (data) => {
            const trackEl = document.querySelector(`[data-track-id="${data.trackId}"]`);
            if (trackEl) {
                const statusEl = trackEl.querySelector('.track-status');
                if (statusEl) {
                    if (data.progress !== undefined) {
                        statusEl.textContent = `Downloading ${data.progress}%`;
                    } else {
                        statusEl.textContent = 'Downloading...';
                    }
                }
            }
        });

        this.socket.on('download-complete', (data) => {
            this.handleTrackComplete(data);
        });

        this.socket.on('download-error', (data) => {
            this.handleTrackError(data);
        });

        this.socket.on('batch-complete', (data) => {
            this.handleBatchComplete(data);
        });
    }

    async checkAuthStatus() {
        try {
            const response = await fetch('/api/auth/status');
            const data = await response.json();
            
            if (data.spotify && data.token) {
                this.authToken = data.token;
                console.log('Authentication restored from session');
                
                // Update UI to show authenticated state
                this.updateAuthUI(true);
            } else {
                this.authToken = null;
                this.updateAuthUI(false);
            }
        } catch (error) {
            console.error('Auth status check failed:', error);
            this.authToken = null;
            this.updateAuthUI(false);
        }
    }

    async analyzeUrl() {
        const url = document.getElementById('url-input').value.trim();
        
        if (!url) {
            this.showError('Please enter a URL');
            return;
        }

        this.currentUrl = url;
        this.showStatus('Analyzing URL...');
        this.setLoading('analyze-btn', true);

        try {
            const response = await fetch('/api/analyze', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ url }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Analysis failed');
            }

            this.showStatus(`Found ${data.platform} ${data.type}`);
            
            // Always try to extract tracks first - let the backend handle hybrid authentication
            this.extractTracks();

        } catch (error) {
            this.showError(error.message);
        } finally {
            this.setLoading('analyze-btn', false);
        }
    }

    async extractTracks() {
        this.showStatus('Extracting tracks...');

        try {
            const response = await fetch('/api/extract', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ 
                    url: this.currentUrl,
                    token: this.authToken 
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                // Check if this is an authentication requirement
                if (response.status === 401 && data.authRequired) {
                    console.log('Authentication required:', data.reason);
                    this.showAuthSection(data.reason);
                    return;
                }
                throw new Error(data.error || 'Track extraction failed');
            }

            this.currentTracks = data.tracks;
            this.showTracksSection(data.tracks, data.metadata);

        } catch (error) {
            this.showError(error.message);
        }
    }

    async authenticatePlatform() {
        try {
            const response = await fetch('/api/auth/spotify');
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Authentication failed');
            }

            // Open popup for authentication
            const popup = window.open(data.authUrl, 'spotify-auth', 'width=600,height=700');
            
            // Set up message listener for popup communication
            const messageHandler = (event) => {
                console.log('Received message from popup:', event.data);
                
                // Verify the message is from our auth popup
                if (event.data && event.data.type) {
                    if (event.data.type === 'spotify-auth-success') {
                        // Authentication successful
                        this.authToken = event.data.token;
                        this.hideAuthSection();
                        this.extractTracks();
                        window.removeEventListener('message', messageHandler);
                        
                        // Close popup if it's still open
                        if (popup && !popup.closed) {
                            popup.close();
                        }
                    } else if (event.data.type === 'spotify-auth-error') {
                        // Authentication failed
                        this.showAuthError(event.data.error || 'Authentication failed');
                        window.removeEventListener('message', messageHandler);
                        
                        // Close popup if it's still open
                        if (popup && !popup.closed) {
                            popup.close();
                        }
                    }
                }
            };
            
            // Listen for messages from the popup
            window.addEventListener('message', messageHandler);
            
            // Fallback: Check if popup is closed manually (user closed it)
            const checkClosed = setInterval(() => {
                if (popup.closed) {
                    clearInterval(checkClosed);
                    window.removeEventListener('message', messageHandler);
                    
                    // Optional: Check final status via API as fallback
                    setTimeout(async () => {
                        try {
                            const statusResponse = await fetch(`/api/auth/spotify/status/${data.state}`);
                            const statusData = await statusResponse.json();
                            
                            if (statusData.status === 'success') {
                                this.authToken = statusData.token;
                                this.hideAuthSection();
                                this.extractTracks();
                            } else if (statusData.status === 'error') {
                                this.showAuthError(statusData.error);
                            }
                        } catch (error) {
                            console.error('Fallback status check failed:', error);
                        }
                    }, 1000);
                }
            }, 1000);

        } catch (error) {
            this.showAuthError(error.message);
        }
    }

async saveAllTracks() {
        if (!this.currentTracks.length) {
            this.showError('No tracks to download');
            return;
        }
        
        // Check if all searches are complete before allowing download
        if (!this.searchCompleted) {
            this.showError('Cannot download tracks while searches are still in progress. Please wait for all searches to complete.');
            return;
        }

        const tracksToDownload = [];
        for (let i = 0; i < this.currentTracks.length; i++) {
            if (!this.downloadedTracks.has(String(i))) {
                // Only include tracks that have been successfully found
                const trackStatus = this.tracksSearchStatus.get(i);
                if (trackStatus === 'found') {
                    tracksToDownload.push({ track: this.currentTracks[i], index: i });
                }
            }
        }

        if (tracksToDownload.length === 0) {
            // All tracks are already downloaded, just create the zip
            if (this.downloadedBlobs && this.downloadedBlobs.size > 0) {
                await this.downloadAllAsZip();
            } else {
                this.showError('No tracks available to save');
            }
            return;
        }

        // Show download progress and start downloads
        const downloadAllBtn = document.getElementById('download-btn');
        downloadAllBtn.disabled = true;
        downloadAllBtn.textContent = 'Downloading...';

        try {
            await this.downloadTracksWithStaggeredQueue(tracksToDownload, this.maxConcurrentDownloads, 1000);
            
            // Update button text after all downloads complete
            this.updateDownloadAllButton();
            this.showStatus('All tracks downloaded successfully! Click "Save All as ZIP" to download the complete playlist.');
        } catch (error) {
            this.showError(error.message);
        } finally {
            downloadAllBtn.disabled = false;
        }
    }

    toggleTrackInfo() {
        const checkbox = document.getElementById('track-info-checkbox');
        const youtubeUrlsTextarea = document.getElementById('youtube-urls');
        
        if (checkbox.checked) {
            // Show header + track info + URLs
            youtubeUrlsTextarea.value = this.currentHeader + this.rawUrlData.join('\n');
        } else {
            // Show only URLs (no header, no track info)
            const urlsOnly = this.rawUrlData.filter((line, index) => index % 2 !== 0);
            youtubeUrlsTextarea.value = urlsOnly.join('\n');
        }
    }

    async createPlaylistZip() {
        if (!this.currentTracks.length) {
            this.showError('No tracks to download');
            return;
        }

        // Filter out already downloaded tracks
        const tracksToDownload = [];
        for (let i = 0; i < this.currentTracks.length; i++) {
            if (!this.downloadedTracks.has(String(i))) {
                tracksToDownload.push({ track: this.currentTracks[i], index: i });
            }
        }

        if (tracksToDownload.length === 0) {
            // All tracks are already downloaded, just save the zip
            if (this.downloadedBlobs && this.downloadedBlobs.size > 0) {
                await this.downloadAllAsZip();
            } else {
                this.showError('No tracks available to save');
            }
            return;
        }

        // For remaining tracks, download them concurrently and then create a zip
        const downloadAllBtn = document.getElementById('download-btn');
        downloadAllBtn.disabled = true;
        downloadAllBtn.textContent = 'Downloading remaining tracks...';

        let successCount = 0;
        let failureCount = 0;

        try {
            // Download tracks concurrently with configurable concurrency limit
            const results = await this.downloadTracksWithConcurrency(tracksToDownload, 3); // 3 concurrent downloads
            
            // Count results
            results.forEach(result => {
                if (result.success) {
                    successCount++;
                } else {
                    failureCount++;
                }
            });

            // Create and download zip file of all downloaded tracks
            if (this.downloadedBlobs && this.downloadedBlobs.size > 0) {
                await this.downloadAllAsZip();
            }

            this.showStatus(`Download completed: ${successCount} successful, ${failureCount} failed`);

        } catch (error) {
            this.showError(error.message);
        } finally {
            downloadAllBtn.disabled = false;
            this.updateDownloadAllButton();
        }
    }

    async downloadTracksWithStaggeredQueue(tracksToDownload, maxConcurrency = 5, staggerDelay = 2000) {
        // First, set all tracks to "Queued for Download"
        tracksToDownload.forEach(({ index }) => {
            this.updateTrackStatus(index, 'queued-download', 'Queued for Download');
        });
        
        const results = [];
        const activeDownloads = new Set();
        const scheduledDownloads = new Set(); // Track downloads that are scheduled but not yet started
        let currentIndex = 0;
        
        const startNextDownload = async () => {
            if (currentIndex >= tracksToDownload.length) {
                return null;
            }
            
            const { track, index } = tracksToDownload[currentIndex];
            currentIndex++;
            
            const downloadPromise = this.downloadSingleTrackWithResult(String(index))
                .then(result => {
                    activeDownloads.delete(downloadPromise);
                    return { trackIndex: index, success: true, result };
                })
                .catch(error => {
                    activeDownloads.delete(downloadPromise);
                    return { trackIndex: index, success: false, error };
                });
            
            activeDownloads.add(downloadPromise);
            results.push(downloadPromise);
            
            return downloadPromise;
        };
        
        // Start initial downloads up to maxConcurrency with stagger delays
        for (let i = 0; i < Math.min(maxConcurrency, tracksToDownload.length); i++) {
            const timeoutId = setTimeout(async () => {
                scheduledDownloads.delete(timeoutId);
                await startNextDownload();
            }, i * staggerDelay);
            scheduledDownloads.add(timeoutId);
        }
        
        // Wait for initial downloads to start, then handle remaining downloads
        await new Promise(resolve => setTimeout(resolve, Math.min(maxConcurrency, tracksToDownload.length) * staggerDelay));
        
        // Continue processing remaining downloads with dynamic concurrency adjustment
        while (currentIndex < tracksToDownload.length || activeDownloads.size > 0) {
            // Get current concurrency limit (this allows for dynamic updates)
            const currentMaxConcurrency = this.maxConcurrentDownloads;
            
            // Fill up available slots with new downloads up to the current limit
            while (currentIndex < tracksToDownload.length && (activeDownloads.size + scheduledDownloads.size) < currentMaxConcurrency) {
                // Start next download with stagger delay
                const timeoutId = setTimeout(async () => {
                    scheduledDownloads.delete(timeoutId);
                    await startNextDownload();
                }, staggerDelay);
                scheduledDownloads.add(timeoutId);
            }
            
            // If current concurrency exceeds the new limit, cancel scheduled downloads
            if ((activeDownloads.size + scheduledDownloads.size) > currentMaxConcurrency) {
                // Cancel excess scheduled downloads (but don't interrupt active ones)
                const excessCount = (activeDownloads.size + scheduledDownloads.size) - currentMaxConcurrency;
                const scheduledArray = Array.from(scheduledDownloads);
                for (let i = 0; i < Math.min(excessCount, scheduledArray.length); i++) {
                    clearTimeout(scheduledArray[i]);
                    scheduledDownloads.delete(scheduledArray[i]);
                }
            }
            
            // If we have active downloads but no more to start, wait for completions
            if (activeDownloads.size > 0) {
                await Promise.race(Array.from(activeDownloads));
            } else {
                // No more downloads to start and none active
                break;
            }
        }
        
        // Wait for all downloads to complete
        return Promise.all(results);
    }

    async downloadTracksWithConcurrency(tracksToDownload, concurrencyLimit = 3) {
        const results = [];
        const executing = [];
        
        for (const { track, index } of tracksToDownload) {
            const promise = this.downloadSingleTrackWithResult(String(index))
                .then(result => ({ trackIndex: index, success: true, result }))
                .catch(error => ({ trackIndex: index, success: false, error }));
            
            results.push(promise);
            
            if (results.length >= concurrencyLimit) {
                executing.push(promise);
                
                if (executing.length >= concurrencyLimit) {
                    await Promise.race(executing);
                    executing.splice(executing.findIndex(p => p === promise), 1);
                }
            }
        }
        
        return Promise.all(results);
    }

    async downloadSingleTrackWithResult(trackId) {
        try {
            await this.downloadSingleTrack(trackId);
            return { success: true, trackId };
        } catch (error) {
            console.error(`Failed to download track ${trackId}:`, error);
            return { success: false, trackId, error };
        }
    }

    generateM3UPlaylist(sortedTrackIndices, trackMap, includeTrackNumbers, padding) {
        const playlistName = this.currentMetadata?.name || this.currentMetadata?.title || 'Playlist';
        
        // M3U format with extended info
        let m3uContent = '#EXTM3U\n';
        m3uContent += `#PLAYLIST:${playlistName}\n\n`;
        
        sortedTrackIndices.forEach((trackIndex, sequentialIndex) => {
            const downloadData = trackMap.get(trackIndex);
            const track = downloadData.track;
            const trackNumber = String(sequentialIndex + 1).padStart(padding, '0');
            
            // Sanitize for filename
            const sanitizeFilename = (str) => {
                return str.replace(/[<>:"/\\|*?]/g, '_').replace(/\s+/g, ' ').trim();
            };
            
            const artist = sanitizeFilename(track.artist || 'Unknown Artist');
            const title = sanitizeFilename(track.title || 'Unknown Title');
            const filename = includeTrackNumbers ? `${trackNumber} - ${artist} - ${title}.mp3` : `${artist} - ${title}.mp3`;
            
            // Add extended info and file reference
            m3uContent += `#EXTINF:-1,${track.artist || 'Unknown Artist'} - ${track.title || 'Unknown Title'}\n`;
            m3uContent += `${filename}\n`;
        });
        
        return m3uContent;
    }

    async downloadAllAsZip() {
        console.log('downloadAllAsZip called');
        console.log('downloadedBlobs size:', this.downloadedBlobs ? this.downloadedBlobs.size : 'undefined');
        
        if (!this.downloadedBlobs || this.downloadedBlobs.size === 0) {
            this.showError('No files to zip');
            return;
        }

        // Check if JSZip is available
        console.log('window.JSZip:', window.JSZip);
        console.log('typeof window.JSZip:', typeof window.JSZip);
        
        // Wait for JSZip to be loaded if it's not available yet
        let JSZip = window.JSZip;
        if (!JSZip) {
            console.log('JSZip not found, waiting for it to load...');
            // Wait up to 3 seconds for JSZip to load
            for (let i = 0; i < 30; i++) {
                await new Promise(resolve => setTimeout(resolve, 100));
                JSZip = window.JSZip;
                if (JSZip) {
                    console.log('JSZip loaded after waiting');
                    break;
                }
            }
        }
        
        console.log('JSZip available:', !!JSZip);
        if (!JSZip) {
            this.showError('JSZip library not found. Cannot create zip file.');
            return;
        }

        const zip = new JSZip();
        console.log('JSZip instance created');
        
        // Calculate padding for track numbers
        const totalTracks = this.currentTracks.length;
        const padding = Math.max(2, totalTracks.toString().length);
        
        // Create a map to store tracks with their indices for proper ordering
        const trackMap = new Map();
        for (const [trackId, downloadData] of this.downloadedBlobs) {
            const trackIndex = parseInt(trackId);
            trackMap.set(trackIndex, downloadData);
        }
        
        // Sort tracks by index and add to zip with proper numbering
        const sortedTrackIndices = Array.from(trackMap.keys()).sort((a, b) => a - b);
        
        console.log('Adding files to zip with track numbers:');
sortedTrackIndices.forEach((trackIndex, sequentialIndex) => {
            const downloadData = trackMap.get(trackIndex);
            const includeTrackNumbers = document.getElementById('track-numbers-checkbox').checked;
            const trackNumber = String(sequentialIndex + 1).padStart(padding, '0');
            
            // Create new filename
            const sanitizeFilename = (str) => {
                return str.replace(/[<>:"/\\|*?]/g, '_').replace(/\s+/g, ' ').trim();
            };
            
            const track = downloadData.track;
            const artist = sanitizeFilename(track.artist || 'Unknown Artist');
            const title = sanitizeFilename(track.title || 'Unknown Title');
            const filename = includeTrackNumbers ? `${trackNumber} - ${artist} - ${title}.mp3` : `${artist} - ${title}.mp3`;
            
            console.log(`- ${trackIndex}: ${filename}`);
            console.log(`  Blob size: ${downloadData.blob.size} bytes`);
            zip.file(filename, downloadData.blob);
        });
        
        // Add M3U playlist file
        const playlistName = this.currentMetadata?.name || this.currentMetadata?.title || 'Playlist';
        const sanitizedPlaylistName = playlistName.replace(/[<>:"/\\|*?]/g, '_');
        const includeTrackNumbers = document.getElementById('track-numbers-checkbox').checked;
        const m3uContent = this.generateM3UPlaylist(sortedTrackIndices, trackMap, includeTrackNumbers, padding);
        const m3uFilename = `${sanitizedPlaylistName}.m3u`;
        
        console.log(`Adding M3U playlist file: ${m3uFilename}`);
        zip.file(m3uFilename, m3uContent);
        
        // Add playlist file with YouTube URLs
        const playlistFilename = `${sanitizedPlaylistName} - songs.txt`;
        
        // Get YouTube URLs content
        const youtubeUrlsTextarea = document.getElementById('youtube-urls');
        const youtubeUrlsContent = youtubeUrlsTextarea ? youtubeUrlsTextarea.value : '';
        
        if (youtubeUrlsContent.trim()) {
            console.log(`Adding playlist file: ${playlistFilename}`);
            zip.file(playlistFilename, youtubeUrlsContent);
        }
        
        console.log('All files added to zip');

        try {
            // Generate zip file
            console.log('Generating zip file...');
            const zipBlob = await zip.generateAsync({type: 'blob'});
            
            // Create filename from playlist/album title
            const cleanName = sanitizedPlaylistName;
            const zipFilename = `${cleanName}.zip`;
            
            console.log(`Downloading zip file: ${zipFilename}`);
            
            // Download the zip file
            const url = window.URL.createObjectURL(zipBlob);
            const a = document.createElement('a');
            a.href = url;
            a.download = zipFilename;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
            
            this.showStatus(`All tracks saved as ${zipFilename}`);
        } catch (error) {
            console.error('ZIP creation error:', error);
            this.showError(`Failed to create zip file: ${error.message}`);
        }
    }

    cancelDownload() {
        if (this.currentDownloadId) {
            this.socket.emit('cancel-download', this.currentDownloadId);
        }
        this.restart();
    }

    async downloadSingleTrack(trackId) {
        if (!this.currentTracks[trackId]) {
            this.showError('Track not found');
            return;
        }
        
        // Check if track is ready for download (must be 'found' status)
        const trackStatus = this.tracksSearchStatus.get(parseInt(trackId));
        if (trackStatus !== 'found') {
            this.showError('Track is not ready for download. Please wait for search to complete.');
            return;
        }

        const track = this.currentTracks[trackId];
        const downloadButton = document.querySelector(`[data-track-id="${trackId}"] .track-download-btn`);
        const saveButton = document.querySelector(`[data-track-id="${trackId}"] .track-save-btn`);
        
        downloadButton.disabled = true;
        downloadButton.textContent = 'Downloading...';
        
        this.updateTrackStatus(trackId, 'downloading', 'Downloading...');

        try {
            // Always download individual tracks without numbering
            const response = await fetch('/api/download/single', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    track: track,
                    trackId: trackId,
                    options: {
                        format: 'mp3',
                        quality: 'best',
                        includeTrackNumbers: false
                    }
                }),
            });

            if (!response.ok) {
                throw new Error('Download failed');
            }

            // Store the blob for later saving
            const blob = await response.blob();
            if (!this.downloadedBlobs) {
                this.downloadedBlobs = new Map();
            }
            
            // Extract actual filename from Content-Disposition header
            let actualFilename = `${track.artist} - ${track.title}.mp3`; // fallback
            const contentDisposition = response.headers.get('Content-Disposition');
            if (contentDisposition) {
                // Try to extract filename from Content-Disposition header
                const filenameMatch = contentDisposition.match(/filename\*?=([^;]+)/);
                if (filenameMatch) {
                    let headerFilename = filenameMatch[1].trim();
                    // Remove quotes if present
                    if (headerFilename.startsWith('"') && headerFilename.endsWith('"')) {
                        headerFilename = headerFilename.slice(1, -1);
                    }
                    // Handle RFC 5987 encoding (filename*=UTF-8''encoded-filename)
                    if (headerFilename.startsWith('UTF-8\'\'\'')) {
                        headerFilename = decodeURIComponent(headerFilename.substring(7));
                    }
                    actualFilename = headerFilename;
                }
            }
            
            console.log(`Storing blob for track ${trackId} with filename: ${actualFilename}`);
            
            this.downloadedBlobs.set(trackId, {
                blob: blob,
                filename: actualFilename,
                track: track
            });
            
            // Mark as downloaded and show save button
            this.downloadedTracks.add(trackId);
            this.updateTrackStatus(trackId, 'downloaded', 'Downloaded - Ready to save');
            downloadButton.classList.add('hidden');
            saveButton.classList.remove('hidden');
            
            // Update the download all button text
            this.updateDownloadAllButton();
            this.updateDownloadToFolderButton();

        } catch (error) {
            this.updateTrackStatus(trackId, 'error', 'Error');
            downloadButton.textContent = 'Retry Download';
            downloadButton.disabled = false;
            this.showError(`Download failed: ${error.message}`);
        }
    }
    
    async saveSingleTrack(trackId) {
        if (!this.downloadedBlobs || !this.downloadedBlobs.has(trackId)) {
            this.showError('No downloaded file found. Please download first.');
            return;
        }
        
        const downloadData = this.downloadedBlobs.get(trackId);
        const url = window.URL.createObjectURL(downloadData.blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = downloadData.filename;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        
        this.updateTrackStatus(trackId, 'saved', 'Saved to device');
        this.showStatus(`Saved: ${downloadData.filename}`);
    }
    
    updateDownloadAllButton() {
        const downloadAllBtn = document.getElementById('download-btn');
        const totalTracks = this.currentTracks.length;
        const downloadedCount = this.downloadedTracks.size;
        const remainingCount = totalTracks - downloadedCount;
        
        // Check if all searches are complete
        if (!this.searchCompleted) {
            downloadAllBtn.textContent = 'Waiting for searches to complete...';
            downloadAllBtn.disabled = true;
            return;
        }
        
        if (remainingCount > 0) {
            downloadAllBtn.textContent = `Download Remaining (${remainingCount})`;
            downloadAllBtn.disabled = false; // Enable since searches are complete
        } else {
            downloadAllBtn.textContent = 'Save All as ZIP';
            downloadAllBtn.disabled = false; // Enable button to save zip
        }
    }
    
    updateDownloadToFolderButton() {
        const downloadToFolderBtn = document.getElementById('download-to-folder-btn');
        if (!downloadToFolderBtn) return;
        
        const totalTracks = this.currentTracks.length;
        const downloadedCount = this.downloadedTracks.size;
        
        // Check if File System Access API is supported
        if (!('showDirectoryPicker' in window)) {
            downloadToFolderBtn.disabled = true;
            downloadToFolderBtn.title = 'This feature requires Chrome 86+, Edge 86+, or Opera 72+. Not supported in Firefox or Safari.';
            downloadToFolderBtn.style.opacity = '0.6';
            return;
        }
        
        // Check if all searches are complete
        if (!this.searchCompleted) {
            downloadToFolderBtn.disabled = true;
            downloadToFolderBtn.title = 'Waiting for searches to complete...';
            return;
        }
        
        // Check if all tracks are downloaded
        if (downloadedCount < totalTracks) {
            downloadToFolderBtn.disabled = true;
            downloadToFolderBtn.title = `Download all tracks first (${downloadedCount}/${totalTracks} completed)`;
        } else {
            downloadToFolderBtn.disabled = false;
            downloadToFolderBtn.title = 'Save files directly to a folder on your computer';
        }
    }

    updateMaxConcurrentDownloads(value) {
        const numValue = parseInt(value);
        if (isNaN(numValue) || numValue < 1 || numValue > 20) {
            console.warn('Invalid concurrent downloads value:', value);
            return;
        }
        
        this.maxConcurrentDownloads = numValue;
        console.log(`Max concurrent downloads updated to: ${this.maxConcurrentDownloads}`);
        
        // Show status message to user
        this.showStatus(`Download concurrency set to ${this.maxConcurrentDownloads}`);
    }
    
    checkFileSystemAccessSupport() {
        const downloadToFolderBtn = document.getElementById('download-to-folder-btn');
        if (!downloadToFolderBtn) return;
        
        // Check if the File System Access API is supported
        if ('showDirectoryPicker' in window) {
            console.log('File System Access API is supported');
            downloadToFolderBtn.disabled = false;
            downloadToFolderBtn.title = 'Save files directly to a folder on your computer';
        } else {
            console.log('File System Access API is not supported in this browser');
            downloadToFolderBtn.disabled = true;
            downloadToFolderBtn.title = 'This feature requires Chrome 86+, Edge 86+, or Opera 72+. Not supported in Firefox or Safari.';
            // Add a visual indicator that it's not supported
            downloadToFolderBtn.style.opacity = '0.6';
        }
    }
    
    async downloadToFolder() {
        console.log('downloadToFolder called');
        
        if (!this.currentTracks.length) {
            console.log('No tracks to download');
            this.showError('No tracks to download');
            return;
        }
        
        // Check if all searches are complete before allowing download
        if (!this.searchCompleted) {
            console.log('Search not completed');
            this.showError('Cannot download tracks while searches are still in progress. Please wait for all searches to complete.');
            return;
        }
        
        // Check if we have any downloaded tracks
        if (!this.downloadedBlobs || this.downloadedBlobs.size === 0) {
            console.log('No downloaded blobs');
            this.showError('No tracks have been downloaded yet. Please download tracks first.');
            return;
        }
        
        console.log('All checks passed, starting download to folder');
        
        const downloadToFolderBtn = document.getElementById('download-to-folder-btn');
        const originalText = downloadToFolderBtn.textContent;
        
        try {
            // Show directory picker
            downloadToFolderBtn.disabled = true;
            downloadToFolderBtn.textContent = 'Select folder...';
            
            console.log('About to show directory picker');
            const dirHandle = await window.showDirectoryPicker();
            console.log('Directory picker returned:', dirHandle);
            
            downloadToFolderBtn.textContent = 'Creating playlist folder...';
            
            // Create a subfolder with the playlist name
            const playlistName = this.currentMetadata?.name || this.currentMetadata?.title || 'Playlist';
            const sanitizedPlaylistName = playlistName.replace(/[<>:"/\\|*?]/g, '_').replace(/\s+/g, ' ').trim();
            
            let playlistDirHandle;
            try {
                playlistDirHandle = await dirHandle.getDirectoryHandle(sanitizedPlaylistName, { create: true });
                console.log(`Created playlist folder: ${sanitizedPlaylistName}`);
            } catch (error) {
                console.error('Failed to create playlist folder:', error);
                throw new Error(`Failed to create playlist folder: ${error.message}`);
            }
            
            downloadToFolderBtn.textContent = 'Saving files...';
            
            // Calculate padding for track numbers
            const totalTracks = this.currentTracks.length;
            const padding = Math.max(2, totalTracks.toString().length);
            
            // Create a map to store tracks with their indices for proper ordering
            const trackMap = new Map();
            for (const [trackId, downloadData] of this.downloadedBlobs) {
                const trackIndex = parseInt(trackId);
                trackMap.set(trackIndex, downloadData);
            }
            
            // Sort tracks by index and save to folder with proper numbering
            const sortedTrackIndices = Array.from(trackMap.keys()).sort((a, b) => a - b);
            
            let savedCount = 0;
            let errorCount = 0;
            
            for (const [sequentialIndex, trackIndex] of sortedTrackIndices.entries()) {
                const downloadData = trackMap.get(trackIndex);
                const includeTrackNumbers = document.getElementById('track-numbers-checkbox').checked;
                const trackNumber = String(sequentialIndex + 1).padStart(padding, '0');
                
                // Create filename
                const sanitizeFilename = (str) => {
                    return str.replace(/[<>:"/\\|*?]/g, '_').replace(/\s+/g, ' ').trim();
                };
                
                const track = downloadData.track;
                const artist = sanitizeFilename(track.artist || 'Unknown Artist');
                const title = sanitizeFilename(track.title || 'Unknown Title');
                const filename = includeTrackNumbers ? `${trackNumber} - ${artist} - ${title}.mp3` : `${artist} - ${title}.mp3`;
                
                try {
                    // Create file in playlist subfolder
                    const fileHandle = await playlistDirHandle.getFileHandle(filename, { create: true });
                    const writable = await fileHandle.createWritable();
                    await writable.write(downloadData.blob);
                    await writable.close();
                    
                    savedCount++;
                    console.log(`Saved: ${filename}`);
                } catch (error) {
                    console.error(`Failed to save ${filename}:`, error);
                    errorCount++;
                }
            }
            
            // Also save the M3U playlist file in the playlist subfolder
            try {
                const playlistName = this.currentMetadata?.name || this.currentMetadata?.title || 'Playlist';
                const sanitizedPlaylistName = playlistName.replace(/[<>:"/\\|*?]/g, '_');
                const includeTrackNumbers = document.getElementById('track-numbers-checkbox').checked;
                const m3uContent = this.generateM3UPlaylist(sortedTrackIndices, trackMap, includeTrackNumbers, padding);
                const m3uFilename = `${sanitizedPlaylistName}.m3u`;
                
                const m3uFileHandle = await playlistDirHandle.getFileHandle(m3uFilename, { create: true });
                const m3uWritable = await m3uFileHandle.createWritable();
                await m3uWritable.write(m3uContent);
                await m3uWritable.close();
                console.log(`Saved M3U playlist file: ${m3uFilename}`);
            } catch (error) {
                console.error('Failed to save M3U playlist file:', error);
            }
            
            // Also save the playlist file with YouTube URLs in the playlist subfolder
            try {
                const playlistName = this.currentMetadata?.name || this.currentMetadata?.title || 'Playlist';
                const sanitizedPlaylistName = playlistName.replace(/[<>:"/\\|*?]/g, '_');
                const playlistFilename = `${sanitizedPlaylistName} - songs.txt`;
                
                const youtubeUrlsTextarea = document.getElementById('youtube-urls');
                const youtubeUrlsContent = youtubeUrlsTextarea ? youtubeUrlsTextarea.value : '';
                
                if (youtubeUrlsContent.trim()) {
                    const playlistFileHandle = await playlistDirHandle.getFileHandle(playlistFilename, { create: true });
                    const playlistWritable = await playlistFileHandle.createWritable();
                    await playlistWritable.write(youtubeUrlsContent);
                    await playlistWritable.close();
                    console.log(`Saved playlist file: ${playlistFilename}`);
                }
            } catch (error) {
                console.error('Failed to save playlist file:', error);
            }
            
            // Show success message
            if (errorCount === 0) {
                this.showStatus(`Successfully saved ${savedCount} files to the selected folder!`);
            } else {
                this.showStatus(`Saved ${savedCount} files, ${errorCount} failed. Check console for details.`);
            }
            
        } catch (error) {
            console.error('Error in downloadToFolder:', error);
            if (error.name === 'AbortError') {
                console.log('User cancelled folder selection');
                this.showStatus('Folder selection cancelled');
            } else {
                console.error('Download to folder failed:', error);
                this.showError(`Failed to save files: ${error.message}`);
            }
        } finally {
            downloadToFolderBtn.disabled = false;
            downloadToFolderBtn.textContent = originalText;
        }
    }

    // UI Helper Methods
    showError(message) {
        const errorEl = document.getElementById('url-error');
        errorEl.textContent = message;
        errorEl.style.display = 'block';
        
        // Clear status message
        document.getElementById('url-status').textContent = '';
    }

    showStatus(message) {
        const statusEl = document.getElementById('url-status');
        statusEl.textContent = message;
        statusEl.style.display = 'block';
        
        // Clear error message
        document.getElementById('url-error').textContent = '';
    }

    showAuthError(message) {
        const errorEl = document.getElementById('auth-status');
        errorEl.textContent = message;
        errorEl.className = 'error-message';
    }

    setLoading(buttonId, isLoading) {
        const button = document.getElementById(buttonId);
        if (isLoading) {
            button.disabled = true;
            button.innerHTML = '<span class="loading"></span> Processing...';
        } else {
            button.disabled = false;
            button.innerHTML = button.dataset.originalText || 'Analyze';
        }
    }

    showSection(sectionId) {
        // Hide all top-level sections and main-content
        document.getElementById('url-input-section').classList.add('hidden');
        document.getElementById('auth-section').classList.add('hidden');
        document.getElementById('main-content').classList.add('hidden');
        document.getElementById('download-section').classList.add('hidden');
        document.getElementById('results-section').classList.add('hidden');
        
        // Show the requested section
        document.getElementById(sectionId).classList.remove('hidden');
    }

    showAuthSection(reason = null) {
        this.showSection('auth-section');
        
        // Update the auth message if a reason is provided
        if (reason) {
            const authMessage = document.getElementById('auth-message');
            if (authMessage) {
                authMessage.textContent = reason;
            }
        }
    }

    hideAuthSection() {
        document.getElementById('auth-section').classList.add('hidden');
    }

    showTracksSection(tracks, metadata) {
        const tracksInfo = document.getElementById('tracks-info');
        const tracksList = document.getElementById('tracks-list');
        
        // Initialize downloadedTracks array to track which tracks have been downloaded
        this.downloadedTracks = new Set();
        
        // Initialize downloadedBlobs map to store downloaded track data
        this.downloadedBlobs = new Map();
        
        // Store metadata for later use in zip filename
        this.currentMetadata = metadata;
        
        // Initialize search status tracking
        this.searchCompleted = false;
        this.tracksSearchStatus = new Map();
        
        // Initialize all tracks as needing search (except YouTube tracks that already have URLs)
        tracks.forEach((track, index) => {
            const hasUrl = track.url && track.url.trim() !== '';
            this.tracksSearchStatus.set(index, hasUrl ? 'found' : 'queued-search');
        });
        
        // Check if all searches are already complete (for YouTube playlists)
        this.checkSearchCompletion();
        
        // Update download button state immediately
        this.updateDownloadAllButton();
        this.updateDownloadToFolderButton();
        
        // Initial display - will be updated by updateTracksInfo
        this.updateTracksInfo();
        
        tracksList.innerHTML = tracks.map((track, index) => {
            // Check if track already has a URL (YouTube tracks)
            const hasUrl = track.url && track.url.trim() !== '';
            const statusText = hasUrl ? 'Found' : 'Queued for search';
            const statusClass = hasUrl ? 'found' : 'queued-search';
            const buttonDisabled = hasUrl ? '' : 'disabled';
            
            // Get the best quality image/thumbnail
            let imageUrl = null;
            if (track.images && track.images.length > 0) {
                // For Spotify tracks, use the medium size image (300x300)
                const preferredImage = track.images.find(img => img.width === 300) || track.images[0];
                imageUrl = preferredImage.url;
                console.log(`Track ${index}: Using Spotify image:`, imageUrl);
            } else if (track.thumbnail) {
                // For YouTube tracks, use the thumbnail
                imageUrl = track.thumbnail;
                console.log(`Track ${index}: Using YouTube thumbnail:`, imageUrl);
            } else {
                console.log(`Track ${index}: No image or thumbnail available`, track);
            }
            
            const imageHtml = imageUrl ? 
                `<div class="track-artwork">
                    <img src="${imageUrl}" alt="${track.title}" class="track-image ${track.thumbnail ? 'youtube-thumbnail' : 'spotify-artwork'}" 
                         style="display:none;" 
                         data-track-index="${index}" 
                         onerror="console.error('Image failed to load:', this.src); this.style.display='none'; this.nextElementSibling.style.display='flex';" />
                    <div class="track-image-placeholder ${track.thumbnail ? 'youtube-thumbnail' : 'spotify-artwork'}" style="display:flex;">🎵</div>
                </div>` : 
                `<div class="track-artwork">
                    <div class="track-image-placeholder ${track.thumbnail ? 'youtube-thumbnail' : 'spotify-artwork'}">🎵</div>
                </div>`;
            
            return `
                <div class="track-item" data-track-id="${index}">
                    ${imageHtml}
                    <div class="track-info">
                        <div class="track-title">${track.title || 'Unknown Title'}</div>
                        <div class="track-artist">${track.artist || 'Unknown Artist'}</div>
                    </div>
                    <div class="track-actions">
                        <div class="track-status ${statusClass}">${statusText}</div>
                        <button class="track-download-btn" data-track-id="${index}" ${buttonDisabled}>Download</button>
                        <button class="track-save-btn hidden" data-track-id="${index}">Save</button>
                    </div>
                </div>
            `;
        }).join('');
        
        // Add event listeners for download and save buttons
        tracksList.addEventListener('click', (e) => {
            if (e.target.classList.contains('track-download-btn')) {
                const trackId = e.target.dataset.trackId;
                this.downloadSingleTrack(trackId);
            } else if (e.target.classList.contains('track-save-btn')) {
                const trackId = e.target.dataset.trackId;
                this.saveSingleTrack(trackId);
            }
        });
        
        // Add event listeners for image loading
        const images = tracksList.querySelectorAll('.track-image');
        images.forEach(img => {
            img.addEventListener('load', () => {
                console.log('Image loaded:', img.src);
                img.style.display = 'block';
                const placeholder = img.nextElementSibling;
                if (placeholder) {
                    placeholder.style.display = 'none';
                }
            });
            
            img.addEventListener('error', () => {
                console.log('Image failed to load:', img.src);
                img.style.display = 'none';
                const placeholder = img.nextElementSibling;
                if (placeholder) {
                    placeholder.style.display = 'flex';
                }
            });
        });
        
        // Show main content container and enable the search button
        const mainContent = document.getElementById('main-content');
        mainContent.classList.remove('hidden');
        
        const searchButton = document.getElementById('search-youtube-btn');
        searchButton.disabled = false;
        
        // Generate YouTube URLs text
        this.generateYouTubeUrls(tracks, metadata);
        
        // Hide other sections to show only the main content
        document.getElementById('url-input-section').classList.add('hidden');
        document.getElementById('auth-section').classList.add('hidden');
    }

    showDownloadSection() {
        this.showSection('download-section');
        
        // Initialize progress display
        const progressDiv = document.getElementById('download-progress');
        progressDiv.innerHTML = `
            <div class="progress-bar">
                <div class="progress-fill" style="width: 0%"></div>
            </div>
            <div class="progress-text">0% - Starting download...</div>
        `;
    }

    updateDownloadProgress(data) {
        const progressFill = document.querySelector('.progress-fill');
        const progressText = document.querySelector('.progress-text');
        
        if (progressFill) {
            progressFill.style.width = `${data.progress}%`;
        }
        
        if (progressText) {
            progressText.textContent = `${data.progress}% - ${data.status}`;
        }
    }

    handleTrackComplete(data) {
        this.updateTrackStatus(data.trackId, 'completed', 'Completed');
    }

    handleTrackError(data) {
        this.updateTrackStatus(data.trackId, 'error', 'Error');
    }

    handleBatchComplete(data) {
        // Redirect to results page
        window.location.href = `/api/download/results/${data.downloadId}`;
    }

    // Helper method to update track status
    updateTrackStatus(trackIndex, statusClass, statusText) {
        const trackEl = document.querySelector(`[data-track-id="${trackIndex}"]`);
        if (trackEl) {
            const statusEl = trackEl.querySelector('.track-status');
            const downloadBtn = trackEl.querySelector('.track-download-btn');
            const saveBtn = trackEl.querySelector('.track-save-btn');
            
            statusEl.textContent = statusText;
            statusEl.className = `track-status ${statusClass}`;

            // Handle different status states
            switch (statusClass) {
                case 'queued-search':
                    downloadBtn.disabled = true;
                    saveBtn.classList.add('hidden');
                    // Update search status tracking
                    this.tracksSearchStatus.set(parseInt(trackIndex), 'queued-search');
                    this.checkSearchCompletion();
                    break;
                case 'searching':
                    downloadBtn.disabled = true;
                    saveBtn.classList.add('hidden');
                    // Update search status tracking
                    this.tracksSearchStatus.set(parseInt(trackIndex), 'searching');
                    this.checkSearchCompletion();
                    break;
                case 'found':
                    downloadBtn.disabled = false;
                    saveBtn.classList.add('hidden');
                    // Update search status tracking
                    this.tracksSearchStatus.set(parseInt(trackIndex), 'found');
                    this.checkSearchCompletion();
                    break;
                case 'queued-download':
                    downloadBtn.disabled = true;
                    saveBtn.classList.add('hidden');
                    break;
                case 'downloading':
                    downloadBtn.disabled = true;
                    downloadBtn.textContent = 'Downloading...';
                    saveBtn.classList.add('hidden');
                    statusEl.textContent = 'Downloading...';
                    break;
                case 'downloaded':
                    downloadBtn.classList.add('hidden');
                    saveBtn.classList.remove('hidden');
                    break;
                case 'saved':
                    downloadBtn.classList.add('hidden');
                    saveBtn.disabled = true;
                    saveBtn.textContent = 'Saved';
                    break;
                case 'not-found':
                case 'error':
                    downloadBtn.disabled = true;
                    saveBtn.classList.add('hidden');
                    // Update search status tracking
                    this.tracksSearchStatus.set(parseInt(trackIndex), statusClass);
                    this.checkSearchCompletion();
                    break;
                case 'completed':
                    downloadBtn.classList.remove('hidden');
                    downloadBtn.disabled = false;
                    break;
                default:
                    // For backwards compatibility
                    if (statusClass === 'found') {
                        downloadBtn.disabled = false;
                    }
                    break;
            }
        }
    }

    updateTrackThumbnail(trackIndex, thumbnailUrl) {
        const trackEl = document.querySelector(`[data-track-id="${trackIndex}"]`);
        if (trackEl && thumbnailUrl) {
            const trackArtwork = trackEl.querySelector('.track-artwork');
            if (trackArtwork) {
                // Check if track already has Spotify artwork - if so, don't replace it
                const existingImg = trackArtwork.querySelector('.track-image');
                if (existingImg && existingImg.classList.contains('spotify-artwork')) {
                    console.log(`Track ${trackIndex}: Preserving Spotify artwork over YouTube thumbnail`);
                    return; // Don't replace Spotify artwork with YouTube thumbnail
                }
                
                // Only update if there's no existing image or if it's a YouTube thumbnail
                if (!existingImg || existingImg.classList.contains('youtube-thumbnail')) {
                    // Update the artwork with the new thumbnail
                    trackArtwork.innerHTML = `
                        <img src="${thumbnailUrl}" alt="Track thumbnail" class="track-image youtube-thumbnail" 
                             style="display:none;" 
                             data-track-index="${trackIndex}" 
                             onerror="console.error('Image failed to load:', this.src); this.style.display='none'; this.nextElementSibling.style.display='flex';" />
                        <div class="track-image-placeholder youtube-thumbnail" style="display:flex;">🎵</div>
                    `;
                    
                    // Add event listeners for the new image
                    const img = trackArtwork.querySelector('.track-image');
                    if (img) {
                        img.addEventListener('load', () => {
                            console.log('Thumbnail loaded:', img.src);
                            img.style.display = 'block';
                            const placeholder = img.nextElementSibling;
                            if (placeholder) {
                                placeholder.style.display = 'none';
                            }
                        });
                        
                        img.addEventListener('error', () => {
                            console.log('Thumbnail failed to load:', img.src);
                            img.style.display = 'none';
                            const placeholder = img.nextElementSibling;
                            if (placeholder) {
                                placeholder.style.display = 'flex';
                            }
                        });
                    }
                }
            }
        }
    }

    async generateYouTubeUrls(tracks, metadata) {
        const youtubeUrlsTextarea = document.getElementById('youtube-urls');
        
        // Create header similar to PowerShell version
        const header = `# ${metadata.name || metadata.title || 'Playlist'}
# Total tracks: ${tracks.length}
# Generated: ${new Date().toLocaleString()}

`;
        
        // Store header for toggle functionality
        this.currentHeader = header;
        this.rawUrlData = [];
        
        // Generate formatted track list based on platform
        if (metadata.platform === 'youtube') {
            // For YouTube, use direct URLs with track numbers
            tracks.forEach((track, index) => {
                const trackNumber = String(index + 1).padStart(2, '0');
                const trackTitle = `${trackNumber}. ${track.artist} - ${track.title}`;
                const url = track.url || '# URL not found';
                this.rawUrlData.push(trackTitle, url);
            });
            
            // Update textarea based on checkbox state
            this.toggleTrackInfo();
        } else {
            // For Spotify, automatically search for YouTube URLs with staggered queue initialization
            await this.performRealTimeVideoSearch(tracks, header);
        }
    }
    
    saveUrlsToFile() {
        const youtubeUrlsTextarea = document.getElementById('youtube-urls');
        const content = youtubeUrlsTextarea.value;
        
        if (!content.trim()) {
            alert('No URLs to save!');
            return;
        }
        
        // Create a blob with the content
        const blob = new Blob([content], { type: 'text/plain' });
        
        // Create a download link
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        
        // Generate filename based on current date
        const now = new Date();
        const filename = `youtube_urls_${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}.txt`;
        
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        
        // Clean up
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        
        // Show success message
        this.showStatus(`URLs saved to ${filename}`);
    }
    
    async copyUrlsToClipboard() {
        const youtubeUrlsTextarea = document.getElementById('youtube-urls');
        const content = youtubeUrlsTextarea.value;
        
        if (!content.trim()) {
            alert('No URLs to copy!');
            return;
        }
        
        try {
            await navigator.clipboard.writeText(content);
            this.showStatus('URLs copied to clipboard!');
        } catch (error) {
            // Fallback for older browsers
            youtubeUrlsTextarea.select();
            youtubeUrlsTextarea.setSelectionRange(0, 99999);
            document.execCommand('copy');
            this.showStatus('URLs copied to clipboard!');
        }
    }
    
    async performYouTubeSearch(tracks) {
        const response = await fetch('/api/search/video-urls', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ tracks: tracks }),
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Search failed');
        }
        
        return data.results;
    }
    
async performRealTimeVideoSearch(tracks, header) {
        const youtubeUrlsTextarea = document.getElementById('youtube-urls');
        const searchButton = document.getElementById('search-youtube-btn');
        const progressDiv = document.getElementById('search-progress');
        
        // Setup initial state
        youtubeUrlsTextarea.value = header + 'Searching for Video URLs...';
        youtubeUrlsTextarea.readOnly = true;
        searchButton.disabled = true;
        searchButton.textContent = 'Searching...';
        progressDiv.classList.remove('hidden');
        progressDiv.innerHTML = 'Starting YouTube search...\n';
        
        const results = [];
        let found = 0;
        let failed = 0;
        
        // Store header and initialize raw data
        this.currentHeader = header;
        this.rawUrlData = [];
        
        try {
            // Use staggered concurrent search based on max concurrent downloads setting
            const maxConcurrent = this.maxConcurrentDownloads;
            progressDiv.innerHTML = `Searching ${tracks.length} tracks (max ${maxConcurrent} concurrent, 1 new search per second)...\n`;
            
            const result = await this.performStaggeredConcurrentSearch(tracks, progressDiv, maxConcurrent);
            found = result.found;
            failed = result.failed;
            
            // Final summary
            progressDiv.innerHTML += `\nSearch completed!\n`;
            progressDiv.innerHTML += `Found: ${found}/${tracks.length} tracks\n`;
            progressDiv.innerHTML += `Failed: ${failed}/${tracks.length} tracks`;
            
        } catch (error) {
            console.error('Real-time YouTube search failed:', error);
            progressDiv.innerHTML += `\nError: ${error.message}`;
            
            // Fallback to search format
            const fallbackUrls = tracks.map((track, index) => {
                const searchQuery = `${track.artist} ${track.title}`.replace(/["']/g, '');
                // Update all tracks to error status
                this.updateTrackStatus(index, 'error', 'Error');
                return `ytsearch:"${searchQuery}"`;
            });
            
            youtubeUrlsTextarea.value = header + fallbackUrls.join('\n');
        } finally {
            // Re-enable controls
            youtubeUrlsTextarea.readOnly = false;
            searchButton.disabled = false;
            searchButton.textContent = 'Re-search YouTube URLs';
        }
    }
    
    async performSequentialSearch(tracks, progressDiv) {
        let found = 0;
        let failed = 0;
        
        // Search for each track individually to show real-time updates
        for (let i = 0; i < tracks.length; i++) {
            const track = tracks[i];
            const query = `${track.artist} ${track.title}`.trim();
            
            // Update track status to "Searching..."
            this.updateTrackStatus(i, 'searching', 'Searching...');
            
            // Update progress
            progressDiv.innerHTML += `Searching ${i + 1}/${tracks.length}: ${query}\n`;
            
            try {
                // Search for individual track using concurrent queue-based search
                const response = await fetch('/api/search/youtube-urls', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ tracks: [track], concurrent: true }),
                });
                
                const data = await response.json();
                
                if (response.ok && data.results && data.results.length > 0) {
                    const result = data.results[0];
                    const trackNumber = String(i + 1).padStart(2, '0');
                    const trackTitle = `${trackNumber}. ${track.artist} - ${track.title}`;
                    
                    if (result.found && result.url) {
                        found++;
                        progressDiv.innerHTML += `✓ Found: ${result.url}\n`;
                        // Update track status to "Found"
                        this.updateTrackStatus(i, 'found', 'Found');
                        // Update the track object with the found URL and thumbnail
                        this.currentTracks[i].url = result.url;
                        if (result.thumbnail) {
                            this.currentTracks[i].thumbnail = result.thumbnail;
                            this.updateTrackThumbnail(i, result.thumbnail);
                        }
                    } else {
                        failed++;
                        progressDiv.innerHTML += `✗ Not found: ${query}\n`;
                        // Update track status to "Not Found"
                        this.updateTrackStatus(i, 'not-found', 'Not Found');
                    }
                } else {
                    failed++;
                    progressDiv.innerHTML += `✗ Search failed: ${query}\n`;
                    // Update track status to "Not Found"
                    this.updateTrackStatus(i, 'not-found', 'Not Found');
                }
            } catch (error) {
                console.error(`Search failed for track ${i}:`, error);
                failed++;
                progressDiv.innerHTML += `✗ Error: ${query} - ${error.message}\n`;
                // Update track status to "Error"
                this.updateTrackStatus(i, 'error', 'Error');
            }
            
            // Rebuild the entire URLs list to maintain correct order
            this.rebuildUrlsList();
            
            // Scroll to bottom of textarea
            const youtubeUrlsTextarea = document.getElementById('youtube-urls');
            youtubeUrlsTextarea.scrollTop = youtubeUrlsTextarea.scrollHeight;
        }
        
        return { found, failed };
    }
    
    async performStaggeredConcurrentSearch(tracks, progressDiv, maxConcurrency = 5) {
        let found = 0;
        let failed = 0;
        
        // Initialize all tracks as queued for search
        tracks.forEach((track, index) => {
            this.updateTrackStatus(index, 'queued-search', 'Queued for search');
        });
        
        progressDiv.innerHTML += `\nStarting staggered concurrent search with up to ${maxConcurrency} simultaneous searches...\n`;
        
        const results = [];
        const activeSearches = new Set();
        const scheduledSearches = new Set();
        let currentIndex = 0;
        
        const startNextSearch = async () => {
            if (currentIndex >= tracks.length) {
                return null;
            }
            
            const trackIndex = currentIndex;
            const track = tracks[trackIndex];
            currentIndex++;
            
            // Update status to searching
            this.updateTrackStatus(trackIndex, 'searching', 'Searching...');
            
            const searchPromise = this.performSingleTrackSearch(track, trackIndex)
                .then(result => {
                    activeSearches.delete(searchPromise);
                    
                    // Update track status immediately based on result
                    if (result.success && result.found && result.url) {
                        this.updateTrackStatus(trackIndex, 'found', 'Found');
                        found++;
                        
                        // Update the track object with the found URL and thumbnail
                        this.currentTracks[trackIndex].url = result.url;
                        if (result.thumbnail) {
                            this.currentTracks[trackIndex].thumbnail = result.thumbnail;
                            this.updateTrackThumbnail(trackIndex, result.thumbnail);
                        }
                    } else {
                        this.updateTrackStatus(trackIndex, result.error ? 'error' : 'not-found', result.error ? 'Error' : 'Not Found');
                        failed++;
                    }
                    
                    // Always rebuild the entire URLs list to maintain correct order
                    this.rebuildUrlsList();
                    
                    // Scroll to bottom of textarea
                    const youtubeUrlsTextarea = document.getElementById('youtube-urls');
                    youtubeUrlsTextarea.scrollTop = youtubeUrlsTextarea.scrollHeight;
                    
                    return result;
                })
                .catch(error => {
                    activeSearches.delete(searchPromise);
                    this.updateTrackStatus(trackIndex, 'error', 'Error');
                    failed++;
                    
                    // Always rebuild the entire URLs list to maintain correct order
                    this.rebuildUrlsList();
                    
                    return { trackIndex, success: false, error };
                });
            
            activeSearches.add(searchPromise);
            results.push(searchPromise);
            
            return searchPromise;
        };
        
        // Start initial searches up to maxConcurrency with 1-second staggering
        for (let i = 0; i < Math.min(maxConcurrency, tracks.length); i++) {
            const timeoutId = setTimeout(async () => {
                scheduledSearches.delete(timeoutId);
                await startNextSearch();
            }, i * 1000); // 1 second delay between each search
            scheduledSearches.add(timeoutId);
        }
        
        // Wait for initial searches to start
        await new Promise(resolve => setTimeout(resolve, Math.min(maxConcurrency, tracks.length) * 1000));
        
        // Continue processing remaining searches with dynamic concurrency management
        while (currentIndex < tracks.length || activeSearches.size > 0) {
            // Get current concurrency limit (this allows for dynamic updates)
            const currentMaxConcurrency = this.maxConcurrentDownloads; // Use same setting as downloads
            
            // Fill up available slots with new searches up to current limit
            while (currentIndex < tracks.length && (activeSearches.size + scheduledSearches.size) < currentMaxConcurrency) {
                const timeoutId = setTimeout(async () => {
                    scheduledSearches.delete(timeoutId);
                    await startNextSearch();
                }, 1000); // 1 second delay for each new search
                scheduledSearches.add(timeoutId);
            }
            
            // If current concurrency exceeds the new limit, cancel scheduled searches
            if ((activeSearches.size + scheduledSearches.size) > currentMaxConcurrency) {
                const excessCount = (activeSearches.size + scheduledSearches.size) - currentMaxConcurrency;
                const scheduledArray = Array.from(scheduledSearches);
                for (let i = 0; i < Math.min(excessCount, scheduledArray.length); i++) {
                    clearTimeout(scheduledArray[i]);
                    scheduledSearches.delete(scheduledArray[i]);
                }
            }
            
            // Wait for at least one search to complete if we have active searches
            if (activeSearches.size > 0) {
                await Promise.race(Array.from(activeSearches));
            } else {
                // No active searches, wait a bit before checking again
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }
        
        // Wait for all searches to complete
        await Promise.all(results);
        
        // Final rebuild of the URLs list
        this.rebuildUrlsList();
        
        // Scroll to bottom of textarea
        const youtubeUrlsTextarea = document.getElementById('youtube-urls');
        youtubeUrlsTextarea.scrollTop = youtubeUrlsTextarea.scrollHeight;
        
        return { found, failed };
    }
    
    async performBatchedSearch(tracks, progressDiv, concurrency = 5) {
        let found = 0;
        let failed = 0;
        
        // Initialize all tracks as queued for search
        tracks.forEach((track, index) => {
            this.updateTrackStatus(index, 'queued-search', 'Queued for search');
        });
        
        progressDiv.innerHTML += `\nStarting queue-based search with up to ${concurrency} simultaneous searches...\n`;
        
        // Implement client-side queue management that mirrors the download logic
        const results = [];
        const activeSearches = new Map(); // Use Map to track promise -> trackIndex
        let currentIndex = 0;
        
        const startNextSearch = async () => {
            if (currentIndex >= tracks.length) {
                return null;
            }
            
            const trackIndex = currentIndex;
            const track = tracks[trackIndex];
            currentIndex++;
            
            // Update status to searching
            this.updateTrackStatus(trackIndex, 'searching', 'Searching...');
            
            const searchPromise = this.performSingleTrackSearch(track, trackIndex)
                .then(result => {
                    activeSearches.delete(searchPromise);
                    
                    // Update track status immediately based on result
                    if (result.success && result.found && result.url) {
                        this.updateTrackStatus(trackIndex, 'found', 'Found');
                        found++;
                        
                        // Update the track object with the found URL and thumbnail
                        this.currentTracks[trackIndex].url = result.url;
                        if (result.thumbnail) {
                            this.currentTracks[trackIndex].thumbnail = result.thumbnail;
                            this.updateTrackThumbnail(trackIndex, result.thumbnail);
                        }
                    } else {
                        this.updateTrackStatus(trackIndex, result.error ? 'error' : 'not-found', result.error ? 'Error' : 'Not Found');
                        failed++;
                    }
                    
                    // Always rebuild the entire URLs list to maintain correct order
                    this.rebuildUrlsList();
                    
                    // Scroll to bottom of textarea
                    const youtubeUrlsTextarea = document.getElementById('youtube-urls');
                    youtubeUrlsTextarea.scrollTop = youtubeUrlsTextarea.scrollHeight;
                    
                    return result;
                })
                .catch(error => {
                    activeSearches.delete(searchPromise);
                    this.updateTrackStatus(trackIndex, 'error', 'Error');
                    failed++;
                    
                    // Always rebuild the entire URLs list to maintain correct order
                    this.rebuildUrlsList();
                    
                    return { trackIndex, success: false, error };
                });
            
            activeSearches.set(searchPromise, trackIndex);
            results.push(searchPromise);
            
            return searchPromise;
        };
        
        // Start searches with proper staggering - start with 1, then add more gradually
        let searchesStarted = 0;
        const maxSearches = Math.min(concurrency, tracks.length);
        
        // Start first search immediately
        if (searchesStarted < maxSearches && currentIndex < tracks.length) {
            startNextSearch();
            searchesStarted++;
        }
        
        // Add additional searches with 1-second delays
        const staggerInterval = setInterval(() => {
            if (searchesStarted < maxSearches && currentIndex < tracks.length) {
                startNextSearch();
                searchesStarted++;
            } else {
                clearInterval(staggerInterval);
            }
        }, 1000); // 1 second delay between new searches
        
        // Process remaining searches as active ones complete
        while (currentIndex < tracks.length || activeSearches.size > 0) {
            // Only fill available slots if we've finished the staggered initialization
            if (searchesStarted >= maxSearches) {
                // Fill up available slots with new searches
                while (currentIndex < tracks.length && activeSearches.size < concurrency) {
                    startNextSearch(); // Don't await here, let them run concurrently
                }
            }
            
            // Wait for at least one search to complete
            if (activeSearches.size > 0) {
                await Promise.race(Array.from(activeSearches.keys()));
            } else if (currentIndex >= tracks.length) {
                // No more searches to start and none active
                break;
            }
        }
        
        // Wait for all searches to complete
        await Promise.all(results);
        
        // Final rebuild of the URLs list
        this.rebuildUrlsList();
        
        // Scroll to bottom of textarea
        const youtubeUrlsTextarea = document.getElementById('youtube-urls');
        youtubeUrlsTextarea.scrollTop = youtubeUrlsTextarea.scrollHeight;
        
        return { found, failed };
    }
    
    async performSingleTrackSearch(track, trackIndex) {
        const query = `${track.artist} ${track.title}`.trim();
        const progressDiv = document.getElementById('search-progress');
        
        try {
            // Update progress
            progressDiv.innerHTML += `Searching ${trackIndex + 1}: ${query}\n`;
            
            // Search for individual track
            const response = await fetch('/api/search/youtube-urls', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ tracks: [track], concurrent: true }),
            });
            
            const data = await response.json();
            
            if (response.ok && data.results && data.results.length > 0) {
                const result = data.results[0];
                
                if (result.found && result.url) {
                    progressDiv.innerHTML += `✓ Found: ${result.url}\n`;
                    
                    // Update the track object with the found URL and thumbnail
                    this.currentTracks[trackIndex].url = result.url;
                    if (result.thumbnail) {
                        this.currentTracks[trackIndex].thumbnail = result.thumbnail;
                        this.updateTrackThumbnail(trackIndex, result.thumbnail);
                    }
                    
                    return { 
                        trackIndex, 
                        success: true, 
                        found: true, 
                        url: result.url, 
                        thumbnail: result.thumbnail 
                    };
                } else {
                    progressDiv.innerHTML += `✗ Not found: ${query}\n`;
                    
                    return { 
                        trackIndex, 
                        success: true, 
                        found: false 
                    };
                }
            } else {
                progressDiv.innerHTML += `✗ Search failed: ${query}\n`;
                return { 
                    trackIndex, 
                    success: false, 
                    error: new Error('Search API failed') 
                };
            }
        } catch (error) {
            console.error(`Search failed for track ${trackIndex}:`, error);
            progressDiv.innerHTML += `✗ Error: ${query} - ${error.message}\n`;
            return { 
                trackIndex, 
                success: false, 
                error 
            };
        }
    }
    
async searchVideoUrls() {
        if (!this.currentTracks || this.currentTracks.length === 0) {
            alert('No tracks to search for!');
            return;
        }
        
        const searchButton = document.getElementById('search-youtube-btn');
        const progressDiv = document.getElementById('search-progress');
        const youtubeUrlsTextarea = document.getElementById('youtube-urls');
        
        // Reset all track statuses to pending
        this.currentTracks.forEach((track, index) => {
            this.updateTrackStatus(index, 'pending', 'Pending');
        });
        
        // Show progress and disable button
        progressDiv.classList.remove('hidden');
        searchButton.disabled = true;
        searchButton.textContent = 'Searching...';
        
        progressDiv.innerHTML = 'Starting YouTube search...\n';
        
        try {
            const searchResults = await this.performYouTubeSearch(this.currentTracks);
            
            // Update track statuses based on results
            searchResults.forEach((result, index) => {
                if (result.found) {
                    this.updateTrackStatus(index, 'found', 'Found');
                } else {
                    this.updateTrackStatus(index, 'not-found', 'Not Found');
                }
            });
            
            // Update textarea with found URLs
            const header = youtubeUrlsTextarea.value.split('\n').slice(0, 4).join('\n') + '\n';
            const urls = searchResults.map(result => result.url || `# Not found: ${result.track.artist} - ${result.track.title}`);
            
            youtubeUrlsTextarea.value = header + urls.join('\n');
            
            // Update progress
            progressDiv.innerHTML += `\nSearch completed!\n`;
            progressDiv.innerHTML += `Found: ${searchResults.filter(r => r.found).length}/${searchResults.length} tracks\n`;
            progressDiv.innerHTML += `Failed: ${searchResults.filter(r => !r.found).length}/${searchResults.length} tracks`;
            
        } catch (error) {
            // Update all tracks to error status
            this.currentTracks.forEach((track, index) => {
                this.updateTrackStatus(index, 'error', 'Error');
            });
            
            progressDiv.innerHTML += `\nError: ${error.message}`;
            this.showError(error.message);
        } finally {
            searchButton.disabled = false;
            searchButton.textContent = 'Re-search YouTube URLs';
        }
    }

    updateTracksInfo() {
        const tracksInfo = document.getElementById('tracks-info');
        if (!tracksInfo || !this.currentTracks || this.currentTracks.length === 0) {
            return;
        }
        
        const totalTracks = this.currentTracks.length;
        const foundCount = Array.from(this.tracksSearchStatus.values()).filter(status => status === 'found').length;
        
        tracksInfo.innerHTML = `
            <p><strong>Found ${foundCount}/${totalTracks} tracks</strong></p>
        `;
    }
    
    rebuildUrlsList() {
        if (!this.currentTracks || this.currentTracks.length === 0) {
            return;
        }
        
        // Rebuild rawUrlData from scratch in the correct order
        this.rawUrlData = [];
        
        this.currentTracks.forEach((track, index) => {
            const trackNumber = String(index + 1).padStart(2, '0');
            const trackTitle = `${trackNumber}. ${track.artist} - ${track.title}`;
            
            // Check if this track has been found
            if (track.url && track.url.trim() !== '') {
                this.rawUrlData.push(trackTitle, track.url);
            } else {
                // Check the search status to determine what to show
                const status = this.tracksSearchStatus.get(index);
                if (status === 'searching' || status === 'queued-search') {
                    this.rawUrlData.push(trackTitle, '# Searching...');
                } else if (status === 'error') {
                    this.rawUrlData.push(trackTitle, '# Error');
                } else {
                    this.rawUrlData.push(trackTitle, '# Not found');
                }
            }
        });
        
        // Update the textarea with current results based on checkbox state
        this.toggleTrackInfo();
    }
    
    checkSearchCompletion() {
        if (!this.currentTracks || this.currentTracks.length === 0) {
            this.searchCompleted = false;
            return;
        }
        
        // Check if all tracks have completed searching (found, not-found, or error)
        // Tracks that are 'queued-search' or 'searching' should prevent completion
        const completedStatuses = ['found', 'not-found', 'error'];
        const activeSearchStatuses = ['queued-search', 'searching'];
        let allComplete = true;
        
        for (let i = 0; i < this.currentTracks.length; i++) {
            const status = this.tracksSearchStatus.get(i);
            if (!status || !completedStatuses.includes(status)) {
                allComplete = false;
                break;
            }
            // Additional check: if any track is actively searching, not complete
            if (activeSearchStatuses.includes(status)) {
                allComplete = false;
                break;
            }
        }
        
        const wasCompleted = this.searchCompleted;
        this.searchCompleted = allComplete;
        
            // Update download button if completion status changed
            if (wasCompleted !== this.searchCompleted) {
                this.updateDownloadAllButton();
                this.updateDownloadToFolderButton();
                
            // Show status message when search completes
            if (this.searchCompleted) {
                const foundCount = Array.from(this.tracksSearchStatus.values()).filter(status => status === 'found').length;
                const totalCount = this.currentTracks.length;
                this.showStatus(`Search completed! Found ${foundCount}/${totalCount} tracks. You can now download.`);
            }
            
            // Update the live tracks count display
            this.updateTracksInfo();
        }
    }
    
    updateAuthUI(isAuthenticated) {
        // This method can be used to update UI elements based on authentication state
        // For example, show/hide authentication status, update button text, etc.
        const authButton = document.getElementById('spotify-auth-btn');
        const authStatus = document.getElementById('auth-status');
        
        if (isAuthenticated) {
            if (authButton) {
                authButton.textContent = 'Spotify Connected ✓';
                authButton.disabled = true;
                authButton.style.backgroundColor = '#1db954';
            }
            if (authStatus) {
                authStatus.textContent = 'Spotify authentication active';
                authStatus.className = 'status-message';
            }
        } else {
            if (authButton) {
                authButton.textContent = 'Connect to Spotify';
                authButton.disabled = false;
                authButton.style.backgroundColor = '';
            }
            if (authStatus) {
                authStatus.textContent = '';
                authStatus.className = '';
            }
        }
    }

    async restart() {
        // Clean up any downloaded files from this session
        try {
            await fetch('/api/download/cleanup', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
            });
            console.log('Session files cleaned up');
        } catch (error) {
            console.error('Failed to cleanup session files:', error);
        }
        
        // Reset state
        this.currentUrl = '';
        this.currentTracks = [];
        this.currentDownloadId = null;
        this.currentMetadata = null;
        
        // Reset download state
        this.downloadedTracks = new Set();
        this.downloadedBlobs = new Map();
        
        // Reset search completion tracking
        this.searchCompleted = false;
        this.tracksSearchStatus = new Map();
        
        // Clear form
        document.getElementById('url-input').value = '';
        document.getElementById('url-error').textContent = '';
        document.getElementById('url-status').textContent = '';
        
        // Clear tracks section
        document.getElementById('tracks-info').innerHTML = '';
        document.getElementById('tracks-list').innerHTML = '';
        
        // Clear YouTube URLs and hide the main content container
        document.getElementById('youtube-urls').value = '';
        const mainContent = document.getElementById('main-content');
        mainContent.classList.add('hidden');
        
        // Reset download button
        const downloadButton = document.getElementById('download-btn');
        downloadButton.textContent = 'Download All Tracks';
        downloadButton.disabled = false;
        
        // Disable search button until new tracks are loaded
        const searchButton = document.getElementById('search-youtube-btn');
        searchButton.disabled = true;
        searchButton.textContent = 'Re-search YouTube URLs';
        
        // Hide search progress
        document.getElementById('search-progress').classList.add('hidden');
        
        // Show initial section
        this.showSection('url-input-section');
    }
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new PlaylistifierApp();
});
