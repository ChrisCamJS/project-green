import React, {useState, useEffect} from 'react';
import './MacroNutrientPlanner.css';
// ============================================================================
// COMPONENT: MacroNutrientPlanner
// PURPOSE: Breaks down a daily calorie goal into specific grams of 
// Protein, Carbohydrates, and Fats based on selected dietary ratios.
// ============================================================================

const MacroNutrientPlanner = () => {
    // state management
    const [calories, setCalories] = useState('');
    const [plan, setPlan] = useState('');

    // custom percentage states
    const [customProtein, setCustomProtein] = useState('');
    const [customCarbs, setCustomCarbs] = useState('');
    const[customFat, setCustomFat] = useState('');

    // error handling and final results\
    const [error, setError] = useState('');
    const [results, setResults] = useState(null);

    // State for the educational dropdown
    const [showDetails, setShowDetails] = useState(false);
 
    // --- THE MACRO ENGINE (useEffect) ---
    useEffect(() => {
        // clear errors by default
        setError('');

        const totalCals = parseFloat(calories);

        // if novalid Calorie count or plan, we stop here.
        if (!totalCals || totalCals <= 0 || !plan) {
            setResults(null);
            return;
        }

        let proteinRatio = 0;
        let carbRatio = 0;
        let fatRatio = 0;

        switch (plan) {
            case 'balanced':
                carbRatio = 0.40;
                proteinRatio = 0.30;
                fatRatio = 0.30;
                break;
            case 'high-protein':
                carbRatio = 0.20;
                proteinRatio = 0.40;
                fatRatio = 0.30;
                break;
            case 'high-carb':
                carbRatio = 0.60;
                proteinRatio = 0.20;
                fatRatio = 0.20;
                break;
            case 'custom':
                const p = parseFloat(customProtein) || 0;
                const c = parseFloat(customCarbs) || 0;
                const f = parseFloat(customFat) || 0;

                const totalPercent = p + c + f;
                if (totalPercent !== 100) {
                    setError(`Percentages must add up to exactly 100. Current total: ${totalPercent}%`);
                    setResults(null);
                    return;
                }

                //convert percentages to decimals
                proteinRatio = p /100;
                carbRatio = c / 100;
                fatRatio = f / 100;
                break;
            default:
                return;
        }

        // the math part
        const proteinCals = totalCals * proteinRatio;
        const carbCals = totalCals * carbRatio;
        const fatCals = totalCals * fatRatio;

        setResults({
    protein: {
        grams: Math.round(proteinCals / 4),
        calories: Math.round(proteinCals)
      },
    carbs: {
        grams: Math.round(carbCals / 4),
        calories: Math.round(carbCals)
      },
    fat: {
        grams: Math.round(fatCals / 9),
        calories: Math.round(fatCals)
      }
    });

    }, [calories, plan, customProtein, customCarbs, customFat]);

  return (
    <div className="calculator-wrapper">
      
      {/* Header Section */}
      <div className="calc-header header-pink">
        <div className="calc-title-group">
          <h2 className="calc-main-title">3. Macronutrient Planner</h2>
          <p className="calc-subtitle">
            Determine your optimal daily breakdown of protein, carbs, and fats.
          </p>
        </div>
        <button 
          onClick={() => setShowDetails(!showDetails)}
          className="details-toggle-btn btn-pink"
        >
          {showDetails ? 'Hide Details ▲' : 'How it Works ▼'}
        </button>
      </div>

      {/* Educational Dropdown */}
      {showDetails && (
        <div className="edu-dropdown dropdown-pink animate-fade-in">
          <h4 className="edu-label">The 4-4-9 Rule:</h4>
          <p className="edu-text">
            Not all calories are created equal. Protein and Carbohydrates provide roughly <strong>4 calories per gram</strong>. Dietary Fat is more energy-dense, providing <strong>9 calories per gram</strong>.
          </p>
          <h4 className="edu-label">Example Calculation:</h4>
          <p className="edu-text">
            If our runner needs <strong>2,500 calories</strong> and chooses a High-Carb plan (60% Carbs):
            <span className="step-list">
              <span>1. Carbs will make up 60% of his intake: (2,500 × 0.60) = 1,500 calories.</span>
              <span>2. Divide those calories by 4 to get the actual weight: (1,500 / 4) = <strong>375g of carbs</strong>.</span>
            </span>
          </p>
        </div>
      )}

      {/* Input Form */}
      <div className="input-grid">
        <div className="input-group">
          <label className="input-label">Calorie Goal</label>
          <input type="number" className="styled-input" placeholder="2000" value={calories} onChange={(e) => setCalories(e.target.value)} />
        </div>
        <div className="input-group">
          <label className="input-label">Select Plan</label>
          <select className="styled-select select-pink" value={plan} onChange={(e) => setPlan(e.target.value)}>
            <option value="">-- Select a Plan --</option>
            <option value="balanced">Balanced Diet (40c/30p/30f)</option>
            <option value="low-carb">Low-Carb (20c/40p/40f)</option>
            <option value="high-protein">High-Protein (30c/40p/30f)</option>
            <option value="high-carb">High-Carb / Endurance (60c/20p/20f)</option>
            <option value="custom">Custom Percentages...</option>
          </select>
        </div>
      </div>

      {plan === 'custom' && (
        <div className="custom-config-panel animate-fade-in">
          <p className="panel-title">Custom Percentages:</p>
          <div className="custom-input-row">
            <div className="custom-group">
              <label className="custom-label">Protein (%)</label>
              <input type="number" className="styled-input mini" placeholder="20" value={customProtein} onChange={(e) => setCustomProtein(e.target.value)} />
            </div>
            <div className="custom-group">
              <label className="custom-label">Carbs (%)</label>
              <input type="number" className="styled-input mini" placeholder="50" value={customCarbs} onChange={(e) => setCustomCarbs(e.target.value)} />
            </div>
            <div className="custom-group">
              <label className="custom-label">Fat (%)</label>
              <input type="number" className="styled-input mini" placeholder="30" value={customFat} onChange={(e) => setCustomFat(e.target.value)} />
            </div>
          </div>
          {error && <div className="error-message">{error}</div>}
        </div>
      )}

      {/* Auto-Render Results */}
      {results && !error && (
        <div className="macro-results-grid">
          
          <div className="macro-card card-protein">
            <div className="macro-name">Protein</div>
            <div className="macro-grams">{results.protein.grams}g</div>
            <div className="macro-cals">{results.protein.calories} cal</div>
          </div>

          <div className="macro-card card-carbs">
            <div className="macro-name">Carbs</div>
            <div className="macro-grams">{results.carbs.grams}g</div>
            <div className="macro-cals">{results.carbs.calories} cal</div>
          </div>

          <div className="macro-card card-fat">
            <div className="macro-name">Fat</div>
            <div className="macro-grams">{results.fat.grams}g</div>
            <div className="macro-cals">{results.fat.calories} cal</div>
          </div>

        </div>
      )}
    </div>
  );
}

export default MacroNutrientPlanner;