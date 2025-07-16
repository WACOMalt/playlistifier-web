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

  // YouTube URL patterns - Check for list= parameter first, then video ID
  const youtubePatterns = [
    // Channel patterns (check these first as they're distinct)
    /https?:\/\/(?:www\.)?youtube\.com\/channel\/([a-zA-Z0-9_-]+)/,
    /https?:\/\/(?:www\.)?youtube\.com\/@([a-zA-Z0-9_-]+)/,
    // Generic YouTube URL pattern (we'll parse parameters manually)
    /https?:\/\/(?:www\.)?youtube\.com\/(watch|playlist)/,
    /https?:\/\/youtu\.be\/([a-zA-Z0-9_-]+)/
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
      
      // Handle channel URLs
      if (url.includes('channel') || url.includes('@')) {
        analysis.type = 'channel';
        analysis.id = match[1];
        return analysis;
      }
      
      // Handle youtu.be short URLs
      if (url.includes('youtu.be')) {
        analysis.type = 'video';
        analysis.id = match[1];
        return analysis;
      }
      
      // Handle youtube.com URLs - check for list= parameter first
      const listMatch = url.match(/[?&]list=([a-zA-Z0-9_-]+)/);
      if (listMatch) {
        analysis.type = 'playlist';
        analysis.id = listMatch[1];
        return analysis;
      }
      
      // No list= found, look for v= parameter
      const videoMatch = url.match(/[?&]v=([a-zA-Z0-9_-]+)/);
      if (videoMatch) {
        analysis.type = 'video';
        analysis.id = videoMatch[1];
        return analysis;
      }
      
      // If we matched the pattern but couldn't extract ID, continue to next pattern
    }
  }

  return analysis;
}

// Changelog endpoint - fetch GitHub releases
router.get('/changelog', async (req, res) => {
  try {
    const fetch = require('node-fetch');
    const response = await fetch('https://api.github.com/repos/WACOMalt/playlistifier-web/releases', {
      headers: {
        'User-Agent': 'Playlistifier-Web/1.2.0',
        'Accept': 'application/vnd.github.v3+json'
      }
    });
    
    if (!response.ok) {
      throw new Error(`GitHub API returned ${response.status}: ${response.statusText}`);
    }
    
    const releases = await response.json();
    
    // Filter and format releases
    const formattedReleases = releases
      .filter(release => !release.draft && !release.prerelease)
      .map(release => ({
        tag_name: release.tag_name,
        name: release.name,
        body: release.body,
        published_at: release.published_at,
        html_url: release.html_url
      }))
      .slice(0, 10); // Limit to 10 most recent releases
    
    res.json({ releases: formattedReleases });
  } catch (error) {
    console.error('Error fetching changelog:', error);
    res.status(500).json({ 
      error: 'Failed to fetch changelog from GitHub',
      message: error.message 
    });
  }
});

module.exports = router;
