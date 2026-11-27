// 소리: 파일 없이 Web Audio로 합성한다(나중에 실제 음원으로 바꿀 땐 play() 안쪽만 갈아 끼우면 됨).
// - 대사 블립: 인물마다 음색·높이가 다르고, 글자(모음)에 따라 높이가 흔들리는 뭉뚱그린 목소리
// - 효과음: 법봉·도장·종이·마이크·이의·판정 등
// 첫 터치/키 입력 전에는 브라우저가 소리를 막으므로 그 전의 요청은 버린다. 어떤 실패도 게임 진행을 막지 않는다.
import { loadSettings, saveSettings, type SoundSettings } from './storage';

export type SfxName =
  | 'gavel' | 'stamp' | 'paperUp' | 'paperDown' | 'mic' | 'interrupt' | 'call' | 'objection'
  | 'ruling' | 'trust' | 'reject' | 'confirm' | 'recall' | 'snag';

type Voice = { wave: OscillatorType; base: number; gain: number; lp: number; dur: number };
/** 화자별 목소리. thought(재판장 속생각)는 작고 부드럽게. */
const VOICES: Record<string, Voice> = {
  judge: { wave: 'triangle', base: 150, gain: 0.11, lp: 1800, dur: 0.06 },
  clerk: { wave: 'sine', base: 260, gain: 0.11, lp: 2200, dur: 0.055 },
  prosecutor: { wave: 'square', base: 190, gain: 0.05, lp: 1300, dur: 0.05 },
  defense: { wave: 'triangle', base: 240, gain: 0.11, lp: 2000, dur: 0.055 },
  witness: { wave: 'sine', base: 330, gain: 0.12, lp: 2400, dur: 0.06 },
  defendant: { wave: 'triangle', base: 205, gain: 0.11, lp: 1500, dur: 0.07 },
  thought: { wave: 'sine', base: 440, gain: 0.035, lp: 1200, dur: 0.09 },
};

let settings: SoundSettings = loadSettings();
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;
let unlocked = false;

export const getSettings = (): SoundSettings => settings;
export function setSettings(patch: Partial<SoundSettings>): void {
  settings = { ...settings, ...patch };
  saveSettings(settings);
}

function ac(): AudioContext | null {
  if (!unlocked) return null;
  try {
    if (!ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      ctx = new Ctor();
      master = ctx.createGain();
      master.gain.value = 0.8;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/** 첫 사용자 입력에서 소리를 연다(모바일 브라우저 정책). */
export function installAudioUnlock(): void {
  const open = () => {
    unlocked = true;
    ac();
    for (const ev of ['pointerdown', 'keydown']) window.removeEventListener(ev, open, true);
  };
  for (const ev of ['pointerdown', 'keydown']) window.addEventListener(ev, open, true);
}

function noise(c: AudioContext): AudioBuffer {
  if (!noiseBuf) {
    noiseBuf = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return noiseBuf;
}

type Env = { at?: number; dur: number; gain: number; attack?: number };

function envelope(c: AudioContext, e: Env): GainNode {
  const g = c.createGain();
  const t = c.currentTime + (e.at ?? 0);
  const a = e.attack ?? 0.004;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(e.gain, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + e.dur);
  g.connect(master!);
  return g;
}

function tone(c: AudioContext, o: Env & { wave?: OscillatorType; f: number; f2?: number; lp?: number }): void {
  const t = c.currentTime + (o.at ?? 0);
  const osc = c.createOscillator();
  osc.type = o.wave ?? 'sine';
  osc.frequency.setValueAtTime(o.f, t);
  if (o.f2) osc.frequency.exponentialRampToValueAtTime(o.f2, t + o.dur);
  let out: AudioNode = osc;
  if (o.lp) {
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = o.lp;
    osc.connect(f);
    out = f;
  }
  out.connect(envelope(c, o));
  osc.start(t);
  osc.stop(t + o.dur + 0.02);
}

function hiss(c: AudioContext, o: Env & { type?: BiquadFilterType; freq: number; q?: number }): void {
  const t = c.currentTime + (o.at ?? 0);
  const src = c.createBufferSource();
  src.buffer = noise(c);
  const f = c.createBiquadFilter();
  f.type = o.type ?? 'lowpass';
  f.frequency.value = o.freq;
  f.Q.value = o.q ?? 0.7;
  src.connect(f);
  f.connect(envelope(c, o));
  src.start(t, Math.random() * 0.5);
  src.stop(t + o.dur + 0.02);
}

const SFX: Record<SfxName, (c: AudioContext, v: number) => void> = {
  gavel: (c, v) => { hiss(c, { dur: 0.09, gain: 0.5 * v, freq: 1400 }); tone(c, { dur: 0.2, gain: 0.55 * v, f: 120, f2: 55 }); },
  stamp: (c, v) => { tone(c, { dur: 0.16, gain: 0.6 * v, f: 95, f2: 50 }); hiss(c, { dur: 0.1, gain: 0.35 * v, freq: 700 }); },
  paperUp: (c, v) => hiss(c, { type: 'bandpass', dur: 0.2, gain: 0.14 * v, attack: 0.05, freq: 2600, q: 0.6 }),
  paperDown: (c, v) => hiss(c, { type: 'bandpass', dur: 0.14, gain: 0.1 * v, attack: 0.02, freq: 1800, q: 0.6 }),
  mic: (c, v) => {
    hiss(c, { type: 'highpass', dur: 0.025, gain: 0.22 * v, freq: 3000 });
    tone(c, { dur: 0.07, gain: 0.3 * v, f: 190, f2: 120 });
    tone(c, { at: 0.07, dur: 0.06, gain: 0.07 * v, f: 1200 });
  },
  interrupt: (c, v) => {
    SFX.mic(c, v);
    tone(c, { at: 0.04, wave: 'sawtooth', dur: 0.14, gain: 0.12 * v, f: 130, f2: 100, lp: 700 });
  },
  call: (c, v) => { tone(c, { dur: 0.07, gain: 0.1 * v, f: 1000 }); tone(c, { at: 0.11, dur: 0.07, gain: 0.1 * v, f: 1000 }); },
  objection: (c, v) => { tone(c, { dur: 0.09, gain: 0.2 * v, f: 660 }); tone(c, { at: 0.1, dur: 0.14, gain: 0.2 * v, f: 880 }); },
  ruling: (c, v) => { hiss(c, { dur: 0.07, gain: 0.35 * v, freq: 1400 }); tone(c, { dur: 0.15, gain: 0.4 * v, f: 130, f2: 70 }); },
  trust: (c, v) => { tone(c, { dur: 0.09, gain: 0.12 * v, f: 660, wave: 'triangle' }); tone(c, { at: 0.07, dur: 0.12, gain: 0.12 * v, f: 880, wave: 'triangle' }); },
  reject: (c, v) => { tone(c, { dur: 0.14, gain: 0.15 * v, f: 300, f2: 210, wave: 'triangle' }); hiss(c, { dur: 0.05, gain: 0.1 * v, freq: 500 }); },
  confirm: (c, v) => {
    SFX.gavel(c, v);
    [392, 494, 587].forEach((f, i) => tone(c, { at: 0.12 + i * 0.02, dur: 0.5, gain: 0.08 * v, f, lp: 2000 }));
  },
  recall: (c, v) => tone(c, { dur: 0.4, gain: 0.08 * v, attack: 0.05, f: 900, f2: 280, lp: 1500 }),
  snag: (c, v) => { hiss(c, { type: 'bandpass', dur: 0.035, gain: 0.25 * v, freq: 1500, q: 1.5 }); tone(c, { dur: 0.06, gain: 0.2 * v, f: 150, f2: 110, wave: 'triangle' }); },
};

/** 효과음. 설정에서 꺼져 있거나 소리가 아직 안 열렸으면 조용히 무시. */
export function play(name: SfxName, volume = 1): void {
  if (!settings.sfx) return;
  const c = ac();
  if (!c) return;
  try { SFX[name](c, volume); } catch { /* 소리 실패는 무시 */ }
}

/** 한글 모음(중성) 번호 0~20 → 반음 높이. 같은 글자는 늘 같은 음이라 뭉뚱그린 말소리처럼 들린다. */
function semitone(ch: string): number {
  const code = ch.charCodeAt(0) - 0xac00;
  if (code >= 0 && code < 11172) return ([0, 2, 4, 5, 7, 9, 11] as const)[Math.floor(code / 28) % 21 % 7] - 4;
  return (ch.charCodeAt(0) % 5) - 2;
}

/** 대사 한 글자에 대한 블립. */
export function blip(speaker: string, ch: string): void {
  if (!settings.voice) return;
  const c = ac();
  if (!c) return;
  const v = VOICES[speaker] ?? VOICES.clerk;
  try {
    tone(c, { wave: v.wave, dur: v.dur, gain: v.gain, attack: 0.006, f: v.base * 2 ** (semitone(ch) / 12), lp: v.lp });
  } catch { /* 무시 */ }
}
