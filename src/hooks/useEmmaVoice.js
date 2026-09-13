import { useState, useEffect } from 'react';

export const useEmmaVoice = () => {
    const [speechState, setSpeechState] = useState('idle');

    useEffect(() => {
        window.speechSynthesis.getVoices();
        return () => {
            window.speechSynthesis.cancel();
            setSpeechState('idle');
        };
    }, []);

    const handleSpeak = (textToRead) => {
        if (!textToRead) return;
        
        if (speechState === 'playing') {
            window.speechSynthesis.pause();
            setSpeechState('paused');
            return;
        }
        if (speechState === 'paused') {
            window.speechSynthesis.resume();
            setSpeechState('playing');
            return;
        }

        window.speechSynthesis.cancel();
        setSpeechState('playing');

        const cleanText = textToRead.replace(/[#*`_]/g, '');
        const textChunks = cleanText.split('\n').filter(line => line.trim() !== '');
        
        const liveVoices = window.speechSynthesis.getVoices();
        const britishVoice = liveVoices.find(voice => voice.lang === 'en-GB' && voice.name.includes('Female')) 
                          || liveVoices.find(voice => voice.lang === 'en-GB') 
                          || liveVoices[0];

        textChunks.forEach((chunk, index) => {
            const utterance = new SpeechSynthesisUtterance(chunk);
            if (britishVoice) utterance.voice = britishVoice;
            utterance.rate = 1.05; 
            utterance.pitch = 1.1;
            
            if (index === textChunks.length - 1) {
                utterance.onend = () => setSpeechState('idle');
            }
            utterance.onerror = () => setSpeechState('idle');
            
            window.speechSynthesis.speak(utterance);
        });
    };

    return { speechState, handleSpeak };
};