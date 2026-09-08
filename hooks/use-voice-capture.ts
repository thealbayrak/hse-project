"use client";

import { useEffect, useRef, useState } from "react";

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
  const types = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
  return types.find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
}

export function useVoiceCapture(onTranscript: (text: string) => void) {
  const [recording, setRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [audioSupported, setAudioSupported] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const keepAliveRef = useRef(false);

  useEffect(() => {
    setSpeechSupported(Boolean(getSpeechRecognition()));
    setAudioSupported(typeof MediaRecorder !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia));
    return () => stopInternal();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function stopInternal() {
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
  }

  async function start() {
    keepAliveRef.current = true;
    setRecording(true);
    chunksRef.current = [];

    const SpeechRecognition = getSpeechRecognition();
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.lang = "en-GB";
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.onresult = (event) => {
        let text = "";
        for (let i = event.resultIndex; i < event.results.length; i += 1) {
          text += event.results[i][0].transcript;
        }
        if (text.trim()) onTranscript(text.trim());
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
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
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
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        if (blob.size > 0) setAudioBlob(blob);
      };
      recorder.start();
    }
  }

  async function toggle() {
    if (recording) {
      stopInternal();
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
