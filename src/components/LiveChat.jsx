// src/components/LiveChat.jsx
import React, { useState, useRef } from 'react';
import { EMMA_SYSTEM_INSTRUCTIONS } from '../config/emmaSystemPrompt';
import { useAudioStream } from '../hooks/useAudioStream';
import { AudioPlayer } from '../utils/AudioPlayer';
import { useAuth } from '../context/AuthContext';

const LiveChat = ({ recipeContext = null }) => {
  // 1. ALL HOOKS MUST LIVE AT THE VERY TOP!
  const [isLive, setIsLive] = useState(false);
  const [status, setStatus] = useState('Disconnected');
  const { user, spendToken } = useAuth();
  const { startRecording, stopRecording, audioError } = useAudioStream();
  
  const wsRef = useRef(null);
  const playerRef = useRef(null);

  const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;

  // 2. ONE BEAUTIFUL, UNIFIED FUNCTION
  const startLiveSession = async () => {
    // THE BOUNCER
    if (user?.generation_tokens <= 0) {
      setStatus('Skint! You are out of tokens, love.');
      return; 
    }

    setStatus('Consulting the ledger...');
    
    // THE TOLLBOOTH
    const tokenResult = await spendToken(); 
    
    if (!tokenResult.success) {
      setStatus(`Cheeky! The till wouldn't open: ${tokenResult.message}`);
      return; 
    }
    
    setStatus('Connecting to Emma...');
    
    try {
      const wsUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${GEMINI_API_KEY}`;
      wsRef.current = new WebSocket(wsUrl);

      // WEBSOCKET EVENT: ON OPEN
      wsRef.current.onopen = () => {
        setStatus('Negotiating with the server...');
        
        playerRef.current = new AudioPlayer();
        let finalInstructions = EMMA_SYSTEM_INSTRUCTIONS;
        if (recipeContext) {
            finalInstructions += `\n\nCURRENT CONTEXT: The user is currently looking at a recipe with the following details: "${recipeContext}". If they ask a specific cooking question, assume it relates to this dish.`;
        }
        
        const setupMessage = {
          setup: {
            model: 'models/gemini-3.1-flash-live-preview', 
            systemInstruction: {
              parts: [{ text: finalInstructions }] // <--- Use the injected instructions!
            },
            generationConfig: {
              responseModalities: ["AUDIO"]
            }
          }
        };
        wsRef.current.send(JSON.stringify(setupMessage));
      };

      // WEBSOCKET EVENT: ON MESSAGE
      wsRef.current.onmessage = async (event) => {
        try {
          let responseText = event.data;
          if (event.data instanceof Blob) {
            responseText = await event.data.text();
          }
          const data = JSON.parse(responseText);
          
          if (data.setupComplete) {
            setStatus('Emma is listening... (Live)');
            setIsLive(true);
            
            startRecording((base64Audio) => {
              const audioPayload = {
                realtimeInput: {
                  audio: {
                    mimeType: "audio/pcm;rate=16000",
                    data: base64Audio
                  }
                }
              };
              
              if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                wsRef.current.send(JSON.stringify(audioPayload));
              }
            });
            return; 
          }
          
          if (data.serverContent && data.serverContent.modelTurn) {
            const parts = data.serverContent.modelTurn.parts;
            parts.forEach(part => {
              if (part.inlineData && part.inlineData.data) {
                if (playerRef.current) {
                  playerRef.current.playBase64Audio(part.inlineData.data);
                }
              }
            });
          }
        } catch (err) {
          console.error("Error parsing incoming message:", err);
        }
      };

      // WEBSOCKET EVENT: ON ERROR
      wsRef.current.onerror = (error) => {
        console.error('WebSocket encountered an error:', error);
        setStatus('Error connecting to the posh British AI.');
        cleanupSession();
      };

      // WEBSOCKET EVENT: ON CLOSE
      wsRef.current.onclose = (event) => {
        console.warn(`WebSocket closed. Code: ${event.code}, Reason: ${event.reason}`);
        setStatus('Disconnected');
        cleanupSession();
      };

    } catch (err) {
      console.error('Failed to start live session:', err);
      setStatus('Failed to open WebSocket.');
      cleanupSession();
    }
  };

  // CLEANUP LOGIC
  const cleanupSession = () => {
    stopRecording();
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.close();
      playerRef.current?.stop();
    }
    setIsLive(false);
    if (status !== 'Error connecting to the posh British AI.') {
      setStatus('Disconnected');
    }
  };

  // RENDER UI
  return (
    <div style={{ padding: '20px', fontFamily: 'sans-serif', textAlign: 'center', maxWidth: '400px', margin: '0 auto' }}>
      <h2>The Veggie Vault - Live Sandbox</h2>
      
      <p style={{ color: audioError ? '#d9534f' : '#333' }}>
        Status: <strong>{audioError || status}</strong>
      </p>
      
      <button 
        onClick={isLive ? cleanupSession : startLiveSession}
        style={{
          padding: '12px 24px',
          fontSize: '16px',
          fontWeight: 'bold',
          backgroundColor: isLive ? '#d9534f' : '#5cb85c', 
          color: 'white',
          border: 'none',
          borderRadius: '8px',
          cursor: 'pointer',
          boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
        }}
      >
        {isLive ? 'End Chat' : 'Chat Live with Emma'}
      </button>
    </div>
  );
};

export default LiveChat;