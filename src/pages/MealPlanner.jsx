import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api';
import { sendChatMessage } from '../services/geminiApi';
import { useAuth } from '../context/AuthContext';
import { useEmmaVoice } from '../hooks/useEmmaVoice';
import SEOHead from '../components/SEOHead';
import EmmaMarkdown from '../components/EmmaMarkdown';
import VoiceDictationButton from '../components/VoiceDictationButton';
import FitnessTrackerPanel from '../components/FitnessTrackerPanel';
import LiveChat from '../components/LiveChat';
import {
  MEAL_SLOTS,
  getMealSlotMeta,
  formatDateYMD,
  parseDateYMD,
  addDaysYMD,
  resolveRecipeImageUrl,
} from '../utils/mealPlanUtils';
import { getRecipeDietaryFlags } from '../utils/dietaryUtils';
import {
  COMMON_NUTRIENT_TARGETS,
  MEAL_PLANNER_LIVE_TOOLS,
  aggregateDailyNutrients,
  buildMealPlannerEmmaSystemPrompt,
  extractMealPlanActions,
  fetchPublishedRecipesCatalog,
  resolveRecipeFiberGrams,
} from '../utils/emmaRecipeContext';
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

const QUICK_CONCIERGE_PROMPTS = [
  'Suggest 4 delicious recipes from the Vault with links',
  'Fill in Gluten-Free dinners for this week',
  'Plan a high-protein full day of meals for today',
  'Which vitamins or minerals am I low on today?',
];

const MEAL_PLAN_CHAT_COST = 0.05;

export default function MealPlanner() {
  const todayYmd = formatDateYMD(new Date());
  const { user, spendToken, confirmTokenUsage, promptPurchaseTokens } = useAuth();
  const { speechState, handleSpeak } = useEmmaVoice();
  const currentUserName = user?.username || 'Love';
  const mealChatConfirmedRef = useRef(false);
  const [mealChatTokensSpent, setMealChatTokensSpent] = useState(0);

  const [viewMode, setViewMode] = useState('month'); // 'month' | 'week' | 'day'
  const [anchorDate, setAnchorDate] = useState(todayYmd);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Per-recipe detailed nutrition cache (hydrates micros/fiber even before backend upgrade)
  const [recipeDetailsMap, setRecipeDetailsMap] = useState({});
  const requestedRecipeDetailsRef = useRef(new Set());
  const [showAllDailyMicros, setShowAllDailyMicros] = useState(false);

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

  // Emma Meal Planning Concierge state (Text Chat + Live Audio Mode)
  const [conciergeOpen, setConciergeOpen] = useState(true);
  const [conciergeMode, setConciergeMode] = useState('chat'); // 'chat' | 'live'
  const [emmaChatHistory, setEmmaChatHistory] = useState([]);
  const [emmaInput, setEmmaInput] = useState('');
  const emmaInputRef = useRef(null);

  useEffect(() => {
    const el = emmaInputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [emmaInput]);
  const [emmaBusy, setEmmaBusy] = useState(false);
  const [emmaError, setEmmaError] = useState(null);
  const [livePreConfirmed, setLivePreConfirmed] = useState(false);
  const [liveActionLog, setLiveActionLog] = useState([]);
  const [fitnessActivities, setFitnessActivities] = useState([]);

  const entriesRef = useRef(entries);
  entriesRef.current = entries;
  const plannableRecipesRef = useRef(plannableRecipes);
  plannableRecipesRef.current = plannableRecipes;
  const chatScrollRef = useRef(null);

  const visibleRange = useMemo(
    () => getVisibleRange(viewMode, anchorDate),
    [viewMode, anchorDate]
  );

  const ensurePlannableRecipes = useCallback(async (force = false) => {
    if (!force && plannableRecipesRef.current.length > 0) {
      return plannableRecipesRef.current;
    }
    setRecipesLoading(true);
    try {
      const [plannableRes, publicCatalog] = await Promise.allSettled([
        api.getPlannableRecipes(),
        fetchPublishedRecipesCatalog(force),
      ]);

      const rawPlannable =
        plannableRes.status === 'fulfilled' && Array.isArray(plannableRes.value?.recipes)
          ? plannableRes.value.recipes
          : [];
      const rawPublic =
        publicCatalog.status === 'fulfilled' && Array.isArray(publicCatalog.value)
          ? publicCatalog.value
          : [];

      const publicById = new Map(rawPublic.map((r) => [Number(r.id), r]));

      let merged = [];
      if (rawPlannable.length > 0) {
        merged = rawPlannable.map((r) => {
          const pub = publicById.get(Number(r.id));
          const combined = {
            ...pub,
            ...r,
            ingredients:
              Array.isArray(r.ingredients) && r.ingredients.length > 0
                ? r.ingredients
                : pub?.ingredients || [],
          };
          const flags = getRecipeDietaryFlags(combined, { useGlutenHeuristicFallback: true });
          return {
            ...combined,
            isOilFree: flags.oilFree,
            isGlutenFree: flags.glutenFree,
            isSugarFree: flags.sugarFree,
            dietary: flags,
          };
        });
      } else {
        merged = rawPublic.map((pub) => ({
          ...pub,
          id: Number(pub.id),
          isPublic: true,
          isDraft: false,
          isOwn: false,
        }));
      }

      setPlannableRecipes(merged);
      return merged;
    } catch (err) {
      setPickerError(err.message || 'Could not load recipes.');
      return plannableRecipesRef.current;
    } finally {
      setRecipesLoading(false);
    }
  }, []);

  useEffect(() => {
    ensurePlannableRecipes();
  }, [ensurePlannableRecipes]);

  const loadMealPlans = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [res, fitRes] = await Promise.all([
        api.getMealPlans(visibleRange.start, visibleRange.end),
        api.getFitnessActivities(visibleRange.start, visibleRange.end).catch(() => ({ activities: [] })),
      ]);
      setEntries(Array.isArray(res?.entries) ? res.entries : []);
      setFitnessActivities(Array.isArray(fitRes?.activities) ? fitRes.activities : []);
    } catch (err) {
      setError(err.message || 'Could not load your meal plan.');
    } finally {
      setLoading(false);
    }
  }, [visibleRange.start, visibleRange.end]);

  useEffect(() => {
    loadMealPlans();
  }, [loadMealPlans]);

  // Hydrate missing micros/notes/fiber for planned recipes via single-recipe endpoint
  useEffect(() => {
    const missingIds = Array.from(
      new Set(
        entries
          .filter(
            (e) =>
              e.recipeId &&
              (!Array.isArray(e.micros) || e.micros.length === 0) &&
              !recipeDetailsMap[e.recipeId] &&
              !requestedRecipeDetailsRef.current.has(e.recipeId)
          )
          .map((e) => Number(e.recipeId))
      )
    );

    if (missingIds.length === 0) return undefined;

    missingIds.forEach((id) => requestedRecipeDetailsRef.current.add(id));
    let cancelled = false;

    Promise.allSettled(missingIds.map((id) => api.getRecipesById(id))).then((results) => {
      if (cancelled) return;
      const additions = {};
      results.forEach((res, idx) => {
        if (res.status === 'fulfilled' && res.value && !res.value.error) {
          additions[missingIds[idx]] = res.value;
        }
      });
      if (Object.keys(additions).length > 0) {
        setRecipeDetailsMap((prev) => ({ ...prev, ...additions }));
      }
    });

    return () => {
      cancelled = true;
    };
  }, [entries, recipeDetailsMap]);

  useEffect(() => {
    const onMealPlanUpdated = () => {
      loadMealPlans();
    };
    window.addEventListener('veggie-vault:meal-plan-updated', onMealPlanUpdated);
    return () => window.removeEventListener('veggie-vault:meal-plan-updated', onMealPlanUpdated);
  }, [loadMealPlans]);

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [emmaChatHistory, emmaBusy]);

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

    await ensurePlannableRecipes(plannableRecipes.length === 0);
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

  const resolvedDetailsMap = useMemo(() => {
    const merged = {};
    plannableRecipes.forEach((r) => {
      if (r?.id) {
        merged[r.id] = r;
      }
    });
    Object.entries(recipeDetailsMap).forEach(([id, detail]) => {
      merged[id] = { ...(merged[id] || {}), ...detail };
    });
    return merged;
  }, [plannableRecipes, recipeDetailsMap]);

  // Day view & visible range nutrient intake stats
  const dayEntries = useMemo(
    () => entriesByDate[anchorDate] || [],
    [entriesByDate, anchorDate]
  );

  const dayNutritionTotals = useMemo(
    () => aggregateDailyNutrients(dayEntries, resolvedDetailsMap),
    [dayEntries, resolvedDetailsMap]
  );

  const activeNutrientTargets = useMemo(() => {
    const calTarget = Number(user?.calorie_target) > 0 ? Number(user.calorie_target) : 2000;
    const pTarget = Number(user?.protein_target_g) > 0 ? Number(user.protein_target_g) : 50;
    const cTarget = Number(user?.carbs_target_g) > 0 ? Number(user.carbs_target_g) : 275;
    const fTarget = Number(user?.fat_target_g) > 0 ? Number(user.fat_target_g) : 78;
    return {
      calories: { ...COMMON_NUTRIENT_TARGETS.calories, target: calTarget },
      protein: { ...COMMON_NUTRIENT_TARGETS.protein, target: pTarget },
      carbs: { ...COMMON_NUTRIENT_TARGETS.carbs, target: cTarget },
      fat: { ...COMMON_NUTRIENT_TARGETS.fat, target: fTarget },
      fiber: { ...COMMON_NUTRIENT_TARGETS.fiber, target: 28 },
    };
  }, [user?.calorie_target, user?.protein_target_g, user?.carbs_target_g, user?.fat_target_g]);

  const hasCustomWellnessTargets = Boolean(
    Number(user?.calorie_target) > 0 || Number(user?.protein_target_g) > 0
  );

  const nutrientsByDate = useMemo(() => {
    const map = {};
    for (const ymd of visibleRange.days) {
      const list = entriesByDate[ymd] || [];
      if (list.length > 0) {
        map[ymd] = aggregateDailyNutrients(list, resolvedDetailsMap);
      }
    }
    return map;
  }, [visibleRange.days, entriesByDate, resolvedDetailsMap]);

  // Execute meal plan calendar actions requested by Emma (Text Chat OR Live Audio)
  const executeMealPlanActions = useCallback(
    async (actions = []) => {
      if (!Array.isArray(actions) || actions.length === 0) {
        return { appliedCount: 0, summaries: [], errors: [] };
      }

      const catalog =
        plannableRecipesRef.current.length > 0
          ? plannableRecipesRef.current
          : await ensurePlannableRecipes();
      const recipeById = new Map(catalog.map((r) => [Number(r.id), r]));

      const normalizeSlot = (slot) => {
        const s = String(slot || 'dinner').toLowerCase().trim();
        return ['breakfast', 'lunch', 'dinner', 'snack'].includes(s) ? s : 'dinner';
      };

      const isValidYmd = (val) => /^\d{4}-\d{2}-\d{2}$/.test(String(val || '').trim());

      const resolveRecipe = (act) => {
        const numericId = Number(act?.recipe_id);
        if (numericId > 0 && recipeById.has(numericId)) {
          return recipeById.get(numericId);
        }
        const rawTitle = String(act?.recipe_title || act?.title || '').trim().toLowerCase();
        if (rawTitle) {
          return catalog.find((r) => (r.title || '').toLowerCase() === rawTitle) || null;
        }
        return null;
      };

      const summaries = [];
      const errors = [];
      let appliedCount = 0;

      for (const act of actions) {
        const actionType = String(act?.action || '').toLowerCase().trim();

        if (actionType === 'add') {
          const matchedRecipe = resolveRecipe(act);
          const planDate = String(act?.plan_date || '').trim();
          const mealSlot = normalizeSlot(act?.meal_slot);
          const servings = Math.max(0.5, Math.min(20, Number(act?.servings) || 1));
          const notes = String(act?.notes || '').trim().slice(0, 200);

          if (!matchedRecipe || !isValidYmd(planDate)) {
            errors.push(`Skipped invalid add request (recipe_id=${act?.recipe_id}, date=${planDate})`);
            continue;
          }

          try {
            const res = await api.addMealPlanEntry({
              recipe_id: Number(matchedRecipe.id),
              plan_date: planDate,
              meal_slot: mealSlot,
              servings,
              notes,
            });
            if (res?.success) {
              appliedCount += 1;
              const slotMeta = getMealSlotMeta(mealSlot);
              summaries.push(`Added "${matchedRecipe.title}" to ${slotMeta.label} on ${planDate}`);
            } else {
              errors.push(res?.message || `Could not add "${matchedRecipe.title}" on ${planDate}`);
            }
          } catch (err) {
            errors.push(err?.message || `Failed to add "${matchedRecipe.title}"`);
          }
          continue;
        }

        if (actionType === 'update') {
          const entryId = Number(act?.entry_id);
          if (!entryId) {
            errors.push('Skipped update without valid entry_id');
            continue;
          }
          const existing = entriesRef.current.find((e) => Number(e.id) === entryId);
          const payload = {
            id: entryId,
            plan_date: isValidYmd(act?.plan_date) ? act.plan_date.trim() : existing?.planDate,
            meal_slot: act?.meal_slot ? normalizeSlot(act.meal_slot) : existing?.mealSlot || 'dinner',
            servings:
              act?.servings !== undefined
                ? Math.max(0.5, Math.min(20, Number(act.servings) || 1))
                : Number(existing?.servings || 1),
            notes: act?.notes !== undefined ? String(act.notes || '').trim().slice(0, 200) : existing?.notes || '',
          };
          if (act?.recipe_id) {
            const matched = resolveRecipe(act);
            if (matched) payload.recipe_id = Number(matched.id);
          }

          try {
            const res = await api.updateMealPlanEntry(payload);
            if (res?.success) {
              appliedCount += 1;
              summaries.push(`Updated meal #${entryId} (${payload.meal_slot} on ${payload.plan_date})`);
            } else {
              errors.push(res?.message || `Could not update entry #${entryId}`);
            }
          } catch (err) {
            errors.push(err?.message || `Failed to update entry #${entryId}`);
          }
          continue;
        }

        if (actionType === 'remove') {
          const entryId = Number(act?.entry_id);
          if (!entryId) continue;
          const existing = entriesRef.current.find((e) => Number(e.id) === entryId);
          try {
            const res = await api.deleteMealPlanEntry(entryId);
            if (res?.success) {
              appliedCount += 1;
              summaries.push(
                existing
                  ? `Removed "${existing.title}" from ${existing.planDate}`
                  : `Removed meal #${entryId}`
              );
            }
          } catch (err) {
            errors.push(err?.message || `Failed to remove entry #${entryId}`);
          }
          continue;
        }

        if (actionType === 'clear_day') {
          const planDate = String(act?.plan_date || '').trim();
          const slotFilter = act?.meal_slot ? normalizeSlot(act.meal_slot) : null;
          if (!isValidYmd(planDate)) continue;

          let dateEntries = entriesRef.current.filter((e) => e.planDate === planDate);
          if (dateEntries.length === 0) {
            try {
              const res = await api.getMealPlans(planDate, planDate);
              if (Array.isArray(res?.entries)) {
                dateEntries = res.entries;
              }
            } catch {
              dateEntries = [];
            }
          }

          const toDelete = slotFilter
            ? dateEntries.filter((e) => e.mealSlot === slotFilter)
            : dateEntries;

          for (const item of toDelete) {
            try {
              const delRes = await api.deleteMealPlanEntry(item.id);
              if (delRes?.success) {
                appliedCount += 1;
                summaries.push(`Removed "${item.title}" from ${planDate} (${item.mealSlot})`);
              }
            } catch (err) {
              errors.push(err?.message || `Failed to remove "${item.title}"`);
            }
          }
        }
      }

      if (appliedCount > 0) {
        await loadMealPlans();
      }

      return { appliedCount, summaries, errors };
    },
    [ensurePlannableRecipes, loadMealPlans]
  );

  // Live Audio Mode tool-call handler for Gemini BidiGenerateContent
  const handleLiveToolCall = useCallback(
    async (functionCall) => {
      const name = functionCall?.name;
      const args = functionCall?.args || {};

      if (name === 'schedule_meal_plan_entries') {
        const requested = Array.isArray(args.entries) ? args.entries : [];
        const actions = requested.map((e) => ({ action: 'add', ...e }));
        const result = await executeMealPlanActions(actions);
        if (result.summaries.length > 0) {
          setLiveActionLog((prev) => [...result.summaries, ...prev].slice(0, 12));
        }
        return {
          success: result.appliedCount > 0,
          scheduledCount: result.appliedCount,
          details: result.summaries,
          errors: result.errors,
        };
      }

      if (name === 'update_meal_plan_entry') {
        const result = await executeMealPlanActions([{ action: 'update', ...args }]);
        if (result.summaries.length > 0) {
          setLiveActionLog((prev) => [...result.summaries, ...prev].slice(0, 12));
        }
        return {
          success: result.appliedCount > 0,
          updatedCount: result.appliedCount,
          details: result.summaries,
          errors: result.errors,
        };
      }

      if (name === 'remove_meal_plan_entries') {
        const actions = [];
        if (Array.isArray(args.entry_ids)) {
          args.entry_ids.forEach((id) => {
            if (Number(id) > 0) {
              actions.push({ action: 'remove', entry_id: Number(id) });
            }
          });
        }
        if (args.clear_date) {
          actions.push({
            action: 'clear_day',
            plan_date: args.clear_date,
            meal_slot: args.meal_slot || undefined,
          });
        }
        const result = await executeMealPlanActions(actions);
        if (result.summaries.length > 0) {
          setLiveActionLog((prev) => [...result.summaries, ...prev].slice(0, 12));
        }
        return {
          success: result.appliedCount > 0,
          removedCount: result.appliedCount,
          details: result.summaries,
          errors: result.errors,
        };
      }

      return { success: false, message: `Unknown tool: ${name}` };
    },
    [executeMealPlanActions]
  );

  const handleConciergeModeSwitch = async (nextMode) => {
    if (nextMode === conciergeMode) return;
    if (nextMode === 'live') {
      const confirmed = await confirmTokenUsage(
        0.1,
        'Entering Live Audio Mode on your Meal Planner (0.10 Tokens/min)'
      );
      if (!confirmed) return;
      setLivePreConfirmed(true);
    }
    setConciergeMode(nextMode);
  };

  const mealPlannerLiveContext = useMemo(
    () =>
      buildMealPlannerEmmaSystemPrompt({
        userName: currentUserName,
        viewMode,
        visibleRange,
        todayYmd,
        entries,
        plannableRecipes,
        dailyNutrientSummary: dayNutritionTotals,
        focusedDateYmd: anchorDate,
        wellnessProfile: user,
        vocalMode: true,
      }),
    [
      currentUserName,
      viewMode,
      visibleRange,
      todayYmd,
      entries,
      plannableRecipes,
      dayNutritionTotals,
      anchorDate,
      user,
    ]
  );

  const sendConciergeMessage = async (promptText) => {
    const trimmed = String(promptText || '').trim();
    if (!trimmed || emmaBusy) return;

    if (Number(user?.generation_tokens ?? 0) < MEAL_PLAN_CHAT_COST) {
      await promptPurchaseTokens(
        MEAL_PLAN_CHAT_COST,
        'Chatting with Emma on Meal Planner (0.05 Tokens/message)'
      );
      return;
    }

    if (!mealChatConfirmedRef.current) {
      const confirmed = await confirmTokenUsage(
        MEAL_PLAN_CHAT_COST,
        'Chatting with Emma on Meal Planner (0.05 Tokens/message)'
      );
      if (!confirmed) return;
      mealChatConfirmedRef.current = true;
    }

    setEmmaInput('');
    setEmmaError(null);
    setEmmaBusy(true);

    const nextHistory = [
      ...emmaChatHistory,
      { role: 'user', parts: [{ text: trimmed }], displayText: trimmed },
    ];
    setEmmaChatHistory(nextHistory);

    try {
      const activeRecipes = await ensurePlannableRecipes();
      const systemInstructions = buildMealPlannerEmmaSystemPrompt({
        userName: currentUserName,
        viewMode,
        visibleRange,
        todayYmd,
        entries: entriesRef.current,
        plannableRecipes: activeRecipes,
        dailyNutrientSummary: dayNutritionTotals,
        focusedDateYmd: anchorDate,
        wellnessProfile: user,
        vocalMode: false,
      });

      const apiHistory = nextHistory.map(({ role, parts }) => ({ role, parts }));
      const rawReply = await sendChatMessage(apiHistory, systemInstructions);
      const { cleanText, actions } = extractMealPlanActions(rawReply);

      let executionResult = { appliedCount: 0, summaries: [], errors: [] };
      if (actions.length > 0) {
        executionResult = await executeMealPlanActions(actions);
      }

      // Deduct usage-based token cost only after AI call succeeds
      const tokenRes = await spendToken(MEAL_PLAN_CHAT_COST, {
        actionLabel: 'Emma Meal Planner Chat',
        skipConfirm: true,
      });
      if (tokenRes?.success) {
        setMealChatTokensSpent((prev) => Number((prev + MEAL_PLAN_CHAT_COST).toFixed(2)));
      }

      setEmmaChatHistory([
        ...nextHistory,
        {
          role: 'model',
          parts: [{ text: rawReply }],
          displayText:
            cleanText ||
            (executionResult.appliedCount > 0
              ? 'Sorted! I have updated your meal plan calendar.'
              : rawReply),
          appliedActions: executionResult.summaries,
          actionErrors: executionResult.errors,
        },
      ]);
    } catch (err) {
      const errorMsg = err?.message || 'Emma hit a snag connecting to the kitchen. Try again, love.';
      setEmmaError(errorMsg);
      setEmmaChatHistory([
        ...nextHistory,
        {
          role: 'model',
          parts: [{ text: 'Oh dear, my connection to the kitchen sputtered. Could you ask that again, darling?' }],
          displayText: 'Oh dear, my connection to the kitchen sputtered. Could you ask that again, darling?',
        },
      ]);
    } finally {
      setEmmaBusy(false);
    }
  };

  const handleConciergeSubmit = (e) => {
    e.preventDefault();
    sendConciergeMessage(emmaInput);
  };

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
            Schedule any published Masterpiece or your own private draft recipes, track daily calories &amp; common nutrients, or ask Emma to plan your week.
          </p>
        </div>
        <div className="mp-top-header-actions">
          <button
            type="button"
            className={`mp-emma-toggle-btn ${conciergeOpen ? 'active' : ''}`}
            onClick={() => setConciergeOpen((prev) => !prev)}
          >
            👩‍🍳 {conciergeOpen ? 'Hide Emma Concierge' : 'Ask Emma to Plan'}
          </button>
          <button
            type="button"
            className="mp-primary-add-btn"
            onClick={() => openPickerModal(anchorDate, 'dinner')}
          >
            ➕ Add Meal to Plan
          </button>
        </div>
      </div>

      {/* EMMA'S MEAL PLANNING CONCIERGE (CHAT + LIVE AUDIO MODE) */}
      {conciergeOpen && (
        <section className="mp-emma-concierge-card" aria-label="Emma Meal Planning Concierge">
          <div className="mp-emma-header">
            <div className="mp-emma-title-block">
              <span className="mp-emma-avatar" aria-hidden="true">👩‍🍳</span>
              <div>
                <h2>Emma&apos;s Meal Planning Concierge</h2>
                <p>
                  Full access to {plannableRecipes.length} Vault recipes &amp; your calendar — ask for recipe links, nutrition advice, or tell Emma to fill in days!
                </p>
              </div>
            </div>

            <div className="mp-emma-mode-tabs" role="group" aria-label="Emma concierge mode">
              <button
                type="button"
                className={`mp-emma-mode-btn ${conciergeMode === 'chat' ? 'active' : ''}`}
                onClick={() => handleConciergeModeSwitch('chat')}
              >
                💬 Text Chat
              </button>
              <button
                type="button"
                className={`mp-emma-mode-btn live ${conciergeMode === 'live' ? 'active' : ''}`}
                onClick={() => handleConciergeModeSwitch('live')}
                title="Talk live with Emma and let her populate your calendar in real time (0.10 Tokens/min)"
              >
                🎙️ Live Audio Mode (0.10 Tokens/min)
              </button>
            </div>
          </div>

          {conciergeMode === 'chat' ? (
            <>
              <div className="mp-emma-quick-chips">
                {QUICK_CONCIERGE_PROMPTS.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    className="mp-emma-chip-btn"
                    onClick={() => sendConciergeMessage(suggestion)}
                    disabled={emmaBusy}
                  >
                    ✨ {suggestion}
                  </button>
                ))}
              </div>

              {emmaChatHistory.length > 0 && (
                <div className="mp-emma-chat-window" ref={chatScrollRef}>
                  {emmaChatHistory.map((msg, idx) => {
                    if (msg.role === 'user') {
                      return (
                        <div key={idx} className="mp-emma-msg user">
                          <div className="mp-emma-msg-bubble user">
                            <strong>{currentUserName}:</strong> {msg.displayText}
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div key={idx} className="mp-emma-msg model">
                        <div className="mp-emma-msg-bubble model">
                          <div className="mp-emma-msg-top">
                            <strong>Emma</strong>
                            <button
                              type="button"
                              className="mp-emma-speak-btn"
                              onClick={() => handleSpeak(msg.displayText)}
                              title="Listen to Emma"
                            >
                              {speechState === 'playing' ? '⏸️' : '🔊'}
                            </button>
                          </div>
                          <div className="mp-emma-msg-markdown">
                            <EmmaMarkdown>{msg.displayText}</EmmaMarkdown>
                          </div>
                          {Array.isArray(msg.appliedActions) && msg.appliedActions.length > 0 && (
                            <div className="mp-emma-applied-actions">
                              <strong>📅 Calendar Updated:</strong>
                              <ul>
                                {msg.appliedActions.map((line, i) => (
                                  <li key={i}>{line}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {Array.isArray(msg.actionErrors) && msg.actionErrors.length > 0 && (
                            <div className="mp-emma-action-warnings">
                              {msg.actionErrors.map((errLine, i) => (
                                <div key={i}>⚠️ {errLine}</div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {emmaBusy && (
                    <div className="mp-emma-msg model">
                      <div className="mp-emma-msg-bubble model typing">
                        Emma is checking the Vault recipes and your calendar...
                      </div>
                    </div>
                  )}
                </div>
              )}

              {emmaError && (
                <div className="mp-error-banner" role="alert">
                  {emmaError}
                </div>
              )}

              <form className="mp-emma-chat-form" onSubmit={handleConciergeSubmit}>
                <textarea
                  ref={emmaInputRef}
                  rows={1}
                  value={emmaInput}
                  onChange={(e) => setEmmaInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      if (!emmaBusy && emmaInput.trim()) {
                        handleConciergeSubmit(e);
                      }
                    }
                  }}
                  placeholder="E.g., Fill in Mon–Fri dinners with Gluten-Free meals, or show me iron-rich recipe links..."
                  className="mp-emma-chat-input"
                  disabled={emmaBusy}
                />
                <VoiceDictationButton
                  value={emmaInput}
                  onChange={setEmmaInput}
                  disabled={emmaBusy}
                />
                <button
                  type="submit"
                  className="mp-emma-send-btn"
                  disabled={emmaBusy || !emmaInput.trim()}
                >
                  {emmaBusy ? 'Planning...' : 'Ask Emma'}
                </button>
              </form>
              <div className="mp-emma-usage-note" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.78rem', color: '#64748b', marginTop: '0.45rem', flexWrap: 'wrap', gap: '0.4rem' }}>
                <span>🪙 Usage-based: <strong>0.05 Tokens</strong> per message (20 messages = 1 Token)</span>
                {mealChatTokensSpent > 0 && (
                  <span style={{ fontWeight: 700, color: '#047857' }}>
                    Session used: {mealChatTokensSpent.toFixed(2)} tokens
                  </span>
                )}
              </div>
            </>
          ) : (
            <div className="mp-emma-live-container">
              <p className="mp-emma-live-hint">
                Speak naturally — ask Emma to suggest recipes from The Veggie Vault or tell her to fill in specific days and meal slots on your calendar while you talk!
              </p>
              <LiveChat
                mealPlanContext={mealPlannerLiveContext}
                tools={MEAL_PLANNER_LIVE_TOOLS}
                onToolCall={handleLiveToolCall}
                preConfirmed={livePreConfirmed}
              />
              {liveActionLog.length > 0 && (
                <div className="mp-emma-applied-actions">
                  <strong>📅 Live Calendar Updates:</strong>
                  <ul>
                    {liveActionLog.map((item, idx) => (
                      <li key={idx}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </section>
      )}

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
                  const dayStats = nutrientsByDate[ymd];
                  const visibleMeals = dayMeals.slice(0, 3);
                  const hiddenCount = dayMeals.length - visibleMeals.length;

                  return (
                    <div
                      key={ymd}
                      className={`mp-month-cell ${isToday ? 'is-today' : ''} ${isOutside ? 'is-outside' : ''}`}
                    >
                      <div className="mp-month-cell-top">
                        <div className="mp-month-cell-left">
                          <button
                            type="button"
                            className="mp-month-day-num"
                            onClick={() => {
                              setAnchorDate(ymd);
                              setViewMode('day');
                            }}
                            title="Open Day View & Daily Nutrients"
                          >
                            {dt.getDate()}
                          </button>
                          {dayStats?.calories > 0 && (
                            <span className="mp-month-kcal-pill" title={`Fiber: ${dayStats.fiber}g • Protein: ${dayStats.protein}g`}>
                              {dayStats.calories} kcal
                            </span>
                          )}
                        </div>
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
                const dayStats = nutrientsByDate[ymd];

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

                    {dayStats && dayStats.totalMeals > 0 && (
                      <div className="mp-week-nutrition-box">
                        <div className="mp-week-cals-bar">🔥 {dayStats.calories} kcal planned</div>
                        <div className="mp-week-macro-mini">
                          <span>💪 {Math.round(dayStats.protein)}g P</span>
                          <span>🥖 {Math.round(dayStats.carbs)}g C</span>
                          <span>🥑 {Math.round(dayStats.fat)}g F</span>
                          <span>🌾 {Math.round(dayStats.fiber)}g Fiber</span>
                        </div>
                        {dayStats.micros.length > 0 && (
                          <div className="mp-week-micro-pills">
                            {dayStats.micros.slice(0, 3).map((m) => (
                              <span key={m.key} title={`${m.name}: ${m.amount}${m.unit}`}>
                                {m.name}: {m.dvPercent}%
                              </span>
                            ))}
                          </div>
                        )}
                        <button
                          type="button"
                          className="mp-week-nutrients-link"
                          onClick={() => {
                            setAnchorDate(ymd);
                            setViewMode('day');
                          }}
                        >
                          View Daily Nutrients &rarr;
                        </button>
                      </div>
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
              <div className="mp-nutrition-dashboard">
                <div className="mp-day-summary-bar">
                  <div className="mp-day-summary-count">
                    <strong>{dayEntries.length}</strong>{' '}
                    {dayEntries.length === 1 ? 'Meal Planned' : 'Meals Planned'}
                  </div>
                  <div className="mp-day-summary-kcal-badge">
                    🔥 {dayNutritionTotals.calories} kcal Daily Total
                  </div>
                </div>

                {dayEntries.length > 0 && (
                  <>
                    <div className="mp-macro-targets-meta">
                      {hasCustomWellnessTargets ? (
                        <span className="mp-targets-badge custom">
                          🎯 Using your personalized targets from your <Link to="/wellness">Wellness Profile</Link>
                        </span>
                      ) : (
                        <span className="mp-targets-badge default">
                          ℹ️ Standard 2,000 kcal targets. <Link to="/wellness">Set custom targets in Wellness Tools</Link> to tailor daily goals &amp; Emma.
                        </span>
                      )}
                    </div>

                    <div className="mp-macro-cards-grid">
                      {Object.values(activeNutrientTargets).map((spec) => {
                        const val = Number(dayNutritionTotals[spec.key] || 0);
                        const pct = spec.target > 0 ? Math.round((val / spec.target) * 100) : 0;
                        const fillWidth = Math.min(100, pct);
                        return (
                          <div key={spec.key} className="mp-macro-stat-card">
                            <div className="mp-macro-card-top">
                              <span>{spec.icon} {spec.label}</span>
                              <span className="mp-dv-pill">{pct}% DV</span>
                            </div>
                            <div className="mp-macro-card-val">
                              <strong>{val}</strong> {spec.unit}
                            </div>
                            <div className="mp-progress-track">
                              <div
                                className={`mp-progress-fill ${pct >= 80 ? 'high' : pct >= 40 ? 'mid' : ''}`}
                                style={{ width: `${fillWidth}%` }}
                              />
                            </div>
                            <span className="mp-target-sub">Target: {spec.target} {spec.unit}</span>
                          </div>
                        );
                      })}
                    </div>

                    <div className="mp-micro-intake-section">
                      <div className="mp-micro-intake-header">
                        <h3>🧬 Daily Intake of Common Nutrients</h3>
                        {dayNutritionTotals.micros.length > 8 && (
                          <button
                            type="button"
                            className="mp-micro-expand-btn"
                            onClick={() => setShowAllDailyMicros((prev) => !prev)}
                          >
                            {showAllDailyMicros
                              ? 'Show Top 8 Nutrients'
                              : `Show All ${dayNutritionTotals.micros.length} Nutrients`}
                          </button>
                        )}
                      </div>

                      {dayNutritionTotals.micros.length === 0 ? (
                        <p className="mp-micro-empty-note">
                          No detailed micronutrient entries found on today&apos;s scheduled recipes yet. Recipes with Masterpiece Nutrition Deep Dive will automatically populate vitamins &amp; minerals here.
                        </p>
                      ) : (
                        <div className="mp-micro-grid">
                          {(showAllDailyMicros
                            ? dayNutritionTotals.micros
                            : dayNutritionTotals.micros.slice(0, 8)
                          ).map((micro) => (
                            <div key={micro.key} className="mp-micro-card">
                              <div className="mp-micro-card-top">
                                <strong>{micro.name}</strong>
                                <span
                                  className={`mp-micro-dv-badge ${
                                    micro.dvPercent >= 75
                                      ? 'great'
                                      : micro.dvPercent >= 35
                                        ? 'good'
                                        : 'low'
                                  }`}
                                >
                                  {micro.dvPercent}% DV
                                </span>
                              </div>
                              <div className="mp-micro-amount">
                                {micro.amount} {micro.unit}
                                {micro.dvTarget ? ` / ${micro.dvTarget} ${micro.unit}` : ''}
                              </div>
                              <div className="mp-progress-track">
                                <div
                                  className={`mp-progress-fill ${
                                    micro.dvPercent >= 75 ? 'high' : micro.dvPercent >= 35 ? 'mid' : ''
                                  }`}
                                  style={{ width: `${Math.min(100, micro.dvPercent)}%` }}
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>

              <FitnessTrackerPanel
                selectedDate={anchorDate}
                activities={fitnessActivities}
                onActivityAdded={(act) => setFitnessActivities((prev) => [...prev, act])}
                onActivityDeleted={(id) =>
                  setFitnessActivities((prev) => prev.filter((a) => a.id !== id))
                }
                dailyIntakeCalories={dayNutritionTotals.calories}
              />

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
                          {slotMeals.map((meal) => {
                            const detail = resolvedDetailsMap[meal.recipeId] || null;
                            const mealCalories = meal.calories ?? detail?.macros?.calories ?? 0;
                            const mealProtein = meal.protein_g ?? detail?.macros?.protein_g ?? 0;
                            const mealCarbs = meal.carbs_g ?? detail?.macros?.carbs_g ?? 0;
                            const mealFat = meal.fat_g ?? detail?.macros?.fat_g ?? 0;
                            const mealFiber = resolveRecipeFiberGrams(meal, detail);
                            return (
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
                                    {(mealCalories > 0 || mealFiber > 0) ? (
                                      <span>
                                        {mealCalories ? `🔥 ${mealCalories} kcal • 💪 ${mealProtein}g P • 🥖 ${mealCarbs}g C • 🥑 ${mealFat}g F • ` : ''}
                                        🌾 {mealFiber}g Fiber
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
                            );
                          })}
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
