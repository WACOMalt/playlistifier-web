// Playlistifier Web Frontend Application
class PlaylistifierApp {
    constructor() {
        this.socket = null;
        this.currentDownloadId = null;
        this.currentUrl = '';
        this.currentTracks = [];
        this.authToken = null;
        
        this.initializeApp();
    }

    initializeApp() {
        this.setupEventListeners();
        this.setupWebSocket();
        this.checkAuthStatus();
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
        document.getElementById('download-btn').addEventListener('click', () => this.startDownload());
        document.getElementById('cancel-btn').addEventListener('click', () => this.cancelDownload());

        // Navigation
        document.getElementById('restart-btn').addEventListener('click', () => this.restart());
        document.getElementById('new-download-btn').addEventListener('click', () => this.restart());
        
        // YouTube URLs functionality
        document.getElementById('search-youtube-btn').addEventListener('click', () => this.searchVideoUrls());
        document.getElementById('save-urls-btn').addEventListener('click', () => this.saveUrlsToFile());
        document.getElementById('copy-urls-btn').addEventListener('click', () => this.copyUrlsToClipboard());
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
                const progressBar = trackEl.querySelector('.progress-bar');
                const progressText = trackEl.querySelector('.progress-text');

                if (progressBar) {
                    progressBar.style.width = `${data.progress}%`;
                }

                if (progressText) {
                    progressText.textContent = `${data.progress}% - Downloading...`;
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
            
            // Check if authentication is required
            if (data.platform === 'spotify' && !this.authToken) {
                this.showAuthSection();
            } else {
                this.extractTracks();
            }

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

    async startDownload() {
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
        
        // Add all downloaded files to the zip
        console.log('Adding files to zip:');
        for (const [trackId, downloadData] of this.downloadedBlobs) {
            console.log(`- ${trackId}: ${downloadData.filename}`);
            console.log(`  Blob size: ${downloadData.blob.size} bytes`);
            zip.file(downloadData.filename, downloadData.blob);
        }
        console.log('All files added to zip');

        try {
            // Generate zip file
            console.log('Generating zip file...');
            const zipBlob = await zip.generateAsync({type: 'blob'});
            
            // Create filename from playlist/album title
            const playlistName = this.currentMetadata?.name || this.currentMetadata?.title || 'Playlist';
            // Clean filename by removing invalid characters
            const cleanName = playlistName.replace(/[\<\>:"/\\|?*]/g, '-');
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

        const track = this.currentTracks[trackId];
        const downloadButton = document.querySelector(`[data-track-id="${trackId}"] .track-download-btn`);
        const saveButton = document.querySelector(`[data-track-id="${trackId}"] .track-save-btn`);
        
        downloadButton.disabled = true;
        downloadButton.textContent = 'Downloading...';
        
        this.updateTrackStatus(trackId, 'downloading', 'Downloading...');

        try {
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
            
            this.downloadedBlobs.set(trackId, {
                blob: blob,
                filename: `${track.artist} - ${track.title}.mp3`,
                track: track
            });
            
            // Mark as downloaded and show save button
            this.downloadedTracks.add(trackId);
            this.updateTrackStatus(trackId, 'downloaded', 'Downloaded - Ready to save');
            downloadButton.classList.add('hidden');
            saveButton.classList.remove('hidden');
            
            // Update the download all button text
            this.updateDownloadAllButton();

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
        
        if (remainingCount > 0) {
            downloadAllBtn.textContent = `Save Remaining (${remainingCount})`;
        } else {
            downloadAllBtn.textContent = 'Save All as ZIP';
            downloadAllBtn.disabled = false; // Enable button to save zip
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

    showAuthSection() {
        this.showSection('auth-section');
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
        
        tracksInfo.innerHTML = `
            <p><strong>Found ${tracks.length} tracks</strong></p>
            <p>Platform: ${metadata.platform || 'Unknown'}</p>
            <p>Type: ${metadata.type || 'Unknown'}</p>
        `;
        
        tracksList.innerHTML = tracks.map((track, index) => {
            // Check if track already has a URL (YouTube tracks)
            const hasUrl = track.url && track.url.trim() !== '';
            const statusText = hasUrl ? 'Ready to download' : 'Searching for track...';
            const statusClass = hasUrl ? 'found' : 'pending';
            const buttonDisabled = hasUrl ? '' : 'disabled';
            
            return `
                <div class="track-item" data-track-id="${index}">
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
            statusEl.textContent = statusText;
            statusEl.className = `track-status ${statusClass}`;

            if (statusClass === 'downloading') {
                statusEl.innerHTML = `<div class="progress-bar" style="width: 0%"></div><span class="progress-text">Downloading...</span>`;
            } else if (statusClass === 'completed') {
                downloadBtn.classList.remove('hidden');
                downloadBtn.disabled = false;
            } else if (statusClass === 'found') {
                // Enable download button when track is found
                downloadBtn.disabled = false;
            } else if (statusClass === 'not-found' || statusClass === 'error') {
                // Keep download button disabled for not found or error tracks
                downloadBtn.disabled = true;
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
        
        // Generate URLs based on platform
        let urls = [];
        
        if (metadata.platform === 'youtube') {
            // For YouTube, use direct URLs
            urls = tracks.map(track => track.url).filter(url => url);
            const fullText = header + urls.join('\n');
            youtubeUrlsTextarea.value = fullText;
        } else {
            // For Spotify, automatically search for YouTube URLs with real-time updates
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
        
        try {
            // Search for each track individually to show real-time updates
            for (let i = 0; i < tracks.length; i++) {
                const track = tracks[i];
                const query = `${track.artist} ${track.title}`.trim();
                
                // Update track status to "Searching..."
                this.updateTrackStatus(i, 'searching', 'Searching...');
                
                // Update progress
                progressDiv.innerHTML = `Searching ${i + 1}/${tracks.length}: ${query}\n`;
                
                try {
                    // Search for individual track
                    const response = await fetch('/api/search/youtube-urls', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({ tracks: [track] }),
                    });
                    
                    const data = await response.json();
                    
                    if (response.ok && data.results && data.results.length > 0) {
                        const result = data.results[0];
                        if (result.found && result.url) {
                            results.push(result.url);
                            found++;
                            progressDiv.innerHTML += `✓ Found: ${result.url}\n`;
                            // Update track status to "Found"
                            this.updateTrackStatus(i, 'found', 'Found');
                            // Update the track object with the found URL
                            this.currentTracks[i].url = result.url;
                        } else {
                            const notFoundEntry = `# Not found: ${track.artist} - ${track.title}`;
                            results.push(notFoundEntry);
                            failed++;
                            progressDiv.innerHTML += `✗ Not found: ${query}\n`;
                            // Update track status to "Not Found"
                            this.updateTrackStatus(i, 'not-found', 'Not Found');
                        }
                    } else {
                        const notFoundEntry = `# Not found: ${track.artist} - ${track.title}`;
                        results.push(notFoundEntry);
                        failed++;
                        progressDiv.innerHTML += `✗ Search failed: ${query}\n`;
                        // Update track status to "Not Found"
                        this.updateTrackStatus(i, 'not-found', 'Not Found');
                    }
                } catch (error) {
                    console.error(`Search failed for track ${i}:`, error);
                    const notFoundEntry = `# Error: ${track.artist} - ${track.title}`;
                    results.push(notFoundEntry);
                    failed++;
                    progressDiv.innerHTML += `✗ Error: ${query} - ${error.message}\n`;
                    // Update track status to "Error"
                    this.updateTrackStatus(i, 'error', 'Error');
                }
                
                // Update the textarea with current results
                const currentText = header + results.join('\n');
                youtubeUrlsTextarea.value = currentText;
                
                // Scroll to bottom of textarea
                youtubeUrlsTextarea.scrollTop = youtubeUrlsTextarea.scrollHeight;
            }
            
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

    restart() {
        // Reset state
        this.currentUrl = '';
        this.currentTracks = [];
        this.currentDownloadId = null;
        this.currentMetadata = null;
        
        // Reset download state
        this.downloadedTracks = new Set();
        this.downloadedBlobs = new Map();
        
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
