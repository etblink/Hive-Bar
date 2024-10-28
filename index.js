require('dotenv').config();
const express = require('express');
const path = require('path');
const app = express();

// Import routes
const indexRouter = require('./routes/index');
const communityRouter = require('./routes/community');
const profileRouter = require('./routes/profile');
const commonRouter = require('./routes/common');
const apiRouter = require('./routes/api');

// View engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

// Middleware
app.use(express.json()); // Add JSON parsing middleware
app.use(express.urlencoded({ extended: true })); // Add URL-encoded parsing middleware
app.use(express.static(path.join(__dirname, 'public')));
app.use('/htmx', express.static(path.join(__dirname, 'node_modules', 'htmx.org', 'dist')));

// Routes
app.use('/', indexRouter);
app.use('/community', communityRouter);
app.use('/profile', profileRouter);
app.use('/', commonRouter);
app.use('/api', apiRouter); // Add API routes

// Port configuration
const port = process.env.PORT || 3000;

// Function to find an available port
const findAvailablePort = (startPort) => {
  return new Promise((resolve, reject) => {
    const server = require('http').createServer();
    server.listen(startPort, () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        resolve(findAvailablePort(startPort + 1));
      } else {
        reject(err);
      }
    });
  });
};

// Start the server
findAvailablePort(port)
  .then((availablePort) => {
    app.listen(availablePort, () => {
      console.log(`Server running on port ${availablePort}`);
    });
  })
  .catch((err) => {
    console.error('Failed to find an available port:', err);
  });
