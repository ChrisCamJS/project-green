/**
 * Shared helpers for resolving recipe dietary flags consistently across cards,
 * recipe detail views, SEO schemas, and Home page filtering.
 */

export const isTruthyFlag = (val) => val === true || val === 1 || val === '1' || val === 'true';

const EXPLICIT_GF_REGEX = /(?:^|[^a-z])(gluten[-\s]?free|certified gf|golden gf)(?:[^a-z]|$)/i;
const NEGATED_GF_REGEX = /\bnot\s+gluten[-\s]?free\b/i;

const TITLE_GLUTEN_DISH_REGEX =
    /\b(wheat|bread|breadsticks?|sandwich|sub|wellington|strudel|pretzels?|pierog(?:i|ies)|galette|empanadas?|lasagna|mac\s*&|macaroni|spaghetti|fettuccine|linguine|penne|pasta|noodles?|ramen|udon|couscous|barley|rye|spelt|farro|orzo|seitan|pancakes?|waffles?|muffins?|cobbler|flautas|burritos?|toast|hoagie|baguette|ciabatta|sourdough|pita)\b/i;

const INGREDIENT_GLUTEN_REGEX =
    /\b(whole[-\s]?wheat|wheat flour|all[-\s]?purpose flour|bread flour|pastry flour|white flour|spelt|barley|rye|couscous|farro|orzo|seitan|vital wheat gluten|puff pastry|phyllo|filo|breadcrumbs|panko|soy sauce|gochujang|lasagna|linguine|spaghetti|fettuccine|penne|macaroni|ramen|udon|flour tortilla|hoagie|baguette|ciabatta|sourdough|crusty italian|pita)\b/i;

const INGREDIENT_GF_SAFE_REGEX =
    /\b(gluten[-\s]?free|tamari|coconut aminos|brown rice|rice noodle|rice flour|oat flour|almond flour|chickpea flour|corn tortilla|buckwheat)\b/i;

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

    const ingredients = Array.isArray(recipe.ingredients) ? recipe.ingredients : [];
    const hasGlutenIngredient = ingredients.some((ing) => {
        const name = typeof ing === 'string' ? ing : ing?.ingredient_name || ing?.name || '';
        return INGREDIENT_GLUTEN_REGEX.test(name) && !INGREDIENT_GF_SAFE_REGEX.test(name);
    });

    if (hasGlutenIngredient) {
        return false;
    }

    return true;
};

export const getRecipeDietaryFlags = (recipe, { useGlutenHeuristicFallback = false } = {}) => {
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
