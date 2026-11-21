import { useState, useEffect, useRef, useCallback } from 'react';

const FEMALE_GB_HINTS = [
  'female',
  'libby',
  'sonia',
  'hazel',
  'susan',
  'kate',
  'serena',
  'martha',
  'fiona',
  'stephanie',
];

const MALE_GB_HINTS = ['male', 'george', 'ryan', 'daniel', 'oliver', 'arthur', 'thomas'];

function pickFemaleBritishVoice(voices = []) {
  if (!Array.isArray(voices) || voices.length === 0) return null;

  const gbVoices = voices.filter((v) =>
    String(v.lang || '').toLowerCase().replace('_', '-').startsWith('en-gb')
  );

  // 1. Exact female British match (e.g. Google UK English Female, Microsoft Libby/Sonia/Hazel)
  const explicitFemaleGb = gbVoices.find((v) => {
    const n = String(v.name || '').toLowerCase();
    return FEMALE_GB_HINTS.some((hint) => n.includes(hint)) && !n.includes('male');
  });
  if (explicitFemaleGb) return explicitFemaleGb;

  // 2. Any British voice that is not explicitly male
  const nonMaleGb = gbVoices.find((v) => {
    const n = String(v.name || '').toLowerCase();
    return !MALE_GB_HINTS.some((hint) => new RegExp(`\\b${hint}\\b`, 'i').test(n));
  });
  if (nonMaleGb) return nonMaleGb;

  // 3. Fallback to any en-GB voice or first available voice
  return gbVoices[0] || voices[0] || null;
}

export const useEmmaVoice = () => {
  const [speechState, setSpeechState] = useState('idle');
  const [activeKey, setActiveKey] = useState(null);
  const voicesRef = useRef([]);
  const activeKeyRef = useRef(null);

  useEffect(() => {
    const synth = window.speechSynthesis;
    if (!synth) return undefined;

    const loadVoices = () => {
      const list = synth.getVoices();
      if (Array.isArray(list) && list.length > 0) {
        voicesRef.current = list;
      }
    };

    loadVoices();
    synth.addEventListener?.('voiceschanged', loadVoices);

    return () => {
      synth.removeEventListener?.('voiceschanged', loadVoices);
      synth.cancel();
      setSpeechState('idle');
    };
  }, []);

  const handleSpeak = (textToRead, sourceKey = null) => {
    if (!textToRead || !window.speechSynthesis) return;

    const isSameSource =
      sourceKey !== null && activeKeyRef.current === sourceKey;
    const shouldToggleCurrent = sourceKey === null || isSameSource;

    if (shouldToggleCurrent && speechState === 'playing') {
      window.speechSynthesis.pause();
      setSpeechState('paused');
      return;
    }
    if (shouldToggleCurrent && speechState === 'paused') {
      window.speechSynthesis.resume();
      setSpeechState('playing');
      return;
    }

    window.speechSynthesis.cancel();
    activeKeyRef.current = sourceKey;
    setActiveKey(sourceKey);
    setSpeechState('playing');

    const cleanText = textToRead
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/[#*`_]/g, '');
    const textChunks = cleanText.split('\n').filter((line) => line.trim() !== '');

    const liveVoices = window.speechSynthesis.getVoices();
    const availableVoices = liveVoices.length > 0 ? liveVoices : voicesRef.current;
    const britishVoice = pickFemaleBritishVoice(availableVoices);

    textChunks.forEach((chunk, index) => {
      const utterance = new SpeechSynthesisUtterance(chunk);
      utterance.lang = 'en-GB';
      if (britishVoice) utterance.voice = britishVoice;
      utterance.rate = 1.05;
      utterance.pitch = 1.1;

      if (index === textChunks.length - 1) {
        utterance.onend = () => {
          activeKeyRef.current = null;
          setActiveKey(null);
          setSpeechState('idle');
        };
      }
      utterance.onerror = () => {
        activeKeyRef.current = null;
        setActiveKey(null);
        setSpeechState('idle');
      };

      window.speechSynthesis.speak(utterance);
    });
  };

  const stopSpeech = useCallback(() => {
    window.speechSynthesis?.cancel();
    activeKeyRef.current = null;
    setActiveKey(null);
    setSpeechState('idle');
  }, []);

  return { speechState, activeKey, handleSpeak, stopSpeech };
};
