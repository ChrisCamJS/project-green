import { api } from '../services/api';
import { getRecipeDietaryFlags } from './dietaryUtils';
import { parseMicrosFromDeepDive } from './promptBuilder';
import { formatDateYMD, addDaysYMD, parseDateYMD } from './mealPlanUtils';
import { RECIPE_IDEAS_PROMPT_PROTOCOL } from './recipeIdeas';

const CATALOG_CACHE_TTL_MS = 5 * 60 * 1000;
let cachedCatalog = null;
let cachedAt = 0;
let cachedForUserId = null;
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
  { key: 'saturated fat', label: 'Saturated Fat', unit: 'g', dvTarget: 20, aliases: ['saturated fat', 'sat fat', 'saturated fats', 'saturated fatty acids'], priority: 14 },
  { key: 'vitamin b6', label: 'Vitamin B6', unit: 'mg', dvTarget: 1.7, aliases: ['vitamin b6', 'b6', 'pyridoxine'], priority: 15 },
  { key: 'thiamin', label: 'Thiamin (B1)', unit: 'mg', dvTarget: 1.2, aliases: ['thiamin', 'thiamine', 'vitamin b1', 'thiamin (b1)'], priority: 16 },
  { key: 'riboflavin', label: 'Riboflavin (B2)', unit: 'mg', dvTarget: 1.3, aliases: ['riboflavin', 'vitamin b2', 'riboflavin (b2)'], priority: 17 },
  { key: 'niacin', label: 'Niacin (B3)', unit: 'mg', dvTarget: 16, aliases: ['niacin', 'vitamin b3', 'niacin (b3)'], priority: 18 },
  { key: 'phosphorus', label: 'Phosphorus', unit: 'mg', dvTarget: 1250, aliases: ['phosphorus', 'p'], priority: 19 },
  { key: 'copper', label: 'Copper', unit: 'mg', dvTarget: 0.9, aliases: ['copper', 'cu'], priority: 20 },
  { key: 'manganese', label: 'Manganese', unit: 'mg', dvTarget: 2.3, aliases: ['manganese', 'mn'], priority: 21 },
  { key: 'selenium', label: 'Selenium', unit: 'mcg', dvTarget: 55, aliases: ['selenium', 'se'], priority: 22 },
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
 * Computes nutrition for a single scheduled meal entry including all attached
 * sauces, sides, and USDA condiments (scaled by each item's own serving/portion amount).
 */
export const computeEntryTotalNutrients = (entry, recipeDetailsMap = {}) => {
  const mult = Math.max(0.25, Number(entry?.servings || 1));
  const detail = entry?.recipeId ? recipeDetailsMap?.[entry.recipeId] || null : null;
  const detailMacros = detail?.macros || detail || {};

  const baseCal = (Number(entry?.calories ?? detailMacros?.calories ?? 0) || 0) * mult;
  const basePro = (Number(entry?.protein_g ?? detailMacros?.protein_g ?? 0) || 0) * mult;
  const baseCarb = (Number(entry?.carbs_g ?? detailMacros?.carbs_g ?? 0) || 0) * mult;
  const baseFat = (Number(entry?.fat_g ?? detailMacros?.fat_g ?? 0) || 0) * mult;
  const baseFib = resolveRecipeFiberGrams(entry, detail) * mult;

  const baseRawMicros =
    Array.isArray(entry?.micros) && entry.micros.length > 0
      ? entry.micros
      : Array.isArray(detail?.micros) && detail.micros.length > 0
        ? detail.micros
        : parseMicrosFromDeepDive(entry?.recipeNotes || detail?.notes || '');

  const scaledMicroChunks = [];
  if (Array.isArray(baseRawMicros) && baseRawMicros.length > 0) {
    scaledMicroChunks.push({ list: baseRawMicros, mult });
  }

  let addCal = 0;
  let addPro = 0;
  let addCarb = 0;
  let addFat = 0;
  let addFib = 0;

  const addons = Array.isArray(entry?.addons) ? entry.addons : [];
  for (const ad of addons) {
    if (!ad || typeof ad !== 'object') continue;
    if (ad.type === 'usda') {
      if (ad.per100g && Number(ad.grams) > 0) {
        const gScale = Number(ad.grams) / 100;
        addCal += (Number(ad.per100g.calories) || 0) * gScale;
        addPro += (Number(ad.per100g.protein_g) || 0) * gScale;
        addCarb += (Number(ad.per100g.carbs_g) || 0) * gScale;
        addFat += (Number(ad.per100g.fat_g) || 0) * gScale;
        addFib += (Number(ad.per100g.fiber_g) || 0) * gScale;
        if (Array.isArray(ad.micros) && ad.micros.length > 0) {
          scaledMicroChunks.push({ list: ad.micros, mult: 1 });
        } else if (ad.per100g.micros && typeof ad.per100g.micros === 'object') {
          const converted = Object.entries(ad.per100g.micros).map(([name, val]) => ({
            nutrient_name: name,
            amount: (Number(val) || 0) * gScale,
            unit: MICRO_ALIAS_MAP[name.toLowerCase()]?.unit || 'mg',
          }));
          if (converted.length > 0) {
            scaledMicroChunks.push({ list: converted, mult: 1 });
          }
        }
      } else {
        addCal += Number(ad.calories) || 0;
        addPro += Number(ad.protein_g) || 0;
        addCarb += Number(ad.carbs_g) || 0;
        addFat += Number(ad.fat_g) || 0;
        addFib += Number(ad.fiber_g) || 0;
        if (Array.isArray(ad.micros) && ad.micros.length > 0) {
          scaledMicroChunks.push({ list: ad.micros, mult: 1 });
        }
      }
    } else {
      const adServ = Math.max(0.25, Number(ad.servings || 1));
      const adDetail = ad.recipeId ? recipeDetailsMap?.[ad.recipeId] || null : null;
      const adDetailMacros = adDetail?.macros || adDetail || {};
      addCal += (Number(ad.calories ?? adDetailMacros?.calories ?? 0) || 0) * adServ;
      addPro += (Number(ad.protein_g ?? adDetailMacros?.protein_g ?? 0) || 0) * adServ;
      addCarb += (Number(ad.carbs_g ?? adDetailMacros?.carbs_g ?? 0) || 0) * adServ;
      addFat += (Number(ad.fat_g ?? adDetailMacros?.fat_g ?? 0) || 0) * adServ;
      addFib += resolveRecipeFiberGrams(ad, adDetail) * adServ;

      const adMicros =
        Array.isArray(adDetail?.micros) && adDetail.micros.length > 0
          ? adDetail.micros
          : Array.isArray(ad.micros) && ad.micros.length > 0
            ? ad.micros
            : [];
      if (adMicros.length > 0) {
        scaledMicroChunks.push({ list: adMicros, mult: adServ });
      }
    }
  }

  return {
    baseMacros: {
      calories: Math.round(baseCal),
      protein: Math.round(basePro * 10) / 10,
      carbs: Math.round(baseCarb * 10) / 10,
      fat: Math.round(baseFat * 10) / 10,
      fiber: Math.round(baseFib * 10) / 10,
    },
    addonsMacros: {
      calories: Math.round(addCal),
      protein: Math.round(addPro * 10) / 10,
      carbs: Math.round(addCarb * 10) / 10,
      fat: Math.round(addFat * 10) / 10,
      fiber: Math.round(addFib * 10) / 10,
    },
    totalMacros: {
      calories: Math.round(baseCal + addCal),
      protein: Math.round((basePro + addPro) * 10) / 10,
      carbs: Math.round((baseCarb + addCarb) * 10) / 10,
      fat: Math.round((baseFat + addFat) * 10) / 10,
      fiber: Math.round((baseFib + addFib) * 10) / 10,
    },
    scaledMicroChunks,
    addonsCount: addons.length,
  };
};

/**
 * Aggregates macros, dietary fiber, and common micronutrients across all entries
 * (plus attached sauces, sides, and USDA condiments) scheduled for a single day.
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
    const computed = computeEntryTotalNutrients(entry, recipeDetailsMap);
    totals.calories += computed.totalMacros.calories;
    totals.protein += computed.totalMacros.protein;
    totals.carbs += computed.totalMacros.carbs;
    totals.fat += computed.totalMacros.fat;
    totals.fiber += computed.totalMacros.fiber;

    if (computed.scaledMicroChunks.length > 0) {
      recipesWithMicroData += 1;
    }

    for (const chunk of computed.scaledMicroChunks) {
      const cMult = chunk.mult || 1;
      for (const micro of chunk.list || []) {
        const rawName = micro?.nutrient_name || micro?.name || '';
        const meta = normalizeNutrientMeta(rawName);
        if (!meta || meta.isFiberMacro) continue;

        const rawAmount = Number(micro?.amount ?? 0) || 0;
        const rawUnit = normalizeUnitString(micro?.unit || meta.defaultUnit || '');
        const rawDv = Number(micro?.daily_value_percentage ?? micro?.dv ?? 0) || 0;

        const targetUnit = meta.defaultUnit || rawUnit;
        const convertedAmount = convertUnitAmount(rawAmount, rawUnit, targetUnit) * cMult;

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
        existing.rawDvSum += rawDv * cMult;
        microsAccumulator.set(meta.key, existing);
      }
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
 * Fetches and caches the full public recipe pool PLUS the logged-in user's own
 * recipes (published Masterpieces, Variants, Private Drafts) and saved Vault
 * favorites so Emma can filter by the user's recipes or suggest untried ideas.
 */
export const fetchPublishedRecipesCatalog = async (forceRefresh = false, userId = null) => {
  const normalizedUid = userId ? Number(userId) : null;
  const userChanged = normalizedUid !== null && normalizedUid !== cachedForUserId;
  const now = Date.now();
  if (
    !forceRefresh &&
    !userChanged &&
    cachedCatalog &&
    now - cachedAt < CATALOG_CACHE_TTL_MS
  ) {
    return cachedCatalog;
  }

  if (!forceRefresh && !userChanged && inFlightCatalogPromise) {
    return inFlightCatalogPromise;
  }

  inFlightCatalogPromise = Promise.allSettled([
    api.getRecipes(),
    api.getPlannableRecipes(),
  ])
    .then(([publicRes, plannableRes]) => {
      const publicRows =
        publicRes.status === 'fulfilled' && Array.isArray(publicRes.value)
          ? publicRes.value
          : Array.isArray(publicRes.value?.recipes)
            ? publicRes.value.recipes
            : [];

      const plannableRows =
        plannableRes.status === 'fulfilled' && Array.isArray(plannableRes.value?.recipes)
          ? plannableRes.value.recipes
          : [];

      const publicById = new Map(
        publicRows
          .filter((r) => r && r.id !== undefined && r.id !== null)
          .map((r) => [Number(r.id), r])
      );

      const mergedById = new Map();

      // 1. Seed from plannable recipes when authenticated (includes user's private drafts + isOwn + isFavorited + calories)
      plannableRows.forEach((r) => {
        if (!r || r.id === undefined || r.id === null) return;
        const rid = Number(r.id);
        const pub = publicById.get(rid);
        const combined = {
          ...pub,
          ...r,
          id: rid,
          userId: Number(r.userId ?? r.user_id ?? pub?.user_id ?? pub?.authorId ?? 0) || null,
          authorId: Number(r.userId ?? r.user_id ?? pub?.authorId ?? pub?.user_id ?? 0) || null,
          authorName: r.authorName || pub?.authorName || 'Emma (AI)',
          isOwn: Boolean(r.isOwn),
          isFavorited: Boolean(r.isFavorited ?? r.is_favorite ?? pub?.isFavorited ?? pub?.is_favorite),
          isDraft: Boolean(r.isDraft ?? (r.isPublic === false)),
          isPublic: r.isPublic !== undefined ? Boolean(r.isPublic) : !r.isDraft,
          ingredients:
            Array.isArray(r.ingredients) && r.ingredients.length > 0
              ? r.ingredients
              : pub?.ingredients || [],
        };
        mergedById.set(rid, {
          ...combined,
          dietary: getRecipeDietaryFlags(combined, { useGlutenHeuristicFallback: true }),
        });
      });

      // 2. Ensure every public recipe from /recipes is present
      publicRows.forEach((r) => {
        if (!r || r.id === undefined || r.id === null) return;
        const rid = Number(r.id);
        if (mergedById.has(rid)) return;
        const isDraft = Boolean(r.isDraft || r.isPublic === false || r.is_public === false);
        if (isDraft) return;
        const normalized = {
          ...r,
          id: rid,
          userId: Number(r.user_id ?? r.authorId ?? 0) || null,
          authorId: Number(r.authorId ?? r.user_id ?? 0) || null,
          authorName: r.authorName || r.author_name || 'Emma (AI)',
          isOwn: Boolean(r.isOwn),
          isFavorited: Boolean(r.isFavorited ?? r.is_favorite),
          isDraft: false,
          isPublic: true,
          dietary: getRecipeDietaryFlags(r, { useGlutenHeuristicFallback: true }),
        };
        mergedById.set(rid, normalized);
      });

      const mergedList = Array.from(mergedById.values());
      cachedCatalog = mergedList;
      cachedAt = Date.now();
      if (normalizedUid !== null) {
        cachedForUserId = normalizedUid;
      }
      return mergedList;
    })
    .catch((err) => {
      console.warn('Could not preload recipe catalog for Emma:', err);
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
 * Formats the recipe catalog into a system prompt block separated into:
 * 1) The logged-in user's own & saved Vault recipes (already created/tried by the user)
 * 2) The remaining public recipe pool (dishes the user hasn't created or saved yet)
 */
export const buildPublishedRecipesPromptSection = (
  recipes = [],
  maxRecipes = 150,
  { vocalMode = false, currentUser = null } = {}
) => {
  if (!Array.isArray(recipes) || recipes.length === 0) return '';

  const currentUid = Number(currentUser?.id || 0);
  const currentUname = String(currentUser?.username || '').trim().toLowerCase();

  const classifyRecipe = (r) => {
    const recipeUid = Number(r.userId ?? r.user_id ?? r.authorId ?? 0);
    const authorName = String(r.authorName ?? r.author_name ?? 'Emma (AI)').trim();
    const isOwn =
      Boolean(r.isOwn) ||
      (currentUid > 0 && recipeUid === currentUid) ||
      (currentUname !== '' && authorName.toLowerCase() === currentUname);
    const isFavorited = Boolean(r.isFavorited || r.is_favorite);
    const isDraft = Boolean(r.isDraft || r.isPublic === false || r.is_public === false);
    return { isOwn, isFavorited, isDraft, authorName };
  };

  const userRecipes = [];
  const publicPoolOnly = [];

  recipes.forEach((r) => {
    if (!r) return;
    const meta = classifyRecipe(r);
    if (meta.isOwn || meta.isFavorited) {
      userRecipes.push({ recipe: r, meta });
    } else if (!meta.isDraft) {
      publicPoolOnly.push({ recipe: r, meta });
    }
  });

  const formatLine = ({ recipe: r, meta }) => {
    const prep = Number(r.prepTime ?? r.prep_time_mins ?? 0);
    const cook = Number(r.cookTime ?? r.cook_time_mins ?? 0);
    const totalMins = prep + cook;
    const cal = r.calories ? ` | ${r.calories} kcal` : '';
    const diet = formatDietTags(r);

    let statusBadge = `PUBLIC POOL by @${meta.authorName}`;
    if (meta.isOwn && meta.isDraft) {
      statusBadge = "USER'S OWN PRIVATE DRAFT";
    } else if (meta.isOwn && meta.isFavorited) {
      statusBadge = "USER'S OWN PUBLISHED RECIPE & SAVED IN VAULT";
    } else if (meta.isOwn) {
      statusBadge = "USER'S OWN PUBLISHED RECIPE";
    } else if (meta.isFavorited) {
      statusBadge = `SAVED IN USER'S VAULT (by @${meta.authorName})`;
    }

    if (vocalMode) {
      return `- "${r.title}" (ID ${r.id}; ${statusBadge}; ${diet}${totalMins > 0 ? `; ${totalMins} mins` : ''}${cal})`;
    }

    const desc = r.description
      ? ` — ${String(r.description).replace(/\s+/g, ' ').trim().slice(0, 100)}`
      : '';
    return `- [ID ${r.id}] "${r.title}" | Status: ${statusBadge} | Link: /recipe/${r.id} | Diet: ${diet}${totalMins > 0 ? ` | ${totalMins}m` : ''}${cal}${formatIngredientsPreview(r.ingredients)}${desc}`;
  };

  const userLines = userRecipes.map(formatLine);
  const remainingBudget = Math.max(40, maxRecipes - userLines.length);
  const publicLines = publicPoolOnly.slice(0, remainingBudget).map(formatLine);
  const sample = recipes.find((r) => !r?.isDraft) || recipes[0];

  if (vocalMode) {
    return `\n\nTHE VEGGIE VAULT RECIPE CATALOG (User's Recipes: ${userRecipes.length} | Other Public Pool Recipes: ${publicPoolOnly.length}):
HOW TO USE THIS CATALOG:
1. Section A lists the logged-in user's own recipes (their published Masterpieces, Variants, Private Drafts) and recipes they have saved in their Vault. You can filter specifically for their recipes whenever they ask about "my recipes", "my drafts", or "what have I made?".
2. Section B lists public community recipes that the user has NOT created or saved yet.
3. ANTI-REPEAT / UNTRIED IDEAS RULE: Whenever the user asks for recipe ideas they haven't tried yet, something new, or fresh inspiration, treat every dish in Section A as ALREADY TRIED/MADE by the user — do NOT repeat or suggest dishes from Section A unless they specifically ask to revisit or remix one of their own recipes!

SECTION A — LOGGED-IN USER'S RECIPES (ALREADY CREATED OR SAVED BY USER — ${userRecipes.length}):
${userLines.length > 0 ? userLines.join('\n') : '(None yet — this user has not created or saved any recipes yet.)'}

SECTION B — OTHER PUBLIC RECIPE POOL (NOT YET IN USER'S RECIPES — ${publicPoolOnly.length}):
${publicLines.length > 0 ? publicLines.join('\n') : '(No other public recipes.)'}`;
  }

  return `\n\nTHE VEGGIE VAULT RECIPE CATALOG (User's Personal/Saved Recipes: ${userRecipes.length} | Other Public Pool Recipes: ${publicPoolOnly.length}):
HOW TO FILTER & USE THIS CATALOG:
1. **Filter for the User's Recipes (Section A):** Section A contains all recipes authored by the logged-in user (\`USER'S OWN PUBLISHED RECIPE\`, \`USER'S OWN PRIVATE DRAFT\`) plus recipes they saved to their Vault (\`SAVED IN USER'S VAULT\`). Whenever the user asks about "my recipes", "my drafts", "my favorites", or what dishes they have already created/saved, filter and answer from Section A.
2. **Filter for Untried Public Recipes (Section B):** Section B contains the rest of the public recipe pool that the user has NOT created or saved yet.
3. **ANTI-REPEAT / "HAVEN'T TRIED YET" RULE (CRITICAL):** Whenever the user asks for **"recipe ideas we haven't tried yet"**, **"something new"**, **"new ideas"**, or fresh inspiration, treat every recipe in Section A as **ALREADY TRIED / ALREADY MADE** by the user!
   - When recommending existing Vault recipes they haven't tried yet, pick exclusively from Section B.
   - When brainstorming brand-new custom recipe ideas (\`<RECIPE_IDEAS>\`), make sure none of your suggested dishes duplicate or repeat any recipe in Section A!
4. **Linking Rule:** Whenever you mention an existing Vault recipe from either section, include a clickable Markdown link in the exact format [Recipe Title](/recipe/<id>) (e.g., [${sample?.title || 'Sample Recipe'}](/recipe/${sample?.id || 1})). Never invent fake IDs:

SECTION A — LOGGED-IN USER'S RECIPES (ALREADY CREATED, DRAFTED, OR SAVED BY THIS USER — ${userRecipes.length}):
${userLines.length > 0 ? userLines.join('\n') : '(None yet — this user has not created or saved any recipes yet.)'}

SECTION B — OTHER PUBLIC RECIPE POOL (NOT YET CREATED OR SAVED BY THIS USER — ${publicPoolOnly.length}):
${publicLines.length > 0 ? publicLines.join('\n') : '(No other public recipes outside the user\'s collection.)'}`;
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
  wellnessProfile = null,
  vocalMode = false,
}) => {
  const dateMapText = buildCalendarDateMapText(visibleRange, todayYmd);

  const userCalTarget = Number(wellnessProfile?.calorie_target) || 0;
  const userProteinTarget = Number(wellnessProfile?.protein_target_g) || 0;
  const userCarbsTarget = Number(wellnessProfile?.carbs_target_g) || 0;
  const userFatTarget = Number(wellnessProfile?.fat_target_g) || 0;
  const userBmi = wellnessProfile?.bmi ? Number(wellnessProfile.bmi) : null;
  const userTdee = Number(wellnessProfile?.tdee) || 0;
  const userBmr = Number(wellnessProfile?.bmr) || 0;
  const userMacroPlan = wellnessProfile?.macro_plan || '';
  const userActivity = wellnessProfile?.activity_level || '';
  const userHeightFt = wellnessProfile?.height_ft;
  const userHeightIn = wellnessProfile?.height_in;
  const userWeight = wellnessProfile?.weight_lbs;
  const userAllergies = String(wellnessProfile?.allergies || '').trim();

  const effectiveCalTarget = userCalTarget > 0 ? userCalTarget : 2000;

  let wellnessSection = '';
  if (userCalTarget > 0 || userBmi || userTdee > 0 || userProteinTarget > 0) {
    const heightStr = userHeightFt ? `${userHeightFt}ft ${userHeightIn || 0}in` : '';
    const weightStr = userWeight ? `${userWeight} lbs` : '';
    const bodyStr = [userBmi ? `BMI: ${userBmi}` : '', heightStr, weightStr, userActivity ? `Activity: ${userActivity}` : ''].filter(Boolean).join(' | ');

    wellnessSection = `\n\nUSER PERSONAL WELLNESS & NUTRITION TARGETS:
${userName}'s personal profile has the following saved calculations from the Wellness Tools:
- Daily Calorie Target: ${effectiveCalTarget} kcal/day${userTdee > 0 ? ` (Maintenance TDEE: ${userTdee} kcal, BMR: ${userBmr || 'N/A'} kcal)` : ''}
- Daily Macro Targets: ${userProteinTarget > 0 ? `${userProteinTarget}g Protein` : '50g Protein'}, ${userCarbsTarget > 0 ? `${userCarbsTarget}g Carbs` : '275g Carbs'}, ${userFatTarget > 0 ? `${userFatTarget}g Fat` : '78g Fat'} (Dietary Plan: ${userMacroPlan || 'Balanced'})
${bodyStr ? `- Physical Baseline: ${bodyStr}` : ''}

NUTRITION, MACRO & SERVING-SCALING GUIDELINES FOR EMMA:
1. When recommending meals, populating calendar days, or reviewing daily totals, directly evaluate choices against ${userName}'s personal target of ${effectiveCalTarget} kcal, ${userProteinTarget > 0 ? `${userProteinTarget}g Protein` : '50g Protein'}, ${userCarbsTarget > 0 ? `${userCarbsTarget}g Carbs` : '275g Carbs'}, and ${userFatTarget > 0 ? `${userFatTarget}g Fat` : '78g Fat'}!
2. SERVING-SIZE SCALING POWER (CRITICAL): You have full authority to choose and adjust \`servings\` (in practical \`0.25\` increments from \`0.25\` to \`20\`, such as \`0.5\`, \`0.75\`, \`1\`, \`1.25\`, \`1.5\`, \`1.75\`, \`2\`, \`2.5\`) both when adding new meals AND when updating already-scheduled meals so each day's total calorie intake lands closely on ${effectiveCalTarget} kcal/day (ideally within ±5% / ±75 kcal) and aligns with their macro targets.
3. HOW TO BALANCE EXISTING OR NEW DAYS: Look at each scheduled entry's \`base=<X> kcal/serving\` and \`entry_id\`, plus the \`DAILY CALORIE TOTALS VS TARGET\` summary. When asked to match or adjust portions for a user's calorie target (or when planning meals for a day), calculate realistic \`servings\` across meals (using \`update\` actions in Text Chat or \`update_meal_plan_entries\` / \`update_meal_plan_entry\` in Live Audio for existing entries, and scaled \`servings\` on \`add\` for new entries), and report both the adjusted serving amounts and the resulting daily calorie total.
4. If they ask about their BMI or caloric needs, you have full context of their saved calculations right here.`;
  } else {
    wellnessSection = `\n\nUSER NUTRITION PROFILE:
${userName} has not set custom wellness targets in their profile yet (using standard baseline: 2,000 kcal/day, 50g protein, 275g carbs, 78g fat, 28g fiber). If appropriate, you can warmly remind them that they can calculate and save their personal BMI, TDEE, and macro targets anytime in the Wellness Tools page (/wellness) to give you their exact targets! You can still scale \`servings\` in \`0.25\` increments (0.25 to 20) whenever asked.`;
  }

  if (userAllergies) {
    wellnessSection += `\n\nCRITICAL ALLERGY & SAFETY RESTRICTION (MANDATORY):
${userName} has the following food allergies/sensitivities saved in their profile: ${userAllergies}.
NEVER recommend or schedule any recipe whose title or ingredients contain ${userAllergies} (or hidden derivatives). Always prioritize safe recipes and warn them if a recipe they ask about contains one of their allergens.`;
  }

  const dayTotalsMap = new Map();
  entries.forEach((e) => {
    if (!e?.planDate) return;
    const computed = computeEntryTotalNutrients(e);
    const prev = dayTotalsMap.get(e.planDate) || { kcal: 0, count: 0 };
    dayTotalsMap.set(e.planDate, {
      kcal: prev.kcal + computed.totalMacros.calories,
      count: prev.count + 1,
    });
  });

  const dayCalorieTotals =
    dayTotalsMap.size === 0
      ? 'No days currently have scheduled meals.'
      : Array.from(dayTotalsMap.entries())
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([dateKey, info]) => {
            const totalKcal = Math.round(info.kcal);
            const diff = totalKcal - effectiveCalTarget;
            const status =
              Math.abs(diff) <= 50
                ? '(on target)'
                : diff < 0
                  ? `(${diff} kcal under target)`
                  : `(+${diff} kcal over target)`;
            return `- ${dateKey}: ${totalKcal} / ${effectiveCalTarget} kcal ${status}`;
          })
          .join('\n');

  const scheduleLines =
    entries.length === 0
      ? 'No meals are currently scheduled in the visible calendar window.'
      : entries
          .map((e) => {
            const computed = computeEntryTotalNutrients(e);
            const baseCal = Number(e.calories) || 0;
            const serv = Number(e.servings || 1);
            const totalCal = computed.totalMacros.calories;
            const calStr =
              totalCal > 0
                ? `base=${Math.round(baseCal)} kcal/serving, combined_total=${totalCal} kcal`
                : 'kcal N/A';
            const addonDesc =
              Array.isArray(e.addons) && e.addons.length > 0
                ? `; sauces/sides=[${e.addons
                    .map((ad) =>
                      ad.type === 'usda'
                        ? `${ad.title} (${ad.amount} ${ad.unit})`
                        : `${ad.title} (${ad.servings} srv)`
                    )
                    .join(', ')}]`
                : '';
            return `- entry_id=${e.id} | ${e.planDate} | ${e.mealSlot} | "${e.title}" (recipe_id=${e.recipeId || 'USDA'}, servings=${serv}, ${calStr}${e.isDraft ? ', DRAFT' : ''}${addonDesc})`;
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

  const recipeLines = (plannableRecipes || []).slice(0, 150).map((r) => {
    let ownershipBadge = ' [PUBLIC POOL — NOT YET IN USER\'S VAULT]';
    if (r.isOwn && r.isDraft) {
      ownershipBadge = ' [USER\'S OWN PRIVATE DRAFT]';
    } else if (r.isOwn) {
      ownershipBadge = ' [USER\'S OWN PUBLISHED RECIPE]';
    } else if (r.isFavorited || r.is_favorite) {
      ownershipBadge = ' [SAVED IN USER\'S VAULT]';
    }
    const diet = formatDietTags(r);
    const macros =
      r.calories !== null && r.calories !== undefined
        ? ` | ${r.calories} kcal, ${r.protein_g || 0}g P, ${r.carbs_g || 0}g C, ${r.fat_g || 0}g F, ${r.fiber_g || 0}g Fiber`
        : '';
    const ing = formatIngredientsPreview(r.ingredients);
    if (vocalMode) {
      return `- recipe_id=${r.id} | "${r.title}"${ownershipBadge} | ${diet}${macros}${ing}`;
    }
    return `- recipe_id=${r.id} | "${r.title}" | Link: /recipe/${r.id}${ownershipBadge} | Diet: ${diet}${macros}${ing}`;
  });

  const actionProtocol = vocalMode
    ? `LIVE AUDIO MEAL PLANNER CAPABILITIES (CRITICAL):
1. THIS IS A LIVE VOICE SESSION. Do NOT speak or output Markdown syntax, asterisks, URLs, or XML tags.
2. You have FULL permission to schedule, update, copy/repeat, or remove meals on ${userName}'s Meal Planner calendar using your tool calls:
   - Call \`schedule_meal_plan_entries\` when the user asks you to add, fill in, or populate one or more meals/days on the calendar (set \`servings\` in 0.25 increments from 0.25 to 20 to match their daily calorie target).
   - Call \`update_meal_plan_entry\` to move/change an existing scheduled entry (using its \`entry_id\`, including adjusting \`servings\`).
   - Call \`update_meal_plan_entries\` to adjust servings (or other fields) on multiple existing scheduled entries at once (e.g., scaling a whole day to match the user's daily calorie target).
   - Call \`copy_meal_plan_range\` to copy/repeat a Day, Week, or Month into another Day, Week, or Month (e.g., repeating last week or copying a month to next month before swapping specific days).
   - Call \`remove_meal_plan_entries\` to remove specific \`entry_id\` entries or clear a date/slot.
3. Match dietary preferences accurately (e.g. only pick Gluten-Free recipes if they ask for gluten-free).
4. Always use exact \`recipe_id\` integers from the Plannable Recipe Catalog and exact \`YYYY-MM-DD\` dates from the Calendar Date Reference. After calling a tool, confirm warmly out loud which recipes and serving sizes you scheduled or adjusted on which days.`
    : `MEAL PLANNER TEXT CHAT & CALENDAR PERMISSIONS:
1. You have FULL access to ${userName}'s Meal Planner calendar and all plannable recipes (published recipes + their own private drafts).
2. Format your conversational reply cleanly in Markdown. Whenever you mention or recommend a recipe from the catalog, ALWAYS link to it using [Recipe Title](/recipe/<recipe_id>) so ${userName} can click straight through!
3. CALENDAR MODIFICATION PROTOCOL:
   Whenever the user asks you to add, schedule, fill in, plan, populate, move, update, swap, copy/repeat a day/week/month, adjust servings/calories, or remove meals on their calendar, perform a conversational response explaining your choices AND append ONE XML action block at the very end of your message:
   <MEAL_PLAN_ACTIONS>
   [
     { "action": "add", "recipe_id": 123, "plan_date": "YYYY-MM-DD", "meal_slot": "breakfast", "servings": 1.5, "notes": "Optional short note" }
   ]
   </MEAL_PLAN_ACTIONS>

   Supported action schemas inside the JSON array:
   - Add a meal: { "action": "add", "recipe_id": <int>, "plan_date": "YYYY-MM-DD", "meal_slot": "breakfast"|"lunch"|"dinner"|"snack", "servings": <number in 0.25 increments from 0.25 to 20, e.g. 0.75, 1, 1.25, 1.5, 2>, "notes": "optional" }
   - Update/move or rescale servings on an existing meal (only \`entry_id\` plus the changed fields such as \`servings\` are required—omitted fields keep their existing values): { "action": "update", "entry_id": <int>, "recipe_id": <optional int>, "plan_date": <optional "YYYY-MM-DD">, "meal_slot": <optional "breakfast"|"lunch"|"dinner"|"snack">, "servings": <optional number in 0.25 increments from 0.25 to 20>, "notes": <optional string> }
   - Copy or repeat a Day, Week, or Month: { "action": "copy_range", "mode": "day"|"week"|"month", "source_start": "YYYY-MM-DD", "source_end": "YYYY-MM-DD", "target_start": "YYYY-MM-DD", "repeat_count": 1, "overwrite": false }
   - Remove one entry: { "action": "remove", "entry_id": <int> }
   - Clear a day (or one slot on a day): { "action": "clear_day", "plan_date": "YYYY-MM-DD", "meal_slot": "optional slot or omit for whole day" }

4. RULES FOR ACTIONS:
   - ONLY use real \`recipe_id\` integers from the Plannable Recipe Catalog below, and valid \`YYYY-MM-DD\` dates from the Calendar Date Reference.
   - Check each recipe's \`Diet\` tags and ingredients before scheduling if the user specifies Gluten-Free, Oil-Free, high-protein, high-iron, etc.
   - \`servings\` supports \`0.25\` increments from \`0.25\` to \`20\` (e.g., \`0.5\`, \`0.75\`, \`1\`, \`1.25\`, \`1.5\`, \`1.75\`, \`2\`).
   - If the user asks to copy a previous month/week to next month/week and swap specific days, you can emit \`copy_range\` followed by \`clear_day\` / \`add\` actions for the specific days being changed!
   - If the user is ONLY asking a question (e.g., "give me links to gluten-free dinners" or "what nutrients am I low on?"), do NOT output \`<MEAL_PLAN_ACTIONS>\`. Only emit \`<MEAL_PLAN_ACTIONS>\` when they want the calendar modified, rescaled, copied, or filled in.

${RECIPE_IDEAS_PROMPT_PROTOCOL}`;

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

DAILY CALORIE TOTALS VS TARGET (${effectiveCalTarget} kcal/day):
${dayCalorieTotals}

${focusedMicroSummary}

PLANNABLE RECIPE CATALOG (${plannableRecipes.length} total recipes available — Published + ${userName}'s Private Drafts):
${recipeLines.join('\n') || 'No recipes loaded yet.'}
${wellnessSection}

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
          list.every((it) => it && typeof it === 'object' && ['add', 'update', 'remove', 'clear_day', 'copy_range'].includes(it.action))
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
                    description:
                      'Number of servings in 0.25 increments (0.25 to 20, e.g., 0.75, 1, 1.25, 1.5, 2) to match the user daily calorie target.',
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
              description:
                'Number of servings in 0.25 increments (0.25 to 20, e.g., 0.75, 1, 1.25, 1.5, 2) to match the user daily calorie target.',
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
        name: 'update_meal_plan_entries',
        description:
          'Batch update servings or details across multiple existing meal plan entries at once (e.g. scaling portions across a day to match daily calorie targets).',
        parameters: {
          type: 'OBJECT',
          properties: {
            entries: {
              type: 'ARRAY',
              description: 'List of existing meal entries to update.',
              items: {
                type: 'OBJECT',
                properties: {
                  entry_id: {
                    type: 'INTEGER',
                    description: 'Existing meal plan entry ID to update.',
                  },
                  servings: {
                    type: 'NUMBER',
                    description:
                      'Number of servings in 0.25 increments (0.25 to 20, e.g., 0.75, 1, 1.25, 1.5, 2) to match the user daily calorie target.',
                  },
                  recipe_id: {
                    type: 'INTEGER',
                    description: 'Optional new recipe ID to swap into this entry.',
                  },
                  plan_date: {
                    type: 'STRING',
                    description: 'Optional updated date in YYYY-MM-DD format.',
                  },
                  meal_slot: {
                    type: 'STRING',
                    description: 'Optional updated slot: breakfast, lunch, dinner, or snack.',
                  },
                  notes: {
                    type: 'STRING',
                    description: 'Optional updated notes.',
                  },
                },
                required: ['entry_id'],
              },
            },
          },
          required: ['entries'],
        },
      },
      {
        name: 'copy_meal_plan_range',
        description:
          'Copy or repeat planned meals from a source day, week, or month onto a target day, week, or month (e.g. copy previous month into next month).',
        parameters: {
          type: 'OBJECT',
          properties: {
            mode: {
              type: 'STRING',
              description: 'One of: day, week, month.',
            },
            source_start: {
              type: 'STRING',
              description: 'Source start date in YYYY-MM-DD (or first of month YYYY-MM-01).',
            },
            source_end: {
              type: 'STRING',
              description: 'Source end date in YYYY-MM-DD (optional for day/week).',
            },
            target_start: {
              type: 'STRING',
              description: 'Target start date in YYYY-MM-DD (or first of target month YYYY-MM-01).',
            },
            repeat_count: {
              type: 'INTEGER',
              description: 'Optional repeat count (1 to 12). Defaults to 1.',
            },
            overwrite: {
              type: 'BOOLEAN',
              description: 'Whether to replace existing meals in the target dates (true) or merge alongside them (false).',
            },
          },
          required: ['mode', 'source_start', 'target_start'],
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
