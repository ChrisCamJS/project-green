// src/components/RecipeDashboard/EmmasRecipeEngine.jsx

import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown'; 
import { getSystemInstructions } from '../../utils/promptBuilder';
import { sendChatMessage, generateRecipeImage } from '../../services/geminiApi'; 
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
    const { user, spendToken } = useAuth();
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
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    
    const [followUpText, setFollowUpText] = useState('');
    const [dietaryPrefs, setDietaryPrefs] = useState({
        oilFree: true,
        glutenFree: false,
        sugarFree: true 
    });

    const [engineMode, setEngineMode] = useState('chat');
    const [showBottomBin, setShowBottomBin] = useState(false);

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

    const triggerMasterpieceImageGeneration = async (promptText) => {
        setIsGeneratingImage(true);
        setImageGenFailed(false);
        try {
            const base64Data = await generateRecipeImage(promptText);
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
    const handleRetryMasterpieceImage = async (fallbackTitle = '') => {
        const promptToUse = lastImagePrompt || fallbackTitle || 'Whole-food plant-based dish';
        return await triggerMasterpieceImageGeneration(promptToUse);
    };

    const processChatTurn = async (newUserMessageText, prefs, baseHistory = chatHistory, sessionIdOverride = currentSessionId) => {
        if (engineMode === 'full') {
            if (user?.generation_tokens <= 0) {
                alert("Oh dear, love! Your token stash is completely empty. Switch to a Free mode or top up to keep generating images.");
                return; 
            }

            const tokenResult = await spendToken();
            
            if (!tokenResult.success) {
                alert(`Cheeky! The till wouldn't open: ${tokenResult.message}`);
                return; 
            }
        }

        const activeSessionId = sessionIdOverride || currentSessionId || `chat_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

        setIsLoading(true);
        setError(null);
        setDietaryPrefs(prefs);

        const updatedHistory = [
            ...baseHistory, 
            { role: 'user', parts: [{ text: newUserMessageText }] }
        ];

        // Clean payload for the Gemini API (strips UI-only displayParts)
        const apiHistory = updatedHistory.map(({ role, parts }) => ({ role, parts }));

        try {
            const isChatActive = engineMode === 'chat';
            const systemInstructions = getSystemInstructions(prefs, currentUserName, isChatActive);
            
            if (engineMode === 'full' && baseHistory.length === 0) {
                setLastImagePrompt(newUserMessageText);
                triggerMasterpieceImageGeneration(newUserMessageText);
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

    const handleInitialGenerate = (userRequest, formPrefs) => {
        const newSessionId = `chat_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        setCurrentSessionId(newSessionId);
        setShowRecentChats(false);
        setChatHistory([]);
        setRecipeImage(null);
        setIsGeneratingImage(false);
        setImageGenFailed(false);
        setLastImagePrompt('');
        
        const formattedRequest = engineMode === 'chat' 
            ? userRequest 
            : `I want a recipe for: ${userRequest}`;
            
        processChatTurn(formattedRequest, formPrefs, [], newSessionId);
    };

    const handleFollowUpSubmit = (e) => {
        e.preventDefault();
        if (!followUpText.trim()) return;
        
        const messageToSend = followUpText;
        setFollowUpText(''); 
        processChatTurn(messageToSend, dietaryPrefs);
    };

    const isBroke = user?.generation_tokens <= 0;

    const handleResetEngine = () => {
        setCurrentSessionId(null);
        setChatHistory([]);
        setRecipeImage(null);
        setIsGeneratingImage(false);
        setImageGenFailed(false);
        setLastImagePrompt('');
        setFollowUpText('');
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
                            <input type="radio" name="engineMode" value="full" checked={engineMode === 'full'} onChange={(e) => setEngineMode(e.target.value)} />
                            📸 Create Masterpiece (1 Token)
                        </label>
                        <label className={`mode-label ${engineMode === 'draft' ? 'active' : ''}`}>
                            <input type="radio" name="engineMode" value="draft" checked={engineMode === 'draft'} onChange={(e) => setEngineMode(e.target.value)} />
                            📝 Create Recipe
                        </label>
                        <label className={`mode-label ${engineMode === 'chat' ? 'active' : ''}`}>
                            <input type="radio" name="engineMode" value="chat" checked={engineMode === 'chat'} onChange={(e) => setEngineMode(e.target.value)} />
                            💬 Chat /w Emma
                        </label>
                        <label className={`mode-label ${engineMode === 'live' ? 'active' : ''}`}>
                            <input type="radio" name="engineMode" value="live" checked={engineMode === 'live'} onChange={(e) => setEngineMode(e.target.value)} />
                            🎙️ Live Audio Session
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
                            <LiveChat />
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
                        return (
                            <div key={index} className="user-message">
                                <strong>{currentUserName}:</strong> {msg.parts[0].text}
                            </div>
                        )
                    } else {
                        const commentary = msg.displayParts?.commentary;
                        const recipeText = msg.displayParts?.recipe || msg.parts[0].text;

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
                                />
                            </React.Fragment>
                        )
                    }
                })}
            </div>

            {/* Follow-up Form Restored */}
            {chatHistory.length > 0 && engineMode !== 'live' && (
                <form onSubmit={handleFollowUpSubmit} className="follow-up-form">
                    <input 
                        type="text" 
                        value={followUpText}
                        onChange={(e) => setFollowUpText(e.target.value)}
                        placeholder={(isBroke && engineMode === 'full') 
                            ? "Out of tokens, love!" 
                            : "E.g., Let's natter about plant protein, or draft a spicy stew..."}
                        disabled={isLoading || (isBroke && engineMode === 'full')}
                        className={`follow-up-input ${(isBroke && engineMode === 'full') ? 'broke-input' : ''}`}
                    />
                    <button 
                        type="submit" 
                        className={`submit-btn follow-up-submit ${(isBroke && engineMode === 'full') ? 'broke-btn' : ''}`}
                        disabled={isLoading || !followUpText.trim() || (isBroke && engineMode === 'full')}
                    >
                        {isLoading ? "Thinking..." : ((isBroke && engineMode === 'full') ? "🪙 Skint" : "Send")}
                    </button>
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