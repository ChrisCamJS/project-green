import React, { useState, useEffect, useRef } from 'react';
import './RecipeViewControls.css';

const VIEW_MODE_OPTIONS = [
    { value: '6', label: '6 per page' },
    { value: '10', label: '10 per page' },
    { value: '15', label: '15 per page' },
    { value: 'endless', label: 'Endless Scroll' },
];

export const RecipeViewControls = ({ viewMode, onChange, totalItems, itemLabel = 'recipes' }) => {
    const [open, setOpen] = useState(false);
    const menuRef = useRef(null);
    const currentValue = String(viewMode);
    const activeOption = VIEW_MODE_OPTIONS.find((opt) => opt.value === currentValue) || VIEW_MODE_OPTIONS[0];

    useEffect(() => {
        if (!open) return undefined;
        const onOutside = (e) => {
            if (menuRef.current && !menuRef.current.contains(e.target)) {
                setOpen(false);
            }
        };
        const onKeyDown = (e) => {
            if (e.key === 'Escape') {
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', onOutside);
        document.addEventListener('touchstart', onOutside, { passive: true });
        document.addEventListener('keydown', onKeyDown);
        return () => {
            document.removeEventListener('mousedown', onOutside);
            document.removeEventListener('touchstart', onOutside);
            document.removeEventListener('keydown', onKeyDown);
        };
    }, [open]);

    return (
        <div className="recipe-view-controls">
            <span className="recipe-view-total">
                {totalItems} {itemLabel}
            </span>
            <div className="recipe-view-label" ref={menuRef}>
                <span>View:</span>
                <div className="rvc-dropdown-wrap">
                    <button
                        type="button"
                        className={`rvc-dropdown-btn ${open ? 'active' : ''}`}
                        onClick={() => setOpen((prev) => !prev)}
                        aria-expanded={open}
                        aria-haspopup="listbox"
                        aria-label="Recipes per page or endless scroll"
                    >
                        <span>{activeOption.label}</span>
                        <span aria-hidden="true">{open ? '▲' : '▼'}</span>
                    </button>

                    {open && (
                        <div className="rvc-dropdown-menu" role="listbox" aria-label="View options">
                            <div className="rvc-section-title">View Mode</div>
                            <div className="rvc-pills">
                                {VIEW_MODE_OPTIONS.map((opt) => {
                                    const isActive = opt.value === currentValue;
                                    return (
                                        <button
                                            key={opt.value}
                                            type="button"
                                            role="option"
                                            aria-selected={isActive}
                                            className={`rvc-pill ${isActive ? 'active' : ''}`}
                                            onClick={() => {
                                                onChange(opt.value);
                                                setOpen(false);
                                            }}
                                        >
                                            <span>{opt.label}</span>
                                            {isActive && <span className="rvc-check" aria-hidden="true">✓</span>}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
            </div>
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
