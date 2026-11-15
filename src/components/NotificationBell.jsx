import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import './NotificationBell.css';

const formatTimeAgo = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr.replace(' ', 'T') + (dateStr.includes('T') ? '' : 'Z'));
    const diffSecs = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
    if (Number.isNaN(diffSecs)) return '';
    if (diffSecs < 60) return 'Just now';
    if (diffSecs < 3600) return `${Math.floor(diffSecs / 60)}m ago`;
    if (diffSecs < 86400) return `${Math.floor(diffSecs / 3600)}h ago`;
    return `${Math.floor(diffSecs / 86400)}d ago`;
};

const NotificationBell = ({ onNavigate }) => {
    const navigate = useNavigate();
    const [open, setOpen] = useState(false);
    const [notifications, setNotifications] = useState([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [loading, setLoading] = useState(false);
    const wrapperRef = useRef(null);

    const fetchNotifications = useCallback(async (silent = true) => {
        if (!silent) setLoading(true);
        try {
            const data = await api.getNotifications();
            setNotifications(Array.isArray(data?.notifications) ? data.notifications : []);
            setUnreadCount(Number(data?.unread_count ?? 0));
        } catch {
            // Silently ignore transient polling errors
        } finally {
            if (!silent) setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchNotifications(true);
        const timer = setInterval(() => fetchNotifications(true), 60000);
        return () => clearInterval(timer);
    }, [fetchNotifications]);

    useEffect(() => {
        if (!open) return undefined;
        const handleOutside = (e) => {
            if (!wrapperRef.current?.contains(e.target)) {
                setOpen(false);
            }
        };
        const handleEsc = (e) => {
            if (e.key === 'Escape') setOpen(false);
        };
        document.addEventListener('mousedown', handleOutside);
        document.addEventListener('keydown', handleEsc);
        return () => {
            document.removeEventListener('mousedown', handleOutside);
            document.removeEventListener('keydown', handleEsc);
        };
    }, [open]);

    const handleToggle = () => {
        const nextOpen = !open;
        setOpen(nextOpen);
        if (nextOpen) {
            fetchNotifications(false);
        }
    };

    const handleNotificationClick = async (notif) => {
        if (!notif.is_read) {
            setNotifications((prev) =>
                prev.map((n) => (n.id === notif.id ? { ...n, is_read: 1 } : n))
            );
            setUnreadCount((c) => Math.max(0, c - 1));
            try {
                await api.markNotificationRead(notif.id);
            } catch {
                // ignore
            }
        }
        setOpen(false);
        if (onNavigate) onNavigate();
        navigate(`/recipe/${notif.recipe_id}`);
    };

    const handleMarkAllRead = async (e) => {
        e.stopPropagation();
        setNotifications((prev) => prev.map((n) => ({ ...n, is_read: 1 })));
        setUnreadCount(0);
        try {
            await api.markAllNotificationsRead();
        } catch {
            // ignore
        }
    };

    const handleDelete = async (e, id, wasUnread) => {
        e.stopPropagation();
        setNotifications((prev) => prev.filter((n) => n.id !== id));
        if (wasUnread) {
            setUnreadCount((c) => Math.max(0, c - 1));
        }
        try {
            await api.deleteNotification(id);
        } catch {
            // ignore
        }
    };

    return (
        <div className="notif-bell-wrapper" ref={wrapperRef}>
            <button
                type="button"
                className="notif-bell-btn"
                onClick={handleToggle}
                aria-label="Notifications"
                aria-expanded={open}
                title="Recipe Comment Notifications"
            >
                <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                >
                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                </svg>
                {unreadCount > 0 && (
                    <span className="notif-badge">
                        {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                )}
            </button>

            {open && (
                <div className="notif-dropdown" role="dialog" aria-label="Notifications">
                    <div className="notif-dropdown-header">
                        <span className="notif-dropdown-title">Notifications</span>
                        {unreadCount > 0 && (
                            <button
                                type="button"
                                className="notif-mark-all-btn"
                                onClick={handleMarkAllRead}
                            >
                                Mark all read
                            </button>
                        )}
                    </div>

                    <div className="notif-dropdown-list">
                        {loading && notifications.length === 0 ? (
                            <div className="notif-empty">Loading notifications...</div>
                        ) : notifications.length === 0 ? (
                            <div className="notif-empty">
                                No notifications yet. When someone comments on your recipes, you&apos;ll see it here!
                            </div>
                        ) : (
                            notifications.map((n) => (
                                <div
                                    key={n.id}
                                    className={`notif-item ${!n.is_read ? 'unread' : ''}`}
                                    onClick={() => handleNotificationClick(n)}
                                    role="button"
                                    tabIndex={0}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' || e.key === ' ') {
                                            e.preventDefault();
                                            handleNotificationClick(n);
                                        }
                                    }}
                                >
                                    <div className="notif-item-content">
                                        <p className="notif-item-message">{n.message}</p>
                                        <span className="notif-item-time">
                                            {formatTimeAgo(n.created_at)}
                                        </span>
                                    </div>
                                    <button
                                        type="button"
                                        className="notif-delete-btn"
                                        onClick={(e) => handleDelete(e, n.id, !n.is_read)}
                                        title="Dismiss notification"
                                        aria-label="Dismiss notification"
                                    >
                                        ×
                                    </button>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default NotificationBell;
