import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import './AchievementUnlockModal.css';

const parseAchievementNotification = (notif) => {
  const msg = String(notif?.message || '').trim();
  // Format: "🍳 Achievement Unlocked! You earned Level 2 \"Vault Artisan\" (Masterpiece Chef — Publish 10 recipes)."
  const match = msg.match(
    /^(\S+)\s+Achievement Unlocked!\s+You earned Level\s+(\d+)\s+"([^"]+)"\s*\(([^)]+)\)\.?$/i
  );

  if (match) {
    return {
      icon: match[1] || '🏆',
      level: Number(match[2]) || 1,
      badgeName: match[3],
      detail: match[4],
      rawMessage: msg,
    };
  }

  return {
    icon: '🏆',
    level: null,
    badgeName: 'New Badge Earned!',
    detail: msg,
    rawMessage: msg,
  };
};

export default function AchievementUnlockModal() {
  const navigate = useNavigate();
  const [queue, setQueue] = useState([]);

  useEffect(() => {
    const onUnlocked = (event) => {
      const incoming = Array.isArray(event?.detail?.achievements)
        ? event.detail.achievements
        : [];
      if (incoming.length === 0) return;

      setQueue((prev) => {
        const seen = new Set(prev.map((item) => item.id));
        const additions = incoming.filter((item) => item && !seen.has(item.id));
        return additions.length > 0 ? [...prev, ...additions] : prev;
      });
    };

    window.addEventListener('vault:achievement-unlocked', onUnlocked);
    return () => window.removeEventListener('vault:achievement-unlocked', onUnlocked);
  }, []);

  const currentNotif = queue[0] || null;

  const dismissCurrent = useCallback(() => {
    setQueue((prev) => prev.slice(1));
  }, []);

  const handleViewOnProfile = useCallback(async () => {
    if (!currentNotif) return;
    const notifId = currentNotif.id;
    setQueue([]);
    try {
      await api.markNotificationRead(notifId);
      window.dispatchEvent(new CustomEvent('vault:notification-read', { detail: { id: notifId } }));
    } catch {
      // Non-fatal
    }
    navigate('/profile#achievements');
  }, [currentNotif, navigate]);

  useEffect(() => {
    if (!currentNotif) return undefined;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        dismissCurrent();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [currentNotif, dismissCurrent]);

  if (!currentNotif) return null;

  const parsed = parseAchievementNotification(currentNotif);

  return (
    <div
      className="ach-unlock-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ach-unlock-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) dismissCurrent();
      }}
    >
      <div className="ach-unlock-card">
        <button
          type="button"
          className="ach-unlock-close"
          onClick={dismissCurrent}
          aria-label="Close achievement celebration"
        >
          ×
        </button>

        <div className="ach-unlock-emblem-wrap" aria-hidden="true">
          <div className="ach-unlock-glow" />
          <div className="ach-unlock-emblem">{parsed.icon}</div>
        </div>

        <div className="ach-unlock-eyebrow">
          🏆 Achievement Unlocked!
          {parsed.level ? ` · Level ${parsed.level}` : ''}
        </div>

        <h3 id="ach-unlock-title" className="ach-unlock-name">
          {parsed.badgeName}
        </h3>

        <p className="ach-unlock-detail">{parsed.detail}</p>

        {queue.length > 1 && (
          <div className="ach-unlock-queue-note">
            +{queue.length - 1} more achievement{queue.length - 1 === 1 ? '' : 's'} unlocked!
          </div>
        )}

        <div className="ach-unlock-actions">
          <button
            type="button"
            className="ach-unlock-primary-btn"
            onClick={handleViewOnProfile}
          >
            View on My Profile &rarr;
          </button>
          <button
            type="button"
            className="ach-unlock-secondary-btn"
            onClick={dismissCurrent}
          >
            {queue.length > 1 ? 'Next Badge' : 'Keep Cooking'}
          </button>
        </div>
      </div>
    </div>
  );
}
