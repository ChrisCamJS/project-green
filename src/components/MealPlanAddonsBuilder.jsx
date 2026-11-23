import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../services/api';
import { resolveRecipeImageUrl } from '../utils/mealPlanUtils';

const USDA_PORTION_UNITS = [
  { id: 'tbsp', label: 'tbsp (15g)', gramsPerUnit: 15 },
  { id: 'tsp', label: 'tsp (5g)', gramsPerUnit: 5 },
  { id: '1/4 cup', label: '1/4 cup (60g)', gramsPerUnit: 60 },
  { id: '1/2 cup', label: '1/2 cup (120g)', gramsPerUnit: 120 },
  { id: 'cup', label: 'cup (240g)', gramsPerUnit: 240 },
  { id: 'oz', label: 'oz (28.35g)', gramsPerUnit: 28.35 },
  { id: 'packet', label: 'packet (10g)', gramsPerUnit: 10 },
  { id: 'serving', label: 'USDA serving', gramsPerUnit: null },
  { id: 'g', label: 'grams (g)', gramsPerUnit: 1 },
];

const computeUsdaGrams = (food, amount, unitId) => {
  const qty = Math.max(0.1, Number(amount) || 1);
  if (unitId === 'serving') {
    return Math.round(qty * (Number(food?.servingGrams) || 30) * 10) / 10;
  }
  if (unitId === 'tbsp' && food?.defaultUnit === 'tbsp' && Number(food?.servingGrams) > 0 && Number(food?.defaultAmount) > 0) {
    const perDefaultTbsp = Number(food.servingGrams) / Number(food.defaultAmount);
    return Math.round(qty * perDefaultTbsp * 10) / 10;
  }
  if (unitId === 'tsp' && food?.defaultUnit === 'tsp' && Number(food?.servingGrams) > 0 && Number(food?.defaultAmount) > 0) {
    const perDefaultTsp = Number(food.servingGrams) / Number(food.defaultAmount);
    return Math.round(qty * perDefaultTsp * 10) / 10;
  }
  const spec = USDA_PORTION_UNITS.find((u) => u.id === unitId);
  const perUnit = spec?.gramsPerUnit ?? 15;
  return Math.round(qty * perUnit * 10) / 10;
};

const computeUsdaPortionSnapshot = (food, amount, unitId, category = 'condiment') => {
  const qty = Math.max(0.1, Number(amount) || 1);
  const grams = computeUsdaGrams(food, qty, unitId);
  const scale = grams / 100;
  const p = food?.per100g || {};

  const microsList = Array.isArray(p.microsList)
    ? p.microsList
        .map((m) => {
          const amt = Math.round((Number(m.amount) || 0) * scale * 100) / 100;
          const dvTarget = Number(m.dvTarget) || 0;
          return {
            nutrient_name: m.nutrient_name || m.name,
            name: m.name || m.nutrient_name,
            amount: amt,
            unit: m.unit || 'mg',
            daily_value_percentage: dvTarget > 0 ? Math.round((amt / dvTarget) * 1000) / 10 : 0,
          };
        })
        .filter((m) => m.amount > 0)
    : [];

  return {
    id: `usda-${food?.fdc_id || 'custom'}-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    type: 'usda',
    category,
    fdcId: Number(food?.fdc_id || 0),
    title: String(food?.description || 'USDA Condiment').slice(0, 180),
    dataType: String(food?.data_type || 'USDA FDC'),
    amount: qty,
    unit: unitId,
    grams,
    calories: Math.round((Number(p.calories) || 0) * scale),
    protein_g: Math.round((Number(p.protein_g) || 0) * scale * 10) / 10,
    carbs_g: Math.round((Number(p.carbs_g) || 0) * scale * 10) / 10,
    fat_g: Math.round((Number(p.fat_g) || 0) * scale * 10) / 10,
    fiber_g: Math.round((Number(p.fiber_g) || 0) * scale * 10) / 10,
    micros: microsList,
    per100g: p,
  };
};

export function UsdaFoodSearchPicker({
  onSelectFood,
  actionLabel = 'Add to Meal',
  defaultCategory = 'condiment',
  autoFocusSearch = false,
}) {
  const [query, setQuery] = useState('');
  const [foods, setFoods] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const [selectedFood, setSelectedFood] = useState(null);
  const [amount, setAmount] = useState(1);
  const [unit, setUnit] = useState('tbsp');

  useEffect(() => {
    let active = true;
    const timer = setTimeout(async () => {
      setLoading(true);
      setSearchError(null);
      try {
        const res = await api.searchUsdaCondiments(query);
        if (!active) return;
        setFoods(Array.isArray(res?.foods) ? res.foods : []);
      } catch (err) {
        if (!active) return;
        setSearchError(err?.message || 'Unable to search USDA database.');
      } finally {
        if (active) setLoading(false);
      }
    }, query.trim() === '' ? 0 : 280);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query]);

  const handleChooseFood = (food) => {
    setSelectedFood(food);
    setAmount(food.defaultAmount || 1);
    setUnit(food.defaultUnit || 'tbsp');
  };

  const livePreview = useMemo(() => {
    if (!selectedFood) return null;
    return computeUsdaPortionSnapshot(selectedFood, amount, unit, defaultCategory);
  }, [selectedFood, amount, unit, defaultCategory]);

  const sodiumPreview = useMemo(() => {
    if (!livePreview?.micros) return 0;
    const sod = livePreview.micros.find((m) => /sodium/i.test(m.nutrient_name || m.name || ''));
    return sod ? Math.round(sod.amount) : 0;
  }, [livePreview]);

  return (
    <div className="mp-usda-search-box">
      <div className="mp-usda-search-input-row">
        <input
          type="search"
          className="mp-picker-search"
          placeholder="Search USDA foods, sauces & condiments (e.g., ketchup, mustard, hummus, broccoli)..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus={autoFocusSearch}
        />
      </div>

      {searchError && <div className="mp-error-banner">{searchError}</div>}

      <div className="mp-usda-results-list">
        {loading ? (
          <p className="mp-picker-status">Searching USDA FoodData Central...</p>
        ) : foods.length === 0 ? (
          <p className="mp-picker-status">No USDA foods found for &ldquo;{query}&rdquo;.</p>
        ) : (
          foods.map((food, idx) => {
            const isSel = selectedFood?.description === food.description && selectedFood?.fdc_id === food.fdc_id;
            return (
              <button
                key={`${food.fdc_id}-${food.description}-${idx}`}
                type="button"
                className={`mp-usda-item ${isSel ? 'selected' : ''}`}
                onClick={() => handleChooseFood(food)}
              >
                <div className="mp-usda-item-main">
                  <strong>{food.description}</strong>
                  <span className="mp-usda-item-sub">
                    {food.data_type} • {food.servingLabel}: {food.sampleCalories} kcal
                  </span>
                </div>
                <span className="mp-usda-pick-pill">{isSel ? 'Selected' : 'Select'}</span>
              </button>
            );
          })
        )}
      </div>

      {selectedFood && livePreview && (
        <div className="mp-usda-portion-bar">
          <div className="mp-usda-portion-inputs">
            <label>
              <span>Amount</span>
              <input
                type="number"
                min="0.1"
                max="1000"
                step="0.25"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </label>
            <label>
              <span>Unit</span>
              <select value={unit} onChange={(e) => setUnit(e.target.value)}>
                {USDA_PORTION_UNITS.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="mp-usda-preview-summary">
            <span>
              <strong>{livePreview.title}</strong> ({livePreview.grams}g)
            </span>
            <span>
              🔥 {livePreview.calories} kcal • 💪 {livePreview.protein_g}g P • 🥖 {livePreview.carbs_g}g C • 🥑 {livePreview.fat_g}g F • 🌾 {livePreview.fiber_g}g Fiber • 🧂 {sodiumPreview}mg Na
            </span>
          </div>

          <button
            type="button"
            className="mp-save-btn mp-usda-confirm-btn"
            onClick={() => {
              onSelectFood(livePreview);
              setSelectedFood(null);
            }}
          >
            {actionLabel}
          </button>
        </div>
      )}
    </div>
  );
}

const SAUCE_SIDE_KEYWORDS = /\b(sauce|dressing|gravy|dip|salsa|hummus|guacamole|pesto|glaze|aioli|mayo|tahini|ketchup|chutney|mustard|broth|slaw|side|fries|salad|broccoli|rice|beans|vegetables)\b/i;

export default function MealPlanAddonsBuilder({
  addons = [],
  onChange,
  plannableRecipes = [],
  defaultTab = 'usda',
}) {
  const [sourceTab, setSourceTab] = useState(defaultTab); // 'usda' | 'recipe'
  const [recipeQuery, setRecipeQuery] = useState('');
  const [selectedAddonRecipeId, setSelectedAddonRecipeId] = useState('');
  const [recipeServings, setRecipeServings] = useState(0.5);
  const [recipeCategory, setRecipeCategory] = useState('sauce');

  const sortedAddonRecipes = useMemo(() => {
    const q = recipeQuery.trim().toLowerCase();
    return [...plannableRecipes]
      .filter((r) => {
        if (!q) return true;
        return (
          (r.title || '').toLowerCase().includes(q) ||
          (r.authorName || '').toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        const aMatch = SAUCE_SIDE_KEYWORDS.test(a.title || '') ? 0 : 1;
        const bMatch = SAUCE_SIDE_KEYWORDS.test(b.title || '') ? 0 : 1;
        if (aMatch !== bMatch) return aMatch - bMatch;
        return (a.title || '').localeCompare(b.title || '');
      });
  }, [plannableRecipes, recipeQuery]);

  const handleAddRecipeAddon = () => {
    const rid = Number(selectedAddonRecipeId);
    const rec = plannableRecipes.find((r) => Number(r.id) === rid);
    if (!rec) return;
    const serv = Math.max(0.25, Math.min(20, Math.round((Number(recipeServings) || 1) * 4) / 4));
    const nextAddon = {
      id: `rec-${rec.id}-${Date.now()}`,
      type: 'recipe',
      category: recipeCategory,
      recipeId: Number(rec.id),
      title: rec.title,
      imageUrl: rec.imageUrl || null,
      isPublic: Boolean(rec.isPublic),
      servings: serv,
      calories: Number(rec.calories || 0),
      protein_g: Number(rec.protein_g || 0),
      carbs_g: Number(rec.carbs_g || 0),
      fat_g: Number(rec.fat_g || 0),
      fiber_g: Number(rec.fiber_g || 0),
      micros: Array.isArray(rec.micros) ? rec.micros : [],
    };
    onChange([...addons, nextAddon]);
    setSelectedAddonRecipeId('');
  };

  const handleRemoveAddon = (id) => {
    onChange(addons.filter((item) => item.id !== id));
  };

  const handleUpdateRecipeServings = (id, delta) => {
    onChange(
      addons.map((item) => {
        if (item.id !== id) return item;
        if (item.type === 'usda') {
          const nextAmt = Math.max(0.25, Math.round(((Number(item.amount) || 1) + delta) * 4) / 4);
          if (item.per100g) {
            return {
              ...computeUsdaPortionSnapshot(
                {
                  fdc_id: item.fdcId,
                  description: item.title,
                  data_type: item.dataType,
                  defaultAmount: item.amount,
                  defaultUnit: item.unit,
                  servingGrams: item.grams / Math.max(0.1, Number(item.amount) || 1),
                  per100g: item.per100g,
                },
                nextAmt,
                item.unit,
                item.category
              ),
              id: item.id,
            };
          }
          const ratio = nextAmt / Math.max(0.1, Number(item.amount) || 1);
          return {
            ...item,
            amount: nextAmt,
            grams: Math.round((Number(item.grams) || 15) * ratio * 10) / 10,
            calories: Math.round((Number(item.calories) || 0) * ratio),
            protein_g: Math.round((Number(item.protein_g) || 0) * ratio * 10) / 10,
            carbs_g: Math.round((Number(item.carbs_g) || 0) * ratio * 10) / 10,
            fat_g: Math.round((Number(item.fat_g) || 0) * ratio * 10) / 10,
            fiber_g: Math.round((Number(item.fiber_g) || 0) * ratio * 10) / 10,
          };
        }
        const nextServ = Math.max(0.25, Math.min(20, Math.round(((Number(item.servings) || 1) + delta) * 4) / 4));
        return { ...item, servings: nextServ };
      })
    );
  };

  return (
    <div className="mp-addons-builder">
      <div className="mp-addons-header">
        <div>
          <h4>🥣 Sauces, Sides &amp; Condiments</h4>
          <p>Added servings and USDA condiments are automatically counted in your daily tally.</p>
        </div>
      </div>

      {addons.length > 0 && (
        <div className="mp-addons-chip-list">
          {addons.map((ad) => {
            const isUsda = ad.type === 'usda';
            const cal = isUsda
              ? Math.round(Number(ad.calories) || 0)
              : Math.round((Number(ad.calories) || 0) * (Number(ad.servings) || 1));
            const portionStr = isUsda
              ? `${ad.amount} ${ad.unit} (${ad.grams}g)`
              : `${ad.servings} serving${Number(ad.servings) === 1 ? '' : 's'}`;
            return (
              <div key={ad.id} className={`mp-addon-chip ${isUsda ? 'usda' : 'recipe'}`}>
                <span className="mp-addon-chip-icon">{isUsda ? '🥫' : ad.category === 'side' ? '🥗' : '🥣'}</span>
                <div className="mp-addon-chip-text">
                  <strong>{ad.title}</strong>
                  <span>
                    {portionStr} • +{cal} kcal
                  </span>
                </div>
                <div className="mp-addon-chip-controls">
                  <button
                    type="button"
                    onClick={() => handleUpdateRecipeServings(ad.id, -0.25)}
                    title="Decrease portion"
                  >
                    −
                  </button>
                  <button
                    type="button"
                    onClick={() => handleUpdateRecipeServings(ad.id, 0.25)}
                    title="Increase portion"
                  >
                    +
                  </button>
                  <button
                    type="button"
                    className="remove"
                    onClick={() => handleRemoveAddon(ad.id)}
                    title="Remove sauce/side"
                  >
                    ✕
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="mp-addons-tabs" role="tablist">
        <button
          type="button"
          className={sourceTab === 'usda' ? 'active' : ''}
          onClick={() => setSourceTab('usda')}
        >
          🔍 Search USDA Condiments &amp; Sides
        </button>
        <button
          type="button"
          className={sourceTab === 'recipe' ? 'active' : ''}
          onClick={() => setSourceTab('recipe')}
        >
          📖 Attach Vault Sauce / Side Recipe
        </button>
      </div>

      {sourceTab === 'usda' ? (
        <UsdaFoodSearchPicker
          actionLabel="+ Attach Condiment / Side"
          onSelectFood={(usdaPortion) => onChange([...addons, usdaPortion])}
        />
      ) : (
        <div className="mp-recipe-addon-panel">
          <div className="mp-recipe-addon-filters">
            <input
              type="search"
              className="mp-picker-search"
              placeholder="Search Vault sauce, dip, gravy, or side recipes..."
              value={recipeQuery}
              onChange={(e) => setRecipeQuery(e.target.value)}
            />
            <select
              value={recipeCategory}
              onChange={(e) => setRecipeCategory(e.target.value)}
              className="mp-recipe-addon-cat"
            >
              <option value="sauce">🥣 Sauce / Dressing</option>
              <option value="side">🥗 Side Dish</option>
            </select>
          </div>

          <div className="mp-recipe-addon-select-row">
            <select
              value={selectedAddonRecipeId}
              onChange={(e) => setSelectedAddonRecipeId(e.target.value)}
              className="mp-recipe-addon-dropdown"
            >
              <option value="">-- Choose a Vault Sauce / Side Recipe --</option>
              {sortedAddonRecipes.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.title} {r.calories ? `(${r.calories} kcal/srv)` : ''}
                </option>
              ))}
            </select>

            <label className="mp-recipe-addon-servings">
              <span>Servings</span>
              <input
                type="number"
                min="0.25"
                max="20"
                step="0.25"
                value={recipeServings}
                onChange={(e) => setRecipeServings(e.target.value)}
              />
            </label>

            <button
              type="button"
              className="mp-save-btn"
              disabled={!selectedAddonRecipeId}
              onClick={handleAddRecipeAddon}
            >
              + Attach
            </button>
          </div>

          {sortedAddonRecipes.length > 0 && !selectedAddonRecipeId && (
            <div className="mp-recipe-quick-thumbs">
              {sortedAddonRecipes.slice(0, 6).map((r) => (
                <button
                  key={r.id}
                  type="button"
                  className="mp-recipe-quick-chip"
                  onClick={() => setSelectedAddonRecipeId(String(r.id))}
                >
                  <img
                    src={resolveRecipeImageUrl(r)}
                    alt=""
                    onError={(e) => {
                      e.currentTarget.src = '/og-vault-preview.jpeg';
                    }}
                  />
                  <span>{r.title}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
