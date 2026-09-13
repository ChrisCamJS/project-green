import React, { useState, useEffect } from 'react';
import './BMICalculator.css';
// ============================================================================
// COMPONENT: BMICalculator
// PURPOSE: A dynamic, real-time Body Mass Index calculator.
// We are using React State to calculate the BMI instantly as the user types,
// removing the need for clunky form submissions or page reloads.
// ============================================================================
const BMICalculator = () => {
  // --- STATE MANAGEMENT ---
  // We need to store three pieces of input from the user: Height (feet and inches) and Weight.
  const [heightFt, setHeightFt] = useState('');
  const [heightIn, setHeightIn] = useState('');
  const [weightLbs, setWeightLbs] = useState('');

  // We also need state to hold our output: the final BMI number and the category it falls into.
  const [bmi, setBmi] = useState(null);
  const [category, setCategory] = useState('');

  // State to toggle the educational breakdown
  const [showDetails, setShowDetails] = useState(false);

  // --- THE MATH ENGINE (useEffect) ---
  // We use the useEffect hook here because we want the math to run automatically 
  // every single time heightFt, heightIn, or weightLbs changes. 
  useEffect(() => {
    // First, we convert our string inputs into usable numbers.
    const ft = parseFloat(heightFt);
    const inc = parseFloat(heightIn) || 0; // Default to 0 if they leave inches blank
    const lbs = parseFloat(weightLbs);

    // We only want to run the calculation if we have valid numbers for both feet and weight.
    if (ft > 0 && lbs > 0) {
      // Step 1: Convert the total height into pure inches
      const totalInches = (ft * 12) + inc;
      
      // Step 2: The classic BMI Formula 
      // Weight divided by height squared, all multiplied by the 703 conversion factor.
      const calculatedBmi = (lbs / (totalInches * totalInches)) * 703;
      
      // Step 3: Round it to one decimal place so it looks clean on the UI
      const finalBmi = calculatedBmi.toFixed(1);
      setBmi(finalBmi);

      // Step 4: Determine the category based on standard health brackets
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
      // If the inputs are cleared out or invalid, reset the results to hide the output box
      setBmi(null);
      setCategory('');
    }
  }, [heightFt, heightIn, weightLbs]); // Dependency array: watch these variables!

  // --- THE UI (Render) ---
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
            min="0" max="11"
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
        </div>
      )}
    </div>
  );
};

export default BMICalculator;