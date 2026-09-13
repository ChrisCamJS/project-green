import React, { useState } from 'react';
import './StarRating.css';

export default function StarRating({ recipeId, initialRating = 0, onRate }) {
  const [rating, setRating] = useState(initialRating);
  const [hover, setHover] = useState(0);

  const handleRating = (currentRating) => {
    setRating(currentRating);
    // This prop will eventually fire the update to your PHP API
    if (onRate) onRate(recipeId, currentRating);
  };

  return (
    <div className="star-rating">
      {[...Array(5)].map((_, index) => {
        const ratingValue = index + 1;
        return (
          <label key={index} aria-label={`${ratingValue} stars`}>
            <input 
              type="radio" 
              name={`rating-${recipeId}`} 
              value={ratingValue} 
              onClick={() => handleRating(ratingValue)} 
            />
            <span 
              className="star" 
              style={{ color: ratingValue <= (hover || rating) ? "#F6E05E" : "#E2E8F0" }}
              onMouseEnter={() => setHover(ratingValue)}
              onMouseLeave={() => setHover(0)}
            >
              ★
            </span>
          </label>
        );
      })}
    </div>
  );
}