import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { api } from '../services/api';
import styles from './AdminDashboard.module.css';
import { useToast } from '../context/ToastContext';

/**
 * AdminDashboard Component
 * The restricted area for managing The Veggie Vault.
 * Includes forms for adding recipes, moderation, and VIP beta access.
 */
const AdminDashboard = () => {
  const { addToast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  const [activeTab, setActiveTab] = useState(location.state?.activeTab || 'add');

  // --- Manage Recipes State ---
  const [recipes, setRecipes] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 9;

  // --- Add Recipe State ---
  const [rawPaste, setRawPaste] = useState('');
  const [recipeForm, setRecipeForm] = useState({
      title: '', description: '', yields: '', prepTime: '', cookTime: '', 
      ingredients: '', instructions: '', nutritionInfo: '', notes: '', imageUrl: '' 
  });

  // --- Invite Codes State ---
  const [inviteCodes, setInviteCodes] = useState([]);
  const [newInviteInput, setNewInviteInput] = useState('');

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
        yields: extractLine(/Yields:\s*(.+)/i),
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
    if (activeTab === 'manage' && recipes.length === 0) {
      loadRecipes();
    } else if (activeTab === 'invites' && inviteCodes.length === 0) {
      loadInvites();
    }
  }, [activeTab]);

  const loadRecipes = async () => {
    try {
      const response = await api.getRecipes();
      setRecipes(response);
    } catch (err) {
      addToast("Failed to load the recipes", err, 'error');
    }
  }

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

  // Pagination math
  const indexOfLastRecipe = currentPage * itemsPerPage;
  const indexOfFirstRecipe = indexOfLastRecipe - itemsPerPage;
  const sortedRecipes = [...recipes].sort((a, b) => b.id - a.id);
  const currentRecipes = sortedRecipes.slice(indexOfFirstRecipe, indexOfLastRecipe);
  const totalPages = Math.ceil(recipes.length / itemsPerPage);

// ----------------------------------------------------
  // VIP INVITE CODE LOGIC
  // ----------------------------------------------------
  const loadInvites = async () => {
    try {
      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/admin/invites`, {
        method: 'GET',
        credentials: 'include' // <-- Hand over the session cookie!
      });
      const data = await response.json();
      if (data.success) setInviteCodes(data.codes);
    } catch (err) {
      addToast("Failed to load invite codes", 'error');
    }
  };

  const handleGenerateInvite = async (e) => {
    e.preventDefault();
    try {
      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/admin/invites`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include', // <-- Here too!
        body: JSON.stringify({ code: newInviteInput })
      });
      const data = await response.json();
      
      if (data.success) {
        addToast(data.message, 'success');
        setNewInviteInput('');
        loadInvites(); 
      } else {
        addToast(data.message, 'error');
      }
    } catch (err) {
      addToast("Failed to generate code.", 'error');
    }
  };

  const handleToggleInvite = async (id, currentStatus) => {
    try {
      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/admin/invites/toggle`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include', // <-- And here!
        body: JSON.stringify({ id, is_active: !currentStatus })
      });
      const data = await response.json();
      
      if (data.success) {
        setInviteCodes(prev => prev.map(code => 
          code.id === id ? { ...code, is_active: !currentStatus ? 1 : 0 } : code
        ));
        addToast(data.message, 'success');
      }
    } catch (err) {
      addToast("Failed to toggle code.", 'error');
    }
  };

  return (
    <div className={styles.adminContainer}>
      <header className={styles.adminHeader}>
        <h2>Admin Vault Control</h2>
        <div className={styles.adminTabs}>
          <button 
            className={activeTab === 'add' ? styles.active : ''} 
            onClick={() => setActiveTab('add')}
          >
            Add New Recipe
          </button>
          <button 
            className={activeTab === 'manage' ? styles.active : ''} 
            onClick={() => setActiveTab('manage')}
          >
            Manage Recipes
          </button>
          <button 
            className={activeTab === 'invites' ? styles.active : ''} 
            onClick={() => setActiveTab('invites')}
          >
            Manage Invites
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
            <h3>Manage Veggie Vault Inventory</h3>
            
            {recipes.length === 0 ? (
                <p>Loading your culinary masterpieces...</p>
            ) : (
                <>
                    <div className={styles.recipeList}>
                        {currentRecipes.map(recipe => (
                            <div key={recipe.id} className={styles.recipeListItem}>
                                <div className={styles.recipeInfo}>
                                    <h4>{recipe.title}</h4>
                                    <span className={styles.recipeMeta}>
                                        ID: {recipe.id} | {recipe.yields || 'Yields unknown'}
                                    </span>
                                </div>
                                <div className={styles.recipeActions}>
                                  <button 
                                    onClick={() => handleToggleDraft(recipe.id)} 
                                    className={recipe.is_public ? styles.draftBtn : styles.publishBtn}
                                >
                                    {recipe.is_public ? 'Hide' : 'Publish'}
                                </button>
                                  <button onClick={() => handleEdit(recipe.id)} className={styles.editBtn}>Edit</button>
                                  <button onClick={() => handleDelete(recipe.id)} className={styles.deleteBtn}>Delete</button>
                                </div>
                            </div>
                        ))}
                    </div>
                    
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
                </>
            )}
          </section>
        )}

        {/* TAB 3: VIP INVITE CODES */}
        {activeTab === 'invites' && (
          <section className={styles.manageRecipes}>
            <h3>Manage Beta Access Codes</h3>
            
            <form onSubmit={handleGenerateInvite} className={styles.adminForm} style={{ marginBottom: '2rem' }}>
                <div className={styles.formRow}>
                    <div className={styles.formGroup}>
                        <label>Custom Invite Code (Leave blank for a random one)</label>
                        <input 
                            type="text" 
                            value={newInviteInput} 
                            onChange={(e) => setNewInviteInput(e.target.value)} 
                            placeholder="e.g. VIP-TESTER" 
                        />
                    </div>
                    <button type="submit" className={styles.saveBtn} style={{ alignSelf: 'flex-end', marginBottom: '10px' }}>
                        Generate Code
                    </button>
                </div>
            </form>

            {inviteCodes.length === 0 ? (
                <p>Loading invite codes...</p>
            ) : (
                <div className={styles.recipeList}>
                    {inviteCodes.map(code => (
                        <div key={code.id} className={styles.recipeListItem}>
                            <div className={styles.recipeInfo}>
                                <h4>{code.code}</h4>
                                <span className={styles.recipeMeta}>
                                    Status: {code.is_active ? 'Active' : 'Revoked'} | Created: {new Date(code.created_at).toLocaleDateString()}
                                </span>
                            </div>
                            <div className={styles.recipeActions}>
                                <button 
                                    onClick={() => handleToggleInvite(code.id, code.is_active)}
                                    className={code.is_active ? styles.deleteBtn : styles.publishBtn}
                                >
                                    {code.is_active ? 'Revoke' : 'Activate'}
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
};

export default AdminDashboard;