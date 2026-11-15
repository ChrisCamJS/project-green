import { api } from '../services/api';
import { getRecipeDietaryFlags } from './dietaryUtils';
import { parseMicrosFromDeepDive } from './promptBuilder';
import { formatDateYMD, addDaysYMD, parseDateYMD } from './mealPlanUtils';

const CATALOG_CACHE_TTL_MS = 5 * 60 * 1000;
let cachedCatalog = null;
let cachedAt = 0;
let inFlightCatalogPromise = null;

export const COMMON_NUTRIENT_TARGETS = {
  calories: { key: 'calories', label: 'Calories', unit: 'kcal', target: 2000, icon: '🔥' },
  protein: { key: 'protein', label: 'Protein', unit: 'g', target: 50, icon: '💪' },
  carbs: { key: 'carbs', label: 'Carbs', unit: 'g', target: 275, icon: '🥖' },
  fat: { key: 'fat', label: 'Fat', unit: 'g', target: 78, icon: '🥑' },
  fiber: { key: 'fiber', label: 'Fiber', unit: 'g', target: 28, icon: '🌾' },
};

export const MICRONUTRIENT_SPECS = [
  { key: 'iron', label: 'Iron', unit: 'mg', dvTarget: 18, aliases: ['iron', 'fe'], priority: 1 },
  { key: 'calcium', label: 'Calcium', unit: 'mg', dvTarget: 1300, aliases: ['calcium', 'ca'], priority: 2 },
  { key: 'potassium', label: 'Potassium', unit: 'mg', dvTarget: 4700, aliases: ['potassium', 'k'], priority: 3 },
  { key: 'vitamin c', label: 'Vitamin C', unit: 'mg', dvTarget: 90, aliases: ['vitamin c', 'vit c', 'ascorbic acid'], priority: 4 },
  { key: 'vitamin a', label: 'Vitamin A', unit: 'mcg', dvTarget: 900, aliases: ['vitamin a', 'vit a', 'retinol', 'beta carotene'], priority: 5 },
  { key: 'magnesium', label: 'Magnesium', unit: 'mg', dvTarget: 420, aliases: ['magnesium', 'mg'], priority: 6 },
  { key: 'zinc', label: 'Zinc', unit: 'mg', dvTarget: 11, aliases: ['zinc', 'zn'], priority: 7 },
  { key: 'folate', label: 'Folate (B9)', unit: 'mcg', dvTarget: 400, aliases: ['folate', 'folic acid', 'vitamin b9', 'folate (b9)'], priority: 8 },
  { key: 'vitamin b12', label: 'Vitamin B12', unit: 'mcg', dvTarget: 2.4, aliases: ['vitamin b12', 'b12', 'cobalamin'], priority: 9 },
  { key: 'vitamin d', label: 'Vitamin D', unit: 'mcg', dvTarget: 20, aliases: ['vitamin d', 'vit d', 'cholecalciferol', 'ergocalciferol'], priority: 10 },
  { key: 'vitamin e', label: 'Vitamin E', unit: 'mg', dvTarget: 15, aliases: ['vitamin e', 'vit e', 'alpha-tocopherol'], priority: 11 },
  { key: 'vitamin k', label: 'Vitamin K', unit: 'mcg', dvTarget: 120, aliases: ['vitamin k', 'vit k', 'phylloquinone'], priority: 12 },
  { key: 'sodium', label: 'Sodium', unit: 'mg', dvTarget: 2300, aliases: ['sodium', 'na'], priority: 13 },
  { key: 'vitamin b6', label: 'Vitamin B6', unit: 'mg', dvTarget: 1.7, aliases: ['vitamin b6', 'b6', 'pyridoxine'], priority: 14 },
  { key: 'thiamin', label: 'Thiamin (B1)', unit: 'mg', dvTarget: 1.2, aliases: ['thiamin', 'thiamine', 'vitamin b1', 'thiamin (b1)'], priority: 15 },
  { key: 'riboflavin', label: 'Riboflavin (B2)', unit: 'mg', dvTarget: 1.3, aliases: ['riboflavin', 'vitamin b2', 'riboflavin (b2)'], priority: 16 },
  { key: 'niacin', label: 'Niacin (B3)', unit: 'mg', dvTarget: 16, aliases: ['niacin', 'vitamin b3', 'niacin (b3)'], priority: 17 },
  { key: 'phosphorus', label: 'Phosphorus', unit: 'mg', dvTarget: 1250, aliases: ['phosphorus', 'p'], priority: 18 },
  { key: 'copper', label: 'Copper', unit: 'mg', dvTarget: 0.9, aliases: ['copper', 'cu'], priority: 19 },
  { key: 'manganese', label: 'Manganese', unit: 'mg', dvTarget: 2.3, aliases: ['manganese', 'mn'], priority: 20 },
  { key: 'selenium', label: 'Selenium', unit: 'mcg', dvTarget: 55, aliases: ['selenium', 'se'], priority: 21 },
];

const MICRO_ALIAS_MAP = MICRONUTRIENT_SPECS.reduce((acc, spec) => {
  spec.aliases.forEach((alias) => {
    acc[alias] = spec;
  });
  return acc;
}, {});

const normalizeNutrientMeta = (rawName = '') => {
  const cleaned = String(rawName || '')
    .replace(/\([^)]*\)/g, '')
    .trim()
    .toLowerCase();
  if (!cleaned) return null;

  if (cleaned === 'fiber' || cleaned === 'dietary fiber' || cleaned === 'soluble fiber') {
    return { key: 'fiber_macro', label: 'Fiber', isFiberMacro: true };
  }

  const fullLower = String(rawName || '').trim().toLowerCase();
  const matched = MICRO_ALIAS_MAP[fullLower] || MICRO_ALIAS_MAP[cleaned];
  if (matched) {
    return {
      key: matched.key,
      label: matched.label,
      defaultUnit: matched.unit,
      dvTarget: matched.dvTarget,
      priority: matched.priority,
    };
  }

  return {
    key: cleaned,
    label: String(rawName || '').trim(),
    defaultUnit: '',
    dvTarget: null,
    priority: 99,
  };
};

const normalizeUnitString = (unit = '') => {
  const u = String(unit || '').trim().toLowerCase();
  if (u === 'µg' || u === 'μg' || u === 'ug') return 'mcg';
  return u;
};

const convertUnitAmount = (amount, fromUnit, toUnit) => {
  const val = Number(amount) || 0;
  const from = normalizeUnitString(fromUnit);
  const to = normalizeUnitString(toUnit);
  if (!from || !to || from === to) return val;
  if (from === 'g' && to === 'mg') return val * 1000;
  if (from === 'mg' && to === 'g') return val / 1000;
  if (from === 'mg' && to === 'mcg') return val * 1000;
  if (from === 'mcg' && to === 'mg') return val / 1000;
  if (from === 'g' && to === 'mcg') return val * 1000000;
  if (from === 'mcg' && to === 'g') return val / 1000000;
  return val;
};

const extractIngredientsText = (entry, detail) => {
  const rawList = [
    ...(Array.isArray(entry?.ingredients) ? entry.ingredients : []),
    ...(Array.isArray(detail?.ingredients) ? detail.ingredients : []),
  ];
  return rawList
    .map((item) => (typeof item === 'string' ? item : item?.ingredient_name || item?.name || ''))
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
};

const extractExplicitFiberFromText = (text = '') => {
  if (!text) return 0;
  const labelFirst = text.match(/(?:dietary\s+)?fiber\s*[:-]\s*(\d+(?:\.\d+)?)\s*g\b/i);
  if (labelFirst) {
    const val = parseFloat(labelFirst[1]);
    if (val > 0 && val < 80) return val;
  }
  const amountFirst = text.match(/\b(\d+(?:\.\d+)?)\s*g\s*(?:of\s+)?(?:dietary\s+)?fiber\b/i);
  if (amountFirst) {
    const val = parseFloat(amountFirst[1]);
    if (val > 0 && val < 80) return val;
  }
  return 0;
};

/**
 * Resolves per-serving dietary fiber (in grams) for a planned meal or recipe.
 * Uses stored `fiber_g` > `micros` Fiber row > explicit text mention >
 * WFPB carb & ingredient profile estimate when legacy rows have fiber_g = 0.
 */
export const resolveRecipeFiberGrams = (entry, detail = null) => {
  const detailMacros = detail?.macros || detail || {};
  const storedFiber = Number(entry?.fiber_g ?? detailMacros?.fiber_g ?? 0) || 0;
  if (storedFiber > 0) {
    return Math.round(storedFiber * 10) / 10;
  }

  const notesText = `${entry?.recipeNotes || ''}\n${detail?.notes || ''}\n${entry?.description || ''}\n${detail?.description || ''}`;
  const rawMicros =
    Array.isArray(entry?.micros) && entry.micros.length > 0
      ? entry.micros
      : Array.isArray(detail?.micros) && detail.micros.length > 0
        ? detail.micros
        : parseMicrosFromDeepDive(notesText);

  let microFiber = 0;
  for (const micro of rawMicros || []) {
    const meta = normalizeNutrientMeta(micro?.nutrient_name || micro?.name || '');
    if (meta?.isFiberMacro) {
      const amt = Number(micro?.amount ?? 0) || 0;
      const unit = normalizeUnitString(micro?.unit || 'g');
      microFiber += unit === 'mg' ? amt / 1000 : amt;
    }
  }
  if (microFiber > 0) {
    return Math.round(microFiber * 10) / 10;
  }

  const textFiber = extractExplicitFiberFromText(notesText);
  if (textFiber > 0) {
    return Math.round(textFiber * 10) / 10;
  }

  const calories = Number(entry?.calories ?? detailMacros?.calories ?? 0) || 0;
  const carbs = Number(entry?.carbs_g ?? detailMacros?.carbs_g ?? 0) || 0;
  const ingText = extractIngredientsText(entry, detail);
  const combinedText = `${entry?.title || detail?.title || ''} ${entry?.description || detail?.description || ''} ${ingText}`.toLowerCase();

  // Guard: avoid inventing fiber on completely empty records
  if (calories === 0 && carbs === 0 && !ingText) {
    return 0;
  }

  if (carbs > 0) {
    let ratio = 0.14;
    if (/\b(?:avocado|avocados|guacamole)\b/.test(combinedText)) {
      ratio = 0.45;
    } else if (/\b(?:beans?|lentils?|chickpeas?|garbanzo|split peas?|edamame|chili|flax|chia|collard|brussels sprouts?|artichoke|broccoli)\b/.test(combinedText)) {
      ratio = 0.24;
    } else if (/\b(?:oats?|oatmeal|whole[- ]?wheat|whole[- ]?grain|quinoa|barley|buckwheat|sweet potato|potatoes?|yukon|cauliflower|pumpkin|squash|grits|cornmeal|walnuts?|almonds?)\b/.test(combinedText)) {
      ratio = 0.17;
    }

    let estimated = Math.min(carbs * 0.85, carbs * ratio);
    if (/\b(?:avocado|avocados|guacamole)\b/.test(combinedText) && carbs >= 8) {
      estimated = Math.max(estimated, 4);
    }
    return Math.max(0.5, Math.round(estimated * 2) / 2);
  }

  if (ingText) {
    let score = 0;
    if (/\b(?:beans?|lentils?|chickpeas?|garbanzo|split peas?|edamame)\b/.test(ingText)) score += 6;
    if (/\b(?:flax|chia|hemp)\b/.test(ingText)) score += 3;
    if (/\b(?:avocado|avocados)\b/.test(ingText)) score += 5;
    if (/\b(?:oats?|whole wheat|quinoa|barley|brown rice|cornmeal|buckwheat)\b/.test(ingText)) score += 3.5;
    if (/\b(?:sweet potato|squash|pumpkin|potato|carrots?|broccoli|brussels|collard|kale|spinach|cauliflower|cabbage|celery|pepper|mushrooms?|onion|tomato)\b/.test(ingText)) score += 3;
    if (/\b(?:pears?|apples?|bananas?|dates?|berries|blueberries|cranberries|pineapple|mango)\b/.test(ingText)) score += 2.5;
    if (/\b(?:tofu|tempeh)\b/.test(ingText)) score += 1.5;
    if (/\b(?:walnuts?|almonds?|pecans?|cashews?)\b/.test(ingText)) score += 1.5;
    return Math.round(Math.min(16, score) * 2) / 2;
  }

  return 0;
};

/**
 * Aggregates macros, dietary fiber, and common micronutrients across all entries
 * scheduled for a single day, scaled by each entry's servings.
 */
export const aggregateDailyNutrients = (dayEntries = [], recipeDetailsMap = {}) => {
  const totals = {
    calories: 0,
    protein: 0,
    carbs: 0,
    fat: 0,
    fiber: 0,
  };

  const microsAccumulator = new Map();
  let recipesWithMicroData = 0;

  for (const entry of dayEntries) {
    const mult = Math.max(0.25, Number(entry?.servings || 1));
    const detail = recipeDetailsMap?.[entry?.recipeId] || null;
    const detailMacros = detail?.macros || detail || {};

    const calories = Number(entry?.calories ?? detailMacros?.calories ?? 0) || 0;
    const protein = Number(entry?.protein_g ?? detailMacros?.protein_g ?? 0) || 0;
    const carbs = Number(entry?.carbs_g ?? detailMacros?.carbs_g ?? 0) || 0;
    const fat = Number(entry?.fat_g ?? detailMacros?.fat_g ?? 0) || 0;
    const fiber = resolveRecipeFiberGrams(entry, detail);

    totals.calories += calories * mult;
    totals.protein += protein * mult;
    totals.carbs += carbs * mult;
    totals.fat += fat * mult;
    totals.fiber += fiber * mult;

    const rawMicros =
      Array.isArray(entry?.micros) && entry.micros.length > 0
        ? entry.micros
        : Array.isArray(detail?.micros) && detail.micros.length > 0
          ? detail.micros
          : parseMicrosFromDeepDive(entry?.recipeNotes || detail?.notes || '');

    if (Array.isArray(rawMicros) && rawMicros.length > 0) {
      recipesWithMicroData += 1;
    }

    for (const micro of rawMicros || []) {
      const rawName = micro?.nutrient_name || micro?.name || '';
      const meta = normalizeNutrientMeta(rawName);
      if (!meta || meta.isFiberMacro) continue;

      const rawAmount = Number(micro?.amount ?? 0) || 0;
      const rawUnit = normalizeUnitString(micro?.unit || meta.defaultUnit || '');
      const rawDv = Number(micro?.daily_value_percentage ?? micro?.dv ?? 0) || 0;

      const targetUnit = meta.defaultUnit || rawUnit;
      const convertedAmount = convertUnitAmount(rawAmount, rawUnit, targetUnit) * mult;

      const existing = microsAccumulator.get(meta.key) || {
        key: meta.key,
        name: meta.label,
        amount: 0,
        unit: targetUnit || rawUnit || 'mg',
        dvTarget: meta.dvTarget,
        rawDvSum: 0,
        priority: meta.priority,
      };

      existing.amount += convertedAmount;
      existing.rawDvSum += rawDv * mult;
      microsAccumulator.set(meta.key, existing);
    }
  }

  const roundedMacros = {
    calories: Math.round(totals.calories),
    protein: Math.round(totals.protein * 10) / 10,
    carbs: Math.round(totals.carbs * 10) / 10,
    fat: Math.round(totals.fat * 10) / 10,
    fiber: Math.round(totals.fiber * 10) / 10,
  };

  const micros = Array.from(microsAccumulator.values())
    .map((item) => {
      const roundedAmount =
        item.amount >= 100
          ? Math.round(item.amount)
          : item.amount >= 10
            ? Math.round(item.amount * 10) / 10
            : Math.round(item.amount * 100) / 100;

      const computedDv = item.dvTarget
        ? Math.round((item.amount / item.dvTarget) * 100)
        : Math.round(item.rawDvSum);

      return {
        key: item.key,
        name: item.name,
        amount: roundedAmount,
        unit: item.unit,
        dvPercent: Math.max(0, computedDv),
        dvTarget: item.dvTarget,
        priority: item.priority,
      };
    })
    .sort((a, b) => a.priority - b.priority || b.dvPercent - a.dvPercent);

  return {
    ...roundedMacros,
    micros,
    recipesWithMicroData,
    totalMeals: dayEntries.length,
  };
};

/**
 * Fetches and caches all published recipes from /recipes so Emma always has
 * accurate links, titles, dietary flags, and ingredients.
 */
export const fetchPublishedRecipesCatalog = async (forceRefresh = false) => {
  const now = Date.now();
  if (!forceRefresh && cachedCatalog && now - cachedAt < CATALOG_CACHE_TTL_MS) {
    return cachedCatalog;
  }

  if (!forceRefresh && inFlightCatalogPromise) {
    return inFlightCatalogPromise;
  }

  inFlightCatalogPromise = api
    .getRecipes()
    .then((rows) => {
      const published = (Array.isArray(rows) ? rows : [])
        .filter((r) => r && r.isPublic !== false && !r.isDraft)
        .map((r) => ({
          ...r,
          dietary: getRecipeDietaryFlags(r, { useGlutenHeuristicFallback: true }),
        }));
      cachedCatalog = published;
      cachedAt = Date.now();
      return published;
    })
    .catch((err) => {
      console.warn('Could not preload published recipe catalog for Emma:', err);
      return cachedCatalog || [];
    })
    .finally(() => {
      inFlightCatalogPromise = null;
    });

  return inFlightCatalogPromise;
};

const formatDietTags = (recipe) => {
  const flags = recipe?.dietary || getRecipeDietaryFlags(recipe, { useGlutenHeuristicFallback: true });
  const tags = [];
  if (flags.oilFree) tags.push('Oil-Free');
  if (flags.glutenFree) tags.push('Gluten-Free');
  if (flags.sugarFree) tags.push('Refined Sugar-Free');
  return tags.length > 0 ? tags.join(', ') : 'WFPB';
};

const formatIngredientsPreview = (ingredients) => {
  if (!Array.isArray(ingredients) || ingredients.length === 0) return '';
  const names = ingredients
    .map((i) => (typeof i === 'string' ? i : i?.ingredient_name || i?.name || ''))
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 6);
  return names.length > 0 ? ` | Ingredients: ${names.join(', ')}` : '';
};

/**
 * Formats the published recipe catalog into a compact system prompt block.
 */
export const buildPublishedRecipesPromptSection = (
  recipes = [],
  maxRecipes = 80,
  { vocalMode = false } = {}
) => {
  if (!Array.isArray(recipes) || recipes.length === 0) return '';

  const slice = recipes.slice(0, maxRecipes);
  const sample = slice[0];

  const lines = slice.map((r) => {
    const prep = Number(r.prepTime ?? r.prep_time_mins ?? 0);
    const cook = Number(r.cookTime ?? r.cook_time_mins ?? 0);
    const totalMins = prep + cook;
    const cal = r.calories ? ` | ${r.calories} kcal` : '';
    const diet = formatDietTags(r);

    if (vocalMode) {
      return `- "${r.title}" (ID ${r.id}; ${diet}${totalMins > 0 ? `; ${totalMins} mins` : ''}${cal})`;
    }

    const desc = r.description
      ? ` — ${String(r.description).replace(/\s+/g, ' ').trim().slice(0, 110)}`
      : '';
    return `- [ID ${r.id}] "${r.title}" | Link: /recipe/${r.id} | Diet: ${diet}${totalMins > 0 ? ` | ${totalMins}m` : ''}${cal}${formatIngredientsPreview(r.ingredients)}${desc}`;
  });

  if (vocalMode) {
    return `\n\nTHE VEGGIE VAULT PUBLISHED RECIPE LIBRARY (${recipes.length} recipes available):
Whenever the user asks for dish ideas, examples, or what recipes exist on The Veggie Vault, recommend real published recipes from this list naturally by title:
${lines.join('\n')}`;
  }

  return `\n\nTHE VEGGIE VAULT PUBLISHED RECIPE CATALOG (${recipes.length} published recipes):
Whenever the user asks for recipe examples, ideas, recommendations, or dishes from The Veggie Vault, recommend matching real recipes from the catalog below and include clickable Markdown links using the exact format [Recipe Title](/recipe/<id>) (e.g., [${sample?.title || 'Sample Recipe'}](/recipe/${sample?.id || 1})). ONLY link to real recipe IDs present in this catalog—never invent fake IDs or external links for Vault recipes:
${lines.join('\n')}`;
};

/**
 * Builds an explicit calendar date lookup string so Emma maps weekday names cleanly to YYYY-MM-DD.
 */
const buildCalendarDateMapText = (visibleRange, todayYmd) => {
  const dateSet = new Set();
  if (Array.isArray(visibleRange?.days)) {
    visibleRange.days.forEach((d) => dateSet.add(d));
  }
  for (let i = 0; i < 14; i += 1) {
    dateSet.add(addDaysYMD(todayYmd, i));
  }

  return Array.from(dateSet)
    .sort()
    .map((ymd) => {
      const dt = parseDateYMD(ymd);
      const weekday = dt.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
      const marker = ymd === todayYmd ? ' [TODAY]' : '';
      return `- ${ymd} => ${weekday}${marker}`;
    })
    .join('\n');
};

/**
 * Builds the comprehensive Meal Planner system prompt giving Emma access to
 * all plannable recipes, current schedule, daily nutrient totals, and action formatting.
 */
export const buildMealPlannerEmmaSystemPrompt = ({
  userName = 'Love',
  viewMode = 'month',
  visibleRange = null,
  todayYmd = formatDateYMD(new Date()),
  entries = [],
  plannableRecipes = [],
  dailyNutrientSummary = null,
  focusedDateYmd = todayYmd,
  vocalMode = false,
}) => {
  const dateMapText = buildCalendarDateMapText(visibleRange, todayYmd);

  const scheduleLines =
    entries.length === 0
      ? 'No meals are currently scheduled in the visible calendar window.'
      : entries
          .map((e) => {
            const cal = e.calories ? `${Math.round(e.calories * (e.servings || 1))} kcal` : 'kcal N/A';
            return `- entry_id=${e.id} | ${e.planDate} | ${e.mealSlot} | "${e.title}" (recipe_id=${e.recipeId}, servings=${e.servings}, ${cal}${e.isDraft ? ', DRAFT' : ''})`;
          })
          .join('\n');

  const focusedMicroSummary =
    dailyNutrientSummary && dailyNutrientSummary.totalMeals > 0
      ? `Focused Date (${focusedDateYmd}) Nutrition Intake:
- ${dailyNutrientSummary.calories} kcal | Protein: ${dailyNutrientSummary.protein}g | Carbs: ${dailyNutrientSummary.carbs}g | Fat: ${dailyNutrientSummary.fat}g | Fiber: ${dailyNutrientSummary.fiber}g
- Key Micronutrients: ${
          dailyNutrientSummary.micros.length > 0
            ? dailyNutrientSummary.micros
                .slice(0, 12)
                .map((m) => `${m.name}: ${m.amount}${m.unit} (${m.dvPercent}% DV)`)
                .join(', ')
            : 'No micronutrient rows recorded yet on the scheduled recipes for this day'
        }`
      : `Focused Date (${focusedDateYmd}) currently has 0 planned meals.`;

  const recipeLines = (plannableRecipes || []).slice(0, 100).map((r) => {
    const draftBadge = r.isDraft ? ' [PRIVATE DRAFT]' : ' [PUBLISHED]';
    const diet = formatDietTags(r);
    const macros =
      r.calories !== null && r.calories !== undefined
        ? ` | ${r.calories} kcal, ${r.protein_g || 0}g P, ${r.carbs_g || 0}g C, ${r.fat_g || 0}g F, ${r.fiber_g || 0}g Fiber`
        : '';
    const ing = formatIngredientsPreview(r.ingredients);
    if (vocalMode) {
      return `- recipe_id=${r.id} | "${r.title}"${draftBadge} | ${diet}${macros}${ing}`;
    }
    return `- recipe_id=${r.id} | "${r.title}" | Link: /recipe/${r.id}${draftBadge} | Diet: ${diet}${macros}${ing}`;
  });

  const actionProtocol = vocalMode
    ? `LIVE AUDIO MEAL PLANNER CAPABILITIES (CRITICAL):
1. THIS IS A LIVE VOICE SESSION. Do NOT speak or output Markdown syntax, asterisks, URLs, or XML tags.
2. You have FULL permission to schedule, update, or remove meals on ${userName}'s Meal Planner calendar using your tool calls:
   - Call \`schedule_meal_plan_entries\` when the user asks you to add, fill in, or populate one or more meals/days on the calendar.
   - Call \`update_meal_plan_entry\` to move/change an existing scheduled entry (using its \`entry_id\`).
   - Call \`remove_meal_plan_entries\` to remove specific \`entry_id\` entries or clear a date/slot.
3. Match dietary preferences accurately (e.g. only pick Gluten-Free recipes if they ask for gluten-free).
4. Always use exact \`recipe_id\` integers from the Plannable Recipe Catalog and exact \`YYYY-MM-DD\` dates from the Calendar Date Reference. After calling a tool, confirm warmly out loud which recipes you scheduled on which days.`
    : `MEAL PLANNER TEXT CHAT & CALENDAR PERMISSIONS:
1. You have FULL access to ${userName}'s Meal Planner calendar and all plannable recipes (published recipes + their own private drafts).
2. Format your conversational reply cleanly in Markdown. Whenever you mention or recommend a recipe from the catalog, ALWAYS link to it using [Recipe Title](/recipe/<recipe_id>) so ${userName} can click straight through!
3. CALENDAR MODIFICATION PROTOCOL:
   Whenever the user asks you to add, schedule, fill in, plan, populate, move, update, swap, or remove meals on their calendar, perform a conversational response explaining your choices AND append ONE XML action block at the very end of your message:
   <MEAL_PLAN_ACTIONS>
   [
     { "action": "add", "recipe_id": 123, "plan_date": "YYYY-MM-DD", "meal_slot": "breakfast", "servings": 1, "notes": "Optional short note" }
   ]
   </MEAL_PLAN_ACTIONS>

   Supported action schemas inside the JSON array:
   - Add a meal: { "action": "add", "recipe_id": <int>, "plan_date": "YYYY-MM-DD", "meal_slot": "breakfast"|"lunch"|"dinner"|"snack", "servings": 1, "notes": "optional" }
   - Update/move an existing meal: { "action": "update", "entry_id": <int>, "recipe_id": <optional int>, "plan_date": "YYYY-MM-DD", "meal_slot": "breakfast"|"lunch"|"dinner"|"snack", "servings": 1, "notes": "optional" }
   - Remove one entry: { "action": "remove", "entry_id": <int> }
   - Clear a day (or one slot on a day): { "action": "clear_day", "plan_date": "YYYY-MM-DD", "meal_slot": "optional slot or omit for whole day" }

4. RULES FOR ACTIONS:
   - ONLY use real \`recipe_id\` integers from the Plannable Recipe Catalog below, and valid \`YYYY-MM-DD\` dates from the Calendar Date Reference.
   - Check each recipe's \`Diet\` tags and ingredients before scheduling if the user specifies Gluten-Free, Oil-Free, high-protein, high-iron, etc.
   - If the user is ONLY asking a question (e.g., "give me links to gluten-free dinners" or "what nutrients am I low on?"), do NOT output \`<MEAL_PLAN_ACTIONS>\`. Only emit \`<MEAL_PLAN_ACTIONS>\` when they want the calendar modified or filled in.`;

  return `You are Emma Advanced, a sassy, warm, fiercely intelligent British culinary partner and WFPB nutrition scientist, co-host of The Chris and Emma Show. You are helping ${userName} manage their Meal Planner on The Veggie Vault.

CURRENT CONTEXT:
- Today's Date: ${todayYmd}
- Active View Mode: ${viewMode}
- Visible Calendar Range: ${visibleRange?.label || ''} (${visibleRange?.start || todayYmd} to ${visibleRange?.end || todayYmd})
- Focused Date: ${focusedDateYmd}

CALENDAR DATE REFERENCE (Use these exact YYYY-MM-DD strings):
${dateMapText}

CURRENTLY SCHEDULED MEALS:
${scheduleLines}

${focusedMicroSummary}

PLANNABLE RECIPE CATALOG (${plannableRecipes.length} total recipes available — Published + ${userName}'s Private Drafts):
${recipeLines.join('\n') || 'No recipes loaded yet.'}

${actionProtocol}`;
};

/**
 * Extracts <MEAL_PLAN_ACTIONS>[...]</MEAL_PLAN_ACTIONS> from Emma's text reply
 * and returns cleaned Markdown plus normalized action objects.
 */
export const extractMealPlanActions = (rawText = '') => {
  const source = String(rawText || '');
  const actions = [];
  let cleanText = source;

  const tagRegex = /<MEAL_PLAN_ACTIONS>\s*([\s\S]*?)\s*<\/MEAL_PLAN_ACTIONS>/gi;
  let match;
  while ((match = tagRegex.exec(source)) !== null) {
    const inner = match[1]
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();
    try {
      const parsed = JSON.parse(inner);
      const list = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed?.actions)
          ? parsed.actions
          : [parsed];
      list.forEach((item) => {
        if (item && typeof item === 'object' && item.action) {
          actions.push(item);
        }
      });
    } catch (err) {
      console.warn('Failed to parse <MEAL_PLAN_ACTIONS> JSON:', err);
    }
  }

  cleanText = cleanText.replace(tagRegex, '').trim();

  // Graceful fallback if Emma wrapped actions in a ```json``` block without XML tags
  if (actions.length === 0) {
    const fencedRegex = /```json\s*([\s\S]*?)\s*```/gi;
    cleanText = cleanText.replace(fencedRegex, (fullMatch, jsonBody) => {
      try {
        const parsed = JSON.parse(jsonBody.trim());
        const list = Array.isArray(parsed)
          ? parsed
          : Array.isArray(parsed?.meal_plan_actions)
            ? parsed.meal_plan_actions
            : Array.isArray(parsed?.actions)
              ? parsed.actions
              : null;
        if (
          list &&
          list.length > 0 &&
          list.every((it) => it && typeof it === 'object' && ['add', 'update', 'remove', 'clear_day'].includes(it.action))
        ) {
          list.forEach((it) => actions.push(it));
          return '';
        }
      } catch {
        // Keep genuine markdown code blocks untouched
      }
      return fullMatch;
    }).trim();
  }

  return { cleanText, actions };
};

/**
 * Gemini Live Audio tool declarations allowing Emma to modify the meal plan calendar in real time.
 */
export const MEAL_PLANNER_LIVE_TOOLS = [
  {
    functionDeclarations: [
      {
        name: 'schedule_meal_plan_entries',
        description:
          'Schedule one or more recipes onto the user meal plan calendar for specific dates and meal slots.',
        parameters: {
          type: 'OBJECT',
          properties: {
            entries: {
              type: 'ARRAY',
              description: 'List of meals to schedule on the calendar.',
              items: {
                type: 'OBJECT',
                properties: {
                  recipe_id: {
                    type: 'INTEGER',
                    description: 'Exact numeric ID of the recipe from the Plannable Recipe Catalog.',
                  },
                  plan_date: {
                    type: 'STRING',
                    description: 'Date in YYYY-MM-DD format.',
                  },
                  meal_slot: {
                    type: 'STRING',
                    description: 'One of: breakfast, lunch, dinner, snack.',
                  },
                  servings: {
                    type: 'NUMBER',
                    description: 'Number of servings (default 1).',
                  },
                  notes: {
                    type: 'STRING',
                    description: 'Optional short note for this meal entry.',
                  },
                },
                required: ['recipe_id', 'plan_date', 'meal_slot'],
              },
            },
          },
          required: ['entries'],
        },
      },
      {
        name: 'update_meal_plan_entry',
        description: 'Move or edit an existing meal plan entry by its entry_id.',
        parameters: {
          type: 'OBJECT',
          properties: {
            entry_id: {
              type: 'INTEGER',
              description: 'Existing meal plan entry ID to update.',
            },
            recipe_id: {
              type: 'INTEGER',
              description: 'Optional new recipe ID to swap into this entry.',
            },
            plan_date: {
              type: 'STRING',
              description: 'Updated date in YYYY-MM-DD format.',
            },
            meal_slot: {
              type: 'STRING',
              description: 'Updated slot: breakfast, lunch, dinner, or snack.',
            },
            servings: {
              type: 'NUMBER',
              description: 'Updated servings count.',
            },
            notes: {
              type: 'STRING',
              description: 'Updated optional notes.',
            },
          },
          required: ['entry_id'],
        },
      },
      {
        name: 'remove_meal_plan_entries',
        description:
          'Remove specific meal plan entries by ID, or clear all meals on a specific YYYY-MM-DD date (optionally filtered to one meal_slot).',
        parameters: {
          type: 'OBJECT',
          properties: {
            entry_ids: {
              type: 'ARRAY',
              description: 'Specific meal plan entry IDs to remove.',
              items: { type: 'INTEGER' },
            },
            clear_date: {
              type: 'STRING',
              description: 'Optional YYYY-MM-DD date to clear.',
            },
            meal_slot: {
              type: 'STRING',
              description: 'Optional slot (breakfast, lunch, dinner, snack) when clearing a date.',
            },
          },
        },
      },
    ],
  },
];
