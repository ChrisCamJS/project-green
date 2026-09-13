import React, { useState, useEffect } from 'react';
import './TDEECalculator.css';
// ============================================================================
// COMPONENT: TDEECalculator
// PURPOSE: Calculates Basal Metabolic Rate (BMR) and Total Daily Energy 
// Expenditure (TDEE) using the highly accurate Mifflin-St Jeor equation.
// ============================================================================

const TDEECalculator = () => {
  // ---  STATE MANAGEMENT ---

  const [age, setAge] = useState('');
  const [gender, setGender] = useState('male'); // Defaulting to male, but easily changed
  const [heightFt, setHeightFt] = useState('');
  const [heightIn, setHeightIn] = useState('');
  const [weightLbs, setWeightLbs] = useState('');
  const [activityLevel, setActivityLevel] = useState('');

  const [results, setResults] = useState(null);

  // State for the educational dropdown
  const [showDetails, setShowDetails] = useState(false);

  // --- THE CALCULATION ENGINE (useEffect) ---
  useEffect(() => {
    
    const a = parseFloat(age);
    const ft = parseFloat(heightFt);
    const inc = parseFloat(heightIn) || 0; 
    const lbs = parseFloat(weightLbs);
    const activity = parseFloat(activityLevel);

    // We only proceed if all the vital numbers are actually numbers (not NaN) and greater than 0.
    if (a > 0 && ft > 0 && lbs > 0 && activity > 0) {
      
      // --- CONVERSIONS ---
      // The Mifflin-St Jeor equation requires metric values, so 
      // we need to translate our imperial inputs.
      
      // 1 inch = 2.54 centimeters
      const heightCm = ((ft * 12) + inc) * 2.54;
      
      // 1 pound = 0.453592 kilograms
      const weightKg = lbs * 0.453592;

      // --- BMR: BASAL METABOLIC RATE ---
      let bmr = (10 * weightKg) + (6.25 * heightCm) - (5 * a);
      
      // The equation shifts slightly based on biological sex due to average muscle mass differences.
      if (gender === 'male') {
        bmr += 5;
      } else {
        bmr -= 161;
      }
      // --- TDEE: TOTAL DAILY ENERGY EXPENDITURE ---
      const tdee = bmr * activity;
      // Update our results state with beautifully rounded numbers
      setResults({
        bmr: Math.round(bmr),
        maintain: Math.round(tdee),
        mildLoss: Math.round(tdee - 250),
        weightLoss: Math.round(tdee - 500),
        mildGain: Math.round(tdee + 250)
      });
    } else {
      // If inputs are incomplete, clear the results so the box disappears
      setResults(null);
    }
  }, [age, gender, heightFt, heightIn, weightLbs, activityLevel]); // The dependency array

  // --- 3. THE UI RENDER ---
  return (
    <div className="calculator-wrapper">
      
      {/* Header Section */}
      <div className="calc-header header-purple">
        <div className="calc-title-group">
          <h2 className="calc-main-title">2. Caloric Needs (TDEE)</h2>
          <p className="calc-subtitle">
            Discover your body's daily energy needs to tailor your nutrition.
          </p>
        </div>
        <button 
          onClick={() => setShowDetails(!showDetails)}
          className="details-toggle-btn btn-purple"
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
            If our 5'10", 150 lb runner is a 35-year-old male:
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
            <input type="number" className="styled-input" placeholder="35" value={age} onChange={(e) => setAge(e.target.value)} />
          </div>
          <div className="input-group">
            <label className="input-label">Gender</label>
            <select className="styled-select" value={gender} onChange={(e) => setGender(e.target.value)}>
              <option value="male">Male</option>
              <option value="female">Female</option>
            </select>
          </div>
        </div>

        <div className="input-row">
          <div className="input-group">
            <label className="input-label">Height (ft)</label>
            <input type="number" className="styled-input" placeholder="5" value={heightFt} onChange={(e) => setHeightFt(e.target.value)} />
          </div>
          <div className="input-group">
            <label className="input-label">Height (in)</label>
            <input type="number" className="styled-input" placeholder="10" min="0" max="11" value={heightIn} onChange={(e) => setHeightIn(e.target.value)} />
          </div>
        </div>

        <div className="input-group">
          <label className="input-label">Weight (lbs)</label>
          <input type="number" className="styled-input" placeholder="150" value={weightLbs} onChange={(e) => setWeightLbs(e.target.value)} />
        </div>

        <div className="input-group">
          <label className="input-label">Activity Level</label>
          <select className="styled-select" value={activityLevel} onChange={(e) => setActivityLevel(e.target.value)}>
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
              <div className="results-label">To Maintain Weight (TDEE)</div>
              <div className="results-value value-purple">{results.maintain}</div>
              <div className="results-unit">Calories / Day</div>
              
              <div className="results-footer">
                <div className="footer-label">Basal Metabolic Rate (BMR)</div>
                <div className="footer-value">{results.bmr} calories</div>
              </div>
            </div>

            <div className="results-goals-column">
              <h4 className="goals-title">Adjusted Goals</h4>
              <div className="goal-card">
                <span className="goal-label">Loss (1 lb/wk)</span>
                <span className="goal-value">{results.weightLoss} cal</span>
              </div>
              <div className="goal-card">
                <span className="goal-label">Mild Loss (0.5 lb/wk)</span>
                <span className="goal-value">{results.mildLoss} cal</span>
              </div>
              <div className="goal-card">
                <span className="goal-label">Mild Gain (0.5 lb/wk)</span>
                <span className="goal-value">{results.mildGain} cal</span>
              </div>
            </div>

          </div>
        </div>
      )}
    </div>
  );
};

export default TDEECalculator;