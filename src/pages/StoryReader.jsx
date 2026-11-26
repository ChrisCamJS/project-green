import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import SEOHead from '../components/SEOHead';
import { SITE_URL } from '../utils/seoUtils';
import StoryCard from '../components/StoryCard';
import { resolveStoryAssetUrl, formatStoryDate } from '../utils/storyUtils';
import StoryEditorModal from '../components/StoryEditorModal';
import VariantBadge from '../components/VariantBadge';
import { navigateToLogin } from '../utils/authRedirect';
import './StoryReader.css';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

/**
 * Ensures any root-relative `/images/...` or `/uploads/...` src attributes inside
 * sanitized story HTML resolve against the configured API_BASE_URL.
 */
const normalizeInlineHtmlImages = (html = '') => {
  if (!html || !API_BASE_URL) return html;
  return String(html).replace(
    /(<img\b[^>]*?\bsrc=["'])(\/(?:images|uploads)\/[^"']+)(["'])/gi,
    (_, prefix, relPath, suffix) => `${prefix}${API_BASE_URL}${relPath}${suffix}`
  );
};

const StoryReader = () => {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [story, setStory] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [likeBusy, setLikeBusy] = useState(false);
  const [copyToast, setCopyToast] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isWriteNewModalOpen, setIsWriteNewModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchStory = useCallback(async () => {
    if (!slug) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.getStoryBySlug(slug);
      if (res?.success && res.story) {
        setStory(res.story);
      } else {
        throw new Error(res?.message || 'Story could not be found.');
      }
    } catch (err) {
      setError(err?.message || 'Story not found in the Vault.');
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    fetchStory();
  }, [fetchStory]);

  const handleToggleLike = async () => {
    if (!user) {
      navigateToLogin(navigate);
      return;
    }
    if (!story || likeBusy) return;
    setLikeBusy(true);
    try {
      const res = await api.toggleStoryLike(story.id);
      if (res?.success) {
        setStory((prev) => ({
          ...prev,
          isLiked: res.isLiked,
          likeCount: res.likeCount,
        }));
      }
    } catch {
      // ignore transient error
    } finally {
      setLikeBusy(false);
    }
  };

  const canonicalStoryUrl = story?.slug
    ? `${typeof window !== 'undefined' ? window.location.origin : SITE_URL}/stories/${encodeURIComponent(story.slug)}`
    : typeof window !== 'undefined'
      ? window.location.href
      : SITE_URL;

  const handleCopyStoryLink = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(canonicalStoryUrl);
      } else {
        const input = document.createElement('textarea');
        input.value = canonicalStoryUrl;
        input.setAttribute('readonly', '');
        input.style.position = 'fixed';
        input.style.opacity = '0';
        document.body.appendChild(input);
        input.select();
        document.execCommand('copy');
        document.body.removeChild(input);
      }
      setCopyToast(true);
      setTimeout(() => setCopyToast(false), 2600);
    } catch {
      window.prompt('Copy this story link:', canonicalStoryUrl);
    }
  };

  const handleDeleteStory = async () => {
    if (!story || isDeleting) return;
    const confirmed = window.confirm(
      `Are you sure you want to delete your story "${story.title}"? This cannot be undone.`
    );
    if (!confirmed) return;

    setIsDeleting(true);
    try {
      const res = await api.deleteStory(story.id);
      if (res?.success) {
        const targetRecipeId = story.recipeId || story.recipe_id || story.recipe?.id;
        if (targetRecipeId) {
          navigate(`/recipe/${targetRecipeId}`);
        } else {
          navigate('/');
        }
      }
    } catch (err) {
      alert(err?.message || 'Could not delete story.');
      setIsDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="story-reader-loading">
        <div className="story-reader-spinner" />
        <p>Opening community story...</p>
      </div>
    );
  }

  if (error || !story) {
    return (
      <div className="story-reader-error-box">
        <h2>Story Not Found</h2>
        <p>{error || 'This story may have been moved or removed.'}</p>
        <Link to="/" className="story-reader-home-btn">
          ← Return to The Veggie Vault
        </Link>
      </div>
    );
  }

  const linkedRecipe = story.recipe || null;
  const recipeId = linkedRecipe?.id || story.recipeId || story.recipe_id;
  const recipeTitle = linkedRecipe?.title || story.recipeTitle || 'Linked Recipe';
  const heroCoverUrl = resolveStoryAssetUrl(
    story.coverImage || story.cover_image || story.effectiveCoverImage || linkedRecipe?.imageUrl
  );
  const recipeThumbUrl = resolveStoryAssetUrl(linkedRecipe?.imageUrl || story.recipeImageUrl);

  const authorUsername = story.authorName || 'Vault Chef';
  const authorLabel = story.authorDisplayName || authorUsername;
  const authorAvatarUrl = story.authorAvatar ? resolveStoryAssetUrl(story.authorAvatar, null) : null;
  const authorInitial = String(authorLabel || 'C').charAt(0).toUpperCase();
  const publishedDate = formatStoryDate(story.createdAt || story.created_at);
  const readTime = Math.max(1, Number(story.readTimeMinutes || story.read_time_minutes || 1));

  const isAdmin = Boolean(user && (Number(user.is_admin) === 1 || user.is_admin === true));
  const isStoryOwner = Boolean(
    user && (Number(user.id) === Number(story.userId || story.user_id) || isAdmin)
  );

  const rawCreated = story.createdAt || story.created_at || '';
  const parsedCreated = rawCreated ? new Date(String(rawCreated).replace(' ', 'T')) : null;
  const publishedIso =
    parsedCreated && !Number.isNaN(parsedCreated.getTime())
      ? parsedCreated.toISOString()
      : new Date().toISOString();

  const blogPostingJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': `${SITE_URL}/stories/${story.slug}`,
    },
    headline: story.title,
    description: story.excerpt,
    image: [heroCoverUrl],
    url: `${SITE_URL}/stories/${story.slug}`,
    datePublished: publishedIso,
    timeRequired: `PT${readTime}M`,
    author: {
      '@type': 'Person',
      name: authorLabel,
      url: `${SITE_URL}/profile/${encodeURIComponent(authorUsername)}`,
    },
    publisher: {
      '@type': 'Organization',
      name: 'The Veggie Vault',
      url: SITE_URL,
      logo: {
        '@type': 'ImageObject',
        url: `${SITE_URL}/og-vault-preview.jpeg`,
      },
    },
    ...(recipeId
      ? {
          about: {
            '@type': 'Recipe',
            name: recipeTitle,
            url: `${SITE_URL}/recipe/${recipeId}`,
          },
        }
      : {}),
  };

  const renderedHtml = normalizeInlineHtmlImages(story.contentHtml || story.content_html || '');
  const shareText = `${story.title} — A cooking story about "${recipeTitle}" on The Veggie Vault`;
  const relatedStories = Array.isArray(story.relatedStories) ? story.relatedStories : [];

  return (
    <div className="story-reader-page">
      <SEOHead
        title={`${story.title} — Story by ${authorLabel}`}
        description={story.excerpt}
        canonicalPath={`/stories/${story.slug}`}
        ogType="article"
        image={heroCoverUrl}
        publishedTime={publishedIso}
        authorName={authorLabel}
        jsonLd={blogPostingJsonLd}
      />

      {/* Top Navigation Bar */}
      <div className="story-reader-nav no-print">
        {recipeId ? (
          <Link to={`/recipe/${recipeId}`} className="story-reader-back-link">
            ← Back to Recipe: <strong>{recipeTitle}</strong>
          </Link>
        ) : (
          <Link to="/" className="story-reader-back-link">
            ← Back to All Recipes
          </Link>
        )}

        {isStoryOwner && (
          <div className="story-reader-owner-actions">
            <button
              type="button"
              className="story-reader-edit-btn"
              onClick={() => setIsEditModalOpen(true)}
            >
              ✏️ Edit Story
            </button>
            <button
              type="button"
              className="story-reader-delete-btn"
              onClick={handleDeleteStory}
              disabled={isDeleting}
            >
              {isDeleting ? 'Deleting...' : '🗑️ Delete'}
            </button>
          </div>
        )}
      </div>

      <article className="story-reader-article">
        {/* Hero Banner */}
        <header className="story-reader-header">
          <div className="story-reader-kicker-row">
            <span className="story-reader-kicker">📖 Community Recipe Story</span>
            {story.status === 'draft' && (
              <span className="story-reader-draft-badge">🔒 Private Draft</span>
            )}
          </div>

          <h1 className="story-reader-headline">{story.title}</h1>

          <p className="story-reader-lead">{story.excerpt}</p>

          <div className="story-reader-byline-bar">
            <Link
              to={`/profile/${encodeURIComponent(authorUsername)}`}
              className="story-reader-author-box"
            >
              {authorAvatarUrl ? (
                <img
                  src={authorAvatarUrl}
                  alt={authorLabel}
                  className="story-reader-author-avatar"
                />
              ) : (
                <span className="story-reader-author-initial" aria-hidden="true">
                  {authorInitial}
                </span>
              )}
              <div className="story-reader-author-text">
                <span className="story-reader-author-name">{authorLabel}</span>
                <span className="story-reader-meta-line">
                  @{authorUsername}
                  {publishedDate ? ` · ${publishedDate}` : ''}
                  {` · 📖 ${readTime} min read`}
                </span>
              </div>
            </Link>

            <div className="story-reader-Quick-actions no-print">
              <button
                type="button"
                className={`story-reader-like-btn ${story.isLiked ? 'liked' : ''}`}
                onClick={handleToggleLike}
                disabled={likeBusy}
                title="Appreciate this story"
              >
                {story.isLiked ? '❤️' : '🤍'} {Number(story.likeCount || 0)}
              </button>

              <button
                type="button"
                className="story-reader-copy-btn"
                onClick={handleCopyStoryLink}
              >
                {copyToast ? '✓ Story Link Copied!' : '🔗 Copy Story Link'}
              </button>
            </div>
          </div>
        </header>

        {/* Hero Cover Photo */}
        <div className="story-reader-hero-frame">
          <img
            src={heroCoverUrl}
            alt={story.title}
            className="story-reader-hero-img"
            onError={(e) => {
              e.currentTarget.src = '/og-vault-preview.jpeg';
            }}
          />
        </div>

        {/* Pinned Embedded Recipe Reference Card (Top) */}
        {linkedRecipe && (
          <aside className="story-recipe-ref-card" aria-label="Featured Recipe">
            <Link to={`/recipe/${linkedRecipe.id}`} className="story-recipe-ref-thumb-link">
              <img
                src={recipeThumbUrl}
                alt={linkedRecipe.title}
                className="story-recipe-ref-thumb"
                onError={(e) => {
                  e.currentTarget.src = '/og-vault-preview.jpeg';
                }}
              />
            </Link>

            <div className="story-recipe-ref-content">
              <div className="story-recipe-ref-top">
                <span className="story-recipe-ref-tag">🍽️ Featured Vault Recipe</span>
                {linkedRecipe.parentRecipeId && (
                  <VariantBadge
                    compact
                    parentRecipeId={linkedRecipe.parentRecipeId}
                    parentRecipeTitle={linkedRecipe.parentRecipeTitle || 'Original Recipe'}
                    isMasterpiece={Boolean(linkedRecipe.isMasterpiece)}
                    variantSummary={linkedRecipe.variantSummary}
                  />
                )}
              </div>

              <h2 className="story-recipe-ref-title">
                <Link to={`/recipe/${linkedRecipe.id}`}>{linkedRecipe.title}</Link>
              </h2>

              <p className="story-recipe-ref-creator">
                Recipe by <strong>{linkedRecipe.authorName || 'Emma (AI)'}</strong>
                {(linkedRecipe.prepTime || linkedRecipe.cookTime) ? (
                  <>
                    {' · '}⏱️ Prep {linkedRecipe.prepTime || 0}m · 🔥 Cook {linkedRecipe.cookTime || 0}m
                  </>
                ) : null}
              </p>

              {(linkedRecipe.calories || linkedRecipe.protein_g) && (
                <div className="story-recipe-ref-macros">
                  {linkedRecipe.calories != null && (
                    <span>🔥 {Math.round(linkedRecipe.calories)} kcal</span>
                  )}
                  {linkedRecipe.protein_g != null && (
                    <span>💪 {linkedRecipe.protein_g}g Protein</span>
                  )}
                  {linkedRecipe.carbs_g != null && (
                    <span>🥖 {linkedRecipe.carbs_g}g Carbs</span>
                  )}
                  {linkedRecipe.fat_g != null && (
                    <span>🥑 {linkedRecipe.fat_g}g Fat</span>
                  )}
                </div>
              )}
            </div>

            <div className="story-recipe-ref-cta">
              <Link to={`/recipe/${linkedRecipe.id}`} className="story-recipe-ref-btn">
                Cook This Recipe →
              </Link>
            </div>
          </aside>
        )}

        {/* Sanitized Rich-Text Story Body */}
        <div
          className="story-reader-content"
          dangerouslySetInnerHTML={{ __html: renderedHtml }}
        />

        {/* Social Share Bar */}
        <footer className="story-reader-share-bar no-print" aria-label="Share this story">
          <div className="story-reader-share-left">
            <span className="story-reader-share-label">📣 Share this Story:</span>
            {copyToast && (
              <span className="story-reader-toast" role="status">
                ✓ Link copied to clipboard!
              </span>
            )}
          </div>

          <div className="story-reader-share-buttons">
            <button
              type="button"
              className="story-share-pill copy"
              onClick={handleCopyStoryLink}
            >
              {copyToast ? '✓ Copied!' : '📋 Copy Link'}
            </button>

            <a
              className="story-share-pill twitter"
              href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(canonicalStoryUrl)}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              𝕏 Post
            </a>

            <a
              className="story-share-pill facebook"
              href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(canonicalStoryUrl)}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              📘 Facebook
            </a>

            <a
              className="story-share-pill pinterest"
              href={`https://pinterest.com/pin/create/button/?url=${encodeURIComponent(canonicalStoryUrl)}&media=${encodeURIComponent(heroCoverUrl)}&description=${encodeURIComponent(shareText)}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              📌 Pinterest
            </a>

            <a
              className="story-share-pill reddit"
              href={`https://www.reddit.com/submit?url=${encodeURIComponent(canonicalStoryUrl)}&title=${encodeURIComponent(shareText)}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              🟠 Reddit
            </a>
          </div>
        </footer>

        {/* Bottom CTA: Write Your Own Story */}
        {linkedRecipe && (
          <div className="story-reader-bottom-cta no-print">
            <div>
              <h3>Have you cooked {linkedRecipe.title}?</h3>
              <p>
                Share your own family table memories, photos, or kitchen tips with the Veggie Vault community!
              </p>
            </div>
            <div className="story-reader-bottom-cta-btns">
              <button
                type="button"
                className="story-reader-write-btn"
                onClick={() => {
                  if (!user) {
                    navigateToLogin(navigate);
                    return;
                  }
                  setIsWriteNewModalOpen(true);
                }}
              >
                ✍️ Write Your Story
              </button>
              <Link to={`/recipe/${linkedRecipe.id}`} className="story-reader-recipe-outline-btn">
                🍽️ View Full Recipe
              </Link>
            </div>
          </div>
        )}
      </article>

      {/* Related Stories About the Same Recipe */}
      {relatedStories.length > 0 && (
        <section className="story-reader-related no-print" aria-label="More stories about this recipe">
          <h2 className="story-reader-related-heading">
            📖 More Community Stories About {recipeTitle}
          </h2>
          <div className="story-reader-related-grid">
            {relatedStories.map((rel) => (
              <StoryCard key={rel.id} story={rel} />
            ))}
          </div>
        </section>
      )}

      {/* Edit Current Story Modal */}
      <StoryEditorModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        recipe={linkedRecipe}
        initialStory={story}
        onSaved={() => {
          setIsEditModalOpen(false);
          fetchStory();
        }}
      />

      {/* Write a New Story About the Same Recipe Modal */}
      <StoryEditorModal
        isOpen={isWriteNewModalOpen}
        onClose={() => setIsWriteNewModalOpen(false)}
        recipe={linkedRecipe}
        onSaved={(res) => {
          setIsWriteNewModalOpen(false);
          if (res?.slug) {
            navigate(`/stories/${res.slug}`);
          }
        }}
      />
    </div>
  );
};

export default StoryReader;
