import React, { useState, useEffect, useRef, useMemo } from 'react';
import SearchBar from './SearchBar';
import { getRecipeDietaryFlags } from '../utils/dietaryUtils';
import './RecipeFilterToolbar.css';

const DIETARY_OPTIONS = [
  { key: 'glutenFree', label: 'Gluten-Free' },
  { key: 'oilFree', label: 'Oil-Free' },
  { key: 'sugarFree', label: 'Refined Sugar-Free' },
];

export default function RecipeFilterToolbar({
  recipes = [],
  filteredCount = 0,
  searchQuery,
  onSearchChange,
  activeFilters,
  onToggleFilter,
  minRating,
  onRatingChange,
  onClearFilters,
  placeholder = 'Search recipes by title, description, or ingredient...',
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onOutside);
    document.addEventListener('touchstart', onOutside, { passive: true });
    return () => {
      document.removeEventListener('mousedown', onOutside);
      document.removeEventListener('touchstart', onOutside);
    };
  }, [open]);

  const counts = useMemo(() => {
    const res = { glutenFree: 0, oilFree: 0, sugarFree: 0 };
    for (const r of recipes) {
      const flags = getRecipeDietaryFlags(r);
      if (flags.glutenFree) res.glutenFree += 1;
      if (flags.oilFree) res.oilFree += 1;
      if (flags.sugarFree) res.sugarFree += 1;
    }
    return res;
  }, [recipes]);

  const activeFilterCount =
    (activeFilters?.glutenFree ? 1 : 0) +
    (activeFilters?.oilFree ? 1 : 0) +
    (activeFilters?.sugarFree ? 1 : 0) +
    (minRating > 0 ? 1 : 0);

  const hasAnyActive = activeFilterCount > 0 || Boolean(String(searchQuery || '').trim());

  return (
    <div className="rft-wrapper">
      <div className="rft-row">
        <div className="rft-search-slot">
          <SearchBar
            searchQuery={searchQuery}
            onSearchChange={onSearchChange}
            placeholder={placeholder}
          />
        </div>

        <div className="rft-dropdown-wrap" ref={menuRef}>
          <button
            type="button"
            className={`rft-dropdown-btn ${activeFilterCount > 0 ? 'active' : ''}`}
            onClick={() => setOpen((prev) => !prev)}
            aria-expanded={open}
            aria-haspopup="true"
          >
            <span>Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}</span>
            <span aria-hidden="true">{open ? '▲' : '▼'}</span>
          </button>

          {open && (
            <div className="rft-dropdown-menu" role="group" aria-label="Recipe filters">
              <div className="rft-section-title">Diet</div>
              <div className="rft-pills">
                {DIETARY_OPTIONS.map(({ key, label }) => {
                  const isActive = Boolean(activeFilters?.[key]);
                  return (
                    <button
                      key={key}
                      type="button"
                      className={`rft-pill ${isActive ? 'active' : ''}`}
                      onClick={() => onToggleFilter(key)}
                      aria-pressed={isActive}
                    >
                      <span>{label}</span>
                      <span className="rft-count">{counts[key]}</span>
                    </button>
                  );
                })}
              </div>

              <div className="rft-section-title">Rating</div>
              <select
                className="rft-rating-select"
                value={minRating}
                onChange={(e) => onRatingChange(Number(e.target.value) || 0)}
                aria-label="Filter by minimum star rating"
              >
                <option value={0}>⭐ All Ratings</option>
                <option value={4}>⭐ 4+ Stars</option>
                <option value={3}>⭐ 3+ Stars</option>
                <option value={2}>⭐ 2+ Stars</option>
                <option value={1}>⭐ 1+ Stars</option>
              </select>

              {hasAnyActive && (
                <button
                  type="button"
                  className="rft-clear-btn"
                  onClick={() => {
                    onClearFilters();
                    setOpen(false);
                  }}
                >
                  Clear Filters
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {hasAnyActive && (
        <p className="rft-status">
          Showing <strong>{filteredCount}</strong> of {recipes.length} recipes
        </p>
      )}
    </div>
  );
}
