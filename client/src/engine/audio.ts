export class AudioManager {
  private ctx: AudioContext | null = null;
  private snapBuffer: AudioBuffer | null = null;
  private enabled: boolean = true;
  private volume: number = 0.5;

  constructor() {
    // Lazy init on first interaction
  }

  public setEnabled(enabled: boolean) {
    this.enabled = enabled;
  }

  public setVolume(volume: number) {
    this.volume = Math.max(0, Math.min(1, volume));
  }

  public async init() {
    if (this.ctx) return;
    
    try {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      
      // Synthesize a simple snap sound (short high-pitch click)
      // Since we can't load external files easily without user upload
      const sampleRate = this.ctx.sampleRate;
      const length = 0.1 * sampleRate; // 100ms
      const buffer = this.ctx.createBuffer(1, length, sampleRate);
      const data = buffer.getChannelData(0);
      
      for (let i = 0; i < length; i++) {
        // Exponential decay noise/click
        const t = i / length;
        const noise = (Math.random() * 2 - 1) * Math.exp(-t * 10);
        data[i] = noise;
      }
      
      this.snapBuffer = buffer;
    } catch (e) {
      console.warn('AudioContext not supported');
    }
  }

  public playSnap() {
    if (!this.enabled || !this.ctx || !this.snapBuffer) return;
    
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }

    const source = this.ctx.createBufferSource();
    source.buffer = this.snapBuffer;
    
    const gain = this.ctx.createGain();
    gain.gain.value = this.volume;
    
    source.connect(gain);
    gain.connect(this.ctx.destination);
    
    source.start(0);
  }
}

export const audioManager = new AudioManager();
