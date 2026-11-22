// src/components/VariantBadge.jsx
import React, { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import './VariantBadge.css';

/**
 * Interactive "Variant" / "Masterpiece Variant" badge with a tooltip/popover
 * that opens on desktop hover AND mobile/touch tap, linking directly to the parent recipe.
 */
export default function VariantBadge({
  parentRecipeId,
  parentRecipeTitle = 'Original Recipe',
  parentAuthorName = null,
  isMasterpiece = false,
  variantSummary = null,
  compact = false,
  hideIcon = false,
}) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef(null);
  const closeTimerRef = useRef(null);

  const clearCloseTimer = () => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  };

  const handleMouseEnter = () => {
    clearCloseTimer();
    setOpen(true);
  };

  const handleMouseLeave = () => {
    clearCloseTimer();
    closeTimerRef.current = setTimeout(() => {
      setOpen(false);
    }, 180);
  };

  const handleToggleTap = (e) => {
    e.stopPropagation();
    clearCloseTimer();
    setOpen((prev) => !prev);
  };

  useEffect(() => {
    if (!open) return undefined;

    const handleOutsideClick = (event) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setOpen(false);
      }
    };

    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('touchstart', handleOutsideClick);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('touchstart', handleOutsideClick);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  useEffect(() => {
    return () => clearCloseTimer();
  }, []);

  if (!parentRecipeId) {
    return null;
  }

  return (
    <div
      ref={wrapperRef}
      className={`variant-badge-wrapper ${compact ? 'compact' : ''}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <button
        type="button"
        className={`variant-badge-pill ${isMasterpiece ? 'masterpiece' : 'standard'}`}
        onClick={handleToggleTap}
        aria-expanded={open}
        aria-haspopup="dialog"
        title={`Variant of "${parentRecipeTitle}" — hover or tap for details`}
      >
        {!hideIcon && (
          <span className="variant-badge-icon" aria-hidden="true">
            {isMasterpiece ? '✨' : '🔀'}
          </span>
        )}
        <span className="variant-badge-text">
          {isMasterpiece ? 'Masterpiece Variant' : 'Variant'}
        </span>
      </button>

      {open && (
        <div
          className="variant-badge-popover"
          role="dialog"
          aria-label="Original recipe details"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="variant-popover-kicker">
            {isMasterpiece ? '✨ Masterpiece Remix' : '🔀 Recipe Variant'}
          </div>
          <div className="variant-popover-line">
            <span className="variant-popover-label">Variant of:</span>{' '}
            <Link
              to={`/recipe/${parentRecipeId}`}
              className="variant-popover-link"
              onClick={() => setOpen(false)}
            >
              {parentRecipeTitle || 'Original Recipe'} &rarr;
            </Link>
          </div>
          {parentAuthorName && (
            <div className="variant-popover-author">
              Original by <strong>{parentAuthorName}</strong>
            </div>
          )}
          {variantSummary && (
            <div className="variant-popover-summary">
              <strong>What changed:</strong> {variantSummary}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
