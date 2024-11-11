// index.js
const express = require('express');
const httpProxy = require('http-proxy');
const cors = require('cors');
const helmet = require('helmet');
const crypto = require('crypto');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// Security middleware
app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
}));
app.use(cors({
    origin: process.env.PLAYER_URL,
    credentials: true
}));

// Create proxy server
const proxy = httpProxy.createProxyServer();
const videoCache = new Map();

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

// Generate secure hash for video URLs
function generateSecureHash(videoUrl) {
    const secret = process.env.URL_ENCRYPTION_KEY || 'default-dev-key';
    return crypto
        .createHash('sha256')
        .update(videoUrl + secret)
        .digest('hex')
        .substring(0, 16);
}

// API to register video URLs
app.post('/register', express.json(), (req, res) => {
    const { videoUrl } = req.body;
    
    if (!videoUrl) {
        return res.status(400).json({ error: 'Video URL required' });
    }

    // Verify request is from your player service
    const apiKey = req.headers['x-api-key'];
    if (process.env.NODE_ENV === 'production' && apiKey !== process.env.INTERNAL_API_KEY) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const hash = generateSecureHash(videoUrl);
    videoCache.set(hash, videoUrl);
    
    const proxyUrl = `${process.env.PROXY_URL || `http://localhost:${port}`}/stream/${hash}`;
    return res.json({ proxyUrl });
});

// Stream endpoint
app.get('/stream/:hash', (req, res) => {
    const originalUrl = videoCache.get(req.params.hash);
    
    if (!originalUrl) {
        return res.status(404).send('Video not found');
    }

    // Add cache headers
    res.setHeader('Cache-Control', 'public, max-age=3600');

    // Proxy the request
    proxy.web(req, res, {
        target: originalUrl,
        changeOrigin: true,
        ignorePath: true
    }, (err) => {
        console.error('Proxy error:', err);
        res.status(500).send('Streaming error');
    });
});

// Error handling
proxy.on('error', (err, req, res) => {
    console.error('Proxy error:', err);
    res.status(500).send('Proxy error');
});

app.listen(port, () => {
    console.log(`Proxy service running on port ${port}`);
});