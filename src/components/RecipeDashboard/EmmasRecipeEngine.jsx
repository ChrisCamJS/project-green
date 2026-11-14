// src/components/RecipeDashboard/EmmasRecipeEngine.jsx

import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown'; 
import { getSystemInstructions } from '../../utils/promptBuilder';
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
    const { user, spendToken, confirmTokenUsage, promptPurchaseTokens } = useAuth();
    const currentUserName = user?.username || 'Love';

    const { speechState, handleSpeak } = useEmmaVoice();

    const [chatHistory, setChatHistory] = useState([]);
    const [currentSessionId, setCurrentSessionId] = useState(null);
    const [recentChats, setRecentChats] = useState([]);
    const [showRecentChats, setShowRecentChats] = useState(false);

    useEffect(() => {
        setRecentChats(loadRecentChats(user?.id));
    }, [user?.id]);
    
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

    const [engineMode, setEngineMode] = useState('chat');
    const [showBottomBin, setShowBottomBin] = useState(false);
    const [showInlineLiveChat, setShowInlineLiveChat] = useState(false);
    const [livePreConfirmed, setLivePreConfirmed] = useState(false);

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

    // Free retry (0 tokens) when initial Masterpiece image generation fails
    const handleRetryMasterpieceImage = async (fallbackTitle = '', styleOptsOverride = null) => {
        const promptToUse = lastImagePrompt || fallbackTitle || 'Whole-food plant-based dish';
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
        if (engineMode === 'full') {
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
            const systemInstructions = getSystemInstructions(prefs, currentUserName, isChatActive);
            
            if (engineMode === 'full' && baseHistory.length === 0) {
                const activeImageOpts = imageOptionsOverride || imageStyleOptions;
                setLastImagePrompt(imageSubjectHint);
                triggerMasterpieceImageGeneration(imageSubjectHint, activeImageOpts);
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

            const { chats } = saveChatSession(user?.id, {
                id: activeSessionId,
                engineMode,
                dietaryPrefs: prefs,
                chatHistory: finalHistory,
            });
            setRecentChats(chats);

        } catch (err) {
            console.error("Dashboard caught an error:", err);
            setError(err.message || "Something went wrong. Try again.");
        } finally {
            setIsLoading(false);
        }
    };

    const handleInitialGenerate = (userRequest, formPrefs, referenceData = null, formImageOptions = DEFAULT_IMAGE_STYLE_OPTIONS) => {
        const newSessionId = `chat_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        const resolvedStyleOpts = formImageOptions || { ...DEFAULT_IMAGE_STYLE_OPTIONS };
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

        const recentTurns = chatHistory.slice(-10).map((msg) => {
            if (msg.role === 'user') {
                const userTextParts = (msg.parts || [])
                    .filter((part) => part && typeof part.text === 'string')
                    .map((part) => part.text.trim())
                    .filter(Boolean);
                const fullUserTurn = userTextParts.join('\n') || msg.displayParts?.userText || '';
                const clipped =
                    fullUserTurn.length > 2500
                        ? `${fullUserTurn.slice(0, 2500).trim()}... [truncated]`
                        : fullUserTurn;
                return `${currentUserName}: ${clipped}`;
            }

            const emmaText = (msg.parts?.[0]?.text || msg.displayParts?.recipe || '').trim();
            const clipped =
                emmaText.length > 2500
                    ? `${emmaText.slice(0, 2500).trim()}... [truncated]`
                    : emmaText;
            return `Emma: ${clipped}`;
        });

        return `Active Dietary Settings: ${activeDietFlags}\n\nConversation Transcript:\n${recentTurns.join('\n\n')}`;
    };

    const handleToggleInlineLiveChat = async () => {
        if (showInlineLiveChat) {
            setShowInlineLiveChat(false);
            setLivePreConfirmed(false);
            return;
        }

        const confirmed = await confirmTokenUsage(1, 'Entering Live Audio Mode with Emma');
        if (!confirmed) return;

        setLivePreConfirmed(true);
        setShowInlineLiveChat(true);
    };

    const handleModeChange = async (nextMode) => {
        if (nextMode === 'live' && engineMode !== 'live') {
            const confirmed = await confirmTokenUsage(1, 'Entering Live Audio Mode with Emma');
            if (!confirmed) return;
            setLivePreConfirmed(true);
        } else if (nextMode === 'full' && engineMode !== 'full' && Number(user?.generation_tokens ?? 0) < 1) {
            await promptPurchaseTokens(1, 'Creating a Full Masterpiece Recipe');
        }
        setEngineMode(nextMode);
    };

    const handleResetEngine = () => {
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
        setLivePreConfirmed(false);
        setError(null);
    };

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
        setLivePreConfirmed(false);
        setError(null);
        setShowRecentChats(false);
    };

    const handleDeleteSession = (e, sessionId) => {
        e.stopPropagation();
        const updated = deleteChatSession(user?.id, sessionId);
        setRecentChats(updated);
        if (sessionId === currentSessionId) {
            handleResetEngine();
        }
    };

    const handleClearAllSessions = () => {
        if (window.confirm('Clear all saved browser chats?')) {
            const updated = clearAllChatSessions(user?.id);
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

    const handleExportCurrentTxt = () => {
        if (chatHistory.length === 0) return;
        exportChatToTxt(getCurrentExportPayload());
    };

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

            <header className="dashboard-header">
                <h2>Emma's Flavor Forge</h2>
                <p>Plant-based masterpieces, custom-forged for your exact cravings and dietary quirks.</p>
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
                        <label className={`mode-label ${engineMode === 'live' ? 'active' : ''}`}>
                            <input type="radio" name="engineMode" value="live" checked={engineMode === 'live'} onChange={(e) => handleModeChange(e.target.value)} />
                            🎙️ Live Audio Session (1 Token)
                        </label>
                    </div>

                    {engineMode !== 'live' && (
                        <RecipeForm 
                            onGenerate={handleInitialGenerate} 
                            isLoading={isLoading} 
                            isBroke={isBroke && engineMode === 'full'} 
                            engineMode={engineMode}
                        />
                    )}
                    
                    {engineMode === 'live' && (
                        <div style={{ marginTop: '2rem' }}>
                            <LiveChat
                                chatContext={buildChatContextForLive()}
                                preConfirmed={livePreConfirmed}
                            />
                        </div>
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
                        onClick={handleToggleInlineLiveChat}
                        disabled={isLoading}
                        className={`chat-tool-btn live-audio-toggle-btn ${showInlineLiveChat ? 'active' : ''}`}
                        title="Continue this conversation in Live Audio Mode with Emma (1 Token per session)"
                    >
                        {showInlineLiveChat ? '🛑 Close Live Audio' : '🎙️ Go Live with Emma'}
                    </button>
                    <button
                        type="button"
                        onClick={handleExportCurrentTxt}
                        disabled={isLoading}
                        className="chat-tool-btn export-txt-btn"
                        title="Download this chat as a plain text (.txt) file"
                    >
                        📄 Save TXT
                    </button>
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
                        title="Browse recent chats saved in your browser for 10 days"
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
                        <h3>🕒 Recent Chats (Stored in browser for 10 days)</h3>
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
                        const commentary = msg.displayParts?.commentary;
                        const recipeText = msg.displayParts?.recipe || msg.parts?.[0]?.text || '';

                        return (
                            <React.Fragment key={index}>
                                {commentary && (
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
                                                onClick={() => handleSpeak(commentary)}
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
                                            <ReactMarkdown>{commentary}</ReactMarkdown>
                                        </div>
                                    </div>
                                )}
                                
                                <RecipeResult 
                                    recipeMarkdown={recipeText} 
                                    imageUrl={index === 1 ? recipeImage : null} 
                                    isDraft={engineMode === 'draft'} 
                                    isChat={engineMode === 'chat'}
                                    dietaryPrefs={dietaryPrefs}
                                    isGeneratingImage={index === 1 ? isGeneratingImage : false}
                                    imageGenFailed={index === 1 ? imageGenFailed : false}
                                    onRetryImage={index === 1 ? handleRetryMasterpieceImage : null}
                                    imageStyleOptions={imageStyleOptions}
                                    onUpdateImageStyleOptions={setImageStyleOptions}
                                    onToggleLiveChat={engineMode === 'chat' ? handleToggleInlineLiveChat : null}
                                    externalShowLiveChat={showInlineLiveChat}
                                />
                            </React.Fragment>
                        );
                    }
                })}
            </div>

            {showInlineLiveChat && chatHistory.length > 0 && engineMode !== 'live' && (
                <section className="inline-live-chat-panel" aria-label="Live Audio Chat with Emma">
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
                                setLivePreConfirmed(false);
                            }}
                        >
                            Close Panel
                        </button>
                    </div>
                    <LiveChat
                        chatContext={buildChatContextForLive()}
                        preConfirmed={livePreConfirmed}
                    />
                </section>
            )}

            {/* Follow-up Form with Reference Attachment Support */}
            {chatHistory.length > 0 && engineMode !== 'live' && (
                <form onSubmit={handleFollowUpSubmit} className="follow-up-form-wrapper">
                    <div className="follow-up-form">
                        <input 
                            type="text" 
                            value={followUpText}
                            onChange={(e) => setFollowUpText(e.target.value)}
                            placeholder={(isBroke && engineMode === 'full') 
                                ? "Out of tokens, love!" 
                                : "E.g., Let's natter about plant protein, or adapt an attached recipe..."}
                            disabled={isLoading || (isBroke && engineMode === 'full')}
                            className={`follow-up-input ${(isBroke && engineMode === 'full') ? 'broke-input' : ''}`}
                        />
                        <button
                            type="button"
                            className={`follow-up-ref-btn ${(showFollowUpRef || hasFollowUpRef) ? 'active' : ''}`}
                            onClick={() => setShowFollowUpRef((prev) => !prev)}
                            disabled={isLoading || (isBroke && engineMode === 'full')}
                            title="Attach a reference document or paste a base recipe"
                        >
                            📎 {hasFollowUpRef ? 'Ref Added' : 'Reference'}
                        </button>
                        <button 
                            type="submit" 
                            className={`submit-btn follow-up-submit ${(isBroke && engineMode === 'full') ? 'broke-btn' : ''}`}
                            disabled={isLoading || isParsingFollowUpFile || !canSubmitFollowUp || (isBroke && engineMode === 'full')}
                        >
                            {isLoading ? "Thinking..." : ((isBroke && engineMode === 'full') ? "🪙 Skint" : "Send")}
                        </button>
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