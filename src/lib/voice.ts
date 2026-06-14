import { useEffect, useRef, useState, useCallback } from 'react';

// Minimal typings for the Web Speech API (not in standard lib.dom yet).
interface SpeechRecognitionResultLike {
  0: { transcript: string };
  isFinal: boolean;
}
interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: { length: number; [i: number]: SpeechRecognitionResultLike };
}
interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}

function getRecognition(): SpeechRecognitionLike | null {
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
  return Ctor ? new Ctor() : null;
}

export function speechSupported(): boolean {
  const w = window as unknown as Record<string, unknown>;
  return Boolean(w.SpeechRecognition || w.webkitSpeechRecognition);
}

/**
 * Speech-to-text hook.
 * - `transcript`: finalized text accumulated so far
 * - `interim`: live (not-yet-final) words
 * - `listening`: mic active
 * - `continuous`: keep listening across pauses (meeting mode) vs single phrase
 */
export function useSpeechToText(opts: { continuous?: boolean } = {}) {
  const { continuous = false } = opts;
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interim, setInterim] = useState('');
  const [error, setError] = useState('');
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const shouldRun = useRef(false);

  const start = useCallback(() => {
    setError('');
    const rec = getRecognition();
    if (!rec) {
      setError('Speech recognition is not supported in this browser. Use Chrome or Edge.');
      return;
    }
    rec.continuous = continuous;
    rec.interimResults = true;
    rec.lang = 'en-US';
    rec.onresult = (e) => {
      let finalChunk = '';
      let interimChunk = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalChunk += r[0].transcript;
        else interimChunk += r[0].transcript;
      }
      if (finalChunk) setTranscript((t) => (t ? t + ' ' : '') + finalChunk.trim());
      setInterim(interimChunk);
    };
    rec.onerror = (ev) => {
      if (ev.error !== 'no-speech' && ev.error !== 'aborted') setError(`Mic error: ${ev.error}`);
    };
    rec.onend = () => {
      // In continuous mode, Chrome still stops after silence — restart if we want to keep going.
      if (shouldRun.current && continuous) {
        try { rec.start(); } catch { /* already started */ }
      } else {
        setListening(false);
      }
    };
    recRef.current = rec;
    shouldRun.current = true;
    try {
      rec.start();
      setListening(true);
    } catch {
      /* ignore double-start */
    }
  }, [continuous]);

  const stop = useCallback(() => {
    shouldRun.current = false;
    recRef.current?.stop();
    setListening(false);
    setInterim('');
  }, []);

  const reset = useCallback(() => {
    setTranscript('');
    setInterim('');
  }, []);

  useEffect(() => () => { shouldRun.current = false; recRef.current?.stop(); }, []);

  return { listening, transcript, interim, error, start, stop, reset, setTranscript };
}

/** Text-to-speech: assistant talks back. */
export function speak(text: string, enabled = true) {
  if (!enabled || !('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text.replace(/[*#`_>]/g, ''));
  u.rate = 1.05;
  u.pitch = 1;
  u.lang = 'en-US';
  window.speechSynthesis.speak(u);
}

export function stopSpeaking() {
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
}

export function ttsSupported(): boolean {
  return 'speechSynthesis' in window;
}