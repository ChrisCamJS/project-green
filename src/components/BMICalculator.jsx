import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import './BMICalculator.css';

// ============================================================================
// COMPONENT: BMICalculator
// PURPOSE: A dynamic, real-time Body Mass Index calculator.
// Allows saving height, weight, and BMI into user profile for meal planning.
// ============================================================================
const BMICalculator = ({
  heightFt: propHeightFt,
  setHeightFt: propSetHeightFt,
  heightIn: propHeightIn,
  setHeightIn: propSetHeightIn,
  weightLbs: propWeightLbs,
  setWeightLbs: propSetWeightLbs,
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

  const [bmi, setBmi] = useState(null);
  const [category, setCategory] = useState('');
  const [showDetails, setShowDetails] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveFeedback, setSaveFeedback] = useState(null);

  // Sync inputs from user profile on initial load if inputs are blank
  useEffect(() => {
    if (user) {
      if (!heightFt && user.height_ft) setHeightFt(String(user.height_ft));
      if (!heightIn && user.height_in !== null && user.height_in !== undefined) setHeightIn(String(user.height_in));
      if (!weightLbs && user.weight_lbs) setWeightLbs(String(user.weight_lbs));
    }
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  // --- THE MATH ENGINE ---
  useEffect(() => {
    const ft = parseFloat(heightFt);
    const inc = parseFloat(heightIn) || 0;
    const lbs = parseFloat(weightLbs);

    if (ft > 0 && lbs > 0) {
      const totalInches = (ft * 12) + inc;
      const calculatedBmi = (lbs / (totalInches * totalInches)) * 703;
      const finalBmi = calculatedBmi.toFixed(1);
      setBmi(finalBmi);

      if (finalBmi < 18.5) {
        setCategory('Underweight');
      } else if (finalBmi >= 18.5 && finalBmi <= 24.9) {
        setCategory('Healthy Weight');
      } else if (finalBmi >= 25 && finalBmi <= 29.9) {
        setCategory('Overweight');
      } else {
        setCategory('Obesity');
      }
    } else {
      setBmi(null);
      setCategory('');
    }
  }, [heightFt, heightIn, weightLbs]);

  const handleSaveToProfile = async () => {
    if (!user || !bmi) return;
    const ft = parseInt(heightFt, 10);
    const inc = parseFloat(heightIn) || 0;
    const lbs = parseFloat(weightLbs);
    const calculatedBmi = parseFloat(bmi);

    setSaving(true);
    setSaveFeedback(null);
    try {
      const res = await api.updateUserWellness({
        height_ft: ft,
        height_in: inc,
        weight_lbs: lbs,
        bmi: calculatedBmi,
      });

      if (res?.success) {
        if (res.user) {
          updateUser(res.user);
        }
        setSaveFeedback({ type: 'success', text: '✓ BMI & body measurements saved to your profile!' });
      } else {
        setSaveFeedback({ type: 'error', text: res?.message || 'Failed to save BMI.' });
      }
    } catch (err) {
      setSaveFeedback({ type: 'error', text: err.message || 'Error saving to profile.' });
    } finally {
      setSaving(false);
    }
  };

  const isCurrentSaved =
    Boolean(user?.bmi) &&
    Number(user?.bmi) === Number(bmi) &&
    Number(user?.height_ft) === Number(heightFt) &&
    Number(user?.weight_lbs) === Number(weightLbs);

  return (
    <div className="calculator-wrapper">
      {/* Header Section */}
      <div className="calc-header">
        <div className="calc-title-group">
          <h2 className="calc-main-title">1. Body Composition (BMI)</h2>
          <p className="calc-subtitle">
            Enter your height and weight to calculate your Body Mass Index.
          </p>
        </div>
        <button
          onClick={() => setShowDetails(!showDetails)}
          className="details-toggle-btn"
          type="button"
        >
          {showDetails ? 'Hide Details ▲' : 'How it Works ▼'}
        </button>
      </div>

      {/* Educational Dropdown */}
      {showDetails && (
        <div className="edu-dropdown animate-fade-in">
          <h4 className="edu-label">The Formula:</h4>
          <code className="edu-formula">
            BMI = (Weight in lbs / (Height in inches × Height in inches)) × 703
          </code>
          <h4 className="edu-label">Example Calculation:</h4>
          <p className="edu-text">
            For example, if an active runner is <strong>5 foot 10 inches</strong> (70 total inches) and weighs <strong>150 lbs</strong>:
            <span className="step-list">
              <span><strong>1.</strong> Multiply height in inches by itself: (70 × 70) = 4,900</span>
              <span><strong>2.</strong> Divide weight by that number: (150 / 4,900) = 0.0306</span>
              <span><strong>3.</strong> Multiply by the conversion factor: (0.0306 × 703) = <strong className="highlight-success">21.5 (Healthy Weight)</strong></span>
            </span>
          </p>
        </div>
      )}

      {/* Input Form */}
      <div className="input-grid">
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
      </div>

      {/* Auto-Render Results */}
      {bmi && (
        <div className="results-container">
          <div className="results-label">Your current BMI is</div>
          <div className="results-value">{bmi}</div>
          <div className="results-badge">{category}</div>
          <p className="results-disclaimer">
            A healthy BMI range is typically 18.5 to 24.9. Remember, this formula doesn't account for muscle mass, so it's best used as a general baseline rather than a strict rule.
          </p>

          <div className="calc-save-action-bar">
            {user ? (
              <>
                <button
                  type="button"
                  onClick={handleSaveToProfile}
                  disabled={saving}
                  className="calc-save-btn btn-bmi"
                >
                  {saving ? 'Saving...' : isCurrentSaved ? '✓ Saved to Profile' : '💾 Save BMI to Profile'}
                </button>
                {saveFeedback && (
                  <span className={`calc-save-msg ${saveFeedback.type}`}>
                    {saveFeedback.text}
                  </span>
                )}
                {!saveFeedback && isCurrentSaved && (
                  <span className="calc-save-msg synced">
                    ✓ Synced with your Profile &amp; Emma
                  </span>
                )}
              </>
            ) : (
              <span className="calc-guest-prompt">
                💡 <Link to="/login">Log in</Link> to save this BMI to your profile so Emma can reference it in Meal Planning!
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default BMICalculator;
