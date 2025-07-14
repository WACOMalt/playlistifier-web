# Playlistifier Web - Project Overview

## What is Playlistifier?

Playlistifier is a universal playlist converter application that allows users to extract track information from various music streaming services and video platforms, then download the audio content as MP3 files with proper metadata and artwork embedding.

## Original Implementation

The original Playlistifier was built as a PowerShell console application (`playlistifier_unified.ps1`) compiled into a Windows executable (`Playlistifier.exe`). It successfully handles:
- Spotify playlists, albums, and individual tracks
- YouTube playlists, channels, and individual videos
- Various other YouTube URL formats

## New Web Implementation

This project aims to create a modern web-based version of Playlistifier using Node.js, providing:
- Cross-platform compatibility (Windows, macOS, Linux)
- Modern web UI with real-time progress tracking
- Better user experience with responsive design
- Batch processing capabilities
- Server-side processing with client-side interface

## Core Functionality

### Input Processing
The application accepts URLs from supported platforms:
- **Spotify**: Playlists, albums, and individual tracks
- **YouTube**: Playlists, channels, individual videos, and other URL variations
- **Auto-detection**: Automatically identifies the URL type and processes accordingly

### Processing Pipeline
1. **URL Analysis**: Determines the source platform and content type
2. **Metadata Extraction**: Fetches track information, titles, artists, and artwork
3. **Track Listing**: Displays all found tracks to the user
4. **User Options**: Presents download options and settings
5. **Download Execution**: Downloads audio files with embedded metadata
6. **Organization**: Creates organized folder structures with proper naming

### Output Structure
```
[Current Working Directory or Fallback]/
├── [Playlist Name]/
│   ├── Songs_[Playlist Name].txt    # Track listing
│   ├── Track 1.mp3                  # Downloaded audio files
│   ├── Track 2.mp3
│   └── ...
└── playlistifier/                   # Fallback directory (if CWD not writable)
```

## User Interaction Flow

### 1. Initial Launch
- Application displays welcome banner with version information
- Prompts user to enter a URL from supported platforms

### 2. URL Input & Validation
- User enters URL (Spotify/YouTube/etc.)
- Application validates URL format and determines platform
- If invalid, prompts for re-entry

### 3. Authentication (Platform-specific)
- **Spotify**: Uses PKCE OAuth flow (no client secret required)
- **YouTube**: Uses yt-dlp for public content access
- Opens browser for authentication if required

### 4. Content Analysis
- Extracts playlist/album/track information
- Displays track count and basic metadata
- Shows processing progress

### 5. Track Listing Display
- Shows all discovered tracks with numbering
- Displays track names, artists, and duration (if available)
- Creates text file with track listing

### 6. Options Menu
After processing, user is presented with options:
- **D**: Download all tracks as MP3
- **O**: Open playlist folder in file explorer
- **R**: Restart with new URL
- **Q**: Quit application

### 7. Download Process (if selected)
- Creates organized folder structure
- Downloads each track with progress indication
- Embeds metadata (title, artist, album, artwork)
- Uses ffmpeg for high-quality audio processing
- Handles errors gracefully with retry logic

### 8. Post-Download Options
- **O**: Open download folder
- **R**: Process another URL
- **Q**: Exit application

## Web UI User Flow

The web version will transform the console experience into a modern web interface:

### 1. Landing Page
- Clean, responsive design with URL input field
- Platform logos/icons for supported services
- Brief instructions and examples

### 2. URL Processing
- Real-time URL validation with visual feedback
- Loading spinner during platform detection
- Error messages for invalid URLs

### 3. Authentication Flow
- OAuth popup/redirect for Spotify authentication
- Progress indicators during authentication
- Clear success/error states

### 4. Track Discovery
- Live progress bar during track extraction
- Real-time track count updates
- Expandable track listing with search/filter

### 5. Download Options
- Interactive download button with progress
- Real-time download progress for each track
- Batch download status with individual track states

### 6. Results Dashboard
- Download summary with success/failure counts
- Links to download folders
- Option to process additional URLs
- Download history (session-based)

### 7. Advanced Features
- Batch URL processing (multiple URLs at once)
- Quality selection dropdown
- Format options (MP3, FLAC, etc.)
- Playlist merging capabilities

## Technical Architecture

### Dependencies
- **yt-dlp**: YouTube and general video platform downloading
- **ffmpeg**: Audio processing and metadata embedding
- **Platform APIs**: Spotify Web API for metadata
- **Authentication**: OAuth 2.0 PKCE for Spotify

### State Management
- Persistent session state for user preferences
- Proper cleanup of temporary files
- Robust error handling and recovery

### Directory Handling
- Attempts to use current working directory
- Falls back to user's Documents folder if current directory is not writable
- Creates "playlistifier" subfolder in fallback location

## Error Handling & Edge Cases

### Network Issues
- Retry logic for failed downloads
- Graceful handling of rate limiting
- Offline mode detection

### Permission Issues
- Directory writability checks
- Fallback directory creation
- Proper error messaging

### Platform-Specific Issues
- Invalid/private content handling
- Age-restricted content
- Geographic restrictions

## Security Considerations

### Credentials
- No hardcoded secrets in source code
- OAuth tokens stored temporarily in memory only
- Client secrets not required (PKCE flow)

### Legal Compliance
- Generic platform references in documentation
- Clear disclaimer about user responsibility
- No circumvention of platform restrictions

## File Organization

### Source Structure
```
playlistifier-web/
├── server/                  # Node.js backend
│   ├── app.js              # Express application entry point
│   ├── routes/             # API routes
│   │   ├── api.js          # Main API endpoints
│   │   ├── auth.js         # Authentication routes
│   │   └── download.js     # Download management
│   ├── services/           # Business logic
│   │   ├── spotify.js      # Spotify API integration
│   │   ├── youtube.js      # YouTube/yt-dlp integration
│   │   ├── downloader.js   # Download orchestration
│   │   └── metadata.js     # Metadata embedding
│   ├── utils/              # Utility functions
│   │   ├── auth.js         # OAuth helpers
│   │   ├── fileUtils.js    # File operations
│   │   └── validation.js   # Input validation
│   └── config/             # Configuration
│       ├── database.js     # Database setup (if needed)
│       └── constants.js    # App constants
├── client/                 # Frontend web app
│   ├── public/             # Static assets
│   │   ├── index.html      # Main HTML file
│   │   ├── styles.css      # Styling
│   │   └── favicon.ico     # App icon
│   ├── src/                # Frontend source
│   │   ├── app.js          # Main application logic
│   │   ├── components/     # UI components
│   │   │   ├── urlInput.js
│   │   │   ├── trackList.js
│   │   │   ├── progress.js
│   │   │   └── options.js
│   │   └── utils/          # Client utilities
│   │       ├── api.js      # API communication
│   │       └── dom.js      # DOM manipulation
├── downloads/              # Download output directory
├── tests/                  # Test suites
│   ├── unit/               # Unit tests
│   ├── integration/        # Integration tests
│   └── e2e/                # End-to-end tests
├── docs/                   # Documentation
├── package.json            # Node.js dependencies
├── package-lock.json       # Lockfile
└── README.md               # User documentation
```

## Future Development Goals

### Web Interface
- Modern web UI for easier access
- Real-time progress tracking
- Batch URL processing
- User preference storage

### Enhanced Features
- Multiple format support (FLAC, WAV, etc.)
- Quality selection options
- Playlist merging capabilities
- Duplicate detection and handling

### Platform Expansion
- Additional streaming services
- Podcast platform support
- SoundCloud integration
- Bandcamp support

## Version Information

- **Current Version**: 0.2 (PowerShell implementation)
- **Target Version**: 1.0 (Node.js web implementation)
- **Versioning Strategy**: Increment by 0.01 for bugfixes, 0.10 for new features, 1.00 for major milestones

## Development Environment

### Requirements
- Node.js 18+ with npm
- Modern web browser for testing
- Platform-specific tools for testing
- Git for version control
- yt-dlp and ffmpeg (bundled or auto-installed)

### Testing Strategy
- Unit tests for core functionality
- Integration tests for platform APIs
- End-to-end tests for user workflows
- Performance benchmarks

## Legal and Ethical Considerations

### User Responsibility
- Users must comply with platform terms of service
- Content must be legally accessible to the user
- No circumvention of platform restrictions

### Data Privacy
- No user data collection or storage
- Temporary authentication tokens only
- No analytics or tracking

### Platform Compliance
- Respect API rate limits
- Follow platform guidelines
- Avoid terms of service violations

## Support and Maintenance

### Known Issues
- ffmpeg dependency management
- Platform API changes
- Network connectivity requirements

### Troubleshooting
- Clear error messages
- Fallback mechanisms
- Recovery procedures

### Updates
- Regular dependency updates
- Platform API compatibility
- Security patches

---

This document serves as the comprehensive reference for understanding Playlistifier's purpose, functionality, and architecture. Future agents working on this project should refer to this document to understand the full scope and requirements of the application.
