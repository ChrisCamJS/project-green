import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import './FavoriteButton.css';

export default function FavoriteButton({ recipeId, initialFavorited = false, onToggle }) {
  const { user } = useAuth();
  const [isFavorited, setIsFavorited] = useState(initialFavorited);
  const [loading, setLoading] = useState(false);

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
      if (res.success) {
        setIsFavorited(res.isFavorited);
        if (onToggle) onToggle(recipeId, res.isFavorited);
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