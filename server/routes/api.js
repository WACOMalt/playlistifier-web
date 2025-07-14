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
        if (!token) {
          return res.status(401).json({ error: 'Spotify authentication required' });
        }
        const spotifyContent = await spotifyService.extractContent(url, token);
        tracks = spotifyContent.tracks;
        metadata = spotifyContent;
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
