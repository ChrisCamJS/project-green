import React, { useState, useEffect, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import AchievementsSection from '../components/AchievementsSection';
import SEOHead from '../components/SEOHead';
import { resolveRecipeImageUrl } from '../utils/mealPlanUtils';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

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

export default function SharedAchievement() {
  const { identifier, badgeKey, level } = useParams();
  const { user } = useAuth();

  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let active = true;
    const loadProfile = async () => {
      setLoading(true);
      setError('');
      try {
        const res = await api.getUserProfile(identifier);
        if (!active) return;
        if (res?.profile) {
          setProfile(res.profile);
        } else {
          setError(res?.message || 'Chef achievements could not be loaded.');
        }
      } catch (err) {
        if (!active) return;
        setError(err?.message || 'Could not load shared achievements.');
      } finally {
        if (active) setLoading(false);
      }
    };

    if (identifier) {
      loadProfile();
    }
    return () => {
      active = false;
    };
  }, [identifier]);

  const earnedBadges = useMemo(
    () => profile?.achievements?.earned || [],
    [profile]
  );

  const spotlightBadge = useMemo(() => {
    if (!badgeKey || !level) return null;
    const numLevel = Number(level);
    return (
      earnedBadges.find(
        (b) => b.key === badgeKey && Number(b.level) === numLevel
      ) || null
    );
  }, [earnedBadges, badgeKey, level]);

  const handleCopyLink = async () => {
    const url = window.location.href;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        window.prompt('Copy achievement link:', url);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      window.prompt('Copy achievement link:', url);
    }
  };

  if (loading) {
    return (
      <div className="shared-achievement-page">
        <div className="shared-ach-loading">Loading Veggie Vault achievements...</div>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="shared-achievement-page">
        <div className="shared-ach-error" role="alert">
          {error || 'Achievement page not found.'}
        </div>
        <Link to="/" className="ach-social-btn">
          &larr; Explore The Veggie Vault
        </Link>
      </div>
    );
  }

  const displayName = profile.display_name || profile.username || 'Vault Chef';
  const avatarSrc = profile.profile_image ? resolveRecipeImageUrl(profile.profile_image) : null;
  const initial = (displayName || 'C').charAt(0).toUpperCase();

  const seoTitle = spotlightBadge
    ? `${displayName} Unlocked "${spotlightBadge.level_name}" | The Veggie Vault`
    : `${displayName}'s Achievements & Badges | The Veggie Vault`;

  const seoDesc = spotlightBadge
    ? `${displayName} (@${profile.username}) earned Level ${spotlightBadge.level} "${spotlightBadge.level_name}" (${spotlightBadge.description}). Start earning achievements at The Veggie Vault!`
    : `${displayName} (@${profile.username}) has earned ${earnedBadges.length} Whole-Food Plant-Based chef badges. Start earning achievements at The Veggie Vault!`;

  const ogCompositeImage =
    API_BASE_URL && (profile.username || identifier)
      ? `${API_BASE_URL.replace(/\/+$/, '')}/users/profile-og-image?identifier=${encodeURIComponent(profile.username || identifier)}&mode=achievements${
          badgeKey && level
            ? `&badge_key=${encodeURIComponent(badgeKey)}&level=${encodeURIComponent(level)}`
            : ''
        }`
      : undefined;

  return (
    <div className="shared-achievement-page">
      <SEOHead
        title={seoTitle}
        description={seoDesc}
        ogType="profile"
        image={ogCompositeImage}
        canonicalPath={
          badgeKey && level
            ? `/achievements/shared/${encodeURIComponent(identifier)}/${encodeURIComponent(badgeKey)}/${level}`
            : `/achievements/shared/${encodeURIComponent(identifier)}`
        }
      />

      <header className="shared-ach-chef-card">
        <div className="shared-ach-chef-left">
          {avatarSrc ? (
            <img
              src={avatarSrc}
              alt={displayName}
              className="shared-ach-avatar"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
          ) : (
            <div className="shared-ach-avatar-fallback">{initial}</div>
          )}
          <div>
            <span className="shared-ach-kicker">Chef Achievement Showcase</span>
            <h1>{displayName}</h1>
            <span className="shared-ach-handle">
              @{profile.username} • {earnedBadges.length}{' '}
              {earnedBadges.length === 1 ? 'Badge Earned' : 'Badges Earned'}
            </span>
          </div>
        </div>

        <div className="shared-ach-chef-actions">
          <Link
            to={`/profile/${encodeURIComponent(profile.username || profile.id)}`}
            className="ach-social-btn"
          >
            👨‍🍳 View Full Chef Profile
          </Link>
          <button type="button" className="ach-share-primary-btn" onClick={handleCopyLink}>
            {copied ? '✓ Link Copied!' : '📋 Copy Share Link'}
          </button>
        </div>
      </header>

      {spotlightBadge && (
        <section className="shared-ach-spotlight-panel" aria-label="Shared achievement highlight">
          <div className="shared-ach-spotlight-label">
            ✨ {displayName} Unlocked This Achievement!
          </div>

          <div className="ach-share-single-wrap">
            <div className={`achievement-badge-card level-${spotlightBadge.level} is-spotlight`}>
              <div className="achievement-badge-top">
                <span className="achievement-icon" aria-hidden="true">
                  {spotlightBadge.icon}
                </span>
                <span className="achievement-level-pill">
                  Level {spotlightBadge.level}
                </span>
              </div>
              <h4 className="achievement-badge-name">{spotlightBadge.level_name}</h4>
              <p className="achievement-badge-track">{spotlightBadge.title}</p>
              <p className="achievement-badge-desc">{spotlightBadge.description}</p>
              <span className="achievement-earned-date">
                Earned {formatEarnedDate(spotlightBadge.earned_at)} by @{profile.username}
              </span>
            </div>
          </div>

          <div className="achievements-cta-banner">
            <div className="achievements-cta-text">
              <h4>🏆 Start Earning Achievements at The Veggie Vault</h4>
              <p>
                Publish plant-based recipes, remix variants, write stories, plan your meals &amp; collect chef badges!
              </p>
            </div>
            <div className="achievements-cta-actions">
              <Link to={user ? '/engine' : '/register'} className="achievements-cta-primary">
                🌱 Start Earning Achievements
              </Link>
              <Link to="/" className="achievements-cta-secondary">
                🍽️ Explore Recipes
              </Link>
            </div>
          </div>
        </section>
      )}

      <AchievementsSection
        achievements={profile.achievements}
        ownerProfile={{
          id: profile.id,
          username: profile.username,
          displayName,
          profileImage: avatarSrc,
        }}
        isSharedView={!spotlightBadge}
        highlightedBadgeKey={badgeKey || null}
        highlightedLevel={level ? Number(level) : null}
      />
    </div>
  );
}
