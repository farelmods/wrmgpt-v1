const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

// --- KUNCI API AMAN ---
// Kunci ini sekarang aman di sisi server dan tidak diekspos ke browser.
const WRM_API_KEY = 'sk_live_d497343f-1fc4-46b7-b7b7-e873752b67dc823e';
const GEMINI_API_KEY = 'AIzaSyDgk_GXlgLNJ5LRha_r6aub6j5Pf7iof3E';

const server = http.createServer((req, res) => {
    // Sajikan file statis (index.html)
    if (req.url === '/' && req.method === 'GET') {
        const filePath = path.join(__dirname, 'index.html');
        fs.readFile(filePath, (err, data) => {
            if (err) {
                res.writeHead(500, { 'Content-Type': 'text/plain' });
                res.end('Internal Server Error');
                return;
            }
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(data);
        });
        return;
    }

    // Tangani panggilan API proxy
    if (req.url === '/api/generate' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
        });
        req.on('end', () => {
            try {
                const { model, message, systemPrompt } = JSON.parse(body);
                if (model === 'gemini-1.5-flash') {
                    proxyRequestToGemini(res, message, systemPrompt);
                } else {
                    proxyRequestToWormGPT(res, message, systemPrompt);
                }
            } catch (error) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Invalid JSON in request body' }));
            }
        });
        return;
    }

    // Tangani permintaan yang tidak ditemukan
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
});

function proxyRequestToWormGPT(res, message, systemPrompt) {
    const postData = JSON.stringify({
        model: 'wormgpt-v7',
        messages: [
            { role: 'system', content: systemPrompt || "You are a helpful AI assistant." },
            { role: 'user', content: message }
        ]
    });

    const options = {
        hostname: 'api.wrmgpt.com',
        path: '/v1/chat/completions',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${WRM_API_KEY}`,
            'Content-Length': Buffer.byteLength(postData)
        }
    };

    makeRequest(options, postData, res);
}

function proxyRequestToGemini(res, message, systemPrompt) {
    const requestBody = {
        contents: [{ parts: [{ text: message }] }]
    };
    if (systemPrompt) {
        requestBody.systemInstruction = { parts: [{ text: systemPrompt }] };
    }
    const postData = JSON.stringify(requestBody);

    const options = {
        hostname: 'generativelanguage.googleapis.com',
        path: `/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData)
        }
    };

    makeRequest(options, postData, res);
}

function makeRequest(options, postData, clientResponse) {
    const proxyReq = https.request(options, (proxyRes) => {
        let responseBody = '';
        proxyRes.on('data', (chunk) => {
            responseBody += chunk;
        });
        proxyRes.on('end', () => {
            clientResponse.writeHead(proxyRes.statusCode, { 'Content-Type': 'application/json' });
            clientResponse.end(responseBody);
        });
    });

    proxyReq.on('error', (e) => {
        console.error(`Problem with request: ${e.message}`);
        clientResponse.writeHead(500, { 'Content-Type': 'application/json' });
        clientResponse.end(JSON.stringify({ error: 'Failed to proxy request.' }));
    });

    proxyReq.write(postData);
    proxyReq.end();
}

const PORT = 3000;
server.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});
