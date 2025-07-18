require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const session = require('express-session');
const path = require('path');
const fs = require('fs');
const packageJson = require('../package.json');

const app = express();
const server = http.createServer(app);

// Session configuration
const sessionMiddleware = session({
  secret: process.env.SESSION_SECRET || 'your-secret-key-change-in-production',
  resave: false,
  saveUninitialized: true,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
});

const io = socketIo(server, {
  cors: {
    origin: process.env.NODE_ENV === 'production' ? false : "http://localhost:3000",
    methods: ["GET", "POST"]
  }
});

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      ...helmet.contentSecurityPolicy.getDefaultDirectives(),
      "img-src": ["'self'", "data:", "https://i.scdn.co", "https://i.ytimg.com", "https://img.youtube.com"],
    },
  },
}));
app.use(cors());

// Use session middleware
app.use(sessionMiddleware);

// Share session with socket.io
io.use((socket, next) => {
  sessionMiddleware(socket.request, {}, next);
});

// Parse JSON bodies
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging middleware for debugging
app.use((req, res, next) => {
  if (req.path.includes('/api/search')) {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    console.log('Content-Type:', req.get('Content-Type'));
    console.log('Body:', JSON.stringify(req.body, null, 2));
  }
  next();
});

// API routes
app.use('/api', require('./routes/api'));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/download', require('./routes/download'));
app.use('/api/search', require('./routes/search'));

// HTML version injection middleware (before static files)
app.use((req, res, next) => {
  // Only process HTML file requests
  if (req.path.endsWith('.html') || req.path === '/' || (!req.path.includes('.') && !req.path.startsWith('/api/'))) {
    let htmlPath;
    
    if (req.path === '/changelog' || req.path === '/changelog.html') {
      htmlPath = path.join(__dirname, '../client/public/changelog.html');
    } else {
      // Default to index.html for SPA routes
      htmlPath = path.join(__dirname, '../client/public/index.html');
    }
    
    fs.readFile(htmlPath, 'utf8', (err, data) => {
      if (err) {
        console.error('Error reading HTML file:', err);
        return next(); // Let static middleware handle it
      }
      const htmlWithVersion = injectVersion(data);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(htmlWithVersion);
    });
  } else {
    next();
  }
});

// Serve static files from client (for CSS, JS, images, etc.)
app.use(express.static(path.join(__dirname, '../client/public')));

// WebSocket connection handling
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  socket.on('join-download', (downloadId) => {
    socket.join(`download-${downloadId}`);
    console.log(`Client ${socket.id} joined download room: ${downloadId}`);
  });

  socket.on('cancel-download', (downloadId) => {
    console.log(`Download cancellation requested: ${downloadId}`);
    // TODO: Implement download cancellation logic
  });

    socket.on('disconnect', async () => {
        console.log('Client disconnected:', socket.id);
        const sessionId = socket.request.session?.id;
        if (sessionId) {
            console.log(`Cleaning up files for session: ${sessionId}`);
            await require('./services/downloader').cleanupSessionFiles(sessionId);
            await require('./services/downloader').killSessionProcesses(sessionId);
        }
    });
});

// Make io available to routes
app.set('io', io);

// Function to inject version into HTML
function injectVersion(htmlContent) {
  return htmlContent.replace(
    /Playlistifier Web v[0-9]+\.[0-9]+\.[0-9]+/g, 
    `Playlistifier Web v${packageJson.version}`
  );
}


// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  
  // For API routes, always return JSON
  if (req.path.startsWith('/api/')) {
    res.status(500).json({ error: 'Something went wrong!', details: err.message });
  } else {
    res.status(500).json({ error: 'Something went wrong!' });
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, async () => {
  console.log(`Playlistifier Web Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  
  // Initialize download service and clean up any leftover temp files
  try {
    await require('./services/downloader').initialize();
  } catch (error) {
    console.error('Failed to initialize download service:', error);
  }
});

module.exports = app;
