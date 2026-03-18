/**
 * NOOBMARINE — Audio Module (Web Audio API)
 * All sounds are procedurally generated — no external files needed.
 */

const NMAudio = (() => {
  let ctx = null;
  let ambientTimer = null;
  let initialized = false;

  function init() {
    if (initialized) return;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state === 'suspended') ctx.resume();
      initialized = true;
    } catch { /* Web Audio not supported */ }
  }

  function ensureCtx() {
    if (!ctx) return false;
    if (ctx.state === 'suspended') ctx.resume();
    return true;
  }

  // ── Basic oscillator beep ──
  function beep(freq = 800, duration = 0.08, type = 'sine', volume = 0.12) {
    if (!ensureCtx()) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  }

  // ── White noise burst (static crackle) ──
  function noise(duration = 0.06, volume = 0.04) {
    if (!ensureCtx()) return;
    const bufferSize = ctx.sampleRate * duration;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * volume;
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(1, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    source.connect(gain).connect(ctx.destination);
    source.start();
  }

  // ── Task completed: ascending two-tone ──
  function taskComplete() {
    if (!ensureCtx()) return;
    beep(600, 0.1, 'sine', 0.15);
    setTimeout(() => beep(900, 0.12, 'sine', 0.15), 100);
  }

  // ── Task failed: descending tone ──
  function taskFailed() {
    if (!ensureCtx()) return;
    beep(400, 0.15, 'sawtooth', 0.1);
    setTimeout(() => beep(250, 0.2, 'sawtooth', 0.1), 140);
  }

  // ── Round end success ──
  function roundSuccess() {
    if (!ensureCtx()) return;
    beep(500, 0.1, 'sine', 0.12);
    setTimeout(() => beep(700, 0.1, 'sine', 0.12), 100);
    setTimeout(() => beep(1000, 0.15, 'sine', 0.14), 200);
  }

  // ── Timer warning: looping alarm for last 10 seconds ──
  let alarmInterval = null;

  function timerWarning() {
    if (!ensureCtx()) return;
    // Start looping alarm if not already running
    if (alarmInterval) return;
    _playAlarmBeep();
    alarmInterval = setInterval(_playAlarmBeep, 1000);
  }

  function _playAlarmBeep() {
    if (!ensureCtx()) return;
    beep(800, 0.08, 'square', 0.14);
    setTimeout(() => beep(800, 0.08, 'square', 0.14), 140);
    setTimeout(() => beep(800, 0.08, 'square', 0.14), 280);
  }

  function stopAlarm() {
    if (alarmInterval) {
      clearInterval(alarmInterval);
      alarmInterval = null;
    }
  }

  // ── Background music: plays /sounds/background.mp3 ──
  let musicAudio = null;
  let musicWanted = false;

  // Pre-load audio element so mobile browsers have it ready
  function warmMusic() {
    if (musicAudio) return;
    musicAudio = new Audio('/sounds/background.mp3');
    musicAudio.loop = true;
    musicAudio.volume = 0.3;
    musicAudio.preload = 'auto';
    musicAudio.load();
  }

  function startMusic() {
    musicWanted = true;
    if (!musicAudio) warmMusic();
    musicAudio.play().catch(() => {
      // Autoplay blocked — retry on next user gesture
      const retry = () => {
        if (musicWanted && musicAudio) musicAudio.play().catch(() => {});
        document.removeEventListener('touchstart', retry);
        document.removeEventListener('click', retry);
      };
      document.addEventListener('touchstart', retry, { once: true });
      document.addEventListener('click', retry, { once: true });
    });
  }

  function stopMusic() {
    musicWanted = false;
    if (!musicAudio) return;
    musicAudio.pause();
    musicAudio.currentTime = 0;
  }

  // ── No-ops (ambient removed) ──
  function startAmbient() {}
  function stopAmbient() {}

  return { init, beep, noise, taskComplete, taskFailed, roundSuccess, timerWarning, stopAlarm, startMusic, stopMusic, startAmbient, stopAmbient };
})();
