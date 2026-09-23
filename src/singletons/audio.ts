/**
 * Sound effects. One shared AudioContext; each clip is fetched and decoded once, then played from memory so rapid
 * repeats (the charge button) overlap freely with no latency.
 *
 * Browsers refuse to start audio until the page has been interacted with, so nothing plays until the first
 * pointer/key event (this also keeps load-time work such as dev skips silent). The clip bytes are fetched at
 * startup, which needs no gesture, so the first play only waits on decoding.
 *
 * This module deliberately does not import the store (redux modules call play(), and the store imports them);
 * index.jsx pushes the sound setting in via setEnabled.
 */

interface PlayOptions {
    /** 0..1, multiplied with the master volume (default 1) */
    volume?: number;
    /** pitch/speed multiplier (default 1) */
    playbackRate?: number;
    /** random +/- spread applied to playbackRate so repeated plays don't sound identical (default 0) */
    rateJitter?: number;
}

interface Clip extends PlayOptions {
    /** path under public/sfx (Vite copies that folder to the site root untouched) */
    file: string;
}

// Each clip is the file plus how it's played by default; play() call sites can override any option.
// Files keep their original names under a source/pack folder so their origin is obvious.
// Register a new sound by adding a line here and dropping the file in that folder.
const CLIPS = {
    click: { file: 'kenney/ui/mouseclick1.ogg', rateJitter: 0.05, volume: 0.15 },
    researchStart: { file: 'kenney/interface/question_002.ogg', volume: 0.3 },
    // researchFinish: { file: 'kenney/sci-fi/forceField_000.ogg', volume: 0.3 },
    // researchFinish: { file: 'kenney/interface/confirmation_001.ogg', volume: 0.3 },
    researchFinish: { file: 'kenney/interface/maximize_006.ogg', volume: 0.3 },
    build: { file: 'kenney/impact/impactMining_000.ogg', volume: 0.5 },
    castStart: { file: 'kenney/interface/click_002.ogg', volume: 0.3 }, // ability defaults; a record can name its own
    castFinish: { file: 'kenney/interface/confirmation_004.ogg', volume: 0.2 },
    chargeMineralProc: { file: 'kenney/interface/confirmation_003.ogg', volume: 0.4 }, // charge click that also finds a mineral
    logFlash: { file: 'kenney/interface/select_007.ogg', volume: 0.3 },
    // logTypingTick: { file: 'kenney/interface/click_003.ogg', volume: 0.15, rateJitter: 0.2 },
    // logProgressTick: { file: 'kenney/interface/bong_001.ogg', volume: 0.15 },
} as const satisfies Record<string, Clip>;
export type SfxName = keyof typeof CLIPS;

let enabled = true;
let unlocked = false; // set by the first user gesture; before that the browser would keep the context suspended
let context: AudioContext | null = null;
let masterGain: GainNode | null = null;
const bytes: Partial<Record<SfxName, Promise<ArrayBuffer | null>>> = {};
const buffers: Partial<Record<SfxName, AudioBuffer | null>> = {};

if (typeof window !== 'undefined') {
    const unlock = () => {
        unlocked = true;
        window.removeEventListener('pointerdown', unlock);
        window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
}

/** Mirrors the soundEnabled game setting (index.jsx keeps it in sync with the store) */
export function setEnabled(value: boolean) {
    enabled = value;
}

// A separate switch from `enabled` (which the store keeps re-syncing) for the hidden-tab catch-up: it replays
// hours of research finishes and casts in a moment, none of which should be heard.
let suppressed = false;
export function setSuppressed(value: boolean) {
    suppressed = value;
}


function fetchBytes(name: SfxName): Promise<ArrayBuffer | null> {
    if (!bytes[name]) {
        // Relative URL so it resolves under the GitHub Pages subpath as well as the dev server root
        bytes[name] = fetch(`sfx/${CLIPS[name].file}`)
            .then(response => {
                if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
                return response.arrayBuffer();
            })
            .catch(err => {
                console.warn(`Could not load sound "${name}" (public/sfx/${CLIPS[name].file}):`, err);
                return null;
            });
    }
    return bytes[name]!;
}

function getContext(): AudioContext {
    if (!context) {
        context = new AudioContext();
        masterGain = context.createGain();
        masterGain.connect(context.destination);
    }
    if (context.state === 'suspended') {
        context.resume();
    }
    return context;
}

async function getBuffer(name: SfxName): Promise<AudioBuffer | null> {
    if (buffers[name] !== undefined) return buffers[name]!;
    const data = await fetchBytes(name);
    if (data === null) {
        buffers[name] = null;
        return null;
    }
    try {
        buffers[name] = await getContext().decodeAudioData(data.slice(0));
    } catch (err) {
        console.warn(`Could not decode sound "${name}":`, err);
        buffers[name] = null;
    }
    return buffers[name]!;
}

/** Fetch clip bytes ahead of time so the first play isn't delayed by the network. Call at startup. */
export function preload(...names: SfxName[]) {
    (names.length ? names : Object.keys(CLIPS) as SfxName[]).forEach(fetchBytes);
}

export function play(name: SfxName, overrides: PlayOptions = {}) {
    if (!enabled || !unlocked || suppressed) return;
    const options: PlayOptions = { ...CLIPS[name], ...overrides };

    const ctx = getContext();
    const buffer = buffers[name];
    if (buffer === undefined) {
        // Not decoded yet (first play): decode, then play. A few ms late, but only once per clip.
        getBuffer(name).then(decoded => { if (decoded) start(ctx, decoded, options); });
        return;
    }
    if (buffer) start(ctx, buffer, options);
}

function start(ctx: AudioContext, buffer: AudioBuffer, options: PlayOptions) {
    const source = ctx.createBufferSource();
    source.buffer = buffer;

    const jitter = options.rateJitter ?? 0;
    source.playbackRate.value = (options.playbackRate ?? 1) + (Math.random() * 2 - 1) * jitter;

    const gain = ctx.createGain();
    gain.gain.value = options.volume ?? 1;
    source.connect(gain);
    gain.connect(masterGain!);
    source.start();
}
