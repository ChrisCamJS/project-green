// src/components/LiveChat.jsx
import React, { useState, useRef, useEffect } from 'react';
import { EMMA_SYSTEM_INSTRUCTIONS } from '../config/emmaSystemPrompt';
import { useAudioStream } from '../hooks/useAudioStream';
import { AudioPlayer } from '../utils/AudioPlayer';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import {
  fetchPublishedRecipesCatalog,
  buildPublishedRecipesPromptSection,
} from '../utils/emmaRecipeContext';

const LIVE_AUDIO_TOKENS_PER_MIN = 0.1;

const formatElapsedTime = (totalSeconds) => {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
};

const LiveChat = ({
  recipeContext = null,
  chatContext = null,
  publishedRecipesContext = null,
  mealPlanContext = null,
  tools = null,
  onToolCall = null,
  autoStart = false,
}) => {
  // 1. ALL HOOKS MUST LIVE AT THE VERY TOP!
  const [isLive, setIsLive] = useState(false);
  const [status, setStatus] = useState('Disconnected');
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [sessionTokensSpent, setSessionTokensSpent] = useState(0);
  const [autoPublishedCatalogText, setAutoPublishedCatalogText] = useState('');
  const { user, spendToken, promptPurchaseTokens } = useAuth();
  const { startRecording, stopRecording, audioError } = useAudioStream();

  const wsRef = useRef(null);
  const playerRef = useRef(null);
  const consumedPreConfirmRef = useRef(false);
  const onToolCallRef = useRef(onToolCall);
  const spendTokenRef = useRef(spendToken);
  const stopRecordingRef = useRef(stopRecording);

  useEffect(() => {
    onToolCallRef.current = onToolCall;
  }, [onToolCall]);

  useEffect(() => {
    spendTokenRef.current = spendToken;
  }, [spendToken]);

  useEffect(() => {
    stopRecordingRef.current = stopRecording;
  }, [stopRecording]);

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

  // Metered per-minute billing & live elapsed timer while audio session is active
  useEffect(() => {
    if (!isLive) return undefined;

    const timerInterval = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);

    const billingInterval = setInterval(async () => {
      const res = await spendTokenRef.current(LIVE_AUDIO_TOKENS_PER_MIN, {
        actionLabel: 'Live Audio Minute with Emma',
        skipConfirm: true,
      });

      if (res?.success) {
        setSessionTokensSpent((prev) => Number((prev + LIVE_AUDIO_TOKENS_PER_MIN).toFixed(2)));
      } else {
        // Out of tokens mid-session: cleanly shut down the live audio connection
        stopRecordingRef.current();
        if (
          wsRef.current &&
          (wsRef.current.readyState === WebSocket.OPEN ||
            wsRef.current.readyState === WebSocket.CONNECTING)
        ) {
          wsRef.current.close();
        }
        playerRef.current?.stop();
        setIsLive(false);
        setStatus('Session paused — out of tokens! Top up to keep chatting.');
      }
    }, 60000);

    return () => {
      clearInterval(timerInterval);
      clearInterval(billingInterval);
    };
  }, [isLive]);

  // 2. ONE BEAUTIFUL, UNIFIED FUNCTION
  const startLiveSession = async () => {
    // THE BOUNCER: check for at least 1 minute (0.10 tokens)
    if (Number(user?.generation_tokens ?? 0) < LIVE_AUDIO_TOKENS_PER_MIN) {
      setStatus('Skint! You need at least 0.10 tokens to start Live Audio.');
      await promptPurchaseTokens(LIVE_AUDIO_TOKENS_PER_MIN, 'Live Audio Session with Emma (0.10 Tokens/min)');
      return;
    }

    setStatus('Consulting the ledger...');

    // THE TOLLBOOTH: always confirm and deduct first minute (0.10 tokens) before going live
    const tokenResult = await spendToken(LIVE_AUDIO_TOKENS_PER_MIN, {
      actionLabel: 'Live Audio with Emma (0.10 Tokens/min)',
      skipConfirm: false,
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
    setElapsedSeconds(0);
    setSessionTokensSpent(LIVE_AUDIO_TOKENS_PER_MIN);
    setStatus('Connecting to Emma...');

    try {
      let resolvedPublishedText = publishedRecipesContext || autoPublishedCatalogText || '';
      if (!resolvedPublishedText && !mealPlanContext) {
        const catalog = await fetchPublishedRecipesCatalog();
        resolvedPublishedText = buildPublishedRecipesPromptSection(catalog, 80, { vocalMode: true });
      }

      const tokenRes = await api.aiGetLiveToken();
      if (!tokenRes?.token) {
        throw new Error(tokenRes?.message || 'Could not obtain a live audio session token.');
      }

      const wsUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContentConstrained?access_token=${encodeURIComponent(tokenRes.token)}`;
      wsRef.current = new WebSocket(wsUrl);

      // WEBSOCKET EVENT: ON OPEN
      wsRef.current.onopen = () => {
        setStatus('Negotiating with the server...');

        playerRef.current = new AudioPlayer();
        let finalInstructions = EMMA_SYSTEM_INSTRUCTIONS;
        if (user?.allergies) {
          finalInstructions += `\n\nCRITICAL ALLERGY & SAFETY RESTRICTION (MANDATORY): The user has the following food allergies or sensitivities saved in their profile: ${user.allergies}. NEVER suggest or include any of these allergens or hidden derivatives in any recipe idea, substitution, or meal recommendation.`;
        }
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

  const autoStartedRef = useRef(false);

  useEffect(() => {
    if (autoStart && !autoStartedRef.current) {
      autoStartedRef.current = true;
      startLiveSession();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart]);

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
      <h2 style={{ marginTop: 0, marginBottom: '0.4rem' }}>The Veggie Vault — Live Audio Mode</h2>
      <p style={{ margin: '0 0 0.75rem', fontSize: '0.86rem', color: '#4a5568' }}>
        Metered rate: <strong>0.10 tokens/min</strong> (0.10 tokens charged on start, then every 60s).
      </p>

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

      <p style={{ color: audioError ? '#d9534f' : '#333', margin: '0.5rem 0 0.75rem' }}>
        Status: <strong>{audioError || status}</strong>
      </p>

      {(isLive || sessionTokensSpent > 0) && (
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.75rem',
            marginBottom: '1rem',
            padding: '0.4rem 0.9rem',
            borderRadius: '9999px',
            backgroundColor: isLive ? '#fff5f5' : '#f7fafc',
            border: `1px solid ${isLive ? '#feb2b2' : '#e2e8f0'}`,
            color: isLive ? '#c53030' : '#4a5568',
            fontSize: '0.84rem',
            fontWeight: 700,
          }}
        >
          <span>{isLive ? '🔴 LIVE' : 'Session Ended'}</span>
          <span>⏱️ {formatElapsedTime(elapsedSeconds)}</span>
          <span>🪙 {sessionTokensSpent.toFixed(2)} tokens used</span>
        </div>
      )}

      <div>
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
          {isLive ? 'End Live Audio Chat' : '🎙️ Chat Live with Emma (0.10 Tokens / min)'}
        </button>
      </div>
      <p style={{ fontSize: '0.78rem', color: '#718096', marginTop: '0.6rem', marginBottom: 0 }}>
        Billed by usage at 0.10 tokens per minute (1 token = 10 mins).
      </p>
    </div>
  );
};

export default LiveChat;
