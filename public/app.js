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

function startRecording() {
  if (!recognition) {
    return;
  }

  isRecording = true;
  latestTranscript = '';
  recognition.start();
  recordButton.textContent = 'Stop recording';
  recordButton.classList.add('recording');
  statusElement.textContent = 'Listening...';
  resetButton.disabled = true;
}

function stopRecording() {
  if (!recognition) {
    return;
  }

  isRecording = false;
  recognition.stop();
  recordButton.textContent = 'Start recording';
  recordButton.classList.remove('recording');
  statusElement.textContent = 'Processing your speech...';
}

function resetSession() {
  latestTranscript = '';
  recognizedText.textContent = 'Your speech will appear here after recording.';
  recognizedText.classList.add('muted');
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
  updateVoiceButtonState();
}

function updateVoiceButtonState() {
  const apiKeyReady = apiKeyInput && apiKeyInput.value.trim().length > 0;
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

  const apiKey = apiKeyInput ? apiKeyInput.value.trim() : '';
  if (!apiKey) {
    if (voiceStatus) {
      voiceStatus.textContent = 'Enter a valid OpenAI API key to continue.';
    }
    return;
  }

  if (voiceButton) {
    voiceButton.disabled = true;
  }
  if (voiceStatus) {
    voiceStatus.textContent = 'Contacting OpenAI voice agent...';
  }
  if (voiceResponse) {
    voiceResponse.classList.add('hidden');
  }

  const prompt = [
    'You are an encouraging pronunciation coach helping students practice English.',
    'Use a friendly tone, reference specific words that need work, and celebrate wins.',
    `Target passage: "${targetText.textContent.trim()}"`,
    `Recognized speech: "${latestTranscript}"`,
    `Accuracy: ${latestAnalysis.accuracy}%`,
    latestAnalysis.missingWords.length
      ? `Missing or unclear words: ${latestAnalysis.missingWords.slice(0, 12).join(', ')}`
      : 'No major missing words detected.',
    latestAnalysis.extraWords.length
      ? `Extra words spoken: ${latestAnalysis.extraWords.slice(0, 12).join(', ')}`
      : 'No additional words detected.'
  ].join('\n');

  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini-tts',
        modalities: ['text', 'audio'],
        audio: {
          voice: voiceSelect.value || 'alloy',
          format: 'mp3'
        },
        input: [
          {
            role: 'system',
            content: [
              {
                type: 'input_text',
                text: 'You are Pronunciation Coach, an upbeat tutor delivering concise spoken encouragement.'
              }
            ]
          },
          {
            role: 'user',
            content: [
              {
                type: 'input_text',
                text: prompt
              }
            ]
          }
        ]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || `OpenAI request failed with ${response.status}`);
    }

    const result = await response.json();
    const { text, audio } = flattenResponseContent(result.output);

    if (voiceText) {
      if (text) {
        voiceText.textContent = text;
      } else {
        voiceText.textContent = 'The AI coach responded with audio only.';
      }
    }

    if (audio?.data && voiceAudio) {
      const audioBlob = decodeBase64Audio(audio.data, `audio/${audio.format || 'mp3'}`);
      const audioUrl = URL.createObjectURL(audioBlob);
      voiceAudio.src = audioUrl;
      voiceAudio.play().catch(() => {
        /* autoplay might be blocked */
      });
    } else if (voiceAudio) {
      voiceAudio.removeAttribute('src');
      voiceAudio.load();
    }

    if (voiceResponse) {
      voiceResponse.classList.remove('hidden');
    }
    if (voiceStatus) {
      voiceStatus.textContent = 'AI feedback ready! Listen and review the tips below.';
    }
  } catch (error) {
    console.error(error);
    if (voiceStatus) {
      voiceStatus.textContent = 'Unable to fetch AI voice feedback. Check the console for details and verify your API key.';
    }
  } finally {
    updateVoiceButtonState();
  }
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
});
