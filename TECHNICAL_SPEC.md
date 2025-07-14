# Playlistifier Web - Technical Implementation Specification

## Architecture Overview

The web version of Playlistifier will be built as a full-stack Node.js application with:
- **Backend**: Express.js server handling API requests, authentication, and download processing
- **Frontend**: Vanilla JavaScript SPA with modern UI components
- **Real-time Communication**: WebSocket connections for live progress updates
- **File Processing**: Server-side yt-dlp and ffmpeg integration

## Technology Stack

### Backend
- **Node.js 18+**: Server runtime
- **Express.js**: Web framework
- **Socket.io**: Real-time communication
- **node-spotify-api**: Spotify Web API integration
- **child_process**: External tool execution (yt-dlp, ffmpeg)
- **multer**: File upload handling (if needed)
- **cors**: Cross-origin resource sharing
- **helmet**: Security middleware

### Frontend
- **Vanilla JavaScript**: No framework dependencies
- **WebSocket/Socket.io**: Real-time updates
- **CSS Grid/Flexbox**: Modern responsive layout
- **Fetch API**: HTTP requests
- **Web Components**: Reusable UI components

### External Tools
- **yt-dlp**: Video/audio extraction
- **ffmpeg**: Audio processing and metadata embedding
- **Auto-installation**: Bundled or downloaded on first run

## API Endpoints

### Core API Routes

#### URL Processing
```
POST /api/analyze
- Body: { url: string }
- Response: { platform: string, type: string, metadata: object }
- Purpose: Analyze URL and extract basic information
```

#### Authentication
```
GET /api/auth/spotify
- Response: { authUrl: string }
- Purpose: Initiate Spotify OAuth flow

POST /api/auth/spotify/callback
- Body: { code: string, state: string }
- Response: { success: boolean, token: string }
- Purpose: Handle OAuth callback and exchange code for token
```

#### Track Extraction
```
POST /api/extract
- Body: { url: string, token?: string }
- Response: { tracks: array, metadata: object }
- Purpose: Extract full track listing from URL
```

#### Download Management
```
POST /api/download
- Body: { tracks: array, options: object }
- Response: { downloadId: string }
- Purpose: Start download process and return tracking ID

GET /api/download/:id/status
- Response: { status: string, progress: object, results: array }
- Purpose: Get download progress and results

POST /api/download/:id/cancel
- Response: { success: boolean }
- Purpose: Cancel ongoing download
```

### WebSocket Events

#### Client to Server
- `join-download`: Join download progress room
- `cancel-download`: Cancel specific download
- `get-status`: Request current status update

#### Server to Client
- `progress-update`: Individual track progress
- `download-complete`: Track finished downloading
- `download-error`: Track download failed
- `batch-complete`: All downloads finished

## Frontend Components

### Main Application (app.js)
- Router functionality
- State management
- API communication
- WebSocket connection handling

### URL Input Component (urlInput.js)
- Real-time validation
- Platform detection
- Error display
- Loading states

### Track List Component (trackList.js)
- Expandable track display
- Search and filtering
- Selection management
- Metadata preview

### Progress Component (progress.js)
- Real-time progress bars
- Download status indicators
- Error handling display
- Batch progress overview

### Options Component (options.js)
- Quality selection
- Format options
- Download location
- Advanced settings

## Data Flow

### URL Processing Flow
1. User enters URL in frontend
2. Frontend validates format and shows loading
3. API analyzes URL and determines platform
4. Authentication flow if required (Spotify)
5. Extract full track listing
6. Display tracks to user with options
7. User configures download options
8. Start download process with WebSocket connection
9. Real-time progress updates
10. Completion notification and results

### State Management
```javascript
// Frontend state structure
const appState = {
  currentUrl: '',
  platform: '',
  tracks: [],
  downloadOptions: {
    format: 'mp3',
    quality: 'best',
    location: './downloads'
  },
  downloads: {
    active: {},
    completed: [],
    failed: []
  },
  auth: {
    spotify: null
  }
};
```

### Backend Session Management
- Use Express sessions for authentication state
- Store OAuth tokens securely
- Track active downloads per session
- Clean up completed downloads periodically

## Security Considerations

### OAuth Implementation
- Use PKCE flow for Spotify (no client secret)
- Secure token storage in session
- Token refresh handling
- Proper scope limitations

### File System Security
- Validate download paths
- Prevent directory traversal
- Sandbox download operations
- Clean up temporary files

### Input Validation
- URL format validation
- Sanitize user inputs
- Rate limiting on API endpoints
- CORS configuration

## Error Handling

### Frontend Error States
- Network connectivity issues
- Authentication failures
- Invalid URLs
- Download failures
- Server errors

### Backend Error Handling
- Graceful degradation
- Retry mechanisms
- Proper error logging
- User-friendly error messages

## Performance Optimizations

### Download Performance
- Parallel download processing
- Queue management
- Resource cleanup
- Progress throttling

### Frontend Performance
- Lazy loading of components
- Efficient DOM updates
- WebSocket connection pooling
- Caching strategies

## Testing Strategy

### Unit Tests
- API endpoint testing
- Component functionality
- Utility function testing
- Error handling verification

### Integration Tests
- End-to-end user flows
- Platform API integration
- Download process testing
- Authentication workflows

### Performance Tests
- Concurrent download handling
- Memory usage monitoring
- WebSocket connection limits
- API response times

## Deployment Considerations

### Production Setup
- Environment variable configuration
- Process management (PM2)
- Reverse proxy setup (nginx)
- SSL/TLS configuration

### Monitoring
- Application logging
- Error tracking
- Performance metrics
- Download statistics

## Development Setup

### Initial Setup
```bash
# Create project structure
mkdir -p server/{routes,services,utils,config}
mkdir -p client/{public,src/{components,utils}}
mkdir -p tests/{unit,integration,e2e}
mkdir downloads

# Initialize Node.js project
npm init -y

# Install dependencies
npm install express socket.io cors helmet
npm install --save-dev jest supertest
```

### Environment Configuration
```javascript
// .env file
NODE_ENV=development
PORT=3000
SPOTIFY_CLIENT_ID=your_client_id
SPOTIFY_REDIRECT_URI=http://localhost:3000/auth/spotify/callback
SESSION_SECRET=your_session_secret
DOWNLOAD_PATH=./downloads
```

### Development Scripts
```json
{
  "scripts": {
    "start": "node server/app.js",
    "dev": "nodemon server/app.js",
    "test": "jest",
    "test:watch": "jest --watch",
    "build": "npm run test && npm run lint",
    "lint": "eslint server/ client/"
  }
}
```

## Migration from PowerShell Version

### Code Reuse Opportunities
- URL detection patterns
- Platform-specific logic
- Metadata extraction methods
- File organization structure

### New Capabilities
- Real-time progress tracking
- Batch processing
- Web-based UI
- Cross-platform compatibility

### Compatibility Considerations
- Same output format and structure
- Maintain existing configuration options
- Preserve user workflow patterns
- Support same platform URLs

---

This technical specification provides the foundation for implementing the Node.js web version of Playlistifier while maintaining compatibility with the existing PowerShell implementation and enhancing the user experience with modern web technologies.
