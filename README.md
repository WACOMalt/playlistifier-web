# Playlistifier Web

Convert Spotify and YouTube playlists to lists of links, with optional yt-dlp powered download manager for discovered youtube links.

[![Version](https://img.shields.io/badge/version-1.9.0-blue.svg)](https://github.com/WACOMalt/playlistifier-web/releases)
[![Node.js](https://img.shields.io/badge/node.js-18+-green.svg)](https://nodejs.org/)
[![License](https://img.shields.io/badge/license-ISC-yellow.svg)](LICENSE)


### Prerequisites
- **Node.js 18+**
- **yt-dlp** (auto-installed via `npm run setup`)
- **ffmpeg** (auto-installed via `npm run setup`)

### Installation

```bash
# Clone the repository
git clone https://github.com/WACOMalt/playlistifier-web.git
cd playlistifier-web

# Install dependencies
npm install

# Setup external tools
npm run setup

# Configure environment
cp .env.example .env

# Start development server
npm run dev
```

### Usage

1. Navigate to `http://localhost:3000`
2. Enter a playlist URL (Spotify or YouTube)
3. Authenticate if required (Spotify private playlists)
4. Review tracks and start download
5. Monitor real-time progress
6. Access files in `./downloads/` directory

## Supported URLs

### Spotify
- Playlists: `https://open.spotify.com/playlist/ID`
- Albums: `https://open.spotify.com/album/ID`
- Tracks: `https://open.spotify.com/track/ID`

### YouTube
- Playlists: `https://www.youtube.com/playlist?list=ID`
- Videos: `https://www.youtube.com/watch?v=ID`
- Channels: `https://www.youtube.com/channel/ID`

This software is for personal use only. Users are responsible for complying with platform terms of service and copyright laws.
