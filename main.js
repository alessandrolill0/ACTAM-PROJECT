///////////////////////////// Imports and Configurations ///////////////////////////// 

import { Yin } from "https://cdn.jsdelivr.net/npm/@dipscope/pitch-detector/+esm";  // Import Yin for pitch detection and its configuration
const yinOptions = { bufferSize: 2048, threshold: 0.15 };
const yin = new Yin(yinOptions);
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, doc, getDoc } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js"; //Import the functions you need from the SDKs you need
const firebaseConfig = {
  apiKey: "AIzaSyB7SWop84nuQls0y6Jya1gjUVzOW2kftRo",
  authDomain: "actam-project-42ae0.firebaseapp.com",
  projectId: "actam-project-42ae0",
  storageBucket: "actam-project-42ae0.firebasestorage.app",
  messagingSenderId: "1008439092855",
  appId: "1:1008439092855:web:44f86152c587efe266c872"
};
const app = initializeApp(firebaseConfig); //Initialize Firebase
const db = getFirestore(app);

//DOM Elements Selection
//const pitchDisplay = document.getElementById("pitch");
//const noteDisplay = document.getElementById("note");
const startButton = document.getElementById("start");
const stopButton = document.getElementById("stop");
const playMelodyButton = document.getElementById("play-melody");
const resetMelodyButton = document.getElementById("reset-melody");
const deleteNoteButton = document.getElementById("delete-note");
const sequencerCanvas = document.getElementById("sequencer");
const ctx = sequencerCanvas.getContext("2d");
const bpmInput = document.getElementById("bpm-input");
const metronomeToggle = document.getElementById("metronome-toggle");
const metronomeButton = document.getElementById("metronome-button");
const stopPlaybackButton = document.getElementById("stop-playback"); // Get the button element

//Global Variables
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
const maxSemitoneChange = 4 // Max semitone change allowed for same note
const noteNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]; // Constants for notes and sequencing
const MIN_TIME_BETWEEN_NOTES = 0.3; // Seconds
const SEMITONE_THRESHOLD = 1; // Minimum semitone difference
const labelWidth = 100; // Space between each note label
const rowHeight = 20; // Height of each row in the sequencer
const BEATS_PER_BAR = 1; // 4/4 time signature
const TOTAL_BARS = 16;
let melodyPart = null;
const PIXELS_PER_BAR = 100; // Fixed width per bar in pixels
let progressTimer= null;

///////////////////////////// RECORDING/PITCH DETECTION FUNCTIONS ///////////////////////////// 

//Converts a frequency to a musical note.
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

//Converts a note name to its corresponding MIDI number.
function midiFromNoteName(note) {
  const regex = /^([A-G]#?)(\d)$/;   //Regular expression to validate and capture the note name and octave.
  const match = note.match(regex);  //Attempt to match the input string against the regex
  if (!match) 
    return null;
  const name = match[1];
  const octave = parseInt(match[2], 10); //Convert octave string to an integer.
  const index = noteNames.indexOf(name);
  return index + (octave + 1) * 12;
}

//Calculates the absolute semitone difference between two notes.
function getSemitoneDifference(note1, note2) {
  const midi1 = midiFromNoteName(note1);
  const midi2 = midiFromNoteName(note2);
  if (midi1 === null || midi2 === null) return 0;
  return Math.abs(midi2 - midi1);
}

//Function that finds if a note is a diesis or not
function isBlackKey(note) {
  const blackKeys = ["C#", "D#", "F#", "G#", "A#"];
  const name = note.slice(0, -1); //Get the note name without the octave
  return blackKeys.includes(name);
}
 
//Rendering the piano roll and drawing the rcorded notes on the screen
function renderSequencer() {
  //Calculating 16 bars
  const totalWidth = labelWidth + TOTAL_BARS * PIXELS_PER_BAR;
  const totalHeight = (108 - 36 + 1) * rowHeight; // From C2 to C8
  sequencerCanvas.width = totalWidth;
  sequencerCanvas.height = totalHeight;
  ctx.clearRect(0, 0, sequencerCanvas.width, sequencerCanvas.height);
  const noteRange = [];//From c2 to c6
  for (let octave = 2; octave <= 8; octave++) {
    for (let name of noteNames) {
      noteRange.push(`${name}${octave}`);
    }
  }
  //Draw the horizontal lines
ctx.strokeStyle = "rgba(200, 200, 200, 0.5)"; //Light color for the grid
ctx.lineWidth = 1;
noteRange.forEach((_, index) => {
  const y = index * rowHeight;
  ctx.beginPath();
  ctx.moveTo(labelWidth, y); //Start the target line
  ctx.lineTo(sequencerCanvas.width, y); //To the end of the canvas
  ctx.stroke();
});
const whiteKeyWidth = 60; // white notes width
const blackKeyWidth = 47; //black notes width
const keyHeight = rowHeight; // Altezza di ogni tasto

noteRange.forEach((note, index) => {
  const y = index * rowHeight; //Vertical position
  const isBlack = isBlackKey(note); //Checks if diesis
  if (isBlack) {
    // Disegna tasto nero (spostato verso destra)
    const blackKeyOffset = whiteKeyWidth - blackKeyWidth; //Having the same length of white keys
    ctx.fillStyle = "#000";
    ctx.fillRect(
      labelWidth - blackKeyWidth - blackKeyOffset, //Putting the key in the right position
      sequencerCanvas.height - y - keyHeight,
      blackKeyWidth,
      keyHeight
    );
  } else {
    //Draw white key
    ctx.fillStyle = "#fff";
    ctx.fillRect(
      labelWidth - whiteKeyWidth, //Same position
      sequencerCanvas.height - y - keyHeight,
      whiteKeyWidth,
      keyHeight
    );
    ctx.strokeStyle = "#000"; //Black margin for white keys
    ctx.strokeRect(
      labelWidth - whiteKeyWidth,
      sequencerCanvas.height - y - keyHeight,
      whiteKeyWidth,
      keyHeight
    );

    // C for white notes as reference
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
  for (let bar = 0; bar <= TOTAL_BARS; bar++) {
    const x = labelWidth + bar * PIXELS_PER_BAR;
    ctx.strokeStyle = "#aaa";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, sequencerCanvas.height);
    ctx.stroke();
    ctx.fillStyle = "#333";    //Each bar has an associated number
    ctx.font = "10px Arial";
    ctx.textAlign = "center";
    ctx.fillText(` ${bar}`, x, 10);
  }
  //Draw the recorded notes
  recordedNotes.forEach((note, i) => {
    const midiNumber = midiFromNoteName(note.note);
    if (midiNumber === null) return;
    //Calc Y position
    const noteIndex = midiNumber - 36; // Offset C2=36
    const y = sequencerCanvas.height - (noteIndex * rowHeight + rowHeight / 2);
    //Calc X position
    const beatsPerNote = note.duration / (60 / bpm); // Duration in beats
    const xStart = labelWidth + (note.startTime / (60 / bpm)) * (PIXELS_PER_BAR / BEATS_PER_BAR);
    const xEnd = xStart + beatsPerNote * (PIXELS_PER_BAR / BEATS_PER_BAR);
    const noteWidth = xEnd - xStart;
    if (i === selectedNoteIndex) {
      ctx.strokeStyle = "red"; //red margin
      ctx.lineWidth = 2; //width
      ctx.strokeRect(xStart, y - rowHeight / 2 + 2, noteWidth, rowHeight - 4);
    }
    //Draw the note
    ctx.fillStyle = "rgba(0, 123, 255, 0.6)";
    ctx.fillRect(xStart, y - rowHeight / 2 + 2, noteWidth, rowHeight - 4);
    //Draw the margin
    ctx.strokeStyle = i === selectedNoteIndex ? "red" : "black";
    ctx.lineWidth = 2;
    ctx.strokeRect(xStart, y - rowHeight / 2 + 2, noteWidth, rowHeight - 4);
    //Note name
    ctx.fillStyle = "#fff";
    ctx.font = "8px Arial";
    ctx.textAlign = "center";
    ctx.fillText(note.note, xStart + noteWidth / 2, y);
  });
}

//Start pitch detection
async function startPitchDetection() {
  try {
    startButton.classList.add("recording"); // Aggiungi lo stato "recording"

    recordedNotes = []; // the previous array is deleted
    clearTimeout(recordingTimeout);
    if (progressTimer !== null) { // Clear existing progressTimer if any
      clearInterval(progressTimer);
      progressTimer = null;
      progressBar.value = 0; // Reset the progress bar
    }
    if (isDetecting) return;
    if (melodyPart) {
      melodyPart.stop();
      melodyPart.dispose();
      melodyPart = null;
    }
    recordedNotes.forEach(() => {
      osc1.dispose();
      osc2.dispose();
      osc3.dispose();
      envelope.dispose();
      filter.dispose();
      distortion.dispose();
      chorus.dispose();
    });

    // Preparazione iniziale
    isDetecting = true;
    startButton.disabled = true;
    stopButton.disabled = true;
    playMelodyButton.disabled = true;
    resetMelodyButton.disabled = true;
    deleteNoteButton.disabled = true;
    renderSequencer();

    // Container for countdown
    const countdownContainer = document.createElement("div");
    countdownContainer.style.position = "fixed";
    countdownContainer.style.top = "54%";
    countdownContainer.style.left = "50%";
    countdownContainer.style.transform = "translate(-50%, -50%)";
    countdownContainer.style.fontSize = "120px";
    countdownContainer.style.fontWeight = "bold";
    countdownContainer.style.color = "#fff";
    countdownContainer.style.backgroundColor = "fff";
    countdownContainer.style.fontFamily = "'Arial Black', sans-serif";
    countdownContainer.style.textShadow = "2px 2px 8px rgba(255, 255, 255, 0.5)";
    countdownContainer.style.textAlign = "center";
    document.body.appendChild(countdownContainer);

    // Countdown based on bpm
    const beatDuration = 60 / bpm; // Calcola la durata di un battito
    for (let i = 4; i > 0; i--) {
      countdownContainer.textContent = i; // Mostra il numero corrente
      await new Promise((resolve) => setTimeout(resolve, beatDuration * 1000)); // Attende il tempo di un battito
    }
    countdownContainer.textContent = "It's time to record!"; // Messaggio finale
    countdownContainer.style.fontSize = "100px"; 
    setTimeout(() => document.body.removeChild(countdownContainer), beatDuration * 1500);

    // Start metronome with the rec
    if (metronomeToggle.checked) {
      console.log("Start metronome with recording.");
      startMetronome(); // Il metronomo inizia con la registrazione
    }

    // Delay before recording
    const recordingDelay = 350; // Milliseconds delay
    console.log(`La registrazione inizierà tra ${recordingDelay}ms.`);
    await new Promise((resolve) => setTimeout(resolve, recordingDelay)); // Aspetta il ritardo

    // Access to microphone
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    source = audioContext.createMediaStreamSource(stream);
    analyser = audioContext.createAnalyser();
    analyser.fftSize = yinOptions.bufferSize;
    const buffer = new Float32Array(analyser.fftSize);
    source.connect(analyser);
    startTime = audioContext.currentTime;

    // Configurazione della barra di avanzamento della registrazione
    const totalDuration = calculateTotalDuration(bpm, 16); // Durata totale per 16 misure
    const progressContainer = document.getElementById("recording-progress-container");
    const progressBar = document.getElementById("recording-progress");
    progressContainer.style.display = "block";
    progressBar.value = 0;

    // Aggiorna la barra di avanzamento periodicamente
    const updateInterval = 100; // Aggiorna ogni 100ms
    const totalIntervals = (totalDuration * 1000) / updateInterval;
    let currentInterval = 0;
    progressTimer = setInterval(() => {
      currentInterval++;
      const progress = (currentInterval / totalIntervals) * 100;
      progressBar.value = progress;
      if (currentInterval >= totalIntervals) {
        clearInterval(progressTimer);
        progressTimer = null;
      }
    }, updateInterval);

    // Interrompi la registrazione automaticamente dopo la durata totale
    recordingTimeout = setTimeout(() => {
      stopPitchDetection(); // Interrompi la registrazione
      alert("Recording stopped after 16 bars.");
    }, totalDuration * 1000);

    // Recursive function for pitch detection
    function detectPitch() {
      if (!isDetecting) return;
      analyser.getFloatTimeDomainData(buffer);
      const maxAmplitude = Math.max(...buffer.map(Math.abs));
      const currentTime = audioContext.currentTime - startTime;
      const frequency = yin.detect(buffer, audioContext.sampleRate);
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
      }
      //pitchDisplay.textContent = `Pitch: ${frequency.toFixed(2)} Hz`;
      //noteDisplay.textContent = `Detected Note: ${note}`;
      renderSequencer();
      requestAnimationFrame(detectPitch);
    }
    detectPitch();
    stopButton.disabled = false; // Abilita il pulsante "Stop" dopo l'inizio della registrazione
  } catch (err) {
    console.error("Errore durante il rilevamento del pitch:", err);
    //pitchDisplay.textContent = "Pitch: Error";
    //noteDisplay.textContent = "Detected Note: N/A";
    stopPitchDetection();
  }
  toggleSaveButtonState();
  document.getElementById("save-melody").disabled = true;
}


//Stop pitch detection
function stopPitchDetection() {
  if (!isDetecting) return;

  startButton.classList.remove("recording"); // Rimuovi lo stato "recording"

  isDetecting = false;
  startButton.disabled = false;
  stopButton.disabled = true;
  playMelodyButton.disabled = recordedNotes.length === 0;
  resetMelodyButton.disabled = recordedNotes.length === 0;
  deleteNoteButton.disabled = recordedNotes.length === 0;
  //pitchDisplay.textContent = "Pitch: N/A";
  //noteDisplay.textContent = "Detected Note: N/A";

  if (source) source.disconnect(); // Disconnect audio context and stop stream
  if (audioContext) audioContext.close();
  if (stream) {
    stream.getTracks().forEach((track) => track.stop());
  }

  if (recordingTimeout) { // Clear and reset the recording timeout
    clearTimeout(recordingTimeout);
    recordingTimeout = null;
  }

  if (progressTimer !== null) {
    clearInterval(progressTimer);
    progressTimer = null;
  }

  const progressContainer = document.getElementById("recording-progress-container");
  const progressBar = document.getElementById("recording-progress");
  progressContainer.style.display = "none";
  progressBar.value = 0; // Reset the progress bar to 0
  progressContainer.style.display = "none";

  // Stop the metronome when the rec stops
  if (metronomeActive) {
    console.log("Record completed");
    stopMetronome();
  }

  quantizeNotes();
  renderSequencer();

  document.getElementById("save-melody").disabled = recordedNotes.length === 0;
}

function calculateTotalDuration(bpm, bars = TOTAL_BARS) {
  const beatsPerSecond = bpm / 60;
  return (bars * BEATS_PER_BAR) / beatsPerSecond;
}

///////////////////////////// METRONOME FUNCTIONS ///////////////////////////// 

//Play Metronome
function playMetronomeClick(isLastBeat = false) {
  const audio = new Audio("./audio/metronome-85688.mp3");
  audio.volume = isLastBeat ? 0.0146 : 0.012; //Leveling the volume
  audio.play().catch((err) => {
    console.error("Error during metronome reproduction:", err);
  });
}

//Start Metronome
function startMetronome() {
  if (metronomeActive) return;
  metronomeActive = true;
  metronomeToggle.textContent = "Stop Metronome";
  const beatsPerBar = 4; // Numero di battiti per misura
  let currentBeat = 0;
  const interval = getMetronomeInterval(bpm) * 1000; // Intervallo in millisecondi
  metronomeInterval = setInterval(() => {
    currentBeat++;
    const isLastBeat = currentBeat === beatsPerBar;
    playMetronomeClick(isLastBeat);
    if (isLastBeat) {
      currentBeat = 0; // Resetta il conteggio
    }
  }, interval);
}
//Stop the metronome
function stopMetronome() {
  if (!metronomeActive) return;
  metronomeActive = false;
  metronomeToggle.textContent = "Start Metronome";
  clearInterval(metronomeInterval);
  metronomeInterval = null;
}
function getMetronomeInterval(bpm) {
  return 60 / bpm;
}

///////////////////////////// CREATING MELODY FROM SYNTH FUNCTIONS ///////////////////////////// 

//Creates and starts the melodyPart using current synth parameters.
function createAndStartMelodyPart() {
  createMelody();
  if (Tone.Transport.state !== 'started') {
    Tone.Transport.start();
  }
  melodyPart.start(0);
  // Update button states
  stopPlaybackButton.disabled = false;
  playMelodyButton.disabled = true;
}

function createMelody() {
  if (!melodyPart) {
    //If melodyPart doesn't exist, create it
    melodyPart = new Tone.Part((time, note) => {
      //Set oscillator frequencies dynamically
      osc1.frequency.setValueAtTime(note.frequency, time);
      osc2.frequency.setValueAtTime(note.frequency, time);
      osc3.frequency.setValueAtTime(note.frequency, time);
      //Trigger the global envelope for the note's duration
      envelope.triggerAttackRelease(note.duration, time);
    }, recordedNotes.map(note => ({
      time: note.startTime, // Note start time
      frequency: note.frequency, // Note frequency
      duration: note.duration, // Note duration
    })));

    //Configure melody looping
    melodyPart.loop = true;
    melodyPart.loopStart = 0;
    melodyPart.loopEnd = calculateTotalDuration(bpm, TOTAL_BARS);

    //Start the melodyPart
    melodyPart.start(0);
  } else {
    //If melodyPart already exists, update its notes and parameters
    melodyPart.events = recordedNotes.map(note => ({
      time: note.startTime,
      frequency: note.frequency,
      duration: note.duration,
    }));
  }
  //Update global synth parameters in real time
  try {
    updateSynthParameters();
  } catch (error) {
    console.error("Error updating synth parameters:", error);
  }
}

// Updates global synth parameters dynamically
function updateSynthParameters() {
  try {
    // Validate and update filter parameters
    const frequency = parseFloat($("#filter-frequency-knob").roundSlider("option", "value"));
    if (isNaN(frequency) || frequency <= 0) {
      throw new RangeError(`Invalid filter frequency: ${frequency}`);
    }
    filter.frequency.rampTo(frequency, 0.1);

    const resonance = parseFloat($("#filter-resonance-knob").roundSlider("option", "value"));
    if (isNaN(resonance) || resonance < 0) {
      throw new RangeError(`Invalid filter resonance (Q): ${resonance}`);
    }
    filter.Q.value = resonance;

    // Validate and update envelope parameters
    ["attack", "decay", "sustain", "release"].forEach(param => {
      const value = parseFloat($(`#${param}-knob`).roundSlider("option", "value"));
      if (isNaN(value) || value < 0) {
        throw new RangeError(`Invalid envelope parameter (${param}): ${value}`);
      }
      envelope[param] = value; // Update envelope parameter
    });

    // Validate and update oscillator waveforms
    const waveforms = ["waveform1-select", "waveform2-select", "waveform3-select"];
    waveforms.forEach((id, i) => {
      const osc = [osc1, osc2, osc3][i];
      const waveform = document.getElementById(id).value;
      if (!["sine", "square", "triangle", "sawtooth"].includes(waveform)) {
        throw new Error(`Invalid waveform for oscillator ${i + 1}: ${waveform}`);
      }
      osc.type = waveform; // Update oscillator type
    });

    console.log("Synth parameters updated successfully.");
  } catch (error) {
    console.error("Error updating synth parameters:", error.message);
  }
}

//Recreates the melodyPart with updated timings and parameters.
function recreateMelodyPart() {
  if (melodyPart) {
    melodyPart.stop();
    melodyPart.dispose();
    melodyPart = null;
  }
  // Create a new Tone.Part with updated note timings
  melodyPart = new Tone.Part((time, note) => {
    osc1.frequency.setValueAtTime(note.frequency, time);
    osc2.frequency.setValueAtTime(note.frequency, time);
    osc3.frequency.setValueAtTime(note.frequency, time);
    envelope.triggerAttackRelease(note.duration, time);
  }, recordedNotes.map(note => ({
    time: note.startTime,
    frequency: note.frequency,
    duration: note.duration,
  })));
  //Configure looping
  melodyPart.loop = true;
  melodyPart.loopStart = 0;
  melodyPart.loopEnd = calculateTotalDuration(bpm, TOTAL_BARS);
  melodyPart.start(0); // Restart playback
}

//Snaps a time value to the nearest grid interval.
function snapToGrid(time) {
  const gridSize = (60/bpm)/4; // Grid size in seconds (e.g., quarter seconds)
  return Math.round(time / gridSize) * gridSize;
}

//Directly quantizes recorded notes
function quantizeNotes() {
  const gridSize = (60 / bpm) / 4; // Sixteenth note duration
  recordedNotes = recordedNotes.map(note => {
    const snappedStartTime = Math.round(note.startTime / gridSize) * gridSize;
    const snappedDuration = Math.round(note.duration / gridSize) * gridSize;
    return {
      ...note,
      startTime: snappedStartTime,
      duration: snappedDuration,
    };
  });
  renderSequencer(); // Update the sequencer visualization
}

///////////////////////////// NOTE INTERACTION FUNCTIONS //////////////////////////////////

//Shifts all recorded notes up or down by an octave.
function shiftOctave(direction) {
  if (recordedNotes.length === 0) {
    alert("No notes to shift.");
    return;
  }
  recordedNotes.forEach((note) => {
    const midiNumber = midiFromNoteName(note.note);
    if (midiNumber === null) return;

    //Shift MIDI number by 12 semitones (1 octave)
    const newMidiNumber = midiNumber + direction * 12;

    //Ensure it remains within the valid MIDI range (C2 to C8)
    if (newMidiNumber < 36 || newMidiNumber > 108) {
      alert("Shifting exceeds the valid range of C2 to C8. Adjustment canceled.");
      return;
    }
    const newNoteName = noteNames[newMidiNumber % 12] + Math.floor(newMidiNumber / 12 - 1);
    note.note = newNoteName; // Update note name
    //Update frequency based on the new MIDI number
    const A4 = 440;
    note.frequency = A4 * Math.pow(2, (newMidiNumber - 69) / 12);
  });
  createMelody();
  renderSequencer(); // Re-render the sequencer to reflect changes
}

//Checks if a new note position overlaps with existing notes.
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


///////////////////////////// SYNTH PARAMETERS ///////////////////////////// 
//Shared envelope
const envelope = new Tone.AmplitudeEnvelope({
  attack: 0.1,
  decay: 0.2,
  sustain: 0.5,
  release: 1.5,
}).toDestination();

const chorus = new Tone.Chorus({
  frequency: 1.5,
  delayTime: 3.5,
  depth: 0,
  type: "sine",
  spread: 180,
}).start();

const filter = new Tone.Filter({
  frequency: 500,
  type: "lowpass",
  rolloff: -12,
  Q: 1,
});

const distortion = new Tone.Distortion({
  distortion: 0.4,
  oversample: "4x",
});

// Chain effects
filter.connect(distortion);
distortion.connect(chorus);
chorus.connect(envelope);
envelope.toDestination();

const lfo = new Tone.LFO({
  type: "sine",
  frequency: 0.5,
  min: 200,
  max: 1000,
}).start();

// Update the LFO waveform
function setLfoWaveform(type) {
  lfo.type = type;
}

document.getElementById("lfo-waveform").addEventListener("change", (event) => {
  setLfoWaveform(event.target.value);
});

//Oscillators and gains
const osc1 = new Tone.Oscillator("C3", "sine").start();
const osc1Gain = new Tone.Gain(0.5);
const osc2 = new Tone.Oscillator("C3", "sine").start();
const osc2Gain = new Tone.Gain(0.5);
const osc3 = new Tone.Oscillator("C3", "sine").start();
const osc3Gain = new Tone.Gain(0.5);

osc1.connect(osc1Gain);
osc2.connect(osc2Gain);
osc3.connect(osc3Gain);

osc1Gain.connect(filter);
osc2Gain.connect(filter);
osc3Gain.connect(filter);

function setOscWaveType(osc, type) {
  osc.type = type;
}

function setOscVolume(gain, value) {
  gain.gain.value = value;
}

//CUSTOM LOGIC FOR PNG Knob1
document.addEventListener("DOMContentLoaded", () => {
  const volume1Img = document.getElementById("volume1-knob"); //Getting the volume
  let isDragging = false;
  let knobCenter = { x: 0, y: 0 };
  const MIN_ANGLE = -40;
  const MAX_ANGLE = 220;
  let currentAngle = 220; //Initial angle for the volume set to the maximum

  function updateVolume1Rotation(angleDeg) {
    const clamped = Math.max(MIN_ANGLE, Math.min(MAX_ANGLE, angleDeg));
    volume1Img.style.transform = `rotate(${clamped}deg)`; //Rotat the image
    currentAngle = clamped;
    //Convert angle range into [0..1] for the gain
    const angleRange = MAX_ANGLE - MIN_ANGLE; 
    const normalized = (clamped - MIN_ANGLE) / angleRange;
    setOscVolume(osc1Gain, normalized); //Pass to setOscVolume()
    console.log("Osc1 volume =>", normalized.toFixed(2));
  }
  // When user presses mouse on the knob:
  volume1Img.addEventListener("mousedown", (e) => {
    isDragging = true;
    const rect = volume1Img.getBoundingClientRect(); //Calculate the center of the knob (for angle math)
    knobCenter.x = rect.left + rect.width / 2;
    knobCenter.y = rect.top + rect.height / 2;
    e.preventDefault();
  });

  //On mouse move, if dragging, rotate based on mouse angle:
  document.addEventListener("mousemove", (e) => {
    if (!isDragging) return;
    const dx = e.clientX - knobCenter.x;
    const dy = e.clientY - knobCenter.y;
    let angleRad = Math.atan2(dy, dx); //atan2 returns angle in radians relative to +X axis
    //Convert to degrees
    let angleDeg = (angleRad * 180) / Math.PI;
    //You can shift by 90 if you want 0 deg to be at top, etc.
    angleDeg += 90;
    //Now update the knob rotation + volume
    updateVolume1Rotation(angleDeg);
  });

  //Stop dragging when mouse goes up anywhere
  document.addEventListener("mouseup", () => {
    if (isDragging) {
      isDragging = false;
    }
  });

  updateVolume1Rotation(currentAngle);
});

document.addEventListener("DOMContentLoaded", () => {
  const volume2Img = document.getElementById("volume2-knob");

  let isDraggingVol2 = false;
  let knobCenterVol2 = { x: 0, y: 0 };
  const MIN_ANGLE_2 = -40;
  const MAX_ANGLE_2 = 220;
  let currentAngleVol2 = 220;

  function updateVolume2Rotation(angleDeg) {
    const clamped = Math.max(MIN_ANGLE_2, Math.min(MAX_ANGLE_2, angleDeg));
    volume2Img.style.transform = `rotate(${clamped}deg)`;
    currentAngleVol2 = clamped;
    const angleRange = MAX_ANGLE_2 - MIN_ANGLE_2;
    const normalized = (clamped - MIN_ANGLE_2) / angleRange;
    setOscVolume(osc2Gain, normalized);
    console.log("Osc2 volume =>", normalized.toFixed(2));
  }

  volume2Img.addEventListener("mousedown", (e) => {
    isDraggingVol2 = true;
    const rect = volume2Img.getBoundingClientRect();
    knobCenterVol2.x = rect.left + rect.width / 2;
    knobCenterVol2.y = rect.top + rect.height / 2;
    e.preventDefault();
  });

  document.addEventListener("mousemove", (e) => {
    if (!isDraggingVol2) return;
    const dx = e.clientX - knobCenterVol2.x;
    const dy = e.clientY - knobCenterVol2.y;
    let angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
    angleDeg += 90; // shift
    updateVolume2Rotation(angleDeg);
  });

  document.addEventListener("mouseup", () => {
    if (isDraggingVol2) {
      isDraggingVol2 = false;
    }
  });
  updateVolume2Rotation(currentAngleVol2);
});

document.addEventListener("DOMContentLoaded", () => {
  const volume3Img = document.getElementById("volume3-knob");
  let isDraggingVol3 = false;
  let knobCenterVol3 = { x: 0, y: 0 };
  const MIN_ANGLE_3 = -40;
  const MAX_ANGLE_3 = 220;
  let currentAngleVol3 = 220;
  function updateVolume3Rotation(angleDeg) {
    const clamped = Math.max(MIN_ANGLE_3, Math.min(MAX_ANGLE_3, angleDeg));
    volume3Img.style.transform = `rotate(${clamped}deg)`;
    currentAngleVol3 = clamped;
    const angleRange = MAX_ANGLE_3 - MIN_ANGLE_3; 
    const normalized = (clamped - MIN_ANGLE_3) / angleRange;
    setOscVolume(osc3Gain, normalized);
    console.log("Osc3 volume =>", normalized.toFixed(2));
  }
  volume3Img.addEventListener("mousedown", (e) => {
    isDraggingVol3 = true;
    const rect = volume3Img.getBoundingClientRect();
    knobCenterVol3.x = rect.left + rect.width / 2;
    knobCenterVol3.y = rect.top + rect.height / 2;
    e.preventDefault();
  });
  document.addEventListener("mousemove", (e) => {
    if (!isDraggingVol3) return;
    const dx = e.clientX - knobCenterVol3.x;
    const dy = e.clientY - knobCenterVol3.y;
    let angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
    angleDeg += 90; // shift
    updateVolume3Rotation(angleDeg);
  });
  document.addEventListener("mouseup", () => {
    if (isDraggingVol3) {
      isDraggingVol3 = false;
    }
  });
  updateVolume3Rotation(currentAngleVol3);
});

document.addEventListener("DOMContentLoaded", () => {

  // === ATTACK KNOB ===
  const attackImg = document.getElementById("attack-knob");
  let isDraggingA = false;
  let centerA = { x: 0, y: 0 };
  const MIN_ANGLE_A = -40;
  const MAX_ANGLE_A = 220;
  let currentAngleA = 90;

  function updateAttack(angleDeg) {
    const clamped = Math.max(MIN_ANGLE_A, Math.min(MAX_ANGLE_A, angleDeg));
    attackImg.style.transform = `rotate(${clamped}deg)`;
    currentAngleA = clamped;

    // Normalizza [0..1]
    const angleRange = MAX_ANGLE_A - MIN_ANGLE_A; // 260
    const normalized = (clamped - MIN_ANGLE_A) / angleRange;

    // Mappa su [0..5] secondi
    const minVal = 0;
    const maxVal = 5;
    const attackValue = minVal + normalized * (maxVal - minVal);

    envelope.attack = attackValue;
    console.log("Attack =>", attackValue.toFixed(2));
  }

  attackImg.addEventListener("mousedown", (e) => {
    isDraggingA = true;
    const rect = attackImg.getBoundingClientRect();
    centerA.x = rect.left + rect.width / 2;
    centerA.y = rect.top + rect.height / 2;
    e.preventDefault();
  });

  document.addEventListener("mousemove", (e) => {
    if (!isDraggingA) return;
    const dx = e.clientX - centerA.x;
    const dy = e.clientY - centerA.y;
    let angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
    angleDeg += 90;
    updateAttack(angleDeg);
  });

  document.addEventListener("mouseup", () => {
    if (isDraggingA) isDraggingA = false;
  });

  // Imposta un iniziale
  updateAttack(currentAngleA);

  // === DECAY KNOB ===
  const decayImg = document.getElementById("decay-knob");
  let isDraggingD = false;
  let centerD = { x: 0, y: 0 };
  let currentAngleD = 90;

  function updateDecay(angleDeg) {
    const clamped = Math.max(MIN_ANGLE_A, Math.min(MAX_ANGLE_A, angleDeg));
    decayImg.style.transform = `rotate(${clamped}deg)`;
    currentAngleD = clamped;

    const angleRange = MAX_ANGLE_A - MIN_ANGLE_A;
    const normalized = (clamped - MIN_ANGLE_A) / angleRange;

    // Mappa su [0..5]
    const decayValue = 0 + normalized * (5 - 0);
    envelope.decay = decayValue;
    console.log("Decay =>", decayValue.toFixed(2));
  }

  decayImg.addEventListener("mousedown", (e) => {
    isDraggingD = true;
    const rect = decayImg.getBoundingClientRect();
    centerD.x = rect.left + rect.width / 2;
    centerD.y = rect.top + rect.height / 2;
    e.preventDefault();
  });

  document.addEventListener("mousemove", (e) => {
    if (!isDraggingD) return;
    const dx = e.clientX - centerD.x;
    const dy = e.clientY - centerD.y;
    let angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
    angleDeg += 90;
    updateDecay(angleDeg);
  });

  document.addEventListener("mouseup", () => {
    if (isDraggingD) isDraggingD = false;
  });

  updateDecay(currentAngleD);

  // === SUSTAIN KNOB ===
  const sustainImg = document.getElementById("sustain-knob");
  let isDraggingS = false;
  let centerS = { x: 0, y: 0 };
  let currentAngleS = 90;

  function updateSustain(angleDeg) {
    const clamped = Math.max(MIN_ANGLE_A, Math.min(MAX_ANGLE_A, angleDeg));
    sustainImg.style.transform = `rotate(${clamped}deg)`;
    currentAngleS = clamped;

    const angleRange = MAX_ANGLE_A - MIN_ANGLE_A;
    const normalized = (clamped - MIN_ANGLE_A) / angleRange;

    // Mappa su [0..1]
    const sustainValue = 0 + normalized * (1 - 0);
    envelope.sustain = sustainValue;
    console.log("Sustain =>", sustainValue.toFixed(2));
  }

  sustainImg.addEventListener("mousedown", (e) => {
    isDraggingS = true;
    const rect = sustainImg.getBoundingClientRect();
    centerS.x = rect.left + rect.width / 2;
    centerS.y = rect.top + rect.height / 2;
    e.preventDefault();
  });

  document.addEventListener("mousemove", (e) => {
    if (!isDraggingS) return;
    const dx = e.clientX - centerS.x;
    const dy = e.clientY - centerS.y;
    let angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
    angleDeg += 90;
    updateSustain(angleDeg);
  });

  document.addEventListener("mouseup", () => {
    if (isDraggingS) isDraggingS = false;
  });

  updateSustain(currentAngleS);

  // === RELEASE KNOB ===
  const releaseImg = document.getElementById("release-knob");
  let isDraggingR = false;
  let centerR = { x: 0, y: 0 };
  let currentAngleR = 90;

  function updateRelease(angleDeg) {
    const clamped = Math.max(MIN_ANGLE_A, Math.min(MAX_ANGLE_A, angleDeg));
    releaseImg.style.transform = `rotate(${clamped}deg)`;
    currentAngleR = clamped;

    const angleRange = MAX_ANGLE_A - MIN_ANGLE_A;
    const normalized = (clamped - MIN_ANGLE_A) / angleRange;

    // Mappa su [0..5]
    const releaseValue = 0 + normalized * (5 - 0);
    envelope.release = releaseValue;
    console.log("Release =>", releaseValue.toFixed(2));
  }

  releaseImg.addEventListener("mousedown", (e) => {
    isDraggingR = true;
    const rect = releaseImg.getBoundingClientRect();
    centerR.x = rect.left + rect.width / 2;
    centerR.y = rect.top + rect.height / 2;
    e.preventDefault();
  });

  document.addEventListener("mousemove", (e) => {
    if (!isDraggingR) return;
    const dx = e.clientX - centerR.x;
    const dy = e.clientY - centerR.y;
    let angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
    angleDeg += 90;
    updateRelease(angleDeg);
  });

  document.addEventListener("mouseup", () => {
    if (isDraggingR) isDraggingR = false;
  });

  updateRelease(currentAngleR);

});


document.addEventListener("DOMContentLoaded", () => {

  // === FILTER FREQUENCY KNOB ===
  const filterFreqImg = document.getElementById("filter-frequency-knob");
  let isDraggingFreq = false;
  let centerFreq = { x: 0, y: 0 };
  const MIN_ANGLE_F = -40;
  const MAX_ANGLE_F = 220;
  let currentAngleF = 90; // offset iniziale

  function updateFilterFrequencyRotation(angleDeg) {
    // Clampa l'angolo
    const clamped = Math.max(MIN_ANGLE_F, Math.min(MAX_ANGLE_F, angleDeg));
    // Ruota l'immagine
    filterFreqImg.style.transform = `rotate(${clamped}deg)`;
    currentAngleF = clamped;

    // Normalizza l'angolo in [0..1]
    const angleRange = MAX_ANGLE_F - MIN_ANGLE_F; // es. 260
    const normalized = (clamped - MIN_ANGLE_F) / angleRange; // => 0..1

    // Mappa [0..1] su [50..10000] (o altro range desiderato)
    // Esempio lineare semplice:
    const MIN_FREQ = 50;   
    const MAX_FREQ = 10000;
    const freqValue = MIN_FREQ + normalized * (MAX_FREQ - MIN_FREQ);

    // Aggiorna il filtro
    filter.frequency.value = freqValue;

    console.log("Filter Frequency =>", freqValue.toFixed(2));
  }

  filterFreqImg.addEventListener("mousedown", (e) => {
    isDraggingFreq = true;
    const rect = filterFreqImg.getBoundingClientRect();
    centerFreq.x = rect.left + rect.width / 2;
    centerFreq.y = rect.top + rect.height / 2;
    e.preventDefault();
  });

  document.addEventListener("mousemove", (e) => {
    if (!isDraggingFreq) return;
    const dx = e.clientX - centerFreq.x;
    const dy = e.clientY - centerFreq.y;
    let angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
    angleDeg += 90; // shift di 90° per far coincidere "alto" con 0 gradi
    updateFilterFrequencyRotation(angleDeg);
  });

  document.addEventListener("mouseup", () => {
    if (isDraggingFreq) isDraggingFreq = false;
  });

  // Imposta un angolo iniziale
  updateFilterFrequencyRotation(currentAngleF);

  // === FILTER RESONANCE KNOB ===
  const filterResImg = document.getElementById("filter-resonance-knob");
  let isDraggingRes = false;
  let centerRes = { x: 0, y: 0 };
  const MIN_ANGLE_R = -40;
  const MAX_ANGLE_R = 220;
  let currentAngleR = 90;

  function updateFilterResonanceRotation(angleDeg) {
    // Clampa l'angolo
    const clamped = Math.max(MIN_ANGLE_R, Math.min(MAX_ANGLE_R, angleDeg));
    // Ruota l'immagine
    filterResImg.style.transform = `rotate(${clamped}deg)`;
    currentAngleR = clamped;

    // Normalizza [0..1]
    const angleRange = MAX_ANGLE_R - MIN_ANGLE_R;
    const normalized = (clamped - MIN_ANGLE_R) / angleRange; // => 0..1

    // Mappa su [0.1..50], ad esempio
    const MIN_RES = 0.1;
    const MAX_RES = 50;
    const resValue = MIN_RES + normalized * (MAX_RES - MIN_RES);

    filter.Q.value = resValue;
    console.log("Filter Resonance =>", resValue.toFixed(2));
  }

  filterResImg.addEventListener("mousedown", (e) => {
    isDraggingRes = true;
    const rect = filterResImg.getBoundingClientRect();
    centerRes.x = rect.left + rect.width / 2;
    centerRes.y = rect.top + rect.height / 2;
    e.preventDefault();
  });

  document.addEventListener("mousemove", (e) => {
    if (!isDraggingRes) return;
    const dx = e.clientX - centerRes.x;
    const dy = e.clientY - centerRes.y;
    let angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
    angleDeg += 90;
    updateFilterResonanceRotation(angleDeg);
  });

  document.addEventListener("mouseup", () => {
    if (isDraggingRes) isDraggingRes = false;
  });

  // Inizializza l'angolo
  updateFilterResonanceRotation(currentAngleR);
});
document.addEventListener("DOMContentLoaded", () => {
  // LFO Frequency
  const lfoFreqImg = document.getElementById("lfo-frequency-knob");
  let isDraggingLfoF = false;
  let centerLfoF = { x: 0, y: 0 };
  const MIN_ANGLE_LFOF = -40;
  const MAX_ANGLE_LFOF = 220;
  let currentAngleLfoF = 90; // offset iniziale

  function updateLfoFrequency(angleDeg) {
    // 1) clampa l'angolo
    const clamped = Math.max(MIN_ANGLE_LFOF, Math.min(MAX_ANGLE_LFOF, angleDeg));
    // 2) ruota l'immagine
    lfoFreqImg.style.transform = `rotate(${clamped}deg)`;
    currentAngleLfoF = clamped;

    // 3) normalizza [0..1]
    const angleRange = MAX_ANGLE_LFOF - MIN_ANGLE_LFOF; // 260
    const normalized = (clamped - MIN_ANGLE_LFOF) / angleRange; // => 0..1

    // 4) Mappa [0..1] su [0.1..10]
    const MIN_FREQ = 0.1;
    const MAX_FREQ = 10;
    const newFreq = MIN_FREQ + normalized * (MAX_FREQ - MIN_FREQ);

    // 5) Aggiorna lfo
    lfo.frequency.value = newFreq;
    console.log("LFO Frequency =>", newFreq.toFixed(2));
  }

  lfoFreqImg.addEventListener("mousedown", (e) => {
    isDraggingLfoF = true;
    const rect = lfoFreqImg.getBoundingClientRect();
    centerLfoF.x = rect.left + rect.width / 2;
    centerLfoF.y = rect.top + rect.height / 2;
    e.preventDefault();
  });

  document.addEventListener("mousemove", (e) => {
    if (!isDraggingLfoF) return;
    const dx = e.clientX - centerLfoF.x;
    const dy = e.clientY - centerLfoF.y;
    let angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
    angleDeg += 90; // shift
    updateLfoFrequency(angleDeg);
  });

  document.addEventListener("mouseup", () => {
    if (isDraggingLfoF) isDraggingLfoF = false;
  });

  // Imposta un angolo iniziale
  updateLfoFrequency(currentAngleLfoF);
});

document.addEventListener("DOMContentLoaded", () => {
  // DISTORTION AMOUNT
  const distImg = document.getElementById("distortion-knob");
  let isDraggingDist = false;
  let centerDist = { x: 0, y: 0 };
  const MIN_ANGLE_DIST = -40;
  const MAX_ANGLE_DIST = 220;
  let currentAngleDist = 90;

  function updateDistortion(angleDeg) {
    const clamped = Math.max(MIN_ANGLE_DIST, Math.min(MAX_ANGLE_DIST, angleDeg));
    distImg.style.transform = `rotate(${clamped}deg)`;
    currentAngleDist = clamped;

    const angleRange = MAX_ANGLE_DIST - MIN_ANGLE_DIST; // 260
    const normalized = (clamped - MIN_ANGLE_DIST) / angleRange; // => 0..1

    // Distortion in [0..1]
    const newDist = 0 + normalized * (1 - 0);
    distortion.distortion = newDist;
    console.log("Distortion =>", newDist.toFixed(2));
  }

  distImg.addEventListener("mousedown", (e) => {
    isDraggingDist = true;
    const rect = distImg.getBoundingClientRect();
    centerDist.x = rect.left + rect.width / 2;
    centerDist.y = rect.top + rect.height / 2;
    e.preventDefault();
  });

  document.addEventListener("mousemove", (e) => {
    if (!isDraggingDist) return;
    const dx = e.clientX - centerDist.x;
    const dy = e.clientY - centerDist.y;
    let angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
    angleDeg += 90;
    updateDistortion(angleDeg);
  });

  document.addEventListener("mouseup", () => {
    if (isDraggingDist) isDraggingDist = false;
  });

  // inizializza
  updateDistortion(currentAngleDist);
});

document.addEventListener("DOMContentLoaded", () => {
  // CHORUS DEPTH
  const chorusDepthImg = document.getElementById("chorus-depth-knob");
  let isDraggingDepth = false;
  let centerDepth = { x: 0, y: 0 };
  const MIN_ANGLE_DEPTH = -40;
  const MAX_ANGLE_DEPTH = 220;
  let currentAngleDepth = 90;

  function updateChorusDepth(angleDeg) {
    const clamped = Math.max(MIN_ANGLE_DEPTH, Math.min(MAX_ANGLE_DEPTH, angleDeg));
    chorusDepthImg.style.transform = `rotate(${clamped}deg)`;
    currentAngleDepth = clamped;

    const angleRange = MAX_ANGLE_DEPTH - MIN_ANGLE_DEPTH; // 260
    const normalized = (clamped - MIN_ANGLE_DEPTH) / angleRange; // => 0..1

    // chorus.depth in [0..1]
    chorus.depth = normalized;
    console.log("Chorus Depth =>", normalized.toFixed(2));
  }

  chorusDepthImg.addEventListener("mousedown", (e) => {
    isDraggingDepth = true;
    const rect = chorusDepthImg.getBoundingClientRect();
    centerDepth.x = rect.left + rect.width / 2;
    centerDepth.y = rect.top + rect.height / 2;
    e.preventDefault();
  });

  document.addEventListener("mousemove", (e) => {
    if (!isDraggingDepth) return;
    const dx = e.clientX - centerDepth.x;
    const dy = e.clientY - centerDepth.y;
    let angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
    angleDeg += 90;
    updateChorusDepth(angleDeg);
  });

  document.addEventListener("mouseup", () => {
    if (isDraggingDepth) isDraggingDepth = false;
  });

  updateChorusDepth(currentAngleDepth);

  // CHORUS SPREAD
  const chorusSpreadImg = document.getElementById("chorus-spread-knob");
  let isDraggingSpread = false;
  let centerSpread = { x: 0, y: 0 };
  let currentAngleSpread = 90;

  function updateChorusSpread(angleDeg) {
    const clamped = Math.max(MIN_ANGLE_DEPTH, Math.min(MAX_ANGLE_DEPTH, angleDeg));
    chorusSpreadImg.style.transform = `rotate(${clamped}deg)`;
    currentAngleSpread = clamped;

    const angleRange = MAX_ANGLE_DEPTH - MIN_ANGLE_DEPTH;
    const normalized = (clamped - MIN_ANGLE_DEPTH) / angleRange; // => 0..1

    // chorus.spread in [0..360]
    const newSpread = 0 + normalized * 360;
    chorus.spread = newSpread;
    console.log("Chorus Spread =>", newSpread.toFixed(2));
  }

  chorusSpreadImg.addEventListener("mousedown", (e) => {
    isDraggingSpread = true;
    const rect = chorusSpreadImg.getBoundingClientRect();
    centerSpread.x = rect.left + rect.width / 2;
    centerSpread.y = rect.top + rect.height / 2;
    e.preventDefault();
  });

  document.addEventListener("mousemove", (e) => {
    if (!isDraggingSpread) return;
    const dx = e.clientX - centerSpread.x;
    const dy = e.clientY - centerSpread.y;
    let angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
    angleDeg += 90;
    updateChorusSpread(angleDeg);
  });

  document.addEventListener("mouseup", () => {
    if (isDraggingSpread) isDraggingSpread = false;
  });

  updateChorusSpread(currentAngleSpread);
});


// Attach waveform selectors
document.getElementById("waveform1-select").addEventListener("change", (event) => setOscWaveType(osc1, event.target.value));
document.getElementById("waveform2-select").addEventListener("change", (event) => setOscWaveType(osc2, event.target.value));
document.getElementById("waveform3-select").addEventListener("change", (event) => setOscWaveType(osc3, event.target.value));



///////////////////////////// ADD EVENT LISTENER ///////////////////////////// 

//Initialization on Page Load
document.addEventListener("DOMContentLoaded", () => {
  stopButton.disabled = true;
  playMelodyButton.disabled = true;
  resetMelodyButton.disabled = true; // Initialize reset button as disabled
  stopPlaybackButton.disabled = true; // Initialize the Stop Playback button as disabled
  renderSequencer();
});

//Play Melody Button Event Listener
playMelodyButton.addEventListener("click", async () => {
  if (recordedNotes.length === 0) {
    alert("No melody recorded to play.");
    return;
  }
  if (melodyPart) {
    melodyPart.stop();
    melodyPart.dispose();
    melodyPart = null;
  }
  //Start the Tone.js context
  await Tone.start();
  //Create and start the melodyPart with current parameters
  createAndStartMelodyPart();
});

//Reset Melody Button Event Listener
resetMelodyButton.addEventListener("click", () => {
  if (recordedNotes.length === 0) {
    alert("No melody to reset.");
    return;
  }
  //Confirm the action
  const confirmReset = confirm("Are you sure you want to reset the melody?");
  if (!confirmReset) return;
  if (melodyPart) {
    melodyPart.stop();
    melodyPart.dispose();
    melodyPart = null;
  }
  //Stop pitch detection if active
  if (isDetecting) {
    stopPitchDetection();
  }
   //Reset variables
   recordedNotes = [];
   selectedNoteIndex = null; // Deselect any selected note
   renderSequencer();
  //Update button states
  playMelodyButton.disabled = true;
  resetMelodyButton.disabled = true;
  stopPlaybackButton.disabled = true;
  //Reset visual displays
  //pitchDisplay.textContent = "Pitch: N/A";
  //noteDisplay.textContent = "Note: N/A";
});

//Bpm input Button Event Listener
bpmInput.addEventListener("input", (event) => {
  const oldBpm = bpm; // Store the previous BPM
  bpm = parseInt(event.target.value, 10) || 120; // Default to 120 BPM if input is invalid
  // If BPM has changed, update recorded notes and melodyPart
  if (oldBpm !== bpm) {
    const timeScale = oldBpm / bpm; // Calculate scaling factor for time adjustments
    // Update recorded notes' timings
    recordedNotes = recordedNotes.map(note => ({
      ...note,
      startTime: note.startTime * timeScale,
      duration: note.duration * timeScale,
    }));
    // Update Tone.Transport BPM and recreate melodyPart
    Tone.Transport.bpm.value = bpm;
    if (melodyPart) {
      recreateMelodyPart();
    }
  }
  if (metronomeActive) {
    stopMetronome(); // Stop current metronome
    startMetronome(); // Restart metronome with new BPM
  }
  //Disable BPM input during recording to maintain consistent recording duration
  bpmInput.disabled = isDetecting;
  //Re-render sequencer to reflect changes
  renderSequencer();
});



startButton.addEventListener("click", startPitchDetection);//Add event listeners to pitch control buttons
stopButton.addEventListener("click", stopPitchDetection);

//Handles the mouseup event to stop dragging or resizing.
window.addEventListener("mouseup", () => {
  if (isDragging) {
    isDragging = false;
    isResizingStart = false;
    isResizingEnd = false;
    //selectedNoteIndex = null;
    createAndStartMelodyPart()
    renderSequencer(); // Finalize the sequencer visualization
  }
});

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
    const newStartTime = Math.max(0, (x - labelWidth) / (PIXELS_PER_BAR / BEATS_PER_BAR) * (60 / bpm));
    const newDuration = draggedNote.startTime + draggedNote.duration - newStartTime;

    if (newDuration > 0.1) { // Ensure a minimum duration
      draggedNote.startTime = newStartTime;
      draggedNote.duration = newDuration;
    }
  } else if (isResizingEnd) {
    // Handle resizing the end of the note
    const newEndTime = Math.max(draggedNote.startTime + 0.1, (x - labelWidth) / (PIXELS_PER_BAR / BEATS_PER_BAR) * (60 / bpm));
    draggedNote.duration = newEndTime - draggedNote.startTime;
  } else {
    // Handle moving the note horizontally (time) and vertically (pitch)
    const unsnappedStartTime = (x - labelWidth - dragOffsetX) / (PIXELS_PER_BAR / BEATS_PER_BAR) * (60 / bpm);
    const snappedStartTime = snapToGrid(Math.max(0, unsnappedStartTime));

    const midiNumber = 108 - Math.floor((y - dragOffsetY) / rowHeight); // Calculate new MIDI number based on Y position
    const clampedMidiNumber = Math.min(108, Math.max(36, midiNumber)); // Clamp within C2 to C8

    const newNoteName = noteNames[clampedMidiNumber % 12] + Math.floor(clampedMidiNumber / 12 - 1);

    // Prevent overlapping with other notes
    if (!isOverlapping(snappedStartTime, clampedMidiNumber, selectedNoteIndex)) {
      draggedNote.startTime = snappedStartTime; // Update start time
      draggedNote.note = newNoteName; // Update note name
      draggedNote.frequency = A4 * Math.pow(2, (clampedMidiNumber - 69) / 12); // Update frequency
    }
  }
  renderSequencer(); // Update the sequencer visualization
}
);

//Handles the mousedown event on the sequencer canvas.
//Determines if a note is being selected for dragging or resizing
sequencerCanvas.addEventListener("mousedown", (event) => {
  const rect = sequencerCanvas.getBoundingClientRect();
  const lastNote=null;
  //Adjust coordinates based on canvas scaling
  const scaleX = sequencerCanvas.width / rect.width;
  const scaleY = sequencerCanvas.height / rect.height;
  const x = (event.clientX - rect.left) * scaleX;
  const y = (event.clientY - rect.top) * scaleY;
  //Iterate through all recorded notes to check for interaction
  for (let i = 0; i < recordedNotes.length; i++) {
    lastSelectedNoteIndex = i;
    const note = recordedNotes[i];
    const midiNumber = midiFromNoteName(note.note);
    const noteIndex = midiNumber - 36; // MIDI 36 = C2
    const yCenter = sequencerCanvas.height - (noteIndex * rowHeight + rowHeight / 2);
    const beatsPerNote = note.duration / (60 / bpm); // Duration in beats
    const xStart = labelWidth + (note.startTime / (60 / bpm)) * (PIXELS_PER_BAR / BEATS_PER_BAR);
    const xEnd = xStart + beatsPerNote * (PIXELS_PER_BAR / BEATS_PER_BAR);
    const resizeThreshold = 5; //Pixels near the edge to trigger resizing
    //Check if the click is within the vertical bounds of the note
    if ( y >= yCenter - rowHeight / 2 && y <= yCenter + rowHeight / 2) {
      if (x >= xStart - resizeThreshold && x <= xStart + resizeThreshold) {
        // Clicked near the start of the note for resizing
        console.log("near the start clicked");
        selectedNoteIndex = i;
        isResizingStart = true;
        dragOffsetX = x - xStart; // Calculate horizontal offset
        isDragging = true; // Enter dragging mode
        createMelody()
        return;
      } else if (x >= xEnd - resizeThreshold && x <= xEnd + resizeThreshold) {
        // Clicked near the end of the note for resizing
        console.log("near the end clicked");
        selectedNoteIndex = i;
        isResizingEnd = true;
        dragOffsetX = x - xEnd; // Calculate horizontal offset
        isDragging = true; // Enter dragging mode
        createMelody()
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
        createMelody()
        return;
      }
    }
  }
  //If no note is selected, deselect any previously selected note
  selectedNoteIndex = null;
  renderSequencer();
});

//Handles the touchstart event on the sequencer canvas.
// //Similar to mousedown but for touch interactions.
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

    // Calculate X position based on beats
    const beatsPerNote = note.duration / (60 / bpm); // Duration in beats
    const xStart = labelWidth + (note.startTime / (60 / bpm)) * (PIXELS_PER_BAR / BEATS_PER_BAR);
    const xEnd = xStart + beatsPerNote * (PIXELS_PER_BAR / BEATS_PER_BAR);

    // Check if the touch is within the bounds of the note
    if (x >= xStart && x <= xEnd && y >= yCenter - rowHeight / 2 && y <= yCenter + rowHeight / 2) {
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

//Handles the touchmove event on the sequencer canvas.
//Allows for dragging and resizing of notes based on touch movement.
sequencerCanvas.addEventListener("touchmove", (event) => {
  if (!isDragging || selectedNoteIndex === null) return; //Exit if not dragging

  const touch = event.touches[0];
  const rect = sequencerCanvas.getBoundingClientRect();
  const x = touch.clientX - rect.left;
  const y = touch.clientY - rect.top;

  const draggedNote = recordedNotes[selectedNoteIndex];
  const newStartTime = snapToGrid((x - labelWidth - dragOffsetX) / (PIXELS_PER_BAR / BEATS_PER_BAR) * (60 / bpm));
  const newMidiNumber = 108 - Math.floor((y - dragOffsetY) / rowHeight);
  const clampedMidiNumber = Math.min(108, Math.max(36, newMidiNumber));
  const newNoteName = noteNames[clampedMidiNumber % 12] + Math.floor(clampedMidiNumber / 12 - 1);

  // Prevent overlapping with other notes
  if (!isOverlapping(newStartTime, clampedMidiNumber, selectedNoteIndex)) {
    draggedNote.startTime = Math.max(0, newStartTime); //Update start time
    draggedNote.note = newNoteName;                   //Update note name
    draggedNote.frequency = A4 * Math.pow(2, (clampedMidiNumber - 69) / 12); //Update frequency
    renderSequencer(); //Update the sequencer visualization
  }
});

//Handles the touchend event to stop dragging or resizing.
sequencerCanvas.addEventListener("touchend", () => {
  if (isDragging) {
    isDragging = false;
    selectedNoteIndex = null;
    renderSequencer(); //Finalize the sequencer visualization
  }
});

//Handles deletion of the selected note via the Delete key on the keyboard.
document.addEventListener("keydown", (event) => {
  if (event.key === "Delete" && selectedNoteIndex !== null) {
    const confirmDelete = confirm("Are you sure you want to delete the selected note?");
    if (confirmDelete) {
      recordedNotes.splice(selectedNoteIndex, 1);
      selectedNoteIndex = null;
      createMelody()
      renderSequencer(); // Update the sequencer visualization
    }
  }
});

//Updates the BPM based on user input.
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

stopPlaybackButton.addEventListener("click", () => {
  if (melodyPart) {
    melodyPart.stop();
    melodyPart.dispose();
    melodyPart = null;
  }

  //Stop the Tone.Transport if no other parts are active
  if (Tone.Transport.state === 'started') {
    Tone.Transport.stop();
  }
  playMelodyButton.disabled = false;
  stopPlaybackButton.disabled = true;
});

// Metronome toggle
metronomeToggle.addEventListener("change", () => {
  if (!isDetecting) { 
    console.log("Metronome toggle clicked, but not recording. No action taken.");
    return;
  }

  // Solo durante la registrazione
  if (metronomeToggle.checked) {
    console.log("Start metronome during recording.");
    startMetronome();
  } else {
    console.log("Stop metronome during recording.");
    stopMetronome();
  }
});

document.addEventListener("DOMContentLoaded", async () => {
  await fetchMelodies();
});

///////////////////////////// DOCUMENT GET ELEMENT BY ID ///////////////////////////// 

//Event listeners for the octave shift buttons
document.getElementById("shift-octave-up").addEventListener("click", () => shiftOctave(1));

document.getElementById("shift-octave-down").addEventListener("click", () => shiftOctave(-1));

//Filter frequency slider
document.getElementById("filter-frequency-knob").addEventListener("input", (event) => {
  setFilterFrequency(parseFloat(event.target.value));
});

//Envelope sliders
document.querySelectorAll(".adsr-knob").forEach(slider => {
  slider.addEventListener("input", (event) => {
    const param = event.target.dataset.param;
    const value = event.target.value;
    updateEnvelope(param, value);
  });
});


document.getElementById("melody-dropdown").addEventListener("change", () => {
  const loadButton = document.getElementById("load-melody-button");
  loadButton.disabled = false; // Enable the button when a melody is selected
});
document.getElementById("load-melody-button").addEventListener("click", () => {
  const melodyDropdown = document.getElementById("melody-dropdown");
  const selectedOption = melodyDropdown.options[melodyDropdown.selectedIndex];

  if (!selectedOption || !selectedOption.dataset.melody) {
    alert("Please select a valid melody.");
    return;
  }

  const melody = JSON.parse(selectedOption.dataset.melody); // Parse melody data
  loadMelodyToSequencer(melody); // Load the melody into the sequencer
  playMelodyButton.disabled=false;
});

//Handles deletion of the selected note via the Delete button.
//Prompts the user for confirmation before deletion.
document.getElementById("delete-note").addEventListener("click", () => {
  if (selectedNoteIndex !== null) {
    // Confirm deletion with the user
    const confirmDelete = confirm("Are you sure you want to delete the selected note?");
    if (confirmDelete) {
      // Remove the note from the recordedNotes array
      console.log("Deleting a note...");
      recordedNotes.splice(selectedNoteIndex, 1);
      selectedNoteIndex = null;
      lastSelectedNoteIndex = null;
      createAndStartMelodyPart();
      renderSequencer(); // Update the sequencer visualization
    }
  }
});

///////////////////////////// DATABASE FUNCTIONS ///////////////////////////// 

async function saveMelodyToDatabase(melodyName) {
  if (recordedNotes.length === 0) {
    alert("No melody to save.");
    return;
  }
  const melodyData = recordedNotes.map(note => ({
    note: note.note,
    frequency: note.frequency,
    startTime: note.startTime,
    duration: note.duration,
  }));

  try {
    const docRef = await addDoc(collection(db, "melodies"), {
      name: melodyName,
      bpm: bpm,
      notes: melodyData,
      createdAt: new Date().toISOString(),
    });
    alert(`Melody "${melodyName}" saved successfully! ID: ${docRef.id}`);
  } catch (error) {
    console.error("Error saving melody:", error);
    alert("Error saving melody. Please try again.");
  }
}

document.getElementById("save-melody").addEventListener("click", () => {
  if (recordedNotes.length === 0) {
    alert("No melody recorded to save.");
    return;
  }
  const melodyName = prompt("Enter a name for your melody:");
  if (melodyName) {
    saveMelodyToDatabase(melodyName);
  }
});

function toggleSaveButtonState() {
  const saveButton = document.getElementById("save-melody");
  saveButton.disabled = recordedNotes.length === 0;
}

async function fetchMelodies() {
  try {
    const querySnapshot = await getDocs(collection(db, "melodies"));
    const melodies = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));
    console.log("Melodies:", melodies);
    renderMelodies(melodies);
  } catch (error) {
    console.error("Error fetching melodies:", error);
  }
}
function renderMelodies(melodies) {
  const melodyDropdown = document.getElementById("melody-dropdown");
  melodyDropdown.innerHTML = '<option value="" disabled selected>Choose a melody</option>'; // Reset options
  melodies.forEach(melody => {
    const option = document.createElement("option");
    option.value = melody.id; // Store the melody ID
    option.textContent = `${melody.name} (BPM: ${melody.bpm})`;
    option.dataset.melody = JSON.stringify(melody); // Save the melody data in a data attribute
    melodyDropdown.appendChild(option);
  });

  // Enable the load button if melodies are available
  const loadButton = document.getElementById("load-melody-button");
  loadButton.disabled = melodies.length === 0;
}
function loadMelodyToSequencer(melody) {
  if (!melody.notes || melody.notes.length === 0) {
    alert("This melody has no notes to load.");
    return;
  }
  recordedNotes = melody.notes.map(note => ({
    note: note.note,
    frequency: note.frequency,
    startTime: note.startTime,
    duration: note.duration,
  }));
  bpm = melody.bpm; // Set the sequencer's BPM to the melody's BPM
  document.getElementById("bpm-input").value = bpm; // Update the BPM input field if it exists
  alert(`Melody "${melody.name}" loaded successfully!`);
  renderSequencer(); // Re-render the sequencer with the loaded notes
  toggleSaveButtonState(); // Update the Save button state
}

///////////////////////////// PRESET-SAVING FUNCTIONS /////////////////////////////
// Fetch presets from Firestore and render in the dropdown
async function fetchPresets() {
  try {
    const querySnapshot = await getDocs(collection(db, "presets"));
    const presets = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));
    renderPresets(presets);
  } catch (error) {
    console.error("Error fetching presets:", error);
  }
}

// Render presets in the dropdown menu
function renderPresets(presets) {
  const presetDropdown = document.getElementById("preset-dropdown");
  presetDropdown.innerHTML = '<option value="" disabled selected>Select a preset</option>';
  presets.forEach(preset => {
    const option = document.createElement("option");
    option.value = preset.id; // Use Firestore document ID
    option.textContent = preset.name; // Display preset name
    presetDropdown.appendChild(option);
  });
}

// Save the current settings as a preset
async function savePreset() {
  const presetName = prompt("Enter a name for the preset:");
  if (!presetName) return;

  const presetData = {
    name: presetName,
    waveform1: document.getElementById("waveform1-select").value,
    volume1: $("#volume1-knob").roundSlider("option", "value"),
    waveform2: document.getElementById("waveform2-select").value,
    volume2: $("#volume2-knob").roundSlider("option", "value"),
    waveform3: document.getElementById("waveform3-select").value,
    volume3: $("#volume3-knob").roundSlider("option", "value"),
    attack: $("#attack-knob").roundSlider("option", "value"),
    decay: $("#decay-knob").roundSlider("option", "value"),
    sustain: $("#sustain-knob").roundSlider("option", "value"),
    release: $("#release-knob").roundSlider("option", "value"),
    lfoWaveform: document.getElementById("lfo-waveform").value,
    lfoFrequency: $("#lfo-frequency-knob").roundSlider("option", "value"),
    filterFrequency: $("#filter-frequency-knob").roundSlider("option", "value"),
    filterResonance: $("#filter-resonance-knob").roundSlider("option", "value"),
    distortion: $("#distortion-knob").roundSlider("option", "value"),
    chorusDepth: $("#chorus-depth-knob").roundSlider("option", "value"),
    chorusSpread: $("#chorus-spread-knob").roundSlider("option", "value"),
  };

  try {
    await addDoc(collection(db, "presets"), presetData);
    alert("Preset saved successfully!");
    fetchPresets(); // Refresh presets in the dropdown
  } catch (error) {
    console.error("Error saving preset:", error);
    alert("Error saving preset. Please try again.");
  }
}

// Apply a value to a round-slider knob
function setKnobValue(knobId, value) {
  $(`#${knobId}`).roundSlider("option", "value", value);
}

// Load the selected preset and apply settings
async function loadPreset() {
  const presetDropdown = document.getElementById("preset-dropdown");
  const selectedId = presetDropdown.value;

  if (!selectedId) {
    alert("Please select a preset to load.");
    return;
  }

  try {
    const docRef = doc(db, "presets", selectedId);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      const preset = docSnap.data();

      // Apply preset settings
      document.getElementById("waveform1-select").value = preset.waveform1;
      setKnobValue("volume1-knob", preset.volume1);

      document.getElementById("waveform2-select").value = preset.waveform2;
      setKnobValue("volume2-knob", preset.volume2);

      document.getElementById("waveform3-select").value = preset.waveform3;
      setKnobValue("volume3-knob", preset.volume3);

      setKnobValue("attack-knob", preset.attack);
      setKnobValue("decay-knob", preset.decay);
      setKnobValue("sustain-knob", preset.sustain);
      setKnobValue("release-knob", preset.release);
      document.getElementById("lfo-waveform").value = preset.lfoWaveform;
      setKnobValue("lfo-frequency-knob", preset.lfoFrequency);
      setKnobValue("filter-frequency-knob", preset.filterFrequency);
      setKnobValue("filter-resonance-knob", preset.filterResonance);
      setKnobValue("distortion-knob", preset.distortion);
      setKnobValue("chorus-frequency-knob", preset.chorusFrequency);
      setKnobValue("chorus-depth-knob", preset.chorusDepth);
      setKnobValue("chorus-spread-knob", preset.chorusSpread);

      alert(`Preset "${preset.name}" loaded successfully!`);
    } else {
      alert("Preset not found.");
    }
  } catch (error) {
    console.error("Error loading preset:", error);
    alert("An error occurred while loading the preset. Check the console for details.");
  }
}

// Attach event listeners
document.getElementById("save-preset").addEventListener("click", savePreset);
document.getElementById("load-preset").addEventListener("click", loadPreset);

// Fetch presets on page load
fetchPresets();