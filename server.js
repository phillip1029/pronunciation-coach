const express = require('express');
const WebSocket = require('ws');
const path = require('path');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;
const geminiApiKey = process.env.GEMINI_API_KEY;

async function callGeminiRealtime(transcript, targetText, accuracy, sourceId) {
  if (!geminiApiKey) {
    throw new Error('Gemini API key missing');
  }

  const prompt = [
    'You are an encouraging pronunciation coach helping users practice spoken English.',
    'Evaluate the pronunciation quality compared to the target text.',
    `Target: ${targetText}`,
    `Transcript: ${transcript}`,
    accuracy !== undefined ? `Accuracy estimate: ${accuracy}%` : '',
    'Provide a short analysis including strengths and specific words or sounds to improve.'
  ].filter(Boolean).join('\n');

  const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': geminiApiKey
    },
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: prompt
            }
          ]
        }
      ]
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Gemini API error: ${response.status} ${text}`);
  }

  const result = await response.json();
  const textContent = result?.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('\n') || 'No response from Gemini';
  return {
    type: 'fallback.response',
    payload: {
      text: textContent,
      sourceId
    }
  };
}

async function handleGeminiFallback(clientWs, data) {
  const { transcript, target, accuracy, sourceId } = data;
  const response = await callGeminiRealtime(transcript, target, accuracy, sourceId);
  clientWs.send(JSON.stringify(response));
}

// Add security headers
app.use((req, res, next) => {
  res.setHeader('Content-Security-Policy', 
    "default-src 'self'; " +
    "font-src 'self' data:; " +
    "style-src 'self' 'unsafe-inline'; " +
    "script-src 'self' 'unsafe-inline'; " +
    "connect-src 'self' wss://api.openai.com ws://localhost:* https://api.openai.com; " +
    "media-src 'self' blob:; " +
    "img-src 'self' data: blob:;"
  );
  next();
});

// Serve static files from root directory (excluding server files)
app.use(express.static(__dirname, {
  dotfiles: 'ignore',
  index: 'index.html',
  setHeaders: function (res, path, stat) {
    // Set CORS headers for fonts and other assets
    res.set('Access-Control-Allow-Origin', '*');
    
    // Add cache busting for development
    if (path.endsWith('.css') || path.endsWith('.js')) {
      res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.set('Pragma', 'no-cache');
      res.set('Expires', '0');
    }
    
    if (path.endsWith('.woff') || path.endsWith('.woff2') || path.endsWith('.ttf') || path.endsWith('.eot')) {
      res.set('Content-Type', 'font/woff2');
    }
  }
}));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Create HTTP server
const server = require('http').createServer(app);

// Create WebSocket server
const wss = new WebSocket.Server({ 
  server,
  path: '/ws' 
});

console.log('Setting up WebSocket server...');

wss.on('connection', (clientWs) => {
  console.log('Client connected to WebSocket server');
  
  let openaiWs = null;
  
  // Handle messages from client
  clientWs.on('message', async (message) => {
    try {
      const data = JSON.parse(message);
      
      // If this is an initialization message, create OpenAI connection
      if (data.type === 'init') {
        const apiKey = process.env.OPENAI_API_KEY;
        
        if (!apiKey) {
          clientWs.send(JSON.stringify({
            type: 'error',
            error: 'OpenAI API key not configured on server'
          }));
          return;
        }
        
        try {
          // Create connection to OpenAI Realtime API with proper headers
          openaiWs = new WebSocket('wss://api.openai.com/v1/realtime?model=gpt-4o-mini-realtime-preview', {
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'OpenAI-Beta': 'realtime=v1',
              'User-Agent': 'pronunciation-coach/1.0.0'
            }
          });
          
          openaiWs.on('open', () => {
            console.log('Connected to OpenAI Realtime API');
            console.log('WebSocket ready state:', openaiWs.readyState);
            clientWs.send(JSON.stringify({
              type: 'connected',
              message: 'Connected to OpenAI Realtime API'
            }));
          });
          
          openaiWs.on('message', (openaiMessage) => {
            const messageStr = openaiMessage.toString();
            console.log('Received message from OpenAI:', messageStr);
            
            // Parse and handle errors specifically
            try {
              const parsed = JSON.parse(messageStr);
              if (parsed.type === 'error') {
                console.error('OpenAI API Error Details:', JSON.stringify(parsed, null, 2));
              }
            } catch (e) {
              // Not JSON, continue
            }
            
            // Forward OpenAI messages to client
            clientWs.send(openaiMessage);
          });
          
          openaiWs.on('error', (error) => {
            console.error('OpenAI WebSocket error:', error);
            clientWs.send(JSON.stringify({
              type: 'error',
              error: 'OpenAI connection error'
            }));
          });
          
          openaiWs.on('close', (code, reason) => {
            console.log('OpenAI WebSocket closed:', code, reason.toString());
            console.log('Close reason details:', reason);
            clientWs.send(JSON.stringify({
              type: 'disconnected',
              message: `OpenAI connection closed: ${code} - ${reason.toString()}`
            }));
          });
          
        } catch (error) {
          console.error('Error creating OpenAI connection:', error);
          clientWs.send(JSON.stringify({
            type: 'error',
            error: 'Failed to connect to OpenAI'
          }));
        }
      } else {
        // Forward other messages to OpenAI
        if (openaiWs && openaiWs.readyState === WebSocket.OPEN) {
          console.log('Sending to OpenAI:', message.toString().substring(0, 200));
          openaiWs.send(message);
        } else if (geminiApiKey && data.type === 'fallback.request') {
          // Handle Gemini fallback messages from client
          handleGeminiFallback(clientWs, data).catch((error) => {
            console.error('Gemini fallback error:', error.message);
            clientWs.send(JSON.stringify({
              type: 'error',
              error: 'Gemini fallback failed',
              details: error.message
            }));
          });
        } else {
          clientWs.send(JSON.stringify({
            type: 'error',
            error: 'Not connected to OpenAI'
          }));
        }
      }
    } catch (error) {
      console.error('Error handling client message:', error);
      clientWs.send(JSON.stringify({
        type: 'error',
        error: 'Invalid message format'
      }));
    }
  });
  
  clientWs.on('close', () => {
    console.log('Client disconnected');
    if (openaiWs) {
      openaiWs.close();
    }
  });
  
  clientWs.on('error', (error) => {
    console.error('Client WebSocket error:', error);
    if (openaiWs) {
      openaiWs.close();
    }
  });
});

// Test OpenAI API access
async function testOpenAIAccess() {
  if (!process.env.OPENAI_API_KEY) {
    return false;
  }
  
  try {
    const response = await fetch('https://api.openai.com/v1/models', {
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'User-Agent': 'pronunciation-coach/1.0.0'
      }
    });
    
    if (response.ok) {
      const data = await response.json();
      const hasRealtimeModel = data.data.some(model => model.id.includes('realtime'));
      console.log(`🔍 API Access Test: ${response.status} OK`);
      console.log(`🤖 Realtime Model Available: ${hasRealtimeModel ? '✓ Yes' : '✗ No'}`);
      return true;
    } else {
      console.log(`❌ API Access Test Failed: ${response.status}`);
      return false;
    }
  } catch (error) {
    console.log(`❌ API Access Test Error: ${error.message}`);
    return false;
  }
}

server.listen(port, async () => {
  console.log(`🚀 Pronunciation Coach server running at http://localhost:${port}`);
  console.log(`📁 Serving static files from: ${__dirname}`);
  console.log(`🔌 WebSocket server available at: ws://localhost:${port}/ws`);
  console.log(`🔑 OpenAI API Key: ${process.env.OPENAI_API_KEY ? '✓ Loaded' : '✗ Missing'}`);
  console.log(`🔑 Gemini API Key: ${geminiApiKey ? '✓ Loaded' : '✗ Missing'}`);
  
  if (process.env.OPENAI_API_KEY) {
    await testOpenAIAccess();
  }
});
