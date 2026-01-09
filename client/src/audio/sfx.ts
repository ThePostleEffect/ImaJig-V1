let audioContext: AudioContext | null = null;
let placementBuffer: AudioBuffer | null = null;
let celebrationBuffer: AudioBuffer | null = null;
let preloadPromise: Promise<void> | null = null;
let warned = false;

function warnOnce(message: string, err?: unknown) {
  if (warned) return;
  warned = true;
  // eslint-disable-next-line no-console
  console.warn(message, err);
}

export function initSfx(): void {
  if (audioContext) return;

  const Ctx = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext | undefined;
  if (!Ctx) {
    warnOnce('[sfx] Web Audio API not available');
    return;
  }

  try {
    audioContext = new Ctx();
  } catch (err) {
    warnOnce('[sfx] Failed to create AudioContext', err);
    audioContext = null;
  }
}

export async function unlockSfx(): Promise<void> {
  initSfx();
  if (!audioContext) return;

  // Browsers require a user gesture before audio can start.
  if (audioContext.state === 'suspended') {
    try {
      await audioContext.resume();
    } catch (err) {
      // Some browsers may still block resume; don't throw.
      warnOnce('[sfx] Failed to resume AudioContext', err);
    }
  }
}

export function preloadSfx(): Promise<void> {
  if (placementBuffer && celebrationBuffer) return Promise.resolve();
  if (preloadPromise) return preloadPromise;

  initSfx();
  if (!audioContext) {
    preloadPromise = Promise.resolve();
    return preloadPromise;
  }

  preloadPromise = (async () => {
    const ctx = audioContext!;
    
    // Helper to load and decode audio
    const loadSound = async (url: string): Promise<AudioBuffer | null> => {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.arrayBuffer();
        
        const buffer = await new Promise<AudioBuffer>((resolve, reject) => {
          const p = ctx.decodeAudioData(data, resolve, reject);
          if (p && typeof (p as any).then === 'function') {
            (p as Promise<AudioBuffer>).then(resolve).catch(reject);
          }
        });
        return buffer;
      } catch (err) {
        warnOnce(`[sfx] Failed to load ${url}`, err);
        return null;
      }
    };
    
    // Load both sounds in parallel
    const [placement, celebration] = await Promise.all([
      placementBuffer ? Promise.resolve(placementBuffer) : loadSound('/sfx/piece-placement.wav?v=2'),
      celebrationBuffer ? Promise.resolve(celebrationBuffer) : loadSound('/sfx/puzzle-complete.wav?v=1'),
    ]);
    
    placementBuffer = placement;
    celebrationBuffer = celebration;
  })();

  return preloadPromise;
}

export function playPlacementSfx(volume = 1): void {
  if (!audioContext || !placementBuffer) return;

  try {
    const src = audioContext.createBufferSource();
    src.buffer = placementBuffer;

    const gain = audioContext.createGain();
    gain.gain.value = Math.max(0, Math.min(1, volume));

    src.connect(gain);
    gain.connect(audioContext.destination);

    src.start(0);
  } catch (err) {
    warnOnce('[sfx] Failed to play placement SFX', err);
  }
}

export function playCelebrationSfx(volume = 1): void {
  if (!audioContext || !celebrationBuffer) return;

  try {
    const src = audioContext.createBufferSource();
    src.buffer = celebrationBuffer;

    const gain = audioContext.createGain();
    gain.gain.value = Math.max(0, Math.min(1, volume));

    src.connect(gain);
    gain.connect(audioContext.destination);

    src.start(0);
  } catch (err) {
    warnOnce('[sfx] Failed to play celebration SFX', err);
  }
}
