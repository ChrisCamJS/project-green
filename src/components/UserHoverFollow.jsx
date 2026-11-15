import React, { useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useFollow } from '../context/FollowContext';
import './UserHoverFollow.css';

const NON_FOLLOWABLE_NAMES = new Set(['emma (ai)', 'vault guest', 'unknown']);

/**
 * Wraps any user/chef name so hovering (or focusing) reveals a quick Follow/Unfollow popover card.
 */
const UserHoverFollow = ({
    userId = null,
    username = '',
    displayName = '',
    profileLink = null,
    className = '',
    children,
}) => {
    const { user } = useAuth();
    const { isFollowingUser, toggleFollow } = useFollow();
    const [open, setOpen] = useState(false);
    const [busy, setBusy] = useState(false);
    const closeTimerRef = useRef(null);

    const rawName = (username || displayName || '').trim();
    const normalizedName = rawName.toLowerCase();
    const isSelf = Boolean(
        user &&
            ((userId && Number(user.id) === Number(userId)) ||
                (rawName && user.username && user.username.toLowerCase() === normalizedName))
    );
    const isSystemAuthor = !rawName || NON_FOLLOWABLE_NAMES.has(normalizedName);
    const canHoverFollow = Boolean(user && !isSelf && !isSystemAuthor && (userId || rawName));

    const following = canHoverFollow ? isFollowingUser({ userId, username: rawName }) : false;

    const handleMouseEnter = () => {
        if (!canHoverFollow) return;
        if (closeTimerRef.current) {
            clearTimeout(closeTimerRef.current);
            closeTimerRef.current = null;
        }
        setOpen(true);
    };

    const handleMouseLeave = () => {
        if (!canHoverFollow) return;
        closeTimerRef.current = setTimeout(() => {
            setOpen(false);
        }, 160);
    };

    const handleToggle = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (busy || !canHoverFollow) return;
        setBusy(true);
        try {
            await toggleFollow({ userId, username: rawName });
        } catch (err) {
            console.error('Hover follow toggle failed:', err);
        } finally {
            setBusy(false);
        }
    };

    const label = children || displayName || username;

    return (
        <span
            className={`user-hover-follow-wrap ${className}`.trim()}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
        >
            {profileLink ? (
                <Link to={profileLink} className="user-hover-follow-trigger">
                    {label}
                </Link>
            ) : (
                <span className="user-hover-follow-trigger">{label}</span>
            )}

            {open && canHoverFollow && (
                <span className="user-hover-follow-popover" role="dialog" aria-label={`Chef ${rawName}`}>
                    <span className="user-hover-follow-header">
                        <span className="user-hover-follow-name">@{rawName}</span>
                    </span>
                    <span className="user-hover-follow-actions">
                        <button
                            type="button"
                            className={`user-hover-follow-btn ${following ? 'following' : ''}`}
                            onClick={handleToggle}
                            disabled={busy}
                        >
                            {busy ? 'Updating...' : (following ? '✓ Following' : '+ Follow')}
                        </button>
                        {profileLink && (
                            <Link
                                to={profileLink}
                                className="user-hover-follow-profile-link"
                                onClick={() => setOpen(false)}
                            >
                                Profile &rarr;
                            </Link>
                        )}
                    </span>
                </span>
            )}
        </span>
    );
};

export default UserHoverFollow;
