// index.js
require('dotenv').config();
const express = require('express');
const httpProxy = require('http-proxy');
const cors = require('cors');
const helmet = require('helmet');
const crypto = require('crypto');

const app = express();
const port = process.env.PORT || 3000;

// Security middleware
app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
}));

// Configure CORS to accept requests from multiple domains
app.use(cors({
    origin: [
        'https://player-2-s0j9.onrender.com',
        'portal.weare1media.com',
        process.env.PLAYER_URL
    ],
    credentials: true
}));

// Create proxy server
const proxy = httpProxy.createProxyServer({
    // Add timeout settings
    proxyTimeout: 60000,
    timeout: 60000
});

const videoCache = new Map();

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok',
        timestamp: new Date().toISOString(),
        cacheSize: videoCache.size
    });
});

// Generate secure hash for video URLs
function generateSecureHash(videoUrl) {
    const secret = process.env.URL_ENCRYPTION_KEY;
    if (!secret) {
        throw new Error('URL_ENCRYPTION_KEY not configured');
    }
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
    if (apiKey !== process.env.INTERNAL_API_KEY) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        const hash = generateSecureHash(videoUrl);
        videoCache.set(hash, videoUrl);
        
        // Log successful registration (without exposing full URL)
        console.log(`Registered new video with hash: ${hash}`);
        
        return res.json({
            proxyUrl: `${process.env.PROXY_URL}/stream/${hash}`
        });
    } catch (error) {
        console.error('Registration error:', error);
        return res.status(500).json({ error: 'Failed to register video URL' });
    }
});

// Handle both manifest and segment requests
app.get(['/stream/:hash', '/stream/:hash/*'], (req, res) => {
    const hash = req.params.hash;
    const originalUrl = videoCache.get(hash);
    
    if (!originalUrl) {
        return res.status(404).send('Video not found');
    }

    // Construct full URL for segment requests
    let targetUrl = originalUrl;
    if (req.params[0]) {
        // Handle relative paths in manifests
        const basePath = originalUrl.substring(0, originalUrl.lastIndexOf('/') + 1);
        targetUrl = basePath + req.params[0];
    }

    // Set appropriate headers for different content types
    const ext = targetUrl.split('.').pop().toLowerCase();
    if (ext === 'm3u8') {
        res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
    } else if (ext === 'mpd') {
        res.setHeader('Content-Type', 'application/dash+xml');
    }

    // Add cache headers
    res.setHeader('Cache-Control', 'public, max-age=3600');

    // Proxy the request
    proxy.web(req, res, {
        target: targetUrl,
        changeOrigin: true,
        ignorePath: true,
        headers: {
            'Host': new URL(targetUrl).host
        }
    });
});

// Add image proxy endpoint for thumbnails
app.get('/image/:hash', (req, res) => {
    const originalUrl = videoCache.get(req.params.hash);
    
    if (!originalUrl) {
        return res.status(404).send('Image not found');
    }

    // Add cache headers for images
    res.setHeader('Cache-Control', 'public, max-age=86400'); // 24 hours

    // Proxy the image request
    proxy.web(req, res, {
        target: originalUrl,
        changeOrigin: true,
        ignorePath: true
    });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Application error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

// Proxy error handling
proxy.on('error', (err, req, res) => {
    console.error('Proxy error:', err);
    if (!res.headersSent) {
        res.status(500).send('Streaming error occurred');
    }
});

// Proxy response handling
proxy.on('proxyRes', (proxyRes, req, res) => {
    // Log proxy responses for debugging
    console.log(`Proxy response: ${proxyRes.statusCode} for ${req.url}`);
});

app.listen(port, () => {
    console.log(`Proxy service running on port ${port}`);
});