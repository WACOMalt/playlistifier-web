# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.7.0] - 2025-07-17

### Changed
- Reduced default maximum concurrent downloads from 20 to 10 for better system resource management
- Improved input handler for concurrent downloads setting to ensure proper value updates
- Enhanced default concurrency balance for more stable download performance

### Fixed
- Fixed input field default value synchronization between HTML and JavaScript
- Ensured consistent concurrent download limits across all download operations

## [1.6.0] - 2025-07-17

### Fixed
- Fixed Spotify playlist thumbnail display issue where YouTube thumbnails were replacing Spotify album artwork in the frontend
- Frontend now correctly prioritizes Spotify album artwork for Spotify playlists while maintaining YouTube thumbnails for non-Spotify sources
- Preserved existing download functionality which already used correct artwork sources

### Technical Details
- Updated `updateTrackThumbnail` method to check for existing `spotify-artwork` class and preserve it
- Added logic to only replace thumbnails if they are `youtube-thumbnail` class or no existing image
- Improved thumbnail management with better CSS class handling

## [1.5.0] - 2025-07-16

### Added
- M3U playlist file generation for downloaded tracks
- M3U files now included in ZIP downloads and folder saves
- Enhanced album art embedding in backend using FFmpeg
- Improved metadata tagging for better Windows Media Player compatibility

### Improved
- Better album artwork handling in downloads
- Enhanced metadata preservation in MP3 files
- Improved file organization in downloads

## [1.4.0] - 2025-07-15

### Added
- File System Access API support for direct folder downloads
- "Download to Folder" functionality for Chrome 86+, Edge 86+, Opera 72+
- Track numbering option in ZIP downloads
- Improved concurrent download management

### Enhanced
- Better download progress tracking
- Improved file naming and organization
- Enhanced ZIP file creation with proper track ordering

## [1.3.0] - 2025-07-14

### Added
- Individual track download and save functionality
- Real-time download progress tracking
- Staggered download queue with configurable concurrency
- Track-by-track status management

### Improved
- Better error handling for individual track failures
- Enhanced UI feedback for download states
- Improved concurrent download performance

## [1.2.0] - 2025-07-13

### Added
- Real-time YouTube URL search with progress tracking
- Concurrent search functionality with queue management
- Live track status updates during search
- Enhanced search result display

### Improved
- Better search performance with batched requests
- Improved UI responsiveness during searches
- Enhanced error handling for search failures

## [1.1.0] - 2025-07-12

### Added
- YouTube URL generation and display
- Copy to clipboard functionality
- Save URLs to file feature
- Track info toggle for URL display

### Enhanced
- Better playlist metadata handling
- Improved URL formatting and organization
- Enhanced user interface for URL management

## [1.0.0] - 2025-07-11

### Added
- Initial release of Playlistifier Web
- Spotify playlist analysis and track extraction
- YouTube playlist support
- Basic download functionality
- ZIP file creation for batch downloads
- Web-based interface with real-time progress
- Spotify OAuth integration
- Socket.io for real-time updates

### Features
- Support for Spotify and YouTube playlists
- MP3 download with metadata
- Batch download with progress tracking
- Real-time WebSocket communication
- Responsive web interface
- Cross-platform compatibility
