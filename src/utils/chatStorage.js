// src/utils/chatStorage.js
import { api } from '../services/api';

export const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
export const MAX_SAVED_CHATS = 50;

/**
 * Derive a human-readable title from a chat session's messages.
 */
export function deriveChatTitle(chatHistory = [], engineMode = 'chat') {
    if (!Array.isArray(chatHistory) || chatHistory.length === 0) {
        return engineMode === 'chat' ? 'Chat with Emma' : 'Emma Recipe Session';
    }

    for (const msg of chatHistory) {
        if (msg.role === 'model') {
            const recipeText = msg.displayParts?.recipe || msg.parts?.[0]?.text || '';
            const titleMatch = recipeText.match(/^#\s+(.+)$/m);
            if (titleMatch && titleMatch[1]) {
                const extracted = titleMatch[1].trim();
                return extracted.length > 55 ? `${extracted.slice(0, 52).trim()}...` : extracted;
            }
        }
    }

    const firstUserMsg = chatHistory.find((msg) => msg.role === 'user');
    const rawText = (firstUserMsg?.displayParts?.userText || firstUserMsg?.parts?.[0]?.text || '').trim();
    const cleaned = rawText.replace(/^I want a recipe for:\s*/i, '').replace(/\s+/g, ' ').trim();

    if (!cleaned) {
        return engineMode === 'chat' ? 'Chat with Emma' : 'Emma Recipe Session';
    }

    return cleaned.length > 55 ? `${cleaned.slice(0, 52).trim()}...` : cleaned;
}

/**
 * Removes heavy binary inlineData payloads before persisting chats.
 */
function sanitizeChatHistoryForStorage(chatHistory = []) {
    if (!Array.isArray(chatHistory)) return [];
    return chatHistory.map((msg) => {
        if (!msg || typeof msg !== 'object') return msg;
        const safeParts = Array.isArray(msg.parts)
            ? msg.parts.filter((part) => part && typeof part.text === 'string' && !part.inlineData)
            : [];
        return {
            ...msg,
            parts: safeParts.length > 0 ? safeParts : [{ text: msg.displayParts?.userText || '' }],
        };
    });
}

/**
 * Load recent chats for the logged-in user from the database (auto-pruned at 30 days).
 */
export async function loadRecentChats(userId) {
    if (!userId) return [];
    try {
        const res = await api.getRecentChats();
        if (res?.success && Array.isArray(res.chats)) {
            return res.chats;
        }
        return [];
    } catch (err) {
        console.error('Failed to load recent chats from database:', err);
        return [];
    }
}

/**
 * Save or update a chat session in the database for up to 30 days.
 */
export async function saveChatSession(userId, sessionData) {
    const { id, engineMode = 'chat', dietaryPrefs = {}, chatHistory = [] } = sessionData || {};
    const sanitizedHistory = sanitizeChatHistoryForStorage(chatHistory);
    const title = deriveChatTitle(sanitizedHistory, engineMode);

    if (!userId) {
        return { session: null, chats: [] };
    }

    try {
        const res = await api.saveRecentChat({
            id,
            engineMode,
            title,
            dietaryPrefs,
            chatHistory: sanitizedHistory,
        });

        const chats = res?.success && Array.isArray(res.chats) ? res.chats : [];
        const savedSession = chats.find((c) => c.id === (res?.id || id)) || null;
        return { session: savedSession, chats };
    } catch (err) {
        console.error('Failed to save chat session to database:', err);
        return { session: null, chats: [] };
    }
}

/**
 * Delete a single saved chat session by ID from the database.
 */
export async function deleteChatSession(userId, sessionId) {
    if (!userId || !sessionId) return [];
    try {
        const res = await api.deleteRecentChat(sessionId);
        return res?.success && Array.isArray(res.chats) ? res.chats : [];
    } catch (err) {
        console.error('Failed to delete chat session from database:', err);
        return [];
    }
}

/**
 * Clear all saved chat sessions for the user from the database.
 */
export async function clearAllChatSessions(userId) {
    if (!userId) return [];
    try {
        const res = await api.clearRecentChats();
        return res?.success && Array.isArray(res.chats) ? res.chats : [];
    } catch (err) {
        console.error('Failed to clear chat sessions from database:', err);
        return [];
    }
}

/**
 * Calculate the number of whole days remaining before a session expires (max 30 days).
 */
export function getDaysRemaining(session) {
    if (!session) return 30;
    const expiresAt =
        session.expiresAt ||
        (session.updatedAt || session.createdAt || Date.now()) + THIRTY_DAYS_MS;
    return Math.max(1, Math.min(30, Math.ceil((expiresAt - Date.now()) / (24 * 60 * 60 * 1000))));
}
