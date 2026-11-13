import type { VoiceSettings } from '../types/assistant';

export interface SpeakingState {
  isSpeaking: boolean;
  label: string;
}

let speakingState: SpeakingState = { isSpeaking: false, label: '' };
const listeners = new Set<(state: SpeakingState) => void>();
let activeAudioCtx: AudioContext | null = null;
let safetyTimer: number | null = null;

function notifyListeners() {
  const snapshot = { ...speakingState };
  listeners.forEach((cb) => cb(snapshot));
}

function setSpeakingState(isSpeaking: boolean, label = '') {
  if (safetyTimer !== null) {
    window.clearTimeout(safetyTimer);
    safetyTimer = null;
  }
  speakingState = { isSpeaking, label: isSpeaking ? label : '' };
  notifyListeners();
}

export function getSpeakingState(): SpeakingState {
  return { ...speakingState };
}

export function subscribeSpeakingState(
  listener: (state: SpeakingState) => void
): () => void {
  listeners.add(listener);
  listener({ ...speakingState });
  return () => {
    listeners.delete(listener);
  };
}

export function playReminderChime(): void {
  try {
    if (activeAudioCtx) {
      activeAudioCtx.close().catch(() => {});
      activeAudioCtx = null;
    }
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();
    activeAudioCtx = ctx;
    const now = ctx.currentTime;

    const notes = [523.25, 659.25, 783.99];
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.11);
      gain.gain.setValueAtTime(0.001, now + idx * 0.11);
      gain.gain.exponentialRampToValueAtTime(0.08, now + idx * 0.11 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.11 + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.11);
      osc.stop(now + idx * 0.11 + 0.38);
    });

    setTimeout(() => {
      if (activeAudioCtx === ctx) {
        activeAudioCtx = null;
      }
      ctx.close().catch(() => {});
    }, 1000);
  } catch {
    // Ignore audio context restrictions before user gesture
  }
}

export function speakText(
  text: string,
  settings: VoiceSettings,
  label = '語音播報中'
): boolean {
  if (!settings.enabled) return false;
  if (settings.playChime) {
    playReminderChime();
  }
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    return false;
  }
  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = settings.lang;
    utterance.rate = settings.rate;
    utterance.pitch = settings.pitch;

    const voices = window.speechSynthesis.getVoices();
    const preferred = voices.find((v) =>
      v.lang.toLowerCase().startsWith(settings.lang.toLowerCase().slice(0, 2))
    );
    if (preferred) {
      utterance.voice = preferred;
    }

    setSpeakingState(true, label);

    utterance.onend = () => {
      setSpeakingState(false, '');
    };
    utterance.onerror = () => {
      setSpeakingState(false, '');
    };

    window.speechSynthesis.speak(utterance);

    // Fallback guard in environments where speechSynthesis does not fire onend
    const estimatedMs = Math.min(45000, Math.max(4000, text.length * 240));
    safetyTimer = window.setTimeout(() => {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window && !window.speechSynthesis.speaking) {
        setSpeakingState(false, '');
      }
    }, estimatedMs);

    return true;
  } catch {
    setSpeakingState(false, '');
    return false;
  }
}

export function stopSpeaking(): void {
  if (activeAudioCtx) {
    activeAudioCtx.close().catch(() => {});
    activeAudioCtx = null;
  }
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    try {
      window.speechSynthesis.cancel();
    } catch {
      // ignore
    }
  }
  setSpeakingState(false, '');
}

export function isSpeechRecognitionSupported(): boolean {
  if (typeof window === 'undefined') return false;
  const w = window as unknown as {
    SpeechRecognition?: unknown;
    webkitSpeechRecognition?: unknown;
  };
  return Boolean(w.SpeechRecognition || w.webkitSpeechRecognition);
}

export function startVoiceDictation(
  lang: string,
  onTranscript: (text: string) => void,
  onError: (message: string) => void,
  onEnd: () => void
): () => void {
  const w = window as unknown as {
    SpeechRecognition?: new () => {
      lang: string;
      interimResults: boolean;
      maxAlternatives: number;
      onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
      onerror: ((e: { error: string }) => void) | null;
      onend: (() => void) | null;
      start: () => void;
      stop: () => void;
    };
    webkitSpeechRecognition?: new () => {
      lang: string;
      interimResults: boolean;
      maxAlternatives: number;
      onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
      onerror: ((e: { error: string }) => void) | null;
      onend: (() => void) | null;
      start: () => void;
      stop: () => void;
    };
  };

  const Rec = w.SpeechRecognition || w.webkitSpeechRecognition;
  if (!Rec) {
    onError('目前瀏覽器不支援即時語音聽寫，請改用文字快速輸入。');
    onEnd();
    return () => {};
  }

  const recognition = new Rec();
  recognition.lang = lang;
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  recognition.onresult = (event) => {
    const transcript = event.results?.[0]?.[0]?.transcript;
    if (transcript) {
      onTranscript(transcript);
    }
  };
  recognition.onerror = (event) => {
    onError(`語音辨識中斷 (${event.error})`);
  };
  recognition.onend = () => {
    onEnd();
  };

  try {
    recognition.start();
  } catch {
    onError('無法啟動麥克風，請確認瀏覽器權限。');
    onEnd();
  }

  return () => {
    try {
      recognition.stop();
    } catch {
      // ignore
    }
  };
}
