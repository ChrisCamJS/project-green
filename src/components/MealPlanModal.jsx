import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { navigateToLogin } from '../utils/authRedirect';
import {
  MEAL_SLOTS,
  formatDateYMD,
  addDaysYMD,
  getMealSlotMeta,
  resolveRecipeImageUrl,
} from '../utils/mealPlanUtils';
import './MealPlanModal.css';

const MealPlanModal = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [modalState, setModalState] = useState(null); // { recipe, onSaved }
  const [planDate, setPlanDate] = useState(() => formatDateYMD(new Date()));
  const [mealSlot, setMealSlot] = useState('dinner');
  const [servings, setServings] = useState(1);
  const [notes, setNotes] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState(null);

  useEffect(() => {
    const handleOpen = (e) => {
      const detail = e.detail || {};
      const recipe = detail.recipe;
      if (!recipe || !recipe.id) return;

      if (!user) {
        navigateToLogin(navigate);
        return;
      }

      const todayStr = formatDateYMD(new Date());
      setPlanDate(detail.defaultDate || todayStr);
      setMealSlot(detail.defaultSlot || 'dinner');
      setServings(1);
      setNotes('');
      setFeedback(null);
      setModalState({
        recipe,
        onSaved: detail.onSaved || null,
      });
    };

    window.addEventListener('veggie-vault:open-meal-plan', handleOpen);
    return () => window.removeEventListener('veggie-vault:open-meal-plan', handleOpen);
  }, [user, navigate]);

  if (!modalState?.recipe) return null;

  const { recipe, onSaved } = modalState;
  const todayStr = formatDateYMD(new Date());
  const quickDates = [
    { label: 'Today', value: todayStr },
    { label: 'Tomorrow', value: addDaysYMD(todayStr, 1) },
    { label: '+2 Days', value: addDaysYMD(todayStr, 2) },
    { label: '+3 Days', value: addDaysYMD(todayStr, 3) },
  ];

  const isDraft = Boolean(recipe.isDraft || recipe.is_draft || recipe.is_public === 0 || recipe.is_public === false);
  const imgSrc = resolveRecipeImageUrl(recipe);

  const handleClose = () => {
    setModalState(null);
    setFeedback(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!planDate) return;
    setIsSaving(true);
    setFeedback(null);

    try {
      const res = await api.addMealPlanEntry({
        recipe_id: recipe.id,
        plan_date: planDate,
        meal_slot: mealSlot,
        servings: Number(servings) || 1,
        notes: notes.trim(),
      });

      if (res?.success) {
        const slotMeta = getMealSlotMeta(mealSlot);
        setFeedback({
          type: 'success',
          text: `Added "${recipe.title}" to ${planDate} (${slotMeta.icon} ${slotMeta.label})!`,
        });
        window.dispatchEvent(
          new CustomEvent('veggie-vault:meal-plan-updated', { detail: res.entry })
        );
        if (typeof onSaved === 'function') {
          onSaved(res.entry);
        }
      } else {
        setFeedback({
          type: 'error',
          text: res?.message || 'Could not add recipe to meal plan.',
        });
      }
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err.message || 'Could not save to meal plan.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      className="meal-plan-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="meal-plan-modal-title"
      onClick={handleClose}
    >
      <div className="meal-plan-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="meal-plan-modal-header">
          <h3 id="meal-plan-modal-title">📅 Add to Meal Plan</h3>
          <button
            type="button"
            className="meal-plan-modal-close"
            onClick={handleClose}
            aria-label="Close meal plan modal"
          >
            ✕
          </button>
        </div>

        <div className="meal-plan-recipe-preview">
          <img
            src={imgSrc}
            alt={recipe.title}
            className="meal-plan-preview-img"
            onError={(e) => {
              e.currentTarget.src = '/og-vault-preview.jpeg';
            }}
          />
          <div className="meal-plan-preview-info">
            <span className={`meal-plan-status-pill ${isDraft ? 'draft' : 'published'}`}>
              {isDraft ? '🔒 My Private Draft' : '🌟 Published Recipe'}
            </span>
            <h4>{recipe.title}</h4>
          </div>
        </div>

        {feedback && (
          <div className={`meal-plan-feedback meal-plan-feedback-${feedback.type}`} role="status">
            <p>{feedback.text}</p>
            {feedback.type === 'success' && (
              <div className="meal-plan-success-links">
                <button
                  type="button"
                  className="meal-plan-go-btn"
                  onClick={() => {
                    handleClose();
                    navigate('/meal-planner');
                  }}
                >
                  Open Meal Planner Calendar &rarr;
                </button>
              </div>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit} className="meal-plan-modal-form">
          <div className="meal-plan-field">
            <label htmlFor="mp-date-input">Select Date</label>
            <div className="meal-plan-quick-dates">
              {quickDates.map((qd) => (
                <button
                  key={qd.value}
                  type="button"
                  className={`meal-plan-chip ${planDate === qd.value ? 'active' : ''}`}
                  onClick={() => setPlanDate(qd.value)}
                >
                  {qd.label}
                </button>
              ))}
            </div>
            <input
              id="mp-date-input"
              type="date"
              value={planDate}
              onChange={(e) => setPlanDate(e.target.value)}
              required
            />
          </div>

          <div className="meal-plan-field">
            <span className="meal-plan-label">Meal Slot</span>
            <div className="meal-plan-slot-pills">
              {MEAL_SLOTS.map((slot) => (
                <button
                  key={slot.id}
                  type="button"
                  className={`meal-plan-slot-pill ${mealSlot === slot.id ? 'active' : ''}`}
                  onClick={() => setMealSlot(slot.id)}
                >
                  <span>{slot.icon}</span>
                  <span>{slot.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="meal-plan-row-2">
            <div className="meal-plan-field">
              <label htmlFor="mp-servings-input">Servings</label>
              <input
                id="mp-servings-input"
                type="number"
                min="0.25"
                max="20"
                step="0.25"
                value={servings}
                onChange={(e) => setServings(e.target.value)}
              />
            </div>
            <div className="meal-plan-field meal-plan-notes-field">
              <label htmlFor="mp-notes-input">Notes (Optional)</label>
              <input
                id="mp-notes-input"
                type="text"
                maxLength={200}
                placeholder="E.g., Prep double batch for leftovers"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>

          <div className="meal-plan-modal-actions">
            <button type="button" className="meal-plan-cancel-btn" onClick={handleClose}>
              {feedback?.type === 'success' ? 'Done' : 'Cancel'}
            </button>
            <button type="submit" className="meal-plan-save-btn" disabled={isSaving}>
              {isSaving
                ? 'Saving...'
                : feedback?.type === 'success'
                  ? '📅 Add Another Day'
                  : '📅 Add to Meal Plan'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default MealPlanModal;
