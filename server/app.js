require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const session = require('express-session');
const path = require('path');

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
app.use(helmet());
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

// Serve static files from client
app.use(express.static(path.join(__dirname, '../client/public')));

// API routes
app.use('/api', require('./routes/api'));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/download', require('./routes/download'));
app.use('/api/search', require('./routes/search'));

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
        }
    });
});

// Make io available to routes
app.set('io', io);

// Catch-all handler for SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/public/index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
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
