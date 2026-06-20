import './style.css';
import { SleepSoundSynthesizer, PRESETS } from './audio';
import type { AudioPreset } from './audio';

// State variables
let synth: SleepSoundSynthesizer | null = null;
let isAudioActive = false;
let sleepTimerIntervalId: number | null = null;
let sleepTimerSecondsLeft = 0;

// Screen Wake Lock references
let wakeLock: any = null;
let isSleepModeActive = false;

// Custom user presets stored in localStorage
interface CustomPreset {
  id: string;
  name: string;
  rain: number;
  ocean: number;
  wind: number;
  campfire: number;
  crickets: number;
  drone: number;
}

// Mouse movement threshold tracking for sleep wake-up
let sleepStartX: number | null = null;
let sleepStartY: number | null = null;
const MOVEMENT_THRESHOLD = 30; // pixels of movement to wake up

// Canvas elements
let canvas: HTMLCanvasElement | null = null;
let canvasCtx: CanvasRenderingContext2D | null = null;

// Sliders and morph automation ID
let morphAnimationFrameId: number | null = null;

// DOM Element references
let btnPlayPause: HTMLButtonElement;
let btnEnterSleep: HTMLButtonElement;
let sliderMasterVolume: HTMLInputElement;
let masterVolVal: HTMLSpanElement;
let selectTimer: HTMLSelectElement;
let timerCountdownArea: HTMLDivElement;
let timerTimeLeft: HTMLSpanElement;
let btnCancelTimer: HTMLButtonElement;
let presetsContainer: HTMLDivElement;
let formCustomPreset: HTMLFormElement;
let inputPresetName: HTMLInputElement;
let presetActiveName: HTMLSpanElement;
let sleepOverlay: HTMLDivElement;
let sleepHud: HTMLDivElement;
let oledThemeCheckbox: HTMLInputElement;
let wakeLockStatus: HTMLSpanElement;

// Sound channels list
const channels = ['rain', 'ocean', 'wind', 'campfire', 'crickets', 'drone'];

window.addEventListener('DOMContentLoaded', () => {
  initializeDOMElements();
  setupEventListeners();
  renderPresetsList();
  setupVisualizer();
});

function initializeDOMElements() {
  btnPlayPause = document.getElementById('btn-play-pause') as HTMLButtonElement;
  btnEnterSleep = document.getElementById('btn-enter-sleep') as HTMLButtonElement;
  sliderMasterVolume = document.getElementById('slider-master-volume') as HTMLInputElement;
  masterVolVal = document.getElementById('master-vol-val') as HTMLSpanElement;
  selectTimer = document.getElementById('select-timer') as HTMLSelectElement;
  timerCountdownArea = document.getElementById('timer-countdown-area') as HTMLDivElement;
  timerTimeLeft = document.getElementById('timer-time-left') as HTMLSpanElement;
  btnCancelTimer = document.getElementById('btn-cancel-timer') as HTMLButtonElement;
  presetsContainer = document.getElementById('presets-container') as HTMLDivElement;
  formCustomPreset = document.getElementById('form-custom-preset') as HTMLFormElement;
  inputPresetName = document.getElementById('input-preset-name') as HTMLInputElement;
  presetActiveName = document.getElementById('preset-active-name') as HTMLSpanElement;
  sleepOverlay = document.getElementById('sleep-overlay') as HTMLDivElement;
  sleepHud = document.getElementById('sleep-hud') as HTMLDivElement;
  oledThemeCheckbox = document.getElementById('oled-theme-checkbox') as HTMLInputElement;
  wakeLockStatus = document.getElementById('wake-lock-status') as HTMLSpanElement;
  canvas = document.getElementById('audio-visualizer') as HTMLCanvasElement;
}

function setupEventListeners() {
  // Play/Pause button
  btnPlayPause.addEventListener('click', toggleAudio);

  // Master Volume
  sliderMasterVolume.addEventListener('input', (e) => {
    const val = parseInt((e.target as HTMLInputElement).value);
    masterVolVal.textContent = `${val}%`;
    if (synth) {
      synth.setMasterVolume(val / 100);
    }
  });

  // Channel Volume Sliders
  channels.forEach(ch => {
    const slider = document.getElementById(`slider-${ch}`) as HTMLInputElement;
    const label = document.getElementById(`val-${ch}`) as HTMLSpanElement;
    if (slider) {
      slider.addEventListener('input', (e) => {
        const val = parseInt((e.target as HTMLInputElement).value);
        if (label) label.textContent = `${val}%`;
        
        // Update synth
        if (synth) {
          synth.setChannelVolume(ch, val / 100);
        }
        
        // Change current active preset title to "Custom Mix"
        presetActiveName.textContent = "Custom Mix";
        deselectAllPresetButtons();
      });
    }
  });

  // Custom Preset Submission
  formCustomPreset.addEventListener('submit', (e) => {
    e.preventDefault();
    saveCustomPreset();
  });

  // Sleep Timer Selection
  selectTimer.addEventListener('change', () => {
    const minutes = parseInt(selectTimer.value);
    if (minutes > 0) {
      startSleepTimer(minutes);
    } else {
      cancelSleepTimer();
    }
  });

  // Cancel Sleep Timer button
  btnCancelTimer.addEventListener('click', cancelSleepTimer);

  // Enter Sleep Mode
  btnEnterSleep.addEventListener('click', enterSleepMode);

  // OLED Theme Toggle
  oledThemeCheckbox.addEventListener('change', () => {
    if (oledThemeCheckbox.checked) {
      document.body.classList.add('theme-oled');
    } else {
      document.body.classList.remove('theme-oled');
    }
    resizeCanvas();
  });

  // Window Resize
  window.addEventListener('resize', resizeCanvas);

  // Wake lock visibility listener (if browser tab switches, lock is released; reclaim when visible again)
  document.addEventListener('visibilitychange', handleVisibilityChange);
}

/**
 * AUDIO CONTROLS
 */
async function toggleAudio() {
  if (!synth) {
    synth = new SleepSoundSynthesizer();
    await synth.init();
    
    // Set initial volumes matching the sliders
    const masterVol = parseInt(sliderMasterVolume.value) / 100;
    synth.setMasterVolume(masterVol);
    
    channels.forEach(ch => {
      const slider = document.getElementById(`slider-${ch}`) as HTMLInputElement;
      if (slider) {
        const val = parseInt(slider.value) / 100;
        synth!.setChannelVolume(ch, val);
      }
    });

    // Start drawing visualizer
    drawVisualizer();
  }

  if (isAudioActive) {
    await synth!.suspend();
    isAudioActive = false;
    btnPlayPause.innerHTML = `
      <svg class="play-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <polygon points="6 3 20 12 6 21 6 3"/>
      </svg>
      <span>Resume Audio</span>
    `;
    btnEnterSleep.disabled = true;
    btnEnterSleep.title = "Start audio playback first to enable sleep mode";
  } else {
    await synth!.resume();
    isAudioActive = true;
    btnPlayPause.innerHTML = `
      <svg class="pause-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <rect x="14" y="4" width="4" height="16" rx="1"/>
        <rect x="6" y="4" width="4" height="16" rx="1"/>
      </svg>
      <span>Pause Audio</span>
    `;
    btnEnterSleep.disabled = false;
    btnEnterSleep.removeAttribute('title');
    
    // Request wake lock when audio starts to keep tab active if needed
    requestWakeLock();
  }
}

/**
 * PRESETS MANAGEMENT
 */
function renderPresetsList() {
  presetsContainer.innerHTML = '';

  // Render static defaults
  Object.keys(PRESETS).forEach(key => {
    const p = PRESETS[key];
    const card = document.createElement('button');
    card.className = 'btn-preset';
    card.dataset.presetId = key;
    card.innerHTML = `
      <span class="preset-title">${p.name}</span>
      <span class="preset-desc">${p.description}</span>
    `;
    card.addEventListener('click', () => loadPreset(key, p));
    presetsContainer.appendChild(card);
  });

  // Render custom presets from localStorage
  const customs = getCustomPresets();
  customs.forEach(p => {
    const card = document.createElement('div');
    card.className = 'btn-preset custom-preset-btn-card';
    card.dataset.presetId = p.id;
    
    const infoArea = document.createElement('div');
    infoArea.className = 'preset-info-area';
    infoArea.innerHTML = `
      <span class="preset-title">${p.name}</span>
      <span class="preset-desc">Custom saved sound mixture.</span>
    `;
    
    // Clicking main body loads preset
    infoArea.addEventListener('click', () => loadPreset(p.id, p));

    // Delete button
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'btn-delete-preset';
    deleteBtn.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M3 6h18M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
      </svg>
    `;
    deleteBtn.title = "Delete this preset";
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteCustomPreset(p.id);
    });

    card.appendChild(infoArea);
    card.appendChild(deleteBtn);
    presetsContainer.appendChild(card);
  });
}

function loadPreset(id: string, preset: AudioPreset | CustomPreset) {
  if (!isAudioActive) {
    toggleAudio().then(() => applyPresetValues(id, preset));
  } else {
    applyPresetValues(id, preset);
  }
}

function applyPresetValues(id: string, preset: AudioPreset | CustomPreset) {
  presetActiveName.textContent = preset.name;
  deselectAllPresetButtons();
  
  const activeBtn = presetsContainer.querySelector(`[data-preset-id="${id}"]`);
  if (activeBtn) activeBtn.classList.add('active');

  const targets = {
    rain: preset.rain,
    ocean: preset.ocean,
    wind: preset.wind,
    campfire: preset.campfire,
    crickets: preset.crickets,
    drone: preset.drone
  };

  // 1. Smoothly morph audio channel gains in the synthesizer
  if (synth) {
    synth.morphToPreset(targets, 2.0);
  }

  // 2. Smoothly morph UI slider values to match
  animateSlidersTo(targets, 2000);
}

function deselectAllPresetButtons() {
  presetsContainer.querySelectorAll('.btn-preset').forEach(btn => {
    btn.classList.remove('active');
  });
}

function animateSlidersTo(targets: Record<string, number>, durationMs = 2000) {
  if (morphAnimationFrameId) {
    cancelAnimationFrame(morphAnimationFrameId);
  }

  const startValues: Record<string, number> = {};
  const startTime = performance.now();

  channels.forEach(ch => {
    const slider = document.getElementById(`slider-${ch}`) as HTMLInputElement;
    if (slider) {
      startValues[ch] = parseFloat(slider.value);
    }
  });

  function step(now: number) {
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / durationMs, 1);
    
    // Easing: easeInOutCubic
    const ease = progress < 0.5 
      ? 4 * progress * progress * progress 
      : 1 - Math.pow(-2 * progress + 2, 3) / 2;

    channels.forEach(ch => {
      const slider = document.getElementById(`slider-${ch}`) as HTMLInputElement;
      const label = document.getElementById(`val-${ch}`) as HTMLSpanElement;
      if (slider) {
        const start = startValues[ch];
        const end = targets[ch] * 100;
        const currentVal = start + (end - start) * ease;
        slider.value = currentVal.toString();
        if (label) {
          label.textContent = `${Math.round(currentVal)}%`;
        }
      }
    });

    if (progress < 1) {
      morphAnimationFrameId = requestAnimationFrame(step);
    } else {
      morphAnimationFrameId = null;
    }
  }

  morphAnimationFrameId = requestAnimationFrame(step);
}

function getCustomPresets(): CustomPreset[] {
  const data = localStorage.getItem('somnia_custom_presets');
  return data ? JSON.parse(data) : [];
}

function saveCustomPreset() {
  const name = inputPresetName.value.trim();
  if (!name) return;

  const getVal = (id: string) => parseInt((document.getElementById(`slider-${id}`) as HTMLInputElement).value) / 100;

  const newPreset: CustomPreset = {
    id: 'custom_' + Date.now(),
    name,
    rain: getVal('rain'),
    ocean: getVal('ocean'),
    wind: getVal('wind'),
    campfire: getVal('campfire'),
    crickets: getVal('crickets'),
    drone: getVal('drone')
  };

  const customs = getCustomPresets();
  customs.push(newPreset);
  localStorage.setItem('somnia_custom_presets', JSON.stringify(customs));

  inputPresetName.value = '';
  renderPresetsList();
  
  // Mark new preset as active
  const activeBtn = presetsContainer.querySelector(`[data-preset-id="${newPreset.id}"]`);
  if (activeBtn) activeBtn.classList.add('active');
  presetActiveName.textContent = newPreset.name;
}

function deleteCustomPreset(id: string) {
  let customs = getCustomPresets();
  customs = customs.filter(p => p.id !== id);
  localStorage.setItem('somnia_custom_presets', JSON.stringify(customs));
  
  if (presetActiveName.textContent === "Custom Mix") {
    // Keep it
  } else {
    // If the active preset was deleted, fall back
    presetActiveName.textContent = "Custom Mix";
  }
  
  renderPresetsList();
}

/**
 * SLEEP TIMER
 */
function startSleepTimer(minutes: number) {
  cancelSleepTimer();

  sleepTimerSecondsLeft = minutes * 60;
  updateTimerCountdownUI();
  timerCountdownArea.classList.remove('hidden');

  sleepTimerIntervalId = window.setInterval(() => {
    sleepTimerSecondsLeft--;
    updateTimerCountdownUI();

    // Trigger audio fadeout 30s before the timer ends
    if (sleepTimerSecondsLeft === 30) {
      if (synth && isAudioActive) {
        synth.fadeOutAndStop(30, handleTimerFinish);
      }
    }

    if (sleepTimerSecondsLeft <= 0) {
      handleTimerFinish();
    }
  }, 1000);
}

function cancelSleepTimer() {
  if (sleepTimerIntervalId) {
    clearInterval(sleepTimerIntervalId);
    sleepTimerIntervalId = null;
  }
  timerCountdownArea.classList.add('hidden');
  selectTimer.value = "0";

  // Restore master volume in case fadeout began
  if (synth && isAudioActive) {
    const val = parseInt(sliderMasterVolume.value) / 100;
    synth.setMasterVolume(val, 0.5);
  }
}

function updateTimerCountdownUI() {
  const h = Math.floor(sleepTimerSecondsLeft / 3600);
  const m = Math.floor((sleepTimerSecondsLeft % 3600) / 60);
  const s = sleepTimerSecondsLeft % 60;
  
  const pad = (num: number) => num.toString().padStart(2, '0');
  timerTimeLeft.textContent = `${pad(h)}:${pad(m)}:${pad(s)}`;
}

function handleTimerFinish() {
  cancelSleepTimer();
  
  // Pause audio fully
  if (synth && isAudioActive) {
    synth.suspend().then(() => {
      isAudioActive = false;
      btnPlayPause.innerHTML = `
        <svg class="play-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polygon points="6 3 20 12 6 21 6 3"/>
        </svg>
        <span>Start Audio</span>
      `;
      btnEnterSleep.disabled = true;
    });
  }

  // Wake up if in sleep mode
  if (isSleepModeActive) {
    exitSleepMode();
  }
}

/**
 * SCREEN WAKE LOCK
 */
async function requestWakeLock() {
  if ('wakeLock' in navigator) {
    try {
      wakeLock = await (navigator as any).wakeLock.request('screen');
      wakeLockStatus.textContent = "Wake Lock Active";
      wakeLockStatus.classList.add('active');
      
      wakeLock.addEventListener('release', () => {
        updateWakeLockStatus(false);
      });
    } catch (err) {
      console.warn("Wake lock request failed:", err);
      updateWakeLockStatus(false);
    }
  } else {
    updateWakeLockStatus(false);
  }
}

function releaseWakeLock() {
  if (wakeLock) {
    wakeLock.release().then(() => {
      wakeLock = null;
      updateWakeLockStatus(false);
    });
  }
}

function updateWakeLockStatus(active: boolean) {
  if (active) {
    wakeLockStatus.textContent = "Wake Lock Active";
    wakeLockStatus.classList.add('active');
  } else {
    wakeLockStatus.textContent = "Wake Lock Released";
    wakeLockStatus.classList.remove('active');
  }
}

function handleVisibilityChange() {
  if (document.visibilityState === 'visible' && isSleepModeActive) {
    requestWakeLock();
  }
}

/**
 * SLEEP MODE OVERLAY (BLACK SCREEN & CURSOR HIDE)
 */
async function enterSleepMode() {
  if (!isAudioActive) return;

  isSleepModeActive = true;
  sleepStartX = null;
  sleepStartY = null;

  // Request screen wake lock explicitly
  await requestWakeLock();

  // Show fullscreen overlay
  sleepOverlay.style.display = 'flex';

  // Request fullscreen to cover navigation bars/taskbars
  try {
    if (document.documentElement.requestFullscreen) {
      await document.documentElement.requestFullscreen();
    } else if ((document.documentElement as any).webkitRequestFullscreen) {
      await (document.documentElement as any).webkitRequestFullscreen();
    }
  } catch (err) {
    console.warn("Fullscreen request rejected:", err);
  }

  // Reset the HUD animation so it displays and then fades
  sleepHud.style.animation = 'none';
  // Trigger reflow to restart animation
  void sleepHud.offsetWidth; 
  sleepHud.style.animation = 'fade-out-delay 4s forwards';

  // Register wakeup event listeners
  window.addEventListener('keydown', exitSleepMode);
  window.addEventListener('click', exitSleepMode);
  window.addEventListener('mousemove', handleSleepMouseMove);
  
  // Hide pointer on overlay
  sleepOverlay.style.cursor = 'none';
}

function exitSleepMode() {
  if (!isSleepModeActive) return;

  isSleepModeActive = false;

  // Exit Fullscreen if active
  if (document.fullscreenElement) {
    document.exitFullscreen().catch(err => console.warn(err));
  }

  // Hide Sleep Overlay
  sleepOverlay.style.display = 'none';
  
  // Clean up wake-up listeners
  window.removeEventListener('keydown', exitSleepMode);
  window.removeEventListener('click', exitSleepMode);
  window.removeEventListener('mousemove', handleSleepMouseMove);

  // Restore wake lock status based on general audio playback
  if (!isAudioActive) {
    releaseWakeLock();
  }
}

function handleSleepMouseMove(e: MouseEvent) {
  if (sleepStartX === null || sleepStartY === null) {
    sleepStartX = e.clientX;
    sleepStartY = e.clientY;
    return;
  }

  const dx = e.clientX - sleepStartX;
  const dy = e.clientY - sleepStartY;
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dist > MOVEMENT_THRESHOLD) {
    exitSleepMode();
  }
}

/**
 * AUDIO VISUALIZER
 */
function setupVisualizer() {
  if (!canvas) return;
  canvasCtx = canvas.getContext('2d');
  resizeCanvas();
}

function resizeCanvas() {
  if (!canvas || !canvasCtx) return;
  const parent = canvas.parentElement;
  if (!parent) return;

  const rect = parent.getBoundingClientRect();
  canvas.width = rect.width;
  canvas.height = rect.height;
}

function drawVisualizer() {
  if (!canvas || !canvasCtx || !synth) return;

  const analyser = synth.getAnalyser();
  if (!analyser) return;

  const bufferLength = analyser.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);
  
  const width = canvas.width;
  const height = canvas.height;

  function renderFrame() {
    if (!canvas || !canvasCtx || !synth) return;
    
    // Draw visualizer loop
    requestAnimationFrame(renderFrame);

    analyser!.getByteFrequencyData(dataArray);

    canvasCtx.clearRect(0, 0, width, height);

    const isOled = document.body.classList.contains('theme-oled');
    const gradient = canvasCtx.createLinearGradient(0, height, 0, 0);
    
    if (isOled) {
      gradient.addColorStop(0, '#10002b');
      gradient.addColorStop(0.6, '#7b2cbf');
      gradient.addColorStop(1, '#e0aaff');
    } else {
      gradient.addColorStop(0, '#0a0015');
      gradient.addColorStop(0.6, '#9d4edd');
      gradient.addColorStop(1, '#f3f0f7');
    }

    canvasCtx.fillStyle = gradient;

    const barWidth = (width / bufferLength) * 1.5;
    let barHeight;
    let x = 0;

    for (let i = 0; i < bufferLength; i++) {
      // Scale frequency value
      barHeight = (dataArray[i] / 255) * height * 0.95;

      // Draw thin visualizer bar
      canvasCtx.fillRect(x, height - barHeight, barWidth - 1, barHeight);
      x += barWidth;
    }
  }

  renderFrame();
}
