import React, { useState } from 'react';
import './NutritionPanel.css';

const formatIngredientLabel = (rawLabel = '') => {
    const cleaned = String(rawLabel || '')
        .replace(/,\s*raw\b/gi, '')
        .replace(/\s+/g, ' ')
        .trim();
    if (!cleaned) return '';
    return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
};

const formatMacroBreakdownDetail = (detail = '') =>
    String(detail || '')
        .replace(/\bC\b/g, 'carbs')
        .replace(/\bF\b/g, 'fat')
        .replace(/\bP\b/g, 'protein')
        .replace(/\s*per\s+srv\b/gi, '')
        .replace(/\s*\/\s*/g, ' · ')
        .trim();

const parseUsdaMathSummary = (rawText = '') => {
    const trimmed = String(rawText || '').trim();
    if (!trimmed) return null;

    const match = trimmed.match(/^USDA FoodData Central\s*\(([^)]+)\):\s*(.+)$/i);
    if (!match) return null;

    const meta = match[1].replace(/,\s*/g, ' · ').trim();
    const items = match[2]
        .split(';')
        .map((chunk) => chunk.trim())
        .filter(Boolean)
        .map((chunk) => {
            const parts = chunk.match(/^([\d.]+\s*g)\s+(.+?)\s*\(([^)]+)\)$/i);
            if (!parts) {
                return { grams: '', ingredient: chunk, detail: '' };
            }
            return {
                grams: parts[1].replace(/\s+/g, ''),
                ingredient: formatIngredientLabel(parts[2]),
                detail: formatMacroBreakdownDetail(parts[3]),
            };
        });

    return { meta, items };
};

const formatMicroSourceNote = (rawText = '') => {
    const trimmed = String(rawText || '').trim();
    if (!trimmed || /\(0 in matched ingredients\)/i.test(trimmed)) {
        return null;
    }

    const stripped = trimmed
        .replace(/^USDA\s+FDC\s*(?:—|-|--)\s*primary\s+sources:\s*/i, '')
        .replace(/,\s*raw\b/gi, '')
        .trim();

    if (!stripped) return null;
    return `Sources: ${stripped}`;
};

const NutritionPanel = ({
    macros,
    micros,
    canRecalculate = false,
    isRecalculating = false,
    onRecalculate = null,
    recalculateMessage = null,
}) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const [showUsdaBreakdown, setShowUsdaBreakdown] = useState(false);

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

    const proteinGrams = macros?.protein_g ? parseFloat(macros.protein_g) : 0;
    const fatGrams = macros?.fat_g ? parseFloat(macros.fat_g) : 0;
    const carbGrams = macros?.carbs_g ? parseFloat(macros.carbs_g) : 0;

    const proteinCals = Math.round(proteinGrams * 4);
    const fatCals = Math.round(fatGrams * 9);
    const carbCals = Math.round(carbGrams * 4);
    const totalCalculatedCals = proteinCals + fatCals + carbCals;

    const usdaSummary = parseUsdaMathSummary(macros?.math_calculations);
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
                <div className="macro-proof-row">
                    <span className="macro-proof-label"><strong>Protein:</strong> {proteinGrams}g</span>
                    <span className="macro-proof-math">{proteinGrams}g × 4 kcal = {proteinCals} kcal</span>
                </div>
                <div className="macro-proof-row">
                    <span className="macro-proof-label"><strong>Fat:</strong> {fatGrams}g</span>
                    <span className="macro-proof-math">{fatGrams}g × 9 kcal = {fatCals} kcal</span>
                </div>
                <div className="macro-proof-row">
                    <span className="macro-proof-label"><strong>Carbs:</strong> {carbGrams}g</span>
                    <span className="macro-proof-math">{carbGrams}g × 4 kcal = {carbCals} kcal</span>
                </div>
                <div className="macro-proof-total">
                    <strong>Total Calculated Energy:</strong>
                    <span>{totalCalculatedCals} kcal</span>
                </div>

                {usdaSummary ? (
                    <div className="usda-calc-card">
                        <div className="usda-calc-header">
                            <div className="usda-calc-title-group">
                                <span className="usda-badge">✅ USDA FoodData Central</span>
                                <span className="usda-meta">{usdaSummary.meta}</span>
                            </div>
                            {usdaSummary.items.length > 0 && (
                                <button
                                    type="button"
                                    className="usda-toggle-btn no-print"
                                    onClick={() => setShowUsdaBreakdown((prev) => !prev)}
                                    aria-expanded={showUsdaBreakdown}
                                >
                                    {showUsdaBreakdown ? 'Hide breakdown ▴' : 'Show breakdown ▾'}
                                </button>
                            )}
                        </div>
                        {showUsdaBreakdown && usdaSummary.items.length > 0 && (
                            <ul className="usda-breakdown-list">
                                {usdaSummary.items.map((item, idx) => (
                                    <li key={`${item.ingredient}-${idx}`} className="usda-breakdown-item">
                                        <div className="usda-breakdown-top">
                                            <span className="usda-breakdown-name">{item.ingredient}</span>
                                            {item.grams && (
                                                <span className="usda-breakdown-grams">{item.grams} batch</span>
                                            )}
                                        </div>
                                        {item.detail && (
                                            <div className="usda-breakdown-detail">
                                                Per serving: {item.detail}
                                            </div>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                ) : (
                    macros?.math_calculations && (
                        <div className="legacy-calc-note">
                            <strong>Engine Calculations:</strong> {macros.math_calculations}
                        </div>
                    )
                )}
            </div>

            <div className="micro-section-header">
                <h4 className="micro-heading">Detailed Micronutrients</h4>
                <span className="micro-serving-tag">Per serving</span>
            </div>

            <table className="micro-table">
                <thead>
                    <tr>
                        <th className="micro-th-left">Nutrient</th>
                        <th className="micro-th-right">Amount</th>
                        <th className="micro-th-right">% DV</th>
                    </tr>
                </thead>
                <tbody>
                    {displayedMicros.map((micro) => {
                        const dvValue = parseFloat(micro.daily_value_percentage) || 0;
                        const barWidth = Math.min(100, Math.max(0, dvValue));
                        const sourceNote = formatMicroSourceNote(micro.math_calculations);

                        return (
                            <tr key={micro.id || micro.nutrient_name}>
                                <td className="micro-name-cell">
                                    <span className="micro-name-title">{micro.nutrient_name}</span>
                                    {sourceNote && (
                                        <span className="micro-source-note">{sourceNote}</span>
                                    )}
                                </td>
                                <td className="micro-num-cell">
                                    {parseFloat(micro.amount)} {micro.unit}
                                </td>
                                <td className="micro-dv-cell">
                                    <span className="micro-dv-value">{dvValue}%</span>
                                    <div className="micro-dv-bar" aria-hidden="true">
                                        <div
                                            className="micro-dv-fill"
                                            style={{ width: `${barWidth}%` }}
                                        />
                                    </div>
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>

            {safeMicros.length > 5 && (
                <button
                    type="button"
                    className="toggle-micros-btn no-print"
                    onClick={() => setIsExpanded(!isExpanded)}
                >
                    {isExpanded ? 'Collapse Micros ⬆️' : `View All ${safeMicros.length} Micros ⬇️`}
                </button>
            )}
        </div>
    );
};

export default NutritionPanel;
