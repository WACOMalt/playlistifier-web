const https = require('https');
const querystring = require('querystring');

class SpotifyService {
    constructor() {
        this.baseUrl = 'https://api.spotify.com/v1';
        this.clientCredentialsToken = null;
        this.clientCredentialsExpiry = null;
    }

    async getClientCredentialsToken() {
        // Check if we have a valid token
        if (this.clientCredentialsToken && this.clientCredentialsExpiry && Date.now() < this.clientCredentialsExpiry) {
            return this.clientCredentialsToken;
        }

        const clientId = process.env.SPOTIFY_CLIENT_ID || "98780a86674b4edfa5eb772dedbcf8ae";
        const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

        if (!clientSecret) {
            throw new Error('SPOTIFY_CLIENT_SECRET environment variable is required for public API access');
        }

        const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
        const tokenUrl = 'https://accounts.spotify.com/api/token';
        
        return new Promise((resolve, reject) => {
            const postData = 'grant_type=client_credentials';
            
            const options = {
                method: 'POST',
                headers: {
                    'Authorization': `Basic ${auth}`,
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Content-Length': Buffer.byteLength(postData)
                }
            };

            const req = https.request(tokenUrl, options, (res) => {
                let data = '';
                
                res.on('data', (chunk) => {
                    data += chunk;
                });
                
                res.on('end', () => {
                    try {
                        const parsed = JSON.parse(data);
                        
                        if (res.statusCode >= 200 && res.statusCode < 300) {
                            this.clientCredentialsToken = parsed.access_token;
                            this.clientCredentialsExpiry = Date.now() + (parsed.expires_in * 1000);
                            console.log('Client Credentials token obtained successfully');
                            resolve(this.clientCredentialsToken);
                        } else {
                            reject(new Error(parsed.error?.message || `HTTP ${res.statusCode}`));
                        }
                    } catch (error) {
                        reject(new Error('Invalid JSON response from token endpoint'));
                    }
                });
            });

            req.on('error', (error) => {
                reject(error);
            });

            req.write(postData);
            req.end();
        });
    }

    async tryPublicApiFirst(url) {
        try {
            const clientCredentialsToken = await this.getClientCredentialsToken();
            const result = await this.extractContent(url, clientCredentialsToken);
            
            return {
                success: true,
                data: result,
                authRequired: false
            };
        } catch (error) {
            // Check if the error indicates private content or auth required
            if (error.message.includes('403') || 
                error.message.includes('401') || 
                error.message.includes('404') || // Private playlists may return 404 instead of 403
                error.message.includes('Resource not found') || // Private playlists often show as "not found"
                error.message.includes('Insufficient client scope') ||
                error.message.includes('Only valid bearer authentication supported')) {
                
                return {
                    success: false,
                    error: error.message,
                    authRequired: true,
                    reason: 'This content requires user authentication (likely private playlist or user-specific content)'
                };
            }
            
            // Other errors (network, invalid URL, etc.)
            return {
                success: false,
                error: error.message,
                authRequired: false,
                reason: 'Failed to access content'
            };
        }
    }

    async makeRequest(endpoint, token, options = {}) {
        const url = `${this.baseUrl}${endpoint}`;
        
        return new Promise((resolve, reject) => {
            const requestOptions = {
                method: options.method || 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                    ...options.headers
                }
            };

            const req = https.request(url, requestOptions, (res) => {
                let data = '';
                
                res.on('data', (chunk) => {
                    data += chunk;
                });
                
                res.on('end', () => {
                    try {
                        const parsed = JSON.parse(data);
                        
                        if (res.statusCode >= 200 && res.statusCode < 300) {
                            resolve(parsed);
                        } else {
                            console.log(`API Error - Status: ${res.statusCode}, Response:`, parsed);
                            reject(new Error(parsed.error?.message || `HTTP ${res.statusCode}`));
                        }
                    } catch (error) {
                        reject(new Error('Invalid JSON response'));
                    }
                });
            });

            req.on('error', (error) => {
                reject(error);
            });

            if (options.body) {
                req.write(JSON.stringify(options.body));
            }

            req.end();
        });
    }

    async getPlaylist(playlistId, token) {
        try {
            const playlist = await this.makeRequest(`/playlists/${playlistId}`, token);
            const tracks = await this.getPlaylistTracks(playlistId, token);
            
            return {
                id: playlist.id,
                name: playlist.name,
                description: playlist.description,
                owner: playlist.owner.display_name,
                public: playlist.public,
                tracks: tracks,
                total: tracks.length,
                images: playlist.images
            };
        } catch (error) {
            throw new Error(`Failed to get playlist: ${error.message}`);
        }
    }

    async getPlaylistTracks(playlistId, token) {
        const tracks = [];
        let nextUrl = `/playlists/${playlistId}/tracks?limit=50`;
        
        while (nextUrl) {
            try {
                const response = await this.makeRequest(nextUrl, token);
                
                response.items.forEach(item => {
                    if (item.track && item.track.type === 'track') {
                        tracks.push(this.formatTrack(item.track));
                    }
                });
                
                nextUrl = response.next ? response.next.replace(this.baseUrl, '') : null;
            } catch (error) {
                console.error('Error fetching playlist tracks:', error);
                break;
            }
        }
        
        return tracks;
    }

    async getAlbum(albumId, token) {
        try {
            const album = await this.makeRequest(`/albums/${albumId}`, token);
            
            const tracks = album.tracks.items.map(track => this.formatTrack({
                ...track,
                album: {
                    name: album.name,
                    images: album.images,
                    release_date: album.release_date,
                    artists: album.artists
                }
            }));
            
            return {
                id: album.id,
                name: album.name,
                artist: album.artists[0]?.name,
                release_date: album.release_date,
                tracks: tracks,
                total: tracks.length,
                images: album.images
            };
        } catch (error) {
            throw new Error(`Failed to get album: ${error.message}`);
        }
    }

    async getTrack(trackId, token) {
        try {
            const track = await this.makeRequest(`/tracks/${trackId}`, token);
            
            return {
                tracks: [this.formatTrack(track)],
                total: 1,
                name: track.name,
                artist: track.artists[0]?.name
            };
        } catch (error) {
            throw new Error(`Failed to get track: ${error.message}`);
        }
    }

    formatTrack(track) {
        // Extract release year from album release date
        let releaseYear = null;
        if (track.album?.release_date) {
            const releaseDate = new Date(track.album.release_date);
            if (!isNaN(releaseDate.getTime())) {
                releaseYear = releaseDate.getFullYear();
            }
        }
        
        return {
            id: track.id,
            title: track.name,
            artist: track.artists?.map(artist => artist.name).join(', ') || 'Unknown Artist',
            album: track.album?.name || 'Unknown Album',
            album_artist: track.album?.artists?.map(artist => artist.name).join(', ') || null,
            release_year: releaseYear,
            duration_ms: track.duration_ms,
            duration: this.formatDuration(track.duration_ms),
            explicit: track.explicit,
            preview_url: track.preview_url,
            external_urls: track.external_urls,
            images: track.album?.images || [],
            search_query: `${track.artists?.map(artist => artist.name).join(', ')} ${track.name}`.trim()
        };
    }

    formatDuration(ms) {
        if (!ms) return 'Unknown';
        
        const minutes = Math.floor(ms / 60000);
        const seconds = Math.floor((ms % 60000) / 1000);
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }

    extractIdFromUrl(url) {
        // Handle both web URLs and URI format
        const patterns = [
            /https?:\/\/open\.spotify\.com\/(playlist|album|track)\/([a-zA-Z0-9]+)/,
            /spotify:(playlist|album|track):([a-zA-Z0-9]+)/
        ];
        
        for (const pattern of patterns) {
            const match = url.match(pattern);
            if (match) {
                return {
                    type: match[1],
                    id: match[2]
                };
            }
        }
        
        return null;
    }

    async extractContent(url, token) {
        const extracted = this.extractIdFromUrl(url);
        
        if (!extracted) {
            throw new Error('Invalid Spotify URL format');
        }

        switch (extracted.type) {
            case 'playlist':
                return await this.getPlaylist(extracted.id, token);
            case 'album':
                return await this.getAlbum(extracted.id, token);
            case 'track':
                return await this.getTrack(extracted.id, token);
            default:
                throw new Error('Unsupported Spotify content type');
        }
    }

    async searchTrack(query, token) {
        try {
            const searchQuery = querystring.stringify({
                q: query,
                type: 'track',
                limit: 1
            });
            
            const response = await this.makeRequest(`/search?${searchQuery}`, token);
            
            if (response.tracks.items.length > 0) {
                return this.formatTrack(response.tracks.items[0]);
            }
            
            return null;
        } catch (error) {
            console.error('Search error:', error);
            return null;
        }
    }
}

module.exports = new SpotifyService();
