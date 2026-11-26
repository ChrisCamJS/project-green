import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import {
  sendChatMessage,
  generateRecipeImage,
  DEFAULT_IMAGE_STYLE_OPTIONS,
} from '../services/geminiApi';
import { getMicroCalculationInstructions, parseMicrosFromDeepDive, stripDuplicateMicroLines } from '../utils/promptBuilder';
import { useEmmaVoice } from '../hooks/useEmmaVoice';
import { useAuth } from '../context/AuthContext';
import SEOHead from '../components/SEOHead';
import { SITE_URL, DEFAULT_OG_IMAGE, cleanSeoText, toIsoDuration } from '../utils/seoUtils';
import { getRecipeDietaryFlags } from '../utils/dietaryUtils';
import { navigateToLogin } from '../utils/authRedirect';
import LiveChat from '../components/LiveChat';
import ImageStyleOptions from '../components/RecipeDashboard/ImageStyleOptions';
import ReactMarkdown from 'react-markdown';
import EmmaMarkdown from '../components/EmmaMarkdown';
import VoiceDictationButton from '../components/VoiceDictationButton';
import {
  fetchPublishedRecipesCatalog,
  buildPublishedRecipesPromptSection,
} from '../utils/emmaRecipeContext';
import {
  RECIPE_IDEAS_PROMPT_PROTOCOL,
  extractRecipeIdeas,
} from '../utils/recipeIdeas';
import RecipeIdeaActions from '../components/RecipeIdeaActions';
import NutritionPanel from '../components/NutritionPanel';
import StarRating from '../components/StarRating';
import CommentSection from '../components/CommentSection';
import FavoriteButton from '../components/FavoriteButton';
import UserHoverFollow from '../components/UserHoverFollow';
import RecipeCard from '../components/RecipeCard';
import VariantBadge from '../components/VariantBadge';
import CreateVariantModal from '../components/CreateVariantModal';
import RecipeStoriesSection from '../components/RecipeStoriesSection';
import StoryEditorModal from '../components/StoryEditorModal';
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
  const navigate = useNavigate();
  const { user, spendToken, confirmTokenUsage, promptPurchaseTokens } = useAuth();
  const [isVariantModalOpen, setIsVariantModalOpen] = useState(false);
  const [isStoryModalOpen, setIsStoryModalOpen] = useState(false);
  const [storyRefreshKey, setStoryRefreshKey] = useState(0);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isGeneratingAiImage, setIsGeneratingAiImage] = useState(false);
  const [aiImagePaid, setAiImagePaid] = useState(false);
  const [isUpgradingNutrition, setIsUpgradingNutrition] = useState(false);
  const [isRecalculatingUsda, setIsRecalculatingUsda] = useState(false);
  const [usdaFeedback, setUsdaFeedback] = useState(null);
  const [followBusy, setFollowBusy] = useState(false);
  const [upgradeFeedback, setUpgradeFeedback] = useState(null);
  const [shareCopied, setShareCopied] = useState(false);
  const [recipeCopied, setRecipeCopied] = useState(false);
  const [showShareMenu, setShowShareMenu] = useState(false);
  const [showMoreActionsMenu, setShowMoreActionsMenu] = useState(false);
  const moreActionsRef = useRef(null);
  const [isImageModalOpen, setIsImageModalOpen] = useState(false);
  const [imageStyleOptions, setImageStyleOptions] = useState({ ...DEFAULT_IMAGE_STYLE_OPTIONS });
  const [selectedPreviewPath, setSelectedPreviewPath] = useState(null);
  const [isUploadingPhotos, setIsUploadingPhotos] = useState(false);
  const [photoActionMsg, setPhotoActionMsg] = useState(null);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [isSavingTitle, setIsSavingTitle] = useState(false);
  const [titleError, setTitleError] = useState(null);
  const [titleFeedback, setTitleFeedback] = useState(null);
  const titleFeedbackTimerRef = useRef(null);

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

  useEffect(() => {
    if (!showMoreActionsMenu) return undefined;
    const handleOutsideClick = (event) => {
      if (moreActionsRef.current && !moreActionsRef.current.contains(event.target)) {
        setShowMoreActionsMenu(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('touchstart', handleOutsideClick, { passive: true });
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('touchstart', handleOutsideClick);
    };
  }, [showMoreActionsMenu]);
  const currentUserName = user?.username || 'Love';
  
  const [recipe, setRecipe] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // --- EMMA'S CHAT & VOICE STATE ---
  useEffect(() => {
    setSelectedPreviewPath(null);
    setPhotoActionMsg(null);
    setUsdaFeedback(null);
    setIsEditingTitle(false);
    setTitleError(null);
    setTitleFeedback(null);
    setIsVariantModalOpen(false);
    setIsStoryModalOpen(false);
  }, [id]);

  useEffect(() => {
    return () => {
      if (titleFeedbackTimerRef.current) {
        clearTimeout(titleFeedbackTimerRef.current);
      }
    };
  }, []);

  const { speechState, activeKey, handleSpeak } = useEmmaVoice();
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

  const similarRecipes = useMemo(() => {
    if (!recipe || !Array.isArray(publishedCatalog) || publishedCatalog.length === 0) {
      return [];
    }
    const currentId = Number(recipe.id);
    const currentFlags = getRecipeDietaryFlags(recipe);
    const stopWords = new Set(['with', 'and', 'the', 'for', 'bowl', 'style', 'easy', 'quick', 'vegan', 'plant', 'based']);
    const titleTokens = new Set(
      `${recipe.title || ''} ${recipe.description || ''}`
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((w) => w.length >= 4 && !stopWords.has(w))
    );

    return publishedCatalog
      .filter((item) => Number(item.id) !== currentId && !item.isDraft && item.isPublic !== false)
      .map((item) => {
        const flags = getRecipeDietaryFlags(item);
        let score = 0;
        if (currentFlags.oilFree && flags.oilFree) score += 2;
        if (currentFlags.glutenFree && flags.glutenFree) score += 2;
        if (currentFlags.sugarFree && flags.sugarFree) score += 1;

        const itemWords = `${item.title || ''} ${item.description || ''}`
          .toLowerCase()
          .split(/[^a-z0-9]+/);
        for (const w of itemWords) {
          if (titleTokens.has(w)) score += 3;
        }
        score += (Number(item.averageRating || 0) * 0.4);
        return { item, score };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map((entry) => entry.item);
  }, [recipe, publishedCatalog]);

  useEffect(() => {
    let active = true;
    fetchPublishedRecipesCatalog(false, user?.id).then((catalog) => {
      if (active && Array.isArray(catalog)) {
        setPublishedCatalog(catalog);
      }
    });
    return () => {
      active = false;
    };
  }, [user?.id]);

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
    setShowMoreActionsMenu(false);
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
            publishedCatalog.length > 0 ? publishedCatalog : await fetchPublishedRecipesCatalog(false, user?.id);
          const publishedSection = buildPublishedRecipesPromptSection(catalogToUse, 15, {
            currentUser: user,
            query: newUserMsg,
            compact: true,
          });

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
          5. If they ask for other recipe examples, side dishes, or variations from The Veggie Vault, recommend real published recipes from the catalog below and link to them using [Recipe Title](/recipe/<id>).${publishedSection}
          6. If the user asks for substitutions, tweaks, or ideas, do NOT push gluten-free alternatives unless they specifically ask for gluten-free or this recipe is explicitly gluten-free. Wholesome wheat and gluten grains are celebrated Whole-Food Plant-Based staples.

${RECIPE_IDEAS_PROMPT_PROTOCOL}`;

          const reply = await sendChatMessage(updatedHistory.slice(-10), systemPrompt, {
            purpose: 'free_chat',
          });
          setChatHistory([...updatedHistory, { role: 'model', parts: [{ text: reply }] }]);
      } catch (err) {
          setChatHistory([
            ...updatedHistory,
            {
              role: 'model',
              parts: [{ text: err?.message || "Oh dear, my brain seems to have short-circuited. Could you ask that again, love?" }],
            },
          ]);
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

  const resolveImageSrc = (rawPath) => {
    if (!rawPath) return '/belle-house-fiesta-bowl.jpg';
    return (rawPath.startsWith('http') || rawPath.startsWith('data:')) ? rawPath : `${API_URL}${rawPath}`;
  };

  const targetImage = recipe?.imageUrl || recipe?.image_url;
  const galleryImages = Array.isArray(recipe?.images) && recipe.images.length > 0
    ? recipe.images
    : (targetImage && !targetImage.includes('default-veggie-vault-placeholder')
        ? [{ id: 0, image_url: targetImage, source: recipe.imageSource || recipe.image_source || 'user' }]
        : []);
  const activeHeroPath = selectedPreviewPath || targetImage;
  const fullImageUrl = resolveImageSrc(activeHeroPath);

  const currentImageSource = recipe.imageSource || recipe.image_source || 'none';
  const hasRealImage = Boolean(
    targetImage &&
    currentImageSource !== 'none' &&
    !targetImage.includes('default-veggie-vault-placeholder')
  );
  const hasMicros = Array.isArray(mappedMicros) && mappedMicros.length > 0;
  const isDraftRecipe = !Number(recipe.is_public ?? (recipe.isPublic ? 1 : 0));

  const authorId = recipe.authorId || recipe.user_id || null;
  const isAdmin = Boolean(
    user && (Number(user.is_admin) === 1 || user.is_admin === true)
  );
  const isRecipeCreator = Boolean(
    user && authorId && Number(user.id) === Number(authorId)
  );
  const isRecipeOwner = Boolean(
    user &&
    (Number(user.id) === Number(authorId) || isAdmin)
  );
  const authorProfileLink = authorId
    ? `/profile/${authorId}`
    : (recipe.authorName && recipe.authorName !== 'Emma (AI)' ? `/profile/${encodeURIComponent(recipe.authorName)}` : null);
  const canFollowAuthor = Boolean(user && authorId && Number(authorId) !== Number(user.id));

  // --- RECIPE VARIANT LINEAGE & DUAL ATTRIBUTION ---
  const parentRecipeId = recipe.parentRecipeId || recipe.parent_recipe_id || recipe.parentRecipe?.id || null;
  const isVariantRecipe = Boolean(parentRecipeId);
  const parentRecipeTitle = recipe.parentRecipe?.title || recipe.parentRecipeTitle || 'Original Recipe';
  const parentAuthorId = recipe.parentRecipe?.authorId || recipe.parentAuthorId || null;
  const parentAuthorName = recipe.parentRecipe?.authorName || recipe.parentAuthorName || 'Emma (AI)';
  const parentAuthorProfileLink = parentAuthorId
    ? `/profile/${parentAuthorId}`
    : (parentAuthorName && parentAuthorName !== 'Emma (AI)' ? `/profile/${encodeURIComponent(parentAuthorName)}` : null);
  const isMasterpieceVariant = Boolean(recipe.isMasterpiece || recipe.is_masterpiece || hasMicros);
  const variantSummary = recipe.variantSummary || recipe.variant_summary || null;
  const communityVariants = Array.isArray(recipe.variants) ? recipe.variants : [];

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

  const handleUploadAdditionalPhotos = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length || !recipe) return;

    setIsUploadingPhotos(true);
    setPhotoActionMsg(null);
    try {
      const encoded = await Promise.all(
        files.slice(0, 6).map(
          (file) =>
            new Promise((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(reader.result);
              reader.onerror = () => reject(new Error(`Could not read ${file.name}`));
              reader.readAsDataURL(file);
            })
        )
      );

      const res = await api.addRecipePhotos(recipe.id, encoded, false);
      if (res?.success) {
        setRecipe((prev) => ({
          ...prev,
          image_url: res.image_url || prev.image_url,
          imageUrl: res.image_url || prev.imageUrl,
          images: res.images || prev.images,
        }));
        setPhotoActionMsg(res.message || 'Photos added! Emma’s image remains your public cover unless you pick another.');
      }
    } catch (err) {
      setPhotoActionMsg(err?.message || 'Failed to upload photos.');
    } finally {
      setIsUploadingPhotos(false);
    }
  };

  const handleSetPrimaryPhoto = async (imageUrl) => {
    if (!recipe || !imageUrl) return;
    setPhotoActionMsg(null);
    try {
      const res = await api.setPrimaryRecipePhoto(recipe.id, imageUrl);
      if (res?.success) {
        setRecipe((prev) => ({
          ...prev,
          image_url: res.image_url,
          imageUrl: res.image_url,
          image_source: res.image_source,
          imageSource: res.image_source,
          images: res.images || prev.images,
        }));
        setSelectedPreviewPath(res.image_url);
        setPhotoActionMsg('Public cover photo updated!');
      }
    } catch (err) {
      setPhotoActionMsg(err?.message || 'Could not update public cover photo.');
    }
  };

  const handleDeleteGalleryPhoto = async (img) => {
    if (!recipe || !img?.id) return;
    setPhotoActionMsg(null);
    try {
      const res = await api.deleteRecipePhoto(recipe.id, img.id);
      if (res?.success) {
        setRecipe((prev) => ({
          ...prev,
          image_url: res.image_url || prev.image_url,
          imageUrl: res.image_url || prev.imageUrl,
          images: res.images || prev.images,
        }));
        if (selectedPreviewPath === img.image_url) {
          setSelectedPreviewPath(null);
        }
        setPhotoActionMsg('Photo removed.');
      }
    } catch (err) {
      setPhotoActionMsg(err?.message || 'Could not remove photo.');
    }
  };

  const handleStartEditTitle = () => {
    setTitleDraft(recipe?.title || '');
    setTitleError(null);
    setTitleFeedback(null);
    setIsEditingTitle(true);
  };

  const handleCancelEditTitle = () => {
    setIsEditingTitle(false);
    setTitleError(null);
  };

  const handleSaveTitle = async (e) => {
    e?.preventDefault();
    if (!recipe || isSavingTitle) return;

    const trimmed = String(titleDraft || '').replace(/\s+/g, ' ').trim();
    if (!trimmed) {
      setTitleError('Recipe name cannot be empty.');
      return;
    }

    if (trimmed === String(recipe.title || '').trim()) {
      setIsEditingTitle(false);
      setTitleError(null);
      return;
    }

    setIsSavingTitle(true);
    setTitleError(null);
    try {
      const res = await api.updateRecipeTitle(recipe.id, trimmed);
      if (res?.success) {
        const nextTitle = res.title || trimmed;
        setRecipe((prev) => ({
          ...prev,
          title: nextTitle,
        }));
        setIsEditingTitle(false);
        setTitleFeedback('✓ Recipe name updated!');
        if (titleFeedbackTimerRef.current) {
          clearTimeout(titleFeedbackTimerRef.current);
        }
        titleFeedbackTimerRef.current = setTimeout(() => {
          setTitleFeedback(null);
        }, 3000);
      }
    } catch (err) {
      setTitleError(err?.message || 'Could not update recipe name.');
    } finally {
      setIsSavingTitle(false);
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
      if (!displayNotes || !displayNotes.includes('Advanced Nutritional Analysis')) {
          displayNotes = "### Emma's Deep Dive" + parts[1];
      }
  }
  displayNotes = stripDuplicateMicroLines(displayNotes);
  if (displayNotes) {
      displayNotes = displayNotes
          .replace(/^\s{0,3}(?:#{1,6}\s*|\*\*\s*)?Advanced Nutritional Analysis(?:\s*\*\*)?\s*$/gim, '')
          .replace(/^\n+/, '')
          .trim();
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

      let res = null;
      try {
        // Attempt deterministic USDA FoodData Central calculation first (zero extra AI calls)
        res = await api.upgradeRecipeNutrition(recipe.id, '', []);
      } catch (usdaErr) {
        console.warn('USDA nutrition unavailable during recipe upgrade, falling back to Emma Deep Dive:', usdaErr);
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

        res = await api.upgradeRecipeNutrition(recipe.id, mathResult, parsedMicros);
      }

      if (res?.success) {
        setRecipe((prev) => ({
          ...prev,
          notes: res.notes,
          macros: res.macros || prev.macros,
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

  const handleRecalculateUsda = async () => {
    if (!recipe || isRecalculatingUsda) return;
    setIsRecalculatingUsda(true);
    setUsdaFeedback(null);
    try {
      const res = await api.recalculateRecipeNutrition(recipe.id);
      if (res?.success) {
        setRecipe((prev) => ({
          ...prev,
          notes: res.notes ?? prev.notes,
          macros: res.macros || prev.macros,
          micros: res.micros || prev.micros,
        }));
        setUsdaFeedback(res.message || 'Nutrition recalculated from USDA FoodData Central!');
      }
    } catch (err) {
      console.error('Failed to recalculate USDA nutrition:', err);
      setUsdaFeedback(err?.message || 'Could not recalculate nutrition from USDA.');
    } finally {
      setIsRecalculatingUsda(false);
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
      setShowMoreActionsMenu(false);
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

      {(galleryImages.length > 1 || isRecipeCreator) && (
        <div className="recipe-gallery-bar no-print">
          <div className="recipe-gallery-header">
            <span className="recipe-gallery-title">
              📸 Dish Photos ({galleryImages.length})
            </span>
            {isRecipeCreator && (
              <label className={`recipe-gallery-upload-btn ${isUploadingPhotos ? 'disabled' : ''}`}>
                {isUploadingPhotos ? '⏳ Uploading...' : '➕ Add Dish Photos'}
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleUploadAdditionalPhotos}
                  disabled={isUploadingPhotos}
                  hidden
                />
              </label>
            )}
          </div>

          {photoActionMsg && (
            <p className="recipe-gallery-feedback">{photoActionMsg}</p>
          )}

          {galleryImages.length > 0 && (
            <div className="recipe-gallery-thumbs">
              {galleryImages.map((img, idx) => {
                const isPrimary = img.image_url === targetImage;
                const isPreviewing = img.image_url === activeHeroPath;
                return (
                  <div
                    key={img.id || `${img.image_url}-${idx}`}
                    className={`recipe-gallery-thumb-card ${isPreviewing ? 'previewing' : ''}`}
                  >
                    <button
                      type="button"
                      className="recipe-gallery-thumb-btn"
                      onClick={() => setSelectedPreviewPath(img.image_url)}
                      title="Preview this photo"
                    >
                      <img
                        src={resolveImageSrc(img.image_url)}
                        alt={`${recipe.title} view ${idx + 1}`}
                      />
                      {isPrimary && (
                        <span className="recipe-gallery-cover-badge">✓ Cover</span>
                      )}
                    </button>
                    {isRecipeCreator && (
                      <div className="recipe-gallery-thumb-actions">
                        {!isPrimary && (
                          <button
                            type="button"
                            className="recipe-gallery-set-cover-btn"
                            onClick={() => handleSetPrimaryPhoto(img.image_url)}
                            title="Make this the public recipe cover"
                          >
                            Set Cover
                          </button>
                        )}
                        {img.id > 0 && galleryImages.length > 1 && (
                          <button
                            type="button"
                            className="recipe-gallery-del-btn"
                            onClick={() => handleDeleteGalleryPhoto(img)}
                            title="Remove photo"
                            aria-label="Remove photo"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div className="recipe-card">
        <header className="recipe-header">
          <div className="recipe-dietary-header-badges">
            {isVariantRecipe && (
              <VariantBadge
                parentRecipeId={parentRecipeId}
                parentRecipeTitle={parentRecipeTitle}
                parentAuthorName={parentAuthorName}
                isMasterpiece={isMasterpieceVariant}
                variantSummary={variantSummary}
              />
            )}
            {getRecipeDietaryFlags(recipe).oilFree && (
              <span className="recipe-badge-oil-free">Oil-Free</span>
            )}
            {getRecipeDietaryFlags(recipe).glutenFree && (
              <span className="recipe-badge-gluten-free">Gluten-Free</span>
            )}
            {getRecipeDietaryFlags(recipe).sugarFree && (
              <span className="recipe-badge-sugar-free">Refined Sugar-Free</span>
            )}
          </div>
          <div className="recipe-details-header">
        <div className="title-row">
          {!isEditingTitle ? (
            <>
              <h1 className="recipe-title">{recipe.title}</h1>
              {isRecipeOwner && (
                <button
                  type="button"
                  className="recipe-title-edit-btn recipe-desktop-only-action no-print"
                  onClick={handleStartEditTitle}
                  title="Edit recipe name"
                >
                  ✏️ Edit Name
                </button>
              )}
              {titleFeedback && (
                <span className="recipe-title-feedback no-print" role="status">
                  {titleFeedback}
                </span>
              )}
            </>
          ) : (
            <form className="recipe-title-edit-form no-print" onSubmit={handleSaveTitle}>
              <div className="recipe-title-edit-controls">
                <input
                  type="text"
                  className="recipe-title-edit-input"
                  value={titleDraft}
                  onChange={(e) => {
                    setTitleDraft(e.target.value);
                    if (titleError) setTitleError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      handleCancelEditTitle();
                    }
                  }}
                  maxLength={200}
                  disabled={isSavingTitle}
                  autoFocus
                  aria-label="Edit recipe name"
                  placeholder="Enter recipe name..."
                />
                <button
                  type="submit"
                  className="recipe-title-save-btn"
                  disabled={isSavingTitle || !titleDraft.trim()}
                >
                  {isSavingTitle ? 'Saving...' : '✓ Save'}
                </button>
                <button
                  type="button"
                  className="recipe-title-cancel-btn"
                  onClick={handleCancelEditTitle}
                  disabled={isSavingTitle}
                >
                  Cancel
                </button>
              </div>
              {titleError && (
                <p className="recipe-title-edit-error" role="alert">
                  {titleError}
                </p>
              )}
            </form>
          )}
        </div>
        {isVariantRecipe && variantSummary && (
          <div className="recipe-variant-summary-bar">
            <span className="recipe-variant-summary-text">
              🔀 <strong>Variant Twist:</strong> {variantSummary}
            </span>
            <div className="recipe-variant-summary-links">
              <Link to={`/recipe/${parentRecipeId}`} className="recipe-variant-parent-inline-link">
                View Original: {parentRecipeTitle} →
              </Link>
              <Link
                to={`/recipe/${recipe.id}/connections?tab=variants`}
                className="recipe-variant-parent-inline-link"
              >
                Trace Lineage
              </Link>
            </div>
          </div>
        )}
        {/* The Creator Tag & Action Toolbar */}
        <div className="author-badge">
          <div className="recipe-creator-row">
            <span className="recipe-creator-pill">
              Created by:{' '}
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
            {isVariantRecipe && (
              <span className="recipe-creator-pill recipe-inspired-pill">
                Inspired by:{' '}
                {parentAuthorProfileLink ? (
                  <UserHoverFollow
                    userId={parentAuthorId}
                    username={parentAuthorName}
                    profileLink={parentAuthorProfileLink}
                    className="recipe-creator-link"
                  >
                    {parentAuthorName}
                  </UserHoverFollow>
                ) : (
                  <strong>{parentAuthorName}</strong>
                )}
                {' · '}
                <Link to={`/recipe/${parentRecipeId}`} className="recipe-inspired-recipe-link">
                  {parentRecipeTitle}
                </Link>
              </span>
            )}
            {Math.max(Number(recipe.variantCount ?? recipe.variant_count ?? 0), communityVariants.length) > 0 && (
              <Link
                to={`/recipe/${recipe.id}/connections?tab=variants`}
                className="recipe-creator-pill recipe-connection-pill variants"
                title="View all associated public variants and trace full variant lineage"
              >
                🔀 {Math.max(Number(recipe.variantCount ?? recipe.variant_count ?? 0), communityVariants.length)}{' '}
                {Math.max(Number(recipe.variantCount ?? recipe.variant_count ?? 0), communityVariants.length) === 1
                  ? 'Variant'
                  : 'Variants'}
              </Link>
            )}
            {Number(recipe.storyCount ?? recipe.story_count ?? 0) > 0 && (
              <Link
                to={`/recipe/${recipe.id}/connections?tab=stories`}
                className="recipe-creator-pill recipe-connection-pill stories"
                title="View all published community stories for this recipe"
              >
                📖 {Number(recipe.storyCount ?? recipe.story_count ?? 0)}{' '}
                {Number(recipe.storyCount ?? recipe.story_count ?? 0) === 1 ? 'Story' : 'Stories'}
              </Link>
            )}
            {canFollowAuthor && (
              <button
                type="button"
                onClick={handleToggleFollowAuthor}
                disabled={followBusy}
                className={`recipe-follow-btn ${recipe.isFollowedAuthor ? 'following' : ''}`}
              >
                {followBusy ? 'Updating...' : (
                  recipe.isFollowedAuthor ? (
                    <>✓ Following<span className="recipe-btn-desktop-only"> Chef</span></>
                  ) : (
                    <>➕ Follow<span className="recipe-btn-desktop-only"> Chef</span></>
                  )
                )}
              </button>
            )}
          </div>

          <div className="recipe-action-toolbar">
            {isAdmin && (
              <Link
                to={`/admin/edit/${recipe.id}`}
                className="recipe-details-action-btn recipe-desktop-only-action"
                style={{ textDecoration: 'none', backgroundColor: '#fef3c7', color: '#92400e', borderColor: '#f59e0b' }}
              >
                ✏️ Edit Recipe
              </Link>
            )}

            <button
              type="button"
              className="recipe-details-variant-btn no-print"
              onClick={() => {
                if (!user) {
                  navigateToLogin(navigate);
                  return;
                }
                setIsVariantModalOpen(true);
              }}
              title="Fork this recipe with Emma's Variant Studio"
            >
              <span className="recipe-btn-desktop-only">Create </span>Variant
            </button>

            <button
              type="button"
              className="recipe-details-story-btn recipe-desktop-only-action no-print"
              onClick={() => {
                if (!user) {
                  navigateToLogin(navigate);
                  return;
                }
                setIsStoryModalOpen(true);
              }}
              title="Write a blog post / cooking story about this recipe"
            >
              Write a Story
            </button>

            <button
              type="button"
              className="recipe-details-plan-btn"
              onClick={() =>
                window.dispatchEvent(
                  new CustomEvent('veggie-vault:open-meal-plan', { detail: { recipe } })
                )
              }
            >
              <span className="recipe-btn-desktop-only">Add to </span>Meal Plan
            </button>

            <div className="recipe-share-wrapper">
              <button
                type="button"
                className="recipe-details-action-btn share-btn"
                onClick={handleShareRecipe}
                aria-expanded={showShareMenu}
                aria-haspopup="true"
              >
                {shareCopied ? '✓ Link Copied!' : '🔗 Share'}
              </button>

              {showShareMenu && (
                <div className="recipe-share-popover" role="menu">
                  <button
                    type="button"
                    role="menuitem"
                    className="recipe-share-option"
                    onClick={handleCopyShareLink}
                  >
                    {shareCopied ? '✓ Copied to Clipboard' : 'Copy Recipe Link'}
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
              className="recipe-details-action-btn print-btn recipe-desktop-only-action"
              onClick={handleCopyFullRecipe}
            >
              {recipeCopied ? '✓ Recipe Copied!' : 'Copy Recipe'}
            </button>

            <button
              type="button"
              className="recipe-details-action-btn print-btn recipe-desktop-only-action"
              onClick={handlePrintRecipe}
            >
              🖨️ Print
            </button>

            <div className="recipe-more-actions-wrapper no-print" ref={moreActionsRef}>
              <button
                type="button"
                className="recipe-details-action-btn recipe-more-btn"
                onClick={() =>
                  setShowMoreActionsMenu((prev) => {
                    if (!prev) setShowShareMenu(false);
                    return !prev;
                  })
                }
                aria-expanded={showMoreActionsMenu}
                aria-haspopup="true"
                aria-label="More recipe actions"
              >
                ••• More
              </button>

              {showMoreActionsMenu && (
                <div className="recipe-more-popover" role="menu">
                  <button
                    type="button"
                    role="menuitem"
                    className="recipe-more-option"
                    onClick={() => {
                      setShowMoreActionsMenu(false);
                      if (!user) {
                        navigateToLogin(navigate);
                        return;
                      }
                      setIsStoryModalOpen(true);
                    }}
                  >
                    Write a Story
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="recipe-more-option"
                    onClick={() => {
                      setShowMoreActionsMenu(false);
                      handleCopyFullRecipe();
                    }}
                  >
                    {recipeCopied ? '✓ Recipe Copied!' : '📋 Copy Recipe'}
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="recipe-more-option"
                    onClick={() => {
                      setShowMoreActionsMenu(false);
                      handlePrintRecipe();
                    }}
                  >
                    🖨️ Print Recipe
                  </button>
                  {isRecipeOwner && (
                    <button
                      type="button"
                      role="menuitem"
                      className="recipe-more-option"
                      onClick={() => {
                        setShowMoreActionsMenu(false);
                        handleStartEditTitle();
                      }}
                    >
                      ✏️ Edit Name
                    </button>
                  )}
                  {isAdmin && (
                    <Link
                      to={`/admin/edit/${recipe.id}`}
                      role="menuitem"
                      className="recipe-more-option"
                      onClick={() => setShowMoreActionsMenu(false)}
                    >
                      ✏️ Edit Recipe
                    </Link>
                  )}
                </div>
              )}
            </div>
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
            <FavoriteButton recipeId={recipe.id} initialFavorited={recipe.isFavorited || false} />
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
              <div className="recipe-section-heading-row">
                <h3 className="recipe-section-title">Ingredients</h3>
                {recipe.ingredients && recipe.ingredients.length > 0 && (
                  <button
                    type="button"
                    className="recipe-section-speak-btn no-print"
                    onClick={() => {
                      const spoken = recipe.ingredients
                        .map((ing) => {
                          const hasQty = Number(ing.quantity) !== 0 && Number(ing.quantity) !== 1;
                          const hasUnit = ing.unit && ing.unit !== 'serving' && ing.unit !== '';
                          return [
                            hasQty ? Number(ing.quantity) : '',
                            hasUnit ? ing.unit : '',
                            ing.ingredient_name || '',
                          ]
                            .filter(Boolean)
                            .join(' ');
                        })
                        .join('\n');
                      handleSpeak(spoken, 'ingredients');
                    }}
                    title="Listen to Ingredients"
                    aria-label="Listen to Ingredients"
                  >
                    {speechState === 'playing' && activeKey === 'ingredients' ? '⏸️' : '🔊'}
                  </button>
                )}
              </div>
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
              <div className="recipe-section-heading-row">
                <h3 className="recipe-section-title">Instructions</h3>
                {recipe.instructions && recipe.instructions.length > 0 && (
                  <button
                    type="button"
                    className="recipe-section-speak-btn no-print"
                    onClick={() => {
                      const spoken = recipe.instructions
                        .map((step) => `Step ${step.step_number}. ${step.instruction_text}`)
                        .join('\n');
                      handleSpeak(spoken, 'instructions');
                    }}
                    title="Listen to Instructions"
                    aria-label="Listen to Instructions"
                  >
                    {speechState === 'playing' && activeKey === 'instructions' ? '⏸️' : '🔊'}
                  </button>
                )}
              </div>
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
              <NutritionPanel
                macros={mappedMacros}
                micros={mappedMicros}
                canRecalculate={isRecipeOwner}
                isRecalculating={isRecalculatingUsda}
                onRecalculate={handleRecalculateUsda}
                recalculateMessage={usdaFeedback}
              />
            </div>
          </div>
        </div>

        {/* EMMA'S DRESSED-UP DEEP DIVE */}
        {displayNotes && (
            <div className="recipe-deep-dive-container" style={{ margin: '0 1.5rem 2rem 1.5rem', padding: '1.5rem', backgroundColor: '#faf5ff', borderRadius: '12px', borderLeft: '4px solid #805ad5' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #e9d5ff', paddingBottom: '0.5rem', marginBottom: '1rem' }}>
                    <h3 className="recipe-deep-dive-title" style={{ margin: 0, color: '#6b21a8', fontSize: '1.25rem', fontWeight: 'bold' }}>
                        <span className="deep-dive-title-desktop">🔬 Emma&apos;s Deep Dive Analysis</span>
                        <span className="deep-dive-title-mobile">🔬 Emma&apos;s Analysis</span>
                    </h3>
                    <button
                        type="button"
                        onClick={() => handleSpeak(displayNotes, 'deepDive')}
                        style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '1.2rem', opacity: '0.6', padding: '0', transition: 'opacity 0.2s ease' }}
                        aria-label={speechState === 'playing' && activeKey === 'deepDive' ? "Pause Emma's Deep Dive" : (speechState === 'paused' && activeKey === 'deepDive' ? "Resume Emma's Deep Dive" : "Listen to Emma's Deep Dive")}
                        title="Listen to Emma's Deep Dive"
                        onMouseEnter={(e) => e.target.style.opacity = '1'}
                        onMouseLeave={(e) => e.target.style.opacity = '0.6'}
                    >
                        {speechState === 'playing' && activeKey === 'deepDive' ? '⏸️' : (speechState === 'paused' && activeKey === 'deepDive' ? '▶️' : '🔊')}
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
                            publishedRecipesContext={buildPublishedRecipesPromptSection(publishedCatalog, 120, { vocalMode: true, currentUser: user })}
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
                            {chatHistory.map((msg, idx) => {
                                const rawText = msg.parts?.[0]?.text || '';
                                const isModel = msg.role === 'model';
                                const { cleanText, ideas } = isModel
                                    ? extractRecipeIdeas(rawText)
                                    : { cleanText: rawText, ideas: [] };

                                return (
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
                                            borderBottomLeftRadius: isModel ? '2px' : '12px'
                                        }}>
                                            <EmmaMarkdown>{cleanText}</EmmaMarkdown>
                                            {isModel && <RecipeIdeaActions ideas={ideas} compact />}
                                        </div>
                                    </div>
                                );
                            })}
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

        <CommentSection recipeId={recipe.id} recipeOwnerId={authorId} />
      </div>

      <RecipeStoriesSection
        key={recipe.id}
        recipeId={recipe.id}
        recipeTitle={recipe.title}
        refreshTrigger={storyRefreshKey}
        onWriteStory={() => {
          if (!user) {
            navigateToLogin(navigate);
            return;
          }
          setIsStoryModalOpen(true);
        }}
      />

      {communityVariants.length > 0 && (
        <section className="recipe-suggested-section recipe-community-variants-section no-print" aria-label="Community variants of this recipe">
          <div className="recipe-community-variants-header">
            <h2 className="recipe-suggested-heading">
              🔀 Community Variants ({communityVariants.length})
            </h2>
            <p className="recipe-community-variants-sub">
              Creative remixes inspired by <strong>{recipe.title}</strong> — hover or tap any variant badge to see its lineage.
            </p>
          </div>
          <div className="recipe-suggested-grid">
            {communityVariants.map((variantItem) => (
              <RecipeCard
                key={variantItem.id}
                recipe={{
                  ...variantItem,
                  parentRecipeId: variantItem.parentRecipeId || recipe.id,
                  parentRecipeTitle: variantItem.parentRecipeTitle || recipe.title,
                  parentAuthorId: variantItem.parentAuthorId || authorId,
                  parentAuthorName: variantItem.parentAuthorName || recipe.authorName || 'Emma (AI)',
                }}
              />
            ))}
          </div>
        </section>
      )}

      {similarRecipes.length > 0 && (
        <section className="recipe-suggested-section no-print" aria-label="Similar and suggested recipes">
          <h2 className="recipe-suggested-heading">🍽️ Similar &amp; Suggested Recipes</h2>
          <div className="recipe-suggested-grid">
            {similarRecipes.map((item) => (
              <RecipeCard key={item.id} recipe={item} />
            ))}
          </div>
        </section>
      )}

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

      <CreateVariantModal
        isOpen={isVariantModalOpen}
        onClose={() => setIsVariantModalOpen(false)}
        parentRecipe={recipe}
        onVariantCreated={(res) => {
          setIsVariantModalOpen(false);
          if (res?.recipeId) {
            navigate(`/recipe/${res.recipeId}`);
          }
        }}
      />

      <StoryEditorModal
        isOpen={isStoryModalOpen}
        onClose={() => setIsStoryModalOpen(false)}
        recipe={recipe}
        onSaved={(res) => {
          setIsStoryModalOpen(false);
          setStoryRefreshKey((k) => k + 1);
          if (res?.slug && res?.story?.status !== 'draft') {
            navigate(`/stories/${res.slug}`);
          }
        }}
      />
    </div>
  );
};

export default RecipeDetails;