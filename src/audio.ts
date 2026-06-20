export interface SoundVolumes {
  rain: number;
  ocean: number;
  wind: number;
  campfire: number;
  crickets: number;
  drone: number;
}

export interface AudioPreset extends SoundVolumes {
  name: string;
  description: string;
}

export const PRESETS: Record<string, AudioPreset> = {
  rainyForest: {
    name: "Rainy Forest",
    rain: 0.8,
    ocean: 0.0,
    wind: 0.35,
    campfire: 0.1,
    crickets: 0.15,
    drone: 0.2,
    description: "Soothing steady rain with rustling wind and distant night ambience."
  },
  oceanWaves: {
    name: "Ocean Waves",
    rain: 0.0,
    ocean: 0.85,
    wind: 0.4,
    campfire: 0.0,
    crickets: 0.05,
    drone: 0.3,
    description: "Slow breathing ocean waves and a gentle maritime breeze."
  },
  cozyCampfire: {
    name: "Cozy Campfire",
    rain: 0.0,
    ocean: 0.0,
    wind: 0.15,
    campfire: 0.75,
    crickets: 0.5,
    drone: 0.25,
    description: "Warm crackling fire in the woods surrounded by summer crickets."
  },
  cosmicNoise: {
    name: "Cosmic Noise",
    rain: 0.2,
    ocean: 0.2,
    wind: 0.1,
    campfire: 0.0,
    crickets: 0.0,
    drone: 0.8,
    description: "A deep, sweeping theta meditation drone mixed with cosmic brown noise."
  },
  summerNight: {
    name: "Summer Night",
    rain: 0.0,
    ocean: 0.0,
    wind: 0.2,
    campfire: 0.0,
    crickets: 0.8,
    drone: 0.4,
    description: "A peaceful nocturnal chorus of crickets and a warm sleeping drone."
  }
};

export class SleepSoundSynthesizer {
  private ctx: AudioContext | null = null;
  
  // Master Nodes
  private masterGain: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private analyserNode: AnalyserNode | null = null;

  // Individual Sound Channel Gains
  private gains: Record<string, GainNode> = {};

  // Noise Buffers
  private whiteNoiseBuffer: AudioBuffer | null = null;
  private pinkNoiseBuffer: AudioBuffer | null = null;
  private brownNoiseBuffer: AudioBuffer | null = null;

  // Synthesis references for active elements
  private activeSources: AudioNode[] = [];
  private schedulerIntervalId: number | null = null;
  
  // Audio state
  private isPlaying = false;
  private nextRaindropTime = 0;
  private nextCrackleTime = 0;

  constructor() {}

  public isInitialized(): boolean {
    return this.ctx !== null;
  }

  public getAnalyser(): AnalyserNode | null {
    return this.analyserNode;
  }

  public async init(): Promise<void> {
    if (this.ctx) return;

    // Create Audio Context
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    this.ctx = new AudioContextClass();

    const ctx = this.ctx!;

    // Force stereo output to avoid multi-channel/surround routing bugs in Chrome
    try {
      ctx.destination.channelCount = 2;
      ctx.destination.channelCountMode = 'explicit';
      ctx.destination.channelInterpretation = 'speakers';
    } catch (e) {
      console.warn("Failed to set explicit stereo channel count on AudioContext destination:", e);
    }

    // Create master chain
    this.analyserNode = ctx.createAnalyser();
    this.analyserNode.fftSize = 256;

    this.compressor = ctx.createDynamicsCompressor();
    // Configure soft-limiting to prevent clipping
    this.compressor.threshold.value = -12;
    this.compressor.knee.value = 30;
    this.compressor.ratio.value = 12;
    this.compressor.attack.value = 0.003;
    this.compressor.release.value = 0.25;

    this.masterGain = ctx.createGain();
    this.masterGain.gain.setValueAtTime(0.8, ctx.currentTime);

    // Connect: Sources -> Individual Gains -> Compressor -> Master Gain -> Analyser -> Destination
    this.compressor.connect(this.masterGain);
    this.masterGain.connect(this.analyserNode);
    this.analyserNode.connect(ctx.destination);

    // Generate stereo noise buffers
    this.whiteNoiseBuffer = this.createStereoNoiseBuffer('white', 4.0);
    this.pinkNoiseBuffer = this.createStereoNoiseBuffer('pink', 4.0);
    this.brownNoiseBuffer = this.createStereoNoiseBuffer('brown', 4.0);

    // Set up channel gains
    const channels = ['rain', 'ocean', 'wind', 'campfire', 'crickets', 'drone'];
    channels.forEach(ch => {
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0, ctx.currentTime);
      g.connect(this.compressor!);
      this.gains[ch] = g;
    });

    // Synthesize the sounds
    this.setupRainChannel();
    this.setupOceanChannel();
    this.setupWindChannel();
    this.setupCampfireChannel();
    this.setupCricketsChannel();
    this.setupDroneChannel();

    // Start background schedulers
    this.isPlaying = true;
    this.nextRaindropTime = ctx.currentTime;
    this.nextCrackleTime = ctx.currentTime;
    this.startScheduler();
  }

  public async resume(): Promise<void> {
    if (this.ctx && this.ctx.state === 'suspended') {
      await this.ctx.resume();
      this.isPlaying = true;
      this.startScheduler();
    }
  }

  public async suspend(): Promise<void> {
    if (this.ctx && this.ctx.state === 'running') {
      await this.ctx.suspend();
      this.isPlaying = false;
      this.stopScheduler();
    }
  }

  public setChannelVolume(channel: string, targetVol: number, rampDuration = 0.1): void {
    const gainNode = this.gains[channel];
    if (gainNode && this.ctx) {
      const t = this.ctx.currentTime;
      gainNode.gain.cancelScheduledValues(t);
      // Soft transition to avoid audio clicks
      gainNode.gain.setValueAtTime(gainNode.gain.value, t);
      gainNode.gain.linearRampToValueAtTime(targetVol, t + rampDuration);
    }
  }

  public setMasterVolume(targetVol: number, rampDuration = 0.05): void {
    if (this.masterGain && this.ctx) {
      const t = this.ctx.currentTime;
      this.masterGain.gain.cancelScheduledValues(t);
      this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, t);
      this.masterGain.gain.linearRampToValueAtTime(targetVol, t + rampDuration);
    }
  }

  public getChannelVolume(channel: string): number {
    return this.gains[channel] ? this.gains[channel].gain.value : 0;
  }

  public getMasterVolume(): number {
    return this.masterGain ? this.masterGain.gain.value : 0;
  }

  public morphToPreset(preset: SoundVolumes, duration = 2.0): void {
    this.setChannelVolume('rain', preset.rain, duration);
    this.setChannelVolume('ocean', preset.ocean, duration);
    this.setChannelVolume('wind', preset.wind, duration);
    this.setChannelVolume('campfire', preset.campfire, duration);
    this.setChannelVolume('crickets', preset.crickets, duration);
    this.setChannelVolume('drone', preset.drone, duration);
  }

  public fadeOutAndStop(duration = 30.0, callback: () => void): void {
    if (!this.ctx || !this.masterGain) return;
    const t = this.ctx.currentTime;
    
    this.masterGain.gain.cancelScheduledValues(t);
    this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, t);
    this.masterGain.gain.linearRampToValueAtTime(0.0, t + duration);
    
    setTimeout(() => {
      this.suspend().then(callback);
    }, duration * 1000);
  }

  /**
   * Procedural synthesis setups
   */

  private createStereoNoiseBuffer(type: 'white' | 'pink' | 'brown', duration: number): AudioBuffer {
    const ctx = this.ctx!;
    const sampleRate = ctx.sampleRate;
    const bufferSize = sampleRate * duration;
    const buffer = ctx.createBuffer(2, bufferSize, sampleRate);

    for (let channel = 0; channel < 2; channel++) {
      const data = buffer.getChannelData(channel);
      if (type === 'white') {
        for (let i = 0; i < bufferSize; i++) {
          data[i] = Math.random() * 2 - 1;
        }
      } else if (type === 'pink') {
        // Voss-McCartney algorithm approximation for pink noise
        let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
        for (let i = 0; i < bufferSize; i++) {
          const white = Math.random() * 2 - 1;
          b0 = 0.99886 * b0 + white * 0.0555179;
          b1 = 0.99332 * b1 + white * 0.0750759;
          b2 = 0.96900 * b2 + white * 0.1538520;
          b3 = 0.86650 * b3 + white * 0.3104856;
          b4 = 0.55000 * b4 + white * 0.5329522;
          b5 = -0.7616 * b5 - white * 0.0168980;
          const pink = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
          b6 = white * 0.115926;
          data[i] = pink * 0.12; // Compensate amplitude
        }
      } else if (type === 'brown') {
        // Integrating white noise (leaky integrator)
        let lastOut = 0.0;
        for (let i = 0; i < bufferSize; i++) {
          const white = Math.random() * 2 - 1;
          data[i] = (lastOut + (0.02 * white)) / 1.02;
          lastOut = data[i];
          data[i] *= 3.5; // Compensate amplitude
        }
      }
    }
    return buffer;
  }

  // RAIN CHANNEL
  // Constant rumble of pink noise filtered to around 400Hz.
  private setupRainChannel(): void {
    const ctx = this.ctx!;
    const source = ctx.createBufferSource();
    source.buffer = this.pinkNoiseBuffer;
    source.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(550, ctx.currentTime);
    filter.Q.setValueAtTime(0.7, ctx.currentTime);

    source.connect(filter);
    filter.connect(this.gains['rain']);
    source.start(0);

    this.activeSources.push(source);
  }

  // OCEAN CHANNEL
  // Brown noise Lowpassed. Cutoff and gain modulated by an LFO to simulate rolling waves.
  private setupOceanChannel(): void {
    const ctx = this.ctx!;
    const source = ctx.createBufferSource();
    source.buffer = this.brownNoiseBuffer;
    source.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(250, ctx.currentTime);

    // Create LFO for wave sweeps
    const lfo = ctx.createOscillator();
    lfo.frequency.setValueAtTime(0.07, ctx.currentTime); // Wave every ~14 seconds

    const lfoGainVol = ctx.createGain();
    lfoGainVol.gain.setValueAtTime(0.35, ctx.currentTime); // Modulation depth for volume

    const lfoGainFilter = ctx.createGain();
    lfoGainFilter.gain.setValueAtTime(220, ctx.currentTime); // Modulation depth for filter frequency (shifts cutoff up/down by 220Hz)

    // Base volume gain node for ocean waves
    const oceanModGain = ctx.createGain();
    oceanModGain.gain.setValueAtTime(0.5, ctx.currentTime); // Base volume offset

    // LFO modulations
    lfo.connect(lfoGainVol);
    lfoGainVol.connect(oceanModGain.gain);

    lfo.connect(lfoGainFilter);
    lfoGainFilter.connect(filter.frequency);

    // Audio routing: source -> filter -> oceanModGain -> main channel gain
    source.connect(filter);
    filter.connect(oceanModGain);
    oceanModGain.connect(this.gains['ocean']);

    source.start(0);
    lfo.start(0);

    this.activeSources.push(source, lfo);
  }

  // WIND CHANNEL
  // Pink noise through a Bandpass filter with a high Q. Cutoff frequency modulated by double LFOs.
  private setupWindChannel(): void {
    const ctx = this.ctx!;
    const source = ctx.createBufferSource();
    source.buffer = this.pinkNoiseBuffer;
    source.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(450, ctx.currentTime);
    filter.Q.setValueAtTime(2.5, ctx.currentTime);

    // Two slow LFOs summed to create organic, non-periodic gusts
    const lfo1 = ctx.createOscillator();
    lfo1.frequency.setValueAtTime(0.04, ctx.currentTime); // 25s

    const lfo2 = ctx.createOscillator();
    lfo2.frequency.setValueAtTime(0.065, ctx.currentTime); // 15s

    const lfoGain = ctx.createGain();
    lfoGain.gain.setValueAtTime(150, ctx.currentTime); // Modulates bandpass center freq by +/- 150Hz

    const lfoSum = ctx.createGain();

    lfo1.connect(lfoSum);
    lfo2.connect(lfoSum);
    lfoSum.connect(lfoGain);
    lfoGain.connect(filter.frequency);

    source.connect(filter);
    filter.connect(this.gains['wind']);

    source.start(0);
    lfo1.start(0);
    lfo2.start(0);

    this.activeSources.push(source, lfo1, lfo2);
  }

  // CAMPFIRE CHANNEL
  // Deep constant low rumble (brown noise through 120Hz lowpass) + Crackles scheduled ahead in JS.
  private setupCampfireChannel(): void {
    const ctx = this.ctx!;
    const source = ctx.createBufferSource();
    source.buffer = this.brownNoiseBuffer;
    source.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(120, ctx.currentTime);

    source.connect(filter);
    filter.connect(this.gains['campfire']);
    source.start(0);

    this.activeSources.push(source);
  }

  // CRICKETS CHANNEL
  // Creates several cricket voices that chirp asynchronously.
  private setupCricketsChannel(): void {
    const ctx = this.ctx!;
    
    // Create cricket chirping voices.
    // Crickets chirp by multiplying a high frequency carrier (4KHz sine) with a fast 12Hz pulse (trill),
    // and gating it with a slower tempo gate (1-2s).
    // Let's create 3 voices to simulate a wide stereophonic night field.
    const cricketVoices = [
      { freq: 4400, trillRate: 14, chirpRate: 0.5, pan: -0.6 },
      { freq: 4600, trillRate: 11, chirpRate: 0.7, pan: 0.6 },
      { freq: 4500, trillRate: 13, chirpRate: 0.4, pan: 0.0 }
    ];

    cricketVoices.forEach(voice => {
      // Main carrier oscillator (the cricket chirp frequency)
      const carrier = ctx.createOscillator();
      carrier.type = 'sine';
      carrier.frequency.setValueAtTime(voice.freq, ctx.currentTime);

      // Fast LFO for the rapid "trill" (insect wings friction)
      const trillLfo = ctx.createOscillator();
      trillLfo.type = 'triangle';
      trillLfo.frequency.setValueAtTime(voice.trillRate, ctx.currentTime);

      const trillGain = ctx.createGain();
      trillGain.gain.setValueAtTime(0.5, ctx.currentTime);
      
      const trillBias = ctx.createGain();
      trillBias.gain.setValueAtTime(0.5, ctx.currentTime);

      // Slow LFO for the periodic "chirp... chirp..." cycle
      const chirpLfo = ctx.createOscillator();
      chirpLfo.type = 'sine';
      chirpLfo.frequency.setValueAtTime(voice.chirpRate, ctx.currentTime);

      // Waveshaper or threshold gain to turn the sine chirp LFO into clean on/off pulses
      const chirpThreshold = ctx.createGain();
      chirpThreshold.gain.setValueAtTime(0.0, ctx.currentTime);

      // We will modulate a voice gain node
      const voiceGain = ctx.createGain();
      voiceGain.gain.setValueAtTime(0.0, ctx.currentTime);

      // LFO modulation connections
      trillLfo.connect(trillGain);
      trillGain.connect(trillBias.gain);

      // Connect chirp cycle to control voice gain
      // We will automate the chirp gain using a wave shaper to get nice rhythmic gates:
      // Since creating wave shaper curves is verbose, we can connect the chirp LFO to a gain node
      // and modulate the carrier volume with both. Let's make it simpler and very effective:
      // We can modulate voiceGain.gain with a product of chirpLfo and trillLfo.
      // In Web Audio, to multiply two signals, you connect one to a GainNode's gain parameter.
      const modNode = ctx.createGain();
      modNode.gain.setValueAtTime(0.0, ctx.currentTime);

      // Connect trill (0.0 to 1.0 amplitude) to modNode gain
      trillBias.connect(modNode.gain);

      // Slow chirp modulates modNode input
      const chirpCarrier = ctx.createOscillator();
      chirpCarrier.type = 'sine';
      chirpCarrier.frequency.setValueAtTime(voice.freq, ctx.currentTime);

      // Let's implement cricket chirps using a periodic scripting or simple parameter schedules to keep it robust.
      // Actually, an elegant way is to schedule it:
      // Or we can construct it purely in nodes:
      // Let's connect carrier -> voiceGain -> panner -> cricketsGain
      const panner = ctx.createStereoPanner();
      panner.pan.setValueAtTime(voice.pan, ctx.currentTime);

      carrier.connect(voiceGain);
      voiceGain.connect(panner);
      panner.connect(this.gains['crickets']);

      // Let's automate the gain node with a custom oscillator shape
      // We create a slow pulse oscillator by using a triangle wave oscillator at 0.5Hz,
      // and routing it through a wave shaper to create custom gates.
      // But standard oscillators in loop are easy: let's modulate carrier -> voiceGain using an LFO.
      // Let's make it simpler: we schedule the chirps on a timer for highly realistic organic chirps!
      // This is extremely realistic:
      this.activeSources.push(carrier, trillLfo, chirpLfo);
      
      // We will trigger chirping using the scheduler loop. So this node's gain will be automated in `scheduleCrickets`
      // Save reference to voiceGain so scheduler can trigger it.
      this.cricketVoiceNodes.push({
        gainNode: voiceGain,
        frequency: voice.freq,
        pan: voice.pan
      });

      carrier.start(0);
    });
  }

  private cricketVoiceNodes: Array<{ gainNode: GainNode; frequency: number; pan: number }> = [];

  // MEDITATION DRONE CHANNEL
  // Warm low-frequency drones with a 4Hz binaural difference (Theta state)
  // Left: 100Hz and 200Hz. Right: 104Hz and 204Hz. Plus a low lowpass filter.
  private setupDroneChannel(): void {
    const ctx = this.ctx!;
    
    // Left Channel Synth
    const oscL1 = ctx.createOscillator();
    oscL1.type = 'triangle';
    oscL1.frequency.setValueAtTime(98, ctx.currentTime); // G2

    const oscL2 = ctx.createOscillator();
    oscL2.type = 'sine';
    oscL2.frequency.setValueAtTime(147, ctx.currentTime); // D3 (perfect fifth)

    const leftMerger = ctx.createGain();
    leftMerger.gain.setValueAtTime(0.25, ctx.currentTime);

    oscL1.connect(leftMerger);
    oscL2.connect(leftMerger);

    // Right Channel Synth (detuned slightly for binaural beats at ~4Hz)
    const oscR1 = ctx.createOscillator();
    oscR1.type = 'triangle';
    oscR1.frequency.setValueAtTime(102, ctx.currentTime); // Binaural beat delta = 4Hz

    const oscR2 = ctx.createOscillator();
    oscR2.type = 'sine';
    oscR2.frequency.setValueAtTime(151, ctx.currentTime); 

    const rightMerger = ctx.createGain();
    rightMerger.gain.setValueAtTime(0.25, ctx.currentTime);

    oscR1.connect(rightMerger);
    oscR2.connect(rightMerger);

    // Lowpass filter to keep it deep and warm
    const lowpass = ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.setValueAtTime(140, ctx.currentTime);

    // Stereo routing
    const splitter = ctx.createChannelMerger(2);
    leftMerger.connect(splitter, 0, 0);
    rightMerger.connect(splitter, 0, 1);

    splitter.connect(lowpass);
    lowpass.connect(this.gains['drone']);

    // Slow filter frequency sweeping LFO for organic movement
    const filterLfo = ctx.createOscillator();
    filterLfo.frequency.setValueAtTime(0.05, ctx.currentTime); // 20 seconds period

    const filterLfoGain = ctx.createGain();
    filterLfoGain.gain.setValueAtTime(40, ctx.currentTime); // sweep filter +/- 40Hz

    filterLfo.connect(filterLfoGain);
    filterLfoGain.connect(lowpass.frequency);

    oscL1.start(0);
    oscL2.start(0);
    oscR1.start(0);
    oscR2.start(0);
    filterLfo.start(0);

    this.activeSources.push(oscL1, oscL2, oscR1, oscR2, filterLfo);
  }

  /**
   * Scheduling loop for random events (Raindrops, Campfire crackles, Cricket chirps)
   */
  private startScheduler(): void {
    if (this.schedulerIntervalId) return;
    
    // Look ahead 100ms, run scheduler every 40ms
    this.schedulerIntervalId = window.setInterval(() => {
      this.schedulerLoop();
    }, 40);
  }

  private stopScheduler(): void {
    if (this.schedulerIntervalId) {
      clearInterval(this.schedulerIntervalId);
      this.schedulerIntervalId = null;
    }
  }

  private schedulerLoop(): void {
    if (!this.ctx || !this.isPlaying) return;

    const ctx = this.ctx;
    const lookAhead = 0.1; // 100ms look-ahead
    const scheduleBoundary = ctx.currentTime + lookAhead;

    // 1. Schedule Raindrops
    // Only schedule if the rain channel volume is non-zero
    const rainVol = this.gains['rain'].gain.value;
    if (rainVol > 0.01) {
      while (this.nextRaindropTime < scheduleBoundary) {
        this.scheduleRaindrop(this.nextRaindropTime, rainVol);
        // Random time until next raindrop (dense: 40ms to 120ms)
        this.nextRaindropTime += 0.04 + Math.random() * 0.08;
      }
    } else {
      this.nextRaindropTime = ctx.currentTime;
    }

    // 2. Schedule Campfire Crackles
    const campfireVol = this.gains['campfire'].gain.value;
    if (campfireVol > 0.01) {
      while (this.nextCrackleTime < scheduleBoundary) {
        this.scheduleCampfireCrackle(this.nextCrackleTime, campfireVol);
        // Crackling happens in bursts
        const isBurst = Math.random() > 0.7;
        this.nextCrackleTime += isBurst ? (0.015 + Math.random() * 0.04) : (0.08 + Math.random() * 0.4);
      }
    } else {
      this.nextCrackleTime = ctx.currentTime;
    }

    // 3. Schedule Cricket Chirps
    const cricketsVol = this.gains['crickets'].gain.value;
    if (cricketsVol > 0.01) {
      this.scheduleCrickets(ctx.currentTime, cricketsVol);
    }
  }

  // Synthesize a single raindrop click
  private scheduleRaindrop(time: number, channelVolume: number): void {
    const ctx = this.ctx!;
    
    // Create oscillator for the raindrop "plop" pitch
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    // Raindrops have varying pitches depending on size
    const pitch = 800 + Math.random() * 1200;
    osc.frequency.setValueAtTime(pitch, time);
    // Rapid pitch sweep downwards to sound like a drop impact
    osc.frequency.exponentialRampToValueAtTime(100, time + 0.04);

    // Filter to soften the raindrop sound
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(3000, time);

    // Gain envelope (instant attack, fast decay ~40-70ms)
    const gainNode = ctx.createGain();
    const duration = 0.03 + Math.random() * 0.04;
    const vol = (0.04 + Math.random() * 0.1) * channelVolume;
    
    gainNode.gain.setValueAtTime(0.0, time);
    gainNode.gain.linearRampToValueAtTime(vol, time + 0.002);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, time + duration);

    // Stereo Panning for spatial width
    const panner = ctx.createStereoPanner();
    panner.pan.setValueAtTime(Math.random() * 2 - 1, time);

    // Connect nodes
    osc.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(panner);
    panner.connect(this.compressor!);

    osc.start(time);
    osc.stop(time + duration + 0.01);
  }

  // Synthesize a campfire crackle click
  private scheduleCampfireCrackle(time: number, channelVolume: number): void {
    const ctx = this.ctx!;

    // A campfire crackle is a very short burst of high-passed white noise
    const source = ctx.createBufferSource();
    source.buffer = this.whiteNoiseBuffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(1500 + Math.random() * 3000, time);

    const gainNode = ctx.createGain();
    const duration = 0.005 + Math.random() * 0.015; // 5ms - 20ms
    const vol = (0.08 + Math.random() * 0.22) * channelVolume;

    gainNode.gain.setValueAtTime(0.0, time);
    gainNode.gain.linearRampToValueAtTime(vol, time + 0.001);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, time + duration);

    const panner = ctx.createStereoPanner();
    panner.pan.setValueAtTime(Math.random() * 1.6 - 0.8, time);

    source.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(panner);
    panner.connect(this.compressor!);

    source.start(time);
    source.stop(time + duration + 0.01);
  }

  // Automate crickets chirping rhythmically
  private lastCricketChirpTime: Record<number, number> = {};
  
  private scheduleCrickets(currentTime: number, channelVolume: number): void {
    this.cricketVoiceNodes.forEach((voice, index) => {
      const lastChirp = this.lastCricketChirpTime[index] || 0;
      // Define voice specific chirp intervals (e.g. every 1.5 - 2.5 seconds)
      const interval = 1.2 + (index * 0.5) + (Math.sin(currentTime * 0.1 + index) * 0.2);
      
      if (currentTime - lastChirp > interval) {
        this.lastCricketChirpTime[index] = currentTime;
        
        // Trigger a chirp sequence (a chirp contains 3 or 4 rapid trills)
        const chirpStart = currentTime + 0.02;
        const trillCount = 3 + Math.floor(Math.random() * 2); // 3-4 bursts
        const trillDuration = 0.04;
        const trillGap = 0.025;
        
        const gain = voice.gainNode.gain;
        gain.cancelScheduledValues(chirpStart);
        
        let t = chirpStart;
        for (let i = 0; i < trillCount; i++) {
          const targetVol = (0.05 + Math.random() * 0.05) * channelVolume;
          
          // Trill on
          gain.setValueAtTime(0, t);
          gain.linearRampToValueAtTime(targetVol, t + 0.008);
          // Rapid trill volume oscillation (insect wing fluttering)
          gain.setValueAtTime(targetVol, t + trillDuration - 0.01);
          gain.exponentialRampToValueAtTime(0.0001, t + trillDuration);
          
          t += trillDuration + trillGap;
        }
      }
    });
  }
}
