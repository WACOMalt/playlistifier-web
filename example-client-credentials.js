// Example: Secure Client Credentials Implementation
// This would be SERVER-SIDE ONLY

const SpotifyWebApi = require('spotify-web-api-node');

class SpotifyClientCredentialsService {
    constructor() {
        this.spotifyApi = new SpotifyWebApi({
            clientId: process.env.SPOTIFY_CLIENT_ID,
            clientSecret: process.env.SPOTIFY_CLIENT_SECRET  // SECRET STAYS ON SERVER
        });
        this.tokenExpiryTime = null;
    }

    async ensureValidToken() {
        if (!this.tokenExpiryTime || Date.now() > this.tokenExpiryTime) {
            try {
                const data = await this.spotifyApi.clientCredentialsGrant();
                this.spotifyApi.setAccessToken(data.body['access_token']);
                this.tokenExpiryTime = Date.now() + (data.body['expires_in'] * 1000);
                console.log('Client Credentials token refreshed');
            } catch (error) {
                console.error('Error getting client credentials token:', error);
                throw error;
            }
        }
    }

    async getPublicTrackInfo(trackId) {
        await this.ensureValidToken();
        try {
            const data = await this.spotifyApi.getTrack(trackId);
            return {
                id: data.body.id,
                name: data.body.name,
                artists: data.body.artists.map(artist => artist.name),
                album: data.body.album.name,
                duration_ms: data.body.duration_ms,
                preview_url: data.body.preview_url,
                external_urls: data.body.external_urls
            };
        } catch (error) {
            console.error('Error getting track info:', error);
            throw error;
        }
    }

    async getPublicAlbumInfo(albumId) {
        await this.ensureValidToken();
        try {
            const data = await this.spotifyApi.getAlbum(albumId);
            return {
                id: data.body.id,
                name: data.body.name,
                artists: data.body.artists.map(artist => artist.name),
                tracks: data.body.tracks.items.map(track => ({
                    id: track.id,
                    name: track.name,
                    artists: track.artists.map(artist => artist.name),
                    duration_ms: track.duration_ms
                }))
            };
        } catch (error) {
            console.error('Error getting album info:', error);
            throw error;
        }
    }

    async getPublicPlaylistInfo(playlistId) {
        await this.ensureValidToken();
        try {
            const data = await this.spotifyApi.getPlaylist(playlistId);
            return {
                id: data.body.id,
                name: data.body.name,
                description: data.body.description,
                owner: data.body.owner.display_name,
                tracks: data.body.tracks.items.map(item => ({
                    id: item.track.id,
                    name: item.track.name,
                    artists: item.track.artists.map(artist => artist.name),
                    album: item.track.album.name,
                    duration_ms: item.track.duration_ms
                }))
            };
        } catch (error) {
            // This might fail for private playlists
            console.error('Error getting playlist info:', error);
            throw error;
        }
    }
}

// SERVER-SIDE ROUTE EXAMPLE
app.get('/api/spotify/track/:id', async (req, res) => {
    try {
        const trackInfo = await spotifyService.getPublicTrackInfo(req.params.id);
        res.json(trackInfo);
    } catch (error) {
        res.status(500).json({ error: 'Failed to get track info' });
    }
});

module.exports = SpotifyClientCredentialsService;
