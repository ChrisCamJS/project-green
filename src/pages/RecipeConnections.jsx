import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useSearchParams, useNavigate, Link } from 'react-router-dom';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import SEOHead from '../components/SEOHead';
import CreateVariantModal from '../components/CreateVariantModal';
import StoryEditorModal from '../components/StoryEditorModal';
import { resolveRecipeImageUrl } from '../utils/mealPlanUtils';
import { resolveStoryAssetUrl, formatStoryDate } from '../utils/storyUtils';
import { navigateToLogin } from '../utils/authRedirect';
import './RecipeConnections.css';

const formatConnectionDate = (rawDate) => {
  if (!rawDate) return 'Recently';
  return formatStoryDate(rawDate) || 'Recently';
};

export default function RecipeConnections() {
  const { id } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const activeTab = searchParams.get('tab') === 'stories' ? 'stories' : 'variants';

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [recipe, setRecipe] = useState(null);
  const [ancestors, setAncestors] = useState([]);
  const [variants, setVariants] = useState([]);
  const [stories, setStories] = useState([]);
  const [variantScope, setVariantScope] = useState('all'); // 'all' | 'direct'

  const [isVariantModalOpen, setIsVariantModalOpen] = useState(false);
  const [isStoryModalOpen, setIsStoryModalOpen] = useState(false);

  const loadLineage = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.getRecipeLineage(id);
      if (res?.success && res?.recipe) {
        setRecipe(res.recipe);
        setAncestors(Array.isArray(res.ancestors) ? res.ancestors : []);
        setVariants(Array.isArray(res.variants) ? res.variants : []);
        setStories(Array.isArray(res.stories) ? res.stories : []);
      } else {
        setError(res?.message || 'Could not load recipe variants and stories.');
      }
    } catch (err) {
      setError(err?.message || 'Could not load recipe variants and stories.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadLineage();
  }, [loadLineage]);

  const handleTabChange = (nextTab) => {
    setSearchParams({ tab: nextTab }, { replace: true });
  };

  const directVariants = useMemo(
    () => variants.filter((v) => v.isDirectChild),
    [variants]
  );

  const hasExtendedTreeVariants = useMemo(
    () => variants.some((v) => !v.isDirectChild),
    [variants]
  );

  const displayedVariants = useMemo(
    () => (variantScope === 'direct' ? directVariants : variants),
    [variantScope, directVariants, variants]
  );

  const lineageSteps = useMemo(() => {
    if (!recipe) return [];
    return [...ancestors, { ...recipe, isCurrentTarget: true }];
  }, [ancestors, recipe]);

  if (loading) {
    return (
      <div className="rc-page">
        <div className="rc-empty-card">
          <p>Tracing recipe lineage, variants, and community stories...</p>
        </div>
      </div>
    );
  }

  if (error || !recipe) {
    return (
      <div className="rc-page">
        <div className="rc-empty-card">
          <p>{error || 'Recipe not found.'}</p>
          <Link to="/" className="rc-btn primary">
            Return to Home Feed
          </Link>
        </div>
      </div>
    );
  }

  const recipeThumb = resolveRecipeImageUrl(recipe);
  const recipeAuthorLink = recipe.authorId
    ? `/profile/${recipe.authorId}`
    : (recipe.authorName && recipe.authorName !== 'Emma (AI)'
        ? `/profile/${encodeURIComponent(recipe.authorName)}`
        : null);

  return (
    <div className="rc-page">
      <SEOHead
        title={`${recipe.title} — Variants, Lineage & Stories`}
        description={`Explore all public recipe variants, full branching lineage, and community stories for ${recipe.title} on The Veggie Vault.`}
        canonicalPath={`/recipe/${recipe.id}/connections`}
      />

      <div className="rc-top-nav">
        <Link to={`/recipe/${recipe.id}`} className="rc-back-link">
          &larr; Back to {recipe.title}
        </Link>
      </div>

      {/* Base Recipe Summary Header */}
      <header className="rc-hero-card">
        <div className="rc-hero-main">
          <img
            src={recipeThumb}
            alt={recipe.title}
            className="rc-hero-thumb"
            onError={(e) => {
              e.currentTarget.src = '/og-vault-preview.jpeg';
            }}
          />
          <div className="rc-hero-info">
            <span className="rc-kicker">
              {recipe.isVariant ? `Generation ${recipe.generation || 1} Variant` : 'Original Root Recipe'}
            </span>
            <h1 className="rc-hero-title">
              <Link to={`/recipe/${recipe.id}`}>{recipe.title}</Link>
            </h1>
            <div className="rc-meta-line">
              <span>
                Created by{' '}
                {recipeAuthorLink ? (
                  <Link to={recipeAuthorLink} className="rc-chef-link">
                    @{recipe.authorName}
                  </Link>
                ) : (
                  <strong>{recipe.authorName}</strong>
                )}
              </span>
              <span>&middot;</span>
              <span>{formatConnectionDate(recipe.createdAt)}</span>
              <span>&middot;</span>
              <span>
                <strong>{variants.length}</strong> {variants.length === 1 ? 'Variant' : 'Variants'}
              </span>
              <span>&middot;</span>
              <span>
                <strong>{stories.length}</strong> {stories.length === 1 ? 'Story' : 'Stories'}
              </span>
            </div>
          </div>
        </div>

        <div className="rc-hero-actions">
          <Link to={`/recipe/${recipe.id}`} className="rc-btn primary">
            View Recipe
          </Link>
          <button
            type="button"
            className="rc-btn variant"
            onClick={() => {
              if (!user) {
                navigateToLogin(navigate);
                return;
              }
              setIsVariantModalOpen(true);
            }}
          >
            🔀 Create Variant
          </button>
          <button
            type="button"
            className="rc-btn story"
            onClick={() => {
              if (!user) {
                navigateToLogin(navigate);
                return;
              }
              setIsStoryModalOpen(true);
            }}
          >
            ✍️ Write a Story
          </button>
        </div>
      </header>

      {/* Full Ancestor Lineage Chain (Trace Back to the Beginning) */}
      {(ancestors.length > 0 || variants.length > 0) && (
        <section className="rc-lineage-section" aria-label="Recipe variant lineage">
          <div className="rc-lineage-header">
            <h2>🌱 Variant Lineage Trail (Origin to Present)</h2>
            <p>
              Trace how this dish evolved from the very first root recipe through every community remix.
            </p>
          </div>

          <div className="rc-lineage-chain">
            {lineageSteps.map((step, idx) => {
              const stepThumb = resolveRecipeImageUrl(step);
              const isRoot = idx === 0;
              const isCurrent = Boolean(step.isCurrentTarget);
              const stepAuthorLink = step.authorId
                ? `/profile/${step.authorId}`
                : (step.authorName && step.authorName !== 'Emma (AI)'
                    ? `/profile/${encodeURIComponent(step.authorName)}`
                    : null);

              return (
                <div key={step.id} className="rc-lineage-step-wrap">
                  {idx > 0 && (
                    <div className="rc-lineage-connector" aria-hidden="true">
                      ↳ Branched into Generation {idx}
                    </div>
                  )}
                  <div className={`rc-lineage-node ${isCurrent ? 'current' : ''}`}>
                    <div className="rc-lineage-node-left">
                      <img
                        src={stepThumb}
                        alt={step.title}
                        className="rc-lineage-thumb"
                        onError={(e) => {
                          e.currentTarget.src = '/og-vault-preview.jpeg';
                        }}
                      />
                      <div className="rc-lineage-node-body">
                        <div className="rc-lineage-gen-row">
                          <span className={`rc-gen-pill ${isRoot ? 'root' : ''} ${isCurrent ? 'current' : ''}`}>
                            {isRoot
                              ? '🌱 Gen 0 · Original Root'
                              : `🔀 Gen ${idx} Variant`}
                          </span>
                          {isCurrent && (
                            <span className="rc-gen-pill current">Viewing Now</span>
                          )}
                        </div>
                        <Link to={`/recipe/${step.id}`} className="rc-lineage-node-title">
                          {step.title}
                        </Link>
                        <div className="rc-meta-line">
                          <span>
                            By{' '}
                            {stepAuthorLink ? (
                              <Link to={stepAuthorLink} className="rc-chef-link">
                                @{step.authorName}
                              </Link>
                            ) : (
                              <strong>{step.authorName}</strong>
                            )}
                          </span>
                          <span>&middot;</span>
                          <span>{formatConnectionDate(step.createdAt)}</span>
                        </div>
                        {step.variantSummary && (
                          <p className="rc-lineage-twist">
                            <strong>Twist:</strong> {step.variantSummary}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="rc-lineage-node-actions">
                      <Link to={`/recipe/${step.id}`} className="rc-mini-link">
                        Open Recipe
                      </Link>
                      {!isCurrent && (
                        <Link
                          to={`/recipe/${step.id}/connections?tab=variants`}
                          className="rc-mini-link"
                        >
                          View Connections ({step.variantCount || 0})
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Tabs Switcher */}
      <div className="rc-tabs-bar">
        <div className="rc-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'variants'}
            className={`rc-tab-btn ${activeTab === 'variants' ? 'active' : ''}`}
            onClick={() => handleTabChange('variants')}
          >
            🔀 Public Variants ({variants.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'stories'}
            className={`rc-tab-btn ${activeTab === 'stories' ? 'active' : ''}`}
            onClick={() => handleTabChange('stories')}
          >
            📖 Recipe Stories ({stories.length})
          </button>
        </div>

        {activeTab === 'variants' && hasExtendedTreeVariants && (
          <div className="rc-scope-pills" role="group" aria-label="Variant tree filter">
            <button
              type="button"
              className={`rc-scope-pill ${variantScope === 'all' ? 'active' : ''}`}
              onClick={() => setVariantScope('all')}
            >
              All Family Tree Variants ({variants.length})
            </button>
            <button
              type="button"
              className={`rc-scope-pill ${variantScope === 'direct' ? 'active' : ''}`}
              onClick={() => setVariantScope('direct')}
            >
              Direct Variants ({directVariants.length})
            </button>
          </div>
        )}
      </div>

      {/* Tab Content */}
      {activeTab === 'variants' ? (
        displayedVariants.length > 0 ? (
          <div className="rc-cards-grid">
            {displayedVariants.map((v) => {
              const vThumb = resolveRecipeImageUrl(v);
              const vAuthorLink = v.authorId
                ? `/profile/${v.authorId}`
                : (v.authorName && v.authorName !== 'Emma (AI)'
                    ? `/profile/${encodeURIComponent(v.authorName)}`
                    : null);
              const parentAuthorLink = v.parentAuthorId
                ? `/profile/${v.parentAuthorId}`
                : (v.parentAuthorName && v.parentAuthorName !== 'Emma (AI)'
                    ? `/profile/${encodeURIComponent(v.parentAuthorName)}`
                    : null);

              return (
                <article key={v.id} className="rc-item-card">
                  <Link to={`/recipe/${v.id}`} className="rc-item-media-link">
                    <img
                      src={vThumb}
                      alt={v.title}
                      className="rc-item-img"
                      onError={(e) => {
                        e.currentTarget.src = '/og-vault-preview.jpeg';
                      }}
                    />
                    <div className="rc-item-top-badges">
                      <span className={`rc-badge ${v.isMasterpiece ? 'masterpiece' : 'variant'}`}>
                        {v.isMasterpiece ? '✨ Masterpiece Variant' : '🔀 Variant'}
                      </span>
                      <span className={`rc-badge ${v.isDirectChild ? 'direct' : 'branch'}`}>
                        {v.isDirectChild ? 'Direct Remix' : 'Family Tree Branch'}
                      </span>
                    </div>
                  </Link>

                  <div className="rc-item-body">
                    <h3 className="rc-item-title">
                      <Link to={`/recipe/${v.id}`}>{v.title}</Link>
                    </h3>

                    <div className="rc-item-meta-box">
                      <div>
                        <strong>Created by:</strong>{' '}
                        {vAuthorLink ? (
                          <Link to={vAuthorLink} className="rc-chef-link">
                            @{v.authorName}
                          </Link>
                        ) : (
                          <span>{v.authorName}</span>
                        )}
                      </div>
                      <div>
                        <strong>Created on:</strong> {formatConnectionDate(v.createdAt)}
                      </div>
                      {v.parentRecipeId && (
                        <div>
                          <strong>Branched from:</strong>{' '}
                          <Link to={`/recipe/${v.parentRecipeId}`} className="rc-chef-link">
                            {v.parentRecipeTitle || 'Parent Recipe'}
                          </Link>
                          {v.parentAuthorName && (
                            <>
                              {' '}by{' '}
                              {parentAuthorLink ? (
                                <Link to={parentAuthorLink} className="rc-chef-link">
                                  @{v.parentAuthorName}
                                </Link>
                              ) : (
                                <span>{v.parentAuthorName}</span>
                              )}
                            </>
                          )}
                        </div>
                      )}
                    </div>

                    {v.variantSummary ? (
                      <p className="rc-item-twist">
                        <strong>Twist:</strong> {v.variantSummary}
                      </p>
                    ) : (
                      v.description && (
                        <p className="rc-item-excerpt">
                          {v.description.length > 150
                            ? `${v.description.slice(0, 150)}...`
                            : v.description}
                        </p>
                      )
                    )}

                    {(v.variantCount > 0 || v.storyCount > 0) && (
                      <div className="rc-downstream-row">
                        {v.variantCount > 0 && (
                          <Link
                            to={`/recipe/${v.id}/connections?tab=variants`}
                            className="rc-downstream-pill"
                          >
                            🔀 {v.variantCount} {v.variantCount === 1 ? 'Variant' : 'Variants'}
                          </Link>
                        )}
                        {v.storyCount > 0 && (
                          <Link
                            to={`/recipe/${v.id}/connections?tab=stories`}
                            className="rc-downstream-pill"
                          >
                            📖 {v.storyCount} {v.storyCount === 1 ? 'Story' : 'Stories'}
                          </Link>
                        )}
                      </div>
                    )}

                    <div className="rc-item-footer">
                      <Link to={`/recipe/${v.id}`} className="rc-mini-link">
                        View Recipe &rarr;
                      </Link>
                      <Link
                        to={`/recipe/${v.id}/connections?tab=variants`}
                        className="rc-mini-link"
                      >
                        Trace Lineage
                      </Link>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="rc-empty-card">
            <p>No public variants have been forged for this recipe yet.</p>
            <button
              type="button"
              className="rc-btn variant"
              onClick={() => {
                if (!user) {
                  navigateToLogin(navigate);
                  return;
                }
                setIsVariantModalOpen(true);
              }}
            >
              🔀 Create the First Variant
            </button>
          </div>
        )
      ) : stories.length > 0 ? (
        <div className="rc-cards-grid">
          {stories.map((s) => {
            const storyThumb =
              resolveStoryAssetUrl(s.coverImage || s.recipeImageUrl) || recipeThumb;
            const sAuthorLink = s.authorId
              ? `/profile/${s.authorId}`
              : (s.authorName
                  ? `/profile/${encodeURIComponent(s.authorName)}`
                  : null);

            return (
              <article key={s.id} className="rc-item-card">
                <Link
                  to={`/stories/${encodeURIComponent(s.slug)}`}
                  className="rc-item-media-link"
                >
                  <img
                    src={storyThumb}
                    alt={s.title}
                    className="rc-item-img"
                    onError={(e) => {
                      e.currentTarget.src = '/og-vault-preview.jpeg';
                    }}
                  />
                  <div className="rc-item-top-badges">
                    <span className="rc-badge story">
                      📖 Story &middot; {s.readTimeMinutes || 1} min read
                    </span>
                  </div>
                </Link>

                <div className="rc-item-body">
                  <h3 className="rc-item-title">
                    <Link to={`/stories/${encodeURIComponent(s.slug)}`}>{s.title}</Link>
                  </h3>

                  <div className="rc-item-meta-box">
                    <div>
                      <strong>Written by:</strong>{' '}
                      {sAuthorLink ? (
                        <Link to={sAuthorLink} className="rc-chef-link">
                          @{s.authorName}
                        </Link>
                      ) : (
                        <span>{s.authorName}</span>
                      )}
                    </div>
                    <div>
                      <strong>Published on:</strong> {formatConnectionDate(s.createdAt)}
                      {s.likeCount > 0 && ` · ❤️ ${s.likeCount}`}
                    </div>
                  </div>

                  {s.excerpt && <p className="rc-item-excerpt">{s.excerpt}</p>}

                  <div className="rc-item-footer">
                    <Link
                      to={`/stories/${encodeURIComponent(s.slug)}`}
                      className="rc-mini-link"
                    >
                      Read Full Story &rarr;
                    </Link>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="rc-empty-card">
          <p>No published stories have been written for this recipe yet.</p>
          <button
            type="button"
            className="rc-btn story"
            onClick={() => {
              if (!user) {
                navigateToLogin(navigate);
                return;
              }
              setIsStoryModalOpen(true);
            }}
          >
            ✍️ Write the First Story
          </button>
        </div>
      )}

      <CreateVariantModal
        isOpen={isVariantModalOpen}
        onClose={() => setIsVariantModalOpen(false)}
        parentRecipe={recipe}
        onVariantCreated={(res) => {
          setIsVariantModalOpen(false);
          if (res?.recipeId) {
            navigate(`/recipe/${res.recipeId}`);
          } else {
            loadLineage();
          }
        }}
      />

      <StoryEditorModal
        isOpen={isStoryModalOpen}
        onClose={() => setIsStoryModalOpen(false)}
        recipe={recipe}
        onSaved={(res) => {
          setIsStoryModalOpen(false);
          if (res?.slug && res?.story?.status !== 'draft') {
            navigate(`/stories/${res.slug}`);
          } else {
            handleTabChange('stories');
            loadLineage();
          }
        }}
      />
    </div>
  );
}
