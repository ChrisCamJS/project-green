import React, { useState } from 'react';
import './NutritionPanel.css';

const NutritionPanel = ({
    macros,
    micros,
    canRecalculate = false,
    isRecalculating = false,
    onRecalculate = null,
    recalculateMessage = null,
}) => {
    // state for the Progressive Disclosure toggle
    const [isExpanded, setIsExpanded] = useState(false);

    const hasMacros = Boolean(macros);
    const safeMicros = Array.isArray(micros) ? micros : [];

    // Guard clause: if both are missing or empty, show the fallback (plus owner USDA calculate button)
    if (!hasMacros && safeMicros.length === 0) {
        return (
            <div className="nutrition-panel">
                <div className="nutrition-panel-header">
                    <h3>Macro &amp; Math Transparency</h3>
                    {canRecalculate && onRecalculate && (
                        <button
                            type="button"
                            className="recalculate-usda-btn no-print"
                            onClick={onRecalculate}
                            disabled={isRecalculating}
                            title="Calculate nutrition directly from USDA FoodData Central"
                        >
                            {isRecalculating ? '🧮 Calculating USDA...' : '🔬 Calculate with USDA'}
                        </button>
                    )}
                </div>
                {recalculateMessage && (
                    <p className="recalculate-usda-feedback no-print" role="status">
                        {recalculateMessage}
                    </p>
                )}
                <p className="vault-error">Nutritional data is missing. Check back later.</p>
            </div>
        );
    }

    // extract our top-level macros
    const proteinGrams = macros?.protein_g ? parseFloat(macros?.protein_g) : 0;
    const fatGrams = macros?.fat_g ? parseFloat(macros?.fat_g) : 0;
    const carbGrams = macros?.carbs_g ? parseFloat(macros?.carbs_g) : 0;

    // calorie math proofs
    const proteinCals = Math.round(proteinGrams * 4);
    const fatCals = Math.round(fatGrams * 9);
    const carbCals = Math.round(carbGrams * 4);
    const totalCalculatedCals = proteinCals + fatCals + carbCals;

    // Show all 15 if expanded, otherwise just the top 5
    const displayedMicros = isExpanded ? safeMicros : safeMicros.slice(0, 5);

    return (
        <div className="nutrition-panel">
            <div className="nutrition-panel-header">
                <h3>Macro &amp; Math Transparency</h3>
                {canRecalculate && onRecalculate && (
                    <button
                        type="button"
                        className="recalculate-usda-btn no-print"
                        onClick={onRecalculate}
                        disabled={isRecalculating}
                        title="Recalculate macros & micronutrients from USDA FoodData Central (Free)"
                    >
                        {isRecalculating ? '🧮 Calculating USDA...' : '🔬 Recalculate (USDA)'}
                    </button>
                )}
            </div>

            {recalculateMessage && (
                <div className="recalculate-usda-feedback no-print" role="status">
                    {recalculateMessage}
                </div>
            )}
            
            <div className="macro-proofs">
                <p><strong>Protein:</strong> {proteinGrams}g <em>({proteinGrams}g × 4 kcal = {proteinCals} kcal)</em></p>
                <p><strong>Fat:</strong> {fatGrams}g <em>({fatGrams}g × 9 kcal = {fatCals} kcal)</em></p>
                <p><strong>Carbohydrates:</strong> {carbGrams}g <em>({carbGrams}g × 4 kcal = {carbCals} kcal)</em></p>
                <hr />
                <p><strong>Total Calculated Energy:</strong> {totalCalculatedCals} kcal</p>
                
                {macros?.math_calculations && (
                    <div style={{ backgroundColor: '#fdfcbc', padding: '10px', borderRadius: '6px', marginTop: '12px', fontSize: '0.85rem', color: '#7b7200' }}>
                        <strong>Engine Calculations:</strong> {macros.math_calculations}
                    </div>
                )}
            </div>

            <h4 className="micro-heading" style={{ marginTop: '24px' }}>Detailed Micronutrients</h4>
            <table className="micro-table">
                <thead>
                    <tr>
                        <th style={{ textAlign: 'left' }}>Nutrient</th>
                        <th style={{ textAlign: 'left' }}>Amount</th>
                        <th style={{ textAlign: 'left' }}>Daily Value</th>
                    </tr>
                </thead>
                <tbody>
                    {displayedMicros.map((micro) => (
                        <tr key={micro.id || micro.nutrient_name}>
                            <td><strong>{micro.nutrient_name}</strong></td>
                            
                            {/* EMMA'S FIX: Strip the useless zeros! */}
                            <td>{parseFloat(micro.amount)} {micro.unit}</td>
                            <td>
                                {parseFloat(micro.daily_value_percentage)}%
                                
                                {micro.math_calculations && (
                                    <span style={{ display: 'block', fontSize: '0.75rem', fontStyle: 'italic', color: '#6b7280', marginTop: '4px' }}>
                                        {micro.math_calculations}
                                    </span>
                                )}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
            
            {/* The Toggle Button */}
            {safeMicros.length > 5 && (
                <button 
                    className="toggle-micros-btn" 
                    onClick={() => setIsExpanded(!isExpanded)}
                    style={{ width: '100%', marginTop: '16px' }}
                >
                    {isExpanded ? 'Collapse Data ⬆️' : `View All ${safeMicros.length} Micros ⬇️`}
                </button>
            )}
        </div>
    );
};

export default NutritionPanel;