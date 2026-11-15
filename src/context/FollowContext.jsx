/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';
import { useAuth } from './AuthContext';
import { useToast } from './ToastContext';

const FollowContext = createContext({
    isFollowingUser: () => false,
    toggleFollow: async () => null,
    refreshFollowing: async () => {},
});

export const FollowProvider = ({ children }) => {
    const { user } = useAuth();
    const { addToast } = useToast();
    const [followedIds, setFollowedIds] = useState(() => new Set());
    const [followedUsernames, setFollowedUsernames] = useState(() => new Set());

    const applyFollowingList = useCallback((list) => {
        setFollowedIds(new Set(list.map((c) => Number(c.id))));
        setFollowedUsernames(
            new Set(
                list
                    .map((c) => (c.username || '').trim().toLowerCase())
                    .filter(Boolean)
            )
        );
    }, []);

    const refreshFollowing = useCallback(async () => {
        if (!user) return;
        try {
            const res = await api.getFollowedUsers();
            const list = Array.isArray(res?.following) ? res.following : [];
            applyFollowingList(list);
        } catch {
            // Silently ignore if offline or unauthenticated
        }
    }, [user, applyFollowingList]);

    useEffect(() => {
        let active = true;
        if (!user) return undefined;

        api.getFollowedUsers()
            .then((res) => {
                if (!active) return;
                const list = Array.isArray(res?.following) ? res.following : [];
                applyFollowingList(list);
            })
            .catch(() => {});

        return () => {
            active = false;
        };
    }, [user, applyFollowingList]);

    const isFollowingUser = useCallback(
        ({ userId, username } = {}) => {
            if (!user) return false;
            if (userId && followedIds.has(Number(userId))) return true;
            if (username && followedUsernames.has(username.trim().toLowerCase())) return true;
            return false;
        },
        [user, followedIds, followedUsernames]
    );

    const toggleFollow = useCallback(
        async ({ userId, username } = {}) => {
            if (!user) {
                addToast('Log in to follow chefs in The Veggie Vault!', 'info');
                return null;
            }
            const payload = userId
                ? { followed_id: Number(userId) }
                : { username: (username || '').trim() };

            const res = await api.toggleFollowUser(payload);
            const nowFollowing = Boolean(res?.isFollowing);

            if (userId) {
                setFollowedIds((prev) => {
                    const next = new Set(prev);
                    if (nowFollowing) next.add(Number(userId));
                    else next.delete(Number(userId));
                    return next;
                });
            }
            if (username) {
                const key = username.trim().toLowerCase();
                setFollowedUsernames((prev) => {
                    const next = new Set(prev);
                    if (nowFollowing) next.add(key);
                    else next.delete(key);
                    return next;
                });
            }
            refreshFollowing();

            if (res?.message) {
                addToast(res.message, 'success');
            }
            return res;
        },
        [user, addToast, refreshFollowing]
    );

    return (
        <FollowContext.Provider value={{ isFollowingUser, toggleFollow, refreshFollowing }}>
            {children}
        </FollowContext.Provider>
    );
};

export const useFollow = () => useContext(FollowContext);
