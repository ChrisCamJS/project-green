// src/utils/chatStorage.js

export const STORAGE_PREFIX = 'veggie_vault_recent_chats';
export const TEN_DAYS_MS = 10 * 24 * 60 * 60 * 1000;
export const MAX_SAVED_CHATS = 25;

/**
 * Build the per-user localStorage key for recent chats.
 */
function getStorageKey(userId) {
    return `${STORAGE_PREFIX}_${userId || 'guest'}`;
}

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
    const rawText = firstUserMsg?.parts?.[0]?.text?.trim() || '';
    const cleaned = rawText.replace(/^I want a recipe for:\s*/i, '').replace(/\s+/g, ' ').trim();

    if (!cleaned) {
        return engineMode === 'chat' ? 'Chat with Emma' : 'Emma Recipe Session';
    }

    return cleaned.length > 55 ? `${cleaned.slice(0, 52).trim()}...` : cleaned;
}

/**
 * Safely persist a list of chat sessions to localStorage, trimming oldest entries if quota is hit.
 */
function persistChats(key, chats) {
    let listToSave = [...chats];

    while (listToSave.length >= 0) {
        try {
            localStorage.setItem(key, JSON.stringify(listToSave));
            return listToSave;
        } catch (err) {
            const isQuotaError =
                err?.name === 'QuotaExceededError' ||
                err?.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
                err?.code === 22;

            if (isQuotaError && listToSave.length > 1) {
                listToSave = listToSave.slice(0, listToSave.length - 1);
            } else {
                console.error('Failed to save chat sessions to localStorage:', err);
                return chats;
            }
        }
    }
    return listToSave;
}

/**
 * Load recent chats for a user, automatically pruning sessions older than 10 days.
 */
export function loadRecentChats(userId) {
    const key = getStorageKey(userId);
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return [];

        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];

        const now = Date.now();
        const validChats = parsed.filter((session) => {
            if (!session || typeof session !== 'object' || !Array.isArray(session.chatHistory)) {
                return false;
            }
            const timestamp = session.updatedAt || session.createdAt || 0;
            return now - timestamp <= TEN_DAYS_MS;
        });

        validChats.sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0));

        if (validChats.length !== parsed.length) {
            persistChats(key, validChats);
        }

        return validChats;
    } catch (err) {
        console.error('Failed to load recent chats from localStorage:', err);
        return [];
    }
}

/**
 * Save or update a chat session in 10-day temporary browser storage.
 */
export function saveChatSession(userId, sessionData) {
    const key = getStorageKey(userId);
    const { id, engineMode = 'chat', dietaryPrefs = {}, chatHistory = [] } = sessionData || {};

    const existingChats = loadRecentChats(userId);
    const existingIndex = existingChats.findIndex((item) => item.id === id);
    const existingSession = existingIndex >= 0 ? existingChats[existingIndex] : null;

    const now = Date.now();
    const savedEntry = {
        id: id || `chat_${now}_${Math.random().toString(36).slice(2, 7)}`,
        engineMode,
        dietaryPrefs,
        chatHistory,
        title: deriveChatTitle(chatHistory, engineMode),
        createdAt: existingSession?.createdAt || now,
        updatedAt: now,
        expiresAt: now + TEN_DAYS_MS,
    };

    const remaining = existingChats.filter((item) => item.id !== savedEntry.id);
    const updatedList = [savedEntry, ...remaining].slice(0, MAX_SAVED_CHATS);

    const persisted = persistChats(key, updatedList);
    return { session: savedEntry, chats: persisted };
}

/**
 * Delete a single saved chat session by ID.
 */
export function deleteChatSession(userId, sessionId) {
    const key = getStorageKey(userId);
    const existingChats = loadRecentChats(userId);
    const updated = existingChats.filter((item) => item.id !== sessionId);
    return persistChats(key, updated);
}

/**
 * Clear all saved chat sessions for the user.
 */
export function clearAllChatSessions(userId) {
    const key = getStorageKey(userId);
    try {
        localStorage.removeItem(key);
    } catch (err) {
        console.error('Failed to clear chat sessions from localStorage:', err);
    }
    return [];
}

/**
 * Calculate the number of whole days remaining before a session expires.
 */
export function getDaysRemaining(session) {
    if (!session) return 10;
    const baseTime = session.updatedAt || session.createdAt || Date.now();
    const expiresAt = baseTime + TEN_DAYS_MS;
    return Math.max(1, Math.ceil((expiresAt - Date.now()) / (24 * 60 * 60 * 1000)));
}
