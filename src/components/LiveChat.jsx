// src/components/LiveChat.jsx
import React, { useState, useRef, useEffect } from 'react';
import { EMMA_SYSTEM_INSTRUCTIONS } from '../config/emmaSystemPrompt';
import { useAudioStream } from '../hooks/useAudioStream';
import { AudioPlayer } from '../utils/AudioPlayer';
import { useAuth } from '../context/AuthContext';
import {
  fetchPublishedRecipesCatalog,
  buildPublishedRecipesPromptSection,
} from '../utils/emmaRecipeContext';

const LiveChat = ({
  recipeContext = null,
  chatContext = null,
  publishedRecipesContext = null,
  mealPlanContext = null,
  tools = null,
  onToolCall = null,
  preConfirmed = false,
}) => {
  // 1. ALL HOOKS MUST LIVE AT THE VERY TOP!
  const [isLive, setIsLive] = useState(false);
  const [status, setStatus] = useState('Disconnected');
  const [autoPublishedCatalogText, setAutoPublishedCatalogText] = useState('');
  const { user, spendToken, promptPurchaseTokens } = useAuth();
  const { startRecording, stopRecording, audioError } = useAudioStream();

  const wsRef = useRef(null);
  const playerRef = useRef(null);
  const consumedPreConfirmRef = useRef(false);
  const onToolCallRef = useRef(onToolCall);

  useEffect(() => {
    onToolCallRef.current = onToolCall;
  }, [onToolCall]);

  useEffect(() => {
    if (publishedRecipesContext !== null || mealPlanContext !== null) {
      return undefined;
    }
    let active = true;
    fetchPublishedRecipesCatalog().then((catalog) => {
      if (active && Array.isArray(catalog) && catalog.length > 0) {
        setAutoPublishedCatalogText(
          buildPublishedRecipesPromptSection(catalog, 80, { vocalMode: true })
        );
      }
    });
    return () => {
      active = false;
    };
  }, [publishedRecipesContext, mealPlanContext]);

  const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;

  // Ensure microphone and WebSocket close cleanly if the inline Live Chat panel unmounts
  useEffect(() => {
    return () => {
      stopRecording();
      if (
        wsRef.current &&
        (wsRef.current.readyState === WebSocket.OPEN ||
          wsRef.current.readyState === WebSocket.CONNECTING)
      ) {
        wsRef.current.close();
      }
      playerRef.current?.stop();
    };
  }, [stopRecording]);

  // 2. ONE BEAUTIFUL, UNIFIED FUNCTION
  const startLiveSession = async () => {
    // THE BOUNCER
    if (Number(user?.generation_tokens ?? 0) < 1) {
      setStatus('Skint! You are out of tokens, love.');
      await promptPurchaseTokens(1, 'Live Audio Session with Emma');
      return;
    }

    setStatus('Consulting the ledger...');

    // THE TOLLBOOTH
    const shouldSkipConfirm = preConfirmed && !consumedPreConfirmRef.current;
    const tokenResult = await spendToken(1, {
      actionLabel: 'Live Audio Session with Emma',
      skipConfirm: shouldSkipConfirm,
    });

    if (tokenResult?.cancelled) {
      setStatus('Disconnected');
      return;
    }

    if (!tokenResult?.success) {
      setStatus(`Cheeky! The till wouldn't open: ${tokenResult?.message || 'Unable to verify tokens.'}`);
      return;
    }

    consumedPreConfirmRef.current = true;
    setStatus('Connecting to Emma...');

    try {
      let resolvedPublishedText = publishedRecipesContext || autoPublishedCatalogText || '';
      if (!resolvedPublishedText && !mealPlanContext) {
        const catalog = await fetchPublishedRecipesCatalog();
        resolvedPublishedText = buildPublishedRecipesPromptSection(catalog, 80, { vocalMode: true });
      }

      const wsUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${GEMINI_API_KEY}`;
      wsRef.current = new WebSocket(wsUrl);

      // WEBSOCKET EVENT: ON OPEN
      wsRef.current.onopen = () => {
        setStatus('Negotiating with the server...');

        playerRef.current = new AudioPlayer();
        let finalInstructions = EMMA_SYSTEM_INSTRUCTIONS;
        if (mealPlanContext) {
          finalInstructions += `\n\n${mealPlanContext}`;
        } else if (resolvedPublishedText) {
          finalInstructions += resolvedPublishedText;
        }
        if (recipeContext) {
          finalInstructions += `\n\nCURRENT CONTEXT: The user is currently looking at a recipe with the following details: "${recipeContext}". If they ask a specific cooking question, assume it relates to this dish.`;
        }
        if (chatContext) {
          finalInstructions += `\n\nCURRENT CHAT CONVERSATION CONTEXT:\nYou and the user have been having the following conversation in text chat. Use this entire context (including any recipes, ingredients, nutritional questions, or reference documents discussed) to seamlessly continue the conversation out loud:\n${chatContext}`;
        }

        const setupConfig = {
          model: 'models/gemini-3.1-flash-live-preview',
          systemInstruction: {
            parts: [{ text: finalInstructions }],
          },
          generationConfig: {
            responseModalities: ['AUDIO'],
          },
        };

        if (Array.isArray(tools) && tools.length > 0) {
          setupConfig.tools = tools;
        }

        wsRef.current.send(JSON.stringify({ setup: setupConfig }));
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
                    mimeType: 'audio/pcm;rate=16000',
                    data: base64Audio,
                  },
                },
              };

              if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                wsRef.current.send(JSON.stringify(audioPayload));
              }
            });
            return;
          }

          if (data.toolCall && Array.isArray(data.toolCall.functionCalls)) {
            const functionResponses = [];
            for (const fc of data.toolCall.functionCalls) {
              let resultPayload = { success: false, message: 'No tool handler registered.' };
              if (typeof onToolCallRef.current === 'function') {
                try {
                  resultPayload = await onToolCallRef.current(fc);
                } catch (toolErr) {
                  resultPayload = {
                    success: false,
                    message: toolErr?.message || 'Error executing meal plan update.',
                  };
                }
              }
              functionResponses.push({
                id: fc.id,
                name: fc.name,
                response: resultPayload,
              });
            }

            if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
              wsRef.current.send(
                JSON.stringify({
                  toolResponse: {
                    functionResponses,
                  },
                })
              );
            }
            return;
          }

          if (data.serverContent && data.serverContent.modelTurn) {
            const parts = data.serverContent.modelTurn.parts || [];
            parts.forEach((part) => {
              if (part.inlineData && part.inlineData.data) {
                if (playerRef.current) {
                  playerRef.current.playBase64Audio(part.inlineData.data);
                }
              }
            });
          }
        } catch (err) {
          console.error('Error parsing incoming message:', err);
        }
      };

      // WEBSOCKET EVENT: ON ERROR
      wsRef.current.onerror = (error) => {
        console.error('WebSocket encountered an error:', error);
        setStatus('Error connecting to the posh British AI.');
        cleanupSession(true);
      };

      // WEBSOCKET EVENT: ON CLOSE
      wsRef.current.onclose = (event) => {
        console.warn(`WebSocket closed. Code: ${event.code}, Reason: ${event.reason}`);
        cleanupSession();
      };
    } catch (err) {
      console.error('Failed to start live session:', err);
      setStatus('Failed to open WebSocket.');
      cleanupSession(true);
    }
  };

  // CLEANUP LOGIC
  const cleanupSession = (preserveErrorStatus = false) => {
    stopRecording();
    if (
      wsRef.current &&
      (wsRef.current.readyState === WebSocket.OPEN ||
        wsRef.current.readyState === WebSocket.CONNECTING)
    ) {
      wsRef.current.close();
    }
    playerRef.current?.stop();
    setIsLive(false);
    if (!preserveErrorStatus) {
      setStatus((prev) =>
        prev === 'Error connecting to the posh British AI.' || prev === 'Failed to open WebSocket.'
          ? prev
          : 'Disconnected'
      );
    }
  };

  const contextLabel = mealPlanContext
    ? '🗓️ Emma has your Meal Planner calendar & full recipe catalog loaded'
    : chatContext
      ? '🧠 Emma has your current chat conversation in memory'
      : recipeContext
        ? '🧠 Emma has this recipe in memory'
        : publishedRecipesContext || autoPublishedCatalogText
          ? '📚 Emma has the published Veggie Vault recipe catalog in memory'
          : null;

  // RENDER UI
  return (
    <div style={{ padding: '20px', fontFamily: 'sans-serif', textAlign: 'center', maxWidth: '480px', margin: '0 auto' }}>
      <h2 style={{ marginTop: 0, marginBottom: '0.6rem' }}>The Veggie Vault — Live Audio Mode</h2>

      {contextLabel && (
        <div
          style={{
            display: 'inline-block',
            marginBottom: '0.85rem',
            padding: '0.32rem 0.85rem',
            borderRadius: '9999px',
            backgroundColor: '#f0fff4',
            border: '1px solid #9ae6b4',
            color: '#22543d',
            fontSize: '0.84rem',
            fontWeight: 600,
          }}
        >
          {contextLabel}
        </div>
      )}

      <p style={{ color: audioError ? '#d9534f' : '#333', margin: '0.5rem 0 1rem' }}>
        Status: <strong>{audioError || status}</strong>
      </p>

      <button
        type="button"
        onClick={isLive ? () => cleanupSession() : startLiveSession}
        style={{
          padding: '12px 24px',
          fontSize: '16px',
          fontWeight: 'bold',
          backgroundColor: isLive ? '#d9534f' : '#5cb85c',
          color: 'white',
          border: 'none',
          borderRadius: '8px',
          cursor: 'pointer',
          boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
        }}
      >
        {isLive ? 'End Live Audio Chat' : '🎙️ Chat Live with Emma (Costs 1 Token per session)'}
      </button>
    </div>
  );
};

export default LiveChat;
