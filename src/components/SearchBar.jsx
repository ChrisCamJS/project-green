// src/components/SearchBar.jsx
import React from 'react';
import './SearchBar.css';

export default function SearchBar({ searchQuery, onSearchChange }) {
  return (
    <div className="search-bar-container">
      <input
        type="text"
        placeholder="Search recipes, ingredients, or tags (e.g., gluten-free, oil-free)..."
        value={searchQuery}
        onChange={(e) => onSearchChange(e.target.value)}
        className="search-input"
      />
      {searchQuery && (
        <button 
          type="button" 
          onClick={() => onSearchChange('')}
          className="clear-search-btn"
          aria-label="Clear search"
        >
          ×
        </button>
      )}
    </div>
  );
}