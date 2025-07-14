# Playlistifier Web

A modern web application for converting playlists from Spotify and YouTube into downloadable MP3 files with proper metadata and artwork.

## Features

- **Universal Playlist Support**: Spotify playlists, albums, tracks, and YouTube playlists, channels, videos
- **Real-time Progress Tracking**: Live updates during download process
- **Secure Authentication**: OAuth 2.0 PKCE flow for Spotify (no client secrets required)
- **Metadata Embedding**: Automatic MP3 metadata and artwork embedding
- **Responsive Design**: Works on desktop and mobile devices
- **Batch Downloads**: Process multiple tracks simultaneously

## Prerequisites

Before running Playlistifier Web, ensure you have:

1. **Node.js 18+** installed
2. **yt-dlp** installed and accessible in your PATH
3. **ffmpeg** installed and accessible in your PATH
4. **Spotify Developer Account** for API access (optional - uses built-in client ID by default)

### Installing Dependencies

#### Windows:
```bash
# Install yt-dlp
winget install yt-dlp
# Or download from: https://github.com/yt-dlp/yt-dlp/releases

# Install ffmpeg
winget install ffmpeg
# Or download from: https://ffmpeg.org/download.html
```

#### macOS:
```bash
# Install with Homebrew
brew install yt-dlp ffmpeg
```

#### Linux:
```bash
# Ubuntu/Debian
sudo apt update
sudo apt install yt-dlp ffmpeg

# Or install yt-dlp via pip
pip install yt-dlp
```

## Installation

1. **Clone or extract the project:**
   ```bash
   cd playlistifier-web
   ```

2. **Install Node.js dependencies:**
   ```bash
   npm install
   ```

3. **Download required tools (yt-dlp and ffmpeg):**
   ```bash
   npm run setup
   ```

4. **Set up environment variables:**
   ```bash
   cp .env.example .env
   ```

5. **Configure your `.env` file:**
   ```env
   NODE_ENV=development
   PORT=3000
   SESSION_SECRET=your-secure-session-secret
   SPOTIFY_REDIRECT_URI=http://127.0.0.1:8888/callback
   DOWNLOAD_PATH=./downloads
   ```

### Spotify API Setup (Optional)

Spotify playlists work out of the box with the built-in client ID. If you want to use your own Spotify app:

1. Go to [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Create a new app
3. Set the redirect URI to: `http://127.0.0.1:8888/callback`
4. Add `SPOTIFY_CLIENT_ID=your-client-id` to your `.env` file

**Note**: No client secret is required as we use the PKCE flow.

## Usage

### Development Mode

```bash
npm run dev
```

This starts the server with nodemon for automatic restarting on file changes.

### Production Mode

```bash
npm start
```

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch
```

## How to Use

1. **Start the server** and navigate to `http://localhost:3000`

2. **Enter a URL** from one of the supported platforms:
   - Spotify: `https://open.spotify.com/playlist/...`
   - YouTube: `https://www.youtube.com/playlist?list=...`
   - YouTube: `https://www.youtube.com/watch?v=...`

3. **Authenticate** if required (Spotify playlists need authentication)

4. **Review the tracks** found in the playlist

5. **Start download** and monitor real-time progress

6. **Access your files** in the downloads directory

## Supported URL Types

### Spotify
- Playlists: `https://open.spotify.com/playlist/ID`
- Albums: `https://open.spotify.com/album/ID`
- Tracks: `https://open.spotify.com/track/ID`
- Spotify URIs: `spotify:playlist:ID`

### YouTube
- Playlists: `https://www.youtube.com/playlist?list=ID`
- Videos: `https://www.youtube.com/watch?v=ID`
- Short URLs: `https://youtu.be/ID`
- Channels: `https://www.youtube.com/channel/ID`
- Handle URLs: `https://www.youtube.com/@username`

## File Organization

Downloads are organized in timestamped folders:
```
downloads/
├── download-2025-01-13T12-00-00/
│   ├── track_listing.txt
│   ├── Artist - Track 1.mp3
│   ├── Artist - Track 2.mp3
│   └── ...
```

## API Endpoints

### Core API
- `POST /api/analyze` - Analyze URL and detect platform
- `POST /api/extract` - Extract track information
- `POST /api/download` - Start download process
- `GET /api/download/:id/status` - Check download status

### Authentication
- `GET /api/auth/spotify` - Initiate Spotify OAuth
- `POST /api/auth/spotify/callback` - Handle OAuth callback
- `GET /api/auth/status` - Check authentication status

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `NODE_ENV` | Environment (development/production) | `development` |
| `PORT` | Server port | `3000` |
| `SESSION_SECRET` | Session encryption secret | Required |
| `SPOTIFY_CLIENT_ID` | Spotify app client ID | Optional |
| `SPOTIFY_REDIRECT_URI` | OAuth redirect URI | `http://localhost:3000/auth/spotify/callback` |
| `DOWNLOAD_PATH` | Download directory | `./downloads` |
| `YTDLP_PATH` | Path to yt-dlp executable | `yt-dlp` |
| `FFMPEG_PATH` | Path to ffmpeg executable | `ffmpeg` |

## Troubleshooting

### Common Issues

1. **"yt-dlp not found"**
   - Ensure yt-dlp is installed and in your PATH
   - Try specifying the full path in `YTDLP_PATH`

2. **"ffmpeg not found"**
   - Ensure ffmpeg is installed and in your PATH
   - Try specifying the full path in `FFMPEG_PATH`

3. **Spotify authentication fails**
   - If using custom client ID, check your `SPOTIFY_CLIENT_ID` is correct
   - Verify the redirect URI matches your app settings
   - Ensure you're using `http://localhost:3000` (not `https`)
   - Try removing custom client ID to use the built-in default

4. **Downloads fail**
   - Check that the `DOWNLOAD_PATH` directory is writable
   - Verify internet connectivity
   - Some content may be geo-restricted or unavailable

### Debug Mode

Set `NODE_ENV=development` for detailed error messages and logging.

## Legal Notice

This software is for personal use only. Users are responsible for:
- Complying with platform terms of service
- Ensuring they have rights to download content
- Respecting copyright laws in their jurisdiction

## Version History

- **v1.0.0**: Initial web implementation
  - Complete migration from PowerShell version
  - Modern web interface with real-time progress
  - Spotify and YouTube support
  - Secure authentication and file management

## Contributing

This project follows semantic versioning:
- **+0.01**: Bug fixes
- **+0.10**: New features
- **+1.00**: Major changes or milestones

## License

ISC License - See LICENSE file for details.
