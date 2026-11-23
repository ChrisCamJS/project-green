import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import RecipeCard from '../components/RecipeCard';
import StoryCard from '../components/StoryCard';
import UserHoverFollow from '../components/UserHoverFollow';
import AchievementsSection from '../components/AchievementsSection';
import SEOHead from '../components/SEOHead';
import RecipeFilterToolbar from '../components/RecipeFilterToolbar';
import { filterRecipesList } from '../utils/recipeFilterUtils';
import { SITE_URL, cleanSeoText } from '../utils/seoUtils';
import './Profile.css';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

const COMMON_ALLERGENS = [
  'Peanuts',
  'Tree Nuts',
  'Soy',
  'Gluten / Wheat',
  'Sesame',
  'Coconut',
  'Corn',
  'Mustard',
  'Nightshades',
  'Legumes',
];

const resolveAssetUrl = (path) => {
  if (!path) return null;
  if (path.startsWith('http') || path.startsWith('data:')) return path;
  return `${API_BASE_URL}${path}`;
};

export default function Profile() {
  const { identifier } = useParams();
  const navigate = useNavigate();
  const { user: currentUser, updateUser } = useAuth();

  const [profile, setProfile] = useState(null);
  const [recipes, setRecipes] = useState([]);
  const [stories, setStories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'edit' | 'security'

  // Follow button state
  const [followBusy, setFollowBusy] = useState(false);
  const [followMsg, setFollowMsg] = useState('');

  // Edit profile form state
  const [profileForm, setProfileForm] = useState({
    username: '',
    display_name: '',
    location: '',
    pronouns: '',
    favorite_cuisine: '',
    dietary_focus: '',
    allergies: '',
    website_url: '',
    bio: '',
  });
  const [avatarPreview, setAvatarPreview] = useState(null);
  const [pendingAvatarBase64, setPendingAvatarBase64] = useState('');
  const [removeAvatar, setRemoveAvatar] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileFeedback, setProfileFeedback] = useState({ type: '', text: '' });
  const [profileLinkCopied, setProfileLinkCopied] = useState(false);
  const followersSectionRef = useRef(null);

  const handleOpenFollowersSection = () => {
    setActiveTab('followers');
    setTimeout(() => {
      followersSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  };
  const [recipeSearchQuery, setRecipeSearchQuery] = useState('');
  const [recipeActiveFilters, setRecipeActiveFilters] = useState({
    glutenFree: false,
    oilFree: false,
    sugarFree: false,
  });
  const [recipeMinRating, setRecipeMinRating] = useState(0);

  // Email change form state
  const [emailForm, setEmailForm] = useState({
    email: '',
    currentPassword: '',
  });
  const [savingEmail, setSavingEmail] = useState(false);
  const [emailFeedback, setEmailFeedback] = useState({ type: '', text: '' });

  // Password change form state
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [showPasswords, setShowPasswords] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordFeedback, setPasswordFeedback] = useState({ type: '', text: '' });

  const loadProfile = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const target = identifier || '';
      const data = await api.getUserProfile(target);
      if (!data?.success || !data?.profile) {
        throw new Error(data?.message || 'Unable to load profile.');
      }

      const p = data.profile;
      setProfile(p);
      setRecipes(Array.isArray(data.recipes) ? data.recipes : []);
      setStories(Array.isArray(data.stories) ? data.stories : []);

      setProfileForm({
        username: p.username || '',
        display_name: p.display_name || '',
        location: p.location || '',
        pronouns: p.pronouns || '',
        favorite_cuisine: p.favorite_cuisine || '',
        dietary_focus: p.dietary_focus || '',
        allergies: p.allergies || '',
        website_url: p.website_url || '',
        bio: p.bio || '',
      });
      setAvatarPreview(resolveAssetUrl(p.profile_image));
      setPendingAvatarBase64('');
      setRemoveAvatar(false);
      setEmailForm({ email: p.email || '', currentPassword: '' });
    } catch (err) {
      setError(err.message || 'Chef profile could not be found.');
    } finally {
      setLoading(false);
    }
  }, [identifier]);

  useEffect(() => {
    setActiveTab('overview');
    setFollowMsg('');
    setProfileFeedback({ type: '', text: '' });
    setEmailFeedback({ type: '', text: '' });
    setPasswordFeedback({ type: '', text: '' });
    loadProfile();
  }, [loadProfile]);

  const handleToggleFollow = async () => {
    if (!currentUser) {
      navigate('/login');
      return;
    }
    if (!profile || followBusy) return;

    setFollowBusy(true);
    setFollowMsg('');
    try {
      const res = await api.toggleFollowUser(profile.id);
      if (res?.success) {
        setProfile((prev) => ({
          ...prev,
          is_following: res.isFollowing,
          follower_count: res.followerCount,
        }));
        setFollowMsg(res.message || '');
      }
    } catch (err) {
      setFollowMsg(err.message || 'Could not update follow status.');
    } finally {
      setFollowBusy(false);
    }
  };

  const handleAvatarChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setProfileFeedback({ type: 'error', text: 'Please select an image smaller than 5 MB.' });
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      setPendingAvatarBase64(reader.result);
      setAvatarPreview(reader.result);
      setRemoveAvatar(false);
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveAvatar = () => {
    setPendingAvatarBase64('');
    setAvatarPreview(null);
    setRemoveAvatar(true);
  };

  const activeAllergensList = useMemo(() => {
    return String(profileForm.allergies || '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }, [profileForm.allergies]);

  const handleToggleAllergen = (allergen) => {
    setProfileForm((prev) => {
      const currentList = String(prev.allergies || '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
      const exists = currentList.some((item) => item.toLowerCase() === allergen.toLowerCase());
      const nextList = exists
        ? currentList.filter((item) => item.toLowerCase() !== allergen.toLowerCase())
        : [...currentList, allergen];
      return { ...prev, allergies: nextList.join(', ') };
    });
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    setProfileFeedback({ type: '', text: '' });

    if (profileForm.username.trim().length < 3) {
      setProfileFeedback({ type: 'error', text: 'Username must be at least 3 characters.' });
      return;
    }

    setSavingProfile(true);
    try {
      const payload = {
        ...profileForm,
        username: profileForm.username.trim(),
        profile_image_base64: pendingAvatarBase64 || undefined,
        remove_avatar: removeAvatar,
      };
      const res = await api.updateUserProfile(payload);
      if (res?.success && res?.user) {
        updateUser(res.user);
        setProfile((prev) => ({
          ...prev,
          ...res.user,
          is_own_profile: true,
        }));
        setAvatarPreview(resolveAssetUrl(res.user.profile_image));
        setPendingAvatarBase64('');
        setRemoveAvatar(false);
        setProfileFeedback({ type: 'success', text: res.message || 'Profile updated successfully!' });
      }
    } catch (err) {
      setProfileFeedback({ type: 'error', text: err.message || 'Failed to save profile changes.' });
    } finally {
      setSavingProfile(false);
    }
  };

  const handleUpdateEmail = async (e) => {
    e.preventDefault();
    setEmailFeedback({ type: '', text: '' });

    if (!emailForm.email.trim() || !emailForm.currentPassword) {
      setEmailFeedback({ type: 'error', text: 'Please provide both a new email address and your current password.' });
      return;
    }

    setSavingEmail(true);
    try {
      const res = await api.updateUserEmail({
        email: emailForm.email.trim(),
        currentPassword: emailForm.currentPassword,
      });
      if (res?.success) {
        updateUser({ email: res.email });
        setProfile((prev) => ({ ...prev, email: res.email }));
        setEmailForm({ email: res.email, currentPassword: '' });
        setEmailFeedback({ type: 'success', text: res.message || 'Email updated successfully!' });
      }
    } catch (err) {
      setEmailFeedback({ type: 'error', text: err.message || 'Could not update email.' });
    } finally {
      setSavingEmail(false);
    }
  };

  const handleUpdatePassword = async (e) => {
    e.preventDefault();
    setPasswordFeedback({ type: '', text: '' });

    if (passwordForm.newPassword.length < 8) {
      setPasswordFeedback({ type: 'error', text: 'New password must be at least 8 characters long.' });
      return;
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordFeedback({ type: 'error', text: 'New password and confirmation do not match.' });
      return;
    }

    setSavingPassword(true);
    try {
      const res = await api.updateUserPassword(passwordForm);
      if (res?.success) {
        setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
        setPasswordFeedback({ type: 'success', text: res.message || 'Password updated successfully!' });
      }
    } catch (err) {
      setPasswordFeedback({ type: 'error', text: err.message || 'Could not update password.' });
    } finally {
      setSavingPassword(false);
    }
  };

  const filteredProfileRecipes = useMemo(
    () =>
      filterRecipesList(recipes, {
        searchQuery: recipeSearchQuery,
        activeFilters: recipeActiveFilters,
        minRating: recipeMinRating,
      }),
    [recipes, recipeSearchQuery, recipeActiveFilters, recipeMinRating]
  );

  const profileSeo = useMemo(() => {
    if (!profile) return null;
    const name = profile.display_name || profile.username || 'Chef Profile';
    const shareSlug = profile.username || profile.id;
    const path = shareSlug
      ? `/profile/${encodeURIComponent(shareSlug)}`
      : '/profile';
    const desc = cleanSeoText(
      profile.bio ||
        `Explore ${recipes.length} published whole-food plant-based recipes shared by ${name} on The Veggie Vault.`,
      160
    );
    const avatar = resolveAssetUrl(profile.profile_image);
    return {
      title: `${name} (@${profile.username}) — Chef Profile`,
      description: desc,
      canonicalPath: path,
      ogType: 'profile',
      image: avatar || undefined,
      noindex: !identifier && !shareSlug,
      jsonLd: {
        '@context': 'https://schema.org',
        '@type': 'ProfilePage',
        url: `${SITE_URL}${path}`,
        mainEntity: {
          '@type': 'Person',
          name,
          alternateName: `@${profile.username}`,
          description: desc,
          ...(avatar ? { image: avatar } : {}),
        },
      },
    };
  }, [profile, identifier, recipes.length]);

  if (loading) {
    return (
      <div className="profile-page-container">
        <div className="profile-loading-card">Loading chef profile...</div>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="profile-page-container">
        <div className="profile-error-card">
          <h2>Chef Not Found</h2>
          <p>{error || 'We could not find that profile in the Vault.'}</p>
          <Link to="/" className="profile-back-btn">&larr; Back to Home Feed</Link>
        </div>
      </div>
    );
  }

  const displayTitle = profile.display_name || profile.username;
  const avatarSrc = resolveAssetUrl(profile.profile_image);
  const avatarInitial = (displayTitle || 'V').charAt(0).toUpperCase();
  const memberSince = profile.created_at
    ? new Date(profile.created_at).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
    : 'Recently joined';

  return (
    <div className="profile-page-container">
      {profileSeo && <SEOHead {...profileSeo} />}
      <div className="profile-top-nav">
        <Link to="/" className="profile-back-link">&larr; Back to Recipes</Link>
        {profile.is_own_profile && (
          <Link to="/favorites" className="profile-vault-link">Manage Following in My Vault &rarr;</Link>
        )}
      </div>

      {/* HERO PROFILE CARD */}
      <section className="profile-hero-card">
        <div className="profile-hero-main">
          <div className="profile-avatar-wrapper">
            {avatarSrc ? (
              <img src={avatarSrc} alt={`${displayTitle}'s avatar`} className="profile-avatar-img" />
            ) : (
              <div className="profile-avatar-fallback" aria-label={displayTitle}>
                {avatarInitial}
              </div>
            )}
          </div>

          <div className="profile-identity">
            <div className="profile-name-row">
              <h1>
                <UserHoverFollow
                  userId={profile.id}
                  username={profile.username}
                  displayName={displayTitle}
                >
                  {displayTitle}
                </UserHoverFollow>
              </h1>
              {profile.account_tier === 'premium' && (
                <span className="profile-tier-badge">✨ Premium Chef</span>
              )}
              {profile.pronouns && (
                <span className="profile-pronouns-pill">{profile.pronouns}</span>
              )}
            </div>

            <div className="profile-handle-row">
              <span className="profile-username">@{profile.username}</span>
              {profile.location && (
                <span className="profile-meta-chip">📍 {profile.location}</span>
              )}
              <span className="profile-meta-chip">📅 Joined {memberSince}</span>
              {profile.website_url && (
                <a
                  href={profile.website_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="profile-website-link"
                >
                  🔗 {profile.website_url.replace(/^https?:\/\//i, '')}
                </a>
              )}
            </div>

            <p className="profile-bio">
              {profile.bio || (profile.is_own_profile
                ? 'Tell the community about your plant-based kitchen! Click "Edit Profile" below to add your bio, location, and specialty.'
                : 'Whole-food plant-based explorer in The Veggie Vault.')}
            </p>

            {(profile.favorite_cuisine || profile.dietary_focus || (profile.is_own_profile && profile.allergies)) && (
              <div className="profile-tags-row">
                {profile.favorite_cuisine && (
                  <span className="profile-interest-tag">🥘 Favorite Cuisine: {profile.favorite_cuisine}</span>
                )}
                {profile.dietary_focus && (
                  <span className="profile-interest-tag">🌱 Dietary Focus: {profile.dietary_focus}</span>
                )}
                {profile.is_own_profile && profile.allergies && (
                  <span className="profile-interest-tag allergy-tag">🛡️ Allergies (Emma Auto-Avoids): {profile.allergies}</span>
                )}
              </div>
            )}
          </div>

          <div className="profile-actions-col">
            <button
              type="button"
              onClick={async () => {
                const sharePath = `/profile/${encodeURIComponent(profile.username || profile.id)}`;
                const shareUrl = `${window.location.origin}${sharePath}`;
                try {
                  if (navigator.clipboard?.writeText) {
                    await navigator.clipboard.writeText(shareUrl);
                  } else {
                    window.prompt('Copy this profile link:', shareUrl);
                  }
                  setProfileLinkCopied(true);
                  setTimeout(() => setProfileLinkCopied(false), 2500);
                } catch {
                  window.prompt('Copy this profile link:', shareUrl);
                }
              }}
              className="profile-share-btn"
              title="Copy a shareable link to this chef profile"
            >
              {profileLinkCopied ? '✓ Profile Link Copied!' : '🔗 Share Profile'}
            </button>

            {!profile.is_own_profile && (
              <button
                type="button"
                onClick={handleToggleFollow}
                disabled={followBusy}
                className={`profile-follow-btn ${profile.is_following ? 'following' : ''}`}
              >
                {followBusy
                  ? 'Updating...'
                  : (profile.is_following ? '✓ Following Chef' : `➕ Follow @${profile.username}`)}
              </button>
            )}
            {followMsg && <p className="follow-status-msg">{followMsg}</p>}
          </div>
        </div>

        <div className="profile-stats-bar">
          <div className="profile-stat">
            <strong>{recipes.length}</strong>
            <span>Published Masterpieces</span>
          </div>
          <div className="profile-stat">
            <strong>{stories.length}</strong>
            <span>Recipe Stories</span>
          </div>
          <div
            className={`profile-stat ${profile.is_own_profile ? 'clickable' : ''}`}
            onClick={profile.is_own_profile ? handleOpenFollowersSection : undefined}
            role={profile.is_own_profile ? 'button' : undefined}
            tabIndex={profile.is_own_profile ? 0 : undefined}
            onKeyDown={
              profile.is_own_profile
                ? (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleOpenFollowersSection();
                    }
                  }
                : undefined
            }
            title={profile.is_own_profile ? 'Click to view your followers' : undefined}
          >
            <strong>{profile.follower_count ?? 0}</strong>
            <span>Followers</span>
          </div>
          <div className="profile-stat">
            <strong>{profile.following_count ?? 0}</strong>
            <span>Following</span>
          </div>
          {profile.is_own_profile && (
            <div className="profile-stat">
              <strong>{Number(Number(profile.generation_tokens ?? 0).toFixed(1))}</strong>
              <span>Emma Tokens</span>
              <Link to="/buy-tokens" className="profile-buy-tokens-link">
                + Buy More
              </Link>
            </div>
          )}
        </div>

        <AchievementsSection
          achievements={profile.achievements}
          ownerProfile={{
            id: profile.id,
            username: profile.username,
            displayName: displayTitle,
            profileImage: avatarSrc,
          }}
        />

        {profile.is_own_profile && (
          <div className="profile-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'overview'}
              className={`profile-tab-btn ${activeTab === 'overview' ? 'active' : ''}`}
              onClick={() => setActiveTab('overview')}
            >
              🍽️ My Masterpieces ({recipes.length})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'stories'}
              className={`profile-tab-btn ${activeTab === 'stories' ? 'active' : ''}`}
              onClick={() => setActiveTab('stories')}
            >
              📖 My Stories ({stories.length})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'followers'}
              className={`profile-tab-btn ${activeTab === 'followers' ? 'active' : ''}`}
              onClick={() => setActiveTab('followers')}
            >
              👥 Followers ({profile.follower_count ?? 0})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'edit'}
              className={`profile-tab-btn ${activeTab === 'edit' ? 'active' : ''}`}
              onClick={() => setActiveTab('edit')}
            >
              ✏️ Edit Profile
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'wellness'}
              className={`profile-tab-btn ${activeTab === 'wellness' ? 'active' : ''}`}
              onClick={() => setActiveTab('wellness')}
            >
              🥗 Wellness &amp; Targets
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'security'}
              className={`profile-tab-btn ${activeTab === 'security' ? 'active' : ''}`}
              onClick={() => setActiveTab('security')}
            >
              🔒 Email &amp; Password
            </button>
          </div>
        )}
      </section>

      {/* TAB 1: PUBLISHED RECIPES */}
      {(!profile.is_own_profile || activeTab === 'overview') && (
        <section className="profile-recipes-section">
          <h2 className="profile-section-heading">
            Published Recipes by {displayTitle}
          </h2>
          {recipes.length > 0 ? (
            <>
              <RecipeFilterToolbar
                recipes={recipes}
                filteredCount={filteredProfileRecipes.length}
                searchQuery={recipeSearchQuery}
                onSearchChange={setRecipeSearchQuery}
                activeFilters={recipeActiveFilters}
                onToggleFilter={(key) =>
                  setRecipeActiveFilters((prev) => ({ ...prev, [key]: !prev[key] }))
                }
                minRating={recipeMinRating}
                onRatingChange={setRecipeMinRating}
                onClearFilters={() => {
                  setRecipeSearchQuery('');
                  setRecipeActiveFilters({ glutenFree: false, oilFree: false, sugarFree: false });
                  setRecipeMinRating(0);
                }}
                placeholder="Search recipes by title, description, or ingredient..."
              />
              {filteredProfileRecipes.length > 0 ? (
                <div className="profile-recipes-grid">
                  {filteredProfileRecipes.map((recipe) => (
                    <RecipeCard key={recipe.id} recipe={recipe} />
                  ))}
                </div>
              ) : (
                <div className="profile-empty-recipes">
                  <p>No published recipes match your search or filters.</p>
                </div>
              )}
            </>
          ) : (
            <div className="profile-empty-recipes">
              <p>
                {profile.is_own_profile
                  ? 'You have not published any Masterpieces yet. Visit the Flavor Forge to craft and publish a recipe!'
                  : `${displayTitle} has not published any community Masterpieces yet.`}
              </p>
              {profile.is_own_profile && (
                <Link to="/engine" className="profile-cta-link">Open Emma&apos;s Flavor Forge</Link>
              )}
            </div>
          )}
        </section>
      )}

      {/* TAB / SECTION: PUBLISHED STORIES */}
      {((!profile.is_own_profile && stories.length > 0) || (profile.is_own_profile && activeTab === 'stories')) && (
        <section className="profile-recipes-section" aria-label={`Recipe stories by ${displayTitle}`}>
          <h2 className="profile-section-heading">
            📖 Recipe Stories by {displayTitle} ({stories.length})
          </h2>
          {stories.length > 0 ? (
            <div className="profile-recipes-grid">
              {stories.map((story) => (
                <StoryCard key={story.id} story={story} showRecipeTag />
              ))}
            </div>
          ) : (
            <div className="profile-empty-recipes">
              <p>
                You haven&apos;t written any Recipe Stories yet. Visit any recipe page and click &ldquo;Write a Story&rdquo; to share your cooking experience!
              </p>
            </div>
          )}
        </section>
      )}

      {/* TAB: FOLLOWERS (OWN PROFILE ONLY) */}
      {profile.is_own_profile && activeTab === 'followers' && (
        <section ref={followersSectionRef} className="profile-panel-card" aria-label="Your Followers">
          <h2>👥 Your Followers ({profile.follower_count ?? 0})</h2>
          <p className="profile-panel-subtitle">
            Chefs and community members following your Veggie Vault recipes.
          </p>

          {Array.isArray(profile.followers) && profile.followers.length > 0 ? (
            <div className="profile-followers-grid">
              {profile.followers.map((follower) => {
                const fAvatar = resolveAssetUrl(follower.profile_image);
                const fName = follower.display_name || follower.username;
                const fInitial = (fName || 'C').charAt(0).toUpperCase();
                return (
                  <Link
                    key={follower.id}
                    to={`/profile/${encodeURIComponent(follower.username || follower.id)}`}
                    className="profile-follower-card"
                  >
                    {fAvatar ? (
                      <img src={fAvatar} alt={fName} className="profile-follower-avatar" />
                    ) : (
                      <div className="profile-follower-avatar-fallback">{fInitial}</div>
                    )}
                    <div className="profile-follower-info">
                      <strong>{fName}</strong>
                      <span>@{follower.username}</span>
                      <small>
                        🍽️ {Number(follower.recipe_count || 0)}{' '}
                        {Number(follower.recipe_count || 0) === 1 ? 'Recipe' : 'Recipes'}
                        {follower.location ? ` · 📍 ${follower.location}` : ''}
                      </small>
                    </div>
                  </Link>
                );
              })}
            </div>
          ) : (
            <div className="profile-empty-recipes">
              <p>You don&apos;t have any followers yet. Share your profile link or publish a Masterpiece to grow your following!</p>
            </div>
          )}
        </section>
      )}

      {/* TAB 2: EDIT PROFILE */}
      {profile.is_own_profile && activeTab === 'edit' && (
        <section className="profile-panel-card">
          <h2>Edit Profile Information</h2>
          <p className="profile-panel-subtitle">
            Customize how other chefs see you across recipes, comments, and the community feed.
          </p>

          {profileFeedback.text && (
            <div className={`profile-alert ${profileFeedback.type}`}>
              {profileFeedback.text}
            </div>
          )}

          <form onSubmit={handleSaveProfile} className="profile-edit-form">
            <div className="avatar-upload-box">
              <div className="avatar-preview-frame">
                {avatarPreview ? (
                  <img src={avatarPreview} alt="Avatar preview" className="profile-avatar-img" />
                ) : (
                  <div className="profile-avatar-fallback">{avatarInitial}</div>
                )}
              </div>
              <div className="avatar-upload-controls">
                <label className="avatar-file-label">
                  📸 Upload Profile Image
                  <input type="file" accept="image/*" onChange={handleAvatarChange} hidden />
                </label>
                {avatarPreview && (
                  <button type="button" onClick={handleRemoveAvatar} className="avatar-remove-btn">
                    Remove Photo
                  </button>
                )}
                <small>JPG, PNG, or WebP up to 5 MB.</small>
              </div>
            </div>

            <div className="profile-form-grid">
              <label className="profile-field">
                <span>Username *</span>
                <input
                  type="text"
                  value={profileForm.username}
                  onChange={(e) => setProfileForm((prev) => ({ ...prev, username: e.target.value }))}
                  minLength={3}
                  maxLength={50}
                  required
                />
              </label>

              <label className="profile-field">
                <span>Display Name</span>
                <input
                  type="text"
                  placeholder="e.g., Chef Emma Taylor"
                  value={profileForm.display_name}
                  onChange={(e) => setProfileForm((prev) => ({ ...prev, display_name: e.target.value }))}
                  maxLength={100}
                />
              </label>

              <label className="profile-field">
                <span>Location (City, State or Region)</span>
                <input
                  type="text"
                  placeholder="e.g., Austin, TX or Pacific Northwest"
                  value={profileForm.location}
                  onChange={(e) => setProfileForm((prev) => ({ ...prev, location: e.target.value }))}
                  maxLength={120}
                />
              </label>

              <label className="profile-field">
                <span>Pronouns</span>
                <input
                  type="text"
                  placeholder="e.g., she/her, he/him, they/them"
                  value={profileForm.pronouns}
                  onChange={(e) => setProfileForm((prev) => ({ ...prev, pronouns: e.target.value }))}
                  maxLength={50}
                />
              </label>

              <label className="profile-field">
                <span>Favorite Cuisine / Specialty</span>
                <input
                  type="text"
                  placeholder="e.g., Mediterranean Bowls, Oil-Free Baking"
                  value={profileForm.favorite_cuisine}
                  onChange={(e) => setProfileForm((prev) => ({ ...prev, favorite_cuisine: e.target.value }))}
                  maxLength={120}
                />
              </label>

              <label className="profile-field">
                <span>Dietary Focus</span>
                <input
                  type="text"
                  placeholder="e.g., 100% WFPB Oil-Free, Gluten-Free"
                  value={profileForm.dietary_focus}
                  onChange={(e) => setProfileForm((prev) => ({ ...prev, dietary_focus: e.target.value }))}
                  maxLength={120}
                />
              </label>
            </div>

            <div className="profile-allergies-box">
              <div className="profile-allergies-header">
                <span>🛡️ Allergies &amp; Food Sensitivities</span>
                <small>Emma will automatically exclude these ingredients and hidden derivatives whenever generating recipes or planning meals for you.</small>
              </div>
              <div className="profile-allergen-chips">
                {COMMON_ALLERGENS.map((allergen) => {
                  const isSelected = activeAllergensList.some(
                    (item) => item.toLowerCase() === allergen.toLowerCase()
                  );
                  return (
                    <button
                      key={allergen}
                      type="button"
                      className={`allergen-chip-btn ${isSelected ? 'selected' : ''}`}
                      onClick={() => handleToggleAllergen(allergen)}
                    >
                      {isSelected ? '✕ ' : '+ '}
                      {allergen}
                    </button>
                  );
                })}
              </div>
              <label className="profile-field full-width" style={{ marginBottom: 0 }}>
                <span>Saved Allergies (comma-separated, add any custom ones)</span>
                <input
                  type="text"
                  placeholder="e.g., Peanuts, Soy, Sesame, Kiwi, Cinnamon"
                  value={profileForm.allergies}
                  onChange={(e) => setProfileForm((prev) => ({ ...prev, allergies: e.target.value }))}
                />
              </label>
            </div>

            <label className="profile-field full-width">
              <span>Website or Social Link</span>
              <input
                type="text"
                placeholder="https://yourkitchenblog.com"
                value={profileForm.website_url}
                onChange={(e) => setProfileForm((prev) => ({ ...prev, website_url: e.target.value }))}
                maxLength={255}
              />
            </label>

            <label className="profile-field full-width">
              <span>Chef Bio</span>
              <textarea
                rows={4}
                placeholder="Share your culinary story, favorite seasonal ingredients, and what inspires your meals..."
                value={profileForm.bio}
                onChange={(e) => setProfileForm((prev) => ({ ...prev, bio: e.target.value }))}
              />
            </label>

            <div className="profile-form-footer">
              <button type="submit" disabled={savingProfile} className="profile-save-btn">
                {savingProfile ? 'Saving Profile...' : '💾 Save Profile Changes'}
              </button>
            </div>
          </form>
        </section>
      )}

      {/* TAB 3: ACCOUNT SECURITY (EMAIL & PASSWORD) */}
      {profile.is_own_profile && activeTab === 'security' && (
        <div className="security-cards-grid">
          <section className="profile-panel-card">
            <h2>Change Email Address</h2>
            <p className="profile-panel-subtitle">
              Current email: <strong>{profile.email}</strong>
            </p>

            {emailFeedback.text && (
              <div className={`profile-alert ${emailFeedback.type}`}>
                {emailFeedback.text}
              </div>
            )}

            <form onSubmit={handleUpdateEmail} className="security-form">
              <label className="profile-field">
                <span>New Email Address</span>
                <input
                  type="email"
                  value={emailForm.email}
                  onChange={(e) => setEmailForm((prev) => ({ ...prev, email: e.target.value }))}
                  required
                />
              </label>

              <label className="profile-field">
                <span>Current Password (to confirm)</span>
                <input
                  type="password"
                  value={emailForm.currentPassword}
                  onChange={(e) => setEmailForm((prev) => ({ ...prev, currentPassword: e.target.value }))}
                  placeholder="Enter your current password"
                  required
                />
              </label>

              <button type="submit" disabled={savingEmail} className="profile-save-btn">
                {savingEmail ? 'Updating Email...' : '📧 Update Email Address'}
              </button>
            </form>
          </section>

          <section className="profile-panel-card">
            <h2>Change Password</h2>
            <p className="profile-panel-subtitle">
              Choose a strong password of at least 8 characters to keep your Vault safe.
            </p>

            {passwordFeedback.text && (
              <div className={`profile-alert ${passwordFeedback.type}`}>
                {passwordFeedback.text}
              </div>
            )}

            <form onSubmit={handleUpdatePassword} className="security-form">
              <label className="profile-field">
                <span>Current Password</span>
                <input
                  type={showPasswords ? 'text' : 'password'}
                  value={passwordForm.currentPassword}
                  onChange={(e) => setPasswordForm((prev) => ({ ...prev, currentPassword: e.target.value }))}
                  required
                />
              </label>

              <label className="profile-field">
                <span>New Password</span>
                <input
                  type={showPasswords ? 'text' : 'password'}
                  value={passwordForm.newPassword}
                  onChange={(e) => setPasswordForm((prev) => ({ ...prev, newPassword: e.target.value }))}
                  minLength={8}
                  required
                />
              </label>

              <label className="profile-field">
                <span>Confirm New Password</span>
                <input
                  type={showPasswords ? 'text' : 'password'}
                  value={passwordForm.confirmPassword}
                  onChange={(e) => setPasswordForm((prev) => ({ ...prev, confirmPassword: e.target.value }))}
                  minLength={8}
                  required
                />
              </label>

              <label className="show-password-toggle">
                <input
                  type="checkbox"
                  checked={showPasswords}
                  onChange={(e) => setShowPasswords(e.target.checked)}
                />
                <span>Show passwords</span>
              </label>

              <button type="submit" disabled={savingPassword} className="profile-save-btn">
                {savingPassword ? 'Updating Password...' : '🔑 Update Password'}
              </button>
            </form>
          </section>
        </div>
      )}

      {/* TAB 4: WELLNESS & NUTRITION TARGETS */}
      {profile.is_own_profile && activeTab === 'wellness' && (
        <div className="profile-wellness-card animate-fade-in">
          <div className="profile-wellness-header">
            <div>
              <h2>🥗 My Wellness &amp; Nutrition Targets</h2>
              <p style={{ margin: '0.25rem 0 0', color: '#64748b', fontSize: '0.9rem' }}>
                These targets calibrate your daily intake progress in the Meal Planner and guide Emma when planning meals.
              </p>
            </div>
            <div className="profile-wellness-actions">
              <Link to="/wellness" className="profile-wellness-btn primary">
                ✏️ Open Wellness Calculators
              </Link>
              <Link to="/meal-planner" className="profile-wellness-btn secondary">
                📅 Open Meal Planner
              </Link>
            </div>
          </div>

          {(profile.calorie_target || profile.protein_target_g || profile.bmi || profile.tdee) ? (
            <>
              <div className="profile-wellness-grid">
                <div className="profile-wellness-chip">
                  <span className="chip-label">Daily Calorie Target</span>
                  <span className="chip-val">
                    {profile.calorie_target ? `${Number(profile.calorie_target).toLocaleString()} kcal` : 'Standard 2,000 kcal'}
                  </span>
                  <span className="chip-sub">Active daily calorie goal</span>
                </div>

                <div className="profile-wellness-chip">
                  <span className="chip-label">Target Protein</span>
                  <span className="chip-val">
                    {profile.protein_target_g ? `${profile.protein_target_g}g` : '50g'}
                  </span>
                  <span className="chip-sub">
                    {profile.macro_plan ? `Plan: ${profile.macro_plan}` : 'Standard baseline'}
                  </span>
                </div>

                <div className="profile-wellness-chip">
                  <span className="chip-label">Target Carbs</span>
                  <span className="chip-val">
                    {profile.carbs_target_g ? `${profile.carbs_target_g}g` : '275g'}
                  </span>
                  <span className="chip-sub">Clean plant-based fuel</span>
                </div>

                <div className="profile-wellness-chip">
                  <span className="chip-label">Target Fat</span>
                  <span className="chip-val">
                    {profile.fat_target_g ? `${profile.fat_target_g}g` : '78g'}
                  </span>
                  <span className="chip-sub">Nuts, seeds, avocado baseline</span>
                </div>

                <div className="profile-wellness-chip">
                  <span className="chip-label">Body Mass Index (BMI)</span>
                  <span className="chip-val">{profile.bmi || 'Not set'}</span>
                  <span className="chip-sub">
                    {profile.height_ft ? `${profile.height_ft}'${profile.height_in || 0}" | ${profile.weight_lbs || 0} lbs` : 'Body composition'}
                  </span>
                </div>

                <div className="profile-wellness-chip">
                  <span className="chip-label">Maintenance TDEE</span>
                  <span className="chip-val">
                    {profile.tdee ? `${Number(profile.tdee).toLocaleString()} kcal` : 'Not set'}
                  </span>
                  <span className="chip-sub">
                    {profile.bmr ? `BMR: ${Number(profile.bmr).toLocaleString()} kcal` : 'Daily expenditure'}
                  </span>
                </div>
              </div>

              <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '12px', padding: '1rem 1.25rem', color: '#166534', fontSize: '0.9rem' }}>
                ✨ <strong>Emma Synced:</strong> When chatting or using Live Audio on the Meal Planner, Emma directly references these exact caloric and macronutrient targets when recommending recipes or populating your week.
              </div>
            </>
          ) : (
            <div className="profile-wellness-empty">
              <p>
                You haven&apos;t saved your wellness calculations yet. Use our precision BMI, TDEE, and Macronutrient calculators to set personal targets for yourself and Emma!
              </p>
              <Link to="/wellness" className="profile-wellness-btn primary">
                🚀 Calculate &amp; Save My Targets Now
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
