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

// Oscillators and gains
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

// Initialize round-sliders
$('#volume1-knob').roundSlider({
  radius: 40,
  width: 8,
  handleSize: "+5",
  sliderType: 'min-range',
  handleShape: 'round',
  value: 50,
  min: 0,
  max: 1,
  step: 0.01,
  startAngle: -40,
  endAngle: 220,
  change: function (args) {
    setOscVolume(osc1Gain, args.value);
    console.log("WaveFrom 1 loudness level: " + args.value);
  }
});

$('#volume2-knob').roundSlider({
  radius: 40,
  width: 8,
  handleSize: "+5",
  sliderType: 'min-range',
  handleShape: 'round',
  value: 50,
  min: 0,
  max: 1,
  step: 0.01,
  startAngle: -40,
  endAngle: 220,
  change: function (args) {
    setOscVolume(osc2Gain, args.value);
    console.log("WaveFrom 2 loudness level: " + args.value);
  }
});

$('#volume3-knob').roundSlider({
  radius: 40,
  width: 8,
  handleSize: "+5",
  sliderType: 'min-range',
  handleShape: 'round',
  value: 50,
  min: 0,
  max: 1,
  step: 0.01,
  startAngle: -40,
  endAngle: 220,
  change: function (args) {
    setOscVolume(osc3Gain, args.value);
    console.log("WaveFrom 3 loudness level: " + args.value);
  }
});

// ADSR envelope controls
$('#attack-knob').roundSlider({
  radius: 40,
  width: 8,
  handleSize: "+5",
  sliderType: 'min-range',
  handleShape: 'round',
  value: 0.1,
  min: 0.1,
  max: 5,
  step: 0.01,
  startAngle: -40,
  endAngle: 220,
  change: function (args) {
    envelope.attack = args.value;
    console.log("attack: " + args.value);
  }
});

$('#decay-knob').roundSlider({
  radius: 40,
  width: 8,
  handleSize: "+5",
  sliderType: 'min-range',
  handleShape: 'round',
  value: 0.2,
  min: 0,
  max: 5,
  step: 0.01,
  startAngle: -40,
  endAngle: 220,
  change: function (args) {
    envelope.decay = args.value;
    console.log("decay: " + args.value);
  }
});

$('#sustain-knob').roundSlider({
  radius: 40,
  width: 8,
  handleSize: "+5",
  sliderType: 'min-range',
  handleShape: 'round',
  value: 0.5,
  min: 0,
  max: 1,
  step: 0.01,
  startAngle: -40,
  endAngle: 220,
  change: function (args) {
    envelope.sustain = args.value;
    console.log("sustain: " + args.value);
  }
});

$('#release-knob').roundSlider({
  radius: 40,
  width: 8,
  handleSize: "+5",
  sliderType: 'min-range',
  handleShape: 'round',
  value: 1.5,
  min: 0,
  max: 5,
  step: 0.01,
  startAngle: -40,
  endAngle: 220,
  change: function (args) {
    envelope.release = args.value;
    console.log("release: " + args.value);
  }
});

// Filter controls
$('#filter-frequency-knob').roundSlider({
  radius: 40,
  width: 8,
  handleSize: "+5",
  sliderType: 'min-range',
  handleShape: 'round',
  value: 500,
  min: 50,
  max: 10000,
  step: 1,
  startAngle: -40,
  endAngle: 220,
  change: function (args) {
    filter.frequency.value = args.value;
    console.log("filter frequency: " + args.value);
  }
});

$('#filter-resonance-knob').roundSlider({
  radius: 40,
  width: 8,
  handleSize: "+5",
  sliderType: 'min-range',
  handleShape: 'round',
  value: 1,
  min: 0.1,
  max: 50,
  step: 0.1,
  startAngle: -40,
  endAngle: 220,
  change: function (args) {
    filter.Q.value = args.value;
    console.log("filter resonance: " + args.value);
  }
});

// LFO frequency
$('#lfo-frequency-knob').roundSlider({
  radius: 40,
  width: 8,
  handleSize: "+5",
  sliderType: 'min-range',
  handleShape: 'round',
  value: 0.5,
  min: 0.1,
  max: 10,
  step: 0.1,
  startAngle: -40,
  endAngle: 220,
  change: function (args) {
    lfo.frequency.value = args.value;
  }
});

// Distortion
$('#distortion-knob').roundSlider({
  radius: 40,
  width: 8,
  handleSize: "+5",
  sliderType: 'min-range',
  handleShape: 'round',
  value: 0.4,
  min: 0,
  max: 1,
  step: 0.01,
  startAngle: -40,
  endAngle: 220,
  change: function (args) {
    distortion.distortion = args.value;
  }
});

// Chorus controls
$('#chorus-frequency-knob').roundSlider({
  radius: 40,
  width: 8,
  handleSize: "+5",
  sliderType: 'min-range',
  handleShape: 'round',
  value: 1.5,
  min: 0.1,
  max: 10,
  step: 0.1,
  startAngle: -40,
  endAngle: 220,
  change: function (args) {
    chorus.frequency.value = args.value;
  }
});

$('#chorus-depth-knob').roundSlider({
  radius: 40,
  sliderType: 'min-range',
  handleShape: 'round',
  value: 0,
  min: 0,
  max: 1,
  step: 0.1,
  startAngle: -40,
  endAngle: 220,
  width: 8,
  handleSize: "+5",
  change: function (args) {
    chorus.depth = args.value;
  }
});

$('#chorus-spread-knob').roundSlider({
  radius: 40,
  width: 8,
  handleSize: "+5",
  sliderType: 'min-range',
  handleShape: 'round',
  value: 180,
  min: 0,
  max: 360,
  step: 10,
  startAngle: -40,
  endAngle: 220,
  change: function (args) {
    chorus.spread = args.value;
  }
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

//Metronome Button Event Listener
metronomeToggle.addEventListener("click", () => {
  if (metronomeActive) {
    stopMetronome();
  } else {
    startMetronome();
  }
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

//Metronome toggle during the rec
metronomeToggle.addEventListener("change", () => {
  if (!isDetecting) {
    if (metronomeToggle.checked) {
      startMetronome();
    } else {
      stopMetronome();
    }
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