const express = require('express');
const youtubeService = require('../services/youtube');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { MAX_CONCURRENCY, PROCESS_DELAY, POLLING_INTERVAL } = require('../config/queue');

// Queue configuration - shared with download service

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, '..', 'logs');
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
}

// Logger function
function logToFile(message, level = 'INFO') {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [${level}] ${message}`;
    
    // Log to console
    console.log(logMessage);
    
    // Log to file
    const logFile = path.join(logsDir, `youtube-search-${new Date().toISOString().split('T')[0]}.log`);
    fs.appendFileSync(logFile, logMessage + '\n');
}

// Search for YouTube URLs for a list of tracks
router.post('/youtube-urls', async (req, res) => {
  const requestId = Math.random().toString(36).substring(7);
  
  try {
    // Ensure YouTube service is initialized
    await youtubeService.initialize();
    logToFile(`[${requestId}] YouTube service initialized successfully`);
    
    logToFile(`[${requestId}] YouTube search request received`);
    logToFile(`[${requestId}] Request body: ${JSON.stringify(req.body, null, 2)}`);
    
    const { tracks, concurrent = false } = req.body;
    
    if (!tracks || !Array.isArray(tracks)) {
      logToFile(`[${requestId}] Invalid tracks data: ${JSON.stringify({ tracks, type: typeof tracks, isArray: Array.isArray(tracks) })}`, 'ERROR');
      return res.status(400).json({ error: 'Tracks array is required' });
    }
    
    logToFile(`[${requestId}] Processing ${tracks.length} tracks for YouTube search (concurrent: ${concurrent})`);
    for (let i = 0; i < Math.min(tracks.length, 3); i++) {
      logToFile(`[${requestId}] Track ${i}: ${JSON.stringify(tracks[i])}`);
    }

    let results = [];
    let found = 0;
    let failed = 0;

    if (concurrent && tracks.length > 1) {
      // Queue-based search with controlled parallelism - same structure as download service
      const maxConcurrency = Math.min(MAX_CONCURRENCY, tracks.length);
      logToFile(`[${requestId}] Using queue-based search with ${maxConcurrency} parallel requests`);
      
      // Initialize queue tracking
      const activeSearches = new Set();
      let nextIndex = 0;
      const startTime = Date.now();
      
      // Function to process the next track search
      const processNextSearch = async () => {
        if (nextIndex >= tracks.length) return; // No more tracks to process
        if (activeSearches.size >= maxConcurrency) return; // Max concurrent limit reached
        
        const currentIndex = nextIndex;
        const currentTrack = tracks[currentIndex];
        const query = `${currentTrack.artist} ${currentTrack.title}`.trim();
        
        activeSearches.add(currentIndex);
        nextIndex++;
        
        logToFile(`[${requestId}] Starting search for track ${currentIndex + 1}/${tracks.length}: ${query}`);
        logToFile(`[${requestId}] Active searches: ${activeSearches.size}, Next index: ${nextIndex}`);
        
        const trackStartTime = Date.now();
        try {
          const searchResult = await youtubeService.searchTrack(query, currentTrack.duration_ms);
          const searchDuration = Date.now() - trackStartTime;
          activeSearches.delete(currentIndex);
          
          if (searchResult && searchResult.url) {
            logToFile(`[${requestId}] Found (${searchDuration}ms): ${searchResult.url}`);
            results[currentIndex] = {
              index: currentIndex,
              track: currentTrack,
              url: searchResult.url,
              found: true,
              thumbnail: searchResult.thumbnail,
              title: searchResult.title,
              uploader: searchResult.uploader,
              duration: searchResult.duration
            };
          } else {
            logToFile(`[${requestId}] Not found (${searchDuration}ms): ${query}`);
            results[currentIndex] = {
              index: currentIndex,
              track: currentTrack,
              url: null,
              found: false
            };
          }
        } catch (error) {
          const searchDuration = Date.now() - trackStartTime;
          logToFile(`[${requestId}] Search failed for track ${currentIndex} (${searchDuration}ms) (${query}): ${error.message}`, 'ERROR');
          activeSearches.delete(currentIndex);
          results[currentIndex] = {
            index: currentIndex,
            track: currentTrack,
            url: null,
            found: false,
            error: error.message
          };
        }
        
        // Check if we can start another search after a delay
        if (nextIndex < tracks.length) {
          logToFile(`[${requestId}] Scheduling next search in ${PROCESS_DELAY}ms (remaining: ${tracks.length - nextIndex})`);
          setTimeout(processNextSearch, PROCESS_DELAY);
        }
      };
      
      // Pre-allocate results array
      results = new Array(tracks.length);
      
      // Start the initial search processes
      logToFile(`[${requestId}] Starting ${Math.min(maxConcurrency, tracks.length)} initial searches`);
      for (let i = 0; i < Math.min(maxConcurrency, tracks.length); i++) {
        setTimeout(() => processNextSearch(), i * PROCESS_DELAY); // Stagger initial searches
      }
      
      // Wait until all searches are complete
      while (nextIndex < tracks.length || activeSearches.size > 0) {
        await new Promise(resolve => setTimeout(resolve, POLLING_INTERVAL));
        if (nextIndex < tracks.length || activeSearches.size > 0) {
          logToFile(`[${requestId}] Waiting... Next index: ${nextIndex}/${tracks.length}, Active: ${activeSearches.size}`);
        }
      }
      
      const totalDuration = Date.now() - startTime;
      logToFile(`[${requestId}] Queue-based search completed in ${totalDuration}ms`);
      
      // Filter out undefined results and sort by index
      results = results.filter(result => result !== undefined).sort((a, b) => a.index - b.index);
      
    } else {
      // Sequential search (original behavior)
      logToFile(`[${requestId}] Using sequential search`);
      
      for (let i = 0; i < tracks.length; i++) {
        const track = tracks[i];
        const query = `${track.artist} ${track.title}`.trim();
        
        try {
          logToFile(`[${requestId}] Searching for track ${i+1}/${tracks.length}: ${query}`);
          
          const trackStartTime = Date.now();
          // Use yt-dlp to search for the track
          const searchResult = await youtubeService.searchTrack(query, track.duration_ms);
          const searchDuration = Date.now() - trackStartTime;
          
          if (searchResult && searchResult.url) {
            logToFile(`[${requestId}] Found (${searchDuration}ms): ${searchResult.url}`);
            results.push({
              index: i,
              track: track,
              url: searchResult.url,
              found: true,
              thumbnail: searchResult.thumbnail,
              title: searchResult.title,
              uploader: searchResult.uploader,
              duration: searchResult.duration
            });
          } else {
            logToFile(`[${requestId}] Not found (${searchDuration}ms): ${query}`);
            results.push({
              index: i,
              track: track,
              url: null,
              found: false
            });
          }
        } catch (error) {
          logToFile(`[${requestId}] Search failed for track ${i} (${query}): ${error.message}`, 'ERROR');
          logToFile(`[${requestId}] Error stack: ${error.stack}`, 'ERROR');
          results.push({
            index: i,
            track: track,
            url: null,
            found: false,
            error: error.message
          });
        }
      }
    }
    
    // Count results
    found = results.filter(r => r.found).length;
    failed = results.filter(r => !r.found).length;

    res.json({
      success: true,
      results: results,
      summary: {
        total: tracks.length,
        found: found,
        failed: failed
      }
    });

  } catch (error) {
    console.error('YouTube search error:', error);
    logToFile(`[${requestId}] Search request failed: ${error.message}`, 'ERROR');
    logToFile(`[${requestId}] Stack trace: ${error.stack}`, 'ERROR');
    res.status(500).json({ error: 'Failed to search for YouTube URLs', details: error.message });
  }
});

// Bulk search endpoint for better performance with large track lists
router.post('/bulk-youtube-urls', async (req, res) => {
  try {
    const { tracks, maxConcurrency = MAX_CONCURRENCY } = req.body;
    
    if (!tracks || !Array.isArray(tracks)) {
      return res.status(400).json({ error: 'Tracks array is required' });
    }
    
    console.log(`Bulk search: Processing ${tracks.length} tracks with a search queue`);
    
    // Use same concurrency limit as download service
    const actualConcurrency = Math.min(maxConcurrency, MAX_CONCURRENCY, tracks.length);
    
    // Initialize queue and search status tracking
    const results = new Array(tracks.length); // Pre-allocate like download service
    const activeSearches = new Set();
    let nextIndex = 0;

    // Function to process the next track search
    const processNextSearch = async () => {
      if (nextIndex >= tracks.length) return; // No more tracks to process
      if (activeSearches.size >= actualConcurrency) return; // Max active limit reached

      const currentIndex = nextIndex;
      const currentTrack = tracks[currentIndex];
      const query = `${currentTrack.artist} ${currentTrack.title}`.trim();

      activeSearches.add(currentIndex);
      nextIndex++;

      try {
        const searchResult = await youtubeService.searchTrack(query, currentTrack.duration_ms);
        activeSearches.delete(currentIndex);
        results[currentIndex] = {
          index: currentIndex,
          track: currentTrack,
          url: searchResult?.url || null,
          found: !!(searchResult?.url),
          title: searchResult?.title || null,
          uploader: searchResult?.uploader || null,
          duration: searchResult?.duration || null,
          thumbnail: searchResult?.thumbnail || null
        };
      } catch (error) {
        console.error(`Search failed for track ${currentIndex} (${query}):`, error.message);
        activeSearches.delete(currentIndex);
        results[currentIndex] = {
          index: currentIndex,
          track: currentTrack,
          url: null,
          found: false,
          error: error.message
        };
      }

      // Check if we can start another search after a delay
      if (nextIndex < tracks.length) {
        setTimeout(processNextSearch, PROCESS_DELAY);
      }
    };

    // Start the initial search processes
    for (let i = 0; i < Math.min(actualConcurrency, tracks.length); i++) {
      setTimeout(() => processNextSearch(), i * PROCESS_DELAY); // Stagger initial searches
    }

    // Wait until all searches are complete
    while (nextIndex < tracks.length || activeSearches.size > 0) {
      await new Promise(resolve => setTimeout(resolve, POLLING_INTERVAL));
    }
    
    // Filter out undefined results and sort by index
    const finalResults = results.filter(result => result !== undefined).sort((a, b) => a.index - b.index);
    
    const found = finalResults.filter(r => r.found).length;
    const failed = finalResults.filter(r => !r.found).length;
    
    res.json({
      success: true,
      results: finalResults,
      summary: {
        total: tracks.length,
        found: found,
        failed: failed,
        concurrency: actualConcurrency
      }
    });
    
  } catch (error) {
    console.error('Bulk YouTube search error:', error);
    res.status(500).json({ error: 'Failed to perform bulk search' });
  }
});

module.exports = router;
