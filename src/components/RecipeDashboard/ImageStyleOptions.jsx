// src/components/RecipeDashboard/ImageStyleOptions.jsx

import React, { useState, useId, useRef, useEffect } from 'react';
import { DEFAULT_IMAGE_STYLE_OPTIONS } from '../../services/geminiApi';

const KITCHEN_COLOR_PRESETS = [
  { label: 'Default Neutral', value: '' },
  { label: 'Sage Green & Cream', value: 'Sage Green & Warm Cream' },
  { label: 'White & Marble', value: 'Crisp White & Carrera Marble' },
  { label: 'Navy & Brass', value: 'Navy Blue & Brushed Brass' },
  { label: 'Rustic Terracotta', value: 'Rustic Terracotta & Earth Tones' },
  { label: 'Moody Charcoal', value: 'Moody Charcoal & Matte Black' },
  { label: 'Farmhouse Yellow', value: 'Sunlit Farmhouse Yellow & White' },
  { label: 'Coastal Sky & Oak', value: 'Coastal Sky Blue & Light Oak' },
];

const SURFACE_OPTIONS = [
  { label: 'Rustic Butcher Block Counter (Default)', value: '' },
  { label: 'Polished White Marble Countertop', value: 'a polished white marble countertop' },
  { label: 'Weathered Farmhouse Wood Table', value: 'a weathered farmhouse wood table' },
  { label: 'Dark Slate Stone Surface', value: 'a textured dark slate stone counter' },
  { label: 'Linen-Draped Bistro Table', value: 'a natural linen-draped bistro table' },
  { label: 'Outdoor Garden Patio Table', value: 'an outdoor sunlit garden patio table' },
];

const LIGHTING_OPTIONS = [
  { label: 'Natural Morning Window Light (Default)', value: '' },
  { label: 'Warm Golden Hour Sunlight', value: 'Warm golden hour sunlight streaming across the kitchen' },
  { label: 'Bright & Airy Studio Lighting', value: 'Bright, crisp, airy editorial studio lighting' },
  { label: 'Cozy Moody Evening Lighting', value: 'Cozy, warm, moody evening kitchen lighting with gentle shadows' },
];

const CAMERA_ANGLE_OPTIONS = [
  { label: '45° Hero Dining Angle (Default)', value: '' },
  { label: 'Overhead Flat-Lay Shot', value: 'Overhead flat-lay top-down food photography view' },
  { label: 'Close-Up Macro Restaurant Plating', value: 'Tight close-up macro shot with shallow depth of field showing restaurant-style plating' },
];

const ImageStyleOptions = ({
  value = DEFAULT_IMAGE_STYLE_OPTIONS,
  onChange,
  disabled = false,
  defaultExpanded = false,
  compact = false,
}) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const uid = useId();
  const colorInputRef = useRef(null);
  const detailsTextareaRef = useRef(null);

  const current = {
    ...DEFAULT_IMAGE_STYLE_OPTIONS,
    ...(value || {}),
  };

  useEffect(() => {
    [colorInputRef.current, detailsTextareaRef.current].forEach((el) => {
      if (!el) return;
      el.style.height = 'auto';
      el.style.height = `${el.scrollHeight}px`;
    });
  }, [current.kitchenColorScheme, current.customDetails, isExpanded]);

  const activeCount = Object.values(current).filter((v) => Boolean(v && String(v).trim())).length;

  const updateField = (field, nextVal) => {
    if (typeof onChange === 'function') {
      onChange({
        ...current,
        [field]: nextVal,
      });
    }
  };

  const handleReset = () => {
    if (typeof onChange === 'function') {
      onChange({ ...DEFAULT_IMAGE_STYLE_OPTIONS });
    }
  };

  return (
    <div className={`image-style-studio ${compact ? 'compact' : ''} ${isExpanded ? 'expanded' : ''}`}>
      <div className="style-studio-bar">
        <button
          type="button"
          className="style-studio-toggle"
          onClick={() => setIsExpanded((prev) => !prev)}
          disabled={disabled}
          aria-expanded={isExpanded}
        >
          <span>🎨 Customize Kitchen &amp; Photo Style (Optional)</span>
          {activeCount > 0 && (
            <span className="style-active-badge">
              {activeCount} {activeCount === 1 ? 'custom setting' : 'custom settings'}
            </span>
          )}
          <span className="style-toggle-chevron" aria-hidden="true">
            {isExpanded ? '▲' : '▼'}
          </span>
        </button>

        {activeCount > 0 && (
          <button
            type="button"
            className="style-reset-btn"
            onClick={handleReset}
            disabled={disabled}
          >
            Reset to Defaults
          </button>
        )}
      </div>

      {isExpanded && (
        <div className="style-studio-body">
          <div className="style-field-block">
            <label htmlFor={`${uid}-color`}>Kitchen Color Scheme</label>
            <div className="color-preset-pills">
              {KITCHEN_COLOR_PRESETS.map((preset) => {
                const isSelected = current.kitchenColorScheme === preset.value;
                return (
                  <button
                    key={preset.label}
                    type="button"
                    className={`color-preset-pill ${isSelected ? 'active' : ''}`}
                    onClick={() => updateField('kitchenColorScheme', preset.value)}
                    disabled={disabled}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>
            <textarea
              ref={colorInputRef}
              id={`${uid}-color`}
              rows={1}
              className="style-text-input"
              value={current.kitchenColorScheme}
              onChange={(e) => updateField('kitchenColorScheme', e.target.value)}
              placeholder="Or type any kitchen palette, e.g., Emerald green cabinets with copper tiles..."
              disabled={disabled}
            />
          </div>

          <div className="style-grid">
            <div className="style-field-block">
              <label htmlFor={`${uid}-surface`}>Countertop / Surface</label>
              <select
                id={`${uid}-surface`}
                className="style-select"
                value={current.surfaceStyle}
                onChange={(e) => updateField('surfaceStyle', e.target.value)}
                disabled={disabled}
              >
                {SURFACE_OPTIONS.map((opt) => (
                  <option key={opt.label} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="style-field-block">
              <label htmlFor={`${uid}-lighting`}>Lighting &amp; Atmosphere</label>
              <select
                id={`${uid}-lighting`}
                className="style-select"
                value={current.lightingStyle}
                onChange={(e) => updateField('lightingStyle', e.target.value)}
                disabled={disabled}
              >
                {LIGHTING_OPTIONS.map((opt) => (
                  <option key={opt.label} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="style-field-block">
              <label htmlFor={`${uid}-angle`}>Camera Angle</label>
              <select
                id={`${uid}-angle`}
                className="style-select"
                value={current.cameraAngle}
                onChange={(e) => updateField('cameraAngle', e.target.value)}
                disabled={disabled}
              >
                {CAMERA_ANGLE_OPTIONS.map((opt) => (
                  <option key={opt.label} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="style-field-block">
            <label htmlFor={`${uid}-details`}>Additional Photo Details (Optional)</label>
            <textarea
              ref={detailsTextareaRef}
              id={`${uid}-details`}
              className="style-textarea"
              rows={2}
              value={current.customDetails}
              onChange={(e) => updateField('customDetails', e.target.value)}
              placeholder="E.g., Served in a speckled ceramic bowl, fresh basil garnish, brass silverware, linen napkin, warm ceramic mugs in background..."
              disabled={disabled}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default ImageStyleOptions;
