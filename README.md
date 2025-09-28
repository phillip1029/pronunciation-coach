# Pronunciation Coach

A browser-based pronunciation tutor that lets students pick a passage, record themselves, and receive instant feedback on accuracy, missing words, and clear next steps. The app now streams microphone audio through a local Node.js proxy to the OpenAI Realtime API and automatically falls back to Google Gemini when the realtime service is unavailable.

> 💡 Clone this repo if you want a ready-made scaffold for building AI-powered speaking exercises with both OpenAI and Gemini support.

## Features

- Curated practice passages plus support for custom text
- In-browser microphone capture with real-time accuracy, missing word, and extra word analysis
- Live streaming to OpenAI Realtime (`gpt-4o-mini-realtime-preview`) for spoken coaching (text + audio)
- Automatic fallback to Gemini 1.5 Flash when OpenAI realtime returns an error
- Manual “Generate AI feedback” button to trigger the fallback coach at any time

## Prerequisites

- Node.js 18+
- OpenAI API key with access to the realtime preview models
- Gemini API key (for the backup coach)
- Google Chrome (best Web Speech API support)

## Getting started

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create a `.env` file at the project root:

   ```env
   OPENAI_API_KEY=sk-...
   GEMINI_API_KEY=your_gemini_key
   PORT=3000
   ```

   > Both keys are required. The server will automatically test connectivity on startup.

3. Start the development server:

   ```bash
   npm start
   ```

4. Open <http://localhost:3000> in Chrome, allow microphone access, and click **Start recording**.

## How it works

- `app.js` records microphone audio, batches it into PCM16 frames, and streams the data to the local WebSocket proxy.
- `server.js` forwards the stream to the OpenAI Realtime API. If the realtime connection closes or returns an error, the server calls Gemini with the recognized transcript and sends the text feedback back to the browser.
- The UI displays realtime responses when available; otherwise it renders the Gemini fallback coaching text. The “Generate AI feedback” button always triggers the fallback via WebSocket.

## Project structure

```
pronunciation-coach/
├── app.js         # Browser client (UI + streaming logic)
├── server.js      # Node.js proxy (OpenAI realtime + Gemini fallback)
├── styles.css     # Styling
├── index.html     # Layout
├── package.json
├── .env.sample    # Example environment variables
└── README.md
```

## Development tips

- Adjust the realtime streaming thresholds or fallback behavior in `app.js`.
- Update the prompts or response formatting inside `server.js`.
- The Web Speech API is only used for local transcription and accuracy scoring—it is not required for the AI coaching to work.
- Restart `npm start` after changing `.env` or server code.

## Known limitations

- OpenAI realtime remains in preview; occasional `server_error` responses are expected. The Gemini fallback ensures users still receive feedback.
- The Web Speech API works best in Chrome on desktop; other browsers may not support it fully.
