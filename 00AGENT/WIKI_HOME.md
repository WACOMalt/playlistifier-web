# Playlistifier Web - Documentation Wiki

> **📚 Complete technical documentation and analysis of the Playlistifier Web project**

This wiki provides comprehensive documentation for developers, contributors, and users wanting to understand the technical implementation of Playlistifier Web.

## 📖 Documentation Structure

| Document | Purpose | Target Audience |
|----------|---------|----------------|
| **[[Executive Summary]]** | High-level project overview and business value | Stakeholders, Project Managers |
| **[[Project Analysis]]** | Comprehensive technical analysis | Developers, Contributors |
| **[[Technical Deep Dive]]** | Implementation details and architecture | Senior Developers, Architects |
| **[[Version History]]** | Development timeline and changelog | All Users |

## 🚀 Quick Start

**New to the project?** Start with the **[[Executive Summary]]** for an overview.

**Developer joining the team?** Read the **[[Project Analysis]]** for architecture understanding.

**Need implementation details?** Check the **[[Technical Deep Dive]]** for in-depth information.

**Looking for changes?** See the **[[Version History]]** for development timeline.

## Project Overview

Playlistifier Web is a sophisticated full-stack web application that converts music playlists from Spotify and YouTube into downloadable MP3 files with embedded metadata and artwork. It represents a complete modernization of an original PowerShell-based application.

### How It Works
1. **URL Analysis**: Accepts playlist URLs from Spotify or YouTube
2. **Authentication**: Uses hybrid approach - public API first, OAuth fallback
3. **Track Extraction**: Retrieves comprehensive metadata and artwork
4. **Download Processing**: Concurrent audio extraction using yt-dlp
5. **Metadata Embedding**: Applies ID3 tags and artwork using FFmpeg
6. **File Organization**: Creates timestamped folders with playlists

### Technical Architecture
- **Backend**: Node.js/Express with Socket.io for real-time updates
- **Frontend**: Vanilla JavaScript with Windows 98 aesthetic (98.css)
- **External Tools**: yt-dlp for video extraction, FFmpeg for audio processing
- **Security**: OAuth 2.0 PKCE flow, session management, input validation
- **Performance**: Configurable concurrent downloads (1-20 simultaneous)

### Key Innovations
- **Hybrid Authentication**: Seamless user experience with minimal friction
- **Real-time Progress**: WebSocket-powered live updates
- **Modern Browser Integration**: Direct folder downloads using File System Access API
- **Cross-Platform Compatibility**: Works on Windows, macOS, and Linux

## Current Status

- **Version**: 1.8.0 (July 17, 2025)
- **Repository**: https://github.com/WACOMalt/playlistifier-web.git
- **Status**: Active development with regular updates
- **License**: ISC

## Supported Platforms

### Spotify
- ✅ Playlists: `https://open.spotify.com/playlist/ID`
- ✅ Albums: `https://open.spotify.com/album/ID`
- ✅ Tracks: `https://open.spotify.com/track/ID`
- ✅ Spotify URIs: `spotify:playlist:ID`

### YouTube
- ✅ Playlists: `https://www.youtube.com/playlist?list=ID`
- ✅ Videos: `https://www.youtube.com/watch?v=ID`
- ✅ Channels: `https://www.youtube.com/channel/ID`
- ✅ Handle URLs: `https://www.youtube.com/@username`

## Repository Structure

```
playlistifier-web/
├── server/                 # Node.js backend
│   ├── app.js             # Express server entry point
│   ├── routes/            # API endpoints
│   ├── services/          # Business logic
│   ├── utils/             # Utility functions
│   └── config/            # Configuration
├── client/                # Frontend web application
│   └── public/            # Static assets and HTML
├── downloads/             # Output directory
├── tests/                 # Test suites
└── 00AGENT/               # Documentation source files
```

## Getting Started

1. **Installation**: Follow the setup instructions in the main README
2. **Configuration**: Set up environment variables
3. **Development**: Use `npm run dev` for development mode
4. **Production**: Use `npm start` for production deployment

For detailed setup instructions, see the main repository README.

---

*This wiki was generated from comprehensive project analysis and technical review*
