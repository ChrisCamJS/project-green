import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import RecipeCard from '../components/RecipeCard';
import StoryCard from '../components/StoryCard';
import StoryEditorModal from '../components/StoryEditorModal';
import CreateVariantModal from '../components/CreateVariantModal';
import RecipeFilterToolbar from '../components/RecipeFilterToolbar';
import { filterRecipesList } from '../utils/recipeFilterUtils';
import { resolveRecipeImageUrl } from '../utils/mealPlanUtils';
import './Favorites.css';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

const resolveAssetUrl = (path) => {
  if (!path) return null;
  if (path.startsWith('http') || path.startsWith('data:')) return path;
  return `${API_BASE_URL}${path}`;
};

export default function Favorites() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [favorites, setFavorites] = useState([]);
  const [followingList, setFollowingList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all'); // 'all', 'public', 'drafts', 'variants', 'stories', 'following'
  const [unfollowingId, setUnfollowingId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilters, setActiveFilters] = useState({
    glutenFree: false,
    oilFree: false,
    sugarFree: false,
  });
  const [minRating, setMinRating] = useState(0);

  // My Stories & Story Starter state
  const [myStories, setMyStories] = useState([]);
  const [storiesLoading, setStoriesLoading] = useState(false);
  const [storyStatusFilter, setStoryStatusFilter] = useState('all'); // 'all' | 'published' | 'draft'
  const [storySearchQuery, setStorySearchQuery] = useState('');
  const [deletingStoryId, setDeletingStoryId] = useState(null);
  const [editingLoadingId, setEditingLoadingId] = useState(null);

  const [showRecipePicker, setShowRecipePicker] = useState(false);
  const [pickerMode, setPickerMode] = useState('story'); // 'story' | 'variant'
  const [pickerScope, setPickerScope] = useState('all'); // 'all' | 'saved'
  const [pickerQuery, setPickerQuery] = useState('');
  const [catalogRecipes, setCatalogRecipes] = useState([]);
  const [loadingCatalog, setLoadingCatalog] = useState(false);

  const [isStoryEditorOpen, setIsStoryEditorOpen] = useState(false);
  const [editorRecipe, setEditorRecipe] = useState(null);
  const [editingStory, setEditingStory] = useState(null);

  const [isVariantModalOpen, setIsVariantModalOpen] = useState(false);
  const [variantParentRecipe, setVariantParentRecipe] = useState(null);

  const loadVaultData = async () => {
    try {
      setLoading(true);
      const [favData, followData] = await Promise.all([
        api.getFavorites(),
        api.getFollowedUsers().catch(() => ({ following: [] })),
      ]);
      setFavorites(Array.isArray(favData) ? favData : []);
      setFollowingList(Array.isArray(followData?.following) ? followData.following : []);
    } catch (err) {
      console.error('Failed to fetch user vault data:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadMyStories = useCallback(async () => {
    if (!user?.id) return;
    setStoriesLoading(true);
    try {
      const res = await api.getStories({
        userId: user.id,
        page: 1,
        perPage: 24,
        includeDrafts: true,
      });
      setMyStories(Array.isArray(res?.stories) ? res.stories : []);
    } catch (err) {
      console.error('Failed to load user stories:', err);
    } finally {
      setStoriesLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    loadVaultData();
  }, []);

  useEffect(() => {
    loadMyStories();
  }, [loadMyStories]);

  const handleFavoriteToggle = (recipeId, isFavorited) => {
    if (!isFavorited) {
      setFavorites((prev) => prev.filter((item) => item.id !== recipeId));
    }
  };

  const handleUnfollow = async (chefId) => {
    if (unfollowingId) return;
    setUnfollowingId(chefId);
    try {
      const res = await api.toggleFollowUser(chefId, 'unfollow');
      if (res?.success) {
        setFollowingList((prev) => prev.filter((chef) => chef.id !== chefId));
        setFavorites((prev) =>
          prev.map((item) =>
            Number(item.authorId || item.user_id) === Number(chefId)
              ? { ...item, isFollowedAuthor: false }
              : item
          )
        );
      }
    } catch (err) {
      console.error('Failed to unfollow user:', err);
      alert(err.message || 'Could not remove user from your following list.');
    } finally {
      setUnfollowingId(null);
    }
  };

  const handleOpenRecipePicker = async (mode = 'story') => {
    setPickerMode(mode === 'variant' ? 'variant' : 'story');
    setPickerQuery('');
    setShowRecipePicker(true);
    if (catalogRecipes.length === 0 && !loadingCatalog) {
      setLoadingCatalog(true);
      try {
        const data = await api.getRecipes();
        const list = Array.isArray(data)
          ? data
          : (Array.isArray(data?.recipes) ? data.recipes : []);
        setCatalogRecipes(list);
      } catch (err) {
        console.error('Failed to load recipes for picker:', err);
      } finally {
        setLoadingCatalog(false);
      }
    }
  };

  const handleSelectRecipeFromPicker = (recipeItem) => {
    if (!recipeItem?.id) return;
    setShowRecipePicker(false);

    if (pickerMode === 'variant') {
      setVariantParentRecipe({
        ...recipeItem,
        id: recipeItem.id,
        title: recipeItem.title,
        authorName: recipeItem.authorName || recipeItem.username || 'Emma (AI)',
      });
      setIsVariantModalOpen(true);
      return;
    }

    setEditingStory(null);
    setEditorRecipe({
      id: recipeItem.id,
      title: recipeItem.title,
      imageUrl: recipeItem.imageUrl || recipeItem.image_url || '',
    });
    setIsStoryEditorOpen(true);
  };

  const handleEditStory = async (storyItem) => {
    if (!storyItem?.slug || editingLoadingId) return;
    setEditingLoadingId(storyItem.id);
    try {
      const res = await api.getStoryBySlug(storyItem.slug);
      const fullStory = res?.story || storyItem;
      setEditingStory(fullStory);
      setEditorRecipe({
        id: fullStory.recipeId || fullStory.recipe_id || storyItem.recipeId,
        title: fullStory.recipeTitle || fullStory.recipe_title || storyItem.recipeTitle || 'Recipe',
        imageUrl: fullStory.recipeImageUrl || storyItem.recipeImageUrl || '',
      });
      setIsStoryEditorOpen(true);
    } catch (err) {
      console.error('Failed to load story for editing:', err);
      alert(err.message || 'Could not load story details for editing.');
    } finally {
      setEditingLoadingId(null);
    }
  };

  const handleDeleteStory = async (storyItem) => {
    if (!storyItem?.id || deletingStoryId) return;
    if (!window.confirm(`Delete "${storyItem.title}" permanently? This cannot be undone.`)) {
      return;
    }
    setDeletingStoryId(storyItem.id);
    try {
      await api.deleteStory(storyItem.id);
      setMyStories((prev) => prev.filter((s) => s.id !== storyItem.id));
    } catch (err) {
      console.error('Failed to delete story:', err);
      alert(err.message || 'Could not delete story.');
    } finally {
      setDeletingStoryId(null);
    }
  };

  const handleStorySaved = async () => {
    setIsStoryEditorOpen(false);
    setEditingStory(null);
    setEditorRecipe(null);
    setFilter('stories');
    await loadMyStories();
  };

  const filteredStories = useMemo(() => {
    const q = storySearchQuery.trim().toLowerCase();
    return myStories.filter((story) => {
      const status = (story.status || 'published').toLowerCase();
      if (storyStatusFilter === 'published' && status !== 'published') return false;
      if (storyStatusFilter === 'draft' && status !== 'draft') return false;
      if (!q) return true;
      const t = String(story.title || '').toLowerCase();
      const ex = String(story.excerpt || '').toLowerCase();
      const rec = String(story.recipeTitle || story.recipe_title || '').toLowerCase();
      return t.includes(q) || ex.includes(q) || rec.includes(q);
    });
  }, [myStories, storyStatusFilter, storySearchQuery]);

  const pickerRecipeCandidates = useMemo(() => {
    const map = new Map();
    favorites.forEach((r) => {
      if (r?.id) {
        map.set(Number(r.id), { ...r, isSavedInVault: true });
      }
    });
    if (pickerScope === 'all') {
      catalogRecipes.forEach((r) => {
        if (r?.id) {
          const idNum = Number(r.id);
          if (!map.has(idNum)) {
            map.set(idNum, { ...r, isSavedInVault: false });
          }
        }
      });
    }
    const baseList = Array.from(map.values());
    const q = pickerQuery.trim().toLowerCase();
    if (!q) return baseList;
    return baseList.filter((r) => {
      const title = String(r.title || '').toLowerCase();
      const desc = String(r.description || '').toLowerCase();
      const author = String(r.authorName || r.username || '').toLowerCase();
      return title.includes(q) || desc.includes(q) || author.includes(q);
    });
  }, [favorites, catalogRecipes, pickerScope, pickerQuery]);

  const isUserVariant = useCallback((recipe) => {
    const hasParent = Boolean(
      recipe?.parentRecipeId || recipe?.parent_recipe_id || recipe?.parentRecipe?.id
    );
    if (!hasParent) return false;
    if (!user?.id) return true;
    return Number(recipe?.authorId ?? recipe?.user_id) === Number(user.id);
  }, [user?.id]);

  const myVariantsCount = useMemo(
    () => favorites.filter((recipe) => isUserVariant(recipe)).length,
    [favorites, isUserVariant]
  );

  const tabScopedRecipes = useMemo(() => {
    return favorites.filter((recipe) => {
      if (filter === 'public') return recipe.isPublic;
      if (filter === 'drafts') return recipe.isDraft;
      if (filter === 'variants') return isUserVariant(recipe);
      return true;
    });
  }, [favorites, filter, isUserVariant]);

  const filteredList = useMemo(
    () =>
      filterRecipesList(tabScopedRecipes, {
        searchQuery,
        activeFilters,
        minRating,
      }),
    [tabScopedRecipes, searchQuery, activeFilters, minRating]
  );

  const toggleDietaryFilter = (key) => {
    setActiveFilters((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const clearRecipeFilters = () => {
    setSearchQuery('');
    setActiveFilters({ glutenFree: false, oilFree: false, sugarFree: false });
    setMinRating(0);
  };

  const showRecipeControls = filter !== 'following' && filter !== 'stories';

  return (
    <div className="favorites-page">
      <div className="favorites-header">
        <h1>My Vault Collection</h1>
        <p>Saved community masterpieces, private kitchen drafts, your recipe stories, and chefs you follow.</p>
        <div className="vault-header-cta-row">
          <Link to="/meal-planner" className="browse-recipes-btn">
            📅 Open Meal Planner Calendar &rarr;
          </Link>
          <button
            type="button"
            className="start-story-cta-btn"
            onClick={() => handleOpenRecipePicker('story')}
          >
            ✍️ Start a New Story
          </button>
          <button
            type="button"
            className="start-variant-cta-btn"
            onClick={() => handleOpenRecipePicker('variant')}
          >
            🔀 Start a New Variant
          </button>
        </div>

        <div className="favorites-filters">
          <button 
            className={`filter-btn ${filter === 'all' ? 'active' : ''}`}
            onClick={() => setFilter('all')}
          >
            All ({favorites.length})
          </button>
          <button 
            className={`filter-btn ${filter === 'public' ? 'active' : ''}`}
            onClick={() => setFilter('public')}
          >
            Public Masterpieces ({favorites.filter((r) => r.isPublic).length})
          </button>
          <button 
            className={`filter-btn ${filter === 'drafts' ? 'active' : ''}`}
            onClick={() => setFilter('drafts')}
          >
            Private Drafts ({favorites.filter((r) => r.isDraft).length})
          </button>
          <button
            className={`filter-btn ${filter === 'variants' ? 'active' : ''}`}
            onClick={() => setFilter('variants')}
          >
            🔀 My Variants ({myVariantsCount})
          </button>
          <button
            className={`filter-btn ${filter === 'stories' ? 'active' : ''}`}
            onClick={() => setFilter('stories')}
          >
            📖 My Stories ({myStories.length})
          </button>
          <button
            className={`filter-btn ${filter === 'following' ? 'active' : ''}`}
            onClick={() => setFilter('following')}
          >
            👥 Following ({followingList.length})
          </button>
        </div>

        {showRecipeControls && (
          <RecipeFilterToolbar
            recipes={tabScopedRecipes}
            filteredCount={filteredList.length}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            activeFilters={activeFilters}
            onToggleFilter={toggleDietaryFilter}
            minRating={minRating}
            onRatingChange={setMinRating}
            onClearFilters={clearRecipeFilters}
            placeholder="Search your saved masterpieces and drafts..."
          />
        )}

        {showRecipeControls && (
          <div className="vault-following-summary">
            <span>
              Following <strong>{followingList.length}</strong> {followingList.length === 1 ? 'chef' : 'chefs'} (their recipes appear first in your Home feed)
            </span>
            <button
              type="button"
              onClick={() => setFilter('following')}
              className="vault-manage-following-link"
            >
              View &amp; Manage Following &rarr;
            </button>
          </div>
        )}
      </div>

      {loading ? (
        <div className="favorites-loading">
          <p className="loading-text">Opening your private vault...</p>
        </div>
      ) : filter === 'following' ? (
        <section className="following-management-section" aria-label="Chefs you follow">
          <div className="following-section-header">
            <h2>👥 Chefs You Follow</h2>
            <p>Recipes from chefs you follow show up first at the top of your Home feed.</p>
          </div>

          {followingList.length > 0 ? (
            <div className="following-grid">
              {followingList.map((chef) => {
                const avatarSrc = resolveAssetUrl(chef.profile_image);
                const displayName = chef.display_name || chef.username;
                const initial = (displayName || 'C').charAt(0).toUpperCase();

                return (
                  <div key={chef.id} className="followed-chef-card">
                    <div className="followed-chef-top">
                      <Link to={`/profile/${chef.id}`} className="followed-chef-avatar-link">
                        {avatarSrc ? (
                          <img src={avatarSrc} alt={displayName} className="followed-chef-avatar" />
                        ) : (
                          <div className="followed-chef-avatar-fallback">{initial}</div>
                        )}
                      </Link>
                      <div className="followed-chef-identity">
                        <Link to={`/profile/${chef.id}`} className="followed-chef-name">
                          {displayName}
                        </Link>
                        <span className="followed-chef-handle">@{chef.username}</span>
                        {chef.location && (
                          <span className="followed-chef-location">📍 {chef.location}</span>
                        )}
                      </div>
                    </div>

                    <p className="followed-chef-bio">
                      {chef.bio
                        ? (chef.bio.length > 110 ? `${chef.bio.slice(0, 110)}...` : chef.bio)
                        : (chef.favorite_cuisine
                            ? `Specialty: ${chef.favorite_cuisine}`
                            : 'Whole-food plant-based creator in The Veggie Vault.')}
                    </p>

                    <div className="followed-chef-meta">
                      <span>🍽️ {chef.recipe_count} {chef.recipe_count === 1 ? 'Recipe' : 'Recipes'}</span>
                      <span>👥 {chef.follower_count} {chef.follower_count === 1 ? 'Follower' : 'Followers'}</span>
                    </div>

                    <div className="followed-chef-actions">
                      <Link to={`/profile/${chef.id}`} className="view-chef-profile-btn">
                        View Profile
                      </Link>
                      <button
                        type="button"
                        onClick={() => handleUnfollow(chef.id)}
                        disabled={unfollowingId === chef.id}
                        className="unfollow-chef-btn"
                      >
                        {unfollowingId === chef.id ? 'Removing...' : 'Unfollow'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="no-favorites-card">
              <p>You are not following any chefs yet. Click a creator&apos;s username on any recipe card to view their profile and follow them!</p>
              <Link to="/" className="browse-recipes-btn">Explore Community Recipes</Link>
            </div>
          )}
        </section>
      ) : filter === 'stories' ? (
        <section className="vault-stories-section" aria-label="Manage your recipe stories">
          <div className="vault-stories-header">
            <div>
              <h2>📖 My Recipe Stories</h2>
              <p>Manage your published articles and private drafts, or pick any recipe to start a new story.</p>
            </div>
            <button
              type="button"
              className="start-story-cta-btn"
              onClick={() => handleOpenRecipePicker('story')}
            >
              ✍️ Start a New Story
            </button>
          </div>

          <div className="vault-stories-toolbar">
            <input
              type="search"
              className="vault-story-search-input"
              value={storySearchQuery}
              onChange={(e) => setStorySearchQuery(e.target.value)}
              placeholder="Search your stories by title or linked recipe..."
              aria-label="Search your stories"
            />
            <div className="vault-story-status-pills" role="group" aria-label="Filter stories by status">
              <button
                type="button"
                className={`vault-story-pill ${storyStatusFilter === 'all' ? 'active' : ''}`}
                onClick={() => setStoryStatusFilter('all')}
              >
                All ({myStories.length})
              </button>
              <button
                type="button"
                className={`vault-story-pill ${storyStatusFilter === 'published' ? 'active' : ''}`}
                onClick={() => setStoryStatusFilter('published')}
              >
                Published ({myStories.filter((s) => (s.status || 'published') === 'published').length})
              </button>
              <button
                type="button"
                className={`vault-story-pill ${storyStatusFilter === 'draft' ? 'active' : ''}`}
                onClick={() => setStoryStatusFilter('draft')}
              >
                Drafts ({myStories.filter((s) => (s.status || 'published') === 'draft').length})
              </button>
            </div>
          </div>

          {storiesLoading ? (
            <div className="favorites-loading">
              <p className="loading-text">Loading your stories...</p>
            </div>
          ) : filteredStories.length > 0 ? (
            <div className="vault-stories-grid">
              {filteredStories.map((story) => {
                const isDraftStory = (story.status || 'published') === 'draft';
                const isDeletingThis = deletingStoryId === story.id;
                const isLoadingEdit = editingLoadingId === story.id;

                return (
                  <div key={story.id} className="vault-story-manage-card">
                    <StoryCard story={story} showRecipeTag={true} />
                    <div className="vault-story-manage-bar">
                      <span className={`vault-story-status-badge ${isDraftStory ? 'draft' : 'published'}`}>
                        {isDraftStory ? '🔒 Draft' : '🌟 Published'}
                      </span>
                      <div className="vault-story-actions">
                        <Link
                          to={`/stories/${encodeURIComponent(story.slug)}`}
                          className="vault-story-action-btn read-btn"
                        >
                          Read
                        </Link>
                        <button
                          type="button"
                          className="vault-story-action-btn edit-btn"
                          onClick={() => handleEditStory(story)}
                          disabled={isLoadingEdit || isDeletingThis}
                        >
                          {isLoadingEdit ? 'Loading...' : '✏️ Edit'}
                        </button>
                        <button
                          type="button"
                          className="vault-story-action-btn delete-btn"
                          onClick={() => handleDeleteStory(story)}
                          disabled={isDeletingThis || isLoadingEdit}
                        >
                          {isDeletingThis ? 'Deleting...' : '🗑️ Delete'}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="no-favorites-card">
              {myStories.length === 0 ? (
                <>
                  <p>You haven&apos;t written any recipe stories yet. Pick any recipe from your Vault or the community feed to write your first story!</p>
                  <button
                    type="button"
                    className="start-story-cta-btn"
                    onClick={() => handleOpenRecipePicker('story')}
                  >
                    ✍️ Start Your First Story
                  </button>
                </>
              ) : (
                <>
                  <p>No stories match your current search or status filter.</p>
                  <button
                    type="button"
                    className="browse-recipes-btn"
                    style={{ border: 'none', cursor: 'pointer' }}
                    onClick={() => {
                      setStorySearchQuery('');
                      setStoryStatusFilter('all');
                    }}
                  >
                    Reset Story Filters
                  </button>
                </>
              )}
            </div>
          )}
        </section>
      ) : filteredList.length > 0 ? (
        <div className="favorites-grid-container">
          <div className="recipe-grid">
            {filteredList.map((recipe) => (
              <div key={recipe.id} className="grid-item">
                <RecipeCard 
                  recipe={recipe} 
                  onFavoriteToggle={handleFavoriteToggle} 
                />
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="no-favorites-card">
          {filter === 'variants' && myVariantsCount === 0 ? (
            <>
              <p>You haven&apos;t created any recipe variants yet. Pick any recipe from your Vault or the community feed to remix into your own variant!</p>
              <button
                type="button"
                className="start-variant-cta-btn"
                onClick={() => handleOpenRecipePicker('variant')}
              >
                🔀 Start Your First Variant
              </button>
            </>
          ) : (
            <>
              <p>No recipes found in this view.</p>
              <Link to="/" className="browse-recipes-btn">Explore Masterpieces</Link>
            </>
          )}
        </div>
      )}

      {showRecipePicker && (
        <div
          className="vault-story-picker-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="vault-story-picker-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowRecipePicker(false);
            }
          }}
        >
          <div className="vault-story-picker-modal">
            <div className="vault-story-picker-header">
              <div>
                <h2 id="vault-story-picker-title">
                  {pickerMode === 'variant' ? 'Start a New Recipe Variant' : 'Start a New Story'}
                </h2>
                <p>
                  {pickerMode === 'variant'
                    ? 'Choose a recipe to remix into your own variant'
                    : 'Choose a recipe to base your story on'}
                </p>
              </div>
              <button
                type="button"
                className="vault-story-picker-close"
                onClick={() => setShowRecipePicker(false)}
                aria-label="Close recipe selector"
              >
                ✕
              </button>
            </div>

            <div className="vault-story-picker-controls">
              <input
                type="search"
                className="vault-story-picker-search"
                value={pickerQuery}
                onChange={(e) => setPickerQuery(e.target.value)}
                placeholder="Search recipes by title, description, or chef..."
                autoFocus
                aria-label={
                  pickerMode === 'variant'
                    ? 'Search recipes for your variant'
                    : 'Search recipes for your story'
                }
              />
              <div className="vault-story-picker-scopes" role="group" aria-label="Recipe source">
                <button
                  type="button"
                  className={`vault-story-pill ${pickerScope === 'all' ? 'active' : ''}`}
                  onClick={() => setPickerScope('all')}
                >
                  All Vault Recipes
                </button>
                <button
                  type="button"
                  className={`vault-story-pill ${pickerScope === 'saved' ? 'active' : ''}`}
                  onClick={() => setPickerScope('saved')}
                >
                  My Saved Recipes ({favorites.length})
                </button>
              </div>
            </div>

            <div className="vault-picker-list">
              {loadingCatalog && pickerScope === 'all' && catalogRecipes.length === 0 ? (
                <p className="vault-picker-empty">Loading community recipes...</p>
              ) : pickerRecipeCandidates.length > 0 ? (
                pickerRecipeCandidates.map((r) => {
                  const thumbUrl = resolveRecipeImageUrl(r);
                  const isDraftRecipe = Boolean(r.isDraft || r.is_draft || r.is_public === 0 || r.is_public === false);
                  const chefName = r.authorName || r.username || 'Emma (AI)';

                  return (
                    <button
                      key={r.id}
                      type="button"
                      className="vault-picker-item"
                      onClick={() => handleSelectRecipeFromPicker(r)}
                    >
                      <img
                        src={thumbUrl}
                        alt={r.title}
                        className="vault-picker-thumb"
                        onError={(e) => {
                          e.currentTarget.src = '/og-vault-preview.jpg';
                        }}
                      />
                      <div className="vault-picker-meta">
                        <strong className="vault-picker-title">{r.title}</strong>
                        <div className="vault-picker-subrow">
                          <span>By {chefName}</span>
                          {r.isSavedInVault && (
                            <span className="vault-picker-badge saved">In My Vault</span>
                          )}
                          {isDraftRecipe && (
                            <span className="vault-picker-badge draft">Draft</span>
                          )}
                        </div>
                      </div>
                      <span className="vault-picker-select-label">Select &rarr;</span>
                    </button>
                  );
                })
              ) : (
                <p className="vault-picker-empty">
                  No matching recipes found. Try a different search or switch between Saved and All Vault Recipes.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      <StoryEditorModal
        isOpen={isStoryEditorOpen}
        onClose={() => {
          setIsStoryEditorOpen(false);
          setEditingStory(null);
          setEditorRecipe(null);
        }}
        recipe={editorRecipe}
        initialStory={editingStory}
        onSaved={handleStorySaved}
      />

      <CreateVariantModal
        isOpen={isVariantModalOpen}
        onClose={() => {
          setIsVariantModalOpen(false);
          setVariantParentRecipe(null);
        }}
        parentRecipe={variantParentRecipe}
        onVariantCreated={async (res) => {
          setIsVariantModalOpen(false);
          setVariantParentRecipe(null);
          await loadVaultData();
          if (res?.recipeId) {
            navigate(`/recipe/${res.recipeId}`);
          } else {
            setFilter('variants');
          }
        }}
      />
    </div>
  );
}
