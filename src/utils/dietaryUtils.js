/**
 * Shared helpers for resolving recipe dietary flags consistently across cards,
 * recipe detail views, SEO schemas, and Home page filtering.
 */

export const isTruthyFlag = (val) => val === true || val === 1 || val === '1' || val === 'true';

const EXPLICIT_GF_REGEX = /(?:^|[^a-z])(gluten[-\s]?free|certified gf|golden gf)(?:[^a-z]|$)/i;
const NEGATED_GF_REGEX = /\bnot\s+gluten[-\s]?free\b/i;

const TITLE_GLUTEN_DISH_REGEX =
    /\b(wheat|whole[-\s]?wheat|farro|spelt|barley|rye|bulgur|couscous|kamut|seitan|vital wheat gluten|sourdough|baguette|ciabatta|breadsticks?|wellington|strudel|croissant|sandwich|sub\b|hoagie)\b/i;

const INGREDIENT_GLUTEN_REGEX =
    /\b(whole[-\s]?wheat|wheat(?:en)?|all[-\s]?purpose flour|bread flour|pastry flour|white flour|unbleached flour|semolina|bulgur|kamut|triticale|durum|farina|graham flour|spelt|barley|rye|couscous|farro|orzo|seitan|vital wheat gluten|puff pastry|phyllo|filo|breadcrumbs|panko|soy sauce|shoyu|teriyaki|gochujang|lasagna|linguine|spaghetti|fettuccine|penne|macaroni|ramen|udon|flour tortilla|hoagie|baguette|ciabatta|sourdough|crusty italian|pita|bread|breadsticks?|malt\b|brewer'?s yeast|\bflour\b)\b/i;

const INGREDIENT_GF_SAFE_REGEX =
    /\b(gluten[-\s]?free|certified gf|tamari|coconut aminos|brown rice|white rice|wild rice|rice noodle|rice flour|oats?\b|rolled oats|oat flour|almond flour|coconut flour|tapioca|cassava|chickpea flour|garbanzo flour|corn tortilla|cornmeal|cornstarch|arrowroot|buckwheat|quinoa|sorghum|millet|teff|flaxseed meal|potato starch)\b/i;

export const hasExplicitGlutenFreeTag = (recipe) => {
    const text = `${recipe?.title || ''} ${recipe?.description || ''} ${recipe?.notes || ''}`;
    if (!text.trim() || NEGATED_GF_REGEX.test(text)) return false;
    return EXPLICIT_GF_REGEX.test(text);
};

export const inferGlutenFreeFromRecipe = (recipe) => {
    if (!recipe) return false;
    if (hasExplicitGlutenFreeTag(recipe)) return true;

    const title = String(recipe.title || '');
    if (TITLE_GLUTEN_DISH_REGEX.test(title)) {
        return false;
    }

    let ingredients = [];
    if (Array.isArray(recipe.ingredients)) {
        ingredients = recipe.ingredients;
    } else if (typeof recipe.ingredients === 'string') {
        ingredients = recipe.ingredients.split('\n');
    } else if (typeof recipe.recipeMarkdown === 'string') {
        const match = recipe.recipeMarkdown.match(
            /##\s*Ingredients([\s\S]*?)(?=\n##\s*(?:Instructions|Directions|Method|Nutrition Information|Chef's?\s*Notes)|$)/i
        );
        if (match && match[1]) {
            ingredients = match[1]
                .split('\n')
                .filter((line) => line.trim().match(/^[-*•]/))
                .map((line) => line.replace(/^[-*•]\s*/, '').trim());
        }
    }

    if (!ingredients || ingredients.length === 0) {
        return false;
    }

    const hasGlutenIngredient = ingredients.some((ing) => {
        const name = typeof ing === 'string' ? ing : ing?.ingredient_name || ing?.name || '';
        const trimmed = name.trim();
        if (!trimmed || trimmed.startsWith('##') || trimmed.endsWith(':') || trimmed.endsWith('**')) {
            return false;
        }
        return INGREDIENT_GLUTEN_REGEX.test(trimmed) && !INGREDIENT_GF_SAFE_REGEX.test(trimmed);
    });

    if (hasGlutenIngredient) {
        return false;
    }

    return true;
};

export const getRecipeDietaryFlags = (recipe, { useGlutenHeuristicFallback = true } = {}) => {
    const dbGlutenFree = isTruthyFlag(recipe?.is_gluten_free ?? recipe?.isGlutenFree);
    const explicitGlutenFree = hasExplicitGlutenFreeTag(recipe);
    const glutenFree =
        dbGlutenFree ||
        explicitGlutenFree ||
        (useGlutenHeuristicFallback ? inferGlutenFreeFromRecipe(recipe) : false);

    return {
        glutenFree,
        oilFree: isTruthyFlag(recipe?.is_oil_free ?? recipe?.isOilFree),
        sugarFree: isTruthyFlag(recipe?.is_sugar_free ?? recipe?.isSugarFree),
        wfpb:
            recipe?.is_wfpb !== undefined || recipe?.isWfpb !== undefined
                ? isTruthyFlag(recipe?.is_wfpb ?? recipe?.isWfpb)
                : true,
    };
};
