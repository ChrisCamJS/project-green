// src/hooks/useAudioStream.js
import { useState, useRef, useCallback } from 'react';

export const useAudioStream = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [audioError, setAudioError] = useState(null);

  const audioContextRef = useRef(null);
  const streamRef = useRef(null);
  const sourceRef = useRef(null);
  const workletNodeRef = useRef(null);

  // We keep the Base64 conversion here in the main thread
  const bufferToBase64 = (buffer) => {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  };

  const startRecording = useCallback(async (onAudioData) => {
    try {
      setAudioError(null);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: 16000, 
      });

      // Fetch our background worker from the public folder
      await audioContextRef.current.audioWorklet.addModule('/recorderWorklet.js');

      sourceRef.current = audioContextRef.current.createMediaStreamSource(stream);
      
      // Instantiate the worklet node by the name we registered
      workletNodeRef.current = new AudioWorkletNode(audioContextRef.current, 'recorder-worklet');

      // Listen for the raw PCM chunks arriving from the background thread
      workletNodeRef.current.port.onmessage = (event) => {
        const base64Audio = bufferToBase64(event.data);
        if (onAudioData) {
          onAudioData(base64Audio);
        }
      };

      // Connect the plumbing
      sourceRef.current.connect(workletNodeRef.current);
      workletNodeRef.current.connect(audioContextRef.current.destination);

      setIsRecording(true);
    } catch (err) {
      console.error("Microphone trouble:", err);
      setAudioError("Failed to access microphone. Please check your permissions, darling.");
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (workletNodeRef.current) {
      workletNodeRef.current.disconnect();
      workletNodeRef.current.port.onmessage = null;
    }
    if (sourceRef.current) {
      sourceRef.current.disconnect();
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
    }

    setIsRecording(false);
  }, []);

  return { startRecording, stopRecording, isRecording, audioError };
};