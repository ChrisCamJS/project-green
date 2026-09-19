import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import './FavoriteButton.css';

export default function FavoriteButton({ recipeId, initialFavorited = false, onToggle }) {
  const { user } = useAuth();
  const [isFavorited, setIsFavorited] = useState(initialFavorited);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setIsFavorited(Boolean(Number(initialFavorited)));
  }, [initialFavorited]);

  const handleToggle = async (e) => {
    e.preventDefault(); // Prevent navigating if inside a link or card
    e.stopPropagation();

    if (!user) {
      alert('Please log in to save recipes to your favorites.');
      return;
    }

    if (loading) return;
    setLoading(true);

    try {
      const res = await api.toggleFavorite(recipeId);
      console.log('toggleFavorite full response:', res);
    // Check either status === 'success' or res.success for resilience
    const isSuccess = res.status === 'success' || res.success;

    if (isSuccess) {
      // Backend returns is_favorite (snake_case)
      const nextFavorited = res.is_favorite !== undefined ? Boolean(res.is_favorite) : !isFavorited;
      setIsFavorited(nextFavorited);
      if (onToggle) onToggle(recipeId, nextFavorited);
    } else {
      console.warn('res.success was false or missing!', res);
    }
    } catch (err) {
      console.error('Failed to toggle favorite:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button 
      className={`favorite-btn ${isFavorited ? 'favorited' : ''}`}
      onClick={handleToggle}
      title={isFavorited ? 'Remove from favorites' : 'Save to favorites'}
      aria-label="Toggle favorite"
      disabled={loading}
    >
      {isFavorited ? '❤️' : '🤍'}
    </button>
  );
}