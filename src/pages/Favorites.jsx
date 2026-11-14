import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api';
import RecipeCard from '../components/RecipeCard';
import './Favorites.css';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

const resolveAssetUrl = (path) => {
  if (!path) return null;
  if (path.startsWith('http') || path.startsWith('data:')) return path;
  return `${API_BASE_URL}${path}`;
};

export default function Favorites() {
  const [favorites, setFavorites] = useState([]);
  const [followingList, setFollowingList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all'); // 'all', 'public', 'drafts', 'following'
  const [unfollowingId, setUnfollowingId] = useState(null);

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

  useEffect(() => {
    loadVaultData();
  }, []);

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

  const filteredList = favorites.filter((recipe) => {
    if (filter === 'public') return recipe.isPublic;
    if (filter === 'drafts') return recipe.isDraft;
    return true;
  });

  return (
    <div className="favorites-page">
      <div className="favorites-header">
        <h1>My Vault Collection</h1>
        <p>Saved community masterpieces, private kitchen drafts, and chefs you follow.</p>
        <Link to="/meal-planner" className="browse-recipes-btn" style={{ display: 'inline-block', marginBottom: '1rem' }}>
          📅 Open Meal Planner Calendar &rarr;
        </Link>

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
            className={`filter-btn ${filter === 'following' ? 'active' : ''}`}
            onClick={() => setFilter('following')}
          >
            👥 Following ({followingList.length})
          </button>
        </div>

        {filter !== 'following' && (
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
          <p>No recipes found in this view.</p>
          <Link to="/" className="browse-recipes-btn">Explore Masterpieces</Link>
        </div>
      )}
    </div>
  );
}
