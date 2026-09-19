import React from 'react';
import { Link } from 'react-router-dom';
import './RecipeCard.css';
import StarRating from './StarRating';

/**
 * RecipeCard Component
 * Displays a summary of a single recipe, now with pristine relational data!
 * @param {Object} recipe - The recipe data object
 */

const API_URL = import.meta.env.VITE_API_BASE_URL;

const RecipeCard = ({ recipe }) => {
    // Destructuring API payload
    const { 
        id, 
        username,
        title, 
        description, 
        cookTime, 
        prepTime, 
        isOilFree, 
        image_url,
        imageUrl,
        calories,
        protein_g,
        carbs_g,
        fat_g,
        createdAt
    } = recipe;

    const targetImage = imageUrl ||image_url; 
    const recipeLink = `/recipe/${recipe.id}`;

    const fullImageUrl = targetImage 
        ? (targetImage.startsWith('http') ? targetImage : `${API_URL}${targetImage}`)
        : '/belle-house-fiesta-bowl.jpg'; // The fallback image

    return (
        <div className='recipe-card'>
            <div className='recipe-card-image' title={recipe.title}>
                <Link to={recipeLink} className="recipe-card-image-link" aria-label={recipe.title}>
                    <img src={fullImageUrl} alt={title} style={{width: '100%', height: 'auto'}} />
                </Link>    
            </div>

            <div className='recipe-card-content'>
                <h3 className='recipe-title' title={recipe.title}>
                    {title}
                </h3>
                {/* Add the Author Attribution Here */}
                <p className="recipe-author" style={{ fontSize: '0.85rem', color: '#718096', fontStyle: 'italic', marginBottom: '0.5rem' }}>
                    Created by: {recipe.authorName || 'Emma (AI)'}
                </p>
                <StarRating 
                    recipeId={recipe.id} 
                    initialRating={recipe.averageRating} 
                    onRate={(id, newRating) => console.log(`Recipe ${id} rated ${newRating} stars`)} 
                />
                <p className='recipe-description'>
                    {/* safety check: ensures it only slices if description exists */}
                    {description ? description.slice(0, 200) + '...' : 'A delicious plant-based creation.'}
                </p>

                {/* Macro Display */}
                {(calories || protein_g) && (
                    <div className='recipe-macros' style={{ display: 'flex', gap: '12px', fontSize: '0.85rem', margin: '10px 0', fontWeight: '600', color: '#4a5568' }}>
                        <span>🔥 {calories} kcal</span>
                        <span>💪 {protein_g}g P</span>
                        <span>🥖 {carbs_g}g C</span>
                        <span>🥑 {fat_g}g F</span>
                    </div>
                )}

                <div className='recipe-stats'>
                    <span className='prep-time'>⏱️ Prep: {prepTime || 0}m</span>
                    <span className='cook-time'>🔥 Cook: {cookTime || 0}m</span>
                    
                    {/* MySQL returns booleans as 1 or 0, so we convert it to a true boolean */}
                    {Boolean(Number(isOilFree)) && (
                        <div className='oil-free-badge'>
                            🌿 Oil-Free
                        </div>
                    )}
                </div>
                
                <Link to={`/recipe/${id}`} className='view-recipe-btn'>
                    View Full Recipe
                </Link>
            </div>
        </div>
    );
}

export default RecipeCard;