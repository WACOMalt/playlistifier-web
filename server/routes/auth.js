const express = require('express');
const crypto = require('crypto');
const router = express.Router();

// Store code verifiers temporarily (in production, use Redis or database)
const codeVerifiers = new Map();

// Store pending OAuth callbacks
const pendingCallbacks = new Map();

// Generate code verifier and challenge for PKCE
function generatePKCE() {
  const codeVerifier = crypto.randomBytes(32).toString('base64url');
  const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
  return { codeVerifier, codeChallenge };
}

// Initiate Spotify OAuth flow
router.get('/spotify', async (req, res) => {
  try {
    const { codeVerifier, codeChallenge } = generatePKCE();
    const state = crypto.randomBytes(16).toString('hex');
    
    // Store code verifier for later use
    codeVerifiers.set(state, codeVerifier);
    
    const scopes = 'playlist-read-private playlist-read-collaborative';
    const redirectUri = process.env.SPOTIFY_REDIRECT_URI || 'https://plylst.wacomalt.com/api/auth/callback';
    // Use the same hardcoded client ID as the PowerShell version for consistency
    const clientId = process.env.SPOTIFY_CLIENT_ID || "98780a86674b4edfa5eb772dedbcf8ae";
    
    const authUrl = `https://accounts.spotify.com/authorize?` +
      `client_id=${clientId}&` +
      `response_type=code&` +
      `redirect_uri=${encodeURIComponent(redirectUri)}&` +
      `code_challenge_method=S256&` +
      `code_challenge=${codeChallenge}&` +
      `state=${state}&` +
      `scope=${encodeURIComponent(scopes)}`;
    
    res.json({ authUrl, state });
  } catch (error) {
    console.error('Spotify auth initialization error:', error);
    res.status(500).json({ error: 'Failed to initialize Spotify authentication' });
  }
});

// Handle OAuth callback
router.get('/callback', async (req, res) => {
  try {
    const { code, error, state } = req.query;
    
    if (error) {
      console.error('OAuth error:', error);
      return res.send(`
        <html>
          <body>
            <h2>Authorization Failed</h2>
            <p>Error: ${error}</p>
            <p><a href="/">Return to application</a></p>
            <script>
              // Try to communicate with parent window
              if (window.opener) {
                window.opener.postMessage({ 
                  type: 'spotify-auth-error', 
                  error: '${error}' 
                }, '*');
                window.close();
              }
            </script>
          </body>
        </html>
      `);
    }
    
    if (!code || !state) {
      return res.status(400).send(`
        <html>
          <body>
            <h2>Authorization Failed</h2>
            <p>Missing required parameters</p>
            <p><a href="/">Return to application</a></p>
            <script>
              if (window.opener) {
                window.opener.postMessage({ 
                  type: 'spotify-auth-error', 
                  error: 'Missing parameters' 
                }, '*');
                window.close();
              }
            </script>
          </body>
        </html>
      `);
    }
    
    const codeVerifier = codeVerifiers.get(state);
    if (!codeVerifier) {
      return res.status(400).send(`
        <html>
          <body>
            <h2>Authorization Failed</h2>
            <p>Invalid state parameter</p>
            <p><a href="/">Return to application</a></p>
            <script>
              if (window.opener) {
                window.opener.postMessage({ 
                  type: 'spotify-auth-error', 
                  error: 'Invalid state' 
                }, '*');
                window.close();
              }
            </script>
          </body>
        </html>
      `);
    }
    
    // Exchange code for token
    try {
      const redirectUri = process.env.SPOTIFY_REDIRECT_URI || 'https://plylst.wacomalt.com/api/auth/callback';
      const clientId = process.env.SPOTIFY_CLIENT_ID || "98780a86674b4edfa5eb772dedbcf8ae";
      
      const tokenResponse = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code: code,
          redirect_uri: redirectUri,
          client_id: clientId,
          code_verifier: codeVerifier,
        }),
      });
      
      const tokenData = await tokenResponse.json();
      
      if (tokenResponse.ok) {
        // Store token in session
        req.session = req.session || {};
        req.session.spotifyToken = {
          access_token: tokenData.access_token,
          expires_at: Date.now() + (tokenData.expires_in * 1000)
        };
        
        // Store result for status checking
        pendingCallbacks.set(state, {
          success: true,
          token: tokenData.access_token,
          expiresAt: Date.now() + (tokenData.expires_in * 1000)
        });
        
        // Clean up
        codeVerifiers.delete(state);
        
        res.send(`
          <html>
            <head>
              <title>Spotify Authentication - Success</title>
              <style>
                body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
                .success { color: #1db954; }
                .loading { color: #666; }
              </style>
            </head>
            <body>
              <h2 class="success">✓ Authorization Successful!</h2>
              <p class="loading">Completing authentication...</p>
              <script>
                console.log('Authentication successful, communicating with parent window');
                
                // Function to close popup and communicate with parent
                function completeAuth() {
                  if (window.opener && !window.opener.closed) {
                    console.log('Sending success message to parent window');
                    window.opener.postMessage({ 
                      type: 'spotify-auth-success', 
                      token: '${tokenData.access_token}',
                      expiresAt: ${Date.now() + (tokenData.expires_in * 1000)}
                    }, '*');
                    
                    // Close the popup after a short delay
                    setTimeout(() => {
                      window.close();
                    }, 500);
                  } else {
                    console.log('No opener window found, redirecting to main page');
                    window.location.href = '/';
                  }
                }
                
                // Try immediately and also after page loads
                completeAuth();
                window.addEventListener('load', completeAuth);
              </script>
            </body>
          </html>
        `);
      } else {
        console.error('Token exchange failed:', tokenData);
        pendingCallbacks.set(state, { success: false, error: tokenData.error });
        
        res.send(`
          <html>
            <body>
              <h2>Authorization Failed</h2>
              <p>Token exchange failed: ${tokenData.error}</p>
              <p><a href="/">Return to application</a></p>
              <script>
                if (window.opener) {
                  window.opener.postMessage({ 
                    type: 'spotify-auth-error', 
                    error: '${tokenData.error}' 
                  }, '*');
                  window.close();
                }
              </script>
            </body>
          </html>
        `);
      }
    } catch (error) {
      console.error('Token exchange error:', error);
      pendingCallbacks.set(state, { success: false, error: error.message });
      
      res.status(500).send(`
        <html>
          <body>
            <h2>Authorization Failed</h2>
            <p>Server error: ${error.message}</p>
            <p><a href="/">Return to application</a></p>
            <script>
              if (window.opener) {
                window.opener.postMessage({ 
                  type: 'spotify-auth-error', 
                  error: '${error.message}' 
                }, '*');
                window.close();
              }
            </script>
          </body>
        </html>
      `);
    }
    
  } catch (error) {
    console.error('OAuth callback error:', error);
    res.status(500).send(`
      <html>
        <body>
          <h2>Authorization Failed</h2>
          <p>Server error occurred</p>
          <p><a href="/">Return to application</a></p>
          <script>
            if (window.opener) {
              window.opener.postMessage({ 
                type: 'spotify-auth-error', 
                error: 'Server error' 
              }, '*');
              window.close();
            }
          </script>
        </body>
      </html>
    `);
  }
});

// Check OAuth status
router.get('/spotify/status/:state', (req, res) => {
  try {
    const state = req.params.state;
    const result = pendingCallbacks.get(state);
    
    if (!result) {
      return res.json({ status: 'pending' });
    }
    
    if (result.success) {
      // Clean up
      pendingCallbacks.delete(state);
      
      res.json({ 
        status: 'success',
        token: result.token,
        expiresAt: result.expiresAt
      });
    } else {
      // Clean up
      pendingCallbacks.delete(state);
      
      res.json({ 
        status: 'error',
        error: result.error || 'Unknown error'
      });
    }
    
  } catch (error) {
    console.error('OAuth status check error:', error);
    res.status(500).json({ error: 'Failed to check OAuth status' });
  }
});

// Refresh Spotify token
router.post('/spotify/refresh', async (req, res) => {
  try {
    if (!req.session?.spotifyToken?.refresh_token) {
      return res.status(401).json({ error: 'No refresh token available' });
    }
    
    const clientId = process.env.SPOTIFY_CLIENT_ID || "98780a86674b4edfa5eb772dedbcf8ae";
    
    const refreshResponse = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: req.session.spotifyToken.refresh_token,
        client_id: clientId,
      }),
    });
    
    const refreshData = await refreshResponse.json();
    
    if (!refreshResponse.ok) {
      console.error('Token refresh failed:', refreshData);
      return res.status(400).json({ error: 'Failed to refresh token' });
    }
    
    // Update session with new token
    req.session.spotifyToken = {
      ...req.session.spotifyToken,
      access_token: refreshData.access_token,
      expires_at: Date.now() + (refreshData.expires_in * 1000)
    };
    
    res.json({ 
      success: true, 
      token: refreshData.access_token,
      expiresAt: req.session.spotifyToken.expires_at
    });
    
  } catch (error) {
    console.error('Token refresh error:', error);
    res.status(500).json({ error: 'Failed to refresh token' });
  }
});

// Get current authentication status
router.get('/status', (req, res) => {
  const hasSpotifyAuth = req.session?.spotifyToken?.access_token && 
                        req.session.spotifyToken.expires_at > Date.now();
  
  res.json({
    authenticated: hasSpotifyAuth,
    spotify: hasSpotifyAuth,
    expiresAt: req.session?.spotifyToken?.expires_at || null
  });
});

module.exports = router;
