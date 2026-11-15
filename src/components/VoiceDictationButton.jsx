import React, { useEffect, useRef } from 'react';
import { useSpeechToText } from '../hooks/useSpeechToText';
import './VoiceDictationButton.css';

/**
 * Reusable microphone button for voice-to-text dictation in text chat inputs.
 * Appends dictated speech onto the current input value.
 */
const VoiceDictationButton = ({ value, onChange, disabled = false, className = '', title }) => {
    const { isListening, transcript, toggleListening, isSupported } = useSpeechToText();
    const baseTextRef = useRef('');

    useEffect(() => {
        if (!transcript) return;
        const base = baseTextRef.current.trim();
        onChange(base ? `${base} ${transcript}` : transcript);
    }, [transcript, onChange]);

    if (!isSupported) return null;

    const handleClick = () => {
        if (disabled) return;
        if (!isListening) {
            baseTextRef.current = value || '';
        }
        toggleListening();
    };

    return (
        <button
            type="button"
            className={`voice-dictation-btn ${isListening ? 'listening' : ''} ${className}`.trim()}
            onClick={handleClick}
            disabled={disabled}
            title={title || (isListening ? 'Stop voice dictation' : 'Dictate with microphone')}
            aria-label={isListening ? 'Stop voice dictation' : 'Dictate with microphone'}
        >
            <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
            >
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="23" />
                <line x1="8" y1="23" x2="16" y2="23" />
            </svg>
        </button>
    );
};

export default VoiceDictationButton;
