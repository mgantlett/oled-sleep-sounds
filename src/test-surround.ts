let ctx: AudioContext | null = null;
let merger: ChannelMergerNode | null = null;
let currentOsc: OscillatorNode | null = null;

async function initContext() {
  if (ctx) return;
  const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
  ctx = new AudioContextClass({ sampleRate: 48000 });
  
  // Force 8 channels if supported
  const maxChannels = ctx.destination.maxChannelCount;
  if (maxChannels >= 8) {
    ctx.destination.channelCount = 8;
    ctx.destination.channelCountMode = 'explicit';
    ctx.destination.channelInterpretation = 'discrete';
  } else {
    alert(`Your browser reports a max channel count of ${maxChannels}. If this is less than 8, Chrome is physically restricting Web Audio to Stereo!`);
  }

  // Use a raw ChannelMerger to bypass all 3D math and force discrete channels
  merger = ctx.createChannelMerger(8);
  merger.connect(ctx.destination);
}

function playToneOnChannel(channelIndex: number, btn: HTMLButtonElement) {
  if (!ctx || !merger) return;

  // Stop previous
  if (currentOsc) {
    try { currentOsc.stop(); } catch (e) {}
  }

  // Remove active state from all buttons
  document.querySelectorAll('button').forEach(b => b.classList.remove('active'));

  // Highlight this button
  btn.classList.add('active');

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'sine';
  osc.frequency.value = channelIndex === 5 ? 80 : 440; // Subwoofer gets 80Hz

  gain.gain.setValueAtTime(0, ctx.currentTime);
  gain.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 0.05); // Fade in
  gain.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 1.5); // Hold
  gain.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + 2.0); // Fade out

  osc.connect(gain);
  // Connect explicitly to the requested index in the merger
  gain.connect(merger, 0, channelIndex);

  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 2.1);
  currentOsc = osc;

  setTimeout(() => {
    btn.classList.remove('active');
  }, 2000);
}

document.querySelectorAll('button[data-channel]').forEach(btn => {
  btn.addEventListener('click', async () => {
    await initContext();
    if (ctx?.state === 'suspended') {
      await ctx.resume();
    }
    const idx = parseInt((btn as HTMLButtonElement).dataset.channel!);
    playToneOnChannel(idx, btn as HTMLButtonElement);
  });
});
