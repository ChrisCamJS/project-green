import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../services/api';
import { sendChatMessage, generateRecipeImage } from '../services/geminiApi';
import { getMicroCalculationInstructions, parseMicrosFromDeepDive } from '../utils/promptBuilder';
import { useEmmaVoice } from '../hooks/useEmmaVoice';
import { useAuth } from '../context/AuthContext';
import LiveChat from '../components/LiveChat';
import ReactMarkdown from 'react-markdown';
import NutritionPanel from '../components/NutritionPanel';
import StarRating from '../components/StarRating';
import CommentSection from '../components/CommentSection';
import FavoriteButton from '../components/FavoriteButton';
import './RecipeDetails.css';

// ============================================================================
// COMPONENT: RecipeDetails
// PURPOSE: Fetches and displays a single recipe, complete with a localized Emma Chat!
// ============================================================================

const API_URL = import.meta.env.VITE_API_BASE_URL;

const RecipeDetails = () => {
  // --- STATE & ROUTING ---
  const { id } = useParams();
  const { user, spendToken } = useAuth();
  const [isPublishing, setIsPublishing] = useState(false);
  const [isGeneratingAiImage, setIsGeneratingAiImage] = useState(false);
  const [aiImagePaid, setAiImagePaid] = useState(false);
  const [isUpgradingNutrition, setIsUpgradingNutrition] = useState(false);
  const [upgradeFeedback, setUpgradeFeedback] = useState(null);
  const currentUserName = user?.username || 'Love';
  
  const [recipe, setRecipe] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // --- EMMA'S CHAT & VOICE STATE ---
  const { speechState, handleSpeak } = useEmmaVoice();
  const [chatMessage, setChatMessage] = useState('');
  const [chatHistory, setChatHistory] = useState([]);
  const [isChatting, setIsChatting] = useState(false);
  const [showLiveChat, setShowLiveChat] = useState(false);

  useEffect(() => {
  if (!recipe) return;

  // Update browser document title
  document.title = `${recipe.title} | The Veggie Vault`;

  // Helper to dynamically set or replace meta tag content
  const setMetaTag = (attr, key, content) => {
    let element = document.querySelector(`meta[${attr}="${key}"]`);
    if (!element) {
      element = document.createElement('meta');
      element.setAttribute(attr, key);
      document.head.appendChild(element);
    }
    element.setAttribute('content', content || '');
  };

  const currentUrl = window.location.href;
  const recipeDesc = recipe.description || `Explore this WFPB recipe for ${recipe.title} on The Veggie Vault.`;
  const recipeImg = recipe.imageUrl;

  // Open Graph
  setMetaTag('property', 'og:type', 'article');
  setMetaTag('property', 'og:title', recipe.title);
  setMetaTag('property', 'og:description', recipeDesc);
  setMetaTag('property', 'og:image', recipeImg);
  setMetaTag('property', 'og:url', currentUrl);

  // Twitter
  setMetaTag('name', 'twitter:card', 'summary_large_image');
  setMetaTag('name', 'twitter:title', recipe.title);
  setMetaTag('name', 'twitter:description', recipeDesc);
  setMetaTag('name', 'twitter:image', recipeImg);
}, [recipe]);

  // --- DATA FETCHING (useEffect) ---
  useEffect(() => {
    setAiImagePaid(false);
    setUpgradeFeedback(null);
    const fetchRecipe = async () => {
      try {
        setLoading(true);
        const data = await api.getRecipesById(id);
        if (data.error) throw new Error(data.error);
        setRecipe(data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchRecipe();
  }, [id]);

  // --- LOCALIZED CHAT HANDLER ---
  const handleChatSubmit = async (e) => {
      e.preventDefault();
      if (!chatMessage.trim()) return;

      const newUserMsg = chatMessage;
      setChatMessage('');
      setIsChatting(true);

      const updatedHistory = [...chatHistory, { role: 'user', parts: [{ text: newUserMsg }] }];
      setChatHistory(updatedHistory);

      try {
          // We feed Emma the exact context of THIS recipe so she knows what she's talking about!
          const ingredientsList = recipe.ingredients?.map(i => i.ingredient_name).join(', ') || 'Unknown ingredients';
          
          const systemPrompt = `You are Emma Advanced, a sassy British culinary expert and co-host of The Chris and Emma Show. 
          You are talking to ${currentUserName}.
          The user is currently viewing the recipe: "${recipe.title}".
          
          Recipe Context:
          Description: ${recipe.description || 'N/A'}
          Ingredients: ${ingredientsList}
          Notes & Deep Dive: ${recipe.notes || 'N/A'}
          
          YOUR RULES:
          1. Answer their question about THIS specific recipe accurately, keeping your signature wit and charm. 
          2. CRITICAL: Be concise (1-3 sentences maximum), but NEVER sacrifice accuracy for brevity.
          3. Do not write introductory greetings. Just give the answer with a dash of sass.
          4. If the user asks for the amount of a specific nutrient (e.g., Sodium, Vitamin C, Iron), you MUST perform the mathematical calculation based on the ingredients provided and give a precise numerical estimate (e.g., "roughly 45mg" or "about 12g"). Do NOT give vague answers like "a modest amount" or "a touch". Put your calculator to work!`;

          const reply = await sendChatMessage(updatedHistory, systemPrompt);
          setChatHistory([...updatedHistory, { role: 'model', parts: [{ text: reply }] }]);
      } catch (err) {
          setChatHistory([...updatedHistory, { role: 'model', parts: [{ text: "Oh dear, my brain seems to have short-circuited. Could you ask that again, love?" }] }]);
      } finally {
          setIsChatting(false);
      }
  };

  // --- CONDITIONAL RENDERING (Guards) ---
  if (loading) {
    return (
      <div className="recipe-loading-screen">
        <div className="recipe-spinner"></div>
        <span className="recipe-loading-text">Decrypting vault entry...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="recipe-message-box recipe-error">
        <h3>Oops, an error occurred!</h3>
        <p>{error}</p>
        <Link to="/" className="recipe-return-link">Return to the Pantry</Link>
      </div>
    );
  }

  if (!recipe) return <div className="recipe-message-box recipe-warning">Recipe vanished into the ether.</div>;

  // --- DATA FALLBACKS ---
  const mappedMacros = recipe.macros || {
    protein_g: recipe.protein_g,
    fat_g: recipe.fat_g,
    carbs_g: recipe.carbs_g,
    math_calculations: recipe.math_calculations || recipe.macro_math_calculations
  };
  const mappedMicros = recipe.micros || recipe.micronutrients || [];

  const targetImage = recipe?.imageUrl || recipe?.image_url; 
  const fullImageUrl = targetImage 
    ? ((targetImage.startsWith('http') || targetImage.startsWith('data:')) ? targetImage : `${API_URL}${targetImage}`)
    : '/belle-house-fiesta-bowl.jpg';

  const currentImageSource = recipe.imageSource || recipe.image_source || 'none';
  const hasRealImage = Boolean(
    targetImage &&
    currentImageSource !== 'none' &&
    !targetImage.includes('default-veggie-vault-placeholder')
  );
  const hasMicros = Array.isArray(mappedMicros) && mappedMicros.length > 0;
  const isDraftRecipe = !Number(recipe.is_public ?? (recipe.isPublic ? 1 : 0));

  // Extract the display string (Accounting for our old legacy descriptions vs new clean notes)
  let displayDescription = recipe.description;
  let displayNotes = recipe.notes;

  if (displayDescription && displayDescription.includes("### Emma's Deep Dive")) {
      const parts = displayDescription.split("### Emma's Deep Dive");
      displayDescription = parts[0].trim();
      displayNotes = "### Emma's Deep Dive" + parts[1]; 
  }

  const handleRateRecipe = async (id, newRating) => {
    try {
      const response = await api.rateRecipe(id, newRating);
      
      if (response.success) {
        // Instantly update the UI with the fresh maths from the database
        setRecipe(prevRecipe => ({
          ...prevRecipe,
          average_rating: response.averageRating,
          rating_count: response.ratingCount
        }));
        
        // Optional: Fire off a toast notification here!
        console.log("Brilliant!", response.message);
      }
    } catch (error) {
      console.error("Failed to submit rating. The database is throwing a wobbly:", error);
    }
  };

  const handleGenerateAiImage = async () => {
    if (!aiImagePaid && Number(user?.generation_tokens ?? 0) < 0.5) {
      alert('Oh dear! You need at least 0.5 tokens to generate an AI image.');
      return;
    }

    setIsGeneratingAiImage(true);
    setUpgradeFeedback(null);
    try {
      if (!aiImagePaid) {
        const tokenRes = await spendToken(0.5);
        if (!tokenRes?.success) {
          alert(tokenRes?.message || 'Unable to deduct 0.5 tokens.');
          return;
        }
        setAiImagePaid(true);
      }

      const base64Data = await generateRecipeImage(recipe.title || 'Whole Food Plant-Based Dish');
      if (!base64Data) {
        const retryMsg = "Emma's camera jammed! Click retry to try generating your AI photo again at no cost (0 tokens).";
        setUpgradeFeedback(retryMsg);
        alert(retryMsg);
        return;
      }

      const res = await api.publishWithPhoto(recipe.id, `data:image/jpeg;base64,${base64Data}`, 'ai');
      if (res?.success) {
        setAiImagePaid(false);
        setRecipe((prev) => ({
          ...prev,
          imageUrl: res.imageUrl,
          image_url: res.imageUrl,
          imageSource: 'ai',
          image_source: 'ai',
          is_public: res.isPublic ? 1 : prev.is_public,
          isPublic: res.isPublic,
          isDraft: !res.isPublic,
        }));
        setUpgradeFeedback(res.message || 'AI image attached to your recipe!');
      }
    } catch (err) {
      console.error('Failed to generate AI image:', err);
      alert(err.message || 'Could not generate AI image.');
    } finally {
      setIsGeneratingAiImage(false);
    }
  };

  const handlePhotoUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = async () => {
      setIsPublishing(true);
      setUpgradeFeedback(null);
      try {
        const res = await api.publishWithPhoto(recipe.id, reader.result, 'user');
        if (res.success) {
          setRecipe((prev) => ({
            ...prev,
            imageUrl: res.imageUrl,
            image_url: res.imageUrl,
            imageSource: 'user',
            image_source: 'user',
            is_public: res.isPublic ? 1 : prev.is_public,
            isPublic: res.isPublic,
            isDraft: !res.isPublic,
          }));
          setUpgradeFeedback(res.message || 'Dish photo uploaded!');
        }
      } catch (err) {
        console.error('Failed to publish photo:', err);
        alert(err.message || 'Failed to upload dish photo.');
      } finally {
        setIsPublishing(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleUpgradeNutrition = async () => {
    if (Number(user?.generation_tokens ?? 0) < 0.5) {
      alert('Oh dear! You need at least 0.5 tokens to generate Masterpiece nutrition.');
      return;
    }

    setIsUpgradingNutrition(true);
    setUpgradeFeedback(null);
    try {
      const tokenRes = await spendToken(0.5);
      if (!tokenRes?.success) {
        alert(tokenRes?.message || 'Unable to deduct 0.5 tokens.');
        return;
      }

      const ingredientsText = (recipe.ingredients || [])
        .map((ing) => `* ${ing.quantity && Number(ing.quantity) !== 0 ? `${ing.quantity} ` : ''}${ing.unit ? `${ing.unit} ` : ''}${ing.ingredient_name}`)
        .join('\n');
      const instructionsText = (recipe.instructions || [])
        .map((step, idx) => `${step.step_number || idx + 1}. ${step.instruction_text}`)
        .join('\n');

      const recipeSummary = [
        `# ${recipe.title}`,
        recipe.description || '',
        `Yields: ${recipe.yields || '4 servings'}`,
        '## Ingredients',
        ingredientsText,
        '## Instructions',
        instructionsText,
        mappedMacros?.calories ? `Calories: ${mappedMacros.calories}` : '',
        mappedMacros?.protein_g ? `Protein: ${mappedMacros.protein_g}g` : '',
        mappedMacros?.carbs_g ? `Carbs: ${mappedMacros.carbs_g}g` : '',
        mappedMacros?.fat_g ? `Fat: ${mappedMacros.fat_g}g` : '',
      ].filter(Boolean).join('\n\n');

      const instructions = getMicroCalculationInstructions(currentUserName);
      const mathResult = await sendChatMessage(
        [{ role: 'user', parts: [{ text: `Here is the recipe I need you to deeply analyze:\n\n${recipeSummary}` }] }],
        instructions
      );
      const parsedMicros = parseMicrosFromDeepDive(mathResult);

      const res = await api.upgradeRecipeNutrition(recipe.id, mathResult, parsedMicros);
      if (res?.success) {
        setRecipe((prev) => ({
          ...prev,
          notes: res.notes,
          micros: res.micros,
          is_public: res.isPublic ? 1 : prev.is_public,
          isPublic: res.isPublic,
          isDraft: !res.isPublic,
        }));
        setUpgradeFeedback(res.message || 'Masterpiece nutrition unlocked!');
      }
    } catch (err) {
      console.error('Failed to upgrade recipe nutrition:', err);
      alert(err.message || 'Could not generate Masterpiece nutrition.');
    } finally {
      setIsUpgradingNutrition(false);
    }
  };

  const canPublishMasterpiece = hasRealImage && hasMicros;

  const handlePublishMasterpiece = async () => {
    if (!canPublishMasterpiece) return;
    setIsPublishing(true);
    setUpgradeFeedback(null);
    try {
      const res = await api.publishDraft(recipe.id);
      if (res?.success) {
        setRecipe((prev) => ({
          ...prev,
          is_public: 1,
          isPublic: true,
          isDraft: false,
        }));
        setUpgradeFeedback(res.message || 'Your recipe is now a published Masterpiece!');
      }
    } catch (err) {
      console.error('Failed to publish draft:', err);
      alert(err.message || 'Could not publish recipe.');
    } finally {
      setIsPublishing(false);
    }
  };

  // --- THE UI RENDER ---
  return (
    <div className="recipe-page-container">
      
      <div className="recipe-back-wrapper">
        <Link to="/" className="recipe-back-button">&larr; Back to Recipe Grid</Link>
      </div>

      <div className="recipe-image-wrapper">
        <img src={fullImageUrl} alt={recipe.title || 'A glorious WFPB meal'} className="recipe-hero-image" />
      </div>

      <div className="recipe-card">
        <header className="recipe-header">
          {Boolean(Number(recipe.is_oil_free)) && (
            <span className="recipe-badge-oil-free">🌱 100% Oil-Free</span>
          )}
          <div className="recipe-details-header">
        <div className="title-row">
          <h1 className="recipe-title">{recipe.title}</h1>
          <FavoriteButton recipeId={recipe.id} initialFavorited={recipe.isFavorited || false} />
        </div>
        {/* The Creator Tag */}
        <div className="author-badge" style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ background: '#edf2f7', padding: '4px 12px', borderRadius: '16px', fontSize: '0.9rem', color: '#4a5568' }}>
            🧑‍🍳 Recipe by: <strong>{recipe.authorName || 'Emma (AI)'}</strong>
          </span>
        </div>

        {/* The Masterpiece Graduation Workshop */}
        {user && Number(recipe.user_id) === Number(user.id) && (isDraftRecipe || !hasRealImage || !hasMicros) && (
          <div className="draft-workshop-card">
            <div className="draft-workshop-header">
              <div>
                <h3>✨ Draft-to-Masterpiece Workshop</h3>
                <p>
                  {isDraftRecipe
                    ? 'Both a dish photo (AI-generated or uploaded) and full Masterpiece nutritional details are required to publish this draft to the community feed.'
                    : 'Your recipe is published! You can still enhance any remaining Masterpiece details below.'}
                </p>
              </div>
              <span className={`workshop-status-pill ${isDraftRecipe ? 'draft' : 'published'}`}>
                {isDraftRecipe ? '🔒 Private Draft' : '🌟 Published Masterpiece'}
              </span>
            </div>

            <div className="workshop-checklist">
              <span className={`workshop-check ${hasRealImage ? 'done' : 'pending'}`}>
                <strong>Dish Image:</strong> {hasRealImage ? `✅ Added (${currentImageSource === 'ai' ? 'AI Generated' : 'Uploaded'})` : 'Pending'}
              </span>
              <span className={`workshop-check ${hasMicros ? 'done' : 'pending'}`}>
                <strong>Masterpiece Nutrition:</strong> {hasMicros ? '✅ Unlocked' : 'Pending'}
              </span>
            </div>

            {upgradeFeedback && (
              <div className="workshop-feedback">
                {upgradeFeedback}
              </div>
            )}

            <div className="workshop-actions">
              <button
                type="button"
                onClick={handleGenerateAiImage}
                disabled={isGeneratingAiImage || isPublishing || isUpgradingNutrition}
                className="workshop-btn ai-image-btn"
              >
                {isGeneratingAiImage
                  ? '🎨 Painting AI Dish...'
                  : (aiImagePaid ? '🔄 Retry AI Image (Free — 0 Tokens)' : '🎨 Generate AI Image (0.5 Tokens)')}
              </button>

              <label className={`workshop-btn upload-photo-btn ${(isPublishing || isGeneratingAiImage) ? 'disabled' : ''}`}>
                {isPublishing ? '📤 Uploading...' : '📸 Upload Own Photo (Free)'}
                <input
                  type="file"
                  accept="image/*"
                  onChange={handlePhotoUpload}
                  disabled={isPublishing || isGeneratingAiImage || isUpgradingNutrition}
                  hidden
                />
              </label>

              {!hasMicros && (
                <button
                  type="button"
                  onClick={handleUpgradeNutrition}
                  disabled={isUpgradingNutrition || isGeneratingAiImage || isPublishing}
                  className="workshop-btn nutrition-btn"
                >
                  {isUpgradingNutrition ? '🧮 Crunching Micros...' : '🔬 Generate Masterpiece Nutrition (0.5 Tokens)'}
                </button>
              )}

              {isDraftRecipe && (
                <button
                  type="button"
                  onClick={handlePublishMasterpiece}
                  disabled={!canPublishMasterpiece || isPublishing || isGeneratingAiImage || isUpgradingNutrition}
                  className="workshop-btn publish-btn"
                  title={!canPublishMasterpiece ? 'Add a photo and generate Masterpiece nutrition first' : 'Publish to the public Masterpiece feed'}
                >
                  {isPublishing ? '🚀 Publishing...' : '🚀 Publish Masterpiece to Feed'}
                </button>
              )}
            </div>
          </div>
        )}
        
        {/* ... existing StarRating, macros, and content ... */}
      </div>
          

          <div className="recipe-rating-wrapper">
            <StarRating 
              recipeId={recipe.id} 
              initialRating={recipe.average_rating || 0} 
              onRate={handleRateRecipe} 
            />
            <span className="rating-count">
              ({recipe.rating_count || 0} reviews)
            </span>
          </div>
          
          {displayDescription && (
            <div className="recipe-hero-description">
                <ReactMarkdown>{displayDescription}</ReactMarkdown>
            </div>
          )}

          <div className="recipe-meta-tags">
            <span className="recipe-meta-tag">⏱ Prep: {recipe.prep_time_mins || 0}m</span>
            <span className="recipe-meta-tag">🔥 Cook: {recipe.cook_time_mins || 0}m</span>
            <span className="recipe-meta-tag">🍽 Yields: {recipe.yields}</span>
          </div>
        </header>

        <div className="recipe-content-grid">
          {/* LEFT COLUMN */}
          <div className="recipe-main-col">
            <section className="recipe-section">
              <h3 className="recipe-section-title">Ingredients</h3>
              <ul className="recipe-ingredients-list">
                {recipe.ingredients && recipe.ingredients.length > 0 ? (
                  recipe.ingredients.map((ing, index) => {
                    const hasRealQuantity = Number(ing.quantity) !== 0 && Number(ing.quantity) !== 1;
                    const hasRealUnit = ing.unit && ing.unit !== 'serving' && ing.unit !== '';
                    return (
                      <li key={index} className="recipe-ingredient-item">
                        <span className="recipe-ingredient-bullet">&#10003;</span>
                        <div className="recipe-ingredient-text">
                          {hasRealQuantity && <span className="recipe-ingredient-highlight">{Number(ing.quantity)}</span>}
                          {hasRealUnit && <span className="recipe-ingredient-highlight"> {ing.unit}</span>}
                          <span className="recipe-ingredient-name"> {ing.ingredient_name}</span>
                        </div>
                      </li>
                    );
                  })
                ) : <li className="recipe-empty-state">No Ingredients Found.</li>}
              </ul>
            </section>

            <section className="recipe-section">
              <h3 className="recipe-section-title">Instructions</h3>
              <ol className="recipe-instructions-list">
                {recipe.instructions && recipe.instructions.length > 0 ? (
                  recipe.instructions.map((step) => (
                    <li key={step.id} className="recipe-instruction-item">
                      <span className="recipe-instruction-number">{step.step_number}</span>
                      <div className="recipe-instruction-text" style={{margin: 0, padding: 0}}>
                        <ReactMarkdown>{step.instruction_text}</ReactMarkdown>
                      </div>
                    </li>
                  ))
                ) : <li className="recipe-empty-state">No instructions provided. Chuck it in a pan and hope for the best!</li>}
              </ol>
            </section>
          </div>


          {/* RIGHT COLUMN */}
          <div className="recipe-sidebar-col">
            <div className="recipe-sticky-sidebar">
              <NutritionPanel macros={mappedMacros} micros={mappedMicros} />
            </div>
          </div>
        </div>

        {/* EMMA'S DRESSED-UP DEEP DIVE */}
        {displayNotes && (
            <div className="recipe-deep-dive-container" style={{ margin: '0 1.5rem 2rem 1.5rem', padding: '1.5rem', backgroundColor: '#faf5ff', borderRadius: '12px', borderLeft: '4px solid #805ad5' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #e9d5ff', paddingBottom: '0.5rem', marginBottom: '1rem' }}>
                    <h3 style={{ margin: 0, color: '#6b21a8', fontSize: '1.25rem', fontWeight: 'bold' }}>🔬 Emma's Deep Dive Analysis</h3>
                    <button
                        onClick={() => handleSpeak(displayNotes)}
                        style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '1.2rem', opacity: '0.6', padding: '0', transition: 'opacity 0.2s ease' }}
                        title="Listen to Emma's Deep Dive"
                        onMouseEnter={(e) => e.target.style.opacity = '1'}
                        onMouseLeave={(e) => e.target.style.opacity = '0.6'}
                    >
                        {speechState === 'playing' ? '⏸️' : '🔊'}
                    </button>
                </div>
                <ReactMarkdown>{displayNotes}</ReactMarkdown>
            </div>
        )}

        {user ? (
            <>
                {/* --- LIVE AUDIO CHAT TOGGLE --- */}
                <div style={{ margin: '0 1.5rem 1rem 1.5rem', display: 'flex', justifyContent: 'flex-end' }}>
                    <button
                        onClick={() => setShowLiveChat(!showLiveChat)}
                        style={{
                            background: showLiveChat ? '#fed7d7' : '#e6fffa',
                            color: showLiveChat ? '#c53030' : '#319795',
                            border: `2px solid ${showLiveChat ? '#feb2b2' : '#81e6d9'}`,
                            padding: '8px 16px',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            fontWeight: 'bold',
                            transition: 'all 0.2s'
                        }}
                    >
                        {showLiveChat ? '🛑 Close Live Chat' : '🎙️ Ask Emma Live'}
                    </button>
                </div>

                {/* --- THE LIVE CHAT COMPONENT --- */}
                {showLiveChat && (
                    <div style={{ margin: '0 1.5rem 2rem 1.5rem' }}>
                        <LiveChat
                            recipeContext={`The user is currently viewing the recipe: "${recipe.title}". Ingredients: ${recipe.ingredients?.map(i => i.ingredient_name).join(', ')}`}
                        />
                    </div>
                )}
                {/* --- ASK EMMA CHATBOX --- */}
                <div className="recipe-chat-container" style={{ margin: '0 1.5rem 2rem 1.5rem', padding: '1.5rem', backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e5e7eb', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}>
                    <h3 style={{ borderBottom: '2px solid #f3f4f6', paddingBottom: '0.75rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#1f2937' }}>
                        💬 Ask Emma About This Dish
                    </h3>

                    {chatHistory.length > 0 && (
                        <div className="chat-history-window" style={{ maxHeight: '300px', overflowY: 'auto', marginBottom: '1rem', paddingRight: '0.5rem' }}>
                            {chatHistory.map((msg, idx) => (
                                <div key={idx} style={{ marginBottom: '1rem', textAlign: msg.role === 'user' ? 'right' : 'left' }}>
                                    <div style={{
                                        display: 'inline-block',
                                        padding: '0.75rem 1rem',
                                        borderRadius: '12px',
                                        backgroundColor: msg.role === 'user' ? '#9333ea' : '#f3e8ff',
                                        color: msg.role === 'user' ? '#ffffff' : '#374151',
                                        maxWidth: '85%',
                                        textAlign: 'left',
                                        borderBottomRightRadius: msg.role === 'user' ? '2px' : '12px',
                                        borderBottomLeftRadius: msg.role === 'model' ? '2px' : '12px'
                                    }}>
                                        <ReactMarkdown>{msg.parts[0].text}</ReactMarkdown>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    <form onSubmit={handleChatSubmit} style={{ display: 'flex', gap: '0.5rem' }}>
                        <input
                            type="text"
                            value={chatMessage}
                            onChange={(e) => setChatMessage(e.target.value)}
                            placeholder="E.g., How much Vitamin C is in this? Can I substitute the mushrooms?"
                            style={{ flex: 1, padding: '0.75rem 1rem', borderRadius: '8px', border: '1px solid #d1d5db', outline: 'none' }}
                            disabled={isChatting}
                        />
                        <button
                            type="submit"
                            disabled={isChatting || !chatMessage.trim()}
                            style={{ padding: '0.75rem 1.5rem', backgroundColor: isChatting ? '#d1d5db' : '#9333ea', color: '#ffffff', borderRadius: '8px', border: 'none', cursor: isChatting ? 'not-allowed' : 'pointer', fontWeight: 'bold', transition: 'background-color 0.2s' }}
                        >
                            {isChatting ? 'Thinking...' : 'Ask'}
                        </button>
                    </form>
                </div>
            </>
        ) : (
            <div style={{ margin: '0 1.5rem 2rem 1.5rem', padding: '1.5rem', backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e5e7eb', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)', textAlign: 'center' }}>
                <p style={{ color: '#374151', fontSize: '1.1rem', margin: 0 }}>
                    Want to ask Emma a question or chat live? <Link to='/login' style={{ color: '#9333ea', fontWeight: 'bold', textDecoration: 'none' }}>Log in</Link> to access these features!
                </p>
            </div>
        )}

        <CommentSection recipeId="{recipe.id}"/>
      </div>
    </div>
  );
};

export default RecipeDetails;