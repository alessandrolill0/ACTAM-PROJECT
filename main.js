// ==========================
// Imports and Configurations
// ==========================

// Import Yin for pitch detection and its configuration
import { Yin } from "https://cdn.jsdelivr.net/npm/@dipscope/pitch-detector/+esm";
const yinOptions = { bufferSize: 2048, threshold: 0.15 };
const yin = new Yin(yinOptions);

// ==========================
// DOM Elements Selection
// ==========================

const pitchDisplay = document.getElementById("pitch");
const noteDisplay = document.getElementById("note");
const startButton = document.getElementById("start");
const stopButton = document.getElementById("stop");
const playMelodyButton = document.getElementById("play-melody");
const resetMelodyButton = document.getElementById("reset-melody");
const deleteNoteButton = document.getElementById("delete-note");
const sequencerCanvas = document.getElementById("sequencer");
const ctx = sequencerCanvas.getContext("2d");
const bpmInput = document.getElementById("bpm-input");
const metronomeToggle = document.getElementById("metronome-toggle");

// ==========================
// Global Variables
// ==========================

const A4 = 440;
let bpm = 120; // Default BPM
let recordedNotes = []; // Array to store recorded notes
let audioContext = null;
let analyser = null;
let source = null;
let stream = null;
let isDetecting = false;
let startTime = 0;
let lastSelectedNoteIndex = null; //index of last selected note, helpful for stretching and moving the notes around
let metronomeActive = false;
let metronomeAudioCtx = null;
let metronomeInterval = null;
let recordingTimeout = null; // To store the timeout reference
let activeNote = null;
let silenceStartTime = null;
let isResizingStart = false; // Flag for resizing the start of the note
let isResizingEnd = false;  // Flag for resizing the end of the note
let emaFrequency = 0; // Variable to store the Exponential Moving Average frequency
const EMA_ALPHA = 0.2; // Smoothing factor for EMA (between 0 and 1)
let selectedNoteIndex = null; // Index of the currently selected note in the recordedNotes array
let isDragging = false; // Flag to indicate if a note is being dragged
let dragOffsetX = 0; // Horizontal offset during dragging
let dragOffsetY = 0; // Vertical offset during dragging
const stabilizationTime = 0.1; // Stabilization period for a note
const silenceThreshold = 0.2; // Lower threshold to detect silence
const minTimeBetweenNotes = 0.0001; // Minimum time between two notes
const maxSemitoneChange = 4; // Max semitone change allowed for same note
const noteNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]; // Constants for notes and sequencing
const MIN_TIME_BETWEEN_NOTES = 0.3; // Seconds
const SEMITONE_THRESHOLD = 1; // Minimum semitone difference
const labelWidth = 100; // Space between each note label
const rowHeight = 20; // Height of each row in the sequencer
const BEATS_PER_BAR = 1; // 4/4 time signature
const TOTAL_BARS = 16;
let melodyPart = null; // Add this line
// ==========================
// Utility Functions
// ==========================

/**
 * Converts a frequency to a musical note.
 * @param {number} frequency - Frequency in Hz.
 * @returns {string|null} - Note name or null if out of range.
 */
function frequencyToNote(frequency) {
  if (frequency <= 0) {return null;}
  const semitoneOffset = 12 * Math.log2(frequency / A4);
  const midiNumber = Math.round(semitoneOffset) + 69;
  const octave = Math.floor(midiNumber / 12) - 1;
  const noteName = noteNames[midiNumber % 12];
  if (midiNumber < 36 || midiNumber > 108) {
    return null; } // From C2 (MIDI 36) to C8 (MIDI 108) 
  return `${noteName}${octave}`;
}

/**
 * Converts a note name to its corresponding MIDI number.
 * @param {string} note - Note name
 * @returns {number|null} - MIDI number or null if invalid format.
 */

function midiFromNoteName(note) {
  const regex = /^([A-G]#?)(\d)$/;   // Regular expression to validate and capture the note name and octave.
  const match = note.match(regex);  // Attempt to match the input string against the regex
  if (!match) 
    return null;
  const name = match[1];
  const octave = parseInt(match[2], 10); // Convert octave string to an integer.
  const index = noteNames.indexOf(name);
  return index + (octave + 1) * 12;
}

/**
 * Calculates the absolute semitone difference between two notes.
 * @param {string} note1 - First note.
 * @param {string} note2 - Second note.
 * @returns {number} - Absolute semitone difference.
 */
function getSemitoneDifference(note1, note2) {
  const midi1 = midiFromNoteName(note1);
  const midi2 = midiFromNoteName(note2);
  if (midi1 === null || midi2 === null) return 0;
  return Math.abs(midi2 - midi1);
}

// ==========================
// Metronome Functions
// ==========================

/**
 * Calculates the interval between metronome clicks in seconds.
 * @param {number} bpm - Beats per minute.
 * @returns {number} - Interval in seconds.
 */
function getMetronomeInterval(bpm) {
  return 60 / bpm;
}

/**
 * Plays a metronome click sound.
 * @param {boolean} isLastBeat - Indicates if it's the last beat of the bar.
 */
function playMetronomeClick(isLastBeat = false) {
  if (!metronomeAudioCtx) {
    metronomeAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }

  const clickDuration = 0.05; // Click duration (50ms)
  const baseFrequency = isLastBeat ? 500 : 800; // Base frequency
  const harmonicsFrequency = isLastBeat ? 700 : 1200; // Harmonic frequency

  // Base oscillator for the click
  const baseOscillator = metronomeAudioCtx.createOscillator();
  const baseGain = metronomeAudioCtx.createGain();
  baseOscillator.type = "sine";
  baseOscillator.frequency.setValueAtTime(baseFrequency, metronomeAudioCtx.currentTime);
  baseGain.gain.setValueAtTime(0.2, metronomeAudioCtx.currentTime);
  baseOscillator.connect(baseGain).connect(metronomeAudioCtx.destination);
  baseOscillator.start();
  baseOscillator.stop(metronomeAudioCtx.currentTime + clickDuration);

  // Harmonic oscillator to add complexity
  const harmonicsOscillator = metronomeAudioCtx.createOscillator();
  const harmonicsGain = metronomeAudioCtx.createGain();
  harmonicsOscillator.type = "triangle";
  harmonicsOscillator.frequency.setValueAtTime(harmonicsFrequency, metronomeAudioCtx.currentTime);
  harmonicsGain.gain.setValueAtTime(0.1, metronomeAudioCtx.currentTime);
  harmonicsOscillator.connect(harmonicsGain).connect(metronomeAudioCtx.destination);
  harmonicsOscillator.start();
  harmonicsOscillator.stop(metronomeAudioCtx.currentTime + clickDuration);
}

/**
 * Starts the metronome.
 */
function startMetronome() {
  if (metronomeActive) return;

  metronomeActive = true;
  metronomeToggle.textContent = "Stop Metronome";

  const beatsPerBar = 4; // Number of beats per bar
  let currentBeat = 0;

  const interval = getMetronomeInterval(bpm) * 1000; // Interval in milliseconds

  metronomeInterval = setInterval(() => {
    currentBeat++;
    const isLastBeat = currentBeat === beatsPerBar;
    playMetronomeClick(isLastBeat);

    if (isLastBeat) {
      currentBeat = 0; // Reset the bar
    }
  }, interval);
}

/**
 * Stops the metronome.
 */
function stopMetronome() {
  if (!metronomeActive) 
    return;

  metronomeActive = false;
  metronomeToggle.textContent = "Start Metronome";
  clearInterval(metronomeInterval);
  metronomeInterval = null;
  if (metronomeAudioCtx) {
    metronomeAudioCtx.close();
    metronomeAudioCtx = null;
  }
}

// ==========================
// Sequencer Functions
// ==========================

/**
 * Adjusts the canvas width based on the current time.
 * @param {number} time - Current time in seconds.
 */
function adjustCanvasWidth(time) {
  const desiredWidth = labelWidth + time * 100; // 100 pixels per second
  if (desiredWidth > sequencerCanvas.width) {
    sequencerCanvas.width = Math.max(desiredWidth, sequencerCanvas.width * 1.5);
    renderSequencer(); // Redraw the sequencer
  }
}

function isBlackKey(note) {
  // Lista di note diesis
  const blackKeys = ["C#", "D#", "F#", "G#", "A#"];
  const name = note.slice(0, -1); // Estrai il nome della nota senza l'ottava
  return blackKeys.includes(name);
}
 
/**
 * Renders the sequencer on the canvas.
 */
function renderSequencer() {
  //Calculating 16 bars
  const totalDuration = calculateTotalDuration(bpm, TOTAL_BARS);
  const pixelsPerSecond = 100; // zoom orizzontale
  const desiredWidth = labelWidth + totalDuration * pixelsPerSecond;
  sequencerCanvas.width = desiredWidth;
  sequencerCanvas.height = (108 - 36 + 1) * rowHeight; // 36 = C2, 108 = C8
  ctx.clearRect(0, 0, sequencerCanvas.width, sequencerCanvas.height);

  // Definisci l'intervallo di note (C2 a C8)
  const noteRange = [];
  for (let octave = 2; octave <= 8; octave++) {
    for (let name of noteNames) {
      noteRange.push(`${name}${octave}`);
    }
  }
  // Disegna linee orizzontali per ogni nota
ctx.strokeStyle = "rgba(200, 200, 200, 0.5)"; // Colore chiaro per le linee della griglia
ctx.lineWidth = 1;

noteRange.forEach((_, index) => {
  const y = index * rowHeight;
  ctx.beginPath();
  ctx.moveTo(labelWidth, y); // Inizia la linea dalla fine delle etichette
  ctx.lineTo(sequencerCanvas.width, y); // Fino alla fine del canvas
  ctx.stroke();
});
const whiteKeyWidth = 60; // Larghezza delle note bianche (più pronunciate)
const blackKeyWidth = 47; // Larghezza delle note nere (più strette)
const keyHeight = rowHeight; // Altezza di ogni tasto

noteRange.forEach((note, index) => {
  const y = index * rowHeight; // Posizione verticale
  const isBlack = isBlackKey(note); // Controlla se è un diesis
  if (isBlack) {
    // Disegna tasto nero (spostato verso destra)
    const blackKeyOffset = whiteKeyWidth - blackKeyWidth; // Differenza per allineare a destra
    ctx.fillStyle = "#000";
    ctx.fillRect(
      labelWidth - blackKeyWidth - blackKeyOffset, // Sposta il tasto nero verso destra
      sequencerCanvas.height - y - keyHeight,
      blackKeyWidth,
      keyHeight
    );
  } else {
    // Disegna tasto bianco
    ctx.fillStyle = "#fff";
    ctx.fillRect(
      labelWidth - whiteKeyWidth, // Rimane in posizione
      sequencerCanvas.height - y - keyHeight,
      whiteKeyWidth,
      keyHeight
    );
    ctx.strokeStyle = "#000"; // Bordo nero per i tasti bianchi
    ctx.strokeRect(
      labelWidth - whiteKeyWidth,
      sequencerCanvas.height - y - keyHeight,
      whiteKeyWidth,
      keyHeight
    );

    // Disegna l'etichetta "C" per le note bianche
    if (note.startsWith("C")) {
      ctx.fillStyle = "#333";
      ctx.font = "11px Verdana";
      ctx.textAlign = "start";
      ctx.fillText(
        note,
        labelWidth - whiteKeyWidth / 2,
        sequencerCanvas.height - y - keyHeight / 2
      );
    }
  }
});

  // Disegna le linee della griglia per ogni battuta
  const totalBeats = TOTAL_BARS * BEATS_PER_BAR;
  const secondsPerBeat = 60 / bpm;
  const secondsPerBar = BEATS_PER_BAR * secondsPerBeat;

  for (let bar = 0; bar <= TOTAL_BARS; bar++) {
    const x = labelWidth + bar * secondsPerBar * pixelsPerSecond;
    ctx.strokeStyle = "#aaa";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, sequencerCanvas.height);
    ctx.stroke();

    // Etichetta ogni battuta
    ctx.fillStyle = "#333";
    ctx.font = "10px Arial";
    ctx.textAlign = "center";
    ctx.fillText(`Bar ${bar}`, x, 10);
  }
  
  // Disegna le note registrate con evidenziazione per la nota selezionata
  recordedNotes.forEach((note, i) => {
    const midiNumber = midiFromNoteName(note.note);
    if (midiNumber === null) return;
    // Calcola la posizione Y per la nota (invertita)
    const noteIndex = midiNumber - 36; // Offset C2=36
    const y = sequencerCanvas.height - (noteIndex * rowHeight + rowHeight / 2);
    // Calcola la posizione X e la larghezza della nota
    const xStart = labelWidth + note.startTime * 100;
    const xEnd = labelWidth + (note.startTime + note.duration) * 100;
    const noteWidth = xEnd - xStart;
    // Aggiungi un bordo rosso se la nota è selezionata

    // Debug: Log delle informazioni della nota
  console.log(`Drawing note: ${note.note}`);
  console.log(`Frequency: ${note.frequency}, Start Time: ${note.startTime}, Duration: ${note.duration}`);
  console.log(`MIDI Number: ${midiNumber}, X Start: ${xStart}, X End: ${xEnd}, Width: ${noteWidth}, Y: ${y}`);
    if (i === selectedNoteIndex) {
      ctx.strokeStyle = "red"; // Colore del bordo
      ctx.lineWidth = 2; // Spessore del bordo
      ctx.strokeRect(xStart, y - rowHeight / 2 + 2, noteWidth, rowHeight - 4);
    }

    // Disegna la nota
    ctx.fillStyle = "rgba(0, 123, 255, 0.6)";
    ctx.fillRect(xStart, y - rowHeight / 2 + 2, noteWidth, rowHeight - 4);

    // Disegna il bordo della nota
    ctx.strokeStyle = i === selectedNoteIndex ? "red" : "black";
    ctx.lineWidth = 2;
    ctx.strokeRect(xStart, y - rowHeight / 2 + 2, noteWidth, rowHeight - 4);

    // Etichetta della nota
    ctx.fillStyle = "#fff";
    ctx.font = "8px Arial";
    ctx.textAlign = "center";
    ctx.fillText(note.note, xStart + noteWidth / 2, y);
  });
}


// ==========================
// Pitch Detection Functions
// ==========================
async function startPitchDetection() {
  try {
    if (isDetecting) return;

    // Initial preparation
    isDetecting = true;
    startButton.disabled = true; // Disable the start button
    stopButton.disabled = true;  // Disable the stop button during countdown
    playMelodyButton.disabled = true; // Disable playback button
    resetMelodyButton.disabled = true; // Disable reset button
    pitchDisplay.textContent = "Pitch: N/A";
    noteDisplay.textContent = "Detected Note: N/A";
    deleteNoteButton.disabled = true; // Disable delete button

    recordedNotes = []; // Reset the recorded notes
    renderSequencer();

    // Create a container for the countdown display
    const countdownContainer = document.createElement("div");
    countdownContainer.style.position = "fixed";
    countdownContainer.style.top = "50%";
    countdownContainer.style.left = "50%";
    countdownContainer.style.transform = "translate(-50%, -50%)";
    countdownContainer.style.fontSize = "120px";
    countdownContainer.style.fontWeight = "bold";
    countdownContainer.style.color = "#000"; // Black text color for numbers and message
    countdownContainer.style.fontFamily = "'Arial Black', sans-serif"; // Custom font
    countdownContainer.style.textShadow = "2px 2px 8px rgba(0, 0, 0, 0.5)"; // Subtle shadow
    countdownContainer.style.textAlign = "center";
    document.body.appendChild(countdownContainer);

    // Countdown logic: show "3", "2", "1", then "It's time to record!"
    for (let i = 3; i > 0; i--) {
      countdownContainer.textContent = i; // Display the current countdown number
      await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait for 1 second
    }
    countdownContainer.textContent = "It's time to record!"; // Final message
    countdownContainer.style.fontSize = "100px"; // Adjust font size for the message
    setTimeout(() => document.body.removeChild(countdownContainer), 1500); // Remove the message after 1.5 seconds

    // Access the microphone and initialize the audio
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    source = audioContext.createMediaStreamSource(stream);

    analyser = audioContext.createAnalyser();
    analyser.fftSize = yinOptions.bufferSize;
    const buffer = new Float32Array(analyser.fftSize);

    source.connect(analyser);
    startTime = audioContext.currentTime;

    // Configure the recording progress bar
    const totalDuration = calculateTotalDuration(bpm, 16); // Total duration for 16 bars
    const progressContainer = document.getElementById("recording-progress-container");
    const progressBar = document.getElementById("recording-progress");
    progressContainer.style.display = "block";
    progressBar.value = 0;

    // Update the progress bar periodically
    const updateInterval = 100; // Update every 100ms
    const totalIntervals = (totalDuration * 1000) / updateInterval;
    let currentInterval = 0;

    const progressTimer = setInterval(() => {
      currentInterval++;
      const progress = (currentInterval / totalIntervals) * 100;
      progressBar.value = progress;
      if (currentInterval >= totalIntervals) {
        clearInterval(progressTimer);
      }
    }, updateInterval);

    // Stop recording automatically after the total duration
    recordingTimeout = setTimeout(() => {
      stopPitchDetection();
      alert("Recording stopped after 16 bars.");
    }, totalDuration * 1000);

    // Recursive function for pitch detection
    function detectPitch() {
      if (!isDetecting) return;

      analyser.getFloatTimeDomainData(buffer);

      const maxAmplitude = Math.max(...buffer.map(Math.abs));
      const currentTime = audioContext.currentTime - startTime;

      const frequency = yin.detect(buffer, audioContext.sampleRate);

      // Logic for silence detection and note stabilization
      if (maxAmplitude < silenceThreshold) {
        if (silenceStartTime === null) {
          silenceStartTime = currentTime;
        }
        if (currentTime - silenceStartTime >= minTimeBetweenNotes && activeNote) {
          activeNote.duration = currentTime - activeNote.startTime;
          recordedNotes.push(activeNote);
          activeNote = null;
        }
        requestAnimationFrame(detectPitch);
        return;
      }

      silenceStartTime = null;

      if (!frequency || frequency < 40 || frequency > 5000) {
        requestAnimationFrame(detectPitch);
        return;
      }

      const note = frequencyToNote(frequency);
      if (!note) {
        requestAnimationFrame(detectPitch);
        return;
      }

      if (activeNote) {
        const elapsedTime = currentTime - activeNote.startTime;
        const semitoneDifference = getSemitoneDifference(note, activeNote.note);
        if (elapsedTime < stabilizationTime && Math.abs(semitoneDifference) > maxSemitoneChange) {
          requestAnimationFrame(detectPitch);
          return;
        }
        if (Math.abs(semitoneDifference) <= maxSemitoneChange) {
          activeNote.duration = currentTime - activeNote.startTime;
        } else {
          activeNote.duration = currentTime - activeNote.startTime;
          recordedNotes.push(activeNote);
          activeNote = { frequency, note, startTime: currentTime, duration: 0 };
        }
      } else {
        activeNote = { frequency, note, startTime: currentTime, duration: 0 };
        recordedNotes.push(activeNote);
      }

      pitchDisplay.textContent = `Pitch: ${frequency.toFixed(2)} Hz`;
      noteDisplay.textContent = `Detected Note: ${note}`;

      adjustCanvasWidth(currentTime);
      renderSequencer();

      requestAnimationFrame(detectPitch);
    }

    detectPitch();
    stopButton.disabled = false; // Enable the stop button after recording starts
  } catch (err) {
    console.error("Error during pitch detection:", err);
    pitchDisplay.textContent = "Pitch: Error";
    noteDisplay.textContent = "Detected Note: N/A";
    stopPitchDetection();
  }
}


/**
 * Stops pitch detection.
 */
function stopPitchDetection() {
  if (!isDetecting) return;
  isDetecting = false;
  startButton.disabled = false;
  stopButton.disabled = true;
  playMelodyButton.disabled = recordedNotes.length === 0;
  resetMelodyButton.disabled = recordedNotes.length === 0;
  deleteNoteButton.disabled = recordedNotes.length === 0;
  pitchDisplay.textContent = "Pitch: N/A";
  noteDisplay.textContent = "Detected Note: N/A";
  if (source) source.disconnect();
  if (audioContext) audioContext.close();
  if (stream) {
    stream.getTracks().forEach((track) => track.stop());
  }
  // Clear the recording timeout if it exists
  if (recordingTimeout) {
    clearTimeout(recordingTimeout);
    recordingTimeout = null;}

  // Hide the progress bar
  const progressContainer = document.getElementById("recording-progress-container");
  progressContainer.style.display = "none";

  // Update the duration of the last note
 /* if (recordedNotes.length > 0) {
    const lastNote = recordedNotes[recordedNotes.length - 1];
    const endTime = audioContext.currentTime - startTime;
    lastNote.duration = endTime - lastNote.startTime;
  }*/
  renderSequencer();
}

/**
 * Plays back the recorded melody using sine waves with ADSR envelope.
 */
// ==========================
// Play Melody Button Event Listener
// ==========================

playMelodyButton.addEventListener("click", async () => {
  if (recordedNotes.length === 0) {
    alert("No melody recorded to play.");
    return;
  }

  // Start the Tone.js context
  await Tone.start();

  // Calculate scaling factor based on BPM
  const defaultQuarterNoteDuration = 60 / 120; // Reference BPM
  const scaledQuarterNoteDuration = 60 / bpm; // Current BPM duration
  const timeScale = scaledQuarterNoteDuration / defaultQuarterNoteDuration;

  // Stop any existing melodyPart before creating a new one
  if (melodyPart) {
    melodyPart.stop();
    melodyPart.dispose();
  }

  // Create a new Tone.Part for the recorded melody
  melodyPart = new Tone.Part((time, note) => {
    const osc = new Tone.Oscillator(note.frequency, "sine").toDestination();
    osc.start(time).stop(time + note.duration * timeScale); // Play the note with the scaled duration
  }, recordedNotes.map(note => ({
    time: note.startTime * timeScale,
    frequency: note.frequency,
    duration: note.duration * timeScale,
  })));

  melodyPart.loop = true; // Enable looping
  melodyPart.loopStart = 0;
  melodyPart.loopEnd = calculateTotalDuration(bpm, TOTAL_BARS) * timeScale; // Loop duration based on the melody length

  melodyPart.start(0); // Start the melody at the beginning
  Tone.Transport.start(); // Start the Tone.js Transport

  // Enable the Stop Playback button and disable the Play Melody button
  stopPlaybackButton.disabled = false;
  playMelodyButton.disabled = true;
});

function updateMelodyPart() {
  if (melodyPart) {
    melodyPart.stop(); // Stop the current part
    melodyPart.dispose(); // Dispose of the current part
  }

  // Calculate scaling factor based on BPM
  const defaultQuarterNoteDuration = 60 / 120; // Reference BPM
  const scaledQuarterNoteDuration = 60 / bpm; // Current BPM duration
  const timeScale = scaledQuarterNoteDuration / defaultQuarterNoteDuration;

  // Recreate melodyPart with updated recordedNotes
  melodyPart = new Tone.Part((time, note) => {
    // Create a new oscillator
    const osc = new Tone.Oscillator(note.frequency, document.getElementById("waveform1-select").value);

    // Create a new ADSR envelope
    const envelope = new Tone.AmplitudeEnvelope({
      attack: parseFloat(document.getElementById("attack-slider").value),
      decay: parseFloat(document.getElementById("decay-slider").value),
      sustain: parseFloat(document.getElementById("sustain-slider").value),
      release: parseFloat(document.getElementById("release-slider").value),
    });

    // Create a new filter
    const filter = new Tone.Filter({
      frequency: parseFloat(document.getElementById("filter-frequency").value),
      Q: parseFloat(document.getElementById("filter-resonance").value), // Resonance
      type: "lowpass",
    });

    // Create a new distortion
    const distortion = new Tone.Distortion({
      distortion: parseFloat(document.getElementById("distortion-slider").value),
      oversample: "4x",
    });

    // Create a new chorus
    const chorus = new Tone.Chorus({
      frequency: parseFloat(document.getElementById("chorus-frequency").value),
      depth: parseFloat(document.getElementById("chorus-depth").value),
      spread: parseFloat(document.getElementById("chorus-spread").value),
      type: "sine",
      delayTime: 3.5,
    }).start();

    // Chain effects
    osc.connect(filter);
    filter.connect(distortion);
    distortion.connect(chorus);
    chorus.connect(envelope);
    envelope.toDestination();

    // Start and stop the oscillator with the envelope
    envelope.triggerAttackRelease(note.duration * timeScale, time);
    osc.start(time).stop(time + note.duration * timeScale);
  }, recordedNotes.map(note => ({
    time: note.startTime * timeScale,
    frequency: note.frequency,
    duration: note.duration * timeScale,
  })));

  melodyPart.loop = true; // Enable looping
  melodyPart.loopStart = 0;
  melodyPart.loopEnd = calculateTotalDuration(bpm, TOTAL_BARS) * timeScale;

  melodyPart.start(0); // Restart the melody
}



// ==========================
// Melody Reset Function
// ==========================

/**
 * Resets the recorded melody.
 */
resetMelodyButton.addEventListener("click", () => {
  if (recordedNotes.length === 0) {
    alert("No melody to reset.");
    return;
  }

  // Confirm the action
  const confirmReset = confirm("Are you sure you want to reset the melody?");
  if (!confirmReset) return;
  if (melodyPart) {
    melodyPart.stop();
    melodyPart.dispose();
    melodyPart = null;
  }
  // Stop pitch detection if active
  if (isDetecting) {
    stopPitchDetection();
  }
   // Reset variables
   recordedNotes = [];
   selectedNoteIndex = null; // Deselect any selected note
   renderSequencer();
  // Update button states
  playMelodyButton.disabled = true;
  resetMelodyButton.disabled = true;
  stopPlaybackButton.disabled = true;
  // Reset visual displays
  pitchDisplay.textContent = "Pitch: N/A";
  noteDisplay.textContent = "Note: N/A";
});

// ==========================
// Event Listeners
// ==========================

// Handle metronome toggle button
metronomeToggle.addEventListener("click", () => {
  if (metronomeActive) {
    stopMetronome();
  } else {
    startMetronome();
  }
});

bpmInput.addEventListener("input", (event) => {
  bpm = parseInt(event.target.value, 10) || 120; // Default to 120 BPM if input is invalid

  if (metronomeActive) {
    stopMetronome(); // Stop current metronome
    startMetronome(); // Restart metronome with new BPM
  }

  // Disable BPM input during recording to maintain consistent recording duration
  if (isDetecting) {
    bpmInput.disabled = true;
  } else {
    bpmInput.disabled = false;
  }
  renderSequencer();
});


// Add event listeners to pitch control buttons
startButton.addEventListener("click", startPitchDetection);
stopButton.addEventListener("click", stopPitchDetection);

// ==========================
// Initialization on Page Load
// ==========================

document.addEventListener("DOMContentLoaded", () => {
  stopButton.disabled = true;
  playMelodyButton.disabled = true;
  resetMelodyButton.disabled = true; // Initialize reset button as disabled
  stopPlaybackButton.disabled = true; // Initialize the Stop Playback button as disabled
 
  renderSequencer();
});
/**
 * Shifts all recorded notes up or down by an octave.
 * @param {number} direction - 1 for up, -1 for down.
 */
/**
 * Shifts all recorded notes up or down by an octave.
 * @param {number} direction - 1 for up, -1 for down.
 */
function shiftOctave(direction) {
  if (recordedNotes.length === 0) {
    alert("No notes to shift.");
    return;
  }

  recordedNotes.forEach((note) => {
    const midiNumber = midiFromNoteName(note.note);
    if (midiNumber === null) return;

    // Shift MIDI number by 12 semitones (1 octave)
    const newMidiNumber = midiNumber + direction * 12;

    // Ensure it remains within the valid MIDI range (C2 to C8)
    if (newMidiNumber < 36 || newMidiNumber > 108) {
      alert("Shifting exceeds the valid range of C2 to C8. Adjustment canceled.");
      return;
    }

    const newNoteName = noteNames[newMidiNumber % 12] + Math.floor(newMidiNumber / 12 - 1);
    note.note = newNoteName; // Update note name

    // Update frequency based on the new MIDI number
    const A4 = 440;
    note.frequency = A4 * Math.pow(2, (newMidiNumber - 69) / 12);
    
  });
  updateMelodyPart()
  renderSequencer(); // Re-render the sequencer to reflect changes
}


// Event listeners for the octave shift buttons
document.getElementById("shift-octave-up").addEventListener("click", () => shiftOctave(1));
document.getElementById("shift-octave-down").addEventListener("click", () => shiftOctave(-1));

/**
 * Handles the mousedown event on the sequencer canvas.
 * Determines if a note is being selected for dragging or resizing.
 */
sequencerCanvas.addEventListener("mousedown", (event) => {
  const rect = sequencerCanvas.getBoundingClientRect();
  const lastNote=null;
  // Adjust coordinates based on canvas scaling
  const scaleX = sequencerCanvas.width / rect.width;
  const scaleY = sequencerCanvas.height / rect.height;

  const x = (event.clientX - rect.left) * scaleX;
  const y = (event.clientY - rect.top) * scaleY;
  // Iterate through all recorded notes to check for interaction
  for (let i = 0; i < recordedNotes.length; i++) {
    lastSelectedNoteIndex = i;
    const note = recordedNotes[i];
    const midiNumber = midiFromNoteName(note.note);
    const noteIndex = midiNumber - 36; // MIDI 36 = C2
    const yCenter = sequencerCanvas.height - (noteIndex * rowHeight + rowHeight / 2);

    const xStart = labelWidth + note.startTime * 100;
    const xEnd = xStart + note.duration * 100;

    const resizeThreshold = 5; // Pixels near the edge to trigger resizing

    // Check if the click is within the vertical bounds of the note
    if ( y >= yCenter - rowHeight / 2 && y <= yCenter + rowHeight / 2) {
      if (x >= xStart - resizeThreshold && x <= xStart + resizeThreshold) {
        // Clicked near the start of the note for resizing
        console.log("near the start clicked");
        selectedNoteIndex = i;
        isResizingStart = true;
        dragOffsetX = x - xStart; // Calculate horizontal offset
        isDragging = true; // Enter dragging mode
        updateMelodyPart()
        return;
      } else if (x >= xEnd - resizeThreshold && x <= xEnd + resizeThreshold) {
        // Clicked near the end of the note for resizing
        console.log("near the end clicked");
        selectedNoteIndex = i;
        isResizingEnd = true;
        dragOffsetX = x - xEnd; // Calculate horizontal offset
        isDragging = true; // Enter dragging mode
        updateMelodyPart()
        return;
      } else if (x >= xStart && x <= xEnd) {
        // Clicked inside the note for moving
        console.log("inside clicked");
        selectedNoteIndex = i;
        lastSelectedNoteIndex= i;
        dragOffsetX = x - xStart; // Calculate horizontal offset
        dragOffsetY = y - yCenter; // Calculate vertical offset
        isDragging = true; // Enter dragging mode
        document.getElementById("delete-note").disabled=false;
        updateMelodyPart()
        return;
      }
    }
  }
  // If no note is selected, deselect any previously selected note
  selectedNoteIndex = null;
  renderSequencer();
});


/**
 * Snaps a time value to the nearest grid interval.
 * Useful for aligning notes to a temporal grid.
 * @param {number} time - Time value in seconds.
 * @returns {number} - Snapped time value.
 */
function snapToGrid(time) {
  const gridSize = 0.25; // Grid size in seconds (e.g., quarter seconds)
  return Math.round(time / gridSize) * gridSize;
}

sequencerCanvas.addEventListener("mousemove", (event) => {
  if (!isDragging || selectedNoteIndex === null) 
    return; // Exit if not dragging
  const rect = sequencerCanvas.getBoundingClientRect();

  // Adjust coordinates based on canvas scaling
  const scaleX = sequencerCanvas.width / rect.width;
  const scaleY = sequencerCanvas.height / rect.height;

  const x = (event.clientX - rect.left) * scaleX;
  const y = (event.clientY - rect.top) * scaleY;

  const draggedNote = recordedNotes[selectedNoteIndex];

  if (isResizingStart) {
    // Handle resizing the start of the note
    const newStartTime = Math.max(0, (x - labelWidth) / 100); // Prevent negative start times
    const newDuration = draggedNote.startTime + draggedNote.duration - newStartTime;

    if (newDuration > 0.1) { // Ensure a minimum duration
      draggedNote.startTime = newStartTime;
      draggedNote.duration = newDuration;
    }
  } else if (isResizingEnd) {
    // Handle resizing the end of the note
    const newEndTime = Math.max(draggedNote.startTime + 0.1, (x - labelWidth) / 100); // Ensure minimum duration
    draggedNote.duration = newEndTime - draggedNote.startTime;
  } else {
    // Handle moving the note horizontally (time) and vertically (pitch)
    const unsnappedStartTime = (x - labelWidth - dragOffsetX) / 100;
    const snappedStartTime = snapToGrid(Math.max(0, unsnappedStartTime));

    const midiNumber = 108 - Math.floor((y - dragOffsetY) / rowHeight); // Calculate new MIDI number based on Y position
    const clampedMidiNumber = Math.min(108, Math.max(36, midiNumber)); // Clamp within C2 to C8

    const newNoteName = noteNames[clampedMidiNumber % 12] + Math.floor(clampedMidiNumber / 12 - 1);

    // Prevent overlapping with other notes
    if (!isOverlapping(snappedStartTime, clampedMidiNumber, selectedNoteIndex)) {
      draggedNote.startTime = snappedStartTime; // Update start time
      draggedNote.note = newNoteName;          // Update note name
      draggedNote.frequency = A4 * Math.pow(2, (clampedMidiNumber - 69) / 12); // Update frequency
    }
  }

  renderSequencer(); // Update the sequencer visualization
});


/**
 * Updates the Exponential Moving Average (EMA) with the new frequency.
 * @param {number} frequency - New frequency value in Hz.
 * @returns {number} - Updated EMA frequency.
 */
function updateEMA(frequency) {
  emaFrequency = EMA_ALPHA * frequency + (1 - EMA_ALPHA) * emaFrequency;
  return emaFrequency;
}

/**
 * Snaps a detected frequency to the nearest musical note frequency.
 * @param {number} frequency - Detected frequency in Hz.
 * @returns {number} - Snapped frequency in Hz.
 */
function snapFrequencyToNearestNoteFrequency(frequency) {
  const midiNumber = Math.round(69 + 12 * Math.log2(frequency / A4)); // Calculate closest MIDI number
  const snappedFrequency = A4 * Math.pow(2, (midiNumber - 69) / 12); // Convert back to frequency
  return snappedFrequency;
}

// ==========================
// Note Interaction Functions
// ==========================


/**
 * Checks if a new note position overlaps with existing notes.
 * Prevents multiple notes from occupying the same pitch and time range.
 * @param {number} newStartTime - The new start time of the note in seconds.
 * @param {number} newMidiNumber - The MIDI number of the new note.
 * @param {number} excludeIndex - The index of the note being moved (to exclude from overlap check).
 * @returns {boolean} - True if overlapping, else false.
 */
function isOverlapping(newStartTime, newMidiNumber, excludeIndex) {
  for (let i = 0; i < recordedNotes.length; i++) {
    if (i === excludeIndex) continue; // Skip the note being moved
    const note = recordedNotes[i];
    const noteStart = note.startTime;
    const noteEnd = note.startTime + note.duration;

    // Check if the new note overlaps in both pitch and time
    if (
      newMidiNumber === midiFromNoteName(note.note) &&
      newStartTime < noteEnd &&
      newStartTime + recordedNotes[excludeIndex].duration > noteStart
    ) {
      return true; // Overlap detected
    }
  }
  return false; // No overlap
}

/**
 * Handles the mouseup event to stop dragging or resizing.
 */
window.addEventListener("mouseup", () => {
  if (isDragging) {
    isDragging = false;
    isResizingStart = false;
    isResizingEnd = false;
    //selectedNoteIndex = null;
    updateMelodyPart()
    renderSequencer(); // Finalize the sequencer visualization
  }
});

// ==========================
// Touch Event Handling for Mobile Devices
// ==========================

/**
 * Handles the touchstart event on the sequencer canvas.
 * Similar to mousedown but for touch interactions.
 */
sequencerCanvas.addEventListener("touchstart", (event) => {
  const touch = event.touches[0];
  const rect = sequencerCanvas.getBoundingClientRect();
  const x = touch.clientX - rect.left;
  const y = touch.clientY - rect.top;

  // Iterate through all recorded notes to check for interaction
  for (let i = 0; i < recordedNotes.length; i++) {
    const note = recordedNotes[i];
    const midiNumber = midiFromNoteName(note.note);
    const noteIndex = midiNumber - 36; // MIDI 36 = C2
    const yCenter = sequencerCanvas.height - (noteIndex * rowHeight + rowHeight / 2);

    const xStart = labelWidth + note.startTime * 100;
    const xEnd = xStart + note.duration * 100;

    // Check if the touch is within the bounds of the note
    if ( x >= xStart && x <= xEnd && y >= yCenter - rowHeight / 2 && y <= yCenter + rowHeight / 2) {
      lastSelectedNoteIndex = i;
      selectedNoteIndex = i;
      dragOffsetX = x - xStart; // Calculate horizontal offset
      dragOffsetY = y - yCenter; // Calculate vertical offset
      isDragging = true; // Enter dragging mode
      renderSequencer(); // Update the sequencer visualization
      return;
    }
  }
   // If no note is selected, deselect any previously selected note
   selectedNoteIndex = null;
   renderSequencer();
});

/**
 * Handles the touchmove event on the sequencer canvas.
 * Allows for dragging and resizing of notes based on touch movement.
 */
sequencerCanvas.addEventListener("touchmove", (event) => {
  if (!isDragging || selectedNoteIndex === null) return; // Exit if not dragging

  const touch = event.touches[0];
  const rect = sequencerCanvas.getBoundingClientRect();
  const x = touch.clientX - rect.left;
  const y = touch.clientY - rect.top;

  const draggedNote = recordedNotes[selectedNoteIndex];
  const newStartTime = snapToGrid((x - labelWidth - dragOffsetX) / 100);
  const newMidiNumber = 108 - Math.floor((y - dragOffsetY) / rowHeight);
  const clampedMidiNumber = Math.min(108, Math.max(36, newMidiNumber));

  const newNoteName = noteNames[clampedMidiNumber % 12] + Math.floor(clampedMidiNumber / 12 - 1);

  // Prevent overlapping with other notes
  if (!isOverlapping(newStartTime, clampedMidiNumber, selectedNoteIndex)) {
    draggedNote.startTime = Math.max(0, newStartTime); // Update start time
    draggedNote.note = newNoteName;                   // Update note name
    draggedNote.frequency = A4 * Math.pow(2, (clampedMidiNumber - 69) / 12); // Update frequency
    renderSequencer(); // Update the sequencer visualization
  }
});

/**
 * Handles the touchend event to stop dragging or resizing.
 */
sequencerCanvas.addEventListener("touchend", () => {
  if (isDragging) {
    isDragging = false;
    selectedNoteIndex = null;
    renderSequencer(); // Finalize the sequencer visualization
  }
});


// ==========================
// Deletion Functions
// ==========================

/**
 * Handles deletion of the selected note via the Delete button.
 * Prompts the user for confirmation before deletion.
 */
document.getElementById("delete-note").addEventListener("click", () => {
  if (selectedNoteIndex !== null) {
    // Confirm deletion with the user
    const confirmDelete = confirm("Are you sure you want to delete the selected note?");
    if (confirmDelete) {
      // Remove the note from the recordedNotes array
      console.log("Deleting a note...");
      recordedNotes.splice(selectedNoteIndex, 1);
      recordedNotes.splice(selectedNoteIndex, 1);
      selectedNoteIndex = null;
      lastSelectedNoteIndex = null;
      updateMelodyPart()
      renderSequencer(); // Update the sequencer visualization
    }
  }
});

/**
 * Handles deletion of the selected note via the Delete key on the keyboard.
 * Prompts the user for confirmation before deletion.
 */
document.addEventListener("keydown", (event) => {
  if (event.key === "Delete" && selectedNoteIndex !== null) {
    const confirmDelete = confirm("Are you sure you want to delete the selected note?");
    if (confirmDelete) {
      recordedNotes.splice(selectedNoteIndex, 1);
      selectedNoteIndex = null;
      updateMelodyPart()
      renderSequencer(); // Update the sequencer visualization
    }
  }
});

// ==========================
// Additional BPM Input Handling
// ==========================

/**
 * Updates the BPM based on user input.
 * Also restarts the metronome if it's active and disables BPM changes during recording.
 */
bpmInput.addEventListener("input", (event) => {
  bpm = parseInt(event.target.value, 10) || 120; // Default to 120 BPM if input is invalid
  if (metronomeActive) {
    stopMetronome(); // Stop current metronome
    startMetronome(); // Restart metronome with new BPM
  }
  // Disable BPM input during recording to maintain consistent recording duration
  if (isDetecting) {
    bpmInput.disabled = true;
  } else {
    bpmInput.disabled = false;
  }
});


/**
 * Calculates the total duration based on BPM and number of bars.
 * @param {number} bpm - Beats per minute.
 * @param {number} bars - Number of bars.
 * @returns {number} - Total duration in seconds.
 */
function calculateTotalDuration(bpm, bars = TOTAL_BARS) {
  const beatsPerSecond = bpm / 60;
  return (bars * BEATS_PER_BAR) / beatsPerSecond;
}

// Shared envelope
const envelope = new Tone.AmplitudeEnvelope({
  attack: 0.1,
  decay: 0.2,
  sustain: 0.5,
  release: 1.5,
}).toDestination();

const chorus = new Tone.Chorus({
  frequency: 1.5, // Frequency of the modulation
  delayTime: 3.5, // Delay time of the chorus
  depth: 0,     // Depth of the modulation
  type: "sine",   // Type of LFO waveform
  spread: 180,    // Stereo spread in degrees
}).start();

// Filter
const filter = new Tone.Filter({
  frequency: 500, // Default cutoff frequency
  type: "lowpass", // Default filter type
  rolloff: -12, // Slope of the filter
  Q: 1, // Default resonance
});

// Distortion
const distortion = new Tone.Distortion({
  distortion: 0.4, // Default amount of distortion
  oversample: "4x", // Increases audio fidelity
});

filter.connect(distortion);
distortion.connect(chorus); // Process audio through chorus
chorus.connect(envelope);
envelope.toDestination();  

const lfo = new Tone.LFO({
  type: "sine", // Default LFO waveform
  frequency: 0.5, // Default frequency in Hz
  min: 200, // Minimum modulation range
  max: 1000, // Maximum modulation range
}).start(); // Start the LFO

// Update the LFO waveform
function setLfoWaveform(type) {
  lfo.type = type; // Update the LFO waveform type
}

// Attach event listener for the LFO waveform selection
document.getElementById("lfo-waveform").addEventListener("change", (event) => {
  setLfoWaveform(event.target.value);
});
let lfoEnabled = false; // Toggle for LFO effect on the filter

// Function to toggle LFO
function toggleLfo(enabled) {
  if (enabled) {
    lfo.connect(filter.frequency); // Connect LFO to filter frequency
  } else {
    lfo.disconnect(filter.frequency);
    filter.frequency.value = 500;
    document.getElementById("filter-frequency-        value").textContent = "500 Hz";
  }
  lfoEnabled = enabled;
}

// Oscillators and gains
const osc1 = new Tone.Oscillator("C3", "sine").start();
const osc1Gain = new Tone.Gain(0.5).connect(filter);

const osc2 = new Tone.Oscillator("C3", "sine").start();
const osc2Gain = new Tone.Gain(0.5).connect(filter);

const osc3 = new Tone.Oscillator("C3", "sine").start();
const osc3Gain = new Tone.Gain(0.5).connect(filter);

// Connect oscillators to filter
osc1.connect(osc1Gain);
osc2.connect(osc2Gain);
osc3.connect(osc3Gain);

// Update oscillator waveforms
function setOsc1WaveType(type) {
  osc1.type = type;
}

function setOsc2WaveType(type) {
  osc2.type = type;
}

function setOsc3WaveType(type) {
  osc3.type = type;
}


// Control oscillator volumes
function setOsc1Volume(value) {
  osc1Gain.gain.value = value;
}

function setOsc2Volume(value) {
  osc2Gain.gain.value = value;
}

function setOsc3Volume(value) {
  osc3Gain.gain.value = value;
}

// Update envelope dynamically
function updateEnvelope(param, value) {
  envelope[param] = parseFloat(value);
}

// Update filter dynamically
function setFilterFrequency(value) {
  filter.frequency.value = value;
}

function setFilterResonance(value) {
  filter.Q.value = value; // Q is the filter's resonance
}

function setChorusFrequency(value) {
  chorus.frequency.value = value;
}

function setChorusDepth(value) {
  chorus.depth = value;
}

function setChorusSpread(value) {
  chorus.spread = value;
}

// Update LFO dynamically
function setLfoFrequency(value) {
  lfo.frequency.value = value; // Update LFO rate
}

function setLfoAmount(value) {
  // Dynamically set the LFO modulation depth
  lfo.min = filter.frequency.value - value; // Lower bound of modulation
  lfo.max = filter.frequency.value + value; // Upper bound of modulation
}

// Update distortion dynamically
function setDistortionAmount(value) {
  distortion.distortion = value;
}

// Attach event listeners for waveform selection
document.getElementById("waveform1-select").addEventListener("change", (event) => {
  setOsc1WaveType(event.target.value);
  updateMelodyPart();
});

document.getElementById("waveform2-select").addEventListener("change", (event) => {
  setOsc2WaveType(event.target.value);
  updateMelodyPart();
});

document.getElementById("waveform3-select").addEventListener("change", (event) => {
  setOsc2WaveType(event.target.value);
  updateMelodyPart();
});

// Attach event listeners for volume sliders
document.getElementById("volume1-slider").addEventListener("input", (event) => {
  setOsc1Volume(parseFloat(event.target.value));
  updateMelodyPart();
});

document.getElementById("volume2-slider").addEventListener("input", (event) => {
  setOsc2Volume(parseFloat(event.target.value));
  updateMelodyPart();
});

document.getElementById("volume3-slider").addEventListener("input", (event) => {
  setOsc2Volume(parseFloat(event.target.value));
  updateMelodyPart();
});

document.getElementById("chorus-frequency").addEventListener("input", (event) => {
  const value = parseFloat(event.target.value);
  setChorusFrequency(value);
  document.getElementById("chorus-frequency-value").textContent = `${value} Hz`;
  updateMelodyPart();
});

document.getElementById("chorus-depth").addEventListener("input", (event) => {
  const value = parseFloat(event.target.value);
  setChorusDepth(value);
  document.getElementById("chorus-depth-value").textContent = `${value}`;
  updateMelodyPart();
});

document.getElementById("chorus-spread").addEventListener("input", (event) => {
  const value = parseFloat(event.target.value);
  setChorusSpread(value);
  document.getElementById("chorus-spread-value").textContent = `${value}`;
  updateMelodyPart();
});

// Attach event listeners for ADSR sliders
document.querySelectorAll(".adsr-slider").forEach((slider) => {
  slider.addEventListener("input", (event) => {
    const param = event.target.dataset.param;
    const value = event.target.value;
    updateEnvelope(param, value);
    document.getElementById(`${param}-value`).textContent = value;
    updateMelodyPart();
  });
});

// Attach event listeners for filter controls
document.getElementById("filter-frequency").addEventListener("input", (event) => {
  const value = parseFloat(event.target.value);
  setFilterFrequency(value);
  document.getElementById("filter-frequency-value").textContent = `${value} Hz`;
  updateMelodyPart();
});

document.getElementById("filter-resonance").addEventListener("input", (event) => {
  const value = parseFloat(event.target.value);
  setFilterResonance(value);
  document.getElementById("filter-resonance-value").textContent = value;
  updateMelodyPart();
});

// Attach event listener for LFO
document.getElementById("lfo-frequency").addEventListener("input", (event) => {
  const value = parseFloat(event.target.value);
  setLfoFrequency(value);
  document.getElementById("lfo-frequency-value").textContent = `${value} Hz`;
  updateMelodyPart();
});

document.getElementById("lfo-amount").addEventListener("input", (event) => {
  const value = parseFloat(event.target.value);
  setLfoAmount(value);
  document.getElementById("lfo-amount-value").textContent = `${value}`;
  updateMelodyPart();
});

document.getElementById("lfo-toggle").addEventListener("change", (event) => {
  toggleLfo(event.target.checked);
  updateMelodyPart();
});

// Attach event listener for distortion
document.getElementById("distortion-slider").addEventListener("input", (event) => {
  const value = parseFloat(event.target.value);
  setDistortionAmount(value);
  document.getElementById("distortion-value").textContent = value;
});
// ==========================
// Stop Playback Button Event Listener
// ==========================

const stopPlaybackButton = document.getElementById("stop-playback"); // Get the button element

stopPlaybackButton.addEventListener("click", () => {
  if (melodyPart) {
    melodyPart.stop();
    melodyPart.dispose();
    melodyPart = null;
  }

  // Stop the Tone.Transport if no other parts are active
  if (Tone.Transport.state === 'started') {
    Tone.Transport.stop();
  }

  // Re-enable the Play button and disable the Stop Playback button
  playMelodyButton.disabled = false;
  stopPlaybackButton.disabled = true;
});
