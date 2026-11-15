import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import './TDEECalculator.css';

// ============================================================================
// COMPONENT: TDEECalculator
// PURPOSE: Calculates Basal Metabolic Rate (BMR) and Total Daily Energy 
// Expenditure (TDEE) using the Mifflin-St Jeor equation, and saves caloric goals.
// ============================================================================
const TDEECalculator = ({
  heightFt: propHeightFt,
  setHeightFt: propSetHeightFt,
  heightIn: propHeightIn,
  setHeightIn: propSetHeightIn,
  weightLbs: propWeightLbs,
  setWeightLbs: propSetWeightLbs,
  onApplyCalories,
}) => {
  const { user, updateUser } = useAuth();

  // Local state fallbacks if not controlled by parent
  const [localHeightFt, setLocalHeightFt] = useState(() => (user?.height_ft ? String(user.height_ft) : ''));
  const [localHeightIn, setLocalHeightIn] = useState(() => (user?.height_in !== null && user?.height_in !== undefined ? String(user.height_in) : ''));
  const [localWeightLbs, setLocalWeightLbs] = useState(() => (user?.weight_lbs ? String(user.weight_lbs) : ''));

  const heightFt = propHeightFt !== undefined ? propHeightFt : localHeightFt;
  const setHeightFt = propSetHeightFt || setLocalHeightFt;
  const heightIn = propHeightIn !== undefined ? propHeightIn : localHeightIn;
  const setHeightIn = propSetHeightIn || setLocalHeightIn;
  const weightLbs = propWeightLbs !== undefined ? propWeightLbs : localWeightLbs;
  const setWeightLbs = propSetWeightLbs || setLocalWeightLbs;

  const [age, setAge] = useState(() => (user?.age ? String(user.age) : ''));
  const [gender, setGender] = useState(() => user?.gender || 'male');
  const [activityLevel, setActivityLevel] = useState(() => user?.activity_level || '');

  const [results, setResults] = useState(null);
  const [selectedGoalKey, setSelectedGoalKey] = useState('maintain'); // 'maintain' | 'mildLoss' | 'weightLoss' | 'mildGain'
  const [showDetails, setShowDetails] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveFeedback, setSaveFeedback] = useState(null);

  // Sync inputs from user profile on initial load if local fields are empty
  useEffect(() => {
    if (user) {
      if (!age && user.age) setAge(String(user.age));
      if (!gender && user.gender) setGender(user.gender);
      if (!activityLevel && user.activity_level) setActivityLevel(user.activity_level);
      if (!heightFt && user.height_ft) setHeightFt(String(user.height_ft));
      if (!heightIn && user.height_in !== null && user.height_in !== undefined) setHeightIn(String(user.height_in));
      if (!weightLbs && user.weight_lbs) setWeightLbs(String(user.weight_lbs));
    }
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  // --- THE CALCULATION ENGINE ---
  useEffect(() => {
    const a = parseFloat(age);
    const ft = parseFloat(heightFt);
    const inc = parseFloat(heightIn) || 0;
    const lbs = parseFloat(weightLbs);
    const activity = parseFloat(activityLevel);

    if (a > 0 && ft > 0 && lbs > 0 && activity > 0) {
      const heightCm = ((ft * 12) + inc) * 2.54;
      const weightKg = lbs * 0.453592;

      let bmr = (10 * weightKg) + (6.25 * heightCm) - (5 * a);
      if (gender === 'male') {
        bmr += 5;
      } else {
        bmr -= 161;
      }

      const tdee = bmr * activity;
      const computedResults = {
        bmr: Math.round(bmr),
        maintain: Math.round(tdee),
        mildLoss: Math.round(tdee - 250),
        weightLoss: Math.round(tdee - 500),
        mildGain: Math.round(tdee + 250),
      };
      setResults(computedResults);

      // If user had a previously saved calorie target, match the closest goal
      if (user?.calorie_target) {
        const target = Number(user.calorie_target);
        if (Math.abs(target - computedResults.weightLoss) < 50) {
          setSelectedGoalKey('weightLoss');
        } else if (Math.abs(target - computedResults.mildLoss) < 50) {
          setSelectedGoalKey('mildLoss');
        } else if (Math.abs(target - computedResults.mildGain) < 50) {
          setSelectedGoalKey('mildGain');
        } else {
          setSelectedGoalKey('maintain');
        }
      }
    } else {
      setResults(null);
    }
  }, [age, gender, heightFt, heightIn, weightLbs, activityLevel]); // eslint-disable-line react-hooks/exhaustive-deps

  const getSelectedCalorieTarget = () => {
    if (!results) return 0;
    return results[selectedGoalKey] || results.maintain;
  };

  const handleSaveToProfile = async () => {
    if (!user || !results) return;

    const chosenTarget = getSelectedCalorieTarget();
    setSaving(true);
    setSaveFeedback(null);

    try {
      const res = await api.updateUserWellness({
        age: parseInt(age, 10),
        gender,
        height_ft: parseInt(heightFt, 10),
        height_in: parseFloat(heightIn) || 0,
        weight_lbs: parseFloat(weightLbs),
        activity_level: activityLevel,
        bmr: results.bmr,
        tdee: results.maintain,
        calorie_target: chosenTarget,
      });

      if (res?.success) {
        if (res.user) {
          updateUser(res.user);
        }
        setSaveFeedback({
          type: 'success',
          text: `✓ Target of ${chosenTarget.toLocaleString()} kcal/day saved! Emma & Meal Planner updated.`,
        });
      } else {
        setSaveFeedback({ type: 'error', text: res?.message || 'Failed to save caloric needs.' });
      }
    } catch (err) {
      setSaveFeedback({ type: 'error', text: err.message || 'Error saving to profile.' });
    } finally {
      setSaving(false);
    }
  };

  const handleApplyToMacro = () => {
    const chosenTarget = getSelectedCalorieTarget();
    if (onApplyCalories) {
      onApplyCalories(chosenTarget);
    }
    const macroElement = document.getElementById('macro-planner-section');
    if (macroElement) {
      macroElement.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const currentSavedMatches =
    Boolean(user?.calorie_target) &&
    Number(user?.calorie_target) === getSelectedCalorieTarget();

  return (
    <div className="calculator-wrapper">
      {/* Header Section */}
      <div className="calc-header header-purple">
        <div className="calc-title-group">
          <h2 className="calc-main-title">2. Caloric Needs (TDEE)</h2>
          <p className="calc-subtitle">
            Discover your body&apos;s daily energy needs to tailor your nutrition.
          </p>
        </div>
        <button
          onClick={() => setShowDetails(!showDetails)}
          className="details-toggle-btn btn-purple"
          type="button"
        >
          {showDetails ? 'Hide Details ▲' : 'How it Works ▼'}
        </button>
      </div>

      {/* Educational Dropdown */}
      {showDetails && (
        <div className="edu-dropdown dropdown-purple animate-fade-in">
          <h4 className="edu-label">The Engine Under the Hood:</h4>
          <p className="edu-text">
            We use the <strong>Mifflin-St Jeor equation</strong>, widely considered the gold standard for calculating Basal Metabolic Rate (BMR) in clinical settings.
          </p>
          <h4 className="edu-label">Example Calculation:</h4>
          <p className="edu-text">
            If our 5&apos;10&quot;, 150 lb runner is a 35-year-old male:
            <span className="step-list">
              <span><strong>1.</strong> The equation finds his BMR (calories burned just staying alive) is roughly <strong>1,643 calories</strong>.</span>
              <span><strong>2.</strong> If he runs 4 days a week (Moderately Active multiplier of 1.55): 1,643 × 1.55 = <strong>2,546 calories/day</strong>.</span>
              <span><strong>3.</strong> That final number is his TDEE. Eating exactly that amount will maintain his 150 lb frame.</span>
            </span>
          </p>
        </div>
      )}

      {/* Input Form */}
      <div className="input-grid">
        <div className="input-row">
          <div className="input-group">
            <label className="input-label">Age</label>
            <input
              type="number"
              className="styled-input"
              placeholder="35"
              value={age}
              onChange={(e) => setAge(e.target.value)}
            />
          </div>
          <div className="input-group">
            <label className="input-label">Gender</label>
            <select
              className="styled-select"
              value={gender}
              onChange={(e) => setGender(e.target.value)}
            >
              <option value="male">Male</option>
              <option value="female">Female</option>
            </select>
          </div>
        </div>

        <div className="input-row">
          <div className="input-group">
            <label className="input-label">Height (ft)</label>
            <input
              type="number"
              className="styled-input"
              placeholder="5"
              value={heightFt}
              onChange={(e) => setHeightFt(e.target.value)}
            />
          </div>
          <div className="input-group">
            <label className="input-label">Height (in)</label>
            <input
              type="number"
              className="styled-input"
              placeholder="10"
              min="0"
              max="11"
              value={heightIn}
              onChange={(e) => setHeightIn(e.target.value)}
            />
          </div>
        </div>

        <div className="input-group">
          <label className="input-label">Weight (lbs)</label>
          <input
            type="number"
            className="styled-input"
            placeholder="150"
            value={weightLbs}
            onChange={(e) => setWeightLbs(e.target.value)}
          />
        </div>

        <div className="input-group">
          <label className="input-label">Activity Level</label>
          <select
            className="styled-select"
            value={activityLevel}
            onChange={(e) => setActivityLevel(e.target.value)}
          >
            <option value="">-- Select an Option --</option>
            <option value="1.2">Sedentary (Little/no exercise)</option>
            <option value="1.375">Lightly Active (1-3 days/wk)</option>
            <option value="1.55">Moderately Active (3-5 days/wk)</option>
            <option value="1.725">Very Active (6-7 days/wk)</option>
            <option value="1.9">Extra Active (Very physical)</option>
          </select>
        </div>
      </div>

      {/* Auto-Render Results */}
      {results && (
        <div className="results-container container-purple shadow-inner">
          <div className="results-split-grid">
            <div className="results-main-column">
              <div
                className={`goal-card selectable ${selectedGoalKey === 'maintain' ? 'selected' : ''}`}
                style={{ textAlign: 'center', display: 'block', marginBottom: '0.5rem' }}
                onClick={() => setSelectedGoalKey('maintain')}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && setSelectedGoalKey('maintain')}
              >
                <div className="results-label">
                  <input
                    type="radio"
                    name="tdee-target"
                    checked={selectedGoalKey === 'maintain'}
                    onChange={() => setSelectedGoalKey('maintain')}
                    className="goal-card-radio"
                  />
                  To Maintain Weight (TDEE)
                </div>
                <div className="results-value value-purple">{results.maintain}</div>
                <div className="results-unit">Calories / Day</div>
              </div>

              <div className="results-footer">
                <div className="footer-label">Basal Metabolic Rate (BMR)</div>
                <div className="footer-value">{results.bmr} calories</div>
              </div>
            </div>

            <div className="results-goals-column">
              <h4 className="goals-title">Adjusted Goals (Select One)</h4>

              <div
                className={`goal-card selectable ${selectedGoalKey === 'weightLoss' ? 'selected' : ''}`}
                onClick={() => setSelectedGoalKey('weightLoss')}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && setSelectedGoalKey('weightLoss')}
              >
                <span className="goal-label">
                  <input
                    type="radio"
                    name="tdee-target"
                    checked={selectedGoalKey === 'weightLoss'}
                    onChange={() => setSelectedGoalKey('weightLoss')}
                    className="goal-card-radio"
                  />
                  Weight Loss (-500 cal / 1 lb/wk)
                </span>
                <span className="goal-value">{results.weightLoss} cal</span>
              </div>

              <div
                className={`goal-card selectable ${selectedGoalKey === 'mildLoss' ? 'selected' : ''}`}
                onClick={() => setSelectedGoalKey('mildLoss')}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && setSelectedGoalKey('mildLoss')}
              >
                <span className="goal-label">
                  <input
                    type="radio"
                    name="tdee-target"
                    checked={selectedGoalKey === 'mildLoss'}
                    onChange={() => setSelectedGoalKey('mildLoss')}
                    className="goal-card-radio"
                  />
                  Mild Loss (-250 cal / 0.5 lb/wk)
                </span>
                <span className="goal-value">{results.mildLoss} cal</span>
              </div>

              <div
                className={`goal-card selectable ${selectedGoalKey === 'mildGain' ? 'selected' : ''}`}
                onClick={() => setSelectedGoalKey('mildGain')}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && setSelectedGoalKey('mildGain')}
              >
                <span className="goal-label">
                  <input
                    type="radio"
                    name="tdee-target"
                    checked={selectedGoalKey === 'mildGain'}
                    onChange={() => setSelectedGoalKey('mildGain')}
                    className="goal-card-radio"
                  />
                  Mild Gain (+250 cal / 0.5 lb/wk)
                </span>
                <span className="goal-value">{results.mildGain} cal</span>
              </div>
            </div>
          </div>

          <div className="calc-save-action-bar">
            {user ? (
              <>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={handleSaveToProfile}
                    disabled={saving}
                    className="calc-save-btn btn-tdee"
                  >
                    {saving
                      ? 'Saving...'
                      : currentSavedMatches
                        ? '✓ Target Saved in Profile'
                        : `💾 Save Target (${getSelectedCalorieTarget().toLocaleString()} kcal)`}
                  </button>

                  <button
                    type="button"
                    onClick={handleApplyToMacro}
                    className="calc-secondary-action-btn"
                  >
                    🎯 Use in Macro Planner ↓
                  </button>
                </div>

                {saveFeedback && (
                  <span className={`calc-save-msg ${saveFeedback.type}`}>
                    {saveFeedback.text}
                  </span>
                )}
                {!saveFeedback && currentSavedMatches && (
                  <span className="calc-save-msg synced">
                    ✓ Active in Meal Planning
                  </span>
                )}
              </>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <span className="calc-guest-prompt">
                  💡 <Link to="/login">Log in</Link> to save your calorie needs and link them to Emma!
                </span>
                <button
                  type="button"
                  onClick={handleApplyToMacro}
                  className="calc-secondary-action-btn"
                >
                  🎯 Use in Macro Planner Below ↓
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default TDEECalculator;
