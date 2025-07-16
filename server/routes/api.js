const express = require('express');
const router = express.Router();

const spotifyService = require('../services/spotify');
const youtubeService = require('../services/youtube');

// URL analysis endpoint
router.post('/analyze', async (req, res) => {
  try {
    const { url } = req.body;
    
    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    // Determine platform and type
    const analysis = analyzeUrl(url);
    
    if (!analysis.platform) {
      return res.status(400).json({ error: 'Unsupported URL format' });
    }

    res.json(analysis);
  } catch (error) {
    console.error('URL analysis error:', error);
    res.status(500).json({ error: 'Failed to analyze URL' });
  }
});

// Track extraction endpoint
router.post('/extract', async (req, res) => {
  try {
    const { url, token } = req.body;
    
    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    const analysis = analyzeUrl(url);
    
    if (!analysis.platform) {
      return res.status(400).json({ error: 'Unsupported URL format' });
    }

    // TODO: Implement track extraction based on platform
    let tracks = [];
    let metadata = {};

    switch (analysis.platform) {
      case 'spotify':
        // Try public API first, fall back to OAuth if needed
        const publicResult = await spotifyService.tryPublicApiFirst(url);
        
        if (publicResult.success) {
          // Successfully got data using public API
          tracks = publicResult.data.tracks;
          metadata = publicResult.data;
          console.log('Used public API for Spotify content');
        } else if (publicResult.authRequired) {
          // Need user authentication
          if (!token) {
            return res.status(401).json({ 
              error: 'Spotify authentication required',
              reason: publicResult.reason,
              authRequired: true
            });
          }
          // Try with user token
          const spotifyContent = await spotifyService.extractContent(url, token);
          tracks = spotifyContent.tracks;
          metadata = spotifyContent;
          console.log('Used OAuth API for Spotify content');
        } else {
          // Other error (network, invalid URL, etc.)
          throw new Error(publicResult.error);
        }
        break;
      case 'youtube':
        const youtubeContent = await youtubeService.extractContent(url);
        tracks = youtubeContent.tracks;
        metadata = youtubeContent;
        break;
      default:
        return res.status(400).json({ error: 'Unsupported platform' });
    }

    res.json({ tracks, metadata });
  } catch (error) {
    console.error('Track extraction error:', error);
    
    // Check if this is an authentication-related error
    if (error.message.includes('403') || 
        error.message.includes('401') || 
        error.message.includes('404') || // Private playlists may return 404 instead of 403
        error.message.includes('Resource not found') || // Private playlists often show as "not found"
        error.message.includes('Insufficient client scope') ||
        error.message.includes('Only valid bearer authentication supported')) {
      
      return res.status(401).json({ 
        error: 'Spotify authentication required',
        reason: 'This content requires user authentication (likely private playlist or user-specific content)',
        authRequired: true
      });
    }
    
    res.status(500).json({ error: 'Failed to extract tracks' });
  }
});

// Helper function to analyze URL
function analyzeUrl(url) {
  const analysis = {
    platform: null,
    type: null,
    id: null,
    metadata: {}
  };

  // Spotify URL patterns
  const spotifyPatterns = [
    /https?:\/\/open\.spotify\.com\/(playlist|album|track)\/([a-zA-Z0-9]+)/,
    /spotify:(playlist|album|track):([a-zA-Z0-9]+)/
  ];

  // YouTube URL patterns
  const youtubePatterns = [
    /https?:\/\/(?:www\.)?youtube\.com\/playlist\?list=([a-zA-Z0-9_-]+)/,
    /https?:\/\/(?:www\.)?youtube\.com\/watch\?v=([a-zA-Z0-9_-]+)/,
    /https?:\/\/youtu\.be\/([a-zA-Z0-9_-]+)/,
    /https?:\/\/(?:www\.)?youtube\.com\/channel\/([a-zA-Z0-9_-]+)/,
    /https?:\/\/(?:www\.)?youtube\.com\/@([a-zA-Z0-9_-]+)/
  ];

  // Check Spotify patterns
  for (const pattern of spotifyPatterns) {
    const match = url.match(pattern);
    if (match) {
      analysis.platform = 'spotify';
      analysis.type = match[1];
      analysis.id = match[2];
      return analysis;
    }
  }

  // Check YouTube patterns
  for (const pattern of youtubePatterns) {
    const match = url.match(pattern);
    if (match) {
      analysis.platform = 'youtube';
      analysis.id = match[1];
      
      // Determine type based on URL structure
      if (url.includes('playlist')) {
        analysis.type = 'playlist';
      } else if (url.includes('channel') || url.includes('@')) {
        analysis.type = 'channel';
      } else {
        analysis.type = 'video';
      }
      
      return analysis;
    }
  }

  return analysis;
}

module.exports = router;
