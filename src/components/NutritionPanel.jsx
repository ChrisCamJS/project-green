import React, { useState } from 'react';
import './NutritionPanel.css';

const NutritionPanel = ({ macros, micros }) => {
    // state for the Progressive Disclosure toggle
    const [isExpanded, setIsExpanded] = useState(false);

    // Guard clause: if both are missing or empty, show the fallback
    if (!macros && (!micros || micros.length === 0)) {
        return <p className="vault-error">Nutritional data is missing. Check back later.</p>;
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

    // Ensure micros is a safe array to map over
    const safeMicros = Array.isArray(micros) ? micros : [];
    
    // Show all 15 if expanded, otherwise just the top 5
    const displayedMicros = isExpanded ? safeMicros : safeMicros.slice(0, 5);

    return (
        <div className="nutrition-panel">
            <h3>Macro & Math Transparency</h3>
            
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