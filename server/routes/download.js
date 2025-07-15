const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const downloadService = require('../services/downloader');

// Serve results page
router.get('/results/:downloadId', async (req, res) => {
    const downloadId = req.params.downloadId;
    const download = downloadService.getDownloadStatus(downloadId);
    
    if (!download) {
        return res.status(404).send('Download not found');
    }
    
    const files = download.results.filter(result => result.status === 'completed').map(result => result.filename);
    const downloadPath = download.downloadPath;

    // Create a zip of all downloaded files
    const zipPath = path.join(downloadPath, 'download.zip');
    if (!fs.existsSync(zipPath)) {
        await new Promise((resolve, reject) => {
            const output = fs.createWriteStream(zipPath);
            const archive = archiver('zip', { zlib: { level: 9 } });
            
            output.on('close', resolve);
            archive.on('error', reject);
        
            archive.pipe(output);
            files.forEach(file => archive.file(path.join(downloadPath, file), { name: file }));
            archive.finalize();
        });
    }

    // Render the results page
    res.send(`
    <!DOCTYPE html>
    <html>
    <head>
        <title>Download Results</title>
        <style>
            body { font-family: Arial, sans-serif; margin: 20px; }
            .file-list { list-style: none; padding: 0; }
            .file-list li { margin: 10px 0; padding: 10px; background: #f5f5f5; border-radius: 5px; }
            .file-list a { text-decoration: none; color: #333; }
            .file-list a:hover { color: #007bff; }
            .download-all { display: inline-block; margin: 20px 0; padding: 10px 20px; background: #007bff; color: white; text-decoration: none; border-radius: 5px; }
            .download-all:hover { background: #0056b3; }
            .stats { margin: 20px 0; padding: 15px; background: #e9ecef; border-radius: 5px; }
        </style>
    </head>
    <body>
        <h1>Download Results</h1>
        <div class="stats">
            <p><strong>Total Tracks:</strong> ${download.totalTracks}</p>
            <p><strong>Successfully Downloaded:</strong> ${download.completedTracks}</p>
            <p><strong>Failed:</strong> ${download.failedTracks}</p>
        </div>
        <h2>Downloaded Files</h2>
        <ul class="file-list">
            ${files.map(file => `<li><a href="/api/download/file/${downloadId}/${encodeURIComponent(file)}">${file}</a></li>`).join('')}
        </ul>
        <a href="/api/download/zip/${downloadId}" class="download-all">Download All as ZIP</a>
        <br><br>
        <a href="/">← Back to Home</a>
    </body>
    </html>`);
});

// Route to download individual files
router.get('/file/:downloadId/:filename', (req, res) => {
    const downloadId = req.params.downloadId;
    const filename = decodeURIComponent(req.params.filename);
    const download = downloadService.getDownloadStatus(downloadId);

    if (!download) {
        return res.status(404).send('Download not found');
    }

    const filePath = path.join(download.downloadPath, filename);
    if (!fs.existsSync(filePath)) {
        return res.status(404).send('File not found');
    }

    res.download(filePath);
});

// Route to download zip file
router.get('/zip/:downloadId', (req, res) => {
    const downloadId = req.params.downloadId;
    const download = downloadService.getDownloadStatus(downloadId);

    if (!download) {
        return res.status(404).send('Download not found');
    }

    const zipPath = path.join(download.downloadPath, 'download.zip');
    if (!fs.existsSync(zipPath)) {
        return res.status(404).send('Zip file not found');
    }

    res.download(zipPath, 'playlist.zip');
});

// Single track download endpoint
router.post('/single', async (req, res) => {
  try {
    const { track, trackId, options } = req.body;
    if (!track || trackId === undefined) {
      return res.status(400).json({ error: 'Track and trackId are required' });
    }

    const downloadId = await downloadService.createSingleDownload(track, trackId, options);
    
    // Start single track download
    const io = req.app.get('io');
    const result = await downloadService.downloadSingleTrack(downloadId, io);
    
    if (result.success) {
      // Set headers for file download
      const filename = result.filename;
      res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      
      // Send the file
      const fs = require('fs');
      const fileStream = fs.createReadStream(result.filePath);
      
      fileStream.pipe(res);
      
      // Track file for session cleanup
      const sessionId = req.session.id;
      if (sessionId) {
        downloadService.trackFileForSession(sessionId, result.filePath);
      }
      
      // Clean up after sending
      fileStream.on('end', () => {
        setTimeout(() => {
          downloadService.cleanupSingleDownload(downloadId);
        }, 1000);
      });
      
      fileStream.on('error', (err) => {
        console.error('File stream error:', err);
        if (!res.headersSent) {
          res.status(500).json({ error: 'Failed to stream file' });
        }
      });
    } else {
      res.status(500).json({ error: result.error || 'Download failed' });
    }
  } catch (error) {
    console.error('Single track download error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to download track' });
    }
  }
});

// Initiate download process
router.post('/', async (req, res) => {
  try {
    const { tracks, options } = req.body;
    if (!tracks || !options) {
      return res.status(400).json({ error: 'Tracks and options are required' });
    }

    const downloadId = await downloadService.createDownload(tracks, options);
    const sessionId = req.session.id; // Track download with session

    // Start download process asynchronously
    const io = req.app.get('io');
    downloadService.startDownload(downloadId, io).catch(error => {
      console.error('Download process error:', error);
    });

    // Track files for session cleanup
    const downloadStatus = downloadService.getDownloadStatus(downloadId);
    if (downloadStatus && downloadStatus.results) {
      downloadStatus.results.forEach(result => {
        if (result.status === 'completed') {
          const filePath = path.join(downloadStatus.downloadPath, result.filename);
          downloadService.trackFileForSession(sessionId, filePath);
        }
      });
    }

    res.json({ downloadId });
  } catch (error) {
    console.error('Download initiation error:', error);
    res.status(500).json({ error: 'Failed to initiate download' });
  }
});

// Get download progress and results
router.get('/:id/status', (req, res) => {
  try {
    const status = downloadService.getDownloadStatus(req.params.id);
    if (!status) {
      return res.status(404).json({ error: 'Download not found' });
    }

    res.json(status);
  } catch (error) {
    console.error('Status check error:', error);
    res.status(500).json({ error: 'Failed to retrieve status' });
  }
});

// Cancel a download
router.post('/:id/cancel', (req, res) => {
  try {
    const success = downloadService.cancelDownload(req.params.id);
    if (!success) {
      return res.status(404).json({ error: 'Download not found' });
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Cancellation error:', error);
    res.status(500).json({ error: 'Failed to cancel download' });
  }
});

// Cleanup session files (when processing another URL)
router.post('/cleanup', async (req, res) => {
  try {
    const sessionId = req.session.id;
    if (sessionId) {
      await downloadService.cleanupSessionFiles(sessionId);
      res.json({ success: true, message: 'Session files cleaned up' });
    } else {
      res.json({ success: false, message: 'No session found' });
    }
  } catch (error) {
    console.error('Cleanup error:', error);
    res.status(500).json({ error: 'Failed to cleanup files' });
  }
});

module.exports = router;

