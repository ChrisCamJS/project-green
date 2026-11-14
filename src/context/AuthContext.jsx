import React, { createContext, useState, useContext } from 'react';
import { api } from '../services/api';

const SKIP_TOKEN_PROMPT_KEY = 'veggie_vault_skip_token_prompt';

// create the context
const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
    // initialize state from local storage
    const [user, setUser] = useState(() => {
        const savedUser = localStorage.getItem('vault_user');
        return savedUser ? JSON.parse(savedUser) : null;
    });

    // Pending token confirmation modal state
    const [tokenPrompt, setTokenPrompt] = useState(null);
    const [dontAskAgain, setDontAskAgain] = useState(false);

    // call when login succeeds
    const loginContext = (userData) => {
        setUser(userData);
        localStorage.setItem('vault_user', JSON.stringify(userData));
    };

    // merge updated profile/email fields into active user state and localStorage
    const updateUser = (partialOrFullUser) => {
        setUser((prev) => {
            if (!prev) return prev;
            const merged = { ...prev, ...partialOrFullUser };
            localStorage.setItem('vault_user', JSON.stringify(merged));
            return merged;
        });
    };

    // call this to bin the session and kick them out
    const logoutContext = async () => {
        try {
            // tell the backend to destroy the session cookie
            await api.logout();
        } catch (err) {
            console.error('Backend Logout Threw a Wobbly', err);
        }

        // wipe the react state and local storage
        setUser(null);
        localStorage.removeItem('vault_user');
    };

    // Prompt the user before spending tokens unless they opted out via checkbox
    const confirmTokenUsage = (cost = 1, actionLabel = 'Use Vault Tokens') => {
        try {
            if (localStorage.getItem(SKIP_TOKEN_PROMPT_KEY) === 'true') {
                return Promise.resolve(true);
            }
        } catch {
            // Ignore localStorage access errors and prompt normally
        }

        return new Promise((resolve) => {
            setDontAskAgain(false);
            setTokenPrompt({ cost, actionLabel, resolve });
        });
    };

    const handleConfirmTokenPrompt = () => {
        if (!tokenPrompt) return;
        if (dontAskAgain) {
            try {
                localStorage.setItem(SKIP_TOKEN_PROMPT_KEY, 'true');
            } catch {
                // Ignore localStorage write errors
            }
        }
        const { resolve } = tokenPrompt;
        setTokenPrompt(null);
        resolve(true);
    };

    const handleCancelTokenPrompt = () => {
        if (!tokenPrompt) return;
        const { resolve } = tokenPrompt;
        setTokenPrompt(null);
        resolve(false);
    };

    // --- THE UPGRADED TOKEN MANAGER ---
    // Accepts a cost and either an action label string or { actionLabel, skipConfirm }
    const spendToken = async (cost = 1, options = {}) => {
        if (!user) return { success: false, message: 'No user found' };

        const normalizedOptions =
            typeof options === 'string'
                ? { actionLabel: options, skipConfirm: false }
                : options || {};

        const {
            actionLabel = 'This premium feature',
            skipConfirm = false,
        } = normalizedOptions;

        if (!skipConfirm) {
            const confirmed = await confirmTokenUsage(cost, actionLabel);
            if (!confirmed) {
                return { success: false, cancelled: true, message: 'Cancelled by user.' };
            }
        }

        try {
            const response = await api.deductToken(cost);

            if (response?.success) {
                const updatedUser = { ...user, generation_tokens: response.tokensRemaining };
                setUser(updatedUser);
                localStorage.setItem('vault_user', JSON.stringify(updatedUser));
                return { success: true, tokensRemaining: response.tokensRemaining };
            }

            return {
                success: false,
                message: response?.message || 'Unable to deduct tokens.',
            };
        } catch (error) {
            console.error('Token deduction threw a strop:', error);
            return { success: false, message: error.message };
        }
    };

    const currentBalance = Number(user?.generation_tokens ?? 0);
    const promptCost = Number(tokenPrompt?.cost ?? 0);
    const projectedBalance = Math.max(0, currentBalance - promptCost);
    const tokenUnit = promptCost === 1 ? 'Token' : 'Tokens';

    return (
        <AuthContext.Provider
            value={{
                user,
                login: loginContext,
                logout: logoutContext,
                spendToken,
                updateUser,
                confirmTokenUsage,
            }}
        >
            {children}

            {tokenPrompt && (
                <div
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="token-confirm-title"
                    onClick={handleCancelTokenPrompt}
                    style={{
                        position: 'fixed',
                        inset: 0,
                        backgroundColor: 'rgba(15, 23, 42, 0.58)',
                        backdropFilter: 'blur(4px)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '1rem',
                        zIndex: 10000,
                    }}
                >
                    <div
                        onClick={(e) => e.stopPropagation()}
                        style={{
                            backgroundColor: '#ffffff',
                            borderRadius: '14px',
                            maxWidth: '460px',
                            width: '100%',
                            padding: '1.65rem',
                            boxShadow: '0 24px 48px rgba(0, 0, 0, 0.22)',
                            border: '2px solid #48bb78',
                            color: '#1a202c',
                            fontFamily: 'inherit',
                        }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', marginBottom: '0.85rem' }}>
                            <h3 id="token-confirm-title" style={{ margin: 0, fontSize: '1.25rem', color: '#1a202c' }}>
                                🪙 Confirm Token Usage
                            </h3>
                            <span
                                style={{
                                    backgroundColor: '#fefcbf',
                                    color: '#975a16',
                                    border: '1px solid #f6e05e',
                                    padding: '0.28rem 0.7rem',
                                    borderRadius: '9999px',
                                    fontSize: '0.84rem',
                                    fontWeight: 700,
                                    whiteSpace: 'nowrap',
                                }}
                            >
                                {promptCost} {tokenUnit}
                            </span>
                        </div>

                        <p style={{ margin: '0 0 1rem 0', color: '#2d3748', lineHeight: 1.5, fontSize: '0.98rem' }}>
                            <strong>Action:</strong> {tokenPrompt.actionLabel}
                        </p>

                        <div
                            style={{
                                backgroundColor: '#f7fafc',
                                border: '1px solid #e2e8f0',
                                borderRadius: '10px',
                                padding: '0.85rem 1rem',
                                marginBottom: '1rem',
                                fontSize: '0.92rem',
                                color: '#4a5568',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '0.35rem',
                            }}
                        >
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span>Current Balance:</span>
                                <strong>{currentBalance.toFixed(1)} tokens</strong>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span>Cost if You Continue:</span>
                                <strong style={{ color: '#c05621' }}>-{promptCost.toFixed(1)} {tokenUnit.toLowerCase()}</strong>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #e2e8f0', paddingTop: '0.35rem', marginTop: '0.15rem' }}>
                                <span>Remaining Balance:</span>
                                <strong style={{ color: '#276749' }}>{projectedBalance.toFixed(1)} tokens</strong>
                            </div>
                        </div>

                        <label
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.55rem',
                                fontSize: '0.9rem',
                                color: '#4a5568',
                                marginBottom: '1.25rem',
                                cursor: 'pointer',
                                userSelect: 'none',
                            }}
                        >
                            <input
                                type="checkbox"
                                checked={dontAskAgain}
                                onChange={(e) => setDontAskAgain(e.target.checked)}
                                style={{ width: '16px', height: '16px', accentColor: '#48bb78', cursor: 'pointer' }}
                            />
                            <span>Don&apos;t ask me again before spending tokens</span>
                        </label>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', flexWrap: 'wrap' }}>
                            <button
                                type="button"
                                onClick={handleCancelTokenPrompt}
                                style={{
                                    padding: '0.6rem 1.1rem',
                                    borderRadius: '8px',
                                    border: '1px solid #cbd5e0',
                                    backgroundColor: '#ffffff',
                                    color: '#4a5568',
                                    fontWeight: 600,
                                    fontSize: '0.92rem',
                                    cursor: 'pointer',
                                }}
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleConfirmTokenPrompt}
                                style={{
                                    padding: '0.6rem 1.2rem',
                                    borderRadius: '8px',
                                    border: 'none',
                                    backgroundColor: '#2f855a',
                                    color: '#ffffff',
                                    fontWeight: 700,
                                    fontSize: '0.92rem',
                                    cursor: 'pointer',
                                }}
                            >
                                Continue ({promptCost} {tokenUnit})
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </AuthContext.Provider>
    );
};

// A custom hook to make grabbing the context simple in other components
export const useAuth = () => useContext(AuthContext);
