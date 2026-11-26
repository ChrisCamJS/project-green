// src/utils/emmaSiteContext.js

export const APP_NAVIGATION_GUIDE = `
THE VEGGIE VAULT SITE NAVIGATION & FEATURES (link using Markdown like [Page Name](/path)):
- [Home Feed](/): Chronological recipe timeline of all published recipes, with a toggle to filter by "Following" (chefs you follow), plus search and Oil-Free / Gluten-Free / Sugar-Free filters.
- [Flavor Forge](/engine): Full-screen AI kitchen studio with Nutrition Natter (Chat + Live Audio), Quick Recipe Draft (free), Full Masterpiece Recipe (1 token, includes AI dish photo & full micronutrient analysis), Reference Document upload/paste, and Recent Chats history.
- [Meal Planner](/meal-planner): Interactive weekly/monthly meal calendar, daily/weekly calorie & macro progress bars against your Wellness targets, Fitness Tracker, and Meal Planning Concierge.
- [Wellness Tools](/wellness): BMI, BMR, TDEE, and custom macro target calculator that saves directly to your profile and Meal Planner.
- [Your Vault](/favorites): Your saved recipes, private drafts, recipe variants, stories, and chefs you follow.
- [Profile](/profile): Edit bio, dietary focus, saved food allergies, and view your published recipes and drafts.
- [Buy Tokens](/buy-tokens): Top up tokens for Full Masterpiece recipes (1 token), Live Audio (0.10 tokens/min), and Meal Planner Concierge (0.05 tokens/msg).
- [Sitemap](/sitemap): Quick directory of all pages and published recipes.
- [Privacy Policy](/privacy-policy): Information on how The Veggie Vault handles account data, cookies, and privacy.
- [Contact](/contact): Ways to reach The Veggie Vault team for support or feedback.
`.trim();

export function getPageMeta(pathname = '/', currentRecipe = null) {
  if (pathname === '/') {
    return {
      label: 'Home Feed',
      summary:
        'The user is on the Home Feed, browsing published plant-based recipes. They can switch between the default Chronological timeline and Following-only feed, search by keyword/ingredient, or filter by Oil-Free, Gluten-Free, and Sugar-Free.',
    };
  }
  if (pathname.startsWith('/recipe/')) {
    const recipeTitle = currentRecipe?.title?.trim();
    return {
      label: recipeTitle || 'Recipe',
      summary:
        `The user is viewing ${recipeTitle ? `"${recipeTitle}"` : 'a single recipe page'}, where they can inspect ingredients, step-by-step instructions, macros/micros, copy the full formatted recipe to clipboard, save to Your Vault, add to their Meal Planner, rate, or comment.`,
    };
  }
  if (pathname.startsWith('/meal-planner')) {
    return {
      label: 'Meal Planner',
      summary:
        'The user is on the Meal Planner page, where they can schedule Breakfast/Lunch/Dinner/Snacks on a weekly or monthly calendar, track calories/macros against their Wellness targets, log fitness activities, and use the Meal Planning Concierge.',
    };
  }
  if (pathname.startsWith('/wellness')) {
    return {
      label: 'Wellness Tools',
      summary:
        'The user is on Wellness Tools, where they can calculate BMI, BMR, TDEE, and daily protein/carb/fat targets and save them to their profile.',
    };
  }
  if (pathname.startsWith('/favorites')) {
    return {
      label: 'Your Vault',
      summary: 'The user is viewing Your Vault, where they manage saved recipes, private drafts, recipe variants, stories, and followed chefs.',
    };
  }
  if (pathname.startsWith('/profile')) {
    return {
      label: 'Profile',
      summary:
        'The user is on a Chef Profile page, where they can view published recipes/drafts, manage saved food allergies, dietary focus, and follow chefs.',
    };
  }
  if (pathname.startsWith('/buy-tokens')) {
    return {
      label: 'Buy Tokens',
      summary:
        'The user is on the Buy Tokens page, where they can purchase token packs via Stripe.',
    };
  }
  if (pathname.startsWith('/sitemap')) {
    return {
      label: 'Sitemap',
      summary: 'The user is viewing the Sitemap directory of all pages and published recipes on The Veggie Vault.',
    };
  }
  if (pathname.startsWith('/privacy-policy')) {
    return {
      label: 'Privacy Policy',
      summary: 'The user is viewing The Veggie Vault Privacy Policy page, which explains how account data, sessions, AI interactions, and privacy preferences are handled.',
    };
  }
  if (pathname.startsWith('/contact')) {
    return {
      label: 'Contact',
      summary: 'The user is on the Contact page, where they can reach out to The Veggie Vault team with questions, feedback, or support requests.',
    };
  }
  if (pathname.startsWith('/admin')) {
    return {
      label: 'Admin Dashboard',
      summary: 'The user is on the Admin Dashboard.',
    };
  }
  return {
    label: 'The Veggie Vault',
    summary: `The user is currently on route "${pathname}".`,
  };
}

export function buildFloatingEmmaPageContext({
  pathname = '/',
  currentRecipe = null,
  assistantMode = 'chat',
}) {
  const meta = getPageMeta(pathname, currentRecipe);
  const lines = [
    `CURRENT PAGE CONTEXT (${meta.label} — ${pathname}):`,
    meta.summary,
  ];

  if (currentRecipe && pathname.startsWith('/recipe/')) {
    const ingSummary = Array.isArray(currentRecipe.ingredients)
      ? currentRecipe.ingredients
          .slice(0, 20)
          .map((ing) => `${ing.quantity || ''} ${ing.unit || ''} ${ing.ingredient_name || ''}`.trim())
          .filter(Boolean)
          .join(', ')
      : '';
    lines.push(
      `CURRENTLY VIEWED RECIPE:`,
      `Title: ${currentRecipe.title || 'Untitled Recipe'} (Link: [View Recipe](/recipe/${currentRecipe.id}))`,
      currentRecipe.description ? `Description: ${currentRecipe.description}` : '',
      ingSummary ? `Ingredients: ${ingSummary}` : '',
      currentRecipe.calories ? `Per Serving: ${currentRecipe.calories} kcal, Protein ${currentRecipe.protein_g || 0}g, Carbs ${currentRecipe.carbs_g || 0}g, Fat ${currentRecipe.fat_g || 0}g` : ''
    );
  }

  if (assistantMode === 'meal_plan') {
    lines.push(
      'MEAL PLANNING ASSISTANT MODE:',
      'Help the user plan whole-food plant-based meals, balance daily/weekly macros, suggest published recipes from The Veggie Vault with direct links [Recipe Title](/recipe/<id>), and guide them to [Meal Planner](/meal-planner) or [Wellness Tools](/wellness) when helpful.'
    );
  }

  lines.push('', APP_NAVIGATION_GUIDE);

  return lines.filter(Boolean).join('\n');
}
