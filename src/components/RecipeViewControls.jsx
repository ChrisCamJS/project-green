import React, { useEffect, useRef } from 'react';
import './RecipeViewControls.css';

const VIEW_MODE_OPTIONS = [
    { value: '6', label: '6 per page' },
    { value: '10', label: '10 per page' },
    { value: '15', label: '15 per page' },
    { value: 'endless', label: 'Endless Scroll' },
];

export const RecipeViewControls = ({ viewMode, onChange, totalItems, itemLabel = 'recipes' }) => {
    return (
        <div className="recipe-view-controls">
            <span className="recipe-view-total">
                {totalItems} {itemLabel}
            </span>
            <label className="recipe-view-label">
                <span>View:</span>
                <select
                    className="recipe-view-select"
                    value={String(viewMode)}
                    onChange={(e) => onChange(e.target.value)}
                    aria-label="Recipes per page or endless scroll"
                >
                    {VIEW_MODE_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                            {opt.label}
                        </option>
                    ))}
                </select>
            </label>
        </div>
    );
};

export const EndlessScrollSentinel = ({ hasMore, onLoadMore, visibleCount, totalItems }) => {
    const sentinelRef = useRef(null);

    useEffect(() => {
        if (!hasMore) return undefined;
        const el = sentinelRef.current;
        if (!el || typeof IntersectionObserver === 'undefined') return undefined;

        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0]?.isIntersecting) {
                    onLoadMore();
                }
            },
            { rootMargin: '200px' }
        );

        observer.observe(el);
        return () => observer.disconnect();
    }, [hasMore, onLoadMore]);

    if (totalItems === 0) return null;

    return (
        <div ref={sentinelRef} className="endless-scroll-footer">
            {hasMore ? (
                <button
                    type="button"
                    className="endless-load-more-btn"
                    onClick={onLoadMore}
                >
                    Load More ({visibleCount} of {totalItems} shown)
                </button>
            ) : (
                <span className="endless-all-loaded">
                    All {totalItems} recipes loaded
                </span>
            )}
        </div>
    );
};
