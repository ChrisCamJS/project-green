import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api';
import RecipeCard from '../components/RecipeCard';
import './Favorites.css';

export default function Favorites() {
  const [favorites, setFavorites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all'); // 'all', 'public', 'drafts'

  const loadFavorites = async () => {
    try {
      setLoading(true);
      const data = await api.getFavorites();
      console.log("RAW API RESPONSE:", data); // Let's see what PHP actually sent!
      setFavorites(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to fetch user favorites:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFavorites();
  }, []);

  const handleFavoriteToggle = (recipeId, isFavorited) => {
    if (!isFavorited) {
      setFavorites((prev) => prev.filter((item) => item.id !== recipeId));
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
        <p>Saved community masterpieces and your in-progress kitchen drafts.</p>

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
            Public Masterpieces ({favorites.filter(r => r.isPublic).length})
          </button>
          <button 
            className={`filter-btn ${filter === 'drafts' ? 'active' : ''}`}
            onClick={() => setFilter('drafts')}
          >
            Private Drafts ({favorites.filter(r => r.isDraft).length})
          </button>
        </div>
      </div>

      {loading ? (
        <p className="loading-text">Opening your private vault...</p>
      ) : filteredList.length > 0 ? (
        <div className="recipe-grid">
          {filteredList.map((recipe) => (
            <RecipeCard 
              key={recipe.id} 
              recipe={recipe} 
              onFavoriteToggle={handleFavoriteToggle} 
            />
          ))}
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