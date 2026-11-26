import React from 'react';
import { Link } from 'react-router-dom';
import { resolveStoryAssetUrl, formatStoryDate } from '../utils/storyUtils';
import './StoryCard.css';

/**
 * StoryCard
 * Editorial preview card for a user-authored Recipe Story blog post.
 */
const StoryCard = ({ story, showRecipeTag = false }) => {
  if (!story) return null;

  const slug = story.slug;
  const storyUrl = `/stories/${encodeURIComponent(slug)}`;
  const coverSrc = resolveStoryAssetUrl(
    story.coverImage || story.cover_image || story.effectiveCoverImage || story.recipeImageUrl
  );
  const authorUsername = story.authorName || story.author_name || 'Vault Chef';
  const authorLabel = story.authorDisplayName || story.author_display_name || authorUsername;
  const authorAvatarSrc = story.authorAvatar
    ? resolveStoryAssetUrl(story.authorAvatar, null)
    : null;
  const authorInitial = String(authorLabel || 'C').charAt(0).toUpperCase();
  const readTime = Math.max(1, Number(story.readTimeMinutes || story.read_time_minutes || 1));
  const publishedDate = formatStoryDate(story.createdAt || story.created_at);
  const isDraft = (story.status || 'published') === 'draft';
  const likeCount = Number(story.likeCount || 0);
  const recipeId = story.recipeId || story.recipe_id;
  const recipeTitle = story.recipeTitle || story.recipe_title;

  return (
    <article className="story-card">
      <Link to={storyUrl} className="story-card-cover-link" aria-label={story.title}>
        <div className="story-card-cover">
          <img
            src={coverSrc}
            alt={story.title}
            loading="lazy"
            onError={(e) => {
              e.currentTarget.src = '/og-vault-preview.jpg';
            }}
          />
          <div className="story-card-badges">
            <span className="story-card-read-pill">📖 {readTime} min read</span>
            {isDraft && <span className="story-card-draft-pill">🔒 Draft</span>}
          </div>
        </div>
      </Link>

      <div className="story-card-body">
        {showRecipeTag && recipeId && recipeTitle && (
          <Link to={`/recipe/${recipeId}`} className="story-card-recipe-tag">
            🍽️ {recipeTitle}
          </Link>
        )}

        <h3 className="story-card-title">
          <Link to={storyUrl}>{story.title}</Link>
        </h3>

        <p className="story-card-excerpt">{story.excerpt}</p>

        <div className="story-card-footer">
          <Link
            to={`/profile/${encodeURIComponent(authorUsername)}`}
            className="story-card-author"
          >
            {authorAvatarSrc ? (
              <img
                src={authorAvatarSrc}
                alt={authorLabel}
                className="story-card-author-avatar"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
              />
            ) : (
              <span className="story-card-author-initial" aria-hidden="true">
                {authorInitial}
              </span>
            )}
            <span className="story-card-author-meta">
              <strong className="story-card-author-name">{authorLabel}</strong>
              {publishedDate && <span className="story-card-date">{publishedDate}</span>}
            </span>
          </Link>

          <div className="story-card-right-meta">
            {likeCount > 0 && (
              <span className="story-card-likes" title={`${likeCount} likes`}>
                ❤️ {likeCount}
              </span>
            )}
            <Link to={storyUrl} className="story-card-read-link">
              Read Story →
            </Link>
          </div>
        </div>
      </div>
    </article>
  );
};

export default StoryCard;
