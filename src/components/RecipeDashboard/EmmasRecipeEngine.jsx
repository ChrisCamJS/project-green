// src/components/RecipeDashboard/EmmasRecipeEngine.jsx

import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown'; 
import { getSystemInstructions } from '../../utils/promptBuilder';
import { sendChatMessage, generateRecipeImage } from '../../services/geminiApi'; 
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

    const processChatTurn = async (newUserMessageText, prefs) => {
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

        setIsLoading(true);
        setError(null);
        setDietaryPrefs(prefs);

        const updatedHistory = [
            ...chatHistory, 
            { role: 'user', parts: [{ text: newUserMessageText }] }
        ];

        try {
            const isChatActive = engineMode === 'chat';
            const systemInstructions = getSystemInstructions(prefs, currentUserName, isChatActive);
            
            if (engineMode === 'full' && chatHistory.length === 0) {
                generateRecipeImage(newUserMessageText)
                    .then(base64Data => {
                        if (base64Data) {
                            setRecipeImage(`data:image/jpeg;base64,${base64Data}`);
                        }
                    })
                    .catch(err => console.error("The image generation threw a pear:", err));
            }

            const modelReplyText = await sendChatMessage(updatedHistory, systemInstructions);

            let emmaCommentary = '';
            let recipeMarkdown = modelReplyText;

            if (!isChatActive) {
                const titleMatchIndex = modelReplyText.indexOf('# ');
                if (titleMatchIndex > 0) {
                    emmaCommentary = modelReplyText.substring(0, titleMatchIndex).trim();
                    recipeMarkdown = modelReplyText.substring(titleMatchIndex).trim();
                }
            }

            setChatHistory([
                ...updatedHistory,
                { 
                    role: 'model', 
                    parts: [{ text: modelReplyText }], 
                    displayParts: { commentary: emmaCommentary, recipe: recipeMarkdown } 
                }
            ]);

        } catch (err) {
            console.error("Dashboard caught an error:", err);
            setError(err.message || "Something went wrong. Try again.");
        } finally {
            setIsLoading(false);
        }
    };

    const handleInitialGenerate = (userRequest, formPrefs) => {
        setChatHistory([]);
        setRecipeImage(null); 
        
        const formattedRequest = engineMode === 'chat' 
            ? userRequest 
            : `I want a recipe for: ${userRequest}`;
            
        processChatTurn(formattedRequest, formPrefs);
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
        setChatHistory([]);
        setRecipeImage(null);
        setFollowUpText('');
        setError(null);
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
                        onClick={handleResetEngine}
                        disabled={isLoading}
                        className="new-chat-btn"
                    >
                        New Chat
                    </button>
                </div>
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