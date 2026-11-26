import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { api } from '../services/api';
import styles from './AdminDashboard.module.css';
import { useToast } from '../context/ToastContext';
import AdminEmmaChat from '../components/AdminEmmaChat';
import AdminEmmaContextPanel from '../components/AdminEmmaContextPanel';
import AdminUsagePanel from '../components/AdminUsagePanel';
import VariantBadge from '../components/VariantBadge';
import StoryEditorModal from '../components/StoryEditorModal';
import { formatStoryDate } from '../utils/storyUtils';
import { cleanRecipeYields } from '../utils/promptBuilder';
import { RecipeViewControls, EndlessScrollSentinel } from '../components/RecipeViewControls';

/**
 * AdminDashboard Component
 * The restricted area for managing The Veggie Vault.
 * Includes forms for adding recipes, moderation, and VIP beta access.
 */
const AdminDashboard = () => {
  const { addToast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  const [activeTab, setActiveTab] = useState(location.state?.activeTab || 'manage');

  // --- Manage Recipes State ---
  const [recipes, setRecipes] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [viewMode, setViewMode] = useState('6');
  const [endlessCount, setEndlessCount] = useState(10);
  const [manageSearchQuery, setManageSearchQuery] = useState('');
  const [variantFilter, setVariantFilter] = useState('all'); // 'all' | 'original' | 'variants' | 'masterpiece_variants'

  // --- Add Recipe State ---
  const [rawPaste, setRawPaste] = useState('');
  const [recipeForm, setRecipeForm] = useState({
      title: '', description: '', yields: '', prepTime: '', cookTime: '', 
      ingredients: '', instructions: '', nutritionInfo: '', notes: '', imageUrl: '' 
  });

  // --- Invite Codes State ---
  const [inviteCodes, setInviteCodes] = useState([]);
  const [newInviteInput, setNewInviteInput] = useState('');
  const [newInviteMaxUses, setNewInviteMaxUses] = useState('');
  const [newInviteExpiresAt, setNewInviteExpiresAt] = useState('');
  const recipesLoadedRef = useRef(false);
  const invitesLoadedRef = useRef(false);

  // --- Manage Stories State ---
  const [adminStories, setAdminStories] = useState([]);
  const [storiesLoaded, setStoriesLoaded] = useState(false);
  const [storySearchQuery, setStorySearchQuery] = useState('');
  const [storyStatusFilter, setStoryStatusFilter] = useState('all'); // 'all' | 'published' | 'draft'
  const [storyPage, setStoryPage] = useState(1);
  const [storyViewMode, setStoryViewMode] = useState('6');
  const [storyEndlessCount, setStoryEndlessCount] = useState(10);
  const [editingStory, setEditingStory] = useState(null);
  const [loadingEditStoryId, setLoadingEditStoryId] = useState(null);
  const storiesLoadedRef = useRef(false);

  const loadAdminStories = useCallback(async () => {
    try {
      const data = await api.getAdminStories();
      if (data?.success) {
        setAdminStories(Array.isArray(data.stories) ? data.stories : []);
      }
      setStoriesLoaded(true);
      storiesLoadedRef.current = true;
    } catch (err) {
      addToast(err?.message || 'Failed to load stories', 'error');
      setStoriesLoaded(true);
    }
  }, [addToast]);

  const loadRecipes = useCallback(async () => {
    try {
      const response = await api.getRecipes();
      setRecipes(response);
      recipesLoadedRef.current = true;
    } catch (err) {
      addToast('Failed to load the recipes', err, 'error');
    }
  }, [addToast]);

  const loadInvites = useCallback(async () => {
    try {
      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/admin/invites`, {
        method: 'GET',
        credentials: 'include', // <-- Hand over the session cookie!
      });
      const data = await response.json();
      if (data.success) setInviteCodes(data.codes);
      invitesLoadedRef.current = true;
    } catch {
      addToast('Failed to load invite codes', 'error');
    }
  }, [addToast]);

  // ----------------------------------------------------
  // RECIPE PARSING & ADDING LOGIC
  // ----------------------------------------------------
  const handleParse = (e) => {
    e.preventDefault();
    const text = rawPaste;

    const extractLine = (regex) => {
      const match = text.match(regex);
      return match ? match[1].trim() : '';
    }

    const extractBlock = (startRegex, endRegex) => {
      const regex = new RegExp(`${startRegex}[\\s\\S]*?(?=${endRegex}|$)`, 'i');
      const match = text.match(regex);
      return match ? match[0].replace(new RegExp(startRegex, 'i'), '').trim() : '';
    }
    
    setRecipeForm({
        title: extractLine(/Title:\s*(.+)/i),
        description: extractLine(/Description:\s*(.+)/i),
        yields: cleanRecipeYields(extractLine(/Yields:\s*(.+)/i)),
        prepTime: extractLine(/Prep(?: Time)?:\s*(\d+)/i),
        cookTime: extractLine(/Cook(?: Time)?:\s*(\d+)/i),
        ingredients: extractBlock('Ingredients:', 'Instructions:'),
        instructions: extractBlock('Instructions:', 'Nutrition:'),
        nutritionInfo: extractBlock('Nutrition:', 'Notes:'),
        notes: extractBlock('Notes:', 'END_OF_FILE_MATCH_THAT_DOESNT_EXIST'),
        imageUrl: '' 
    });
  }

  const handleFormChange = (e) => {
    const {name, value} = e.target;
    setRecipeForm(prev => ({...prev, [name]: value}));
  }

  const handleImageUpload = async (e) => {
    const files = e.target.files;
    if (!files.length) return;
    
    const formData = new FormData();
    for (let i = 0; i < files.length; i++) {
      formData.append('images[]', files[i]);
    }

    try {
      const response = await api.uploadImages(formData);
      if (response.success) {
        const newUrls = response.urls.join(',');
        setRecipeForm(prev => ({
          ...prev,
          imageUrl: prev.imageUrl ? `${prev.imageUrl},${newUrls}` : newUrls
        }));
        addToast('Images successfully uploaded to the Vault!', 'success');
      }
    } catch (err) {
      console.error('Upload failed:', err);
      addToast('Upload failed:', err, 'error');
    }
  }

  const handleAddSubmit = async (e) => {
    e.preventDefault();
    const formattedData = {
      ...recipeForm,
      ingredients: recipeForm.ingredients.split('\n').filter(line => line.trim() !== ''),
      instructions: recipeForm.instructions.split('\n').filter(line => line.trim() !== ''),
      nutritionInfo: recipeForm.nutritionInfo.split('\n').filter(line => line.trim() !== ''),
    };

    try {
      const response = await api.addRecipe(formattedData);
      if (response.success) {
          addToast('Masterpiece successfully Vaulted! ✨', 'success');
          setRawPaste('');
          setRecipeForm({ title: '', description: '', yields: '', prepTime: '', cookTime: '', ingredients: '', instructions: '', nutritionInfo: '', notes: '', imageUrl: '', isDraft: false});
          loadRecipes();
      }
    } catch (err) {
      addToast("Failed to add recipe:", err, 'error');
    }
  }

  // ----------------------------------------------------
  // MANAGE RECIPES LOGIC
  // ----------------------------------------------------
  useEffect(() => {
    let active = true;
    if (activeTab === 'manage' && !recipesLoadedRef.current) {
      api
        .getRecipes()
        .then((response) => {
          if (!active) return;
          setRecipes(response);
          recipesLoadedRef.current = true;
        })
        .catch((err) => {
          if (active) addToast('Failed to load the recipes', err, 'error');
        });
    } else if (activeTab === 'invites' && !invitesLoadedRef.current) {
      fetch(`${import.meta.env.VITE_API_BASE_URL}/admin/invites`, {
        method: 'GET',
        credentials: 'include',
      })
        .then((res) => res.json())
        .then((data) => {
          if (!active) return;
          if (data.success) setInviteCodes(data.codes);
          invitesLoadedRef.current = true;
        })
        .catch(() => {
          if (active) addToast('Failed to load invite codes', 'error');
        });
    } else if (activeTab === 'stories' && !storiesLoadedRef.current) {
      api
        .getAdminStories()
        .then((data) => {
          if (!active) return;
          if (data?.success) {
            setAdminStories(Array.isArray(data.stories) ? data.stories : []);
          }
          setStoriesLoaded(true);
          storiesLoadedRef.current = true;
        })
        .catch((err) => {
          if (active) {
            addToast(err?.message || 'Failed to load stories', 'error');
            setStoriesLoaded(true);
          }
        });
    }
    return () => {
      active = false;
    };
  }, [activeTab, addToast]);

  const handleEdit = (id) => navigate(`/admin/edit/${id}`);

  const handleDelete = async (id) => {
    if (window.confirm("Are you sure you want to delete this recipe?")) {
      try {
        const response = await api.deleteRecipe(id);
        if (response?.success) {
          setRecipes(prev => prev.filter(recipe => recipe.id !== id));
          addToast("Recipe successfully banished from the Vault!", 'success');
        }
      } catch (err) {
          addToast("The Vault resists! Failed to delete the recipe.", 'error');
          console.error("Delete error:", err);
      }
    }
  };

  const handleToggleDraft = async (id) => {
    try {
        const recipeToUpdate = recipes.find(r => r.id === id);
        
        // Flip the database value (1 becomes 0, 0 becomes 1)
        const newPublicStatus = recipeToUpdate.is_public ? 0 : 1; 
        
        // Hit the API (ensure your toggleDraft endpoint accepts is_public)
        const response = await api.toggleDraft(id, newPublicStatus);
        
        if (response.success) {
            setRecipes(prev => prev.map(recipe => 
                recipe.id === id ? { ...recipe, is_public: newPublicStatus } : recipe
            ));
        }
    } catch (err) {
        addToast("Failed to toggle visibility status:", err, 'error');
    }
  };

  const handleViewModeChange = (nextMode) => {
    setViewMode(nextMode);
    setCurrentPage(1);
    setEndlessCount(10);
  };

  const handleLoadMoreEndless = useCallback(() => {
    setEndlessCount((prev) => prev + 10);
  }, []);

  const handleManageSearchChange = (e) => {
    setManageSearchQuery(e.target.value);
    setCurrentPage(1);
    setEndlessCount(10);
  };

  const handleVariantFilterChange = (nextFilter) => {
    setVariantFilter(nextFilter);
    setCurrentPage(1);
    setEndlessCount(10);
  };

  const handleClearManageFilters = () => {
    setManageSearchQuery('');
    setVariantFilter('all');
    setCurrentPage(1);
    setEndlessCount(10);
  };

  // Counts for variant filter pills
  const variantCounts = useMemo(() => {
    let original = 0;
    let variants = 0;
    let masterpieceVariants = 0;
    for (const r of recipes) {
      const parentId = r.parentRecipeId || r.parent_recipe_id || null;
      const isVar = Boolean(parentId || r.isVariant);
      const isMast = Boolean(r.isMasterpiece || r.is_masterpiece);
      if (isVar) {
        variants += 1;
        if (isMast) masterpieceVariants += 1;
      } else {
        original += 1;
      }
    }
    return {
      all: recipes.length,
      original,
      variants,
      masterpieceVariants,
    };
  }, [recipes]);

  // Filtered & sorted recipes for Manage tab
  const filteredSortedRecipes = useMemo(() => {
    const q = manageSearchQuery.trim().toLowerCase();
    const numericIdQuery = q.replace(/^#/, '');

    return [...recipes]
      .filter((r) => {
        const parentId = r.parentRecipeId || r.parent_recipe_id || null;
        const isVar = Boolean(parentId || r.isVariant);
        const isMast = Boolean(r.isMasterpiece || r.is_masterpiece);

        if (variantFilter === 'original' && isVar) return false;
        if (variantFilter === 'variants' && !isVar) return false;
        if (variantFilter === 'masterpiece_variants' && (!isVar || !isMast)) return false;

        if (!q) return true;

        const idMatch = String(r.id) === numericIdQuery || String(r.id).includes(numericIdQuery);
        const titleMatch = String(r.title || '').toLowerCase().includes(q);
        const authorMatch = String(r.authorName || r.username || '').toLowerCase().includes(q);
        const descMatch = String(r.description || '').toLowerCase().includes(q);
        const parentTitleMatch = String(r.parentRecipeTitle || '').toLowerCase().includes(q);
        const summaryMatch = String(r.variantSummary || r.variant_summary || '').toLowerCase().includes(q);

        return idMatch || titleMatch || authorMatch || descMatch || parentTitleMatch || summaryMatch;
      })
      .sort((a, b) => b.id - a.id);
  }, [recipes, manageSearchQuery, variantFilter]);

  // Pagination math
  const isEndless = viewMode === 'endless';
  const itemsPerPage = isEndless ? filteredSortedRecipes.length || 1 : Number(viewMode) || 6;
  const indexOfLastRecipe = currentPage * itemsPerPage;
  const indexOfFirstRecipe = indexOfLastRecipe - itemsPerPage;
  const currentRecipes = isEndless
    ? filteredSortedRecipes.slice(0, endlessCount)
    : filteredSortedRecipes.slice(indexOfFirstRecipe, indexOfLastRecipe);
  const totalPages = Math.ceil(filteredSortedRecipes.length / itemsPerPage);

  // ----------------------------------------------------
  // MANAGE STORIES LOGIC
  // ----------------------------------------------------
  const handleToggleStoryStatus = async (story) => {
    const nextStatus = story.status === 'published' ? 'draft' : 'published';
    try {
      const response = await api.updateStory({ id: story.id, status: nextStatus });
      if (response?.success) {
        setAdminStories((prev) =>
          prev.map((s) => (s.id === story.id ? { ...s, status: nextStatus } : s))
        );
        addToast(
          nextStatus === 'published' ? 'Story published!' : 'Story moved to Draft.',
          'success'
        );
      }
    } catch (err) {
      addToast(err?.message || 'Failed to update story status.', 'error');
    }
  };

  const handleEditStory = async (story) => {
    if (!story?.slug || loadingEditStoryId) return;
    setLoadingEditStoryId(story.id);
    try {
      const res = await api.getStoryBySlug(story.slug);
      if (res?.success && res.story) {
        setEditingStory(res.story);
      } else {
        throw new Error(res?.message || 'Could not load story body for editing.');
      }
    } catch (err) {
      addToast(err?.message || 'Could not load story for editing.', 'error');
    } finally {
      setLoadingEditStoryId(null);
    }
  };

  const handleDeleteStory = async (story) => {
    if (!window.confirm(`Are you sure you want to delete the story "${story.title}"? This cannot be undone.`)) {
      return;
    }
    try {
      const response = await api.deleteStory(story.id);
      if (response?.success) {
        setAdminStories((prev) => prev.filter((s) => s.id !== story.id));
        addToast('Story deleted from the Vault!', 'success');
      }
    } catch (err) {
      addToast(err?.message || 'Failed to delete story.', 'error');
    }
  };

  const handleStoryViewModeChange = (nextMode) => {
    setStoryViewMode(nextMode);
    setStoryPage(1);
    setStoryEndlessCount(10);
  };

  const handleLoadMoreStoriesEndless = useCallback(() => {
    setStoryEndlessCount((prev) => prev + 10);
  }, []);

  const handleStorySearchChange = (e) => {
    setStorySearchQuery(e.target.value);
    setStoryPage(1);
    setStoryEndlessCount(10);
  };

  const handleStoryStatusFilterChange = (nextStatus) => {
    setStoryStatusFilter(nextStatus);
    setStoryPage(1);
    setStoryEndlessCount(10);
  };

  const handleClearStoryFilters = () => {
    setStorySearchQuery('');
    setStoryStatusFilter('all');
    setStoryPage(1);
    setStoryEndlessCount(10);
  };

  const storyStatusCounts = useMemo(() => {
    let published = 0;
    let draft = 0;
    for (const s of adminStories) {
      if ((s.status || 'published') === 'draft') {
        draft += 1;
      } else {
        published += 1;
      }
    }
    return {
      all: adminStories.length,
      published,
      draft,
    };
  }, [adminStories]);

  const filteredAdminStories = useMemo(() => {
    const q = storySearchQuery.trim().toLowerCase();
    const numericIdQuery = q.replace(/^#/, '');

    return adminStories.filter((s) => {
      const status = s.status || 'published';
      if (storyStatusFilter === 'published' && status !== 'published') return false;
      if (storyStatusFilter === 'draft' && status !== 'draft') return false;

      if (!q) return true;

      const idMatch = String(s.id) === numericIdQuery || String(s.id).includes(numericIdQuery);
      const titleMatch = String(s.title || '').toLowerCase().includes(q);
      const slugMatch = String(s.slug || '').toLowerCase().includes(q);
      const excerptMatch = String(s.excerpt || '').toLowerCase().includes(q);
      const authorMatch = String(s.authorName || '').toLowerCase().includes(q);
      const displayMatch = String(s.authorDisplayName || '').toLowerCase().includes(q);
      const recipeMatch = String(s.recipeTitle || '').toLowerCase().includes(q);

      return idMatch || titleMatch || slugMatch || excerptMatch || authorMatch || displayMatch || recipeMatch;
    });
  }, [adminStories, storySearchQuery, storyStatusFilter]);

  const isStoryEndless = storyViewMode === 'endless';
  const storyItemsPerPage = isStoryEndless ? filteredAdminStories.length || 1 : Number(storyViewMode) || 6;
  const indexOfLastStory = storyPage * storyItemsPerPage;
  const indexOfFirstStory = indexOfLastStory - storyItemsPerPage;
  const currentStories = isStoryEndless
    ? filteredAdminStories.slice(0, storyEndlessCount)
    : filteredAdminStories.slice(indexOfFirstStory, indexOfLastStory);
  const totalStoryPages = Math.ceil(filteredAdminStories.length / storyItemsPerPage);

  // ----------------------------------------------------
  // VIP INVITE CODE LOGIC
  // ----------------------------------------------------
  const handleGenerateInvite = async (e) => {
    e.preventDefault();
    try {
      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/admin/invites`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          code: newInviteInput,
          max_uses: newInviteMaxUses === '' ? null : Number(newInviteMaxUses),
          expires_at: newInviteExpiresAt || null,
        })
      });
      const data = await response.json();
      
      if (data.success) {
        addToast(data.message, 'success');
        setNewInviteInput('');
        setNewInviteMaxUses('');
        setNewInviteExpiresAt('');
        loadInvites();
      } else {
        addToast(data.message || 'Failed to generate code.', 'error');
      }
    } catch {
      addToast("Failed to generate code.", 'error');
    }
  };

  const handleToggleInvite = async (id, currentStatus) => {
    try {
      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/admin/invites/toggle`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ id, is_active: !currentStatus })
      });
      const data = await response.json();
      
      if (data.success) {
        addToast(data.message, 'success');
        await loadInvites();
      } else {
        addToast(data.message || 'Failed to update code status.', 'error');
      }
    } catch {
      addToast("Failed to toggle code.", 'error');
    }
  };

  return (
    <div className={styles.adminContainer}>
      <header className={styles.adminHeader}>
        <h2>Admin Vault Control</h2>
        <div className={styles.adminTabs}>
          <button 
            className={activeTab === 'manage' ? styles.active : ''} 
            onClick={() => setActiveTab('manage')}
          >
            Manage Recipes
          </button>
          <button 
            className={activeTab === 'stories' ? styles.active : ''} 
            onClick={() => setActiveTab('stories')}
          >
            📖 Manage Stories
          </button>
          <button 
            className={activeTab === 'invites' ? styles.active : ''} 
            onClick={() => setActiveTab('invites')}
          >
            Manage Invites
          </button>
          <button 
            className={activeTab === 'emma' ? styles.active : ''} 
            onClick={() => setActiveTab('emma')}
          >
            🤖 Emma DB Assistant
          </button>
          <button 
            className={activeTab === 'context' ? styles.active : ''} 
            onClick={() => setActiveTab('context')}
          >
            🧠 Emma Context
          </button>
          <button 
            className={activeTab === 'usage' ? styles.active : ''} 
            onClick={() => setActiveTab('usage')}
          >
            📊 Users &amp; Tokens
          </button>
          <button 
            className={activeTab === 'add' ? styles.active : ''} 
            onClick={() => setActiveTab('add')}
          >
            Add New Recipe
          </button>
        </div>
      </header>

      <main className={styles.adminContentArea}>
        
        {/* TAB 1: ADD NEW RECIPE */}
        {activeTab === 'add' && (
          <section className={styles.addRecipeSection}>
            <h3>Secure Entry: New Recipe</h3>
            <div className={styles.pasteZone}>
                <label className={styles.parseLabel}>Paste Recipe Data Below...</label>
                <textarea 
                    className={styles.parseInput}
                    rows="8" 
                    placeholder="Paste your full recipe format here (Title: ..., Description: ..., Ingredients: ...)"
                    value={rawPaste}
                    onChange={(e) => setRawPaste(e.target.value)}
                />
                <button type="button" onClick={handleParse} className={styles.parseBtn}>
                    Magic Parse
                </button>
            </div>
            <hr className={styles.divider} />
            <form onSubmit={handleAddSubmit} className={styles.adminForm}>
              <div className={styles.formRow}>
                  <div className={styles.formGroup}>
                    <label>Recipe Title</label>
                    <input type="text" name="title" value={recipeForm.title} onChange={handleFormChange} required />
                  </div>
                  <div className={styles.formGroup}>
                    <label>Yields</label>
                    <input type="text" name="yields" value={recipeForm.yields} onChange={handleFormChange} placeholder="e.g. 4 servings" />
                  </div>
              </div>

              <div className={styles.formGroup}>
                  <label>Description</label>
                  <textarea name="description" rows="2" value={recipeForm.description} onChange={handleFormChange} required />
              </div>

              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label>Prep Time (mins)</label>
                  <input type="number" name="prepTime" value={recipeForm.prepTime} onChange={handleFormChange} required />
                </div>
                <div className={styles.formGroup}>
                  <label>Cook Time (mins)</label>
                  <input type="number" name="cookTime" value={recipeForm.cookTime} onChange={handleFormChange} required />
                </div>
              </div>

              <div className={styles.formRow}>
                  <div className={styles.formGroup}>
                      <label>Ingredients (One per line)</label>
                      <textarea name="ingredients" rows="6" value={recipeForm.ingredients} onChange={handleFormChange} required />
                  </div>
                  <div className={styles.formGroup}>
                      <label>Instructions (One per line)</label>
                      <textarea name="instructions" rows="6" value={recipeForm.instructions} onChange={handleFormChange} required />
                  </div>
              </div>

              <div className={styles.formRow}>
                  <div className={styles.formGroup}>
                      <label>Macros & 15 Micros (One per line + Daily Values & Math)</label>
                      <textarea name="nutritionInfo" rows="6" value={recipeForm.nutritionInfo} onChange={handleFormChange} required />
                  </div>
                  <div className={styles.formGroup}>
                      <label>Oil-Free Rationale / Notes</label>
                      <textarea name="notes" rows="6" value={recipeForm.notes} onChange={handleFormChange} placeholder="Explicit rationale for any overt fats..." required />
                  </div>
              </div>

              <div className={styles.formRow}>
                  <div className={styles.formGroup}>
                      <label>Image URLs (Comma separated or use the uploader)</label>
                      <input 
                          type="text" 
                          name="imageUrl" 
                          value={recipeForm.imageUrl} 
                          onChange={handleFormChange} 
                          placeholder="/images/pic1.jpg, /images/pic2.jpg" 
                      />
                  </div>
                  <div className={styles.formGroup}>
                      <label>Upload Directly to Vault</label>
                      <input 
                          type="file" 
                          multiple 
                          accept="image/*" 
                          onChange={handleImageUpload} 
                          style={{ padding: '10px 0' }} 
                      />
                  </div>
              </div>

              <button type="submit" className={styles.saveBtn}>Vault This Recipe</button>
            </form>
          </section>
        )}

        {/* TAB 2: MANAGE RECIPES */}
        {activeTab === 'manage' && (
          <section className={styles.manageRecipes}>
            <div className={styles.manageHeaderRow}>
              <h3 className={styles.manageHeading}>Manage Veggie Vault Inventory</h3>
              <div className={styles.manageViewControlsWrap}>
                <RecipeViewControls
                  viewMode={viewMode}
                  onChange={handleViewModeChange}
                  totalItems={filteredSortedRecipes.length}
                />
              </div>
            </div>

            {/* Search & Variant Filter Toolbar */}
            <div className={styles.manageFilterToolbar}>
              <div className={styles.manageSearchRow}>
                <div className={styles.manageSearchInputWrap}>
                  <span className={styles.manageSearchIcon} aria-hidden="true">🔍</span>
                  <input
                    type="search"
                    className={styles.manageSearchInput}
                    value={manageSearchQuery}
                    onChange={handleManageSearchChange}
                    placeholder="Search title, #ID, chef, or variant..."
                    aria-label="Search manage recipes"
                  />
                  {manageSearchQuery && (
                    <button
                      type="button"
                      className={styles.manageSearchClearBtn}
                      onClick={() => {
                        setManageSearchQuery('');
                        setCurrentPage(1);
                        setEndlessCount(10);
                      }}
                      aria-label="Clear search"
                    >
                      ✕
                    </button>
                  )}
                </div>

                <span className={styles.manageResultCount}>
                  Showing <strong>{filteredSortedRecipes.length}</strong> of <strong>{recipes.length}</strong> recipes
                </span>
              </div>

              <div className={styles.manageVariantFilterRow} role="group" aria-label="Filter by recipe variant status">
                <button
                  type="button"
                  className={`${styles.variantFilterPill} ${variantFilter === 'all' ? styles.variantFilterActive : ''}`}
                  onClick={() => handleVariantFilterChange('all')}
                >
                  <span>All Recipes</span>
                  <span className={styles.filterCountBadge}>{variantCounts.all}</span>
                </button>
                <button
                  type="button"
                  className={`${styles.variantFilterPill} ${variantFilter === 'original' ? styles.variantFilterActive : ''}`}
                  onClick={() => handleVariantFilterChange('original')}
                >
                  <span>🍽️ Originals</span>
                  <span className={styles.filterCountBadge}>{variantCounts.original}</span>
                </button>
                <button
                  type="button"
                  className={`${styles.variantFilterPill} ${variantFilter === 'variants' ? styles.variantFilterActive : ''}`}
                  onClick={() => handleVariantFilterChange('variants')}
                >
                  <span>🔀 Variants</span>
                  <span className={styles.filterCountBadge}>{variantCounts.variants}</span>
                </button>
                <button
                  type="button"
                  className={`${styles.variantFilterPill} ${variantFilter === 'masterpiece_variants' ? styles.variantFilterActive : ''}`}
                  onClick={() => handleVariantFilterChange('masterpiece_variants')}
                >
                  <span>✨ Masterpieces</span>
                  <span className={styles.filterCountBadge}>{variantCounts.masterpieceVariants}</span>
                </button>
              </div>

              {(manageSearchQuery || variantFilter !== 'all') && (
                <div className={styles.manageActiveFilterBar}>
                  <button
                    type="button"
                    className={styles.manageResetFiltersBtn}
                    onClick={handleClearManageFilters}
                  >
                    ✕ Reset Active Filters
                  </button>
                </div>
              )}
            </div>
            
            {recipes.length === 0 ? (
                <p>Loading your culinary masterpieces...</p>
            ) : filteredSortedRecipes.length === 0 ? (
                <div className={styles.manageEmptyState}>
                  <p>No recipes match your current search or variant filter.</p>
                  <button
                    type="button"
                    className={styles.manageResetFiltersBtn}
                    onClick={handleClearManageFilters}
                  >
                    Clear Search &amp; Filters
                  </button>
                </div>
            ) : (
                <>
                    <div className={styles.recipeList}>
                        {currentRecipes.map(recipe => {
                            const parentId = recipe.parentRecipeId || recipe.parent_recipe_id || null;
                            const isVar = Boolean(parentId || recipe.isVariant);
                            const isMast = Boolean(recipe.isMasterpiece || recipe.is_masterpiece);
                            const parentTitle = recipe.parentRecipeTitle || 'Original Recipe';
                            const parentAuthor = recipe.parentAuthorName || 'Emma (AI)';
                            const varSummary = recipe.variantSummary || recipe.variant_summary || null;
                            const isPublic = Boolean(recipe.is_public ?? recipe.isPublic);

                            return (
                            <div key={recipe.id} className={styles.recipeListItem}>
                                <div className={styles.recipeInfo}>
                                    <div className={styles.recipeTitleLine}>
                                        <span className={styles.recipeIdChip}>#{recipe.id}</span>
                                        <span className={isPublic ? styles.statusChipPublic : styles.statusChipDraft}>
                                          {isPublic ? '● Published' : '○ Draft'}
                                        </span>
                                        {isVar && (
                                          <VariantBadge
                                            compact
                                            parentRecipeId={parentId}
                                            parentRecipeTitle={parentTitle}
                                            parentAuthorName={parentAuthor}
                                            isMasterpiece={isMast}
                                            variantSummary={varSummary}
                                          />
                                        )}
                                    </div>

                                    <h4 className={styles.recipeItemTitle}>
                                      <Link to={`/recipe/${recipe.id}`} className={styles.recipeTitleLink}>
                                        {recipe.title}
                                      </Link>
                                    </h4>

                                    <div className={styles.recipeMetaRow}>
                                        <span className={styles.recipeMetaChip}>
                                            👨‍🍳 {recipe.authorName || recipe.username || 'Emma (AI)'}
                                        </span>
                                        {recipe.yields && (
                                          <span className={styles.recipeMetaChip}>
                                              🍽️ {cleanRecipeYields(recipe.yields)}
                                          </span>
                                        )}
                                        {isVar && parentId && (
                                          <span className={styles.recipeVariantMeta}>
                                            🔀 Forked from:{' '}
                                            <Link to={`/recipe/${parentId}`} className={styles.parentRecipeLink}>
                                              #{parentId} {parentTitle}
                                            </Link>
                                          </span>
                                        )}
                                    </div>
                                </div>
                                <div className={styles.recipeActions}>
                                  <button 
                                    type="button"
                                    onClick={() => handleToggleDraft(recipe.id)} 
                                    className={isPublic ? styles.draftBtn : styles.publishBtn}
                                  >
                                    {isPublic ? 'Hide' : 'Publish'}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleEdit(recipe.id)}
                                    className={styles.editBtn}
                                  >
                                    Edit
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDelete(recipe.id)}
                                    className={styles.deleteBtn}
                                  >
                                    Delete
                                  </button>
                                </div>
                            </div>
                            );
                        })}
                    </div>
                    
                    {isEndless ? (
                        <EndlessScrollSentinel
                            hasMore={endlessCount < filteredSortedRecipes.length}
                            onLoadMore={handleLoadMoreEndless}
                            visibleCount={currentRecipes.length}
                            totalItems={filteredSortedRecipes.length}
                        />
                    ) : (
                        <div className={styles.pagination}>
                            <button 
                                disabled={currentPage === 1} 
                                onClick={() => setCurrentPage(prev => prev - 1)}
                                className={styles.pageBtn}
                            >
                                Previous
                            </button>
                            <span>Page {currentPage} of {totalPages || 1}</span>
                            <button 
                                disabled={currentPage === totalPages || totalPages === 0} 
                                onClick={() => setCurrentPage(prev => prev + 1)}
                                className={styles.pageBtn}
                            >
                                Next
                            </button>
                        </div>
                    )}
                </>
            )}
          </section>
        )}

        {/* TAB 2B: MANAGE STORIES */}
        {activeTab === 'stories' && (
          <section className={styles.manageRecipes}>
            <div className={styles.manageHeaderRow}>
              <h3 className={styles.manageHeading}>Manage Community Stories</h3>
              <div className={styles.manageViewControlsWrap}>
                <RecipeViewControls
                  viewMode={storyViewMode}
                  onChange={handleStoryViewModeChange}
                  totalItems={filteredAdminStories.length}
                />
              </div>
            </div>

            {/* Search & Status Filter Toolbar */}
            <div className={styles.manageFilterToolbar}>
              <div className={styles.manageSearchRow}>
                <div className={styles.manageSearchInputWrap}>
                  <span className={styles.manageSearchIcon} aria-hidden="true">🔍</span>
                  <input
                    type="search"
                    className={styles.manageSearchInput}
                    value={storySearchQuery}
                    onChange={handleStorySearchChange}
                    placeholder="Search title, #ID, author, or recipe..."
                    aria-label="Search manage stories"
                  />
                  {storySearchQuery && (
                    <button
                      type="button"
                      className={styles.manageSearchClearBtn}
                      onClick={() => {
                        setStorySearchQuery('');
                        setStoryPage(1);
                        setStoryEndlessCount(10);
                      }}
                      aria-label="Clear search"
                    >
                      ✕
                    </button>
                  )}
                </div>

                <span className={styles.manageResultCount}>
                  Showing <strong>{filteredAdminStories.length}</strong> of <strong>{adminStories.length}</strong> stories
                </span>
              </div>

              <div className={styles.storyStatusFilterRow} role="group" aria-label="Filter stories by publication status">
                <button
                  type="button"
                  className={`${styles.variantFilterPill} ${storyStatusFilter === 'all' ? styles.variantFilterActive : ''}`}
                  onClick={() => handleStoryStatusFilterChange('all')}
                >
                  <span>All Stories</span>
                  <span className={styles.filterCountBadge}>{storyStatusCounts.all}</span>
                </button>
                <button
                  type="button"
                  className={`${styles.variantFilterPill} ${storyStatusFilter === 'published' ? styles.variantFilterActive : ''}`}
                  onClick={() => handleStoryStatusFilterChange('published')}
                >
                  <span>● Published</span>
                  <span className={styles.filterCountBadge}>{storyStatusCounts.published}</span>
                </button>
                <button
                  type="button"
                  className={`${styles.variantFilterPill} ${storyStatusFilter === 'draft' ? styles.variantFilterActive : ''}`}
                  onClick={() => handleStoryStatusFilterChange('draft')}
                >
                  <span>○ Drafts</span>
                  <span className={styles.filterCountBadge}>{storyStatusCounts.draft}</span>
                </button>
              </div>

              {(storySearchQuery || storyStatusFilter !== 'all') && (
                <div className={styles.manageActiveFilterBar}>
                  <button
                    type="button"
                    className={styles.manageResetFiltersBtn}
                    onClick={handleClearStoryFilters}
                  >
                    ✕ Reset Active Filters
                  </button>
                </div>
              )}
            </div>

            {!storiesLoaded ? (
              <p>Loading community stories...</p>
            ) : adminStories.length === 0 ? (
              <div className={styles.manageEmptyState}>
                <p>No community stories have been written yet.</p>
              </div>
            ) : filteredAdminStories.length === 0 ? (
              <div className={styles.manageEmptyState}>
                <p>No stories match your current search or status filter.</p>
                <button
                  type="button"
                  className={styles.manageResetFiltersBtn}
                  onClick={handleClearStoryFilters}
                >
                  Clear Search &amp; Filters
                </button>
              </div>
            ) : (
              <>
                <div className={styles.recipeList}>
                  {currentStories.map((story) => {
                    const isPublished = (story.status || 'published') === 'published';
                    const authorLabel = story.authorDisplayName || story.authorName || 'Vault Chef';
                    const readTime = Math.max(1, Number(story.readTimeMinutes || 1));
                    const likeCount = Number(story.likeCount || 0);
                    const dateLabel = formatStoryDate(story.createdAt);

                    return (
                      <div key={story.id} className={styles.recipeListItem}>
                        <div className={styles.recipeInfo}>
                          <div className={styles.recipeTitleLine}>
                            <span className={styles.recipeIdChip}>#{story.id}</span>
                            <span className={isPublished ? styles.statusChipPublic : styles.statusChipDraft}>
                              {isPublished ? '● Published' : '○ Draft'}
                            </span>
                            <span className={styles.recipeMetaChip}>📖 {readTime} min read</span>
                            {likeCount > 0 && (
                              <span className={styles.recipeMetaChip}>❤️ {likeCount}</span>
                            )}
                          </div>

                          <h4 className={styles.recipeItemTitle}>
                            <Link to={`/stories/${story.slug}`} className={styles.recipeTitleLink}>
                              {story.title}
                            </Link>
                          </h4>

                          {story.excerpt && (
                            <p className={styles.storyAdminExcerpt}>{story.excerpt}</p>
                          )}

                          <div className={styles.recipeMetaRow}>
                            <span className={styles.recipeMetaChip}>
                              ✍️{' '}
                              {story.authorName ? (
                                <Link
                                  to={`/profile/${encodeURIComponent(story.authorName)}`}
                                  className={styles.storyMetaLink}
                                >
                                  {authorLabel}
                                </Link>
                              ) : (
                                authorLabel
                              )}
                            </span>

                            {story.recipeId && story.recipeTitle && (
                              <span className={styles.recipeMetaChip}>
                                🍽️{' '}
                                <Link
                                  to={`/recipe/${story.recipeId}`}
                                  className={styles.storyMetaLink}
                                >
                                  {story.recipeTitle}
                                </Link>
                              </span>
                            )}

                            {dateLabel && (
                              <span className={styles.recipeMetaChip}>📅 {dateLabel}</span>
                            )}
                          </div>
                        </div>

                        <div className={styles.recipeActions}>
                          <button
                            type="button"
                            onClick={() => handleToggleStoryStatus(story)}
                            className={isPublished ? styles.draftBtn : styles.publishBtn}
                          >
                            {isPublished ? 'Hide' : 'Publish'}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleEditStory(story)}
                            className={styles.editBtn}
                            disabled={loadingEditStoryId === story.id}
                          >
                            {loadingEditStoryId === story.id ? 'Loading...' : 'Edit'}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteStory(story)}
                            className={styles.deleteBtn}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {isStoryEndless ? (
                  <EndlessScrollSentinel
                    hasMore={storyEndlessCount < filteredAdminStories.length}
                    onLoadMore={handleLoadMoreStoriesEndless}
                    visibleCount={currentStories.length}
                    totalItems={filteredAdminStories.length}
                  />
                ) : (
                  <div className={styles.pagination}>
                    <button
                      disabled={storyPage === 1}
                      onClick={() => setStoryPage((prev) => prev - 1)}
                      className={styles.pageBtn}
                    >
                      Previous
                    </button>
                    <span>
                      Page {storyPage} of {totalStoryPages || 1}
                    </span>
                    <button
                      disabled={storyPage === totalStoryPages || totalStoryPages === 0}
                      onClick={() => setStoryPage((prev) => prev + 1)}
                      className={styles.pageBtn}
                    >
                      Next
                    </button>
                  </div>
                )}
              </>
            )}
          </section>
        )}

        {/* TAB 3: VIP INVITE CODES */}
        {activeTab === 'invites' && (
          <section className={styles.manageRecipes}>
            <h3>Manage Beta Access Codes</h3>
            
            <form onSubmit={handleGenerateInvite} className={styles.adminForm} style={{ marginBottom: '2rem' }}>
                <div className={styles.inviteFormGrid}>
                    <div className={styles.formGroup}>
                        <label htmlFor="invite-code-input">Custom Code (Optional)</label>
                        <input 
                            id="invite-code-input"
                            type="text" 
                            value={newInviteInput} 
                            onChange={(e) => setNewInviteInput(e.target.value)} 
                            placeholder="e.g. VIP-TESTER (or blank)" 
                        />
                    </div>
                    <div className={styles.formGroup}>
                        <label htmlFor="invite-max-uses-input">Max Charges / Uses</label>
                        <input 
                            id="invite-max-uses-input"
                            type="number" 
                            min="1"
                            step="1"
                            value={newInviteMaxUses} 
                            onChange={(e) => setNewInviteMaxUses(e.target.value)} 
                            placeholder="Unlimited" 
                        />
                    </div>
                    <div className={styles.formGroup}>
                        <label htmlFor="invite-expires-input">Expiration Date (Optional)</label>
                        <input 
                            id="invite-expires-input"
                            type="date" 
                            value={newInviteExpiresAt} 
                            onChange={(e) => setNewInviteExpiresAt(e.target.value)} 
                        />
                    </div>
                </div>
                <div className={styles.inviteSubmitRow}>
                    <button type="submit" className={styles.saveBtn}>
                        Generate Code
                    </button>
                </div>
            </form>

            {inviteCodes.length === 0 ? (
                <p>Loading invite codes...</p>
            ) : (
                <div className={styles.recipeList}>
                    {inviteCodes.map((code) => {
                        const effectiveStatus = code.effective_status || (code.is_active ? 'active' : 'revoked');
                        const statusLabelMap = {
                            active: 'Active',
                            exhausted: 'Depleted',
                            expired: 'Expired',
                            revoked: 'Revoked',
                        };
                        const statusClassMap = {
                            active: styles.inviteStatusActive,
                            exhausted: styles.inviteStatusExhausted,
                            expired: styles.inviteStatusExpired,
                            revoked: styles.inviteStatusRevoked,
                        };
                        const usesCount = Number(code.uses_count ?? 0);
                        const hasMaxUses = code.max_uses !== null && code.max_uses !== undefined;
                        const remainingUses = hasMaxUses
                            ? Number(code.remaining_uses ?? Math.max(0, Number(code.max_uses) - usesCount))
                            : null;
                        const isLocked = effectiveStatus === 'exhausted' || effectiveStatus === 'expired';

                        return (
                            <div key={code.id} className={styles.recipeListItem}>
                                <div className={styles.recipeInfo}>
                                    <div className={styles.inviteCodeHeader}>
                                        <h4>{code.code}</h4>
                                        <span className={`${styles.inviteStatusBadge} ${statusClassMap[effectiveStatus] || styles.inviteStatusRevoked}`}>
                                            {statusLabelMap[effectiveStatus] || 'Revoked'}
                                        </span>
                                    </div>
                                    <div className={styles.recipeMetaRow}>
                                        <span className={styles.recipeMetaChip}>
                                            {hasMaxUses
                                                ? `Uses: ${usesCount} / ${code.max_uses} (${remainingUses} left)`
                                                : `Uses: ${usesCount} / Unlimited`}
                                        </span>
                                        <span className={styles.recipeMetaChip}>
                                            {code.expires_at
                                                ? `Expires: ${new Date(String(code.expires_at).replace(' ', 'T')).toLocaleDateString()}`
                                                : 'No expiration'}
                                        </span>
                                        <span className={styles.recipeMetaChip}>
                                            Created: {new Date(String(code.created_at).replace(' ', 'T')).toLocaleDateString()}
                                        </span>
                                    </div>
                                </div>
                                <div className={styles.recipeActions}>
                                    {isLocked ? (
                                        <button
                                            type="button"
                                            className={styles.inviteDisabledBtn}
                                            disabled
                                            aria-disabled="true"
                                        >
                                            {effectiveStatus === 'exhausted' ? 'No Charges Left' : 'Expired'}
                                        </button>
                                    ) : (
                                        <button 
                                            onClick={() => handleToggleInvite(code.id, code.is_active)}
                                            className={code.is_active ? styles.deleteBtn : styles.publishBtn}
                                        >
                                            {code.is_active ? 'Revoke' : 'Activate'}
                                        </button>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
          </section>
        )}
        {/* TAB 4: EMMA DB ASSISTANT (FREE ADMIN ACCESS) */}
        {activeTab === 'emma' && (
          <AdminEmmaChat onRecipesUpdated={loadRecipes} />
        )}
        {/* TAB 5: EMMA ADMIN PERSONAL CONTEXT DOCUMENT */}
        {activeTab === 'context' && (
          <AdminEmmaContextPanel />
        )}
        {/* TAB 6: API & TOKEN USAGE MONITOR */}
        {activeTab === 'usage' && (
          <AdminUsagePanel onUserDeleted={loadRecipes} addToast={addToast} />
        )}
      </main>

      <StoryEditorModal
        isOpen={Boolean(editingStory)}
        onClose={() => setEditingStory(null)}
        recipe={editingStory?.recipe || null}
        initialStory={editingStory}
        onSaved={() => {
          setEditingStory(null);
          loadAdminStories();
          addToast('Story updated successfully!', 'success');
        }}
      />
    </div>
  );
};

export default AdminDashboard;