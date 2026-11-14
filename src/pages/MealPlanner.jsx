import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api';
import SEOHead from '../components/SEOHead';
import {
  MEAL_SLOTS,
  getMealSlotMeta,
  formatDateYMD,
  parseDateYMD,
  addDaysYMD,
  resolveRecipeImageUrl,
} from '../utils/mealPlanUtils';
import './MealPlanner.css';

const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const getVisibleRange = (viewMode, anchorDateYmd) => {
  const anchor = parseDateYMD(anchorDateYmd);

  if (viewMode === 'day') {
    return {
      start: anchorDateYmd,
      end: anchorDateYmd,
      days: [anchorDateYmd],
      label: anchor.toLocaleDateString(undefined, {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      }),
    };
  }

  if (viewMode === 'week') {
    const startDt = new Date(anchor);
    startDt.setDate(anchor.getDate() - anchor.getDay());
    const days = [];
    for (let i = 0; i < 7; i += 1) {
      const d = new Date(startDt);
      d.setDate(startDt.getDate() + i);
      days.push(formatDateYMD(d));
    }
    const endDt = parseDateYMD(days[6]);
    const label = `${startDt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${endDt.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })}`;
    return { start: days[0], end: days[6], days, label };
  }

  // Month view: Sunday of first week through Saturday of last week
  const firstOfMonth = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const lastOfMonth = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);

  const gridStart = new Date(firstOfMonth);
  gridStart.setDate(firstOfMonth.getDate() - firstOfMonth.getDay());

  const gridEnd = new Date(lastOfMonth);
  gridEnd.setDate(lastOfMonth.getDate() + (6 - lastOfMonth.getDay()));

  const days = [];
  const cursor = new Date(gridStart);
  while (cursor <= gridEnd) {
    days.push(formatDateYMD(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  return {
    start: days[0],
    end: days[days.length - 1],
    days,
    label: firstOfMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }),
    activeMonth: anchor.getMonth(),
  };
};

export default function MealPlanner() {
  const todayYmd = formatDateYMD(new Date());

  const [viewMode, setViewMode] = useState('month'); // 'month' | 'week' | 'day'
  const [anchorDate, setAnchorDate] = useState(todayYmd);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Add Recipe Picker modal state
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerDate, setPickerDate] = useState(todayYmd);
  const [pickerSlot, setPickerSlot] = useState('dinner');
  const [pickerServings, setPickerServings] = useState(1);
  const [pickerNotes, setPickerNotes] = useState('');
  const [pickerFilter, setPickerFilter] = useState('all'); // 'all' | 'drafts' | 'favorites' | 'published'
  const [pickerSearch, setPickerSearch] = useState('');
  const [plannableRecipes, setPlannableRecipes] = useState([]);
  const [recipesLoading, setRecipesLoading] = useState(false);
  const [selectedRecipe, setSelectedRecipe] = useState(null);
  const [pickerSaving, setPickerSaving] = useState(false);
  const [pickerError, setPickerError] = useState(null);

  // Edit / Quick-view entry modal state
  const [editingEntry, setEditingEntry] = useState(null);
  const [editDate, setEditDate] = useState('');
  const [editSlot, setEditSlot] = useState('dinner');
  const [editServings, setEditServings] = useState(1);
  const [editNotes, setEditNotes] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  const visibleRange = useMemo(
    () => getVisibleRange(viewMode, anchorDate),
    [viewMode, anchorDate]
  );

  const loadMealPlans = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getMealPlans(visibleRange.start, visibleRange.end);
      setEntries(Array.isArray(res?.entries) ? res.entries : []);
    } catch (err) {
      setError(err.message || 'Could not load your meal plan.');
    } finally {
      setLoading(false);
    }
  }, [visibleRange.start, visibleRange.end]);

  useEffect(() => {
    loadMealPlans();
  }, [loadMealPlans]);

  useEffect(() => {
    const onMealPlanUpdated = () => {
      loadMealPlans();
    };
    window.addEventListener('veggie-vault:meal-plan-updated', onMealPlanUpdated);
    return () => window.removeEventListener('veggie-vault:meal-plan-updated', onMealPlanUpdated);
  }, [loadMealPlans]);

  const entriesByDate = useMemo(() => {
    const grouped = {};
    for (const entry of entries) {
      if (!grouped[entry.planDate]) {
        grouped[entry.planDate] = [];
      }
      grouped[entry.planDate].push(entry);
    }
    return grouped;
  }, [entries]);

  const handleNavigateRange = (direction) => {
    if (viewMode === 'day') {
      setAnchorDate((prev) => addDaysYMD(prev, direction));
      return;
    }
    if (viewMode === 'week') {
      setAnchorDate((prev) => addDaysYMD(prev, direction * 7));
      return;
    }
    // Month navigation
    const dt = parseDateYMD(anchorDate);
    const nextMonth = new Date(dt.getFullYear(), dt.getMonth() + direction, 1);
    setAnchorDate(formatDateYMD(nextMonth));
  };

  const openPickerModal = async (dateYmd = anchorDate, slotId = 'dinner') => {
    setPickerDate(dateYmd || todayYmd);
    setPickerSlot(slotId || 'dinner');
    setPickerServings(1);
    setPickerNotes('');
    setSelectedRecipe(null);
    setPickerError(null);
    setPickerOpen(true);

    setRecipesLoading(true);
    try {
      const res = await api.getPlannableRecipes();
      setPlannableRecipes(Array.isArray(res?.recipes) ? res.recipes : []);
    } catch (err) {
      setPickerError(err.message || 'Could not load recipes.');
    } finally {
      setRecipesLoading(false);
    }
  };

  const handleAddFromPicker = async (e) => {
    e.preventDefault();
    if (!selectedRecipe) {
      setPickerError('Select a recipe first, love.');
      return;
    }
    setPickerSaving(true);
    setPickerError(null);
    try {
      const res = await api.addMealPlanEntry({
        recipe_id: selectedRecipe.id,
        plan_date: pickerDate,
        meal_slot: pickerSlot,
        servings: Number(pickerServings) || 1,
        notes: pickerNotes.trim(),
      });
      if (res?.success) {
        setPickerOpen(false);
        await loadMealPlans();
      } else {
        setPickerError(res?.message || 'Unable to schedule recipe.');
      }
    } catch (err) {
      setPickerError(err.message || 'Unable to save meal plan entry.');
    } finally {
      setPickerSaving(false);
    }
  };

  const openEditModal = (entry) => {
    setEditingEntry(entry);
    setEditDate(entry.planDate);
    setEditSlot(entry.mealSlot || 'dinner');
    setEditServings(entry.servings || 1);
    setEditNotes(entry.notes || '');
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (!editingEntry) return;
    setEditSaving(true);
    try {
      const res = await api.updateMealPlanEntry({
        id: editingEntry.id,
        plan_date: editDate,
        meal_slot: editSlot,
        servings: Number(editServings) || 1,
        notes: editNotes.trim(),
      });
      if (res?.success) {
        setEditingEntry(null);
        await loadMealPlans();
      }
    } catch (err) {
      alert(err.message || 'Could not update meal plan.');
    } finally {
      setEditSaving(false);
    }
  };

  const handleDeleteEntry = async (entryId) => {
    try {
      const res = await api.deleteMealPlanEntry(entryId);
      if (res?.success) {
        setEntries((prev) => prev.filter((item) => item.id !== entryId));
        if (editingEntry?.id === entryId) {
          setEditingEntry(null);
        }
      }
    } catch (err) {
      alert(err.message || 'Failed to remove meal.');
    }
  };

  const filteredPickerRecipes = useMemo(() => {
    const q = pickerSearch.trim().toLowerCase();
    return plannableRecipes.filter((r) => {
      if (pickerFilter === 'drafts' && !(r.isDraft && r.isOwn)) return false;
      if (pickerFilter === 'favorites' && !r.isFavorited) return false;
      if (pickerFilter === 'published' && !r.isPublic) return false;
      if (!q) return true;
      return (
        (r.title || '').toLowerCase().includes(q) ||
        (r.authorName || '').toLowerCase().includes(q)
      );
    });
  }, [plannableRecipes, pickerFilter, pickerSearch]);

  const draftCount = useMemo(
    () => plannableRecipes.filter((r) => r.isDraft && r.isOwn).length,
    [plannableRecipes]
  );

  // Day view summary stats
  const dayEntries = useMemo(
    () => entriesByDate[anchorDate] || [],
    [entriesByDate, anchorDate]
  );
  const dayNutritionTotals = useMemo(() => {
    return dayEntries.reduce(
      (acc, item) => {
        const mult = Number(item.servings || 1);
        acc.calories += Math.round((Number(item.calories) || 0) * mult);
        acc.protein += Math.round((Number(item.protein_g) || 0) * mult);
        acc.carbs += Math.round((Number(item.carbs_g) || 0) * mult);
        acc.fat += Math.round((Number(item.fat_g) || 0) * mult);
        return acc;
      },
      { calories: 0, protein: 0, carbs: 0, fat: 0 }
    );
  }, [dayEntries]);

  return (
    <div className="meal-planner-page">
      <SEOHead
        title="Meal Planner Calendar"
        description="Plan your weekly and monthly whole-food, oil-free plant-based meals using published recipes and your private drafts."
        canonicalPath="/meal-planner"
        noindex={true}
      />
      <div className="mp-top-header">
        <div>
          <h1>📅 My Meal Planner</h1>
          <p>
            Schedule any published Masterpiece or your own private draft recipes across your Day, Week, or Month calendar.
          </p>
        </div>
        <button
          type="button"
          className="mp-primary-add-btn"
          onClick={() => openPickerModal(anchorDate, 'dinner')}
        >
          ➕ Add Meal to Plan
        </button>
      </div>

      {/* Controls Bar */}
      <div className="mp-controls-bar">
        <div className="mp-view-switcher" role="group" aria-label="Calendar view">
          <button
            type="button"
            className={`mp-view-btn ${viewMode === 'month' ? 'active' : ''}`}
            onClick={() => setViewMode('month')}
          >
            📅 Month
          </button>
          <button
            type="button"
            className={`mp-view-btn ${viewMode === 'week' ? 'active' : ''}`}
            onClick={() => setViewMode('week')}
          >
            🗓️ Week
          </button>
          <button
            type="button"
            className={`mp-view-btn ${viewMode === 'day' ? 'active' : ''}`}
            onClick={() => setViewMode('day')}
          >
            🍽️ Day
          </button>
        </div>

        <div className="mp-date-nav">
          <button type="button" className="mp-nav-btn" onClick={() => handleNavigateRange(-1)}>
            &larr; Prev
          </button>
          <button type="button" className="mp-today-btn" onClick={() => setAnchorDate(todayYmd)}>
            Today
          </button>
          <button type="button" className="mp-nav-btn" onClick={() => handleNavigateRange(1)}>
            Next &rarr;
          </button>
        </div>

        <h2 className="mp-range-label">{visibleRange.label}</h2>
      </div>

      {error && (
        <div className="mp-error-banner" role="alert">
          {error}
        </div>
      )}

      {loading ? (
        <div className="mp-loading-card">Loading your meal plan calendar...</div>
      ) : (
        <>
          {/* MONTH VIEW */}
          {viewMode === 'month' && (
            <section className="mp-month-wrapper" aria-label="Monthly meal plan calendar">
              <div className="mp-weekday-header">
                {WEEKDAY_NAMES.map((dayName) => (
                  <div key={dayName} className="mp-weekday-label">
                    {dayName}
                  </div>
                ))}
              </div>

              <div className="mp-month-grid">
                {visibleRange.days.map((ymd) => {
                  const dt = parseDateYMD(ymd);
                  const isToday = ymd === todayYmd;
                  const isOutside = dt.getMonth() !== visibleRange.activeMonth;
                  const dayMeals = entriesByDate[ymd] || [];
                  const visibleMeals = dayMeals.slice(0, 3);
                  const hiddenCount = dayMeals.length - visibleMeals.length;

                  return (
                    <div
                      key={ymd}
                      className={`mp-month-cell ${isToday ? 'is-today' : ''} ${isOutside ? 'is-outside' : ''}`}
                    >
                      <div className="mp-month-cell-top">
                        <button
                          type="button"
                          className="mp-month-day-num"
                          onClick={() => {
                            setAnchorDate(ymd);
                            setViewMode('day');
                          }}
                          title="Open Day View"
                        >
                          {dt.getDate()}
                        </button>
                        <button
                          type="button"
                          className="mp-month-cell-add"
                          onClick={() => openPickerModal(ymd, 'dinner')}
                          aria-label={`Add meal on ${ymd}`}
                          title="Add recipe to this day"
                        >
                          +
                        </button>
                      </div>

                      <div className="mp-month-meals">
                        {visibleMeals.map((meal) => {
                          const slotMeta = getMealSlotMeta(meal.mealSlot);
                          return (
                            <button
                              key={meal.id}
                              type="button"
                              className="mp-month-meal-chip"
                              onClick={() => openEditModal(meal)}
                              title={`${slotMeta.label}: ${meal.title}`}
                            >
                              <img
                                src={resolveRecipeImageUrl(meal)}
                                alt={meal.title}
                                className="mp-month-meal-thumb"
                                onError={(e) => {
                                  e.currentTarget.src = '/og-vault-preview.jpeg';
                                }}
                              />
                              <div className="mp-month-meal-meta">
                                <span className="mp-month-meal-slot">
                                  {slotMeta.icon} {meal.isDraft ? '🔒' : ''}
                                </span>
                                <span className="mp-month-meal-title">{meal.title}</span>
                              </div>
                            </button>
                          );
                        })}

                        {hiddenCount > 0 && (
                          <button
                            type="button"
                            className="mp-month-more-btn"
                            onClick={() => {
                              setAnchorDate(ymd);
                              setViewMode('day');
                            }}
                          >
                            +{hiddenCount} more {hiddenCount === 1 ? 'meal' : 'meals'}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* WEEK VIEW */}
          {viewMode === 'week' && (
            <section className="mp-week-grid" aria-label="Weekly meal plan calendar">
              {visibleRange.days.map((ymd) => {
                const dt = parseDateYMD(ymd);
                const isToday = ymd === todayYmd;
                const dayMeals = entriesByDate[ymd] || [];
                const dayCals = dayMeals.reduce(
                  (sum, m) => sum + Math.round((Number(m.calories) || 0) * Number(m.servings || 1)),
                  0
                );

                return (
                  <div key={ymd} className={`mp-week-day-col ${isToday ? 'is-today' : ''}`}>
                    <div className="mp-week-col-header">
                      <button
                        type="button"
                        className="mp-week-day-btn"
                        onClick={() => {
                          setAnchorDate(ymd);
                          setViewMode('day');
                        }}
                      >
                        <span className="mp-week-dow">
                          {dt.toLocaleDateString(undefined, { weekday: 'short' })}
                        </span>
                        <strong className="mp-week-date">
                          {dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                        </strong>
                      </button>
                      <button
                        type="button"
                        className="mp-week-add-btn"
                        onClick={() => openPickerModal(ymd, 'dinner')}
                        title="Add meal to this day"
                      >
                        + Add
                      </button>
                    </div>

                    {dayCals > 0 && (
                      <div className="mp-week-cals-bar">🔥 {dayCals} kcal planned</div>
                    )}

                    <div className="mp-week-meals-list">
                      {dayMeals.length === 0 ? (
                        <div className="mp-week-empty">
                          <span>No meals planned</span>
                          <button
                            type="button"
                            onClick={() => openPickerModal(ymd, 'dinner')}
                          >
                            + Schedule Meal
                          </button>
                        </div>
                      ) : (
                        dayMeals.map((meal) => {
                          const slotMeta = getMealSlotMeta(meal.mealSlot);
                          return (
                            <article key={meal.id} className="mp-week-meal-card">
                              <Link to={`/recipe/${meal.recipeId}`} className="mp-week-card-img-link">
                                <img
                                  src={resolveRecipeImageUrl(meal)}
                                  alt={meal.title}
                                  className="mp-week-card-img"
                                  onError={(e) => {
                                    e.currentTarget.src = '/og-vault-preview.jpeg';
                                  }}
                                />
                                <span className="mp-week-slot-badge">
                                  {slotMeta.icon} {slotMeta.label}
                                </span>
                                {meal.isDraft && (
                                  <span className="mp-draft-overlay-pill">🔒 Draft</span>
                                )}
                              </Link>

                              <div className="mp-week-card-body">
                                <Link to={`/recipe/${meal.recipeId}`} className="mp-week-card-title">
                                  {meal.title}
                                </Link>
                                <div className="mp-week-card-sub">
                                  <span>{Number(meal.servings)} serving{Number(meal.servings) === 1 ? '' : 's'}</span>
                                  {meal.calories ? <span>🔥 {meal.calories} kcal</span> : null}
                                </div>
                                {meal.notes && <p className="mp-week-card-notes">{meal.notes}</p>}
                                <div className="mp-week-card-actions">
                                  <button type="button" onClick={() => openEditModal(meal)}>
                                    Edit
                                  </button>
                                  <button
                                    type="button"
                                    className="danger"
                                    onClick={() => handleDeleteEntry(meal.id)}
                                  >
                                    Remove
                                  </button>
                                </div>
                              </div>
                            </article>
                          );
                        })
                      )}
                    </div>
                  </div>
                );
              })}
            </section>
          )}

          {/* DAY VIEW */}
          {viewMode === 'day' && (
            <section className="mp-day-view" aria-label="Daily meal plan">
              <div className="mp-day-summary-bar">
                <div className="mp-day-summary-count">
                  <strong>{dayEntries.length}</strong>{' '}
                  {dayEntries.length === 1 ? 'Meal Planned' : 'Meals Planned'}
                </div>
                {dayNutritionTotals.calories > 0 && (
                  <div className="mp-day-macro-pills">
                    <span>🔥 {dayNutritionTotals.calories} kcal</span>
                    <span>💪 {dayNutritionTotals.protein}g Protein</span>
                    <span>🥖 {dayNutritionTotals.carbs}g Carbs</span>
                    <span>🥑 {dayNutritionTotals.fat}g Fat</span>
                  </div>
                )}
              </div>

              <div className="mp-day-slots-grid">
                {MEAL_SLOTS.map((slot) => {
                  const slotMeals = dayEntries.filter((m) => m.mealSlot === slot.id);
                  return (
                    <div key={slot.id} className="mp-day-slot-card">
                      <div className="mp-day-slot-header">
                        <h3>
                          {slot.icon} {slot.label}
                        </h3>
                        <button
                          type="button"
                          className="mp-day-slot-add-btn"
                          onClick={() => openPickerModal(anchorDate, slot.id)}
                        >
                          ➕ Add {slot.label}
                        </button>
                      </div>

                      {slotMeals.length === 0 ? (
                        <p className="mp-day-slot-empty">
                          Nothing scheduled for {slot.label.toLowerCase()} yet.
                        </p>
                      ) : (
                        <div className="mp-day-meals-list">
                          {slotMeals.map((meal) => (
                            <article key={meal.id} className="mp-day-meal-row">
                              <Link to={`/recipe/${meal.recipeId}`} className="mp-day-meal-img-link">
                                <img
                                  src={resolveRecipeImageUrl(meal)}
                                  alt={meal.title}
                                  className="mp-day-meal-img"
                                  onError={(e) => {
                                    e.currentTarget.src = '/og-vault-preview.jpeg';
                                  }}
                                />
                              </Link>

                              <div className="mp-day-meal-info">
                                <div className="mp-day-meal-badges">
                                  <span className={`mp-status-pill ${meal.isDraft ? 'draft' : 'published'}`}>
                                    {meal.isDraft ? '🔒 Private Draft' : '🌟 Published'}
                                  </span>
                                  <span className="mp-servings-pill">
                                    🍽️ {Number(meal.servings)} serving{Number(meal.servings) === 1 ? '' : 's'}
                                  </span>
                                </div>

                                <Link to={`/recipe/${meal.recipeId}`} className="mp-day-meal-title">
                                  {meal.title}
                                </Link>

                                <div className="mp-day-meal-meta">
                                  <span>🧑‍🍳 By {meal.authorName}</span>
                                  <span>⏱️ Prep {meal.prepTime}m • Cook {meal.cookTime}m</span>
                                  {meal.calories ? (
                                    <span>
                                      🔥 {meal.calories} kcal • 💪 {meal.protein_g || 0}g P • 🥖 {meal.carbs_g || 0}g C • 🥑 {meal.fat_g || 0}g F
                                    </span>
                                  ) : null}
                                </div>

                                {meal.notes && <p className="mp-day-meal-notes">📝 {meal.notes}</p>}

                                <div className="mp-day-meal-actions">
                                  <Link to={`/recipe/${meal.recipeId}`} className="mp-action-link">
                                    Open Recipe
                                  </Link>
                                  <button
                                    type="button"
                                    className="mp-action-btn"
                                    onClick={() => openEditModal(meal)}
                                  >
                                    Edit / Move
                                  </button>
                                  <button
                                    type="button"
                                    className="mp-action-btn danger"
                                    onClick={() => handleDeleteEntry(meal.id)}
                                  >
                                    Remove
                                  </button>
                                </div>
                              </div>
                            </article>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </>
      )}

      {/* ADD MEAL PICKER MODAL */}
      {pickerOpen && (
        <div
          className="mp-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="mp-picker-title"
          onClick={() => setPickerOpen(false)}
        >
          <div className="mp-modal-panel mp-picker-panel" onClick={(e) => e.stopPropagation()}>
            <div className="mp-modal-header">
              <h3 id="mp-picker-title">➕ Add Recipe to Meal Plan</h3>
              <button
                type="button"
                className="mp-modal-close"
                onClick={() => setPickerOpen(false)}
                aria-label="Close recipe picker"
              >
                ✕
              </button>
            </div>

            {pickerError && (
              <div className="mp-error-banner" role="alert">
                {pickerError}
              </div>
            )}

            <div className="mp-picker-filters">
              <input
                type="search"
                className="mp-picker-search"
                placeholder="Search published or draft recipes..."
                value={pickerSearch}
                onChange={(e) => setPickerSearch(e.target.value)}
              />
              <div className="mp-picker-tabs">
                <button
                  type="button"
                  className={pickerFilter === 'all' ? 'active' : ''}
                  onClick={() => setPickerFilter('all')}
                >
                  All ({plannableRecipes.length})
                </button>
                <button
                  type="button"
                  className={pickerFilter === 'drafts' ? 'active' : ''}
                  onClick={() => setPickerFilter('drafts')}
                >
                  🔒 My Drafts ({draftCount})
                </button>
                <button
                  type="button"
                  className={pickerFilter === 'favorites' ? 'active' : ''}
                  onClick={() => setPickerFilter('favorites')}
                >
                  ❤️ Favorites
                </button>
                <button
                  type="button"
                  className={pickerFilter === 'published' ? 'active' : ''}
                  onClick={() => setPickerFilter('published')}
                >
                  🌟 Published
                </button>
              </div>
            </div>

            <div className="mp-picker-recipes-list">
              {recipesLoading ? (
                <p className="mp-picker-status">Loading your recipes and community masterpieces...</p>
              ) : filteredPickerRecipes.length === 0 ? (
                <p className="mp-picker-status">No matching recipes found.</p>
              ) : (
                filteredPickerRecipes.map((rec) => {
                  const isSelected = selectedRecipe?.id === rec.id;
                  return (
                    <button
                      key={rec.id}
                      type="button"
                      className={`mp-picker-recipe-item ${isSelected ? 'selected' : ''}`}
                      onClick={() => setSelectedRecipe(rec)}
                    >
                      <img
                        src={resolveRecipeImageUrl(rec)}
                        alt={rec.title}
                        className="mp-picker-recipe-thumb"
                        onError={(e) => {
                          e.currentTarget.src = '/og-vault-preview.jpeg';
                        }}
                      />
                      <div className="mp-picker-recipe-meta">
                        <div className="mp-picker-recipe-badges">
                          <span className={`mp-status-pill ${rec.isDraft ? 'draft' : 'published'}`}>
                            {rec.isDraft ? '🔒 My Draft' : '🌟 Published'}
                          </span>
                          {rec.isFavorited && <span className="mp-fav-pill">❤️</span>}
                        </div>
                        <strong>{rec.title}</strong>
                        <span>
                          By {rec.authorName}
                          {rec.calories ? ` • ${rec.calories} kcal` : ''}
                        </span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            <form className="mp-picker-schedule-form" onSubmit={handleAddFromPicker}>
              <div className="mp-schedule-grid">
                <label>
                  <span>Date</span>
                  <input
                    type="date"
                    value={pickerDate}
                    onChange={(e) => setPickerDate(e.target.value)}
                    required
                  />
                </label>

                <label>
                  <span>Meal Slot</span>
                  <select value={pickerSlot} onChange={(e) => setPickerSlot(e.target.value)}>
                    {MEAL_SLOTS.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.icon} {s.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  <span>Servings</span>
                  <input
                    type="number"
                    min="0.5"
                    max="20"
                    step="0.5"
                    value={pickerServings}
                    onChange={(e) => setPickerServings(e.target.value)}
                  />
                </label>
              </div>

              <label className="mp-notes-label">
                <span>Notes (Optional)</span>
                <input
                  type="text"
                  maxLength={200}
                  placeholder="E.g., Marinate tofu the night before"
                  value={pickerNotes}
                  onChange={(e) => setPickerNotes(e.target.value)}
                />
              </label>

              <div className="mp-modal-footer">
                <button
                  type="button"
                  className="mp-cancel-btn"
                  onClick={() => setPickerOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="mp-save-btn"
                  disabled={!selectedRecipe || pickerSaving}
                >
                  {pickerSaving
                    ? 'Saving...'
                    : selectedRecipe
                      ? `Add "${selectedRecipe.title}"`
                      : 'Select a Recipe Above'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT / MOVE MEAL MODAL */}
      {editingEntry && (
        <div
          className="mp-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="mp-edit-title"
          onClick={() => setEditingEntry(null)}
        >
          <div className="mp-modal-panel mp-edit-panel" onClick={(e) => e.stopPropagation()}>
            <div className="mp-modal-header">
              <h3 id="mp-edit-title">✏️ Edit Planned Meal</h3>
              <button
                type="button"
                className="mp-modal-close"
                onClick={() => setEditingEntry(null)}
                aria-label="Close edit meal modal"
              >
                ✕
              </button>
            </div>

            <div className="mp-edit-preview">
              <img
                src={resolveRecipeImageUrl(editingEntry)}
                alt={editingEntry.title}
                className="mp-edit-preview-img"
                onError={(e) => {
                  e.currentTarget.src = '/og-vault-preview.jpeg';
                }}
              />
              <div>
                <span className={`mp-status-pill ${editingEntry.isDraft ? 'draft' : 'published'}`}>
                  {editingEntry.isDraft ? '🔒 My Private Draft' : '🌟 Published Recipe'}
                </span>
                <h4>{editingEntry.title}</h4>
                <Link to={`/recipe/${editingEntry.recipeId}`} className="mp-edit-recipe-link">
                  Open Full Recipe &rarr;
                </Link>
              </div>
            </div>

            <form onSubmit={handleSaveEdit} className="mp-edit-form">
              <div className="mp-schedule-grid">
                <label>
                  <span>Date</span>
                  <input
                    type="date"
                    value={editDate}
                    onChange={(e) => setEditDate(e.target.value)}
                    required
                  />
                </label>

                <label>
                  <span>Meal Slot</span>
                  <select value={editSlot} onChange={(e) => setEditSlot(e.target.value)}>
                    {MEAL_SLOTS.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.icon} {s.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  <span>Servings</span>
                  <input
                    type="number"
                    min="0.5"
                    max="20"
                    step="0.5"
                    value={editServings}
                    onChange={(e) => setEditServings(e.target.value)}
                  />
                </label>
              </div>

              <label className="mp-notes-label">
                <span>Notes</span>
                <input
                  type="text"
                  maxLength={200}
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  placeholder="Optional prep or serving notes"
                />
              </label>

              <div className="mp-modal-footer mp-edit-footer">
                <button
                  type="button"
                  className="mp-delete-btn"
                  onClick={() => handleDeleteEntry(editingEntry.id)}
                >
                  🗑️ Remove Meal
                </button>
                <div className="mp-edit-footer-right">
                  <button
                    type="button"
                    className="mp-cancel-btn"
                    onClick={() => setEditingEntry(null)}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="mp-save-btn" disabled={editSaving}>
                    {editSaving ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
