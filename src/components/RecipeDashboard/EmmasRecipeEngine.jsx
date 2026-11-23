// src/components/RecipeDashboard/EmmasRecipeEngine.jsx

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import EmmaMarkdown from '../EmmaMarkdown';
import RecipeIdeaActions from '../RecipeIdeaActions';
import VoiceDictationButton from '../VoiceDictationButton';
import { getSystemInstructions, cleanRecipeTitle } from '../../utils/promptBuilder';
import { extractRecipeIdeas } from '../../utils/recipeIdeas';
import {
    fetchPublishedRecipesCatalog,
    buildPublishedRecipesPromptSection,
} from '../../utils/emmaRecipeContext';
import {
    sendChatMessage,
    generateRecipeImage,
    DEFAULT_IMAGE_STYLE_OPTIONS,
} from '../../services/geminiApi';
import {
    ACCEPTED_REFERENCE_EXTENSIONS,
    buildReferencePayload,
    formatFileSize,
    parseReferenceFile,
} from '../../utils/referenceDocument';
import {
    loadRecentChats,
    saveChatSession,
    deleteChatSession,
    clearAllChatSessions,
    getDaysRemaining,
    deriveChatTitle,
} from '../../utils/chatStorage';
import { exportChatToTxt, exportChatToPdf } from '../../utils/chatExport';
import { useEmmaVoice } from '../../hooks/useEmmaVoice';
import { useAuth } from '../../context/AuthContext';
import RecipeForm from './RecipeForm';
import RecipeResult from './RecipeResult';
import LiveChat from '../LiveChat'; 
import './EmmasRecipeEngine.css';

const EmmasRecipeEngine = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const initialPrefill = location.state?.prefillPrompt ? location.state : null;
    const { user, spendToken, promptPurchaseTokens } = useAuth();
    const currentUserName = user?.username || 'Love';

    const { speechState, handleSpeak } = useEmmaVoice();

    const [chatHistory, setChatHistory] = useState([]);
    const [currentSessionId, setCurrentSessionId] = useState(null);
    const [recentChats, setRecentChats] = useState([]);
    const [showRecentChats, setShowRecentChats] = useState(false);
    const [publishedRecipes, setPublishedRecipes] = useState([]);

    useEffect(() => {
        let active = true;
        loadRecentChats(user?.id).then((chats) => {
            if (active) {
                setRecentChats(chats);
            }
        });
        return () => {
            active = false;
        };
    }, [user?.id]);

    useEffect(() => {
        let active = true;
        fetchPublishedRecipesCatalog().then((catalog) => {
            if (active && Array.isArray(catalog)) {
                setPublishedRecipes(catalog);
            }
        });
        return () => {
            active = false;
        };
    }, []);

    const publishedCatalogVocal = useMemo(
        () => buildPublishedRecipesPromptSection(publishedRecipes, 80, { vocalMode: true }),
        [publishedRecipes]
    );
    
    const [showWelcomeModal, setShowWelcomeModal] = useState(() => {
        return localStorage.getItem('emmaEngineWelcomeDismissed') !== 'true';
    });
    
    const [dontShowAgain, setDontShowAgain] = useState(true);

    const handleDismissWelcome = () => {
        if (dontShowAgain) {
            localStorage.setItem('emmaEngineWelcomeDismissed', 'true');
        }
        setShowWelcomeModal(false);
    };

    const [showMasterpieceSaveModal, setShowMasterpieceSaveModal] = useState(false);
    const [dontShowMasterpieceSaveAgain, setDontShowMasterpieceSaveAgain] = useState(false);

    const handleDismissMasterpieceSaveModal = () => {
        if (dontShowMasterpieceSaveAgain) {
            localStorage.setItem('emmaMasterpieceSaveReminderDismissed', 'true');
        }
        setShowMasterpieceSaveModal(false);
    };

    const [recipeImage, setRecipeImage] = useState(null);
    const [isGeneratingImage, setIsGeneratingImage] = useState(false);
    const [imageGenFailed, setImageGenFailed] = useState(false);
    const [lastImagePrompt, setLastImagePrompt] = useState('');
    const [imageStyleOptions, setImageStyleOptions] = useState({ ...DEFAULT_IMAGE_STYLE_OPTIONS });
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    
    const [followUpText, setFollowUpText] = useState('');
    const [showFollowUpRef, setShowFollowUpRef] = useState(false);
    const [followUpPastedRef, setFollowUpPastedRef] = useState('');
    const [followUpUploadedDoc, setFollowUpUploadedDoc] = useState(null);
    const [isParsingFollowUpFile, setIsParsingFollowUpFile] = useState(false);
    const [followUpFileError, setFollowUpFileError] = useState(null);
    const [dietaryPrefs, setDietaryPrefs] = useState({
        oilFree: true,
        glutenFree: false,
        sugarFree: true 
    });

    const [engineMode, setEngineMode] = useState(() =>
        initialPrefill ? (initialPrefill.prefillMode === 'full' ? 'full' : 'draft') : 'chat'
    );
    const [prefillPrompt, setPrefillPrompt] = useState(() =>
        String(initialPrefill?.prefillPrompt || '')
    );
    const [prefillKey, setPrefillKey] = useState(() =>
        initialPrefill?.prefillPrompt ? 1 : 0
    );
    const [showBottomBin, setShowBottomBin] = useState(false);
    const [showInlineLiveChat, setShowInlineLiveChat] = useState(false);
    const inlineLivePanelRef = useRef(null);
    const followUpInputRef = useRef(null);
    const followUpRefPasteRef = useRef(null);

    useEffect(() => {
        const el = followUpInputRef.current;
        if (!el) return;
        el.style.height = 'auto';
        el.style.height = `${el.scrollHeight}px`;
    }, [followUpText]);

    useEffect(() => {
        const el = followUpRefPasteRef.current;
        if (!el) return;
        el.style.height = 'auto';
        el.style.height = `${el.scrollHeight}px`;
    }, [followUpPastedRef, showFollowUpRef]);

    useEffect(() => {
        const handleScroll = () => {
            if (window.scrollY > 300) {
                setShowBottomBin(true);
            } else {
                setShowBottomBin(false);
            }
        };

        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    const handleFocusFollowUpInput = () => {
        const el = followUpInputRef.current;
        if (!el) return;
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setTimeout(() => {
            el.focus({ preventScroll: true });
        }, 300);
    };

    const extractGeneratedDishPrompt = (markdown = '', fallbackHint = '') => {
        const titleMatch = markdown.match(/^#\s+(.+)$/m);
        const rawTitle = titleMatch && titleMatch[1] ? cleanRecipeTitle(titleMatch[1]) : '';
        if (!rawTitle) {
            return fallbackHint || 'Whole-Food Plant-Based Dish';
        }
        const afterTitle = markdown.slice((titleMatch.index ?? 0) + titleMatch[0].length);
        const introMatch = afterTitle.match(/^\s*\n+([^#\n*>-][^\n]{10,220})/);
        const introLine = introMatch
            ? introMatch[1].replace(/[*_`]/g, '').trim()
            : '';
        if (introLine) {
            const firstSentence = introLine.split(/(?<=[.!?])\s+/)[0].slice(0, 160).trim();
            if (firstSentence) {
                return `${rawTitle} — ${firstSentence}`;
            }
        }
        return rawTitle;
    };

    const triggerMasterpieceImageGeneration = async (promptText, styleOpts = imageStyleOptions) => {
        setIsGeneratingImage(true);
        setImageGenFailed(false);
        try {
            const base64Data = await generateRecipeImage(promptText, styleOpts);
            if (base64Data) {
                const dataUrl = `data:image/jpeg;base64,${base64Data}`;
                setRecipeImage(dataUrl);
                setImageGenFailed(false);
                return dataUrl;
            } else {
                setImageGenFailed(true);
                return null;
            }
        } catch (err) {
            console.error("The image generation threw a pear:", err);
            setImageGenFailed(true);
            return null;
        } finally {
            setIsGeneratingImage(false);
        }
    };

    // Free retry (0 tokens) when initial Masterpiece image generation fails or user reports a visual mismatch
    const handleRetryMasterpieceImage = async (
        fallbackTitle = '',
        styleOptsOverride = null,
        correctiveNote = ''
    ) => {
        const basePrompt = lastImagePrompt || fallbackTitle || 'Whole-food plant-based dish';
        const promptToUse = correctiveNote
            ? `${basePrompt}. Important visual correction: ${correctiveNote}`
            : basePrompt;
        const styleToUse = styleOptsOverride || imageStyleOptions;
        if (styleOptsOverride) {
            setImageStyleOptions(styleOptsOverride);
        }
        return await triggerMasterpieceImageGeneration(promptToUse, styleToUse);
    };

    const processChatTurn = async (
        newUserMessageText,
        prefs,
        baseHistory = chatHistory,
        sessionIdOverride = currentSessionId,
        referenceData = null,
        imageOptionsOverride = null
    ) => {
        if (engineMode === 'full' && baseHistory.length === 0) {
            if (Number(user?.generation_tokens ?? 0) < 1) {
                await promptPurchaseTokens(1, 'Creating a Full Masterpiece Recipe');
                return;
            }

            const tokenResult = await spendToken(1, 'Creating a Full Masterpiece Recipe');

            if (tokenResult?.cancelled) {
                return;
            }
            
            if (!tokenResult?.success) {
                alert(`Cheeky! The till wouldn't open: ${tokenResult?.message || 'Unable to verify tokens.'}`);
                return; 
            }
        }

        const activeSessionId = sessionIdOverride || currentSessionId || `chat_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

        setIsLoading(true);
        setError(null);
        setDietaryPrefs(prefs);

        const { apiParts, displayParts, imageSubjectHint } = buildReferencePayload({
            userPrompt: newUserMessageText,
            pastedReference: referenceData?.pastedReference || '',
            uploadedDoc: referenceData?.uploadedDoc || null,
            engineMode,
            isInitialTurn: baseHistory.length === 0,
        });

        const updatedHistory = [
            ...baseHistory, 
            { role: 'user', parts: apiParts, displayParts }
        ];

        // Clean payload for the Gemini API (strips UI-only displayParts)
        const apiHistory = updatedHistory.map(({ role, parts }) => ({ role, parts }));

        try {
            const isChatActive = engineMode === 'chat';
            const catalogToUse =
                publishedRecipes.length > 0 ? publishedRecipes : await fetchPublishedRecipesCatalog();
            const publishedCatalogSection = buildPublishedRecipesPromptSection(catalogToUse, 80);
            const systemInstructions = getSystemInstructions(
                prefs,
                currentUserName,
                isChatActive,
                publishedCatalogSection,
                user?.allergies || ''
            );
            
            const isShouldGenerateMasterpieceImg = engineMode === 'full' && baseHistory.length === 0;
            const activeImageOpts = imageOptionsOverride || imageStyleOptions;
            if (isShouldGenerateMasterpieceImg) {
                setIsGeneratingImage(true);
                setImageGenFailed(false);
                setLastImagePrompt(imageSubjectHint);
            }

            const modelReplyText = await sendChatMessage(apiHistory, systemInstructions);

            let emmaCommentary = '';
            let recipeMarkdown = modelReplyText;

            if (!isChatActive) {
                const titleMatchIndex = modelReplyText.indexOf('# ');
                if (titleMatchIndex > 0) {
                    emmaCommentary = modelReplyText.substring(0, titleMatchIndex).trim();
                    recipeMarkdown = modelReplyText.substring(titleMatchIndex).trim();
                }
                recipeMarkdown = recipeMarkdown.replace(
                    /^(#\s+)(?:\*+\s*)?\[([^\]]+)\](?:\s*\*+)?(\s*(?:\r?\n|$))/,
                    '$1$2$3'
                );
            }

            const finalHistory = [
                ...updatedHistory,
                { 
                    role: 'model', 
                    parts: [{ text: modelReplyText }], 
                    displayParts: { commentary: emmaCommentary, recipe: recipeMarkdown } 
                }
            ];

            setChatHistory(finalHistory);
            setCurrentSessionId(activeSessionId);

            if (isShouldGenerateMasterpieceImg) {
                const resolvedImagePrompt = extractGeneratedDishPrompt(recipeMarkdown, imageSubjectHint);
                setLastImagePrompt(resolvedImagePrompt);
                triggerMasterpieceImageGeneration(resolvedImagePrompt, activeImageOpts);
            }

            if (
                engineMode === 'full' &&
                baseHistory.length === 0 &&
                localStorage.getItem('emmaMasterpieceSaveReminderDismissed') !== 'true'
            ) {
                setShowMasterpieceSaveModal(true);
            }

            const { chats } = await saveChatSession(user?.id, {
                id: activeSessionId,
                engineMode,
                dietaryPrefs: prefs,
                chatHistory: finalHistory,
            });
            setRecentChats(chats);

        } catch (err) {
            console.error("Dashboard caught an error:", err);
            setIsGeneratingImage(false);
            setError(err.message || "Something went wrong. Try again.");
        } finally {
            setIsLoading(false);
        }
    };

    const handleInitialGenerate = (userRequest, formPrefs, referenceData = null, formImageOptions = DEFAULT_IMAGE_STYLE_OPTIONS) => {
        const newSessionId = `chat_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        const resolvedStyleOpts = formImageOptions || { ...DEFAULT_IMAGE_STYLE_OPTIONS };
        setPrefillPrompt('');
        setCurrentSessionId(newSessionId);
        setShowRecentChats(false);
        setChatHistory([]);
        setRecipeImage(null);
        setIsGeneratingImage(false);
        setImageGenFailed(false);
        setLastImagePrompt('');
        setImageStyleOptions(resolvedStyleOpts);

        processChatTurn(userRequest, formPrefs, [], newSessionId, referenceData, resolvedStyleOpts);
    };

    const handleFollowUpFileChange = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsParsingFollowUpFile(true);
        setFollowUpFileError(null);
        setShowFollowUpRef(true);
        try {
            const parsed = await parseReferenceFile(file);
            setFollowUpUploadedDoc(parsed);
        } catch (err) {
            setFollowUpFileError(err.message || 'Could not process the selected file.');
            setFollowUpUploadedDoc(null);
        } finally {
            setIsParsingFollowUpFile(false);
            if (e.target) {
                e.target.value = '';
            }
        }
    };

    const hasFollowUpRef = Boolean(followUpPastedRef.trim() || followUpUploadedDoc);
    const canSubmitFollowUp = Boolean(followUpText.trim() || hasFollowUpRef);

    const handleFollowUpSubmit = (e) => {
        e.preventDefault();
        if (!canSubmitFollowUp || isParsingFollowUpFile) return;

        const messageToSend = followUpText;
        const refData = hasFollowUpRef
            ? { pastedReference: followUpPastedRef, uploadedDoc: followUpUploadedDoc }
            : null;

        setFollowUpText('');
        setFollowUpPastedRef('');
        setFollowUpUploadedDoc(null);
        setFollowUpFileError(null);
        setShowFollowUpRef(false);

        processChatTurn(messageToSend, dietaryPrefs, chatHistory, currentSessionId, refData);
    };

    const isBroke = user?.generation_tokens <= 0;

    const buildChatContextForLive = () => {
        if (!Array.isArray(chatHistory) || chatHistory.length === 0) return null;

        const activeDietFlags = [
            dietaryPrefs?.oilFree ? 'Oil-Free' : 'Oil Allowed',
            dietaryPrefs?.glutenFree ? 'Gluten-Free' : null,
            dietaryPrefs?.sugarFree ? 'Refined Sugar-Free' : 'Refined Sugar Allowed',
        ]
            .filter(Boolean)
            .join(', ');

        const recentTurns = chatHistory.slice(-6).map((msg) => {
            if (msg.role === 'user') {
                const userTextParts = (msg.parts || [])
                    .filter((part) => part && typeof part.text === 'string')
                    .map((part) => part.text.trim())
                    .filter(Boolean);
                const fullUserTurn = userTextParts.join('\n') || msg.displayParts?.userText || '';
                const clipped =
                    fullUserTurn.length > 1200
                        ? `${fullUserTurn.slice(0, 1200).trim()}... [truncated]`
                        : fullUserTurn;
                return `${currentUserName}: ${clipped}`;
            }

            const emmaText = (msg.parts?.[0]?.text || msg.displayParts?.recipe || '').trim();
            const clipped =
                emmaText.length > 1200
                    ? `${emmaText.slice(0, 1200).trim()}... [truncated]`
                    : emmaText;
            return `Emma: ${clipped}`;
        });

        return `Active Dietary Settings: ${activeDietFlags}\n\nConversation Transcript:\n${recentTurns.join('\n\n')}`;
    };

    const handleLiveTranscriptTurn = ({ role, text }) => {
        const cleanText = String(text || '').trim();
        if (!cleanText) return;

        const activeSessionId =
            currentSessionId || `chat_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        if (!currentSessionId) {
            setCurrentSessionId(activeSessionId);
        }

        setChatHistory((prev) => {
            const next = [...prev];
            if (next.length === 0 && role === 'model') {
                next.push({
                    role: 'user',
                    parts: [{ text: 'Started Live Audio session with Emma.' }],
                    displayParts: {
                        userText: 'Started Live Audio session',
                        referenceBadges: ['🎙️ Live Audio'],
                    },
                });
            }

            const last = next[next.length - 1];
            if (last && last.role === role) {
                const prevText = (last.parts?.[0]?.text || '').trim();
                const mergedText = prevText ? `${prevText}\n${cleanText}` : cleanText;
                const updatedDisplayParts =
                    role === 'user'
                        ? {
                              ...last.displayParts,
                              userText: mergedText,
                              referenceBadges: last.displayParts?.referenceBadges?.includes('🎙️ Live Audio')
                                  ? last.displayParts.referenceBadges
                                  : [...(last.displayParts?.referenceBadges || []), '🎙️ Live Audio'],
                          }
                        : {
                              ...last.displayParts,
                              recipe: mergedText,
                          };
                next[next.length - 1] = {
                    ...last,
                    parts: [{ text: mergedText }],
                    displayParts: updatedDisplayParts,
                };
            } else if (role === 'user') {
                next.push({
                    role: 'user',
                    parts: [{ text: cleanText }],
                    displayParts: {
                        userText: cleanText,
                        referenceBadges: ['🎙️ Live Audio'],
                    },
                });
            } else {
                next.push({
                    role: 'model',
                    parts: [{ text: cleanText }],
                    displayParts: {
                        commentary: null,
                        recipe: cleanText,
                    },
                });
            }

            saveChatSession(user?.id, {
                id: activeSessionId,
                engineMode: engineMode === 'live' ? 'chat' : engineMode,
                dietaryPrefs,
                chatHistory: next,
            })
                .then(({ chats }) => {
                    if (Array.isArray(chats)) setRecentChats(chats);
                })
                .catch((err) => {
                    console.warn('Could not save live transcript to recent chats:', err);
                });

            return next;
        });
    };

    const handleToggleInlineLiveChat = () => {
        if (showInlineLiveChat) {
            setShowInlineLiveChat(false);
            return;
        }

        setShowInlineLiveChat(true);
        setTimeout(() => {
            inlineLivePanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 60);
    };

    const handleModeChange = async (nextMode) => {
        if (nextMode === 'full' && engineMode !== 'full' && Number(user?.generation_tokens ?? 0) < 1) {
            await promptPurchaseTokens(1, 'Creating a Full Masterpiece Recipe');
        }
        setShowInlineLiveChat(false);
        setEngineMode(nextMode);
    };

    const handleResetEngine = useCallback(() => {
        setCurrentSessionId(null);
        setChatHistory([]);
        setRecipeImage(null);
        setIsGeneratingImage(false);
        setImageGenFailed(false);
        setLastImagePrompt('');
        setImageStyleOptions({ ...DEFAULT_IMAGE_STYLE_OPTIONS });
        setFollowUpText('');
        setShowFollowUpRef(false);
        setFollowUpPastedRef('');
        setFollowUpUploadedDoc(null);
        setFollowUpFileError(null);
        setShowInlineLiveChat(false);
        setPrefillPrompt('');
        setError(null);
    }, []);

    const handleLaunchIdeaInForge = useCallback(
        ({ mode, prompt }) => {
            const targetMode = mode === 'full' ? 'full' : 'draft';
            handleResetEngine();
            setShowRecentChats(false);
            setEngineMode(targetMode);
            setPrefillPrompt(String(prompt || ''));
            setPrefillKey((prev) => prev + 1);
            window.scrollTo({ top: 0, behavior: 'smooth' });
            if (targetMode === 'full' && Number(user?.generation_tokens ?? 0) < 1) {
                promptPurchaseTokens(1, 'Creating a Full Masterpiece Recipe');
            }
        },
        [handleResetEngine, promptPurchaseTokens, user?.generation_tokens]
    );

    const hasHandledInitialPrefillRef = useRef(false);
    useEffect(() => {
        const state = location.state;
        if (!state || typeof state !== 'object' || !state.prefillPrompt) return;

        const targetMode = state.prefillMode === 'full' ? 'full' : 'draft';
        const isFirstMountConsume = !hasHandledInitialPrefillRef.current;
        hasHandledInitialPrefillRef.current = true;

        window.scrollTo({ top: 0, behavior: 'smooth' });
        navigate('/engine', { replace: true, state: null });

        if (targetMode === 'full' && Number(user?.generation_tokens ?? 0) < 1) {
            promptPurchaseTokens(1, 'Creating a Full Masterpiece Recipe');
        }

        if (!isFirstMountConsume) {
            const timer = setTimeout(() => {
                handleLaunchIdeaInForge({
                    mode: targetMode,
                    prompt: state.prefillPrompt,
                });
            }, 0);
            return () => clearTimeout(timer);
        }
        return undefined;
    }, [location.state, navigate, promptPurchaseTokens, user?.generation_tokens, handleLaunchIdeaInForge]);

    const handleLoadSession = (session) => {
        setCurrentSessionId(session.id);
        setEngineMode(session.engineMode || 'chat');
        setDietaryPrefs(session.dietaryPrefs || { oilFree: true, glutenFree: false, sugarFree: true });
        setChatHistory(session.chatHistory || []);
        setRecipeImage(null);
        setIsGeneratingImage(false);
        setImageGenFailed(false);
        setLastImagePrompt('');
        setShowFollowUpRef(false);
        setFollowUpPastedRef('');
        setFollowUpUploadedDoc(null);
        setFollowUpFileError(null);
        setShowInlineLiveChat(false);
        setError(null);
        setShowRecentChats(false);
    };

    const handleDeleteSession = async (e, sessionId) => {
        e.stopPropagation();
        const updated = await deleteChatSession(user?.id, sessionId);
        setRecentChats(updated);
        if (sessionId === currentSessionId) {
            handleResetEngine();
        }
    };

    const handleClearAllSessions = async () => {
        if (window.confirm('Clear all saved chats?')) {
            const updated = await clearAllChatSessions(user?.id);
            setRecentChats(updated);
            setShowRecentChats(false);
        }
    };

    const activeSession = recentChats.find((c) => c.id === currentSessionId);

    const getCurrentExportPayload = () => ({
        chatHistory,
        userName: currentUserName,
        title: activeSession?.title || deriveChatTitle(chatHistory, engineMode),
        createdAt: activeSession?.createdAt || Date.now(),
        engineMode,
    });

    const handleExportCurrentPdf = () => {
        if (chatHistory.length === 0) return;
        exportChatToPdf(getCurrentExportPayload());
    };

    const handleExportSessionTxt = (e, session) => {
        e.stopPropagation();
        exportChatToTxt({
            chatHistory: session.chatHistory || [],
            userName: currentUserName,
            title: session.title,
            createdAt: session.createdAt,
            engineMode: session.engineMode || 'chat',
        });
    };

    const handleExportSessionPdf = (e, session) => {
        e.stopPropagation();
        exportChatToPdf({
            chatHistory: session.chatHistory || [],
            userName: currentUserName,
            title: session.title,
            createdAt: session.createdAt,
            engineMode: session.engineMode || 'chat',
        });
    };

    const getModeIcon = (mode) => {
        if (mode === 'full') return '📸';
        if (mode === 'draft') return '📝';
        return '💬';
    };

    return (
        <div className="recipe-dashboard-container">
            {/* Welcome Modal Restored */}
            {showWelcomeModal && (
                <div className="welcome-modal-overlay">
                    <div className="welcome-modal-content">
                        <h3>Welcome to the Flavor Forge, {currentUserName}! 👩‍🍳</h3>
                        <p>Right then, let’s get one thing straight: I am not just a glorified recipe dispenser; I am your new culinary confidante.</p>
                        <p><strong>Chatting /w Emma and Creating Basic Recipes</strong> are absolutely free of charge. </p>
                        <p>However, if you fancy something truly spectacular, switch over to <strong>Masterpiece Mode</strong>. That will cost you a shiny token, but it forces me to do all the tedious macro-math and paint you a gorgeous picture of the dish.</p>
                        
                        <div className="modal-preferences">
                            <label className="checkbox-label">
                                <input 
                                    type="checkbox" 
                                    checked={dontShowAgain}
                                    onChange={(e) => setDontShowAgain(e.target.checked)}
                                />
                                Don't show this bloody message again
                            </label>
                        </div>

                        <button 
                            className="dismiss-modal-btn" 
                            onClick={handleDismissWelcome}
                        >
                            Right, let's get cooking!
                        </button>
                    </div>
                </div>
            )}

            {showMasterpieceSaveModal && (
                <div className="welcome-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="masterpiece-save-title">
                    <div className="welcome-modal-content">
                        <h3 id="masterpiece-save-title">Save Your Masterpiece!</h3>
                        <p>
                            Your Masterpiece recipe is ready! Be sure to click <strong>Save Full Recipe</strong> below the recipe card to publish it to The Veggie Vault and keep it permanently.
                        </p>
                        <p>
                            While this conversation is stored in your Recent Chats for 30 days, saving the recipe to the Vault prevents losing it and shares it with the community.
                        </p>

                        <div className="modal-preferences">
                            <label className="checkbox-label">
                                <input
                                    type="checkbox"
                                    checked={dontShowMasterpieceSaveAgain}
                                    onChange={(e) => setDontShowMasterpieceSaveAgain(e.target.checked)}
                                />
                                Don&apos;t show this reminder again
                            </label>
                        </div>

                        <button
                            type="button"
                            className="dismiss-modal-btn"
                            onClick={handleDismissMasterpieceSaveModal}
                        >
                            Got it!
                        </button>
                    </div>
                </div>
            )}

            <header className="dashboard-header">
                <h2>Emma's Flavor Forge</h2>
                <p>Plant-based masterpieces, custom-forged for your exact cravings and dietary quirks.</p>
                {user?.allergies && (
                    <div
                        style={{
                            marginTop: '0.75rem',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            flexWrap: 'wrap',
                            padding: '0.4rem 0.9rem',
                            borderRadius: '9999px',
                            backgroundColor: '#fef2f2',
                            border: '1px solid #fecaca',
                            color: '#991b1b',
                            fontSize: '0.84rem',
                            fontWeight: 600,
                        }}
                    >
                        <span>🛡️ Allergy Protection Active — Auto-avoiding: <strong>{user.allergies}</strong></span>
                        <Link to="/profile" style={{ color: '#991b1b', textDecoration: 'underline', fontWeight: 700 }}>
                            Edit
                        </Link>
                    </div>
                )}
            </header>

            {chatHistory.length === 0 && (
                <>
                    <div className="mode-selector-container">
                        <label className={`mode-label ${engineMode === 'full' ? 'active' : ''}`}>
                            <input type="radio" name="engineMode" value="full" checked={engineMode === 'full'} onChange={(e) => handleModeChange(e.target.value)} />
                            📸 Create Masterpiece (1 Token)
                        </label>
                        <label className={`mode-label ${engineMode === 'draft' ? 'active' : ''}`}>
                            <input type="radio" name="engineMode" value="draft" checked={engineMode === 'draft'} onChange={(e) => handleModeChange(e.target.value)} />
                            📝 Create Recipe
                        </label>
                        <label className={`mode-label ${engineMode === 'chat' ? 'active' : ''}`}>
                            <input type="radio" name="engineMode" value="chat" checked={engineMode === 'chat'} onChange={(e) => handleModeChange(e.target.value)} />
                            💬 Chat /w Emma
                        </label>
                    </div>

                    <RecipeForm 
                        key={prefillKey}
                        onGenerate={handleInitialGenerate} 
                        isLoading={isLoading} 
                        isBroke={isBroke && engineMode === 'full'} 
                        engineMode={engineMode}
                        onToggleLiveChat={engineMode === 'chat' ? handleToggleInlineLiveChat : null}
                        showLiveChat={showInlineLiveChat}
                        initialPrompt={prefillPrompt}
                        shouldFocusPrompt={prefillKey > 0}
                    />

                    {showInlineLiveChat && engineMode === 'chat' && (
                        <section ref={inlineLivePanelRef} className="inline-live-chat-panel" aria-label="Live Audio Chat with Emma">
                            <div className="inline-live-chat-header">
                                <div>
                                    <strong>🎙️ Live Audio Session Active</strong>
                                    <span>Talk with Emma out loud — everything spoken is saved into this conversation.</span>
                                </div>
                                <button
                                    type="button"
                                    className="close-inline-live-btn"
                                    onClick={() => {
                                        setShowInlineLiveChat(false);
                                    }}
                                >
                                    Close Panel
                                </button>
                            </div>
                            <LiveChat
                                chatContext={buildChatContextForLive()}
                                publishedRecipesContext={publishedCatalogVocal}
                                onTranscriptTurn={handleLiveTranscriptTurn}
                                autoStart={true}
                            />
                        </section>
                    )}
                </>
            )}

            {error && (
                <div className="error-banner">
                    <p><strong>Oi!</strong> {error}</p>
                </div>
            )}

            {chatHistory.length > 0 && engineMode !== 'live' && (
                <div className="action-row top-action">
                    <button
                        type="button"
                        onClick={handleExportCurrentPdf}
                        disabled={isLoading}
                        className="chat-tool-btn export-pdf-btn"
                        title="Download this chat as a formatted PDF (.pdf) file"
                    >
                        📕 Save PDF
                    </button>
                    <button
                        type="button"
                        onClick={() => setShowRecentChats((prev) => !prev)}
                        disabled={isLoading}
                        className={`chat-tool-btn recent-chats-btn ${showRecentChats ? 'active' : ''}`}
                        title="Browse recent chats saved in your account for 30 days"
                    >
                        🕒 Recent Chats ({recentChats.length})
                    </button>
                    <button 
                        onClick={handleResetEngine}
                        disabled={isLoading}
                        className="new-chat-btn"
                    >
                        New Chat
                    </button>
                </div>
            )}

            {((chatHistory.length === 0 && engineMode !== 'live' && recentChats.length > 0) ||
                (showRecentChats && chatHistory.length > 0)) && (
                <section className="recent-chats-panel" aria-label="Recent chat sessions">
                    <div className="recent-chats-header">
                        <h3>🕒 Recent Chats (Saved in your account for 30 days)</h3>
                        <button
                            type="button"
                            onClick={handleClearAllSessions}
                            className="clear-chats-btn"
                        >
                            Clear All
                        </button>
                    </div>
                    <div className="recent-chats-list">
                        {recentChats.map((session) => {
                            const isActiveSession = session.id === currentSessionId;
                            const msgCount = session.chatHistory?.length || 0;
                            const updatedStr = new Date(session.updatedAt || session.createdAt).toLocaleString();
                            const daysLeft = getDaysRemaining(session);

                            return (
                                <div
                                    key={session.id}
                                    className={`recent-chat-item ${isActiveSession ? 'active-session' : ''}`}
                                    onClick={() => handleLoadSession(session)}
                                    role="button"
                                    tabIndex={0}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' || e.key === ' ') {
                                            e.preventDefault();
                                            handleLoadSession(session);
                                        }
                                    }}
                                >
                                    <div className="recent-chat-info">
                                        <div className="recent-chat-title">
                                            <span>{getModeIcon(session.engineMode)}</span>
                                            <span>{session.title || 'Chat with Emma'}</span>
                                        </div>
                                        <div className="recent-chat-meta">
                                            <span>{updatedStr}</span>
                                            <span>•</span>
                                            <span>{msgCount} {msgCount === 1 ? 'message' : 'messages'}</span>
                                            <span className="expiry-badge">
                                                Expires in {daysLeft}d
                                            </span>
                                        </div>
                                    </div>
                                    <div className="recent-chat-actions">
                                        <button
                                            type="button"
                                            className="recent-action-btn open-btn"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleLoadSession(session);
                                            }}
                                        >
                                            Open
                                        </button>
                                        <button
                                            type="button"
                                            className="recent-action-btn txt-btn"
                                            onClick={(e) => handleExportSessionTxt(e, session)}
                                            title="Export as .txt"
                                        >
                                            📄 TXT
                                        </button>
                                        <button
                                            type="button"
                                            className="recent-action-btn pdf-btn"
                                            onClick={(e) => handleExportSessionPdf(e, session)}
                                            title="Export as .pdf"
                                        >
                                            📕 PDF
                                        </button>
                                        <button
                                            type="button"
                                            className="recent-action-btn delete-btn"
                                            onClick={(e) => handleDeleteSession(e, session.id)}
                                            title="Delete saved chat"
                                            aria-label={`Delete ${session.title}`}
                                        >
                                            🗑️
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </section>
            )}

            {/* Chat Container Restored! */}
            <div className="chat-container">
                {chatHistory.map((msg, index) => {
                    if (msg.role === 'user') {
                        const userDisplayText = msg.displayParts?.userText || msg.parts?.[0]?.text || '';
                        const refBadges = msg.displayParts?.referenceBadges || [];
                        return (
                            <div key={index} className="user-message">
                                <div>
                                    <strong>{currentUserName}:</strong> {userDisplayText}
                                </div>
                                {refBadges.length > 0 && (
                                    <div className="user-ref-badges">
                                        {refBadges.map((badge, badgeIdx) => (
                                            <span key={badgeIdx} className="user-ref-badge">
                                                {badge}
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>
                        );
                    } else {
                        const rawCommentary = msg.displayParts?.commentary;
                        const rawRecipeText = msg.displayParts?.recipe || msg.parts?.[0]?.text || '';
                        const { cleanText: cleanCommentary, ideas: commentaryIdeas } = rawCommentary
                            ? extractRecipeIdeas(rawCommentary)
                            : { cleanText: '', ideas: [] };
                        const { cleanText: cleanRecipeText, ideas: recipeIdeas } = extractRecipeIdeas(rawRecipeText);
                        const mergedIdeas = [...recipeIdeas, ...commentaryIdeas].filter(
                            (idea, idx, arr) =>
                                arr.findIndex(
                                    (other) => other.title.toLowerCase() === idea.title.toLowerCase()
                                ) === idx
                        );

                        return (
                            <React.Fragment key={index}>
                                {cleanCommentary && (
                                    <div className="emma-banter-bubble" style={{ 
                                        backgroundColor: '#faf5ff', 
                                        padding: '1.2rem', 
                                        borderRadius: '12px', 
                                        marginBottom: '1rem', 
                                        color: '#4a5568', 
                                        borderLeft: '4px solid #805ad5',
                                        boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
                                    }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <strong>Emma:</strong> 
                                            <button
                                                onClick={() => handleSpeak(cleanCommentary)}
                                                style={{
                                                    background: 'transparent',
                                                    border: 'none',
                                                    cursor: 'pointer',
                                                    fontSize: '1.2rem',
                                                    opacity: '0.5',
                                                    padding: '0',
                                                    transition: 'opacity 0.2s ease'
                                                }}
                                                title="Listen to Emma"
                                                onMouseEnter={(e) => e.target.style.opacity = '1'}
                                                onMouseLeave={(e) => e.target.style.opacity = '0.5'}
                                            >
                                                {speechState === 'playing' ? '⏸️' : '🔊'}
                                            </button>
                                        </div>
                                        <div style={{ marginTop: '0.5rem', lineHeight: '1.5' }}>
                                            <EmmaMarkdown>{cleanCommentary}</EmmaMarkdown>
                                        </div>
                                    </div>
                                )}
                                
                                <RecipeResult 
                                    recipeMarkdown={cleanRecipeText} 
                                    imageUrl={engineMode === 'full' ? recipeImage : null} 
                                    isDraft={engineMode === 'draft'} 
                                    isChat={engineMode === 'chat'}
                                    dietaryPrefs={dietaryPrefs}
                                    isGeneratingImage={engineMode === 'full' ? isGeneratingImage : false}
                                    imageGenFailed={engineMode === 'full' ? imageGenFailed : false}
                                    onRetryImage={engineMode === 'full' ? handleRetryMasterpieceImage : null}
                                    imageStyleOptions={imageStyleOptions}
                                    onUpdateImageStyleOptions={setImageStyleOptions}
                                    onToggleLiveChat={handleToggleInlineLiveChat}
                                    externalShowLiveChat={showInlineLiveChat}
                                    onEditRecipe={handleFocusFollowUpInput}
                                />
                                {mergedIdeas.length > 0 && (
                                    <RecipeIdeaActions
                                        ideas={mergedIdeas}
                                        onSelectIdea={handleLaunchIdeaInForge}
                                    />
                                )}
                            </React.Fragment>
                        );
                    }
                })}
            </div>

            {showInlineLiveChat && chatHistory.length > 0 && engineMode !== 'live' && (
                <section ref={inlineLivePanelRef} className="inline-live-chat-panel" aria-label="Live Audio Chat with Emma">
                    <div className="inline-live-chat-header">
                        <div>
                            <strong>🎙️ Live Audio Session Active</strong>
                            <span>Emma has read your current chat conversation and is ready to talk out loud.</span>
                        </div>
                        <button
                            type="button"
                            className="close-inline-live-btn"
                            onClick={() => {
                                setShowInlineLiveChat(false);
                            }}
                        >
                            Close Panel
                        </button>
                    </div>
                    <LiveChat
                        chatContext={buildChatContextForLive()}
                        publishedRecipesContext={publishedCatalogVocal}
                        onTranscriptTurn={handleLiveTranscriptTurn}
                        autoStart={true}
                    />
                </section>
            )}

            {/* Follow-up Form with Reference Attachment Support */}
            {chatHistory.length > 0 && (
                <form onSubmit={handleFollowUpSubmit} className="follow-up-form-wrapper">
                    <div className="follow-up-form">
                        <div className="follow-up-input-wrap">
                            <textarea
                                ref={followUpInputRef}
                                rows={1}
                                value={followUpText}
                                onChange={(e) => setFollowUpText(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        if (canSubmitFollowUp && !isLoading && !isParsingFollowUpFile) {
                                            handleFollowUpSubmit(e);
                                        }
                                    }
                                }}
                                placeholder={
                                    engineMode === 'chat'
                                        ? "E.g., Let's natter about plant protein, or adapt an attached recipe..."
                                        : "Chat with Emma or ask her to tweak/iterate on this recipe..."
                                }
                                disabled={isLoading}
                                className="follow-up-input"
                            />
                            <div className="follow-up-mic-slot">
                                <VoiceDictationButton
                                    value={followUpText}
                                    onChange={setFollowUpText}
                                    disabled={isLoading}
                                />
                            </div>
                        </div>
                        <div className="follow-up-action-btns">
                            <button
                                type="button"
                                className={`follow-up-ref-btn ${(showFollowUpRef || hasFollowUpRef) ? 'active' : ''}`}
                                onClick={() => setShowFollowUpRef((prev) => !prev)}
                                disabled={isLoading}
                                title="Attach a reference document or paste a base recipe"
                            >
                                📎 {hasFollowUpRef ? 'Ref Added' : 'Reference'}
                            </button>
                            <button 
                                type="submit" 
                                className="submit-btn follow-up-submit"
                                disabled={isLoading || isParsingFollowUpFile || !canSubmitFollowUp}
                            >
                                {isLoading ? "Thinking..." : "Send"}
                            </button>
                        </div>
                    </div>

                    {showFollowUpRef && (
                        <div className="follow-up-ref-drawer">
                            <div className="reference-upload-row">
                                <label className={`reference-upload-btn ${(isLoading || isParsingFollowUpFile) ? 'disabled' : ''}`}>
                                    <span>
                                        {isParsingFollowUpFile
                                            ? '⏳ Reading Document...'
                                            : '📄 Upload Document (.txt, .md, .docx, .pdf, .csv, .json, or image)'}
                                    </span>
                                    <input
                                        type="file"
                                        accept={ACCEPTED_REFERENCE_EXTENSIONS}
                                        onChange={handleFollowUpFileChange}
                                        disabled={isLoading || isParsingFollowUpFile}
                                        hidden
                                    />
                                </label>

                                {followUpUploadedDoc && (
                                    <div className="reference-file-chip">
                                        <span className="reference-chip-name">
                                            📄 {followUpUploadedDoc.fileName} ({formatFileSize(followUpUploadedDoc.fileSize)})
                                        </span>
                                        <button
                                            type="button"
                                            className="reference-remove-btn"
                                            onClick={() => {
                                                setFollowUpUploadedDoc(null);
                                                setFollowUpFileError(null);
                                            }}
                                            disabled={isLoading}
                                            aria-label="Remove follow-up document"
                                        >
                                            ✕
                                        </button>
                                    </div>
                                )}
                            </div>

                            {followUpFileError && (
                                <div className="reference-error-msg" role="alert">
                                    {followUpFileError}
                                </div>
                            )}

                            <div className="reference-paste-group">
                                <div className="reference-paste-header">
                                    <label htmlFor="followup-reference-paste">
                                        📋 Or paste a recipe / reference text for this turn
                                    </label>
                                    {followUpPastedRef && (
                                        <button
                                            type="button"
                                            className="reference-clear-paste-btn"
                                            onClick={() => setFollowUpPastedRef('')}
                                            disabled={isLoading}
                                        >
                                            Clear Text
                                        </button>
                                    )}
                                </div>
                                <textarea
                                    ref={followUpRefPasteRef}
                                    id="followup-reference-paste"
                                    className="reference-paste-textarea"
                                    rows="3"
                                    value={followUpPastedRef}
                                    onChange={(e) => setFollowUpPastedRef(e.target.value)}
                                    placeholder="Paste a recipe or notes here and ask Emma to adapt or analyze it..."
                                    disabled={isLoading}
                                />
                            </div>
                        </div>
                    )}
                </form>
            )}
            
            {chatHistory.length > 0 && !isLoading && showBottomBin && engineMode !== 'live' && (
                <div className="action-row bottom-action">
                    <button 
                        onClick={handleResetEngine}
                        disabled={isLoading}
                        className="new-chat-btn"
                    >
                        New Chat
                    </button>
                </div>
            )}
        </div>
    );
};

export default EmmasRecipeEngine;