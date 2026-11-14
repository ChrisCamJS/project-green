import React from 'react';
import { Link } from 'react-router-dom';
import './RecipeCard.css';
import StarRating from './StarRating';
import FavoriteButton from './FavoriteButton';
import { resolveRecipeImageUrl } from '../utils/mealPlanUtils';

/**
 * RecipeCard Component
 * Displays a summary of a single recipe, now with pristine relational data!
 * @param {Object} recipe - The recipe data object
 */

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
        calories,
        protein_g,
        carbs_g,
        fat_g,
        is_favorite,
        isFavorited
    } = recipe;

    const authorId = recipe.authorId || recipe.user_id || null;
    const authorName = recipe.authorName || username || 'Emma (AI)';
    const isFollowedAuthor = Boolean(recipe.isFollowedAuthor);
    const isDraftCard = Boolean(recipe.isDraft || recipe.is_draft || recipe.is_public === 0 || recipe.is_public === false);
    const authorProfileLink = authorId
        ? `/profile/${authorId}`
        : (authorName && authorName !== 'Emma (AI)' ? `/profile/${encodeURIComponent(authorName)}` : null);

    const showOilFree = Boolean(Number(isOilFree ?? recipe.is_oil_free ?? 0));
    const showGlutenFree = Boolean(Number(recipe.isGlutenFree ?? recipe.is_gluten_free ?? 0));
    const showSugarFree = Boolean(Number(recipe.isSugarFree ?? recipe.is_sugar_free ?? 0));

    // Normalise favorite status from API (handles boolean, 1/0, or snake_case)
    const initialFavorited = Boolean(Number(is_favorite ?? isFavorited ?? 0));

    const recipeLink = `/recipe/${recipe.id}`;
    const fullImageUrl = resolveRecipeImageUrl(recipe);

    const handleAddToMealPlan = () => {
        window.dispatchEvent(
            new CustomEvent('veggie-vault:open-meal-plan', { detail: { recipe } })
        );
    };

    return (
        <div className='recipe-card'>
            <div className='recipe-card-image' title={recipe.title}>
                <Link to={recipeLink} className="recipe-card-image-link" aria-label={recipe.title}>
                    <img
                        src={fullImageUrl}
                        alt={title}
                        style={{width: '100%', height: 'auto'}}
                        onError={(e) => {
                            e.currentTarget.src = '/og-vault-preview.jpeg';
                        }}
                    />
                </Link>
                <div className="recipe-card-top-badges">
                    {isFollowedAuthor && (
                        <span className="recipe-followed-badge" title="Chef you follow">
                            👥 Following
                        </span>
                    )}
                    {isDraftCard && (
                        <span className="recipe-draft-badge" title="Private Draft">
                            🔒 Draft
                        </span>
                    )}
                </div>
                {/* Floating Interactive Favorite Cue */}
                <div className="recipe-card-favorite-wrapper">
                    <FavoriteButton 
                        recipeId={id} 
                        initialFavorited={initialFavorited} 
                    />
                </div>    
            </div>

            <div className='recipe-card-content'>
                <h3 className='recipe-title' title={recipe.title}>
                    {title}
                </h3>
                <div className="recipe-author-row">
                    <p className="recipe-author">
                        Created by:{' '}
                        {authorProfileLink ? (
                            <Link to={authorProfileLink} className="recipe-author-link">
                                {authorName}
                            </Link>
                        ) : (
                            <span>{authorName}</span>
                        )}
                    </p>
                </div>
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
                </div>

                {(showOilFree || showGlutenFree || showSugarFree) && (
                    <div className='recipe-dietary-badges'>
                        {showOilFree && (
                            <span className='dietary-badge oil-free-badge'>
                                🌿 Oil-Free
                            </span>
                        )}
                        {showGlutenFree && (
                            <span className='dietary-badge gluten-free-badge'>
                                🌾 Gluten-Free
                            </span>
                        )}
                        {showSugarFree && (
                            <span className='dietary-badge sugar-free-badge'>
                                🍯 Refined Sugar-Free
                            </span>
                        )}
                    </div>
                )}
                
                <div className="recipe-card-actions">
                    <Link to={`/recipe/${id}`} className='view-recipe-btn'>
                        View Recipe
                    </Link>
                    <button
                        type="button"
                        className="plan-recipe-card-btn"
                        onClick={handleAddToMealPlan}
                        title="Add this recipe to your Meal Plan"
                    >
                        📅 + Plan
                    </button>
                </div>
            </div>
        </div>
    );
}

export default RecipeCard;