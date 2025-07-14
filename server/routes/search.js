const express = require('express');
const youtubeService = require('../services/youtube');
const router = express.Router();

// Search for YouTube URLs for a list of tracks
router.post('/youtube-urls', async (req, res) => {
  try {
    console.log('YouTube search request received');
    console.log('Request body:', JSON.stringify(req.body, null, 2));
    console.log('Request headers:', JSON.stringify(req.headers, null, 2));
    
    const { tracks } = req.body;
    
    if (!tracks || !Array.isArray(tracks)) {
      console.error('Invalid tracks data:', { tracks, type: typeof tracks, isArray: Array.isArray(tracks) });
      return res.status(400).json({ error: 'Tracks array is required' });
    }
    
    console.log(`Processing ${tracks.length} tracks for YouTube search`);
    for (let i = 0; i < Math.min(tracks.length, 3); i++) {
      console.log(`Track ${i}:`, tracks[i]);
    }

    const results = [];
    let found = 0;
    let failed = 0;

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
          found++;
        } else {
          console.log(`Not found: ${query}`);
          results.push({
            index: i,
            track: track,
            url: null,
            found: false
          });
          failed++;
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
        failed++;
      }
    }

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

module.exports = router;
