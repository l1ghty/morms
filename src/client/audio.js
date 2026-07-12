export class AudioSynth {
  constructor() {
    this.ctx = null;
    this.noiseBuffer = null;
  }

  init() {
    if (this.ctx) return;
    
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      
      // Create and cache white noise buffer for explosions and splashes
      const bufferSize = this.ctx.sampleRate * 2.5; // 2.5 seconds
      this.noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
    } catch (e) {
      console.warn("Web Audio API is not supported in this browser:", e);
    }
  }

  play(soundName) {
    this.init();
    if (!this.ctx) return;
    
    // Resume context if suspended (browser security restriction policy)
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    
    const now = this.ctx.currentTime;
    
    switch (soundName) {
      case 'beep_tick':
        this.playTick(now);
        break;
      case 'beep_error':
        this.playError(now);
        break;
      case 'weapon_select':
        this.playWeaponSelect(now);
        break;
      case 'jump':
        this.playJump(now);
        break;
      case 'bounce':
        this.playBounce(now);
        break;
      case 'shoot_bazooka':
        this.playShootBazooka(now);
        break;
      case 'shoot_grenade':
        this.playShootGrenade(now);
        break;
      case 'explosion':
        this.playExplosion(now, 45); // standard size
        break;
      case 'holy_explosion':
        this.playExplosion(now, 85); // giant size
        break;
      case 'splash':
        this.playSplash(now);
        break;
      case 'airstrike_siren':
        this.playSiren(now);
        break;
      case 'hallelujah':
        this.playHallelujah(now);
        break;
      case 'fuse':
        this.playFuse(now);
        break;
      case 'blowtorch':
        this.playBlowtorch(now);
        break;
      case 'worm_damage':
        this.playWormDamage(now);
        break;
      case 'worm_die':
        this.playWormDie(now);
        break;
    }
  }

  playTick(time) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(900, time);
    
    gain.gain.setValueAtTime(0.08, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.08);
    
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    
    osc.start(time);
    osc.stop(time + 0.09);
  }

  playError(time) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(130, time);
    osc.frequency.linearRampToValueAtTime(100, time + 0.25);
    
    gain.gain.setValueAtTime(0.12, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.25);
    
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    
    osc.start(time);
    osc.stop(time + 0.26);
  }

  playWeaponSelect(time) {
    // Quick double metallic blip
    const playBlip = (t, freq) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.06, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(t);
      osc.stop(t + 0.06);
    };
    
    playBlip(time, 650);
    playBlip(time + 0.06, 800);
  }

  playJump(time) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(250, time);
    // Upward slide
    osc.frequency.exponentialRampToValueAtTime(550, time + 0.15);
    
    gain.gain.setValueAtTime(0.12, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.15);
    
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    
    osc.start(time);
    osc.stop(time + 0.16);
  }

  playBounce(time) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(450, time);
    osc.frequency.exponentialRampToValueAtTime(320, time + 0.08);
    
    gain.gain.setValueAtTime(0.08, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.08);
    
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    
    osc.start(time);
    osc.stop(time + 0.09);
  }

  playShootBazooka(time) {
    // Whoosh + pop
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(300, time);
    osc.frequency.exponentialRampToValueAtTime(80, time + 0.3);
    
    gain.gain.setValueAtTime(0.2, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.35);
    
    // Add white noise for air whoosh
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    
    const noiseFilter = this.ctx.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.setValueAtTime(400, time);
    noiseFilter.frequency.exponentialRampToValueAtTime(100, time + 0.3);
    
    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.15, time);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, time + 0.35);
    
    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(this.ctx.destination);
    
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    
    osc.start(time);
    noise.start(time);
    osc.stop(time + 0.36);
    noise.stop(time + 0.36);
  }

  playShootGrenade(time) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(200, time);
    osc.frequency.exponentialRampToValueAtTime(450, time + 0.18);
    
    gain.gain.setValueAtTime(0.15, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.2);
    
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    
    osc.start(time);
    osc.stop(time + 0.21);
  }

  playExplosion(time, radius) {
    // Low frequency rumble using filtered white noise
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    
    // Giant explosion has deeper frequency cut and longer decay
    const cutoff = radius > 70 ? 120 : 250;
    const decay = radius > 70 ? 1.6 : 0.8;
    const volume = radius > 70 ? 0.45 : 0.3;
    
    filter.frequency.setValueAtTime(cutoff, time);
    filter.frequency.exponentialRampToValueAtTime(10, time + decay);
    
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(volume, time);
    gain.gain.linearRampToValueAtTime(volume * 0.3, time + 0.15); // initial punch
    gain.gain.exponentialRampToValueAtTime(0.001, time + decay);
    
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);
    
    // Add a low sine sub-bass drop oscillator for thud
    const sub = this.ctx.createOscillator();
    const subGain = this.ctx.createGain();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(90, time);
    sub.frequency.linearRampToValueAtTime(20, time + 0.4);
    subGain.gain.setValueAtTime(volume * 1.5, time);
    subGain.gain.exponentialRampToValueAtTime(0.001, time + 0.4);
    
    sub.connect(subGain);
    subGain.connect(this.ctx.destination);
    
    noise.start(time);
    sub.start(time);
    noise.stop(time + decay + 0.1);
    sub.stop(time + 0.5);
  }

  playSplash(time) {
    // Noise bandpassed sliding upward (splash)
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.setValueAtTime(4.0, time);
    filter.frequency.setValueAtTime(600, time);
    filter.frequency.exponentialRampToValueAtTime(1800, time + 0.45);
    
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.25, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.5);
    
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);
    
    noise.start(time);
    noise.stop(time + 0.55);
  }

  playSiren(time) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(350, time);
    
    // Rapid siren wavering modulation
    const mod = this.ctx.createOscillator();
    const modGain = this.ctx.createGain();
    mod.type = 'sine';
    mod.frequency.setValueAtTime(7, time); // 7 cycles/sec
    modGain.gain.setValueAtTime(100, time); // wail pitch depth
    
    mod.connect(modGain);
    modGain.connect(osc.frequency);
    
    gain.gain.setValueAtTime(0.08, time);
    gain.gain.linearRampToValueAtTime(0.08, time + 0.7);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 1.0);
    
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    
    osc.start(time);
    mod.start(time);
    osc.stop(time + 1.1);
    mod.stop(time + 1.1);
  }

  playHallelujah(time) {
    // Generate synthetic major chord: C5 (523.25Hz), E5 (659.25Hz), G5 (783.99Hz), C6 (1046.50Hz)
    const freqs = [523.25, 659.25, 783.99, 1046.50];
    const duration = 0.95;
    
    // Synthesize "Hallelujah!" vocal style envelope
    freqs.forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, time);
      
      // Volume swell to mimic voices: fade in slightly, sustain, release
      gain.gain.setValueAtTime(0.0, time);
      gain.gain.linearRampToValueAtTime(0.04, time + 0.15); // fade-in
      gain.gain.setValueAtTime(0.04, time + 0.65); // sustain
      gain.gain.exponentialRampToValueAtTime(0.001, time + duration); // release
      
      // Vocal resonant filter mapping
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1000 + idx * 100, time); // vocal formant vowel AAH
      filter.Q.setValueAtTime(3.0, time);
      
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);
      
      osc.start(time);
      osc.stop(time + duration + 0.1);
    });
  }

  playFuse(time) {
    // Spark sizzling: modulated highpassed white noise
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(6000, time);
    
    const gain = this.ctx.createGain();
    
    // Sizzling volume envelope: gain is modulated over time
    gain.gain.setValueAtTime(0.08, time);
    gain.gain.linearRampToValueAtTime(0.08, time + 0.8);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 1.0);
    
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);
    
    noise.start(time);
    noise.stop(time + 1.1);
  }

  playBlowtorch(time) {
    // Searing air hiss
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(2500, time);
    filter.Q.setValueAtTime(2.0, time);
    
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.12, time);
    gain.gain.linearRampToValueAtTime(0.12, time + 0.12);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.18);
    
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);
    
    noise.start(time);
    noise.stop(time + 0.2);
  }

  playWormDamage(time) {
    // Cute high pitched cartoon grunt (fast downward sweep)
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(650, time);
    osc.frequency.exponentialRampToValueAtTime(150, time + 0.18);
    
    gain.gain.setValueAtTime(0.15, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.18);
    
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    
    osc.start(time);
    osc.stop(time + 0.19);
  }

  playWormDie(time) {
    // Sad cartoon slide down
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(400, time);
    osc.frequency.linearRampToValueAtTime(80, time + 0.4);
    
    gain.gain.setValueAtTime(0.15, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.4);
    
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    
    osc.start(time);
    osc.stop(time + 0.41);
  }
}
