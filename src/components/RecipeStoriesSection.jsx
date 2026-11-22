import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import StoryCard from './StoryCard';
import './RecipeStoriesSection.css';

const STORIES_PER_PAGE = 6;

const RecipeStoriesSection = ({ recipeId, recipeTitle, onWriteStory, refreshTrigger = 0 }) => {
  const [stories, setStories] = useState([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);

  const handleSelectPage = (nextPage) => {
    if (nextPage === page || nextPage < 1 || nextPage > totalPages) return;
    setLoading(true);
    setPage(nextPage);
  };

  useEffect(() => {
    if (!recipeId) return undefined;
    let cancelled = false;

    api
      .getStories({ recipeId, page, perPage: STORIES_PER_PAGE })
      .then((res) => {
        if (cancelled) return;
        if (res?.success) {
          setStories(Array.isArray(res.stories) ? res.stories : []);
          setTotal(Number(res.total || 0));
          setTotalPages(Math.max(1, Number(res.totalPages || 1)));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setStories([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [recipeId, page, refreshTrigger]);

  const pageNumbers = [];
  for (let p = 1; p <= totalPages; p += 1) {
    pageNumbers.push(p);
  }

  return (
    <section
      className="recipe-stories-section no-print"
      aria-label={`Community stories about ${recipeTitle || 'this recipe'}`}
    >
      <div className="recipe-stories-header">
        <div className="recipe-stories-title-wrap">
          <span className="recipe-stories-kicker">📖 Kitchen Journals &amp; Table Memories</span>
          <h2 className="recipe-stories-heading">
            Community Stories {total > 0 ? `(${total})` : ''}
          </h2>
          <p className="recipe-stories-sub">
            Read how fellow Veggie Vault chefs cooked, served, and shared{' '}
            <strong>{recipeTitle || 'this dish'}</strong>—or publish your own blog post!
          </p>
        </div>

        <button
          type="button"
          className="recipe-stories-cta-btn"
          onClick={onWriteStory}
        >
          ✍️ Share Your Story
        </button>
      </div>

      {loading ? (
        <div className="recipe-stories-loading">
          <span>Loading community stories...</span>
        </div>
      ) : stories.length > 0 ? (
        <>
          <div className="recipe-stories-grid">
            {stories.map((story) => (
              <StoryCard key={story.id} story={story} />
            ))}
          </div>

          {totalPages > 1 && (
            <nav className="recipe-stories-pagination" aria-label="Stories pagination">
              <button
                type="button"
                className="recipe-stories-page-btn"
                disabled={page <= 1}
                onClick={() => handleSelectPage(page - 1)}
              >
                ← Previous
              </button>

              <div className="recipe-stories-page-numbers">
                {pageNumbers.map((num) => (
                  <button
                    key={num}
                    type="button"
                    className={`recipe-stories-page-num ${num === page ? 'active' : ''}`}
                    aria-current={num === page ? 'page' : undefined}
                    onClick={() => handleSelectPage(num)}
                  >
                    {num}
                  </button>
                ))}
              </div>

              <button
                type="button"
                className="recipe-stories-page-btn"
                disabled={page >= totalPages}
                onClick={() => handleSelectPage(page + 1)}
              >
                Next →
              </button>
            </nav>
          )}
        </>
      ) : (
        <div className="recipe-stories-empty">
          <div className="recipe-stories-empty-icon" aria-hidden="true">
            📖
          </div>
          <h3>No stories written for this recipe yet</h3>
          <p>
            Did you cook <strong>{recipeTitle || 'this recipe'}</strong> for a family dinner, potluck, or meal prep Sunday? Write the first story and share your photos!
          </p>
          <button
            type="button"
            className="recipe-stories-cta-btn"
            onClick={onWriteStory}
          >
            ✍️ Be the First to Share a Story
          </button>
        </div>
      )}
    </section>
  );
};

export default RecipeStoriesSection;
