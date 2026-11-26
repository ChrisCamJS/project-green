// src/components/FloatingEmma.jsx
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { sendChatMessage } from '../services/geminiApi';
import { getSystemInstructions } from '../utils/promptBuilder';
import {
  fetchPublishedRecipesCatalog,
  buildPublishedRecipesPromptSection,
} from '../utils/emmaRecipeContext';
import {
  getPageMeta,
  buildFloatingEmmaPageContext,
} from '../utils/emmaSiteContext';
import EmmaMarkdown from './EmmaMarkdown';
import RecipeIdeaActions from './RecipeIdeaActions';
import VoiceDictationButton from './VoiceDictationButton';
import LiveChat from './LiveChat';
import { extractRecipeIdeas } from '../utils/recipeIdeas';
import { useEmmaVoice } from '../hooks/useEmmaVoice';
import './FloatingEmma.css';

const STORAGE_UI_STATE_KEY = 'vault_floating_emma_ui_state';

const HIDE_ON_PREFIXES = [
  '/engine',
  '/login',
  '/register',
  '/verify-email',
  '/forgot-password',
  '/reset-password',
];

const DEFAULT_PREFS = {
  oilFree: true,
  glutenFree: false,
  sugarFree: true,
};

export default function FloatingEmma() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const { speechState, activeKey, handleSpeak, stopSpeech } = useEmmaVoice();

  const [uiState, setUiState] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_UI_STATE_KEY);
      if (saved === 'open' || saved === 'minimized' || saved === 'hidden') return saved;
    } catch {
      // Ignore storage failures
    }
    return 'minimized';
  });
  const [isExpanded, setIsExpanded] = useState(false);
  const [chatHistory, setChatHistory] = useState([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showLiveAudio, setShowLiveAudio] = useState(false);

  const [publishedCatalog, setPublishedCatalog] = useState([]);
  const [currentRecipe, setCurrentRecipe] = useState(null);

  const inputRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const latestModelMsgRef = useRef(null);

  const shouldHideWidget =
    !user || HIDE_ON_PREFIXES.some((prefix) => pathname.startsWith(prefix));

  const pageMeta = useMemo(() => getPageMeta(pathname), [pathname]);
  const currentUserName = user?.username || 'Love';

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_UI_STATE_KEY, uiState);
    } catch {
      // Ignore storage failures
    }
  }, [uiState]);

  useEffect(() => {
    if (uiState !== 'open' || shouldHideWidget) return;
    let active = true;
    fetchPublishedRecipesCatalog(false, user?.id).then((catalog) => {
      if (active && Array.isArray(catalog)) {
        setPublishedCatalog(catalog);
      }
    });
    return () => {
      active = false;
    };
  }, [uiState, shouldHideWidget, user?.id]);

  // Load current recipe details when viewing /recipe/:id so Emma knows the dish
  useEffect(() => {
    if (uiState !== 'open' || !pathname.startsWith('/recipe/')) {
      setCurrentRecipe(null);
      return;
    }
    const recipeId = pathname.split('/recipe/')[1]?.split('/')[0];
    if (!recipeId) return;

    let active = true;
    api
      .getRecipesById(recipeId)
      .then((res) => {
        if (active && res && !res.error) {
          setCurrentRecipe(res);
        }
      })
      .catch(() => {
        // Non-blocking context fetch
      });
    return () => {
      active = false;
    };
  }, [pathname, uiState]);

  // Auto-expand textarea height to keep all typed/dictated text visible
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [inputText, uiState]);

  useEffect(() => {
    if (uiState !== 'open') return;
    const container = messagesContainerRef.current;
    if (!container) return;

    const lastMsg = chatHistory[chatHistory.length - 1];
    if (lastMsg?.role === 'model' && !isLoading && latestModelMsgRef.current) {
      const containerRect = container.getBoundingClientRect();
      const targetRect = latestModelMsgRef.current.getBoundingClientRect();
      const targetTop = container.scrollTop + (targetRect.top - containerRect.top) - 10;
      container.scrollTo({ top: Math.max(0, targetTop), behavior: 'smooth' });
      return;
    }

    container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
  }, [chatHistory, isLoading, showLiveAudio, uiState]);

  const quickPrompts = useMemo(() => {
    if (pathname === '/') {
      return [
        'Find me a quick oil-free dinner on the site',
        'How do I filter recipes by chefs I follow?',
        'Where do I create a new recipe or Masterpiece?',
      ];
    }
    if (pathname.startsWith('/recipe/')) {
      return [
        'How can I adapt this recipe or swap an ingredient?',
        'Give me the key nutrition highlights of this dish',
        'How do I add this to my Meal Planner?',
      ];
    }
    if (pathname.startsWith('/meal-planner')) {
      return [
        'How do I sync my Wellness targets here?',
        'Suggest published Vault recipes for my week',
      ];
    }
    return [
      'What can I do on this page?',
      'Find me a cozy WFPB recipe in the Vault',
      'Explain how tokens & Flavor Forge work',
    ];
  }, [pathname]);

  if (shouldHideWidget) {
    return null;
  }

  const buildChatContextForLive = () => {
    if (!Array.isArray(chatHistory) || chatHistory.length === 0) return null;
    const recent = chatHistory.slice(-6).map((msg) => {
      const text = (msg.parts?.[0]?.text || msg.displayParts?.userText || '').trim();
      const clipped = text.length > 1000 ? `${text.slice(0, 1000)}...` : text;
      return `${msg.role === 'user' ? currentUserName : 'Emma'}: ${clipped}`;
    });
    const pageCtx = buildFloatingEmmaPageContext({
      pathname,
      currentRecipe,
      assistantMode: 'helper',
    });
    return `${pageCtx}\n\nConversation Transcript:\n${recent.join('\n\n')}`;
  };

  const handleLiveTranscriptTurn = ({ role, text }) => {
    const cleanText = String(text || '').trim();
    if (!cleanText) return;

    setChatHistory((prev) => {
      const next = [...prev];
      if (next.length === 0 && role === 'model') {
        next.push({
          role: 'user',
          parts: [{ text: 'Started Live Audio session with Emma.' }],
          displayParts: { userText: 'Started Live Audio session', isVoice: true },
        });
      }
      const last = next[next.length - 1];
      if (last && last.role === role) {
        const prevText = (last.parts?.[0]?.text || '').trim();
        const merged = prevText ? `${prevText}\n${cleanText}` : cleanText;
        next[next.length - 1] = {
          ...last,
          parts: [{ text: merged }],
          displayParts:
            role === 'user'
              ? { ...last.displayParts, userText: merged, isVoice: true }
              : last.displayParts,
        };
      } else if (role === 'user') {
        next.push({
          role: 'user',
          parts: [{ text: cleanText }],
          displayParts: { userText: cleanText, isVoice: true },
        });
      } else {
        next.push({
          role: 'model',
          parts: [{ text: cleanText }],
        });
      }
      return next;
    });
  };

  const handleSend = async (overridePrompt = null) => {
    const textToSend = (overridePrompt !== null ? overridePrompt : inputText).trim();
    if (!textToSend || isLoading) return;

    if (overridePrompt === null) {
      setInputText('');
    }
    setError(null);
    setIsLoading(true);

    const updatedHistory = [
      ...chatHistory,
      {
        role: 'user',
        parts: [{ text: textToSend }],
        displayParts: { userText: textToSend },
      },
    ];
    const apiHistory = updatedHistory.map(({ role, parts }) => ({ role, parts }));

    try {
      const catalogToUse =
        publishedCatalog.length > 0 ? publishedCatalog : await fetchPublishedRecipesCatalog(false, user?.id);
      const catalogSection = buildPublishedRecipesPromptSection(catalogToUse, 150, {
        currentUser: user,
      });
      const baseInstructions = getSystemInstructions(
        DEFAULT_PREFS,
        currentUserName,
        true,
        catalogSection,
        user?.allergies || ''
      );
      const pageContextBlock = buildFloatingEmmaPageContext({
        pathname,
        currentRecipe,
        assistantMode: 'helper',
      });
      const helperBoundary =
        'FLOATING HELPER ROLE:\nYou are acting as the site-wide floating guide. Help users find published recipes (linking as [Title](/recipe/<id>)), answer nutrition/cooking questions, explain how to use site features, and direct them to the right page. If the user asks to generate/forge a brand-new Recipe Draft or Full Masterpiece Recipe with AI photo & macros, warmly direct them to [Emma\'s Flavor Forge](/engine) to create it there.';
      const fullSystemInstructions = `${baseInstructions}\n\n${helperBoundary}\n\n${pageContextBlock}`;

      const replyText = await sendChatMessage(apiHistory, fullSystemInstructions);

      setChatHistory([
        ...updatedHistory,
        {
          role: 'model',
          parts: [{ text: replyText }],
        },
      ]);
    } catch (err) {
      setError(err?.message || 'Emma hit a snag. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetChat = () => {
    stopSpeech();
    setShowLiveAudio(false);
    setChatHistory([]);
    setError(null);
  };

  if (uiState === 'hidden') {
    return (
      <button
        type="button"
        className="floating-emma-hidden-tab"
        onClick={() => setUiState('minimized')}
        title="Show Emma Assistant"
      >
        👩‍🍳 Emma
      </button>
    );
  }

  if (uiState === 'minimized') {
    return (
      <div className="floating-emma-pill-wrap">
        <button
          type="button"
          className="floating-emma-pill"
          onClick={() => setUiState('open')}
          title="Ask Emma for recipes, site help, or live audio chat"
        >
          <span>👩‍🍳 Ask Emma</span>
          <span className="floating-emma-pill-sub">
            {showLiveAudio ? '🎙️ Live' : pageMeta.label}
          </span>
        </button>
        <button
          type="button"
          className="floating-emma-hide-pill-btn"
          onClick={() => {
            stopSpeech();
            setShowLiveAudio(false);
            setUiState('hidden');
          }}
          title="Hide Emma"
          aria-label="Hide Emma"
        >
          ×
        </button>
      </div>
    );
  }

  const publishedCatalogVocal = buildPublishedRecipesPromptSection(publishedCatalog, 150, {
    vocalMode: true,
    currentUser: user,
  });

  return (
    <aside
      className={`floating-emma-drawer ${isExpanded ? 'expanded' : ''}`}
      aria-label="Emma Site Assistant"
    >
      <div className="floating-emma-header">
        <div className="floating-emma-title-wrap">
          <span className="floating-emma-title">👩‍🍳 Emma Helper</span>
          <span className="floating-emma-page-badge">
            📍 {pageMeta.label}
            {currentRecipe?.title ? ` · ${currentRecipe.title}` : ''}
          </span>
        </div>
        <div className="floating-emma-header-actions">
          {chatHistory.length > 0 && (
            <button
              type="button"
              className="floating-emma-icon-btn"
              onClick={handleResetChat}
              title="Start a new chat"
            >
              New
            </button>
          )}
          <button
            type="button"
            className="floating-emma-icon-btn"
            onClick={() => setIsExpanded((prev) => !prev)}
            title={isExpanded ? 'Compact size' : 'Expand size'}
          >
            {isExpanded ? '⤡' : '⤢'}
          </button>
          <button
            type="button"
            className="floating-emma-icon-btn"
            onClick={() => setUiState('minimized')}
            title="Minimize Emma"
          >
            —
          </button>
          <button
            type="button"
            className="floating-emma-icon-btn"
            onClick={() => {
              stopSpeech();
              setShowLiveAudio(false);
              setUiState('hidden');
            }}
            title="Hide Emma"
          >
            ×
          </button>
        </div>
      </div>

      <div ref={messagesContainerRef} className="floating-emma-messages">
        {chatHistory.length === 0 ? (
          <div className="floating-emma-empty">
            <strong>Hi {currentUserName}!</strong> I can see you’re on{' '}
            <strong>{pageMeta.label}</strong>. Ask me to find recipes, explain any feature,
            or tap <strong>🎙️ Live</strong> below to talk out loud. Need to forge a brand-new
            recipe or Masterpiece? Head to <Link to="/engine">Flavor Forge</Link>!
            <div className="floating-emma-quick-prompts">
              {quickPrompts.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  className="floating-emma-quick-chip"
                  onClick={() => handleSend(prompt)}
                  disabled={isLoading}
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        ) : (
          chatHistory.map((msg, idx) => {
            if (msg.role === 'user') {
              const userText = msg.displayParts?.userText || msg.parts?.[0]?.text || '';
              return (
                <div key={idx} className="floating-emma-msg-user">
                  <div>{userText}</div>
                  {msg.displayParts?.isVoice && (
                    <span className="floating-emma-voice-badge">🎙️ Live Audio</span>
                  )}
                </div>
              );
            }

            const replyText = msg.parts?.[0]?.text || '';
            const { cleanText, ideas } = extractRecipeIdeas(replyText);
            const msgSpeechKey = `floating-msg-${idx}`;
            const isSpeakingThis = speechState === 'playing' && activeKey === msgSpeechKey;
            return (
              <div
                key={idx}
                ref={idx === chatHistory.length - 1 ? latestModelMsgRef : null}
                className="floating-emma-msg-model"
              >
                <div className="floating-emma-msg-model-header">
                  <span className="floating-emma-msg-sender">Emma</span>
                  <button
                    type="button"
                    className={`floating-emma-speak-btn ${isSpeakingThis ? 'playing' : ''}`}
                    onClick={() => handleSpeak(cleanText, msgSpeechKey)}
                    title={isSpeakingThis ? 'Pause Emma' : 'Listen to Emma'}
                    aria-label={isSpeakingThis ? 'Pause Emma' : 'Listen to Emma'}
                  >
                    {isSpeakingThis ? '⏸️' : '🔊'}
                  </button>
                </div>
                <EmmaMarkdown>{cleanText}</EmmaMarkdown>
                <RecipeIdeaActions
                  ideas={ideas}
                  compact
                  onBeforeNavigate={() => {
                    stopSpeech();
                    setUiState('minimized');
                  }}
                />
              </div>
            );
          })
        )}
      </div>

      {showLiveAudio && (
        <div className="floating-emma-live-box">
          <LiveChat
            chatContext={buildChatContextForLive()}
            publishedRecipesContext={publishedCatalogVocal}
            recipeContext={
              currentRecipe
                ? `${currentRecipe.title}: ${currentRecipe.description || ''}`
                : null
            }
            onTranscriptTurn={handleLiveTranscriptTurn}
            autoStart={true}
            compact={true}
          />
        </div>
      )}

      {error && (
        <div className="floating-emma-error" role="alert">
          {error}
        </div>
      )}

      <form
        className="floating-emma-input-bar"
        onSubmit={(e) => {
          e.preventDefault();
          handleSend();
        }}
      >
        <div className="floating-emma-input-row">
          <textarea
            ref={inputRef}
            rows={1}
            className="floating-emma-textarea"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Ask Emma how to find recipes or use the site..."
            disabled={isLoading}
          />
          <VoiceDictationButton
            value={inputText}
            onChange={setInputText}
            disabled={isLoading}
          />
          <button
            type="button"
            className={`floating-emma-live-toggle ${showLiveAudio ? 'active' : ''}`}
            onClick={() => {
              if (!showLiveAudio) stopSpeech();
              setShowLiveAudio((prev) => !prev);
            }}
            title="Toggle Live Audio in this chat (0.10 Tokens/min)"
          >
            {showLiveAudio ? '🛑 Stop' : '🎙️ Live'}
          </button>
          <button
            type="submit"
            className="floating-emma-send-btn"
            disabled={isLoading || !inputText.trim()}
          >
            {isLoading ? '...' : 'Send'}
          </button>
        </div>
        <div className="floating-emma-footer-links">
          <span>💬 Text &amp; Live Audio unified</span>
          <Link to="/engine" onClick={() => setUiState('minimized')}>
            Create Recipes in Flavor Forge ↗
          </Link>
        </div>
      </form>
    </aside>
  );
}
