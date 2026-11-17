import { getRecipeDietaryFlags } from './dietaryUtils';

export function filterRecipesList(
  recipes = [],
  { searchQuery = '', activeFilters = {}, minRating = 0 } = {}
) {
  const q = String(searchQuery || '').trim().toLowerCase();

  return (Array.isArray(recipes) ? recipes : []).filter((recipe) => {
    const flags = getRecipeDietaryFlags(recipe);
    if (activeFilters.glutenFree && !flags.glutenFree) return false;
    if (activeFilters.oilFree && !flags.oilFree) return false;
    if (activeFilters.sugarFree && !flags.sugarFree) return false;

    const avgRating = Number(recipe.averageRating || recipe.average_rating || 0);
    if (minRating > 0 && avgRating < minRating) return false;

    if (q) {
      const hay = [
        recipe.title,
        recipe.description,
        recipe.authorName,
        recipe.username,
        ...(Array.isArray(recipe.ingredients)
          ? recipe.ingredients.map((i) => i.ingredient_name || i)
          : []),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }

    return true;
  });
}
