import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../services/api';
import {
  sendChatMessage,
  generateRecipeImage,
  DEFAULT_IMAGE_STYLE_OPTIONS,
} from '../services/geminiApi';
import { getMicroCalculationInstructions, parseMicrosFromDeepDive } from '../utils/promptBuilder';
import { useEmmaVoice } from '../hooks/useEmmaVoice';
import { useAuth } from '../context/AuthContext';
import SEOHead from '../components/SEOHead';
import { SITE_URL, DEFAULT_OG_IMAGE, cleanSeoText, toIsoDuration } from '../utils/seoUtils';
import { getRecipeDietaryFlags } from '../utils/dietaryUtils';
import LiveChat from '../components/LiveChat';
import ImageStyleOptions from '../components/RecipeDashboard/ImageStyleOptions';
import ReactMarkdown from 'react-markdown';
import EmmaMarkdown from '../components/EmmaMarkdown';
import VoiceDictationButton from '../components/VoiceDictationButton';
import {
  fetchPublishedRecipesCatalog,
  buildPublishedRecipesPromptSection,
} from '../utils/emmaRecipeContext';
import NutritionPanel from '../components/NutritionPanel';
import StarRating from '../components/StarRating';
import CommentSection from '../components/CommentSection';
import FavoriteButton from '../components/FavoriteButton';
import UserHoverFollow from '../components/UserHoverFollow';
import {
  formatStructuredRecipeForClipboard,
  copyRichRecipeToClipboard,
} from '../utils/recipeClipboard';
import './RecipeDetails.css';

// ============================================================================
// COMPONENT: RecipeDetails
// PURPOSE: Fetches and displays a single recipe, complete with a localized Emma Chat!
// ============================================================================

const API_URL = import.meta.env.VITE_API_BASE_URL;

const RecipeDetails = () => {
  // --- STATE & ROUTING ---
  const { id } = useParams();
  const { user, spendToken, confirmTokenUsage, promptPurchaseTokens } = useAuth();
  const [isPublishing, setIsPublishing] = useState(false);
  const [isGeneratingAiImage, setIsGeneratingAiImage] = useState(false);
  const [aiImagePaid, setAiImagePaid] = useState(false);
  const [isUpgradingNutrition, setIsUpgradingNutrition] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);
  const [upgradeFeedback, setUpgradeFeedback] = useState(null);
  const [shareCopied, setShareCopied] = useState(false);
  const [recipeCopied, setRecipeCopied] = useState(false);
  const [showShareMenu, setShowShareMenu] = useState(false);
  const [isImageModalOpen, setIsImageModalOpen] = useState(false);
  const [imageStyleOptions, setImageStyleOptions] = useState({ ...DEFAULT_IMAGE_STYLE_OPTIONS });

  useEffect(() => {
    if (!isImageModalOpen) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setIsImageModalOpen(false);
      }
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isImageModalOpen]);
  const currentUserName = user?.username || 'Love';
  
  const [recipe, setRecipe] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // --- EMMA'S CHAT & VOICE STATE ---
  const { speechState, handleSpeak } = useEmmaVoice();
  const [chatMessage, setChatMessage] = useState('');
  const chatInputRef = useRef(null);

  useEffect(() => {
    const el = chatInputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [chatMessage]);
  const [chatHistory, setChatHistory] = useState([]);
  const [isChatting, setIsChatting] = useState(false);
  const [showLiveChat, setShowLiveChat] = useState(false);
  const [publishedCatalog, setPublishedCatalog] = useState([]);

  useEffect(() => {
    let active = true;
    fetchPublishedRecipesCatalog().then((catalog) => {
      if (active && Array.isArray(catalog)) {
        setPublishedCatalog(catalog);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  // Dynamic SEO, Open Graph, Twitter Card & Schema.org Recipe JSON-LD
  const recipeSeo = useMemo(() => {
    if (!recipe) return null;

    const recipeDesc = cleanSeoText(
      recipe.description || `Explore this WFPB recipe for ${recipe.title} on The Veggie Vault.`,
      160
    );

    const rawImg = (recipe.imageUrl || recipe.image_url || '').trim();
    const imgSource = recipe.imageSource || recipe.image_source || 'none';
    const hasValidDishImg = Boolean(
      rawImg &&
      imgSource !== 'none' &&
      !rawImg.includes('default-veggie-vault-placeholder')
    );

    const apiOrigin = (API_URL || '').replace(/\/+$/, '');
    const resolvedApiBase = apiOrigin.startsWith('http')
      ? apiOrigin
      : `${SITE_URL}${apiOrigin ? (apiOrigin.startsWith('/') ? '' : '/') + apiOrigin : ''}`;

    const recipeImg = hasValidDishImg
      ? (
          rawImg.startsWith('http') || rawImg.startsWith('data:')
            ? rawImg
            : encodeURI(`${resolvedApiBase}${rawImg.startsWith('/') ? '' : '/'}${rawImg}`)
        )
      : DEFAULT_OG_IMAGE;

    const isDraft = !Number(recipe.is_public ?? (recipe.isPublic ? 1 : 0));
    const canonicalPath = `/recipe/${recipe.id}`;
    const prepMins = Number(recipe.prep_time_mins ?? recipe.prepTime ?? 0);
    const cookMins = Number(recipe.cook_time_mins ?? recipe.cookTime ?? 0);
    const totalMins = prepMins + cookMins;

    const suitableForDiet = ['https://schema.org/VeganDiet', 'https://schema.org/VegetarianDiet'];
    const resolvedDietary = getRecipeDietaryFlags(recipe);
    if (resolvedDietary.glutenFree) {
      suitableForDiet.push('https://schema.org/GlutenFreeDiet');
    }

    const recipeIngredients = Array.isArray(recipe.ingredients)
      ? recipe.ingredients
          .map((ing) => {
            if (typeof ing === 'string') return ing.trim();
            const hasQty = Number(ing.quantity) !== 0 && Number(ing.quantity) !== 1;
            const hasUnit = ing.unit && ing.unit !== 'serving';
            return [hasQty ? Number(ing.quantity) : '', hasUnit ? ing.unit : '', ing.ingredient_name || '']
              .filter(Boolean)
              .join(' ')
              .trim();
          })
          .filter(Boolean)
      : [];

    const recipeInstructions = Array.isArray(recipe.instructions)
      ? [...recipe.instructions]
          .sort((a, b) => Number(a?.step_number ?? 0) - Number(b?.step_number ?? 0))
          .map((step, idx) => {
            const text = typeof step === 'string' ? step.trim() : String(step?.instruction_text || '').trim();
            return text
              ? {
                  '@type': 'HowToStep',
                  position: step?.step_number ? Number(step.step_number) : idx + 1,
                  text,
                }
              : null;
          })
          .filter(Boolean)
      : [];

    const macrosObj = recipe.macros;
    const nutrition = macrosObj
      ? {
          '@type': 'NutritionInformation',
          ...(macrosObj.calories !== undefined && macrosObj.calories !== null
            ? { calories: `${Number(macrosObj.calories)} calories` }
            : {}),
          ...(macrosObj.protein_g !== undefined && macrosObj.protein_g !== null
            ? { proteinContent: `${Number(macrosObj.protein_g)} g` }
            : {}),
          ...(macrosObj.carbs_g !== undefined && macrosObj.carbs_g !== null
            ? { carbohydrateContent: `${Number(macrosObj.carbs_g)} g` }
            : {}),
          ...(macrosObj.fat_g !== undefined && macrosObj.fat_g !== null
            ? { fatContent: `${Number(macrosObj.fat_g)} g` }
            : {}),
          ...(macrosObj.fiber_g !== undefined && macrosObj.fiber_g !== null
            ? { fiberContent: `${Number(macrosObj.fiber_g)} g` }
            : {}),
        }
      : undefined;

    const ratingCount = Number(recipe.rating_count ?? recipe.ratingCount ?? 0);
    const avgRating = Number(recipe.average_rating ?? recipe.averageRating ?? 0);

    const jsonLd = {
      '@context': 'https://schema.org',
      '@type': 'Recipe',
      name: recipe.title,
      description: recipeDesc,
      url: `${SITE_URL}${canonicalPath}`,
      image: [recipeImg],
      author: {
        '@type': 'Person',
        name: recipe.authorName || 'Emma (AI)',
      },
      recipeCategory: 'Plant-Based',
      suitableForDiet,
      ...(recipe.created_at ? { datePublished: recipe.created_at } : {}),
      ...(recipe.yields ? { recipeYield: recipe.yields } : {}),
      ...(toIsoDuration(prepMins) ? { prepTime: toIsoDuration(prepMins) } : {}),
      ...(toIsoDuration(cookMins) ? { cookTime: toIsoDuration(cookMins) } : {}),
      ...(toIsoDuration(totalMins) ? { totalTime: toIsoDuration(totalMins) } : {}),
      ...(recipeIngredients.length > 0 ? { recipeIngredient: recipeIngredients } : {}),
      ...(recipeInstructions.length > 0 ? { recipeInstructions } : {}),
      ...(nutrition ? { nutrition } : {}),
      ...(ratingCount > 0 && avgRating > 0
        ? {
            aggregateRating: {
              '@type': 'AggregateRating',
              ratingValue: Number(avgRating.toFixed(2)),
              ratingCount,
              bestRating: 5,
              worstRating: 1,
            },
          }
        : {}),
    };

    return {
      title: recipe.title,
      description: recipeDesc,
      canonicalPath,
      ogType: 'article',
      image: recipeImg,
      noindex: isDraft,
      jsonLd,
    };
  }, [recipe]);

  // --- DATA FETCHING (useEffect) ---
  useEffect(() => {
    try {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    } catch {
      window.scrollTo(0, 0);
    }
    setAiImagePaid(false);
    setUpgradeFeedback(null);
    setShareCopied(false);
    setShowShareMenu(false);
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

  // Ensure view resets to the top when the recipe finishes rendering
  useEffect(() => {
    if (!loading && recipe) {
      try {
        window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
      } catch {
        window.scrollTo(0, 0);
      }
    }
  }, [loading, recipe]);

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
          // We feed Emma the exact context of THIS recipe AND the published Vault catalog so she can link related dishes!
          const ingredientsList = recipe.ingredients?.map(i => i.ingredient_name).join(', ') || 'Unknown ingredients';
          const catalogToUse =
            publishedCatalog.length > 0 ? publishedCatalog : await fetchPublishedRecipesCatalog();
          const publishedSection = buildPublishedRecipesPromptSection(catalogToUse, 60);

          const systemPrompt = `You are Emma Advanced, a sassy British culinary expert and co-host of The Chris and Emma Show. 
          You are talking to ${currentUserName}.
          The user is currently viewing the recipe: "${recipe.title}" (ID ${recipe.id}).
          
          Recipe Context:
          Description: ${recipe.description || 'N/A'}
          Ingredients: ${ingredientsList}
          Notes & Deep Dive: ${recipe.notes || 'N/A'}
          
          YOUR RULES:
          1. Answer their question about THIS specific recipe accurately, keeping your signature wit and charm. 
          2. CRITICAL: Be concise (1-3 sentences maximum), but NEVER sacrifice accuracy for brevity.
          3. Do not write introductory greetings. Just give the answer with a dash of sass.
          4. If the user asks for the amount of a specific nutrient (e.g., Sodium, Vitamin C, Iron), you MUST perform the mathematical calculation based on the ingredients provided and give a precise numerical estimate (e.g., "roughly 45mg" or "about 12g"). Do NOT give vague answers like "a modest amount" or "a touch". Put your calculator to work!
          5. If they ask for other recipe examples, side dishes, or variations from The Veggie Vault, recommend real published recipes from the catalog below and link to them using [Recipe Title](/recipe/<id>).${publishedSection}`;

          const reply = await sendChatMessage(updatedHistory, systemPrompt);
          setChatHistory([...updatedHistory, { role: 'model', parts: [{ text: reply }] }]);
      } catch {
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

  const authorId = recipe.authorId || recipe.user_id || null;
  const authorProfileLink = authorId
    ? `/profile/${authorId}`
    : (recipe.authorName && recipe.authorName !== 'Emma (AI)' ? `/profile/${encodeURIComponent(recipe.authorName)}` : null);
  const canFollowAuthor = Boolean(user && authorId && Number(authorId) !== Number(user.id));

  const handleCopyFullRecipe = async () => {
    if (!recipe) return;
    try {
      const formatted = formatStructuredRecipeForClipboard(recipe);
      await copyRichRecipeToClipboard(formatted);
      setRecipeCopied(true);
      setTimeout(() => setRecipeCopied(false), 2500);
    } catch (err) {
      console.error('Failed to copy recipe:', err);
    }
  };

  const handleToggleFollowAuthor = async () => {
    if (!canFollowAuthor || followBusy) return;
    setFollowBusy(true);
    try {
      const res = await api.toggleFollowUser(authorId);
      if (res?.success) {
        setRecipe((prev) => ({
          ...prev,
          isFollowedAuthor: res.isFollowing,
        }));
      }
    } catch (err) {
      console.error('Failed to update follow status:', err);
    } finally {
      setFollowBusy(false);
    }
  };

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
      await promptPurchaseTokens(0.5, 'Generating an AI Dish Photo');
      return;
    }

    setIsGeneratingAiImage(true);
    setUpgradeFeedback(null);
    try {
      if (!aiImagePaid) {
        const tokenRes = await spendToken(0.5, 'Generating an AI Dish Photo');
        if (tokenRes?.cancelled) return;
        if (!tokenRes?.success) {
          alert(tokenRes?.message || 'Unable to deduct 0.5 tokens.');
          return;
        }
        setAiImagePaid(true);
      }

      const base64Data = await generateRecipeImage(
        recipe.title || 'Whole Food Plant-Based Dish',
        imageStyleOptions
      );
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
      await promptPurchaseTokens(0.5, 'Generating Masterpiece Nutritional Analysis');
      return;
    }

    setIsUpgradingNutrition(true);
    setUpgradeFeedback(null);
    try {
      const tokenRes = await spendToken(0.5, 'Generating Masterpiece Nutritional Analysis');
      if (tokenRes?.cancelled) return;
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

      const instructions = getMicroCalculationInstructions();
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

  const handleToggleDetailsLiveChat = async () => {
    if (showLiveChat) {
      setShowLiveChat(false);
      return;
    }
    const confirmed = await confirmTokenUsage(0.1, 'Live Audio with Emma (0.10 Tokens/min)');
    if (!confirmed) return;
    setShowLiveChat(true);
  };

  const shareUrl = typeof window !== 'undefined' ? window.location.href : '';
  const canNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  const handleCopyShareLink = async () => {
    if (!shareUrl) return false;
    let copied = false;
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      try {
        await navigator.clipboard.writeText(shareUrl);
        copied = true;
      } catch {
        copied = false;
      }
    }
    if (!copied && typeof document !== 'undefined') {
      const tempInput = document.createElement('textarea');
      tempInput.value = shareUrl;
      tempInput.setAttribute('readonly', '');
      tempInput.style.position = 'fixed';
      tempInput.style.opacity = '0';
      document.body.appendChild(tempInput);
      tempInput.select();
      try {
        copied = document.execCommand('copy');
      } catch {
        copied = false;
      } finally {
        document.body.removeChild(tempInput);
      }
    }
    if (copied) {
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2500);
    }
    return copied;
  };

  const handleShareRecipe = async () => {
    const nextOpen = !showShareMenu;
    setShowShareMenu(nextOpen);
    if (nextOpen) {
      await handleCopyShareLink();
    }
  };

  const handleNativeShare = async () => {
    if (!canNativeShare) return;
    try {
      await navigator.share({
        title: `${recipe.title} | The Veggie Vault`,
        text: `Check out "${recipe.title}" on The Veggie Vault!`,
        url: shareUrl,
      });
      setShowShareMenu(false);
    } catch {
      // User cancelled native share sheet
    }
  };

  const handlePrintRecipe = () => {
    setShowShareMenu(false);
    window.print();
  };

  // --- THE UI RENDER ---
  return (
    <div className="recipe-page-container">
      {recipeSeo && <SEOHead {...recipeSeo} />}
      
      <div className="recipe-back-wrapper">
        <Link to="/" className="recipe-back-button">&larr; Back to Recipe Grid</Link>
      </div>

      <div className="recipe-image-wrapper">
        <button
          type="button"
          className="recipe-image-trigger"
          onClick={() => setIsImageModalOpen(true)}
          aria-label={`View larger image of ${recipe.title || 'this dish'}`}
        >
          <img src={fullImageUrl} alt={recipe.title || 'A glorious WFPB meal'} className="recipe-hero-image" />
          <span className="recipe-image-zoom-hint no-print" aria-hidden="true">
            🔍 Click to enlarge
          </span>
        </button>
      </div>

      <div className="recipe-card">
        <header className="recipe-header">
          <div className="recipe-dietary-header-badges">
            {getRecipeDietaryFlags(recipe).oilFree && (
              <span className="recipe-badge-oil-free">🌱 100% Oil-Free</span>
            )}
            {getRecipeDietaryFlags(recipe).glutenFree && (
              <span className="recipe-badge-gluten-free">🌾 Gluten-Free</span>
            )}
            {getRecipeDietaryFlags(recipe).sugarFree && (
              <span className="recipe-badge-sugar-free">🍯 Refined Sugar-Free</span>
            )}
          </div>
          <div className="recipe-details-header">
        <div className="title-row">
          <h1 className="recipe-title">{recipe.title}</h1>
          <FavoriteButton recipeId={recipe.id} initialFavorited={recipe.isFavorited || false} />
        </div>
        {/* The Creator Tag & Action Toolbar */}
        <div className="author-badge">
          <div className="recipe-creator-row">
            <span className="recipe-creator-pill">
              Recipe by:{' '}
              {authorProfileLink ? (
                <UserHoverFollow
                  userId={authorId}
                  username={recipe.authorName}
                  profileLink={authorProfileLink}
                  className="recipe-creator-link"
                >
                  {recipe.authorName || 'Emma (AI)'}
                </UserHoverFollow>
              ) : (
                <strong>{recipe.authorName || 'Emma (AI)'}</strong>
              )}
            </span>
            {canFollowAuthor && (
              <button
                type="button"
                onClick={handleToggleFollowAuthor}
                disabled={followBusy}
                className={`recipe-follow-btn ${recipe.isFollowedAuthor ? 'following' : ''}`}
              >
                {followBusy ? 'Updating...' : (recipe.isFollowedAuthor ? '✓ Following Chef' : '➕ Follow Chef')}
              </button>
            )}
          </div>

          <div className="recipe-action-toolbar">
            <button
              type="button"
              className="recipe-details-plan-btn"
              onClick={() =>
                window.dispatchEvent(
                  new CustomEvent('veggie-vault:open-meal-plan', { detail: { recipe } })
                )
              }
            >
              📅 Add to Meal Plan
            </button>

            <div className="recipe-share-wrapper">
              <button
                type="button"
                className="recipe-details-action-btn share-btn"
                onClick={handleShareRecipe}
                aria-expanded={showShareMenu}
                aria-haspopup="true"
              >
                {shareCopied ? '✓ Link Copied!' : '🔗 Share Recipe'}
              </button>

              {showShareMenu && (
                <div className="recipe-share-popover" role="menu">
                  <button
                    type="button"
                    role="menuitem"
                    className="recipe-share-option"
                    onClick={handleCopyShareLink}
                  >
                    {shareCopied ? '✓ Copied to Clipboard' : '📋 Copy Recipe Link'}
                  </button>
                  <a
                    role="menuitem"
                    className="recipe-share-option"
                    href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => setShowShareMenu(false)}
                  >
                    📘 Facebook
                  </a>
                  <a
                    role="menuitem"
                    className="recipe-share-option"
                    href={`https://twitter.com/intent/tweet?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(`Check out "${recipe.title}" on The Veggie Vault!`)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => setShowShareMenu(false)}
                  >
                    𝕏 Share on X
                  </a>
                  <a
                    role="menuitem"
                    className="recipe-share-option"
                    href={`https://wa.me/?text=${encodeURIComponent(`${recipe.title} - ${shareUrl}`)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => setShowShareMenu(false)}
                  >
                    💬 WhatsApp
                  </a>
                  <a
                    role="menuitem"
                    className="recipe-share-option"
                    href={`mailto:?subject=${encodeURIComponent(`${recipe.title} — The Veggie Vault`)}&body=${encodeURIComponent(`Check out this whole-food plant-based recipe:\n\n${recipe.title}\n${shareUrl}`)}`}
                    onClick={() => setShowShareMenu(false)}
                  >
                    ✉️ Email Recipe
                  </a>
                  {canNativeShare && (
                    <button
                      type="button"
                      role="menuitem"
                      className="recipe-share-option"
                      onClick={handleNativeShare}
                    >
                      📱 Device Share...
                    </button>
                  )}
                </div>
              )}
            </div>

            <button
              type="button"
              className="recipe-details-action-btn print-btn"
              onClick={handleCopyFullRecipe}
            >
              {recipeCopied ? '✓ Recipe Copied!' : '📋 Copy Full Recipe'}
            </button>

            <button
              type="button"
              className="recipe-details-action-btn print-btn"
              onClick={handlePrintRecipe}
            >
              🖨️ Print Recipe
            </button>
          </div>
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

            <div className="workshop-style-section">
              <ImageStyleOptions
                value={imageStyleOptions}
                onChange={setImageStyleOptions}
                disabled={isGeneratingAiImage || isPublishing || isUpgradingNutrition}
                compact
              />
            </div>

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
                <div className="no-print" style={{ margin: '0 1.5rem 1rem 1.5rem', display: 'flex', justifyContent: 'flex-end' }}>
                    <button
                        type="button"
                        onClick={handleToggleDetailsLiveChat}
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
                    <div className="no-print" style={{ margin: '0 1.5rem 2rem 1.5rem' }}>
                        <LiveChat
                            recipeContext={`The user is currently viewing the recipe: "${recipe.title}". Ingredients: ${recipe.ingredients?.map(i => i.ingredient_name).join(', ')}`}
                            publishedRecipesContext={buildPublishedRecipesPromptSection(publishedCatalog, 60, { vocalMode: true })}
                            chatContext={
                                chatHistory.length > 0
                                    ? chatHistory
                                        .slice(-10)
                                        .map((m) => `${m.role === 'user' ? currentUserName : 'Emma'}: ${m.parts?.[0]?.text || ''}`)
                                        .join('\n\n')
                                    : null
                            }
                            preConfirmed={true}
                            autoStart={true}
                        />
                    </div>
                )}
                {/* --- ASK EMMA CHATBOX --- */}
                <div className="recipe-chat-container">
                    <h3 className="recipe-chat-heading">
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
                                        <EmmaMarkdown>{msg.parts[0].text}</EmmaMarkdown>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    <form onSubmit={handleChatSubmit} className="recipe-chat-form">
                        <textarea
                            ref={chatInputRef}
                            rows={1}
                            value={chatMessage}
                            onChange={(e) => setChatMessage(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    if (!isChatting && chatMessage.trim()) {
                                        handleChatSubmit(e);
                                    }
                                }
                            }}
                            placeholder="E.g., How much Vitamin C is in this? Can I substitute the mushrooms?"
                            className="recipe-chat-input"
                            disabled={isChatting}
                        />
                        <VoiceDictationButton
                            value={chatMessage}
                            onChange={setChatMessage}
                            disabled={isChatting}
                        />
                        <button
                            type="submit"
                            disabled={isChatting || !chatMessage.trim()}
                            className="recipe-chat-submit-btn"
                        >
                            {isChatting ? 'Thinking...' : 'Ask'}
                        </button>
                    </form>
                </div>
            </>
        ) : (
            <div className="no-print" style={{ margin: '0 1.5rem 2rem 1.5rem', padding: '1.5rem', backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e5e7eb', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)', textAlign: 'center' }}>
                <p style={{ color: '#374151', fontSize: '1.1rem', margin: 0 }}>
                    Want to ask Emma a question or chat live? <Link to='/login' style={{ color: '#9333ea', fontWeight: 'bold', textDecoration: 'none' }}>Log in</Link> to access these features!
                </p>
            </div>
        )}

        <CommentSection recipeId={recipe.id} />
      </div>

      {isImageModalOpen && (
        <div
          className="recipe-image-modal-backdrop no-print"
          role="dialog"
          aria-modal="true"
          aria-label={`Full-size photo of ${recipe.title || 'this dish'}`}
          onClick={() => setIsImageModalOpen(false)}
        >
          <button
            type="button"
            className="recipe-image-modal-close"
            onClick={() => setIsImageModalOpen(false)}
            aria-label="Close enlarged image"
          >
            ✕
          </button>
          <div
            className="recipe-image-modal-content"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={fullImageUrl}
              alt={recipe.title || 'A glorious WFPB meal'}
              className="recipe-image-modal-img"
            />
            {recipe.title && (
              <p className="recipe-image-modal-caption">{recipe.title}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default RecipeDetails;