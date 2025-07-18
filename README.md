# Playlistifier Web

> **🎵 Convert Spotify and YouTube playlists to high-quality MP3 files with embedded metadata and artwork**

[![Version](https://img.shields.io/badge/version-1.9.0-blue.svg)](https://github.com/WACOMalt/playlistifier-web/releases)
[![Node.js](https://img.shields.io/badge/node.js-18+-green.svg)](https://nodejs.org/)
[![License](https://img.shields.io/badge/license-ISC-yellow.svg)](LICENSE)

A modern, full-stack web application that transforms your music playlists into organized, downloadable audio files with professional-grade metadata and artwork embedding.

## ✨ Key Features

- **🔄 Real-time Progress**: Live WebSocket updates during downloads
- **🔐 Secure Authentication**: OAuth 2.0 PKCE flow (no client secrets)
- **⚡ Concurrent Processing**: Configurable parallel downloads (1-20 simultaneous)
- **🎨 Quality Metadata**: Automatic ID3 tags and artwork embedding
- **🌐 Cross-Platform**: Works on Windows, macOS, and Linux
- **📱 Modern UI**: Responsive design with Windows 98 aesthetic

## 🚀 Supported Platforms

| Platform | Content Types | Authentication |
|----------|---------------|----------------|
| **Spotify** | Playlists, Albums, Tracks | Hybrid (Public + OAuth) |
| **YouTube** | Playlists, Channels, Videos | Public API |

## 📖 Documentation

**📚 [Complete Documentation Wiki →](https://github.com/WACOMalt/playlistifier-web/wiki)**

For comprehensive documentation, technical details, and implementation guides, visit our wiki:

- **[Project Overview](https://github.com/WACOMalt/playlistifier-web/wiki)** - Start here for project introduction
- **[Executive Summary](https://github.com/WACOMalt/playlistifier-web/wiki/Executive-Summary)** - Business overview and value proposition
- **[Project Analysis](https://github.com/WACOMalt/playlistifier-web/wiki/Project-Analysis)** - Technical architecture and features
- **[Technical Deep Dive](https://github.com/WACOMalt/playlistifier-web/wiki/Technical-Deep-Dive)** - Implementation details
- **[Version History](https://github.com/WACOMalt/playlistifier-web/wiki/Version-History)** - Changelog and development timeline

## ⚡ Quick Start

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

## 🔗 Supported URLs

### Spotify
- Playlists: `https://open.spotify.com/playlist/ID`
- Albums: `https://open.spotify.com/album/ID`
- Tracks: `https://open.spotify.com/track/ID`

### YouTube
- Playlists: `https://www.youtube.com/playlist?list=ID`
- Videos: `https://www.youtube.com/watch?v=ID`
- Channels: `https://www.youtube.com/channel/ID`

## 📄 License

ISC License - See LICENSE file for details.

## ⚖️ Legal Notice

This software is for personal use only. Users are responsible for complying with platform terms of service and copyright laws.
