import React from 'react';
import { Link } from 'react-router-dom';
import './RecipeCard.css';
import StarRating from './StarRating';
import FavoriteButton from './FavoriteButton';
import UserHoverFollow from './UserHoverFollow';
import VariantBadge from './VariantBadge';
import { resolveRecipeImageUrl } from '../utils/mealPlanUtils';
import { getRecipeDietaryFlags } from '../utils/dietaryUtils';

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

    const parentRecipeId = recipe.parentRecipeId || recipe.parent_recipe_id || recipe.parentRecipe?.id || null;
    const isVariantCard = Boolean(parentRecipeId);
    const parentRecipeTitle = recipe.parentRecipeTitle || recipe.parentRecipe?.title || 'Original Recipe';
    const parentAuthorId = recipe.parentAuthorId || recipe.parentRecipe?.authorId || null;
    const parentAuthorName = recipe.parentAuthorName || recipe.parentRecipe?.authorName || 'Emma (AI)';
    const parentAuthorProfileLink = parentAuthorId
        ? `/profile/${parentAuthorId}`
        : (parentAuthorName && parentAuthorName !== 'Emma (AI)' ? `/profile/${encodeURIComponent(parentAuthorName)}` : null);
    const isMasterpieceCard = Boolean(recipe.isMasterpiece || recipe.is_masterpiece);
    const variantSummary = recipe.variantSummary || recipe.variant_summary || null;

    const {
        oilFree: showOilFree,
        glutenFree: showGlutenFree,
        sugarFree: showSugarFree,
    } = getRecipeDietaryFlags(recipe);

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
                        onError={(e) => {
                            e.currentTarget.src = '/og-vault-preview.jpeg';
                        }}
                    />
                </Link>
                <div className="recipe-card-top-badges">
                    {isFollowedAuthor && (
                        <span className="recipe-followed-badge" title="Chef you follow">
                            Following
                        </span>
                    )}
                    {isDraftCard && (
                        <span className="recipe-draft-badge" title="Private Draft">
                            Draft
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
                {isVariantCard && (
                    <div className="recipe-card-variant-row">
                        <VariantBadge
                            compact
                            hideIcon
                            parentRecipeId={parentRecipeId}
                            parentRecipeTitle={parentRecipeTitle}
                            parentAuthorName={parentAuthorName}
                            isMasterpiece={isMasterpieceCard}
                            variantSummary={variantSummary}
                        />
                    </div>
                )}
                <h3 className='recipe-title' title={recipe.title}>
                    {title}
                </h3>
                <div className="recipe-author-row">
                    <div className="recipe-author-stack">
                        <p className="recipe-author">
                            Created by:{' '}
                            {authorProfileLink ? (
                                <UserHoverFollow
                                    userId={authorId}
                                    username={authorName}
                                    profileLink={authorProfileLink}
                                    className="recipe-author-link"
                                >
                                    {authorName}
                                </UserHoverFollow>
                            ) : (
                                <span>{authorName}</span>
                            )}
                        </p>
                        {isVariantCard && (
                            <p className="recipe-author recipe-inspired-author">
                                Inspired by:{' '}
                                {parentAuthorProfileLink ? (
                                    <UserHoverFollow
                                        userId={parentAuthorId}
                                        username={parentAuthorName}
                                        profileLink={parentAuthorProfileLink}
                                        className="recipe-author-link recipe-inspired-author-link"
                                    >
                                        {parentAuthorName}
                                    </UserHoverFollow>
                                ) : (
                                    <span>{parentAuthorName}</span>
                                )}
                            </p>
                        )}
                    </div>
                    <StarRating 
                        recipeId={recipe.id} 
                        initialRating={recipe.averageRating} 
                        onRate={(id, newRating) => console.log(`Recipe ${id} rated ${newRating} stars`)} 
                    />
                </div>
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
                                Oil-Free
                            </span>
                        )}
                        {showGlutenFree && (
                            <span className='dietary-badge gluten-free-badge'>
                                Gluten-Free
                            </span>
                        )}
                        {showSugarFree && (
                            <span className='dietary-badge sugar-free-badge'>
                                Refined Sugar-Free
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