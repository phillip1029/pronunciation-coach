# Pronunciation Coach

A lightweight web application that helps students improve their English pronunciation. Students can read curated passages (or paste their own text), record their speech, and receive instant feedback based on speech recognition results.

> 💡 This repository ships the ready-to-run **Pronunciation Coach** web app. Clone it directly if you want a project scaffold that already includes AI-powered voice coaching hooks.

## Features

- Curated practice passages plus support for custom text
- Microphone recording powered by the browser's Speech Recognition API
- Automatic comparison between the target passage and recognized speech
- Actionable feedback including accuracy score and words to practice
- Optional OpenAI voice agent integration that produces lively spoken coaching (text + audio)

## Getting started

1. Start a local HTTP server from the project root:

   ```bash
   cd public
   python -m http.server 8000
   ```

2. Open your browser to <http://localhost:8000>.
3. Allow microphone access when prompted and click **Start recording** to begin practice.

### Enabling the OpenAI voice coach

The voice experience is opt-in and happens entirely in the browser. To try it out:

1. Generate an [OpenAI API key](https://platform.openai.com/api-keys) with access to the latest voice models.
2. Paste the key into the **OpenAI API key** field in the "Get AI voice coaching" panel.
3. Record a passage and click **Generate AI feedback**. The app will call `gpt-4o-mini-tts` via the `responses` API to fetch both spoken audio and a written summary.

> ⚠️ Keys pasted into the UI live only in memory and are never stored. If you plan to share the app or deploy it, proxy OpenAI calls through your own backend so you can keep credentials private.

> **Note:** The Web Speech API is best supported in Google Chrome on desktop platforms. Mobile browsers or other desktop browsers may not support it fully.

## Project structure

```
public/
├── app.js        # Application logic and speech recognition handling
├── index.html    # UI layout
└── styles.css    # Styling
```

## Development tips

- Modify `public/app.js` to adjust the feedback algorithm or add new practice passages.
- Update `public/styles.css` to customize the theme.
- Remember to restart your local server (or refresh the browser) after making changes.
