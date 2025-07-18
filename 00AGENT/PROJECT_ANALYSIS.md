# Project Analysis

> **Comprehensive technical analysis for developers and contributors**

## Project Overview

Playlistifier Web is a modern full-stack Node.js application that converts music playlists from Spotify and YouTube into downloadable MP3 files with embedded metadata and artwork. This represents a complete architectural modernization from the original PowerShell console application.

| **Attribute** | **Value** |
|---------------|----------|
| **Current Version** | 1.8.0 (July 17, 2025) |
| **Repository** | [WACOMalt/playlistifier-web](https://github.com/WACOMalt/playlistifier-web.git) |
| **License** | ISC |
| **Node.js Version** | 18+ |
| **Development Status** | Active |

## Core Capabilities

### Supported Platforms
| Platform | Content Types | Authentication |
|----------|---------------|----------------|
| **Spotify** | Playlists, Albums, Tracks | Hybrid (Public API + OAuth) |
| **YouTube** | Playlists, Channels, Videos | Public API |

### Key Features
- **🔄 Real-time Progress**: WebSocket-based live updates
- **🔐 Secure Authentication**: OAuth 2.0 PKCE flow (no client secrets)
- **⚡ Concurrent Processing**: Configurable parallel downloads (1-20)
- **🎵 Quality Audio**: High-fidelity MP3 with embedded metadata
- **📁 Smart Organization**: Timestamped folders with M3U playlists
- **🌐 Cross-Platform**: Windows, macOS, Linux compatibility
- **🎨 Modern UI**: Windows 98 aesthetic with contemporary functionality

## Architecture

### Backend (Node.js/Express)
- **Entry Point**: `server/app.js`
- **Framework**: Express.js with Socket.io for real-time communication
- **Security**: Helmet.js, CORS, express-session
- **External Tools**: yt-dlp for video extraction, FFmpeg for audio processing

### Frontend (Vanilla JavaScript)
- **Main File**: `client/public/src/app.js`
- **UI Framework**: 98.css for retro Windows styling
- **Real-time**: Socket.io client for live updates
- **Libraries**: JSZip for file compression

### External Dependencies
- **yt-dlp**: YouTube and video platform downloading
- **FFmpeg**: Audio processing and metadata embedding
- **Node.js 18+**: Runtime environment

## Core Services

### 1. Spotify Service (`server/services/spotify.js`)
- **Authentication**: Hybrid approach - tries public API first, falls back to OAuth
- **Content Types**: Playlists, albums, individual tracks
- **Features**: Automatic thumbnail extraction, metadata parsing
- **Error Handling**: Graceful degradation for private content

### 2. YouTube Service (`server/services/youtube.js`) 
- **Content Types**: Playlists, channels, individual videos
- **Features**: Video info extraction, playlist parsing, thumbnail generation
- **Limitations**: Channel videos limited to first 50 for performance

### 3. Download Service (`server/services/downloader.js`)
- **Queue Management**: Configurable concurrent downloads (default: 10)
- **Process Flow**: Search → Download → Metadata embedding → File organization
- **File Management**: Automatic cleanup, session tracking, process monitoring
- **Metadata**: Album art embedding, ID3 tags, cropping YouTube thumbnails to square

## API Endpoints

### Core API (`/api/`)
- `POST /api/analyze` - URL analysis and platform detection
- `POST /api/extract` - Track information extraction
- `POST /api/download` - Download process initiation
- `GET /api/download/:id/status` - Download progress tracking

### Authentication (`/api/auth/`)
- `GET /api/auth/spotify` - Spotify OAuth initiation
- `POST /api/auth/spotify/callback` - OAuth callback handling
- `GET /api/auth/status` - Authentication status check

### Search (`/api/search/`)
- `POST /api/search/youtube` - YouTube URL search for tracks

### Download Management (`/api/download/`)
- Download progress tracking
- Individual track downloads
- Bulk download management

## User Flow

1. **URL Input**: User enters Spotify or YouTube URL
2. **Analysis**: Platform detection and content type identification
3. **Authentication**: Spotify OAuth if required (private content)
4. **Track Extraction**: Retrieval of track metadata and information
5. **Display**: Track listing with thumbnails and metadata
6. **Download Options**: Concurrent downloads, track numbering, format selection
7. **Download Process**: Real-time progress with WebSocket updates
8. **File Organization**: Timestamped folders with track listings and M3U playlists

## File Structure

```
playlistifier-web/
├── server/                 # Backend Node.js application
│   ├── app.js             # Express server entry point
│   ├── routes/            # API route handlers
│   ├── services/          # Business logic (Spotify, YouTube, Downloader)
│   ├── utils/             # Utility functions
│   └── config/            # Configuration files
├── client/                # Frontend web application
│   └── public/            # Static assets and HTML
│       ├── index.html     # Main application UI
│       ├── src/           # JavaScript source files
│       └── styles.css     # Application styling
├── downloads/             # Download output directory
├── tests/                 # Test suites
└── docs/                  # Additional documentation
```

## Key Technologies

### Runtime & Framework
- **Node.js 18+**: Server runtime
- **Express.js**: Web framework
- **Socket.io**: Real-time communication

### Frontend
- **Vanilla JavaScript**: No framework dependencies
- **98.css**: Windows 98 styling framework
- **WebSocket**: Real-time updates

### External Tools
- **yt-dlp**: Video/audio extraction
- **FFmpeg**: Audio processing and metadata
- **Sharp**: Image processing
- **Gifsicle**: GIF optimization

### Development
- **Jest**: Testing framework
- **Nodemon**: Development server
- **ESLint**: Code linting (configured)

## Recent Updates (v1.8.0)

### New Features
- M3U8 playlist format with full Unicode support
- Enhanced thumbnail display
- Improved concurrent download handling
- Better error handling for private content

### Bug Fixes
- Fixed Spotify playlist thumbnail issues
- Improved input field synchronization
- Enhanced metadata embedding

## Security Considerations

### Authentication
- OAuth 2.0 PKCE flow (no client secrets)
- Session-based token storage
- Automatic token refresh

### File System
- Sandboxed download operations
- Input validation and sanitization
- Automatic cleanup of temporary files

### Network
- Rate limiting on API endpoints
- CORS configuration
- Secure headers via Helmet.js

## Performance Features

### Download Optimization
- Configurable concurrent downloads (1-20, default: 10)
- Queue management with process delays
- Progress throttling for UI updates

### Resource Management
- Automatic cleanup of temporary files
- Session-based process tracking
- Memory-efficient streaming

## Error Handling

### Network Issues
- Retry logic for failed downloads
- Graceful degradation for rate limiting
- Timeout handling

### Platform Issues
- Private content detection
- Geographic restrictions
- API changes adaptation

### File System Issues
- Permission handling
- Disk space monitoring
- Path validation

## Legal Compliance

### User Responsibility
- Clear disclaimers about content ownership
- Compliance with platform terms of service
- Copyright law adherence

### Technical Compliance
- No circumvention of platform restrictions
- API rate limit respect
- No unauthorized content access

## Future Development

### Planned Features
- Additional platform support (SoundCloud, Bandcamp)
- Format options (FLAC, WAV)
- Playlist merging capabilities
- Advanced metadata editing

### Technical Improvements
- Database integration for user preferences
- Enhanced error recovery
- Performance optimizations
- Mobile app development

## Development Environment

### Setup Requirements
- Node.js 18+ with npm
- Git for version control
- yt-dlp and FFmpeg (auto-installed)

### Configuration
- Environment variables in `.env`
- Spotify client ID (optional, uses default)
- Download paths and concurrency settings

### Testing
- Unit tests with Jest
- Integration tests for API endpoints
- End-to-end testing for user workflows

## Monitoring and Maintenance

### Logging
- Comprehensive error logging
- Download progress tracking
- Session management logs

### Cleanup
- Automatic temporary file removal
- Session-based process cleanup
- Download history management

### Updates
- Regular dependency updates
- Platform API compatibility
- Security patch management

---

This analysis provides a comprehensive overview of the Playlistifier Web project's current state, architecture, and capabilities as of version 1.8.0.
