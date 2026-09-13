import { useState, useEffect, useRef } from 'react';

export const useSpeechToText = () => {
    // State to track if the microphone is currently hot
    const [isListening, setIsListening] = useState(false);
    
    // State to hold the words Chrome just heard
    const [transcript, setTranscript] = useState('');
    
    // ref to hold the recognition object so it persists across renders
    const recognitionRef = useRef(null);

    useEffect(() => {
        // Check if the browser actually supports the Web Speech API (Chrome definitely does via webkit)
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        
        if (SpeechRecognition) {
            recognitionRef.current = new SpeechRecognition();
            
            // Set to false so it acts like a walkie-talkie (stops when you stop talking)
            // If true, it would leave the mic open indefinitely
            recognitionRef.current.continuous = false; 
            
            // Set to false so we only get the final, string of text
            recognitionRef.current.interimResults = false; 

            // This event fires the moment the browser successfully translates your speech
            recognitionRef.current.onresult = (event) => {
                const currentTranscript = event.results[0][0].transcript;
                setTranscript(currentTranscript);
            };

            // This event fires when the microphone shuts off
            recognitionRef.current.onend = () => {
                setIsListening(false);
            };
            
            // Error handling just in case you haven't given Chrome mic permissions yet
            recognitionRef.current.onerror = (event) => {
                console.error("Emma's ears are blocked (Speech recognition error):", event.error);
                setIsListening(false);
            };
        } else {
            console.warn("Speech recognition is not supported in this browser");
        }

        // Cleanup function: stop the mic if the component unmounts while listening
        return () => {
            if (recognitionRef.current) {
                recognitionRef.current.stop();
            }
        };
    }, []);

    // helper function to turn the mic on and off manually
    const toggleListening = () => {
        if (isListening) {
            recognitionRef.current?.stop();
            setIsListening(false);
        } else {
            // Clear the old transcript before we start listening again
            setTranscript(''); 
            recognitionRef.current?.start();
            setIsListening(true);
        }
    };

    // export whether the browser supports it, so we can hide the button if they use a dinosaur browser
    const isSupported = !!(window.SpeechRecognition || window.webkitSpeechRecognition);

    return { isListening, transcript, toggleListening, isSupported };
};