import React, { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../services/api';
import { sendChatMessage } from '../services/geminiApi';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import EmmaMarkdown from './EmmaMarkdown';
import VoiceDictationButton from './VoiceDictationButton';
import {
    buildAdminEmmaSystemPrompt,
    extractAdminRecipeActions,
} from '../utils/adminEmmaContext';
import './AdminEmmaChat.css';

const QUICK_PROMPTS = [
    'Audit recipes missing prep or cook times',
    'List all current draft recipes',
    'Find recipes missing macro nutrition data',
    'Check which recipes look gluten-free but lack the tag',
];

const AdminEmmaChat = ({ onRecipesUpdated }) => {
    const { user } = useAuth();
    const { addToast } = useToast();

    const [catalog, setCatalog] = useState([]);
    const [loadingCatalog, setLoadingCatalog] = useState(true);
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [busy, setBusy] = useState(false);
    const messagesEndRef = useRef(null);

    const loadCatalog = useCallback(async () => {
        setLoadingCatalog(true);
        try {
            const data = await api.adminGetRecipes();
            setCatalog(Array.isArray(data?.recipes) ? data.recipes : []);
        } catch (err) {
            console.error('Failed to load admin recipe catalog:', err);
            addToast(err.message || 'Failed to load recipe database catalog', 'error');
        } finally {
            setLoadingCatalog(false);
        }
    }, [addToast]);

    useEffect(() => {
        loadCatalog();
    }, [loadCatalog]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, busy]);

    const sendPrompt = async (promptText) => {
        const trimmed = (promptText || '').trim();
        if (!trimmed || busy || loadingCatalog) return;

        const userMsg = { role: 'user', text: trimmed };
        const nextMessages = [...messages, userMsg];
        setMessages(nextMessages);
        setInput('');
        setBusy(true);

        try {
            const apiHistory = nextMessages.map((m) => ({
                role: m.role,
                parts: [{ text: m.text }],
            }));
            const systemPrompt = buildAdminEmmaSystemPrompt(
                catalog,
                user?.username || 'Admin'
            );
            const rawReply = await sendChatMessage(apiHistory, systemPrompt);
            const { displayText, actions } = extractAdminRecipeActions(rawReply);

            let appliedUpdates = [];
            if (actions.length > 0) {
                const res = await api.adminUpdateRecipes(actions);
                appliedUpdates = Array.isArray(res?.updated) ? res.updated : [];
                await loadCatalog();
                if (onRecipesUpdated) {
                    onRecipesUpdated();
                }
                const updatedCount = appliedUpdates.filter((u) => u.status === 'updated').length;
                if (updatedCount > 0) {
                    addToast(`Emma updated ${updatedCount} recipe(s) in the database.`, 'success');
                }
            }

            setMessages((prev) => [
                ...prev,
                {
                    role: 'model',
                    text: displayText || 'Done!',
                    appliedUpdates,
                },
            ]);
        } catch (err) {
            console.error('Admin Emma chat error:', err);
            addToast(err.message || 'Emma encountered an error.', 'error');
            setMessages((prev) => [
                ...prev,
                {
                    role: 'model',
                    text: `Sorry, something went wrong: ${err.message || 'Unknown error'}`,
                },
            ]);
        } finally {
            setBusy(false);
        }
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        sendPrompt(input);
    };

    return (
        <section className="admin-emma-section">
            <div className="admin-emma-header">
                <div>
                    <h3>🤖 Emma Recipe Database Assistant</h3>
                    <p className="admin-emma-subtitle">
                        Free admin access (0 tokens) · {loadingCatalog ? 'Loading catalog...' : `${catalog.length} recipes loaded`}
                    </p>
                </div>
                <div className="admin-emma-header-actions">
                    <button
                        type="button"
                        className="admin-emma-secondary-btn"
                        onClick={loadCatalog}
                        disabled={loadingCatalog || busy}
                    >
                        {loadingCatalog ? 'Refreshing...' : '↻ Refresh DB'}
                    </button>
                    {messages.length > 0 && (
                        <button
                            type="button"
                            className="admin-emma-secondary-btn"
                            onClick={() => setMessages([])}
                            disabled={busy}
                        >
                            Clear Chat
                        </button>
                    )}
                </div>
            </div>

            <div className="admin-emma-chips">
                {QUICK_PROMPTS.map((qp) => (
                    <button
                        key={qp}
                        type="button"
                        className="admin-emma-chip"
                        onClick={() => sendPrompt(qp)}
                        disabled={busy || loadingCatalog}
                    >
                        {qp}
                    </button>
                ))}
            </div>

            <div className="admin-emma-messages">
                {messages.length === 0 ? (
                    <div className="admin-emma-empty">
                        <p>
                            Ask Emma to search, audit, or directly update fields across any recipe in the database.
                        </p>
                        <p className="admin-emma-examples">
                            Try: <em>"Set cook_time_mins to 25 and mark recipe #12 as gluten-free"</em> or{' '}
                            <em>"Rewrite the description for recipe #5 to be warmer and more concise."</em>
                        </p>
                    </div>
                ) : (
                    messages.map((msg, idx) => (
                        <div
                            key={idx}
                            className={`admin-emma-msg ${msg.role === 'user' ? 'user' : 'model'}`}
                        >
                            <div className="admin-emma-msg-label">
                                {msg.role === 'user' ? 'Admin' : 'Emma (Admin DB)'}
                            </div>
                            <div className="admin-emma-msg-bubble">
                                <EmmaMarkdown>{msg.text}</EmmaMarkdown>
                                {Array.isArray(msg.appliedUpdates) && msg.appliedUpdates.length > 0 && (
                                    <div className="admin-emma-updates-box">
                                        <strong>Database Updates Applied:</strong>
                                        <ul>
                                            {msg.appliedUpdates.map((u, uIdx) => (
                                                <li key={uIdx}>
                                                    {u.status === 'updated'
                                                        ? `✅ Recipe #${u.recipe_id} (${u.title}): updated ${u.changed_fields?.join(', ')}`
                                                        : `⚠️ Recipe #${u.recipe_id}: ${u.status}`}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                            </div>
                        </div>
                    ))
                )}
                {busy && (
                    <div className="admin-emma-msg model">
                        <div className="admin-emma-msg-label">Emma (Admin DB)</div>
                        <div className="admin-emma-msg-bubble">Checking the database and thinking...</div>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            <form className="admin-emma-form" onSubmit={handleSubmit}>
                <input
                    type="text"
                    className="admin-emma-input"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Ask Emma to inspect or update recipes in the database..."
                    disabled={busy || loadingCatalog}
                />
                <VoiceDictationButton
                    value={input}
                    onChange={setInput}
                    disabled={busy || loadingCatalog}
                />
                <button
                    type="submit"
                    className="admin-emma-send-btn"
                    disabled={busy || loadingCatalog || !input.trim()}
                >
                    {busy ? 'Working...' : 'Ask Emma'}
                </button>
            </form>
        </section>
    );
};

export default AdminEmmaChat;
