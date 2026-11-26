import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import SEOHead from '../components/SEOHead';
import {
  formatDateYMD,
  parseDateYMD,
  getMealSlotMeta,
  resolveRecipeImageUrl,
} from '../utils/mealPlanUtils';
import {
  aggregateDailyNutrients,
  computeEntryTotalNutrients,
} from '../utils/emmaRecipeContext';
import './MealPlanner.css';

export default function SharedMealPlan() {
  const { token } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const todayYmd = formatDateYMD(new Date());
  const [share, setShare] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [targetStartDate, setTargetStartDate] = useState(todayYmd);
  const [targetMonth, setTargetMonth] = useState(todayYmd.slice(0, 7));
  const [overwrite, setOverwrite] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState(null);
  const [copiedLink, setCopiedLink] = useState(false);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await api.getSharedMealPlan(token);
        if (!active) return;
        if (res?.success && res.share) {
          setShare(res.share);
        } else {
          setError(res?.message || 'Shared meal plan not found.');
        }
      } catch (err) {
        if (!active) return;
        setError(err?.message || 'Unable to load shared meal plan.');
      } finally {
        if (active) setLoading(false);
      }
    };
    if (token) {
      load();
    }
    return () => {
      active = false;
    };
  }, [token]);

  const entriesByDay = useMemo(() => {
    if (!share?.entries?.length) return [];
    const grouped = new Map();
    share.entries.forEach((entry) => {
      const key = entry.planDate || `day-${entry.dayOffset || 0}`;
      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key).push(entry);
    });
    return Array.from(grouped.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([dateKey, items]) => ({
        dateKey,
        items,
        totals: aggregateDailyNutrients(items),
      }));
  }, [share]);

  const summaryStats = useMemo(() => {
    if (entriesByDay.length === 0) {
      return { avgCalories: 0, totalDays: 0, totalMeals: 0 };
    }
    const totalCal = entriesByDay.reduce((acc, d) => acc + (d.totals?.calories || 0), 0);
    const totalMeals = share?.entries?.length || 0;
    return {
      avgCalories: Math.round(totalCal / entriesByDay.length),
      totalDays: entriesByDay.length,
      totalMeals,
    };
  }, [entriesByDay, share]);

  const handleImportPlan = async (e) => {
    e.preventDefault();
    if (!share || importing) return;
    setImporting(true);
    setImportError(null);
    try {
      const targetStart = share.scope === 'month' ? `${targetMonth}-01` : targetStartDate;
      const res = await api.importSharedMealPlan({
        token: share.token,
        target_start_date: targetStart,
        overwrite,
      });
      if (res?.success) {
        navigate(`/meal-planner?date=${encodeURIComponent(res.targetStartDate || targetStart)}&view=${encodeURIComponent(share.scope || 'week')}`);
      } else {
        setImportError(res?.message || 'Unable to copy this meal plan.');
      }
    } catch (err) {
      setImportError(err?.message || 'Failed to copy meal plan into your calendar.');
    } finally {
      setImporting(false);
    }
  };

  const handleCopyShareLink = async () => {
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    } catch {
      window.prompt('Copy link:', url);
    }
  };

  if (loading) {
    return (
      <div className="meal-planner-page">
        <div className="mp-loading-card">Loading shared meal plan...</div>
      </div>
    );
  }

  if (error || !share) {
    return (
      <div className="meal-planner-page">
        <div className="mp-error-banner" role="alert">
          {error || 'Shared meal plan not found.'}
        </div>
        <Link to="/" className="mp-action-link">
          &larr; Return to The Veggie Vault
        </Link>
      </div>
    );
  }

  const scopeBadgeLabel =
    share.scope === 'day'
      ? '🍽️ Single-Day Meal Plan'
      : share.scope === 'month'
        ? '📅 Full-Month Meal Plan'
        : '🗓️ Weekly Meal Plan';

  return (
    <div className="meal-planner-page mp-shared-page">
      <SEOHead
        title={`${share.title} | Shared Meal Plan`}
        description={
          share.description ||
          `${share.title} — ${summaryStats.totalMeals} whole-food plant-based meals shared on The Veggie Vault.`
        }
        canonicalPath={`/meal-planner/shared/${share.token}`}
      />

      <header className="mp-shared-hero">
        <div className="mp-shared-hero-top">
          <span className="mp-shared-scope-pill">{scopeBadgeLabel}</span>
          <div className="mp-shared-meta-pills">
            <span>📅 {share.startDate}{share.endDate !== share.startDate ? ` → ${share.endDate}` : ''}</span>
            <span>🍽️ {summaryStats.totalMeals} Meals ({summaryStats.totalDays} days)</span>
            <span>🔥 ~{summaryStats.avgCalories} kcal / day</span>
          </div>
        </div>

        <h1>{share.title}</h1>
        {share.description && <p className="mp-shared-desc">{share.description}</p>}

        <div className="mp-shared-author-bar">
          <div className="mp-shared-author-left">
            <img
              src={resolveRecipeImageUrl(share.author?.profileImage)}
              alt={share.author?.displayName || 'Vault Member'}
              className="mp-shared-author-avatar"
              onError={(e) => {
                e.currentTarget.src = '/og-vault-preview.jpg';
              }}
            />
            <div>
              <span>Shared by</span>
              <strong>
                <Link to={`/profile/${encodeURIComponent(share.author?.username || '')}`}>
                  {share.author?.displayName || 'Vault Member'}
                </Link>
              </strong>
            </div>
          </div>

          <button type="button" className="mp-secondary-btn" onClick={handleCopyShareLink}>
            {copiedLink ? '✓ Link Copied!' : '📋 Copy Share Link'}
          </button>
        </div>
      </header>

      {/* COPY TO MY MEAL PLANNER BAR */}
      <section className="mp-shared-import-card" aria-label="Copy shared meal plan into your calendar">
        <div className="mp-shared-import-intro">
          <h2>📥 Copy This Meal Plan Into Your Vault Calendar</h2>
          <p>
            Import every meal, serving adjustment, and sauce/condiment onto your personal calendar — then tweak any day manually or ask Emma!
          </p>
        </div>

        {importError && <div className="mp-error-banner">{importError}</div>}

        {user ? (
          <form onSubmit={handleImportPlan} className="mp-shared-import-form">
            {share.scope === 'month' ? (
              <label>
                <span>Copy Into Month</span>
                <input
                  type="month"
                  value={targetMonth}
                  onChange={(e) => setTargetMonth(e.target.value)}
                  required
                />
              </label>
            ) : (
              <label>
                <span>Start Copying On Date</span>
                <input
                  type="date"
                  value={targetStartDate}
                  onChange={(e) => setTargetStartDate(e.target.value)}
                  required
                />
              </label>
            )}

            <label className="mp-checkbox-row">
              <input
                type="checkbox"
                checked={overwrite}
                onChange={(e) => setOverwrite(e.target.checked)}
              />
              <span>Replace existing meals on those dates</span>
            </label>

            <button type="submit" className="mp-primary-add-btn" disabled={importing}>
              {importing ? 'Copying Plan...' : '⚡ Copy Plan to My Calendar'}
            </button>
          </form>
        ) : (
          <div className="mp-shared-guest-cta">
            <p>Have a Veggie Vault account? Log in to copy this entire plan into your personal Meal Planner in one click!</p>
            <div className="mp-shared-guest-btns">
              <Link to="/login" className="mp-primary-add-btn">
                Log In to Copy Plan
              </Link>
              <Link to="/register" className="mp-secondary-btn">
                Create Free Account
              </Link>
            </div>
          </div>
        )}
      </section>

      {/* SHARED DAYS LIST */}
      <section className="mp-shared-days-list" aria-label="Shared daily meal breakdown">
        {entriesByDay.map(({ dateKey, items, totals }) => {
          const dt = /^\d{4}-\d{2}-\d{2}$/.test(dateKey) ? parseDateYMD(dateKey) : null;
          const dayHeading = dt
            ? dt.toLocaleDateString(undefined, {
                weekday: 'long',
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })
            : dateKey;
          return (
            <div key={dateKey} className="mp-shared-day-card">
              <div className="mp-shared-day-header">
                <h3>📅 {dayHeading}</h3>
                <div className="mp-shared-day-totals">
                  <span>🔥 {totals.calories} kcal</span>
                  <span>💪 {totals.protein}g P</span>
                  <span>🥖 {totals.carbs}g C</span>
                  <span>🥑 {totals.fat}g F</span>
                  <span>🌾 {totals.fiber}g Fiber</span>
                </div>
              </div>

              <div className="mp-shared-day-meals">
                {items.map((meal, idx) => {
                  const slotMeta = getMealSlotMeta(meal.mealSlot);
                  const isUsda = meal.entryType === 'usda';
                  const computed = computeEntryTotalNutrients(meal);
                  const addons = Array.isArray(meal.addons) ? meal.addons : [];
                  return (
                    <article key={`${dateKey}-${idx}`} className="mp-day-meal-row mp-shared-meal-row">
                      {isUsda || !meal.imageUrl ? (
                        <div className="mp-day-meal-usda-thumb" aria-hidden="true">
                          {isUsda ? '🥫' : '🍽️'}
                        </div>
                      ) : (
                        <Link to={meal.recipeId && meal.isPublic ? `/recipe/${meal.recipeId}` : '#'} className="mp-day-meal-img-link">
                          <img
                            src={resolveRecipeImageUrl(meal)}
                            alt={meal.title}
                            className="mp-day-meal-img"
                            onError={(e) => {
                              e.currentTarget.src = '/og-vault-preview.jpg';
                            }}
                          />
                        </Link>
                      )}

                      <div className="mp-day-meal-info">
                        <div className="mp-day-meal-badges">
                          <span className="mp-servings-pill">
                            {slotMeta.icon} {slotMeta.label}
                          </span>
                          <span className="mp-servings-pill">
                            🍽️ {Number(meal.servings)} serving{Number(meal.servings) === 1 ? '' : 's'}
                          </span>
                        </div>

                        {meal.recipeId && meal.isPublic && !isUsda ? (
                          <Link to={`/recipe/${meal.recipeId}`} className="mp-day-meal-title">
                            {meal.title}
                          </Link>
                        ) : (
                          <div className="mp-day-meal-title">{meal.title}</div>
                        )}

                        <div className="mp-day-meal-meta">
                          <span>
                            🔥 {computed.totalMacros.calories} kcal • 💪 {computed.totalMacros.protein}g P • 🥖 {computed.totalMacros.carbs}g C • 🥑 {computed.totalMacros.fat}g F • 🌾 {computed.totalMacros.fiber}g Fiber
                          </span>
                        </div>

                        {addons.length > 0 && (
                          <div className="mp-card-addons-list">
                            {addons.map((ad, adIdx) => (
                              <span key={ad.id || adIdx} className="mp-card-addon-pill">
                                {ad.type === 'usda' ? '🥫' : '🥣'} {ad.title} (
                                {ad.type === 'usda' ? `${ad.amount} ${ad.unit}` : `${ad.servings} srv`})
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          );
        })}
      </section>
    </div>
  );
}
