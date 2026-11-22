// src/components/CreateVariantModal.jsx
import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { DEFAULT_IMAGE_STYLE_OPTIONS } from '../services/geminiApi';
import VoiceDictationButton from './VoiceDictationButton';
import ImageStyleOptions from './RecipeDashboard/ImageStyleOptions';
import './CreateVariantModal.css';

const QUICK_TWIST_CHIPS = [
  'Make it 100% gluten-free with certified GF swaps',
  'Swap soy sauce for coconut aminos and lower sodium',
  'Turn up the heat with extra chili, garlic, and smoked paprika',
  'Boost plant protein with hemp seeds or extra-firm tofu',
];

export default function CreateVariantModal({
  isOpen,
  onClose,
  parentRecipe,
  onVariantCreated,
}) {
  const { user, updateUser, promptPurchaseTokens } = useAuth();

  const [changesRequested, setChangesRequested] = useState('');
  const [variantTitle, setVariantTitle] = useState('');
  const [imageMode, setImageMode] = useState('upload'); // 'upload' (0.5) | 'ai' (1.0)
  const [uploadedImageDataUrl, setUploadedImageDataUrl] = useState('');
  const [uploadedFileName, setUploadedFileName] = useState('');
  const [includeMicros, setIncludeMicros] = useState(true);
  const [imageStyleOptions, setImageStyleOptions] = useState({
    ...DEFAULT_IMAGE_STYLE_OPTIONS,
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (!isOpen || !parentRecipe) return;
    setChangesRequested('');
    setVariantTitle(`${parentRecipe.title || 'Recipe'} (Remix)`);
    setImageMode('upload');
    setUploadedImageDataUrl('');
    setUploadedFileName('');
    setIncludeMicros(true);
    setErrorMsg(null);
    setIsSubmitting(false);
  }, [isOpen, parentRecipe]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [changesRequested, isOpen]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && !isSubmitting) {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isSubmitting, onClose]);

  if (!isOpen || !parentRecipe) {
    return null;
  }

  const currentBalance = Number(user?.generation_tokens ?? 0);
  const requiredCost = imageMode === 'ai' ? 1.0 : 0.5;
  const hasEnoughTokens = currentBalance >= requiredCost;
  const projectedBalance = Math.max(0, Number((currentBalance - requiredCost).toFixed(2)));

  const handlePhotoUploadChange = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      setErrorMsg('Photo must be 10 MB or smaller.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setUploadedImageDataUrl(String(reader.result || ''));
      setUploadedFileName(file.name);
      setErrorMsg(null);
    };
    reader.onerror = () => {
      setErrorMsg('Could not read the selected photo file.');
    };
    reader.readAsDataURL(file);
  };

  const handleChipClick = (chipText) => {
    setChangesRequested((prev) => {
      const trimmed = prev.trim();
      return trimmed ? `${trimmed}. ${chipText}` : chipText;
    });
    setErrorMsg(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;

    const trimmedChanges = changesRequested.trim();
    if (trimmedChanges.length < 8) {
      setErrorMsg(
        'Please tell Emma specifically what you are changing from the original recipe (ingredients, proportions, or cooking method).'
      );
      return;
    }

    if (imageMode === 'upload' && !uploadedImageDataUrl) {
      setErrorMsg(
        'Please upload your dish photo for the 0.5-token Base Variant, or switch to "Generate AI Image with Emma" (1.0 token).'
      );
      return;
    }

    if (!hasEnoughTokens) {
      await promptPurchaseTokens(
        requiredCost,
        `Creating a Recipe Variant (${requiredCost.toFixed(1)} Tokens)`
      );
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      const res = await api.createRecipeVariant({
        parent_recipe_id: parentRecipe.id,
        changes_requested: trimmedChanges,
        title: variantTitle.trim(),
        image_mode: imageMode,
        uploaded_image: imageMode === 'upload' ? uploadedImageDataUrl : '',
        image_style_options: imageMode === 'ai' ? imageStyleOptions : {},
        include_micros: includeMicros,
      });

      if (res?.success) {
        if (typeof res.tokensRemaining === 'number' && updateUser && user) {
          updateUser({
            ...user,
            generation_tokens: res.tokensRemaining,
          });
        }
        if (onVariantCreated) {
          onVariantCreated(res);
        }
      }
    } catch (err) {
      setErrorMsg(
        err?.message || 'Emma hit a snag while forging your variant. No tokens were deducted.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="variant-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="variant-modal-title"
      onClick={() => {
        if (!isSubmitting) onClose();
      }}
    >
      <div className="variant-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="variant-modal-header">
          <div>
            <span className="variant-modal-kicker">👩‍🍳 Emma&apos;s Variant Studio</span>
            <h2 id="variant-modal-title" className="variant-modal-heading">
              🔀 Create a Recipe Variant
            </h2>
            <p className="variant-modal-parent-note">
              Forking: <strong>{parentRecipe.title}</strong> by{' '}
              <span>{parentRecipe.authorName || 'Emma (AI)'}</span>
            </p>
          </div>
          <button
            type="button"
            className="variant-modal-close-btn"
            onClick={onClose}
            disabled={isSubmitting}
            aria-label="Close variant studio"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="variant-modal-form">
          {/* 1. What's different about this version? */}
          <div className="variant-form-group">
            <label htmlFor="variant-changes-input" className="variant-form-label">
              1. What&apos;s different about your version? <span className="required-star">*</span>
            </label>
            <p className="variant-form-hint">
              Describe your ingredient swaps, flavor twists, spice adjustments, or cooking method changes. Emma keeps the soul of the dish while recalculating the steps &amp; USDA nutrition.
            </p>

            <div className="variant-quick-chips">
              {QUICK_TWIST_CHIPS.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  className="variant-chip-btn"
                  onClick={() => handleChipClick(chip)}
                  disabled={isSubmitting}
                >
                  + {chip}
                </button>
              ))}
            </div>

            <div className="variant-textarea-wrap">
              <textarea
                id="variant-changes-input"
                ref={textareaRef}
                rows={3}
                value={changesRequested}
                onChange={(e) => {
                  setChangesRequested(e.target.value);
                  if (errorMsg) setErrorMsg(null);
                }}
                placeholder="E.g., Swap soy sauce for coconut aminos, replace white potatoes with sweet potatoes, double the smoked paprika, and bake at 400°F instead of pan-searing..."
                className="variant-textarea"
                disabled={isSubmitting}
                required
              />
              <div className="variant-textarea-mic">
                <VoiceDictationButton
                  value={changesRequested}
                  onChange={setChangesRequested}
                  disabled={isSubmitting}
                />
              </div>
            </div>
          </div>

          {/* 2. Variant Name / Title */}
          <div className="variant-form-group">
            <label htmlFor="variant-title-input" className="variant-form-label">
              2. Variant Name / Title
            </label>
            <input
              id="variant-title-input"
              type="text"
              className="variant-text-input"
              value={variantTitle}
              onChange={(e) => setVariantTitle(e.target.value)}
              placeholder="Give your remix an appetizing name..."
              maxLength={200}
              disabled={isSubmitting}
            />
          </div>

          {/* 3. Image Choice */}
          <div className="variant-form-group">
            <span className="variant-form-label">3. Dish Photo &amp; Token Tier</span>
            <div className="variant-image-mode-grid">
              <label
                className={`variant-mode-option ${imageMode === 'upload' ? 'selected' : ''}`}
              >
                <input
                  type="radio"
                  name="variantImageMode"
                  value="upload"
                  checked={imageMode === 'upload'}
                  onChange={() => {
                    setImageMode('upload');
                    setErrorMsg(null);
                  }}
                  disabled={isSubmitting}
                />
                <div className="variant-mode-header">
                  <span className="variant-mode-title">📸 Upload Your Own Photo</span>
                  <span className="variant-mode-cost-pill base">0.5 Tokens</span>
                </div>
                <p className="variant-mode-desc">
                  Upload your own photo of the dish (auto-verified by our safety filter) + full recipe &amp; nutrition recalculation.
                </p>
              </label>

              <label
                className={`variant-mode-option ${imageMode === 'ai' ? 'selected' : ''}`}
              >
                <input
                  type="radio"
                  name="variantImageMode"
                  value="ai"
                  checked={imageMode === 'ai'}
                  onChange={() => {
                    setImageMode('ai');
                    setErrorMsg(null);
                  }}
                  disabled={isSubmitting}
                />
                <div className="variant-mode-header">
                  <span className="variant-mode-title">🎨 Generate AI Image with Emma</span>
                  <span className="variant-mode-cost-pill ai">1.0 Token</span>
                </div>
                <p className="variant-mode-desc">
                  Emma paints a brand-new custom AI food photo tailored to your variant&apos;s exact ingredients + full nutrition.
                </p>
              </label>
            </div>

            {imageMode === 'upload' ? (
              <div className="variant-upload-zone">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  onChange={handlePhotoUploadChange}
                  disabled={isSubmitting}
                  hidden
                />
                {!uploadedImageDataUrl ? (
                  <button
                    type="button"
                    className="variant-upload-trigger-btn"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isSubmitting}
                  >
                    📤 Choose Dish Photo (JPG, PNG, WebP — Max 10 MB)
                  </button>
                ) : (
                  <div className="variant-upload-preview">
                    <img
                      src={uploadedImageDataUrl}
                      alt="Uploaded variant preview"
                      className="variant-upload-thumb"
                    />
                    <div className="variant-upload-meta">
                      <strong>{uploadedFileName || 'Dish photo ready'}</strong>
                      <span>Will be verified by Emma&apos;s safety guard on submit</span>
                    </div>
                    <button
                      type="button"
                      className="variant-upload-change-btn"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isSubmitting}
                    >
                      Change Photo
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="variant-ai-style-box">
                <ImageStyleOptions
                  value={imageStyleOptions}
                  onChange={setImageStyleOptions}
                  disabled={isSubmitting}
                  compact
                />
              </div>
            )}
          </div>

          {/* 4. Masterpiece Micronutrients Toggle */}
          <div className="variant-form-group">
            <label className={`variant-masterpiece-toggle ${includeMicros ? 'active' : ''}`}>
              <input
                type="checkbox"
                checked={includeMicros}
                onChange={(e) => setIncludeMicros(e.target.checked)}
                disabled={isSubmitting}
              />
              <div className="variant-masterpiece-info">
                <div className="variant-masterpiece-title-row">
                  <strong>✨ Run Full Masterpiece Micronutrients &amp; Deep Dive</strong>
                  <span className="variant-gold-badge-preview">
                    ✨ Masterpiece Variant Badge
                  </span>
                </div>
                <p>
                  Includes the full 13-micronutrient USDA breakdown (Dietary Fiber, Sodium, Saturated Fat, vitamins &amp; minerals) plus Emma&apos;s Nutritional Deep Dive and awards the gold <strong>Masterpiece Variant</strong> badge at no extra token cost.
                </p>
              </div>
            </label>
          </div>

          {/* 5. Dynamic Cost & Balance Indicator */}
          <div className={`variant-balance-bar ${!hasEnoughTokens ? 'insufficient' : ''}`}>
            <div className="variant-balance-metrics">
              <div className="variant-metric">
                <span className="variant-metric-label">Your Balance</span>
                <strong className="variant-metric-val">{currentBalance.toFixed(2)} Tokens</strong>
              </div>
              <div className="variant-metric">
                <span className="variant-metric-label">This Variant Costs</span>
                <strong className="variant-metric-val cost">
                  {requiredCost.toFixed(1)} {requiredCost === 1 ? 'Token' : 'Tokens'}
                </strong>
              </div>
              <div className="variant-metric">
                <span className="variant-metric-label">Balance After</span>
                <strong className="variant-metric-val">
                  {hasEnoughTokens ? `${projectedBalance.toFixed(2)} Tokens` : 'Insufficient'}
                </strong>
              </div>
            </div>

            {!hasEnoughTokens && (
              <div className="variant-insufficient-row">
                <span>
                  You need <strong>{requiredCost.toFixed(1)}</strong> tokens to forge this variant.
                </span>
                <button
                  type="button"
                  className="variant-topup-btn"
                  onClick={() =>
                    promptPurchaseTokens(
                      requiredCost,
                      `Creating a Recipe Variant (${requiredCost.toFixed(1)} Tokens)`
                    )
                  }
                >
                  🪙 Top Up Tokens
                </button>
              </div>
            )}
          </div>

          {errorMsg && (
            <div className="variant-error-banner" role="alert">
              ⚠️ {errorMsg}
            </div>
          )}

          <div className="variant-modal-actions">
            <button
              type="button"
              className="variant-cancel-btn"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="variant-submit-btn"
              disabled={
                isSubmitting ||
                !hasEnoughTokens ||
                !changesRequested.trim() ||
                (imageMode === 'upload' && !uploadedImageDataUrl)
              }
            >
              {isSubmitting
                ? imageMode === 'ai'
                  ? '🧪 Emma is Forging & Painting Variant...'
                  : '🧪 Emma is Forging Variant & USDA Math...'
                : `🔀 Create ${includeMicros ? 'Masterpiece ' : ''}Variant (${requiredCost.toFixed(1)} ${requiredCost === 1 ? 'Token' : 'Tokens'})`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
