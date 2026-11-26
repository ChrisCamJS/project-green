import { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../services/api';

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

// Session-wide in-memory cache mapping cleaned text -> blob object URL
const MAX_TTS_CACHE_ENTRIES = 25;
const ttsObjectUrlCache = new Map();

function cacheTtsObjectUrl(key, objectUrl) {
  if (ttsObjectUrlCache.has(key)) {
    return;
  }
  if (ttsObjectUrlCache.size >= MAX_TTS_CACHE_ENTRIES) {
    const oldestKey = ttsObjectUrlCache.keys().next().value;
    const oldestUrl = ttsObjectUrlCache.get(oldestKey);
    ttsObjectUrlCache.delete(oldestKey);
    if (oldestUrl) {
      try {
        URL.revokeObjectURL(oldestUrl);
      } catch {
        // Ignore revoke errors
      }
    }
  }
  ttsObjectUrlCache.set(key, objectUrl);
}

function base64ToBlobUrl(base64Data, mimeType = 'audio/wav') {
  const binaryStr = window.atob(base64Data);
  const len = binaryStr.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i += 1) {
    bytes[i] = binaryStr.charCodeAt(i);
  }
  const blob = new Blob([bytes], { type: mimeType });
  return URL.createObjectURL(blob);
}

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
 * when falling back to Web Speech API.
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
  const audioRef = useRef(null);
  const activeBackendRef = useRef(null); // 'audio' | 'synth' | null
  const requestSeqRef = useRef(0);

  const cleanupAudioElement = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.onended = null;
      audio.onerror = null;
      try {
        audio.pause();
        audio.currentTime = 0;
      } catch {
        // Ignore audio element stop errors
      }
      audioRef.current = null;
    }
  }, []);

  const stopSpeech = useCallback(() => {
    requestSeqRef.current += 1;
    cleanupAudioElement();
    window.speechSynthesis?.cancel();
    activeBackendRef.current = null;
    activeKeyRef.current = null;
    setActiveKey(null);
    setSpeechState('idle');
  }, [cleanupAudioElement]);

  useEffect(() => {
    const synth = window.speechSynthesis;
    const loadVoices = () => {
      if (!synth) return;
      const list = synth.getVoices();
      if (Array.isArray(list) && list.length > 0) {
        voicesRef.current = list;
      }
    };

    if (synth) {
      loadVoices();
      synth.addEventListener?.('voiceschanged', loadVoices);
    }

    return () => {
      requestSeqRef.current += 1;
      cleanupAudioElement();
      if (synth) {
        synth.removeEventListener?.('voiceschanged', loadVoices);
        synth.cancel();
      }
      setSpeechState('idle');
    };
  }, [cleanupAudioElement]);

  const speakWithBrowserFallback = useCallback((cleanText, mySeq) => {
    if (!window.speechSynthesis || requestSeqRef.current !== mySeq) {
      activeBackendRef.current = null;
      activeKeyRef.current = null;
      setActiveKey(null);
      setSpeechState('idle');
      return;
    }

    window.speechSynthesis.cancel();
    activeBackendRef.current = 'synth';

    const textChunks = cleanText.split('\n').filter((line) => line.trim() !== '');
    if (textChunks.length === 0) {
      activeBackendRef.current = null;
      activeKeyRef.current = null;
      setActiveKey(null);
      setSpeechState('idle');
      return;
    }

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
          if (requestSeqRef.current !== mySeq) return;
          activeBackendRef.current = null;
          activeKeyRef.current = null;
          setActiveKey(null);
          setSpeechState('idle');
        };
      }
      utterance.onerror = () => {
        if (requestSeqRef.current !== mySeq) return;
        activeBackendRef.current = null;
        activeKeyRef.current = null;
        setActiveKey(null);
        setSpeechState('idle');
      };

      window.speechSynthesis.speak(utterance);
    });
  }, []);

  const playHtmlAudioUrl = useCallback(
    (objectUrl, cleanText, mySeq) => {
      if (requestSeqRef.current !== mySeq) return;
      cleanupAudioElement();

      const audio = new Audio(objectUrl);
      audioRef.current = audio;
      activeBackendRef.current = 'audio';

      audio.onended = () => {
        if (requestSeqRef.current !== mySeq) return;
        cleanupAudioElement();
        activeBackendRef.current = null;
        activeKeyRef.current = null;
        setActiveKey(null);
        setSpeechState('idle');
      };

      audio.onerror = () => {
        if (requestSeqRef.current !== mySeq) return;
        cleanupAudioElement();
        speakWithBrowserFallback(cleanText, mySeq);
      };

      audio.play().catch(() => {
        if (requestSeqRef.current !== mySeq) return;
        cleanupAudioElement();
        speakWithBrowserFallback(cleanText, mySeq);
      });
    },
    [cleanupAudioElement, speakWithBrowserFallback]
  );

  const handleSpeak = useCallback(
    async (textToRead, sourceKey = null) => {
      if (!textToRead) return;

      const isSameSource = sourceKey !== null && activeKeyRef.current === sourceKey;
      const shouldToggleCurrent = sourceKey === null || isSameSource;

      if (shouldToggleCurrent && speechState === 'playing') {
        if (activeBackendRef.current === 'audio' && audioRef.current) {
          audioRef.current.pause();
          setSpeechState('paused');
          return;
        }
        if (activeBackendRef.current === 'synth' && window.speechSynthesis) {
          window.speechSynthesis.pause();
          setSpeechState('paused');
          return;
        }
        // In-flight TTS fetch: cancel cleanly
        stopSpeech();
        return;
      }

      if (shouldToggleCurrent && speechState === 'paused') {
        if (activeBackendRef.current === 'audio' && audioRef.current) {
          audioRef.current.play().catch(() => {});
          setSpeechState('playing');
          return;
        }
        if (activeBackendRef.current === 'synth' && window.speechSynthesis) {
          window.speechSynthesis.resume();
          setSpeechState('playing');
          return;
        }
      }

      // Starting a new speech request
      requestSeqRef.current += 1;
      const mySeq = requestSeqRef.current;
      cleanupAudioElement();
      window.speechSynthesis?.cancel();

      const cleanText = cleanTextForSpeech(textToRead);
      if (!cleanText) return;

      activeBackendRef.current = null;
      activeKeyRef.current = sourceKey;
      setActiveKey(sourceKey);
      setSpeechState('playing');

      const cachedUrl = ttsObjectUrlCache.get(cleanText);
      if (cachedUrl) {
        playHtmlAudioUrl(cachedUrl, cleanText, mySeq);
        return;
      }

      try {
        const res = await api.synthesizeSpeech(cleanText);
        if (requestSeqRef.current !== mySeq) return;

        if (res?.success && res?.audioBase64) {
          const objectUrl = base64ToBlobUrl(res.audioBase64, res.mimeType || 'audio/wav');
          cacheTtsObjectUrl(cleanText, objectUrl);
          playHtmlAudioUrl(objectUrl, cleanText, mySeq);
          return;
        }
      } catch {
        // Fall through to upgraded browser voice ranker
      }

      if (requestSeqRef.current === mySeq) {
        speakWithBrowserFallback(cleanText, mySeq);
      }
    },
    [cleanupAudioElement, playHtmlAudioUrl, speakWithBrowserFallback, speechState, stopSpeech]
  );

  return { speechState, activeKey, handleSpeak, stopSpeech };
};
