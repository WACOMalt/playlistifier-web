# Playlistifier Web - Agent Quick Start Guide

## Project Context

You are working on **Playlistifier Web**, a Node.js web application that converts playlists from music streaming services (Spotify, YouTube, etc.) into downloadable MP3 files with proper metadata and artwork.

## What You Need to Know

### Original Version
- There's a working PowerShell version at `C:\Users\WACOMalt\Desktop\utubelinks\`
- It successfully handles Spotify and YouTube URLs
- Downloads MP3s with embedded metadata and artwork
- Uses yt-dlp and ffmpeg for processing

### This Project (Web Version)
- **Location**: `C:\Users\WACOMalt\Desktop\playlistifier-web\`
- **Goal**: Create a modern web interface for the same functionality
- **Technology**: Node.js backend with vanilla JavaScript frontend
- **Target Version**: 1.0 (starting from PowerShell v0.2)

## Key Files to Reference

1. **PROJECT_OVERVIEW.md** - Complete project documentation
2. **TECHNICAL_SPEC.md** - Implementation details and architecture
3. **AGENT_QUICK_START.md** - This file (your quick reference)

## Core Functionality Expected

### Input Processing
- Accept URLs from Spotify (playlists, albums, tracks)
- Accept URLs from YouTube (playlists, channels, videos)
- Auto-detect platform and content type

### Processing Pipeline
1. URL validation and platform detection
2. Authentication (Spotify OAuth, YouTube public access)
3. Extract track metadata and listings
4. Present download options to user
5. Download audio files with metadata embedding
6. Organize output in structured folders

### User Interface Flow
1. **Landing Page**: URL input with platform detection
2. **Authentication**: OAuth flow for Spotify if needed
3. **Track Listing**: Display extracted tracks with options
4. **Download Progress**: Real-time progress tracking
5. **Results**: Download summary and file access

## Technical Architecture

### Backend (Node.js + Express)
- API endpoints for URL processing and downloads
- WebSocket for real-time progress updates
- Integration with yt-dlp and ffmpeg
- Spotify Web API integration
- Session management for authentication

### Frontend (Vanilla JavaScript)
- Single-page application with components
- Real-time UI updates via WebSocket
- Responsive design for all devices
- No framework dependencies

### External Dependencies
- **yt-dlp**: Audio extraction from video platforms
- **ffmpeg**: Audio processing and metadata embedding
- **Spotify Web API**: Playlist and track metadata

## Version Management Rule

When updating version numbers, follow this rule:
- **+0.01**: Bugfixes only
- **+0.10**: New core functionality
- **+1.00**: Major flow changes or milestones

## Common Tasks You Might Be Asked

### Project Setup
- Initialize Node.js project structure
- Install dependencies and configure environment
- Set up development and testing scripts

### Core Development
- Implement URL processing and platform detection
- Create authentication flows (especially Spotify OAuth)
- Build download management system
- Develop real-time progress tracking

### Frontend Development
- Create responsive web interface
- Implement interactive components
- Add real-time progress updates
- Design user-friendly error handling

### Testing and Deployment
- Write unit and integration tests
- Set up development environment
- Configure production deployment
- Implement monitoring and logging

## Important Security Notes

### Authentication
- Use Spotify PKCE OAuth flow (no client secret required)
- Store tokens securely in session
- Implement proper token refresh

### File System
- Validate all file paths to prevent directory traversal
- Use sandboxed download operations
- Clean up temporary files properly

### Input Validation
- Sanitize all user inputs
- Validate URL formats before processing
- Implement rate limiting on API endpoints

## Legal and Compliance

### Safe Practices
- Use generic platform references in documentation
- Include user responsibility disclaimers
- Respect platform terms of service and rate limits
- No hardcoded secrets or credentials

### Output Organization
- Create structured folder hierarchies
- Use proper file naming conventions
- Maintain compatibility with PowerShell version output

## Quick Reference Commands

### Development Setup
```bash
# Navigate to project directory
cd "C:\Users\WACOMalt\Desktop\playlistifier-web"

# Initialize Node.js project
npm init -y

# Install basic dependencies
npm install express socket.io cors helmet

# Install development dependencies
npm install --save-dev nodemon jest supertest
```

### Testing Original Version
```bash
# Navigate to PowerShell version
cd "C:\Users\WACOMalt\Desktop\utubelinks"

# Run the executable to see expected behavior
.\Playlistifier.exe
```

## Getting Help

### Reference Materials
- Check PROJECT_OVERVIEW.md for complete functionality description
- Review TECHNICAL_SPEC.md for implementation details
- Look at PowerShell version for working examples

### Common Issues
- Directory permissions and fallback handling
- OAuth authentication flow implementation
- Real-time progress tracking setup
- External tool integration (yt-dlp, ffmpeg)

### Testing Strategy
- Test with both Spotify and YouTube URLs
- Verify metadata embedding works correctly
- Check file organization matches PowerShell version
- Test error handling and edge cases

## Success Criteria

Your implementation should:
1. ✅ Process same URL types as PowerShell version
2. ✅ Download MP3s with proper metadata and artwork
3. ✅ Provide real-time progress updates
4. ✅ Create organized folder structures
5. ✅ Handle authentication flows securely
6. ✅ Work across different platforms and browsers
7. ✅ Include comprehensive error handling
8. ✅ Maintain legal compliance and security

---

**Remember**: This is a migration/enhancement project. The PowerShell version works perfectly - your job is to recreate that functionality in a modern web interface while adding new capabilities like real-time progress tracking and batch processing.
