# Environment Setup

## Quick Start

1. **Copy the example environment file:**
   ```bash
   cp .env.example .env
   ```

2. **Edit the `.env` file and replace the placeholder values:**
   - `SPOTIFY_CLIENT_SECRET`: Your Spotify app's client secret
   - `SESSION_SECRET`: A random string for session security

3. **Start the development server:**
   ```bash
   npm run dev
   ```

## Environment Variables

### Required for Hybrid Authentication

- `SPOTIFY_CLIENT_SECRET`: Required for the hybrid authentication system to work with public Spotify content
- `SESSION_SECRET`: Used for secure session management

### Optional Variables

- `SPOTIFY_CLIENT_ID`: Defaults to built-in client ID if not specified
- `SPOTIFY_REDIRECT_URI`: OAuth redirect URI for authentication
- `PORT`: Server port (defaults to 3000)
- `NODE_ENV`: Environment mode (development/production)

## How Hybrid Authentication Works

With the `SPOTIFY_CLIENT_SECRET` set:

1. **Public Content**: Accessed instantly without user authentication
   - Public tracks, albums, playlists
   - Uses Spotify Client Credentials flow

2. **Private Content**: Requires user authentication only when needed
   - Private playlists, user libraries
   - Falls back to OAuth flow with clear user messaging

Without the `SPOTIFY_CLIENT_SECRET`:
- All Spotify content requires user authentication (legacy behavior)

## Security

- **Never commit `.env` files** - they're ignored by git
- **Use strong session secrets** in production
- **Rotate secrets regularly** for production deployments

## Development vs Production

### Development (`.env`)
```bash
NODE_ENV=development
PORT=3000
SPOTIFY_CLIENT_SECRET=your-dev-secret
SESSION_SECRET=your-dev-session-secret
```

### Production
Set environment variables through your hosting platform's configuration system, not through `.env` files.
