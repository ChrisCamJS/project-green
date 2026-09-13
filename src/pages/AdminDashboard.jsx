// src/pages/AdminDashboard.jsx

import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { api } from '../services/api';
import styles from './AdminDashboard.module.css';
import { useToast } from '../context/ToastContext';


/**
 * AdminDashboard Component
 * The restricted area for managing The Veggie Vault.
 * Includes forms for adding recipes and lists for moderation.
 */
const AdminDashboard = () => {
  const { addToast } = useToast();

  const navigate = useNavigate();
  const location = useLocation();

  const [activeTab, setActiveTab] = useState(location.state?.activeTab || 'add');

  // state for Manage Recipes
  const [recipes, setRecipes] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 9; // <-- Items per page can be adjusted here

  const [rawPaste, setRawPaste] = useState('');
  const [recipeForm, setRecipeForm] = useState({
      title: '',
      description: '',
      yields: '',
      prepTime: '',
      cookTime: '',
      ingredients: '',
      instructions: '',
      nutritionInfo: '',
      notes: '', 
  });

  const handleParse  = (e) => {
    e.preventDefault();
    const text = rawPaste;

    // helper to grab a single line after a keyword
    const extractLine = (regex) => {
      const match = text.match(regex);
      return match ? match[1].trim() : '';
    }

    // helper to grab blocks of text between two headers
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
    // console.log(nutritionInfo)
  }
      // handle individual input changes after the parse
      const handleFormChange = (e) => {
        const {name, value} = e.target;
        setRecipeForm(prev => ({...prev, [name]: value}));
      }

      const handleImageUpload = async (e) => {
        const files = e.target.files;
        if (!files.length) {
          return;
        }
        // pack the files into a formData object
        const formData = new FormData();
        for (let i = 0; i < files.length; i++) {
          formData.append('images[]', files[i]);
        }

        try {
          const response = await api.uploadImages(formData);
          if (response.success) {
            // join the new array of urls with commas and append with anything else in there
            const newUrls = response.urls.join(',');
            setRecipeForm(prev => ({
              ...prev,
              imageUrl: prev.imageUrl ? `${prev.imageUrl},${newUrls}` : newUrls
            }));
            addToast('Images successfully uploaded to the Vault!', 'success');

          }
        }
        catch (err) {
          console.error('Upload failed:', err);
          addToast('Upload failed:', err, 'error');
        }
      }

      //submit to the vault
      const handleAddSubmit = async (e) => {
        e.preventDefault();
        // The PHP API expects arrays for these three, so we split them by newlines
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
              // Clear it out for the next one
              setRawPaste('');
              setRecipeForm({ title: '', description: '', yields: '', prepTime: '', cookTime: '', ingredients: '', instructions: '', nutritionInfo: '', notes: '', imageUrl: '', isDraft: false});
              // Re-fetch the manage list behind the scenes so it's ready
              loadRecipes();
          }
        }
        catch (err) {
          addToast("Failed to add recipe:", err, 'error');
        }
      }
    // fetch the recipes when switching to manage recipes tab
    useEffect(() => {
      if (activeTab === 'manage' && recipes.length === 0) {
        loadRecipes();
      }
    }, [activeTab]);

    const loadRecipes = async () => {
      try {
        const response = await api.getRecipes();
        // adjust this
        setRecipes(response);
      }
      catch (err) {
        addToast("Failed to load the recipes", err, 'error');
      }
    }

  const handleEdit = (id) => {
        navigate(`/admin/edit/${id}`);
    };

  const handleDelete = async (id) => {
    if (window.confirm("Are you sure you want to delete this recipe?")) {
      try {
        const response = await api.deleteRecipe(id);
        if (response?.success) {
          setRecipes(prev => prev.filter(recipe => recipe.id !== id));
          
          addToast("Recipe successfully banished from the Vault!", 'success');
        }
      }
      catch (err) {
          addToast("The Vault resists! Failed to delete the recipe.", 'error');
          console.error("Delete error:", err);
      }
    }
  };
  const handleToggleDraft = async (id) => {
    try {
        // Find the recipe in our local state to see what its current status is
        const recipeToUpdate = recipes.find(r => r.id === id);
        const newDraftStatus = !recipeToUpdate.isDraft;

        // Hit the API
        const response = await api.toggleDraft(id, newDraftStatus);
        
        if (response.success) {
            // Update the local state to trigger a re-render with the new button text
            setRecipes(prev => prev.map(recipe => 
                recipe.id === id ? { ...recipe, isDraft: newDraftStatus } : recipe
            ));
        }
    } catch (err) {
        addToast("Failed to toggle draft status:", err, 'error')
    }
  };

  // Pagination math
  const indexOfLastRecipe = currentPage * itemsPerPage;
  const indexOfFirstRecipe = indexOfLastRecipe - itemsPerPage;

  const sortedRecipes = [...recipes].sort((a, b) => b.id - a.id);
  const currentRecipes = sortedRecipes.slice(indexOfFirstRecipe, indexOfLastRecipe);
  const totalPages = Math.ceil(recipes.length / itemsPerPage);

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
        </div>
      </header>

      <main className={styles.adminContentArea}>
{activeTab === 'add' ? (
          <section className={styles.addRecipeSection}>
            <h3>Secure Entry: New Recipe</h3>
            
            {/* The Magic Paste Zone */}
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

            {/* The Parsed & Editable Form */}
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
                          style={{ padding: '10px 0' }} // Just a cheeky inline style to space it out
                      />
                  </div>
              </div>

              <button type="submit" className={styles.saveBtn}>Vault This Recipe</button>
            </form>
          </section>
                  ) : (
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
                                      className={recipe.isDraft ? styles.publishBtn : styles.draftBtn}
                                  >
                                      {recipe.isDraft ? 'Publish' : 'Hide'}
                                  </button>
                                  <button onClick={() => handleEdit(recipe.id)} className={styles.editBtn}>Edit</button>
                                  <button onClick={() => handleDelete(recipe.id)} className={styles.deleteBtn}>Delete</button>
                                </div>
                            </div>
                        ))}
                    </div>
                    
                    {/* The Paginator */}
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
      </main>
    </div>
  );
};

export default AdminDashboard;