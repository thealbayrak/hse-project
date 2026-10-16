"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

type SpeechRecognitionCtor = new () => SpeechRecognition;

interface SpeechRecognition extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
}

interface SpeechRecognitionEvent {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: {
      isFinal: boolean;
      0: { transcript: string };
    };
  };
}

function getSpeechRecognition(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const speechWindow = window as Window & {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition ?? null;
}

function pickAudioMimeType() {
  if (typeof MediaRecorder === "undefined") return "";
  const types = ["audio/mp4", "audio/aac", "audio/webm;codecs=opus", "audio/webm"];
  return types.find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
}

// Browser capabilities never change during a session, so they are read as an
// external store: "false" on the server, the real value once hydrated.
const noopSubscribe = () => () => {};
const readSpeechSupported = () => Boolean(getSpeechRecognition());
const readAudioSupported = () =>
  typeof MediaRecorder !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia);
const serverFalse = () => false;

export function useVoiceCapture(
  onTranscript: (text: string) => void,
  locale: "en" | "sv" = "en"
) {
  const [recording, setRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const speechSupported = useSyncExternalStore(noopSubscribe, readSpeechSupported, serverFalse);
  const audioSupported = useSyncExternalStore(noopSubscribe, readAudioSupported, serverFalse);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const keepAliveRef = useRef(false);
  const localeRef = useRef(locale);
  const transcriptRef = useRef(onTranscript);

  useEffect(() => {
    localeRef.current = locale;
    transcriptRef.current = onTranscript;
  });

  const stop = useCallback(() => {
    keepAliveRef.current = false;
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
    recorderRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setRecording(false);
  }, []);

  useEffect(() => stop, [stop]);

  async function start() {
    keepAliveRef.current = true;
    chunksRef.current = [];

    try {
      const SpeechRecognition = getSpeechRecognition();
      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.lang = localeRef.current === "sv" ? "sv-SE" : "en-GB";
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.onresult = (event) => {
          let text = "";
          for (let i = event.resultIndex; i < event.results.length; i += 1) {
            text += event.results[i][0].transcript;
          }
          if (text.trim()) transcriptRef.current(text.trim());
        };
        recognition.onerror = () => undefined;
        recognition.onend = () => {
          if (keepAliveRef.current) {
            try {
              recognition.start();
            } catch {
              // Already started.
            }
          }
        };
        recognitionRef.current = recognition;
        try {
          recognition.start();
        } catch {
          // Ignore duplicate start.
        }
      }

      if (navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== "undefined") {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
          },
        });
        streamRef.current = stream;
        const mimeType = pickAudioMimeType();
        const recorder = mimeType
          ? new MediaRecorder(stream, { mimeType })
          : new MediaRecorder(stream);
        recorderRef.current = recorder;
        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) chunksRef.current.push(event.data);
        };
        recorder.onstop = () => {
          const blob = new Blob(chunksRef.current, {
            type: recorder.mimeType || mimeType || "audio/mp4",
          });
          if (blob.size > 0) setAudioBlob(blob);
        };
        recorder.start();
      }

      setRecording(true);
    } catch (error) {
      stop();
      throw error;
    }
  }

  async function toggle() {
    if (recording) {
      stop();
      return;
    }
    await start();
  }

  return {
    recording,
    audioBlob,
    speechSupported,
    audioSupported,
    supported: speechSupported || audioSupported,
    toggle,
    clearAudio: () => setAudioBlob(null),
  };
}
