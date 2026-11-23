import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './AchievementsSection.css';

const LEVEL_THEME = {
    1: { bg1: '#fffbeb', bg2: '#fef9c3', border: '#fde68a' },
    2: { bg1: '#f8fafc', bg2: '#e2e8f0', border: '#cbd5e1' },
    3: { bg1: '#fefce8', bg2: '#fde047', border: '#fcd34d' },
    4: { bg1: '#ecfeff', bg2: '#cffafe', border: '#a5f3fc' },
};

const formatEarnedDate = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr.replace(' ', 'T'));
    if (Number.isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
    });
};

const drawRoundedRect = (ctx, x, y, w, h, r) => {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
};

const wrapTextLines = (ctx, text, maxWidth) => {
    const words = String(text || '').split(/\s+/).filter(Boolean);
    const lines = [];
    let current = '';
    words.forEach((word) => {
        const candidate = current ? `${current} ${word}` : word;
        if (ctx.measureText(candidate).width <= maxWidth) {
            current = candidate;
        } else {
            if (current) lines.push(current);
            current = word;
        }
    });
    if (current) lines.push(current);
    return lines;
};

const downloadAchievementCardPng = (shareTarget, ownerProfile, earnedBadges) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const chefName = ownerProfile?.displayName || ownerProfile?.username || 'Vault Chef';
    const chefHandle = ownerProfile?.username ? `@${ownerProfile.username}` : '';
    const isSingle = shareTarget?.mode === 'badge' && shareTarget?.badge;

    const width = 960;
    const height = isSingle ? 560 : 680;
    canvas.width = width;
    canvas.height = height;

    // Outer white showcase card backdrop
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, width, height);

    drawRoundedRect(ctx, 24, 24, width - 48, height - 48, 22);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#e5e7eb';
    ctx.stroke();

    // Header row inside card
    ctx.fillStyle = '#1f2937';
    ctx.font = '700 28px system-ui, -apple-system, Segoe UI, sans-serif';
    ctx.fillText('🏆 Achievements & Badges', 56, 78);

    ctx.fillStyle = '#4b5563';
    ctx.font = '600 18px system-ui, -apple-system, Segoe UI, sans-serif';
    ctx.fillText(`${chefName}${chefHandle ? ` (${chefHandle})` : ''}`, 56, 108);

    // Count pill
    const pillText = `${earnedBadges.length} ${earnedBadges.length === 1 ? 'Badge Earned' : 'Badges Earned'}`;
    ctx.font = '700 17px system-ui, -apple-system, Segoe UI, sans-serif';
    const pillW = ctx.measureText(pillText).width + 36;
    drawRoundedRect(ctx, width - 56 - pillW, 52, pillW, 36, 18);
    ctx.fillStyle = '#fef3c7';
    ctx.fill();
    ctx.fillStyle = '#92400e';
    ctx.fillText(pillText, width - 56 - pillW + 18, 76);

    const drawSingleBadgeTile = (badge, bx, by, bw, bh, large = false) => {
        const theme = LEVEL_THEME[badge.level] || LEVEL_THEME[1];
        const grad = ctx.createLinearGradient(bx, by, bx + bw, by + bh);
        grad.addColorStop(0, theme.bg1);
        grad.addColorStop(1, theme.bg2);

        drawRoundedRect(ctx, bx, by, bw, bh, 16);
        ctx.fillStyle = grad;
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = theme.border;
        ctx.stroke();

        // Icon
        ctx.font = `${large ? 52 : 34}px system-ui, -apple-system, Segoe UI Emoji, sans-serif`;
        ctx.fillText(badge.icon || '🏆', bx + 24, by + (large ? 68 : 48));

        // Level pill
        const lvlLabel = `Level ${badge.level}`;
        ctx.font = `700 ${large ? 18 : 14}px system-ui, -apple-system, Segoe UI, sans-serif`;
        const lw = ctx.measureText(lvlLabel).width + 24;
        const lh = large ? 32 : 24;
        drawRoundedRect(ctx, bx + bw - 22 - lw, by + 22, lw, lh, lh / 2);
        ctx.fillStyle = 'rgba(0,0,0,0.08)';
        ctx.fill();
        ctx.fillStyle = '#1f2937';
        ctx.fillText(lvlLabel, bx + bw - 22 - lw + 12, by + 22 + (large ? 22 : 17));

        // Name & track
        ctx.fillStyle = '#111827';
        ctx.font = `700 ${large ? 30 : 20}px system-ui, -apple-system, Segoe UI, sans-serif`;
        ctx.fillText(badge.level_name || '', bx + 24, by + (large ? 120 : 86), bw - 48);

        ctx.fillStyle = '#4b5563';
        ctx.font = `600 ${large ? 20 : 15}px system-ui, -apple-system, Segoe UI, sans-serif`;
        ctx.fillText(badge.title || '', bx + 24, by + (large ? 150 : 109), bw - 48);

        // Description wrapped
        ctx.fillStyle = '#374151';
        ctx.font = `400 ${large ? 20 : 14}px system-ui, -apple-system, Segoe UI, sans-serif`;
        const lines = wrapTextLines(ctx, badge.description, bw - 48);
        lines.slice(0, 2).forEach((line, idx) => {
            ctx.fillText(line, bx + 24, by + (large ? 188 : 134) + idx * (large ? 26 : 18));
        });

        // Earned date
        ctx.fillStyle = '#6b7280';
        ctx.font = `600 ${large ? 17 : 13}px system-ui, -apple-system, Segoe UI, sans-serif`;
        ctx.fillText(`Earned ${formatEarnedDate(badge.earned_at)}`, bx + 24, by + bh - 22);
    };

    if (isSingle) {
        drawSingleBadgeTile(shareTarget.badge, 56, 134, width - 112, 265, true);
    } else {
        const tiles = earnedBadges.slice(0, 4);
        const cols = 2;
        const tileW = (width - 112 - 22) / cols;
        const tileH = 192;
        tiles.forEach((b, idx) => {
            const col = idx % cols;
            const row = Math.floor(idx / cols);
            const tx = 56 + col * (tileW + 22);
            const ty = 132 + row * (tileH + 18);
            drawSingleBadgeTile(b, tx, ty, tileW, tileH, false);
        });
    }

    // Bottom CTA Banner: Start Earning Achievements at The Veggie Vault
    const ctaY = height - 134;
    const ctaH = 82;
    const ctaGrad = ctx.createLinearGradient(56, ctaY, width - 56, ctaY + ctaH);
    ctaGrad.addColorStop(0, '#1c4532');
    ctaGrad.addColorStop(1, '#2f855a');
    drawRoundedRect(ctx, 56, ctaY, width - 112, ctaH, 14);
    ctx.fillStyle = ctaGrad;
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.font = '700 22px system-ui, -apple-system, Segoe UI, sans-serif';
    ctx.fillText('🏆 Start Earning Achievements at The Veggie Vault', 80, ctaY + 36);

    ctx.fillStyle = '#d1fae5';
    ctx.font = '500 16px system-ui, -apple-system, Segoe UI, sans-serif';
    ctx.fillText('Share WFPB recipes, remix variants, plan meals & collect chef badges — The Veggie Vault', 80, ctaY + 63);

    const filename = isSingle
        ? `veggie-vault-achievement-${shareTarget.badge.key}-lv${shareTarget.badge.level}.png`
        : `veggie-vault-achievements-${ownerProfile?.username || 'chef'}.png`;
    const link = document.createElement('a');
    link.download = filename;
    link.href = canvas.toDataURL('image/png');
    link.click();
};

const AchievementsSection = ({
    achievements,
    ownerProfile = null,
    isSharedView = false,
    highlightedBadgeKey = null,
    highlightedLevel = null,
}) => {
    const { user } = useAuth();
    const earned = useMemo(() => achievements?.earned || [], [achievements]);
    const tracks = useMemo(() => achievements?.tracks || [], [achievements]);

    const [shareTarget, setShareTarget] = useState(null); // { mode: 'badge', badge } | { mode: 'all' }
    const [copiedUrl, setCopiedUrl] = useState(false);

    const ownerIdentifier = ownerProfile?.username || ownerProfile?.id || '';
    const ownerDisplayName = ownerProfile?.displayName || ownerProfile?.username || 'This Chef';

    const buildShareUrl = (target) => {
        if (!ownerIdentifier || typeof window === 'undefined') return '';
        const base = `${window.location.origin}/achievements/shared/${encodeURIComponent(ownerIdentifier)}`;
        if (target?.mode === 'badge' && target.badge) {
            return `${base}/${encodeURIComponent(target.badge.key)}/${target.badge.level}`;
        }
        return base;
    };

    const shareUrl = useMemo(
        () => (shareTarget ? buildShareUrl(shareTarget) : ''),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [shareTarget, ownerIdentifier]
    );

    const shareHeadline = useMemo(() => {
        if (!shareTarget) return '';
        if (shareTarget.mode === 'badge' && shareTarget.badge) {
            return `${ownerDisplayName} unlocked the Level ${shareTarget.badge.level} "${shareTarget.badge.level_name}" (${shareTarget.badge.title}) achievement at The Veggie Vault! Start earning achievements at The Veggie Vault:`;
        }
        return `${ownerDisplayName} has earned ${earned.length} chef ${earned.length === 1 ? 'badge' : 'badges'} on The Veggie Vault! Start earning achievements at The Veggie Vault:`;
    }, [shareTarget, ownerDisplayName, earned.length]);

    if (earned.length === 0 && tracks.length === 0) {
        return null;
    }

    const handleCopyLink = async () => {
        if (!shareUrl) return;
        try {
            if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(shareUrl);
            } else {
                window.prompt('Copy this achievement share link:', shareUrl);
            }
            setCopiedUrl(true);
            setTimeout(() => setCopiedUrl(false), 2500);
        } catch {
            window.prompt('Copy this achievement share link:', shareUrl);
        }
    };

    const canShare = Boolean(ownerIdentifier && earned.length > 0);

    return (
        <section className="achievements-section">
            <div className="achievements-header">
                <h3>🏆 Achievements &amp; Badges</h3>
                <div className="achievements-header-right">
                    <span className="achievements-count-pill">
                        {earned.length} {earned.length === 1 ? 'Badge Earned' : 'Badges Earned'}
                    </span>
                    {canShare && (
                        <button
                            type="button"
                            className="achievements-share-all-btn"
                            onClick={() => {
                                setCopiedUrl(false);
                                setShareTarget({ mode: 'all' });
                            }}
                            title="Share all earned achievements"
                        >
                            🔗 Share Achievements
                        </button>
                    )}
                </div>
            </div>

            {earned.length > 0 ? (
                <div className="achievements-earned-grid">
                    {earned.map((badge) => {
                        const isHighlighted =
                            highlightedBadgeKey === badge.key &&
                            Number(highlightedLevel) === Number(badge.level);
                        return (
                            <div
                                key={`${badge.key}-${badge.level}`}
                                className={`achievement-badge-card level-${badge.level} ${isHighlighted ? 'is-highlighted' : ''}`}
                            >
                                <div className="achievement-badge-top">
                                    <span className="achievement-icon" aria-hidden="true">
                                        {badge.icon}
                                    </span>
                                    <span className="achievement-level-pill">
                                        Level {badge.level}
                                    </span>
                                </div>
                                <h4 className="achievement-badge-name">{badge.level_name}</h4>
                                <p className="achievement-badge-track">{badge.title}</p>
                                <p className="achievement-badge-desc">{badge.description}</p>
                                <div className="achievement-badge-footer">
                                    <span className="achievement-earned-date">
                                        Earned {formatEarnedDate(badge.earned_at)}
                                    </span>
                                    {ownerIdentifier && (
                                        <button
                                            type="button"
                                            className="achievement-badge-share-btn"
                                            onClick={() => {
                                                setCopiedUrl(false);
                                                setShareTarget({ mode: 'badge', badge });
                                            }}
                                            title={`Share "${badge.level_name}" achievement`}
                                        >
                                            🔗 Share
                                        </button>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            ) : (
                <p className="achievements-empty-note">
                    No badges earned yet — publish recipes, create recipe variants, share cooking stories, comment on community dishes, plan meals, or log workouts to unlock your first badge!
                </p>
            )}

            {tracks.length > 0 && (
                <div className="achievements-tracks-wrap">
                    <h4 className="achievements-tracks-heading">Achievement Progress</h4>
                    <div className="achievements-tracks-grid">
                        {tracks.map((track) => {
                            const target = track.next_target || track.current_value || 1;
                            const pct = track.next_target
                                ? Math.min(100, Math.round((track.current_value / target) * 100))
                                : 100;
                            return (
                                <div key={track.key} className="achievement-track-card">
                                    <div className="achievement-track-top">
                                        <span>
                                            {track.icon} <strong>{track.title}</strong>
                                        </span>
                                        <span className="achievement-track-lvl">
                                            Lv. {track.highest_level}/{track.max_level}
                                        </span>
                                    </div>
                                    <div className="achievement-progress-bar">
                                        <div
                                            className="achievement-progress-fill"
                                            style={{ width: `${pct}%` }}
                                        />
                                    </div>
                                    <div className="achievement-track-meta">
                                        <span>
                                            {track.current_value} {track.unit}
                                        </span>
                                        <span>
                                            {track.next_target
                                                ? `Next (Lv. ${track.next_level}: ${track.next_level_name}) at ${track.next_target}`
                                                : 'Max Level Reached!'}
                                        </span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {isSharedView && (
                <div className="achievements-cta-banner">
                    <div className="achievements-cta-text">
                        <h4>🏆 Start Earning Achievements at The Veggie Vault</h4>
                        <p>
                            Craft oil-free plant-based Masterpieces, remix recipe variants, share cooking stories, plan meals &amp; unlock chef badges!
                        </p>
                    </div>
                    <div className="achievements-cta-actions">
                        <Link to={user ? '/engine' : '/register'} className="achievements-cta-primary">
                            🌱 Start Earning Achievements
                        </Link>
                        <Link to="/" className="achievements-cta-secondary">
                            🍽️ Explore The Veggie Vault
                        </Link>
                    </div>
                </div>
            )}

            {/* SHARE ACHIEVEMENT MODAL */}
            {shareTarget && (
                <div
                    className="ach-share-backdrop"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="ach-share-modal-title"
                    onClick={() => setShareTarget(null)}
                >
                    <div className="ach-share-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="ach-share-modal-header">
                            <h3 id="ach-share-modal-title">
                                {shareTarget.mode === 'badge'
                                    ? `🔗 Share "${shareTarget.badge?.level_name}" Achievement`
                                    : '🔗 Share Achievements & Badges'}
                            </h3>
                            <button
                                type="button"
                                className="ach-share-close"
                                onClick={() => setShareTarget(null)}
                                aria-label="Close share dialog"
                            >
                                ✕
                            </button>
                        </div>

                        {/* Exact Profile Card Visual Preview + Start Earning Achievements Banner */}
                        <div className="ach-share-preview-card">
                            <div className="achievements-header">
                                <h3>🏆 Achievements &amp; Badges — {ownerDisplayName}</h3>
                                <span className="achievements-count-pill">
                                    {earned.length} {earned.length === 1 ? 'Badge Earned' : 'Badges Earned'}
                                </span>
                            </div>

                            {shareTarget.mode === 'badge' && shareTarget.badge ? (
                                <div className="ach-share-single-wrap">
                                    <div className={`achievement-badge-card level-${shareTarget.badge.level} is-spotlight`}>
                                        <div className="achievement-badge-top">
                                            <span className="achievement-icon" aria-hidden="true">
                                                {shareTarget.badge.icon}
                                            </span>
                                            <span className="achievement-level-pill">
                                                Level {shareTarget.badge.level}
                                            </span>
                                        </div>
                                        <h4 className="achievement-badge-name">{shareTarget.badge.level_name}</h4>
                                        <p className="achievement-badge-track">{shareTarget.badge.title}</p>
                                        <p className="achievement-badge-desc">{shareTarget.badge.description}</p>
                                        <span className="achievement-earned-date">
                                            Earned {formatEarnedDate(shareTarget.badge.earned_at)} by @{ownerProfile?.username || 'chef'}
                                        </span>
                                    </div>
                                </div>
                            ) : (
                                <div className="achievements-earned-grid ach-share-preview-grid">
                                    {earned.map((b) => (
                                        <div key={`${b.key}-${b.level}`} className={`achievement-badge-card level-${b.level}`}>
                                            <div className="achievement-badge-top">
                                                <span className="achievement-icon" aria-hidden="true">{b.icon}</span>
                                                <span className="achievement-level-pill">Level {b.level}</span>
                                            </div>
                                            <h4 className="achievement-badge-name">{b.level_name}</h4>
                                            <p className="achievement-badge-track">{b.title}</p>
                                            <p className="achievement-badge-desc">{b.description}</p>
                                            <span className="achievement-earned-date">
                                                Earned {formatEarnedDate(b.earned_at)}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}

                            <div className="achievements-cta-banner compact">
                                <div className="achievements-cta-text">
                                    <h4>🏆 Start Earning Achievements at The Veggie Vault</h4>
                                    <p>Join our Whole-Food Plant-Based community &amp; unlock your own chef badges!</p>
                                </div>
                            </div>
                        </div>

                        <div className="ach-share-link-row">
                            <input
                                type="text"
                                readOnly
                                value={shareUrl}
                                onClick={(e) => e.currentTarget.select()}
                            />
                            <button type="button" className="ach-share-primary-btn" onClick={handleCopyLink}>
                                {copiedUrl ? '✓ Link Copied!' : '📋 Copy Link'}
                            </button>
                        </div>

                        <div className="ach-share-actions-row">
                            <button
                                type="button"
                                className="ach-share-download-btn"
                                onClick={() => downloadAchievementCardPng(shareTarget, ownerProfile, earned)}
                            >
                                🖼️ Download Image Card (PNG)
                            </button>
                            <a
                                href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareHeadline)}&url=${encodeURIComponent(shareUrl)}`}
                                target="_blank"
                                rel="noreferrer"
                                className="ach-social-btn"
                            >
                                𝕏 Post
                            </a>
                            <a
                                href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`}
                                target="_blank"
                                rel="noreferrer"
                                className="ach-social-btn"
                            >
                                📘 Facebook
                            </a>
                            <a
                                href={`https://api.whatsapp.com/send?text=${encodeURIComponent(`${shareHeadline} ${shareUrl}`)}`}
                                target="_blank"
                                rel="noreferrer"
                                className="ach-social-btn"
                            >
                                💬 WhatsApp
                            </a>
                            <a
                                href={`https://www.reddit.com/submit?url=${encodeURIComponent(shareUrl)}&title=${encodeURIComponent(shareHeadline)}`}
                                target="_blank"
                                rel="noreferrer"
                                className="ach-social-btn"
                            >
                                👽 Reddit
                            </a>
                            <a
                                href={`mailto:?subject=${encodeURIComponent('My Veggie Vault Achievement!')}&body=${encodeURIComponent(`${shareHeadline}\n\n${shareUrl}`)}`}
                                className="ach-social-btn"
                            >
                                ✉️ Email
                            </a>
                            {typeof navigator !== 'undefined' && navigator.share && (
                                <button
                                    type="button"
                                    className="ach-social-btn"
                                    onClick={() =>
                                        navigator
                                            .share({
                                                title: 'My Veggie Vault Achievement!',
                                                text: shareHeadline,
                                                url: shareUrl,
                                            })
                                            .catch(() => {})
                                    }
                                >
                                    📤 Share
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </section>
    );
};

export default AchievementsSection;
