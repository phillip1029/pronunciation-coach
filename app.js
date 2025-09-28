const passages = [
  {
    id: 'news',
    title: 'Morning News',
    text: `Good morning and welcome to the daily news update. Today we are following a developing story about climate scientists who are calling for urgent action.`
  },
  {
    id: 'speech',
    title: 'Motivational speech',
    text: `Success is not built on success. It's built on failure, frustration, and even catastrophe. Use each setback as a stepping stone toward your goal.`
  },
  {
    id: 'story',
    title: 'Short story',
    text: `The old library smelled of rain-soaked paper. As Mia opened the dusty book, the words on the page seemed to rise like smoke and fill the room with adventure.`
  }
];

const passageSelect = document.getElementById('passageSelect');
const customPassageInput = document.getElementById('customPassage');
const loadCustomButton = document.getElementById('loadCustom');
const recordButton = document.getElementById('recordButton');
const resetButton = document.getElementById('resetButton');
const targetText = document.getElementById('targetText');
const recognizedText = document.getElementById('recognizedText');
const statusElement = document.getElementById('status');
const feedbackContainer = document.getElementById('feedback');
const recordingHint = document.getElementById('recordingHint');
const browserWarning = document.getElementById('browserWarning');
const feedbackTemplate = document.getElementById('feedbackTemplate');
const apiKeyInput = document.getElementById('apiKeyInput');
const voiceSelect = document.getElementById('voiceSelect');
const voiceButton = document.getElementById('voiceButton');
const voiceStatus = document.getElementById('voiceStatus');
const voiceResponse = document.getElementById('voiceResponse');
const voiceText = document.getElementById('voiceText');
const voiceAudio = document.getElementById('voiceAudio');

let recognition;
let isRecording = false;
let latestTranscript = '';
let latestAnalysis = null;
let realtimeSession = null;
let audioContext = null;
let mediaStream = null;
let audioProcessor = null;
let audioBufferCreated = false;
let audioChunksSent = 0;
let fallbackRequested = false;
let pendingGeminiFallbackReason = null;
let geminiFallbackSourceId = null;
let socket = null;

function resetFallbackState() {
  fallbackRequested = false;
  pendingGeminiFallbackReason = null;
  geminiFallbackSourceId = null;
}

function socketSend(payload) {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    console.warn('Realtime socket not ready for payload:', payload.type);
    return;
  }
  socket.send(JSON.stringify(payload));
}

function triggerGeminiFallback(reason) {
  if (fallbackRequested) {
    return;
  }
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    console.warn('Cannot trigger fallback; socket closed.');
    return;
  }

  pendingGeminiFallbackReason = reason || 'Realtime API unavailable';
  geminiFallbackSourceId = `auto-${Date.now()}`;
  if (voiceStatus) {
    voiceStatus.textContent = 'Realtime coach unavailable. Switching to backup AI...';
  }
  maybeSendGeminiFallback();
}

function maybeSendGeminiFallback() {
  if (fallbackRequested || !geminiFallbackSourceId) {
    return;
  }
  if (!latestTranscript) {
    if (voiceStatus && pendingGeminiFallbackReason) {
      voiceStatus.textContent = 'Waiting for transcript to send to Gemini backup...';
    }
    return;
  }

  fallbackRequested = true;
  socketSend({
    type: 'fallback.request',
    transcript: latestTranscript,
    target: targetText.textContent.trim(),
    accuracy: latestAnalysis ? latestAnalysis.accuracy : undefined,
    reason: pendingGeminiFallbackReason,
    sourceId: geminiFallbackSourceId
  });
  pendingGeminiFallbackReason = null;
}

function handleGeminiResponse(payload = {}) {
  resetFallbackState();
  if (voiceStatus) {
    voiceStatus.textContent = 'Gemini coaching ready!';
  }
  if (voiceText) {
    voiceText.textContent = payload.text || 'No Gemini feedback available.';
  }
  if (voiceAudio) {
    voiceAudio.removeAttribute('src');
    voiceAudio.load();
  }
  if (voiceResponse) {
    voiceResponse.classList.remove('hidden');
  }
  if (voiceButton) {
    voiceButton.disabled = false;
  }
  statusElement.textContent = 'Review the Gemini pronunciation tips below.';
  resetButton.disabled = false;
  updateVoiceButtonState();
}

function socketSend(payload) {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    console.warn('Realtime socket not ready:', payload.type);
    return;
  }
  socket.send(JSON.stringify(payload));
}

function handleSocketMessage(message) {
  switch (message.type) {
    case 'connected':
      console.log('Realtime server connected:', message.message);
      statusElement.textContent = 'Connected to OpenAI Realtime coach. Start recording when ready!';
      break;

    case 'disconnected':
      console.warn('Realtime server disconnected:', message.message);
      triggerGeminiFallback(message.message || 'Realtime coach disconnected');
      break;

    case 'error':
      console.error('Realtime server error:', message.error, message.details || '');
      triggerGeminiFallback(message.error || 'Realtime server error');
      break;

    case 'fallback.response':
      handleGeminiResponse(message.payload || {});
      break;

    default:
      if (message.type) {
        try {
          handleRealtimeMessage({ data: JSON.stringify(message) });
        } catch (error) {
          console.error('Failed to handle realtime message:', error);
        }
      }
      break;
  }
}

function flattenResponseContent(output = []) {
  const result = {
    text: null,
    audio: null
  };

  output.forEach((item) => {
    if (item.type === 'output_text' && !result.text) {
      result.text = item.text || null;
    }

    if (item.type === 'output_audio' && !result.audio) {
      result.audio = item.audio || null;
    }

    if (item.type === 'message' && Array.isArray(item.content)) {
      item.content.forEach((contentItem) => {
        if (contentItem.type === 'output_text' && !result.text) {
          result.text = contentItem.text || null;
        }
        if (contentItem.type === 'output_audio' && !result.audio) {
          result.audio = contentItem.audio || null;
        }
      });
    }
  });

  return result;
}

function initSelect() {
  passages.forEach(({ id, title }) => {
    const option = document.createElement('option');
    option.value = id;
    option.textContent = title;
    passageSelect.appendChild(option);
  });

  passageSelect.value = passages[0].id;
  setTargetText(passages[0].text);
}

function setTargetText(text) {
  targetText.textContent = text.trim();
  recognizedText.textContent = 'Your speech will appear here after recording.';
  recognizedText.classList.add('muted');
  latestTranscript = '';
  feedbackContainer.innerHTML = '';
  statusElement.textContent = '';
  resetButton.disabled = true;
  latestAnalysis = null;
  if (voiceResponse) {
    voiceResponse.classList.add('hidden');
  }
  if (voiceStatus) {
    voiceStatus.textContent = '';
  }
  if (voiceText) {
    voiceText.textContent = '';
  }
  if (voiceAudio) {
    voiceAudio.removeAttribute('src');
    voiceAudio.load();
  }
  resetFallbackState();
  updateVoiceButtonState();
}

function createRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    browserWarning.textContent =
      'Speech recognition is not supported in this browser. Try using Chrome on desktop.';
    recordButton.disabled = true;
    return null;
  }

  const rec = new SpeechRecognition();
  rec.lang = 'en-US';
  rec.interimResults = false;
  rec.maxAlternatives = 1;
  return rec;
}

async function initializeRealtimeAPI() {
  // Close existing session if any
  if (realtimeSession && realtimeSession.readyState === WebSocket.OPEN) {
    realtimeSession.close();
  }

  // Initialize audio context if not already done
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
  }
  
  // Connect to our local server which will proxy to OpenAI
  const ws = new WebSocket('ws://localhost:3000/ws');

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      ws.close();
      reject(new Error('Connection timeout'));
    }, 10000);

    ws.onopen = () => {
      clearTimeout(timeout);
      console.log('Connected to local server');
      socket = ws;
      // Initialize the connection to OpenAI through our server
      ws.send(JSON.stringify({
        type: 'init'
      }));
    };
    
    ws.onmessage = (event) => {
      try {
        // Check if event.data is a string (JSON) or binary data
        if (typeof event.data === 'string') {
        const message = JSON.parse(event.data);
        
        if (message.type === 'connected') {
          console.log('Connected to OpenAI Realtime API through server');
          clearTimeout(timeout);
          resolve(ws);
        } else if (message.type === 'error') {
          clearTimeout(timeout);
          reject(new Error(message.error));
        } else {
          // Handle other OpenAI messages
          handleRealtimeMessage(event);
        }
        } else {
          // Handle binary data (audio responses)
          console.log('Received binary data from server');
        }
      } catch (error) {
        console.error('Error parsing message:', error, 'Raw data:', event.data);
      }
    };

    ws.onerror = (error) => {
      clearTimeout(timeout);
      console.error('WebSocket error:', error);
      reject(error);
    };

    ws.onclose = (event) => {
      clearTimeout(timeout);
      console.log('WebSocket closed:', event.code, event.reason);
    };
  });
}

function handleRealtimeMessage(event) {
  try {
    const message = event && event.data ? JSON.parse(event.data) : event;
    
    switch (message.type) {
      case 'session.created':
        console.log('Realtime session created');
        statusElement.textContent = 'AI coach ready! Click Start recording to begin.';
        break;
        
      case 'input_audio_buffer.speech_started':
        statusElement.textContent = 'Speech detected. Keep reading!';
        break;
        
      case 'input_audio_buffer.speech_stopped':
        statusElement.textContent = 'Processing your pronunciation...';
        break;
        
      case 'conversation.item.input_audio_transcription.completed':
        latestTranscript = message.transcript;
        recognizedText.textContent = latestTranscript;
        recognizedText.classList.remove('muted');
        maybeSendGeminiFallback();
        break;
        
      case 'response.audio.delta':
        if (message.delta && voiceAudio) {
          // Handle audio response streaming
          playAudioDelta(message.delta);
        }
        break;
        
      case 'response.text.delta':
        if (message.delta && voiceText) {
          voiceText.textContent += message.delta;
        }
        break;
        
      case 'response.done':
        statusElement.textContent = 'Analysis complete! Listen to your feedback.';
        resetButton.disabled = false;
        if (voiceResponse) {
          voiceResponse.classList.remove('hidden');
        }
        break;
        
      case 'error':
        console.error('Realtime API error:', message);
        statusElement.textContent = 'Error processing audio. Switching to backup AI coach...';
        triggerGeminiFallback(message.error || 'Realtime error');
        break;

      default:
        break;
    }
  } catch (error) {
    console.error('Error parsing realtime message:', error);
  }
}

let audioBuffer = [];
function playAudioDelta(delta) {
  // Convert base64 delta to audio and play
  const audioData = atob(delta);
  const audioArray = new Uint8Array(audioData.length);
  for (let i = 0; i < audioData.length; i++) {
    audioArray[i] = audioData.charCodeAt(i);
  }
  audioBuffer.push(audioArray);
  
  // Play accumulated audio
  if (audioBuffer.length > 0) {
    const combinedArray = new Uint8Array(audioBuffer.reduce((acc, arr) => acc + arr.length, 0));
    let offset = 0;
    audioBuffer.forEach(arr => {
      combinedArray.set(arr, offset);
      offset += arr.length;
    });
    
    const audioBlob = new Blob([combinedArray], { type: 'audio/pcm' });
    const audioUrl = URL.createObjectURL(audioBlob);
    voiceAudio.src = audioUrl;
    voiceAudio.play().catch(() => {
      /* autoplay might be blocked */
    });
  }
}

function cleanWords(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z\s']/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function levenshteinDistance(a, b) {
  const matrix = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));

  for (let i = 0; i <= a.length; i += 1) {
    matrix[i][0] = i;
  }
  for (let j = 0; j <= b.length; j += 1) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }

  return matrix[a.length][b.length];
}

function analyzePronunciation(target, recognized) {
  const targetWords = cleanWords(target);
  const recognizedWords = cleanWords(recognized);

  if (recognizedWords.length === 0) {
    return {
      accuracy: 0,
      missingWords: targetWords,
      extraWords: [],
      message: 'We could not understand you. Try speaking louder and more clearly.'
    };
  }

  const distance = levenshteinDistance(targetWords, recognizedWords);
  const accuracy = Math.max(
    0,
    Math.round(((targetWords.length - distance) / Math.max(targetWords.length, 1)) * 100)
  );

  const missingWords = targetWords.filter((word) => !recognizedWords.includes(word));
  const extraWords = recognizedWords.filter((word) => !targetWords.includes(word));

  let message;
  if (accuracy >= 85) {
    message = 'Great job! Your pronunciation is very close to the target passage.';
  } else if (accuracy >= 65) {
    message = 'Good effort. Practice the highlighted words to boost clarity.';
  } else {
    message = 'Keep practicing. Focus on pacing and pronunciation of the suggested words.';
  }

  return { accuracy, missingWords, extraWords, message };
}

function renderFeedback(result) {
  feedbackContainer.innerHTML = '';

  const summaryCard = feedbackTemplate.content.cloneNode(true);
  const list = summaryCard.querySelector('ul');
  list.innerHTML = '';

  const accuracyItem = document.createElement('li');
  accuracyItem.innerHTML = `<strong>Accuracy:</strong> ${result.accuracy}%`;
  list.appendChild(accuracyItem);

  const messageItem = document.createElement('li');
  messageItem.textContent = result.message;
  list.appendChild(messageItem);

  if (result.missingWords.length > 0) {
    const missingItem = document.createElement('li');
    missingItem.innerHTML = `<strong>Practice these words:</strong> ${result.missingWords
      .slice(0, 10)
      .join(', ')}`;
    list.appendChild(missingItem);
  }

  if (result.extraWords.length > 0) {
    const extraItem = document.createElement('li');
    extraItem.innerHTML = `<strong>Words you added:</strong> ${result.extraWords
      .slice(0, 10)
      .join(', ')}`;
    list.appendChild(extraItem);
  }

  feedbackContainer.appendChild(summaryCard);
}

function handleResult(event) {
  latestTranscript = Array.from(event.results)
    .map((result) => result[0].transcript)
    .join(' ')
    .trim();

  recognizedText.textContent = latestTranscript || 'No speech detected.';
  recognizedText.classList.remove('muted');

  latestAnalysis = analyzePronunciation(targetText.textContent, latestTranscript);
  renderFeedback(latestAnalysis);
  updateVoiceButtonState();
}

async function startRecording() {

  try {
    isRecording = true;
    latestTranscript = '';
    audioBufferCreated = false;
    audioChunksSent = 0;
    recordButton.textContent = 'Stop recording';
    recordButton.classList.add('recording');
    statusElement.textContent = 'Connecting to OpenAI Realtime coach...';
    resetButton.disabled = true;

    // Initialize Realtime API and note session info for debugging
    realtimeSession = await initializeRealtimeAPI();
    
    // Resume AudioContext (required in modern browsers)
    if (audioContext.state === 'suspended') {
      await audioContext.resume();
    }
    
    // Get user media for audio recording with better settings
    mediaStream = await navigator.mediaDevices.getUserMedia({ 
      audio: {
        channelCount: 1,
        sampleRate: 16000,
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false
      } 
    });
    
    // Use AudioContext to get proper PCM16 audio for OpenAI Realtime API
    const source = audioContext.createMediaStreamSource(mediaStream);
    const processor = audioContext.createScriptProcessor(2048, 1, 1);
    const audioBuffer = [];
    let lastSendTime = 0;

    processor.onaudioprocess = function (event) {
      if (!isRecording || !realtimeSession || realtimeSession.readyState !== WebSocket.OPEN) {
        return;
      }

      const channelData = event.inputBuffer.getChannelData(0);

      // Reject frames that are effectively silence
      let maxAmplitude = 0;
      for (let i = 0; i < channelData.length; i += 1) {
        const amplitude = Math.abs(channelData[i]);
        if (amplitude > maxAmplitude) {
          maxAmplitude = amplitude;
        }
      }

      if (maxAmplitude < 0.01) {
        return;
      }

      statusElement.textContent = `Recording... 🎤 Audio detected (${maxAmplitude.toFixed(2)})`;

      // Convert to PCM16
      const pcm16 = new Int16Array(channelData.length);
      for (let i = 0; i < channelData.length; i += 1) {
        const sample = Math.max(-1, Math.min(1, channelData[i]));
        pcm16[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      }

      // Append to rolling buffer
      audioBuffer.push(...pcm16);

      const now = Date.now();
      if (now - lastSendTime < 200) {
        return;
      }

      lastSendTime = now;
      const chunk = audioBuffer.splice(0, audioBuffer.length);

      if (chunk.length === 0) {
        return;
      }

      const payload = new Uint8Array(new Int16Array(chunk).buffer);
      const base64audio = btoa(String.fromCharCode.apply(null, payload));

      realtimeSession.send(
        JSON.stringify({
          type: 'input_audio_buffer.append',
          audio: base64audio,
        })
      );
      audioChunksSent += 1;
      audioBufferCreated = true;
    };

    source.connect(processor);
    processor.connect(audioContext.destination);
    audioProcessor = processor;
    
    statusElement.textContent = 'Recording... speak clearly into your microphone.';
    
    // Fallback: Also use browser speech recognition as backup
    if (recognition) {
      recognition.start();
    }
    
  } catch (error) {
    console.error('Error starting recording:', error);
    statusElement.textContent = 'Error starting recording. Check your microphone permissions and API key.';
    isRecording = false;
    recordButton.textContent = 'Start recording';
    recordButton.classList.remove('recording');
  }
}

function stopRecording() {
  isRecording = false;
  recordButton.textContent = 'Start recording';
  recordButton.classList.remove('recording');
  statusElement.textContent = 'Processing your pronunciation...';
  
  // Stop and cleanup audio processing
  if (audioProcessor) {
    audioProcessor.disconnect();
    audioProcessor = null;
  }
  
  if (mediaStream) {
    mediaStream.getTracks().forEach(track => track.stop());
    mediaStream = null;
  }
  
  // Stop speech recognition fallback
  if (recognition) {
    try {
      recognition.stop();
    } catch (error) {
      // ignore if already stopped
    }
  }
  
  if (realtimeSession && realtimeSession.readyState === WebSocket.OPEN) {
    if (!audioBufferCreated) {
      statusElement.textContent = 'No speech captured. Try speaking louder or move closer to the microphone.';
      resetButton.disabled = false;
      return;
    }

    // Signal end of audio input and request response
    realtimeSession.send(JSON.stringify({
      type: 'input_audio_buffer.commit'
    }));
    
    realtimeSession.send(JSON.stringify({
      type: 'response.create',
      response: {
        modalities: ['text', 'audio'],
        instructions: 'Analyze the pronunciation of the speech you just received and provide encouraging, specific feedback about pronunciation accuracy, clarity, and areas for improvement.'
      }
    }));
  } else {
    statusElement.textContent = 'Connection lost. Please try again.';
    resetButton.disabled = false;
  }
}

function resetSession() {
  // Stop any ongoing recording
  if (isRecording) {
    stopRecording();
  }
  
  // Close WebSocket connection
  if (realtimeSession && realtimeSession.readyState === WebSocket.OPEN) {
    realtimeSession.close();
    realtimeSession = null;
  }
  
  // Stop media stream
  if (mediaStream) {
    mediaStream.getTracks().forEach(track => track.stop());
    mediaStream = null;
  }
  
  latestTranscript = '';
  recognizedText.textContent = 'Your speech will appear here after recording.';
  recognizedText.classList.add('muted');
  feedbackContainer.innerHTML = '';
  statusElement.textContent = '';
  resetButton.disabled = true;
  latestAnalysis = null;
  isRecording = false;
  recordButton.textContent = 'Start recording';
  recordButton.classList.remove('recording');
  
  if (voiceResponse) {
    voiceResponse.classList.add('hidden');
  }
  if (voiceStatus) {
    voiceStatus.textContent = '';
  }
  if (voiceText) {
    voiceText.textContent = '';
  }
  if (voiceAudio) {
    voiceAudio.removeAttribute('src');
    voiceAudio.load();
  }
  resetFallbackState();
  updateVoiceButtonState();
}

function updateVoiceButtonState() {
  const apiKeyReady = true;
  const hasAnalysis = !!latestAnalysis && !!latestTranscript;
  if (voiceButton) {
    voiceButton.disabled = !(apiKeyReady && hasAnalysis);
  }
}

function decodeBase64Audio(base64, mimeType) {
  const byteCharacters = atob(base64);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i += 1) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  return new Blob([byteArray], { type: mimeType });
}

async function requestVoiceFeedback() {
  if (!latestAnalysis || !latestTranscript) {
    if (voiceStatus) {
      voiceStatus.textContent = 'Record a passage before requesting AI feedback.';
    }
    return;
  }

  if (voiceButton) {
    voiceButton.disabled = true;
  }
  if (voiceStatus) {
    voiceStatus.textContent = 'Requesting backup AI pronunciation feedback...';
  }
  if (voiceResponse) {
    voiceResponse.classList.add('hidden');
  }

  geminiFallbackSourceId = `manual-${Date.now()}`;
  socketSend({
    type: 'fallback.request',
    transcript: latestTranscript,
    target: targetText.textContent.trim(),
    accuracy: latestAnalysis.accuracy,
    sourceId: geminiFallbackSourceId
  });
}

passageSelect.addEventListener('change', () => {
  const selected = passages.find((item) => item.id === passageSelect.value);
  if (selected) {
    setTargetText(selected.text);
  }
});

loadCustomButton.addEventListener('click', () => {
  const customText = customPassageInput.value.trim();
  if (customText.length < 10) {
    statusElement.textContent = 'Please paste a longer passage (at least 10 characters).';
    return;
  }

  setTargetText(customText);
  passageSelect.value = '';
  statusElement.textContent = 'Custom passage loaded. Ready to record!';
});

recordButton.addEventListener('click', () => {
  if (!recognition) {
    return;
  }

  if (isRecording) {
    stopRecording();
  } else {
    startRecording();
  }
});

resetButton.addEventListener('click', resetSession);

if (apiKeyInput) {
  apiKeyInput.addEventListener('input', updateVoiceButtonState);
}

if (voiceButton) {
  voiceButton.addEventListener('click', requestVoiceFeedback);
}

window.addEventListener('load', () => {
  initSelect();
  recognition = createRecognition();

  if (recognition) {
    recognition.addEventListener('result', handleResult);
    recognition.addEventListener('speechstart', () => {
      statusElement.textContent = 'Speech detected. Keep reading!';
    });
    recognition.addEventListener('end', () => {
      if (isRecording) {
        // recognition ended unexpectedly; restart automatically
        recognition.start();
      } else {
        statusElement.textContent = latestTranscript
          ? 'Done! Review your feedback below.'
          : 'No speech captured. Try again.';
        resetButton.disabled = false;
      }
    });
    recognition.addEventListener('error', (event) => {
      statusElement.textContent = `Recognition error: ${event.error}`;
      recordButton.textContent = 'Start recording';
      recordButton.classList.remove('recording');
      isRecording = false;
      resetButton.disabled = false;
    });
  }

  // Establish socket connection for realtime + fallback responses
  socket = new WebSocket(`ws://${window.location.host}/ws`);

  socket.addEventListener('open', () => {
    socketSend({ type: 'init' });
  });

  socket.addEventListener('message', (event) => {
    try {
      const message = JSON.parse(event.data);
      handleSocketMessage(message);
      if (message.type === 'error' || message.type === 'disconnected') {
        triggerGeminiFallback(message.message || message.error || 'Realtime server issue');
      }
    } catch (error) {
      console.error('Failed to parse socket message:', error);
    }
  });

  socket.addEventListener('error', (error) => {
    console.error('Socket error:', error);
  });

  socket.addEventListener('close', () => {
    console.warn('Socket closed. Attempting reconnect in 2s.');
    setTimeout(() => {
      if (!socket || socket.readyState === WebSocket.CLOSED) {
        window.location.reload();
      }
    }, 2000);
  });
});

