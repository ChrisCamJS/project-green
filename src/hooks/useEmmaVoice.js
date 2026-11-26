import { useState, useEffect, useRef, useCallback } from 'react';

const FEMALE_GB_HINTS = [
  'sonia',
  'libby',
  'maisie',
  'hazel',
  'serena',
  'stephanie',
  'kate',
  'susan',
  'martha',
  'fiona',
  'female',
];

const MALE_GB_HINTS = ['male', 'george', 'ryan', 'daniel', 'oliver', 'arthur', 'thomas'];

function cleanTextForSpeech(rawText = '') {
  return String(rawText || '')
    .replace(/<RECIPE_IDEAS>[\s\S]*?<\/RECIPE_IDEAS>/gi, '')
    .replace(/<MEAL_PLAN_ACTIONS>[\s\S]*?<\/MEAL_PLAN_ACTIONS>/gi, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[#*`_~]+/g, '')
    .trim();
}

/**
 * Ranks available browser voices to pick the most lifelike British female voice
 * (e.g. Microsoft Sonia/Libby Online Natural, Google UK English Female, Apple Enhanced)
 * over legacy desktop voices.
 */
function pickFemaleBritishVoice(voices = []) {
  if (!Array.isArray(voices) || voices.length === 0) return null;

  const gbVoices = voices.filter((v) =>
    String(v.lang || '').toLowerCase().replace('_', '-').startsWith('en-gb')
  );

  if (gbVoices.length > 0) {
    const scored = gbVoices
      .map((v) => {
        const n = String(v.name || '').toLowerCase();
        const isExplicitMale = MALE_GB_HINTS.some((hint) =>
          new RegExp(`\\b${hint}\\b`, 'i').test(n)
        );
        if (isExplicitMale) return { voice: v, score: -100 };

        let score = 10;
        if (n.includes('natural') || n.includes('neural')) score += 50;
        if (n.includes('online')) score += 25;
        if (n.includes('enhanced') || n.includes('premium')) score += 30;
        if (n.includes('google uk english female')) score += 40;
        if (n.includes('sonia') || n.includes('libby')) score += 25;
        if (FEMALE_GB_HINTS.some((hint) => n.includes(hint))) score += 15;
        if (v.localService === false) score += 10;

        return { voice: v, score };
      })
      .sort((a, b) => b.score - a.score);

    if (scored[0] && scored[0].score > 0) {
      return scored[0].voice;
    }
    return gbVoices[0];
  }

  return voices[0] || null;
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

  const handleSpeak = useCallback(
    (textToRead, sourceKey = null) => {
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

      const cleanText = cleanTextForSpeech(textToRead);
      const textChunks = cleanText.split('\n').filter((line) => line.trim() !== '');
      if (textChunks.length === 0) return;

      window.speechSynthesis.cancel();
      activeKeyRef.current = sourceKey;
      setActiveKey(sourceKey);
      setSpeechState('playing');

      const liveVoices = window.speechSynthesis.getVoices();
      const availableVoices = liveVoices.length > 0 ? liveVoices : voicesRef.current;
      const britishVoice = pickFemaleBritishVoice(availableVoices);

      textChunks.forEach((chunk, index) => {
        const utterance = new SpeechSynthesisUtterance(chunk);
        utterance.lang = 'en-GB';
        if (britishVoice) utterance.voice = britishVoice;
        utterance.rate = 1.02;
        utterance.pitch = 1.0;

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
    },
    [speechState]
  );

  const stopSpeech = useCallback(() => {
    window.speechSynthesis?.cancel();
    activeKeyRef.current = null;
    setActiveKey(null);
    setSpeechState('idle');
  }, []);

  return { speechState, activeKey, handleSpeak, stopSpeech };
};
