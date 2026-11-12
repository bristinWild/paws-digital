let ctx = null, master = null, hiss = null, rainGain = null, unlocked = false, muted = false;
try {
    muted = localStorage.getItem("paws.sound") === "off";
}
catch { }
/** Browsers only start audio after a gesture; until then every cue is dropped. */
export function unlock() {
    unlocked = true;
    if (ctx?.state === "suspended")
        void ctx.resume();
}
export const isMuted = () => muted;
export function setMuted(off) {
    muted = off;
    try {
        localStorage.setItem("paws.sound", off ? "off" : "on");
    }
    catch { }
    if (master && ctx)
        master.gain.setTargetAtTime(off ? 0 : 0.9, ctx.currentTime, 0.03);
}
function audio() {
    if (!unlocked || muted)
        return null;
    if (!ctx) {
        const Ctor = window.AudioContext ??
            window
                .webkitAudioContext;
        if (!Ctor)
            return null;
        ctx = new Ctor();
        master = ctx.createGain();
        master.gain.value = 0.9;
        master.connect(ctx.destination);
        hiss = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
        const data = hiss.getChannelData(0);
        for (let i = 0; i < data.length; i++)
            data[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === "suspended")
        void ctx.resume();
    return ctx;
}
/** One enveloped oscillator note; `to` glides the pitch. */
function tone(at, freq, dur, vol = 0.16, type = "sine", to = freq) {
    const c = ctx, osc = c.createOscillator(), gain = c.createGain(), t = c.currentTime + at;
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (to !== freq)
        osc.frequency.exponentialRampToValueAtTime(to, t + dur);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(vol, t + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain).connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.03);
}
/** A filtered burst of noise: clicks, rustles, thuds and wind. */
function noise(at, dur, vol, freq, kind = "bandpass", to = freq) {
    const c = ctx, src = c.createBufferSource(), filter = c.createBiquadFilter(), gain = c.createGain(), t = c.currentTime + at;
    src.buffer = hiss;
    filter.type = kind;
    filter.frequency.setValueAtTime(freq, t);
    if (to !== freq)
        filter.frequency.exponentialRampToValueAtTime(to, t + dur);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter).connect(gain).connect(master);
    src.start(t, Math.random());
    src.stop(t + dur + 0.03);
}
const RECIPES = {
    tap: () => tone(0, 620, 0.05, 0.07, "triangle", 760),
    pick: () => {
        tone(0, 520, 0.07, 0.11, "triangle", 700);
        noise(0, 0.05, 0.05, 3200);
    },
    dice: () => {
        for (const [at, f] of [
            [0, 2400],
            [0.06, 3100],
            [0.13, 2700],
            [0.21, 3500],
        ])
            noise(at, 0.035, 0.16, f);
    },
    drop: () => {
        tone(0, 190, 0.14, 0.22, "sine", 95);
        noise(0, 0.05, 0.12, 1800);
    },
    place: () => {
        tone(0, 230, 0.16, 0.2, "sine", 130);
        tone(0.07, 680, 0.09, 0.09, "triangle", 900);
        noise(0, 0.06, 0.08, 1400);
    },
    munch: () => {
        noise(0, 0.09, 0.2, 900, "lowpass");
        noise(0.14, 0.09, 0.18, 800, "lowpass");
        tone(0.26, 440, 0.12, 0.07, "triangle", 620);
    },
    coin: () => {
        tone(0, 988, 0.08, 0.12, "square");
        tone(0.07, 1319, 0.32, 0.12, "square");
    },
    tile: () => {
        noise(0, 0.04, 0.2, 4200, "highpass");
        tone(0.01, 310, 0.1, 0.16, "sine", 220);
    },
    whoosh: () => noise(0, 0.28, 0.14, 500, "bandpass", 2600),
    voice: () => {
        tone(0, 330, 0.09, 0.08, "triangle", 370);
        tone(0.11, 415, 0.11, 0.08, "triangle", 392);
    },
    bell: () => {
        tone(0, 880, 0.7, 0.11);
        tone(0, 1320, 0.5, 0.06);
    },
    stamp: () => {
        tone(0, 120, 0.22, 0.34, "sine", 52);
        noise(0, 0.12, 0.26, 420, "lowpass");
    },
    fanfare: () => {
        [523, 659, 784, 1047].forEach((f, i) => tone(i * 0.09, f, i === 3 ? 0.5 : 0.14, 0.13, "triangle"));
        tone(0.27, 1568, 0.4, 0.05);
    },
    win: () => {
        [523, 659, 784, 659, 784, 1047, 1319].forEach((f, i) => tone(i * 0.12, f, i === 6 ? 0.9 : 0.17, 0.13, "triangle"));
        tone(0.72, 523, 0.9, 0.08);
    },
    lose: () => {
        tone(0, 392, 0.3, 0.1, "triangle", 370);
        tone(0.28, 330, 0.5, 0.1, "triangle", 294);
    },
    buzz: () => tone(0, 150, 0.16, 0.08, "sawtooth", 120),
    // A carried piece catches on a place that will take it: barely there.
    magnet: () => tone(0, 880, 0.035, 0.04, "sine", 1180),
    // ... and is let go there: a click and a soft thud.
    snap: () => {
        noise(0, 0.018, 0.2, 3800, "highpass");
        tone(0, 300, 0.09, 0.2, "sine", 150);
        tone(0.03, 940, 0.05, 0.06, "triangle", 1240);
    },
    // One more step of a lesson done: two small notes going up.
    step: () => {
        tone(0, 660, 0.07, 0.07, "triangle");
        tone(0.07, 880, 0.12, 0.07, "triangle");
    },
    thunder: () => {
        noise(0, 1.8, 0.5, 160, "lowpass", 60);
        noise(0.05, 0.3, 0.2, 900, "lowpass", 200);
    },
};
export const CUES = Object.keys(RECIPES);
/** Plays a cue; false when sound is off, locked or the recipe failed. */
export function play(cue) {
    if (!audio())
        return false;
    try {
        RECIPES[cue]();
        return true;
    }
    catch {
        return false;
    }
}
/** Looping rain bed: 0 silent, 1 drizzle, 2 storm. */
export function rain(level) {
    if (!level && !rainGain)
        return;
    const c = audio() ?? ctx;
    if (!c || !master || !hiss)
        return;
    if (!rainGain) {
        const src = c.createBufferSource(), filter = c.createBiquadFilter();
        src.buffer = hiss;
        src.loop = true;
        filter.type = "bandpass";
        filter.frequency.value = 2100;
        filter.Q.value = 0.4;
        rainGain = c.createGain();
        rainGain.gain.value = 0;
        src.connect(filter).connect(rainGain).connect(master);
        src.start();
    }
    rainGain.gain.setTargetAtTime([0, 0.035, 0.1][level] ?? 0, c.currentTime, 0.6);
}
