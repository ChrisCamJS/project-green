// src/components/RecipeIdeaActions.jsx
import React from 'react';
import { useNavigate } from 'react-router-dom';
import './RecipeIdeaActions.css';

/**
 * Renders quick-launch Flavor Forge buttons ("Create Recipe" / "Create Masterpiece")
 * for structured recipe ideas suggested by Emma inside any chat interface.
 */
export default function RecipeIdeaActions({
  ideas = [],
  compact = false,
  onSelectIdea = null,
  onBeforeNavigate = null,
}) {
  const navigate = useNavigate();

  if (!Array.isArray(ideas) || ideas.length === 0) {
    return null;
  }

  const handleLaunch = (mode, idea) => {
    const payload = {
      mode,
      prompt: idea.prompt,
      title: idea.title,
    };

    if (typeof onSelectIdea === 'function') {
      onSelectIdea(payload);
      return;
    }

    if (typeof onBeforeNavigate === 'function') {
      onBeforeNavigate(payload);
    }

    navigate('/engine', {
      state: {
        prefillMode: mode,
        prefillPrompt: idea.prompt,
        prefillTitle: idea.title,
      },
    });
  };

  return (
    <div
      className={`recipe-idea-actions ${compact ? 'compact' : ''}`}
      aria-label="Forge suggested recipe ideas in Emma's Flavor Forge"
    >
      <div className="recipe-idea-actions-header">
        ✨ Forge any of these ideas in Emma&apos;s Flavor Forge:
      </div>
      <div className="recipe-idea-list">
        {ideas.map((idea, idx) => (
          <div key={`${idea.title}-${idx}`} className="recipe-idea-row">
            <div className="recipe-idea-title" title={idea.prompt}>
              {idea.title}
            </div>
            <div className="recipe-idea-buttons">
              <button
                type="button"
                className="recipe-idea-btn draft-btn"
                onClick={() => handleLaunch('draft', idea)}
                title="Open Flavor Forge in Create Recipe mode with this idea pre-filled"
              >
                📝 Create Recipe
              </button>
              <button
                type="button"
                className="recipe-idea-btn masterpiece-btn"
                onClick={() => handleLaunch('full', idea)}
                title="Open Flavor Forge in Create Masterpiece mode (1 Token) with this idea pre-filled"
              >
                📸 Create Masterpiece
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
