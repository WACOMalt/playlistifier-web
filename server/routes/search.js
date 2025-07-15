const express = require('express');
const youtubeService = require('../services/youtube');
const router = express.Router();

// Search for YouTube URLs for a list of tracks
router.post('/youtube-urls', async (req, res) => {
  try {
    console.log('YouTube search request received');
    console.log('Request body:', JSON.stringify(req.body, null, 2));
    console.log('Request headers:', JSON.stringify(req.headers, null, 2));
    
    const { tracks, concurrent = false } = req.body;
    
    if (!tracks || !Array.isArray(tracks)) {
      console.error('Invalid tracks data:', { tracks, type: typeof tracks, isArray: Array.isArray(tracks) });
      return res.status(400).json({ error: 'Tracks array is required' });
    }
    
    console.log(`Processing ${tracks.length} tracks for YouTube search (concurrent: ${concurrent})`);
    for (let i = 0; i < Math.min(tracks.length, 3); i++) {
      console.log(`Track ${i}:`, tracks[i]);
    }

    let results = [];
    let found = 0;
    let failed = 0;

    if (concurrent && tracks.length > 1) {
      // Concurrent search with controlled parallelism
      const maxConcurrency = Math.min(5, tracks.length); // Limit to 5 concurrent searches
      console.log(`Using concurrent search with ${maxConcurrency} parallel requests`);
      
      // Create search promises for all tracks
      const searchPromises = tracks.map(async (track, index) => {
        const query = `${track.artist} ${track.title}`.trim();
        console.log(`Starting concurrent search for track ${index + 1}/${tracks.length}: ${query}`);
        
        try {
          const searchResult = await youtubeService.searchTrack(query);
          
          if (searchResult && searchResult.url) {
            console.log(`Found (concurrent): ${searchResult.url}`);
            return {
              index: index,
              track: track,
              url: searchResult.url,
              found: true
            };
          } else {
            console.log(`Not found (concurrent): ${query}`);
            return {
              index: index,
              track: track,
              url: null,
              found: false
            };
          }
        } catch (error) {
          console.error(`Concurrent search failed for track ${index} (${query}):`, error.message);
          return {
            index: index,
            track: track,
            url: null,
            found: false,
            error: error.message
          };
        }
      });
      
      // Execute searches with controlled concurrency
      const concurrentResults = [];
      for (let i = 0; i < searchPromises.length; i += maxConcurrency) {
        const batch = searchPromises.slice(i, i + maxConcurrency);
        const batchResults = await Promise.all(batch);
        concurrentResults.push(...batchResults);
        console.log(`Completed batch ${Math.floor(i / maxConcurrency) + 1}/${Math.ceil(searchPromises.length / maxConcurrency)}`);
      }
      
      // Sort results by original index to maintain order
      results = concurrentResults.sort((a, b) => a.index - b.index);
      
    } else {
      // Sequential search (original behavior)
      console.log('Using sequential search');
      
      for (let i = 0; i < tracks.length; i++) {
        const track = tracks[i];
        const query = `${track.artist} ${track.title}`.trim();
        
        try {
          console.log(`Searching for track ${i+1}/${tracks.length}: ${query}`);
          
          // Use yt-dlp to search for the track
          const searchResult = await youtubeService.searchTrack(query);
          
          if (searchResult && searchResult.url) {
            console.log(`Found: ${searchResult.url}`);
            results.push({
              index: i,
              track: track,
              url: searchResult.url,
              found: true
            });
          } else {
            console.log(`Not found: ${query}`);
            results.push({
              index: i,
              track: track,
              url: null,
              found: false
            });
          }
        } catch (error) {
          console.error(`Search failed for track ${i} (${query}):`, error.message);
          console.error('Error stack:', error.stack);
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
    res.status(500).json({ error: 'Failed to search for YouTube URLs' });
  }
});

// Bulk search endpoint for better performance with large track lists
router.post('/bulk-youtube-urls', async (req, res) => {
  try {
    const { tracks, maxConcurrency = 5 } = req.body;
    
    if (!tracks || !Array.isArray(tracks)) {
      return res.status(400).json({ error: 'Tracks array is required' });
    }
    
    console.log(`Bulk search: Processing ${tracks.length} tracks with ${maxConcurrency} concurrent requests`);
    
    // Set up controlled concurrency
    const concurrency = Math.min(maxConcurrency, tracks.length);
    const results = [];
    
    // Process tracks in batches
    for (let i = 0; i < tracks.length; i += concurrency) {
      const batch = tracks.slice(i, i + concurrency);
      const batchPromises = batch.map(async (track, batchIndex) => {
        const originalIndex = i + batchIndex;
        const query = `${track.artist} ${track.title}`.trim();
        
        try {
          const searchResult = await youtubeService.searchTrack(query);
          return {
            index: originalIndex,
            track: track,
            url: searchResult?.url || null,
            found: !!(searchResult?.url),
            title: searchResult?.title || null,
            uploader: searchResult?.uploader || null,
            duration: searchResult?.duration || null
          };
        } catch (error) {
          console.error(`Batch search failed for track ${originalIndex} (${query}):`, error.message);
          return {
            index: originalIndex,
            track: track,
            url: null,
            found: false,
            error: error.message
          };
        }
      });
      
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
      
      // Optional: Send progress update via WebSocket if needed
      console.log(`Batch ${Math.floor(i / concurrency) + 1}/${Math.ceil(tracks.length / concurrency)} completed`);
    }
    
    // Sort results by original index
    results.sort((a, b) => a.index - b.index);
    
    const found = results.filter(r => r.found).length;
    const failed = results.filter(r => !r.found).length;
    
    res.json({
      success: true,
      results: results,
      summary: {
        total: tracks.length,
        found: found,
        failed: failed,
        concurrency: concurrency
      }
    });
    
  } catch (error) {
    console.error('Bulk YouTube search error:', error);
    res.status(500).json({ error: 'Failed to perform bulk search' });
  }
});

module.exports = router;
