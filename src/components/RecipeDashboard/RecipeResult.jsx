// src/components/RecipeDashboard/RecipeResult.jsx
import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import EmmaMarkdown from '../EmmaMarkdown';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { inferGlutenFreeFromRecipe } from '../../utils/dietaryUtils';
import {
  sendChatMessage,
  generateRecipeImage,
  DEFAULT_IMAGE_STYLE_OPTIONS,
} from '../../services/geminiApi';
import {
  getMicroCalculationInstructions,
  parseMicrosFromDeepDive,
  cleanRecipeTitle,
  stripDuplicateMicroLines,
} from '../../utils/promptBuilder';
import { useEmmaVoice } from '../../hooks/useEmmaVoice';
import LiveChat from '../LiveChat'; // Bringing in Live Mode
import NutritionPanel from '../NutritionPanel';
import { copyRichRecipeToClipboard } from '../../utils/recipeClipboard';
import ImageStyleOptions from './ImageStyleOptions';
import './RecipeResult.css';

const IMAGE_REGEN_REASONS = [
  {
    id: 'wrong_dish',
    label: 'Wrong dish or missing main ingredients',
    detail: 'Does not look like the recipe title or core ingredients.',
    hint: 'Ensure the dish accurately depicts the exact recipe title and primary ingredients.',
  },
  {
    id: 'off_diet',
    label: 'Looks oily, non-vegan, or off-diet',
    detail: 'Shows glossy oil, meat, dairy, cheese, or eggs.',
    hint: 'Ensure it is 100% whole-food plant-based and oil-free with no meat, dairy, cheese, eggs, or glossy oil.',
  },
  {
    id: 'artifacts',
    label: 'Distorted, blurry, or AI artifacts',
    detail: 'Weird utensils, melted textures, or visual glitches.',
    hint: 'Ensure natural food photography with crisp focus, realistic textures, and no distorted utensils or text.',
  },
  {
    id: 'wrong_style',
    label: 'Wrong plating, lighting, or kitchen style',
    detail: 'Does not match the chosen plating or setting.',
    hint: 'Follow the chosen plating, background, and lighting preferences closely.',
  },
  {
    id: 'people_in_image',
    label: 'People or hands shown in image',
    detail: 'Shows a person, chef, grandma, hands, or background figure.',
    hint: 'Food only in the scene. Strictly remove all people, persons, hands, faces, chefs, or background figures.',
  },
  {
    id: 'other',
    label: 'Other visual mismatch',
    detail: 'Something else looks noticeably off from the recipe.',
    hint: 'Make the plated dish closely match the recipe description and natural whole-food appearance.',
  },
];

const normalizeMicrosForPanel = (list = []) =>
  (Array.isArray(list) ? list : []).map((m, idx) => ({
    ...m,
    id: m.id ?? `${m.nutrient_name || m.name || 'micro'}-${idx}`,
    name: m.name || m.nutrient_name || 'Nutrient',
    nutrient_name: m.nutrient_name || m.name || 'Nutrient',
    amount: m.amount ?? 0,
    unit: m.unit || '',
    dv: m.dv ?? m.daily_value_percentage ?? 0,
    daily_value_percentage: m.daily_value_percentage ?? m.dv ?? 0,
    math_calculations: m.math_calculations || m.math || '',
  }));

const extractMarkdownMacros = (markdown = '') => {
  const nutritionSectionMatch = markdown.match(/##\s*Nutrition Information[^\n]*\n([\s\S]*?)(?=\n##|$)/i);
  const macroSearchScope = nutritionSectionMatch ? nutritionSectionMatch[1] : markdown;

  let calories = 0;
  let protein_g = 0;
  let carbs_g = 0;
  let fat_g = 0;
  let fiber_g = 0;

  const calMatch = macroSearchScope.match(/^[-*\s]*(?:\*\*|__)?Calories(?:\*\*|__)?\s*:?(?:\*\*|__)?\s*(\d+(?:\.\d+)?)/im);
  if (calMatch) calories = Math.round(parseFloat(calMatch[1]));

  const proMatch = macroSearchScope.match(/^[-*\s]*(?:\*\*|__)?Protein(?:\*\*|__)?\s*:?(?:\*\*|__)?\s*(\d+(?:\.\d+)?)/im);
  if (proMatch) protein_g = Math.round(parseFloat(proMatch[1]) * 10) / 10;

  const carbMatch = macroSearchScope.match(/^[-*\s]*(?:\*\*|__)?(?:Total\s+)?Carb(?:ohydrate)?s?(?:\*\*|__)?\s*:?(?:\*\*|__)?\s*(\d+(?:\.\d+)?)/im);
  if (carbMatch) carbs_g = Math.round(parseFloat(carbMatch[1]) * 10) / 10;

  const fatMatch = macroSearchScope.match(/^[-*\s]*(?:\*\*|__)?(?:Total\s+)?Fat(?:\*\*|__)?\s*:?(?:\*\*|__)?\s*(\d+(?:\.\d+)?)/im);
  if (fatMatch) fat_g = Math.round(parseFloat(fatMatch[1]) * 10) / 10;

  const fiberMatch = macroSearchScope.match(/^[-*\s]*(?:\*\*|__)?(?:Dietary\s+)?Fiber(?:\*\*|__)?\s*:?(?:\*\*|__)?\s*(\d+(?:\.\d+)?)/im);
  if (fiberMatch) fiber_g = Math.round(parseFloat(fiberMatch[1]) * 10) / 10;

  return { calories, protein_g, carbs_g, fat_g, fiber_g };
};

const extractMarkdownNutritionInputs = (markdown = '') => {
  const titleMatch = markdown.match(/^#\s+(.+)$/m);
  const title = titleMatch && titleMatch[1]
    ? cleanRecipeTitle(titleMatch[1]) || 'Untitled Emma Masterpiece'
    : 'Untitled Emma Masterpiece';
  const yieldMatch = markdown.match(/yields?:?\s*(.+?)(?:\n|$)/i);
  const yields = yieldMatch ? yieldMatch[1].trim() : '';
  const ingredientsMatch = markdown.match(
    /##\s*Ingredients([\s\S]*?)(?=\n##\s*(?:Instructions|Directions|Method|Nutrition Information|Chef's?\s*Notes)|$)/i
  );
  const ingredients = ingredientsMatch
    ? ingredientsMatch[1]
        .split('\n')
        .filter((line) => line.trim().match(/^[-*•]/))
        .map((line) => line.replace(/^[-*•]\s*/, '').trim())
        .filter(Boolean)
    : [];

  return { title, yields, ingredients };
};

const fetchDeepDiveUsdaFirst = async (markdown) => {
  const { title, yields, ingredients } = extractMarkdownNutritionInputs(markdown);
  if (ingredients.length > 0) {
    try {
      const usdaRes = await api.calculateNutritionFromIngredients(
        ingredients,
        yields || '4 servings',
        title
      );
      if (usdaRes?.success && (usdaRes?.deep_dive || Array.isArray(usdaRes?.micros))) {
        return {
          deepDive: usdaRes.deep_dive || '',
          macros: usdaRes.macros || null,
          micros: normalizeMicrosForPanel(usdaRes.micros),
        };
      }
    } catch (usdaErr) {
      console.warn('USDA nutrition calculation unavailable, falling back to Emma Deep Dive:', usdaErr);
    }
  }

  const instructions = getMicroCalculationInstructions();
  const chatPayload = [
    {
      role: 'user',
      parts: [{ text: `Here is the recipe I need you to deeply analyze:\n\n${markdown}` }],
    },
  ];
  const fallbackText = await sendChatMessage(chatPayload, instructions);
  return {
    deepDive: fallbackText,
    macros: null,
    micros: normalizeMicrosForPanel(parseMicrosFromDeepDive(fallbackText)),
  };
};

const RecipeResult = ({
  recipeMarkdown,
  imageUrl,
  isDraft,
  isChat,
  dietaryPrefs = { oilFree: true, glutenFree: false, sugarFree: true },
  isGeneratingImage = false,
  imageGenFailed = false,
  onRetryImage = null,
  imageStyleOptions = DEFAULT_IMAGE_STYLE_OPTIONS,
  onUpdateImageStyleOptions = null,
  onToggleLiveChat = null,
  externalShowLiveChat = false,
  onEditRecipe = null,
}) => {
  const navigate = useNavigate();
  const { user, spendToken, confirmTokenUsage, promptPurchaseTokens } = useAuth(); 

  const [isSaving, setIsSaving] = useState(false);
  const [savedRecipeId, setSavedRecipeId] = useState(null);
  const [localImageUrl, setLocalImageUrl] = useState(null);
  const [imageSource, setImageSource] = useState(null);
  const [isGeneratingAiImage, setIsGeneratingAiImage] = useState(false);
  const [draftAiImagePaid, setDraftAiImagePaid] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isPublishingDraft, setIsPublishingDraft] = useState(false);
  const [isPublishedMasterpiece, setIsPublishedMasterpiece] = useState(false);
  const [isUpgradedToMasterpiece, setIsUpgradedToMasterpiece] = useState(false);
  const [isUpgradingToMasterpiece, setIsUpgradingToMasterpiece] = useState(false);
  const [upgradeImageFailed, setUpgradeImageFailed] = useState(false);
  const [upgradeStatusMsg, setUpgradeStatusMsg] = useState(null);
  const [showRegenReasonModal, setShowRegenReasonModal] = useState(false);
  const [regenReasonId, setRegenReasonId] = useState('');
  const [regenExtraNote, setRegenExtraNote] = useState('');
  const [freeMismatchRegenUsed, setFreeMismatchRegenUsed] = useState(false);
  const [workshopImageOptions, setWorkshopImageOptions] = useState({
    ...DEFAULT_IMAGE_STYLE_OPTIONS,
    ...(imageStyleOptions || {}),
  });

  const [advancedMicros, setAdvancedMicros] = useState(null);
  const [usdaMacros, setUsdaMacros] = useState(null);
  const [usdaMicros, setUsdaMicros] = useState([]);
  const [isCalculatingMicros, setIsCalculatingMicros] = useState(false);
  
  const [showDeepDive, setShowDeepDive] = useState(false);
  const [showLiveChat, setShowLiveChat] = useState(false); // Live chat state

  const { speechState, activeKey, handleSpeak } = useEmmaVoice();

  const displayImageUrl = localImageUrl || imageUrl;
  const effectiveIsDraft = isDraft && !isUpgradedToMasterpiece;
  const effectiveGeneratingImage = isGeneratingImage || isGeneratingAiImage;
  const effectiveImageGenFailed = imageGenFailed || upgradeImageFailed;
  const isNaturallyGf = useMemo(() => {
    if (!recipeMarkdown) return false;
    const { title: rTitle, ingredients: rIngredients } = extractMarkdownNutritionInputs(recipeMarkdown);
    return inferGlutenFreeFromRecipe({
      title: rTitle,
      ingredients: rIngredients,
      recipeMarkdown,
    });
  }, [recipeMarkdown]);
  const isOilFree = Boolean(dietaryPrefs?.oilFree ?? true);
  const isGlutenFree = Boolean(dietaryPrefs?.glutenFree || isNaturallyGf || /gluten[-\s]?free/i.test(recipeMarkdown || ''));
  const isSugarFree = Boolean(dietaryPrefs?.sugarFree ?? true);

  useEffect(() => {
    if (recipeMarkdown && !isChat && !isDraft && !advancedMicros && !isCalculatingMicros) {
        const fetchBackgroundMicros = async () => {
            setIsCalculatingMicros(true);
            try {
                const { deepDive, macros, micros } = await fetchDeepDiveUsdaFirst(recipeMarkdown);
                setAdvancedMicros(deepDive);
                setUsdaMacros(macros || null);
                setUsdaMicros(Array.isArray(micros) ? micros : []);
            } catch (err) {
                console.error("Stealth Math API threw a pear:", err);
                setAdvancedMicros("Nutrition data temporarily unavailable.");
            } finally {
                setIsCalculatingMicros(false);
            }
        };
        
        fetchBackgroundMicros();
    }
  }, [recipeMarkdown, isChat, isDraft, advancedMicros, isCalculatingMicros]);

  const handleRecalculateResultUsda = async () => {
    if (!recipeMarkdown || isCalculatingMicros) return;
    setIsCalculatingMicros(true);
    try {
      const { deepDive, macros, micros } = await fetchDeepDiveUsdaFirst(recipeMarkdown);
      setAdvancedMicros(deepDive);
      setUsdaMacros(macros || null);
      setUsdaMicros(Array.isArray(micros) ? micros : []);
    } catch (err) {
      console.error('Failed to recalculate USDA nutrition:', err);
    } finally {
      setIsCalculatingMicros(false);
    }
  };

  const [copiedRecipe, setCopiedRecipe] = useState(false);

  const handleCopyRecipe = async () => {
    if (!recipeMarkdown) return;
    const cleanDeepDive = stripDuplicateMicroLines(advancedMicros || '');
    const finalOutput = cleanDeepDive
      ? `${recipeMarkdown}\n\n## Advanced Analysis\n${cleanDeepDive}`
      : recipeMarkdown;
    const html = `<div style="font-family: system-ui, -apple-system, sans-serif; color: #1f2937; white-space: pre-wrap; line-height: 1.55;">${finalOutput
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')}</div>`;
    try {
      await copyRichRecipeToClipboard({ plainText: finalOutput, html });
      setCopiedRecipe(true);
      setTimeout(() => setCopiedRecipe(false), 2500);
    } catch (err) {
      console.error('Copy failed:', err);
    }
  };

  const handleSaveToVault = async () => {
      if (!recipeMarkdown) return;
      setIsSaving(true);
      
      const { title: recipeTitle, yields, ingredients } = extractMarkdownNutritionInputs(recipeMarkdown);

      const descMatch = recipeMarkdown.match(/^#\s+[^\n]+\n+([\s\S]*?)(?=\n\*\*|\n##)/);
      const description = descMatch ? descMatch[1].trim() : 'A glorious AI-generated WFPB meal.';

      let prepTime = 0; let cookTime = 0;
      const prepMatch = recipeMarkdown.match(/prep(?:aration)?\s*time.*?(?:(\d+)\s*min)/i);
      if (prepMatch) prepTime = parseInt(prepMatch[1], 10);
      const cookMatch = recipeMarkdown.match(/cook\s*time.*?(?:(\d+)\s*min)/i);
      if (cookMatch) cookTime = parseInt(cookMatch[1], 10);

      const instructionsMatch = recipeMarkdown.match(/##\s*Instructions([\s\S]*?)(?=\n##\s*(?:Nutrition Information|Chef's Notes)|$)/i);
      const instructions = instructionsMatch ? instructionsMatch[1].split('\n').filter(line => line.trim().match(/^\d+\./)).map(line => line.replace(/^\d+\.\s*/, '').trim()) : [];

      const notesMatch = recipeMarkdown.match(/##\s*Chef's?\s*Notes([\s\S]*?)(?=##|$)/i);
      let notes = notesMatch ? notesMatch[1].trim() : '';

      const cleanDeepDive = stripDuplicateMicroLines(advancedMicros || '');
      if (cleanDeepDive) {
          notes = notes ? `${notes}\n\n### Advanced Nutritional Analysis\n${cleanDeepDive}` : `### Advanced Nutritional Analysis\n${cleanDeepDive}`;
      }

      const fallbackMacros = extractMarkdownMacros(recipeMarkdown);
      const activeMacros = usdaMacros || fallbackMacros;
      const calories = Math.round(Number(activeMacros.calories ?? fallbackMacros.calories ?? 0));
      const protein_g = Math.round(Number(activeMacros.protein_g ?? fallbackMacros.protein_g ?? 0) * 10) / 10;
      const carbs_g = Math.round(Number(activeMacros.carbs_g ?? fallbackMacros.carbs_g ?? 0) * 10) / 10;
      const fat_g = Math.round(Number(activeMacros.fat_g ?? fallbackMacros.fat_g ?? 0) * 10) / 10;
      const fiber_g = Math.round(Number(activeMacros.fiber_g ?? fallbackMacros.fiber_g ?? 0) * 10) / 10;

      const parsedMicros = normalizeMicrosForPanel(
        usdaMicros.length > 0 ? usdaMicros : parseMicrosFromDeepDive(advancedMicros || '')
      );

      try {
          let resolvedImageUrl = displayImageUrl || '';
          if (!effectiveIsDraft && !resolvedImageUrl && (onRetryImage || isUpgradedToMasterpiece)) {
            const generatedFallbackUrl = await handleMasterpieceImageRetry('');
            if (generatedFallbackUrl) {
              resolvedImageUrl = generatedFallbackUrl;
              setLocalImageUrl(generatedFallbackUrl);
              setImageSource('ai');
            }
          }

          const res = await api.saveGeneratedRecipe({
          title: recipeTitle, 
          description, 
          imageUrl: resolvedImageUrl, 
          prepTime, 
          cookTime, 
          yields, 
          ingredients, 
          instructions, 
          notes,
          calories,
          protein_g,
          carbs_g,
          fat_g,
          fiber_g,
          micros: parsedMicros,
          isOilFree,
          isGlutenFree,
          isSugarFree,
          isMasterpiece: !effectiveIsDraft
        });
        if (res?.recipeId) {
          setSavedRecipeId(res.recipeId);
        }
        const wasPublished = res?.isPublic !== undefined
          ? Boolean(res.isPublic)
          : (!effectiveIsDraft && Boolean(resolvedImageUrl));
        if (wasPublished) {
          setIsPublishedMasterpiece(true);
        }
        const successMsg = effectiveIsDraft
          ? 'Smashing! Your recipe draft has been locked in the Veggie Vault.'
          : (wasPublished
              ? 'Brilliant! The full recipe and image have been safely vaulted and published!'
              : (res?.message || 'Your Masterpiece text has been saved to drafts while the image is pending—retry generating the photo below at no cost to publish!'));
        alert(successMsg);
      } catch (error) {
        console.error('Failed to save to the vault:', error);
        alert('Oh dear. Something went pear-shaped while saving to the database.');
      } finally {
        setIsSaving(false);
      }
  };

  const extractRecipeTitle = () => {
    const titleMatch = recipeMarkdown?.match(/^#\s+(.+)$/m);
    return titleMatch && titleMatch[1] ? titleMatch[1].trim() : 'Whole Food Plant-Based Dish';
  };

  const handleGenerateDraftAiImage = async () => {
    if (!savedRecipeId) return;
    if (!draftAiImagePaid && Number(user?.generation_tokens ?? 0) < 0.5) {
      await promptPurchaseTokens(0.5, 'Generating an AI Dish Photo');
      return;
    }

    setIsGeneratingAiImage(true);
    setUpgradeStatusMsg(null);
    try {
      if (!draftAiImagePaid) {
        const tokenRes = await spendToken(0.5, 'Generating an AI Dish Photo');
        if (tokenRes?.cancelled) return;
        if (!tokenRes?.success) {
          alert(tokenRes?.message || 'Unable to deduct 0.5 tokens.');
          return;
        }
        setDraftAiImagePaid(true);
      }

      const dishTitle = extractRecipeTitle();
      const base64Data = await generateRecipeImage(dishTitle, workshopImageOptions);
      if (!base64Data) {
        const retryMsg = "Emma's camera jammed while painting your dish! You can retry generating the AI image for free (0 tokens).";
        setUpgradeStatusMsg(retryMsg);
        alert(retryMsg);
        return;
      }

      const dataUrl = `data:image/jpeg;base64,${base64Data}`;
      const res = await api.publishWithPhoto(savedRecipeId, dataUrl, 'ai');
      setLocalImageUrl(dataUrl);
      setImageSource('ai');
      setDraftAiImagePaid(false);
      if (res?.isPublic) {
        setIsPublishedMasterpiece(true);
      }
      setUpgradeStatusMsg(res?.message || 'AI image saved to your recipe!');
    } catch (err) {
      console.error('Failed to generate draft AI image:', err);
      alert(err.message || 'Could not generate AI image.');
    } finally {
      setIsGeneratingAiImage(false);
    }
  };

  const activeRetryStyleOptions = onUpdateImageStyleOptions ? imageStyleOptions : workshopImageOptions;
  const handleRetryStyleChange = (nextOpts) => {
    if (onUpdateImageStyleOptions) {
      onUpdateImageStyleOptions(nextOpts);
    }
    setWorkshopImageOptions(nextOpts);
  };

  const handleMasterpieceImageRetry = async (correctiveNote = '') => {
    if (isGeneratingImage || isGeneratingAiImage) return;
    const safeCorrection = typeof correctiveNote === 'string' ? correctiveNote.trim() : '';
    setUpgradeStatusMsg(null);
    let generatedDataUrl = null;
    if (isUpgradedToMasterpiece) {
      setIsGeneratingAiImage(true);
      setUpgradeImageFailed(false);
      try {
        const promptTitle = safeCorrection
          ? `${extractRecipeTitle()}. Important visual correction: ${safeCorrection}`
          : extractRecipeTitle();
        const base64Data = await generateRecipeImage(promptTitle, activeRetryStyleOptions);
        if (base64Data) {
          generatedDataUrl = `data:image/jpeg;base64,${base64Data}`;
          setLocalImageUrl(generatedDataUrl);
          setImageSource('ai');
          setUpgradeImageFailed(false);
        } else {
          setUpgradeImageFailed(true);
        }
      } catch (err) {
        console.error('Failed to retry upgraded Masterpiece image:', err);
        setUpgradeImageFailed(true);
      } finally {
        setIsGeneratingAiImage(false);
      }
    } else {
      if (!onRetryImage) return null;
      generatedDataUrl = await onRetryImage(extractRecipeTitle(), activeRetryStyleOptions, safeCorrection);
    }

    if (generatedDataUrl && savedRecipeId) {
      try {
        const res = await api.publishWithPhoto(savedRecipeId, generatedDataUrl, 'ai');
        setLocalImageUrl(generatedDataUrl);
        setImageSource('ai');
        if (res?.isPublic) {
          setIsPublishedMasterpiece(true);
        }
        setUpgradeStatusMsg(res?.message || 'Masterpiece photo attached!');
      } catch (err) {
        console.error('Failed to attach retried image to saved recipe:', err);
      }
    }

    return generatedDataUrl;
  };

  const handleConfirmMismatchRegenerate = async (e) => {
    e.preventDefault();
    if (!regenReasonId || isGeneratingImage || isGeneratingAiImage) return;
    const selected = IMAGE_REGEN_REASONS.find((item) => item.id === regenReasonId);
    if (!selected) return;

    const extra = regenExtraNote.trim();
    const correctiveNote = extra ? `${selected.hint} User note: ${extra}` : selected.hint;

    setShowRegenReasonModal(false);
    setFreeMismatchRegenUsed(true);
    await handleMasterpieceImageRetry(correctiveNote);
  };

  const handleUploadDraftPhoto = (e) => {
    const file = e.target.files?.[0];
    if (!file || !savedRecipeId) return;

    const reader = new FileReader();
    reader.onloadend = async () => {
      setIsUploadingImage(true);
      setUpgradeStatusMsg(null);
      try {
        const res = await api.publishWithPhoto(savedRecipeId, reader.result, 'user');
        setLocalImageUrl(reader.result);
        setImageSource('user');
        if (res?.isPublic) {
          setIsPublishedMasterpiece(true);
        }
        setUpgradeStatusMsg(res?.message || 'Dish photo uploaded!');
      } catch (err) {
        console.error('Failed to upload draft photo:', err);
        alert(err.message || 'Could not upload dish photo.');
      } finally {
        setIsUploadingImage(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleUpgradeDraftNutrition = async () => {
    if (!savedRecipeId) return;
    if (Number(user?.generation_tokens ?? 0) < 0.5) {
      await promptPurchaseTokens(0.5, 'Generating Masterpiece Nutritional Analysis');
      return;
    }

    setIsCalculatingMicros(true);
    setUpgradeStatusMsg(null);
    try {
      const tokenRes = await spendToken(0.5, 'Generating Masterpiece Nutritional Analysis');
      if (tokenRes?.cancelled) return;
      if (!tokenRes?.success) {
        alert(tokenRes?.message || 'Unable to deduct 0.5 tokens.');
        return;
      }

      let res = null;
      let fallbackMathResult = '';
      let parsedFallbackMicros = [];
      try {
        res = await api.upgradeRecipeNutrition(savedRecipeId, '', []);
      } catch (usdaErr) {
        console.warn('USDA nutrition unavailable for saved draft upgrade, falling back to Emma Deep Dive:', usdaErr);
        const instructions = getMicroCalculationInstructions();
        const chatPayload = [{ role: 'user', parts: [{ text: `Here is the recipe I need you to deeply analyze:\n\n${recipeMarkdown}` }] }];
        fallbackMathResult = await sendChatMessage(chatPayload, instructions);
        parsedFallbackMicros = parseMicrosFromDeepDive(fallbackMathResult);
        res = await api.upgradeRecipeNutrition(savedRecipeId, fallbackMathResult, parsedFallbackMicros);
      }

      setAdvancedMicros(res?.deep_dive || fallbackMathResult || '');
      if (res?.macros) {
        setUsdaMacros(res.macros);
      }
      setUsdaMicros(
        normalizeMicrosForPanel(Array.isArray(res?.micros) ? res.micros : parsedFallbackMicros)
      );
      setShowDeepDive(true);
      if (res?.isPublic) {
        setIsPublishedMasterpiece(true);
      }
      setUpgradeStatusMsg(res?.message || 'Masterpiece nutritional analysis saved!');
    } catch (err) {
      console.error('Failed to upgrade draft nutrition:', err);
      alert(err.message || 'Could not generate Masterpiece nutrition.');
    } finally {
      setIsCalculatingMicros(false);
    }
  };

  const canPublishMasterpiece = Boolean(localImageUrl) && Boolean(advancedMicros);

  const handlePublishSavedDraft = async () => {
    if (!savedRecipeId || !canPublishMasterpiece) return;
    setIsPublishingDraft(true);
    setUpgradeStatusMsg(null);
    try {
      const res = await api.publishDraft(savedRecipeId);
      if (res?.success) {
        setIsPublishedMasterpiece(true);
        setUpgradeStatusMsg(res.message || 'Your recipe is now a published Masterpiece!');
      }
    } catch (err) {
      console.error('Failed to publish draft:', err);
      alert(err.message || 'Could not publish draft.');
    } finally {
      setIsPublishingDraft(false);
    }
  };

  const handleUpgradeToMasterpiece = async () => {
    if (!recipeMarkdown || isUpgradingToMasterpiece || isUpgradedToMasterpiece || savedRecipeId) return;
    if (Number(user?.generation_tokens ?? 0) < 1) {
      await promptPurchaseTokens(1, 'Upgrading Recipe to a Full Masterpiece');
      return;
    }

    const tokenRes = await spendToken(1, 'Upgrading Recipe to a Full Masterpiece');
    if (tokenRes?.cancelled) return;
    if (!tokenRes?.success) {
      alert(tokenRes?.message || 'Unable to deduct 1 token.');
      return;
    }

    setIsUpgradingToMasterpiece(true);
    setIsUpgradedToMasterpiece(true);
    setIsGeneratingAiImage(true);
    setUpgradeImageFailed(false);
    setIsCalculatingMicros(true);
    setUpgradeStatusMsg(null);

    const imagePromise = (async () => {
      try {
        const base64Data = await generateRecipeImage(extractRecipeTitle(), activeRetryStyleOptions);
        if (base64Data) {
          setLocalImageUrl(`data:image/jpeg;base64,${base64Data}`);
          setImageSource('ai');
          setUpgradeImageFailed(false);
        } else {
          setUpgradeImageFailed(true);
        }
      } catch (err) {
        console.error('Failed to generate upgraded Masterpiece image:', err);
        setUpgradeImageFailed(true);
      } finally {
        setIsGeneratingAiImage(false);
      }
    })();

    const nutritionPromise = (async () => {
      try {
        const { deepDive, macros, micros } = await fetchDeepDiveUsdaFirst(recipeMarkdown);
        setAdvancedMicros(deepDive);
        setUsdaMacros(macros || null);
        setUsdaMicros(Array.isArray(micros) ? micros : []);
      } catch (err) {
        console.error('Failed to calculate upgraded Masterpiece nutrition:', err);
        setAdvancedMicros('Nutrition data temporarily unavailable.');
      } finally {
        setIsCalculatingMicros(false);
      }
    })();

    await Promise.all([imagePromise, nutritionPromise]);
    setIsUpgradingToMasterpiece(false);
  };

  let speakBtnClass = "speak-btn-idle"; 
  let speakIcon = "🔊";
  let speakAriaLabel = "Read Aloud";
  if (speechState === 'playing') {
    speakBtnClass = "speak-btn-playing"; 
    speakIcon = "⏸️";
    speakAriaLabel = "Pause Emma";
  } else if (speechState === 'paused') {
    speakBtnClass = "speak-btn-paused"; 
    speakIcon = "▶️";
    speakAriaLabel = "Resume Emma";
  }

  const handleToggleRecipeLiveChat = async () => {
    if (showLiveChat) {
      setShowLiveChat(false);
      return;
    }

    const confirmed = await confirmTokenUsage(0.1, 'Live Audio with Emma (0.10 Tokens/min)');
    if (!confirmed) return;

    setShowLiveChat(true);
  };

  if (!recipeMarkdown) return null;

  if (isChat) {
    return (
      <div className="emma-chat-card">
        <div className="emma-chat-header">
          <div className="emma-chat-persona">
            <span className="emma-avatar" aria-hidden="true">👩‍🍳</span>
            <div>
              <strong className="emma-name">Emma Advanced</strong>
              <span className="emma-subtitle">Culinary Confidante</span>
            </div>
          </div>
          <div className="emma-chat-header-actions">
            {onToggleLiveChat && (
              <button
                type="button"
                onClick={onToggleLiveChat}
                className={`emma-chat-live-btn ${externalShowLiveChat ? 'active' : ''}`}
                title="Switch into Live Audio Mode with full chat context (0.10 Tokens/min)"
              >
                {externalShowLiveChat ? '🛑 Close Live' : '🎙️ Live Mode (0.10/min)'}
              </button>
            )}
            <button
              type="button"
              onClick={() => handleSpeak(recipeMarkdown)}
              className={`recipe-content-speak-icon ${speakBtnClass}`}
              aria-label={speakAriaLabel}
              title={speakAriaLabel}
            >
              {speakIcon}
            </button>
          </div>
        </div>

        <div className="recipe-content chat-markdown">
          <EmmaMarkdown>{recipeMarkdown}</EmmaMarkdown>
        </div>
      </div>
    );
  }

  const panelMacros = usdaMacros || extractMarkdownMacros(recipeMarkdown);
  const panelMicros = normalizeMicrosForPanel(
    usdaMicros.length > 0 ? usdaMicros : parseMicrosFromDeepDive(advancedMicros || '')
  );

  return (
    <div className="recipe-result-card">
      
      {effectiveGeneratingImage && !effectiveIsDraft && !isChat ? (
        <div className="masterpiece-image-status generating">
          <span>Emma is painting your Masterpiece dish photo...</span>
        </div>
      ) : displayImageUrl ? (
        <div className="recipe-image-container">
            <img src={displayImageUrl} alt="A glorious AI-generated WFPB meal" />
            {!effectiveIsDraft && !isChat && (onRetryImage || isUpgradedToMasterpiece) && (
              <div className="regen-mismatch-row">
                {!freeMismatchRegenUsed ? (
                  <button
                    type="button"
                    className="regen-mismatch-btn"
                    onClick={() => {
                      setRegenReasonId('');
                      setRegenExtraNote('');
                      setShowRegenReasonModal(true);
                    }}
                    disabled={effectiveGeneratingImage}
                    title="If the generated photo does not match the dish, choose a reason to regenerate it once at no cost"
                  >
                    🔄 Image Doesn&apos;t Match? Regenerate (Free)
                  </button>
                ) : (
                  <span className="regen-mismatch-used-note">
                    ✓ Free image regeneration applied
                  </span>
                )}
              </div>
            )}
        </div>
      ) : (!effectiveIsDraft && !isChat && (
        <>
          {effectiveImageGenFailed && !effectiveGeneratingImage && (
            <div className="masterpiece-image-status failed">
              <div className="masterpiece-failed-top">
                <div className="status-text">
                  <strong>Image Generation Failed</strong>
                  <p>Your Masterpiece recipe is ready, but the AI camera jammed while creating the photo. You won&apos;t be charged again to retry!</p>
                </div>
                <button
                  type="button"
                  className="retry-image-btn"
                  onClick={() => handleMasterpieceImageRetry('')}
                  disabled={effectiveGeneratingImage}
                >
                  Try Generating Image Again (Free)
                </button>
              </div>
              <div className="masterpiece-failed-style-box">
                <ImageStyleOptions
                  value={activeRetryStyleOptions}
                  onChange={handleRetryStyleChange}
                  disabled={effectiveGeneratingImage}
                  compact
                />
              </div>
            </div>
          )}
        </>
      ))}

      {/* Live Chat Toggle Button */}
      {!isChat && (
          <button 
              type="button"
              onClick={handleToggleRecipeLiveChat}
              style={{ 
                  float: 'right', 
                  background: showLiveChat ? '#fed7d7' : '#e6fffa', 
                  color: showLiveChat ? '#c53030' : '#319795', 
                  border: `2px solid ${showLiveChat ? '#feb2b2' : '#81e6d9'}`, 
                  padding: '8px 16px', 
                  borderRadius: '8px', 
                  cursor: 'pointer', 
                  fontWeight: 'bold',
                  marginBottom: '1rem',
                  transition: 'all 0.2s'
              }}
          >
              {showLiveChat ? '🛑 Close Live Chat' : '🎙️ Ask Emma Live'}
          </button>
      )}

      {(isOilFree || isGlutenFree || isSugarFree) && (
        <div className="result-dietary-badges">
          {isOilFree && <span className="result-dietary-pill oil-free">Oil-Free</span>}
          {isGlutenFree && <span className="result-dietary-pill gluten-free">Gluten-Free</span>}
          {isSugarFree && <span className="result-dietary-pill sugar-free">Refined Sugar-Free</span>}
        </div>
      )}

      {/* The Inline Live Chat Box */}
      {showLiveChat && !isChat && (
          <div style={{ marginBottom: '2rem', clear: 'both', width: '100%' }}>
              <LiveChat
                  recipeContext={`The user is currently cooking or reviewing this recipe: \n\n${recipeMarkdown.substring(0, 1000)}`}
                  preConfirmed={true}
                  autoStart={true}
              />
          </div>
      )}

      {/* YOUR ORIGINAL ACTION ROW RESTORED */}
      <div className="action-row result-actions" style={{ clear: 'both' }}>
        {!isChat && (
            <>
                <button 
                onClick={handleSaveToVault}
                disabled={isSaving || isCalculatingMicros || isUpgradingToMasterpiece || isGeneratingAiImage || Boolean(savedRecipeId)}
                className={`action-btn vault-btn ${(isSaving || isCalculatingMicros || isUpgradingToMasterpiece || isGeneratingAiImage || savedRecipeId) ? 'saving' : ''}`}
                >
                {(isUpgradingToMasterpiece || isGeneratingAiImage || isCalculatingMicros)
                  ? (!effectiveIsDraft ? 'Finalizing Masterpiece...' : 'Finalizing Nutrition...')
                  : (isSaving
                      ? 'Vaulting...'
                      : (savedRecipeId
                          ? (isPublishedMasterpiece ? 'Published Masterpiece' : 'Saved to Private Drafts')
                          : (effectiveIsDraft ? 'Save Draft' : 'Save Full Recipe')))}
                </button>

                <button type="button" onClick={handleCopyRecipe} className="action-btn download-btn">
                {copiedRecipe ? '✓ Copied!' : '📋 Copy'}
                </button>

                {isDraft && !savedRecipeId && (!isUpgradedToMasterpiece || isUpgradingToMasterpiece) && (
                  <button
                    type="button"
                    onClick={handleUpgradeToMasterpiece}
                    disabled={isUpgradingToMasterpiece || isSaving}
                    className={`action-btn masterpiece-upgrade-btn ${isUpgradingToMasterpiece ? 'upgrading' : ''}`}
                    title="Auto-generate both an AI Dish Photo and full Masterpiece Nutritional Deep Dive (1 Token)"
                  >
                    {isUpgradingToMasterpiece ? 'Upgrading...' : 'Upgrade to Masterpiece'}
                  </button>
                )}

                {!effectiveIsDraft ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (isPublishedMasterpiece && savedRecipeId) {
                        navigate(`/recipe/${savedRecipeId}`);
                      }
                    }}
                    disabled={!isPublishedMasterpiece || !savedRecipeId}
                    className={`action-btn view-live-btn ${(!isPublishedMasterpiece || !savedRecipeId) ? 'unpublished' : ''}`}
                    title={isPublishedMasterpiece && savedRecipeId ? 'View your published Masterpiece live in the Vault' : 'Save your Masterpiece first to view it live'}
                  >
                    View Live
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => onEditRecipe && onEditRecipe()}
                    disabled={!onEditRecipe}
                    className="action-btn edit-recipe-btn"
                    title="Jump down to ask Emma to tweak or iterate on this recipe"
                  >
                    Edit
                  </button>
                )}
            </>
        )}
      </div>

      {effectiveIsDraft && savedRecipeId && (
        <section className="draft-workshop-card" aria-label="Draft to Masterpiece Workshop">
          <div className="draft-workshop-header">
            <div>
              <h3>✨ Draft-to-Masterpiece Workshop</h3>
              <p>
                To publish your private draft as a Masterpiece, include both a dish photo (AI-generated or uploaded) and full Masterpiece nutritional details.
              </p>
            </div>
            <span className={`workshop-status-pill ${isPublishedMasterpiece ? 'published' : 'draft'}`}>
              {isPublishedMasterpiece ? '🌟 Published Masterpiece' : '🔒 Private Draft'}
            </span>
          </div>

          <div className="workshop-checklist">
            <span className={`workshop-check ${localImageUrl ? 'done' : 'pending'}`}>
              <strong>Step 1: Dish Image</strong> — {localImageUrl ? `✅ Added (${imageSource === 'ai' ? 'AI Generated' : 'Uploaded'})` : 'Pending'}
            </span>
            <span className={`workshop-check ${advancedMicros ? 'done' : 'pending'}`}>
              <strong>Step 2: Masterpiece Nutrition</strong> — {advancedMicros ? '✅ Unlocked' : 'Pending'}
            </span>
          </div>

          {upgradeStatusMsg && (
            <div className="workshop-feedback">
              {upgradeStatusMsg}
            </div>
          )}

          <div className="workshop-style-section">
            <ImageStyleOptions
              value={workshopImageOptions}
              onChange={setWorkshopImageOptions}
              disabled={isGeneratingAiImage || isUploadingImage || isCalculatingMicros}
              compact
            />
          </div>

          <div className="workshop-actions">
            <button
              type="button"
              onClick={handleGenerateDraftAiImage}
              disabled={isGeneratingAiImage || isUploadingImage || isCalculatingMicros}
              className="workshop-btn ai-image-btn"
            >
              {isGeneratingAiImage
                ? '🎨 Painting AI Dish...'
                : (draftAiImagePaid ? '🔄 Retry AI Image (Free — 0 Tokens)' : '🎨 Generate AI Image (0.5 Tokens)')}
            </button>

            <label className={`workshop-btn upload-photo-btn ${isUploadingImage ? 'disabled' : ''}`}>
              {isUploadingImage ? '📤 Uploading Photo...' : '📸 Upload Own Photo (Free)'}
              <input
                type="file"
                accept="image/*"
                onChange={handleUploadDraftPhoto}
                disabled={isUploadingImage || isGeneratingAiImage}
                hidden
              />
            </label>

            <button
              type="button"
              onClick={handleUpgradeDraftNutrition}
              disabled={Boolean(advancedMicros) || isCalculatingMicros || isGeneratingAiImage || isUploadingImage}
              className="workshop-btn nutrition-btn"
            >
              {isCalculatingMicros
                ? '🧮 Crunching Micros...'
                : (advancedMicros ? '✅ Nutrition Unlocked' : '🔬 Generate Masterpiece Nutrition (0.5 Tokens)')}
            </button>

            {!isPublishedMasterpiece && (
              <button
                type="button"
                onClick={handlePublishSavedDraft}
                disabled={!canPublishMasterpiece || isPublishingDraft || isGeneratingAiImage || isUploadingImage || isCalculatingMicros}
                className="workshop-btn publish-btn"
                title={!canPublishMasterpiece ? 'Add a photo and generate Masterpiece nutrition first' : 'Publish to the public Masterpiece feed'}
              >
                {isPublishingDraft ? '🚀 Publishing...' : '🚀 Publish as Masterpiece'}
              </button>
            )}

            <button
              type="button"
              onClick={() => navigate(`/recipe/${savedRecipeId}`)}
              className="workshop-btn vault-link-btn"
            >
              View in My Vault &rarr;
            </button>
          </div>
        </section>
      )}

      <div className="recipe-content">
        {!isChat && (
          <div className="recipe-content-speak-row">
            <button
              type="button"
              onClick={() => {
                const cleanDeepDive = stripDuplicateMicroLines(advancedMicros || '');
                handleSpeak(cleanDeepDive ? `${recipeMarkdown}\n\n${cleanDeepDive}` : recipeMarkdown, 'recipe');
              }}
              className={`recipe-content-speak-icon ${(activeKey === 'recipe' || !activeKey) ? speakBtnClass : 'speak-btn-idle'}`}
              aria-label={(activeKey === 'recipe' || !activeKey) ? speakAriaLabel : 'Read Aloud'}
              title={(activeKey === 'recipe' || !activeKey) ? speakAriaLabel : 'Read Aloud'}
            >
              {(activeKey === 'recipe' || !activeKey) ? speakIcon : '🔊'}
            </button>
          </div>
        )}
        <EmmaMarkdown>{recipeMarkdown}</EmmaMarkdown>
      </div>

      {!isChat && (!effectiveIsDraft || advancedMicros || usdaMicros.length > 0) && (panelMicros.length > 0 || Boolean(usdaMacros)) && (
        <div className="result-usda-panel-wrap">
          <NutritionPanel
            macros={panelMacros}
            micros={panelMicros}
            canRecalculate={!isCalculatingMicros}
            isRecalculating={isCalculatingMicros}
            onRecalculate={handleRecalculateResultUsda}
          />
        </div>
      )}

      {!isChat && (!effectiveIsDraft || advancedMicros || isCalculatingMicros) && (
          <div className="calc-micros-container">
              <button 
                onClick={() => setShowDeepDive(!showDeepDive)}
                disabled={isCalculatingMicros}
                className={`calc-micros-btn ${isCalculatingMicros ? 'calculating' : ''}`}
              >
                  {isCalculatingMicros ? 'Emma is crunching the micros in the background...' : (showDeepDive ? 'Hide Emma\'s Deep Dive' : 'View Emma\'s Nutritional Deep Dive')}
              </button>
          </div>
      )}

      {showDeepDive && advancedMicros && (
          <div className="advanced-micros-content">
              <div className="advanced-micros-header">
                  <h3>Emma's Deep Dive Analysis</h3>
                  <button
                    type="button"
                    onClick={() => handleSpeak(stripDuplicateMicroLines(advancedMicros), 'deepDive')}
                    className={`recipe-content-speak-icon ${activeKey === 'deepDive' ? speakBtnClass : 'speak-btn-idle'}`}
                    aria-label={activeKey === 'deepDive' && speechState === 'playing' ? "Pause Emma's Deep Dive" : (activeKey === 'deepDive' && speechState === 'paused' ? "Resume Emma's Deep Dive" : "Listen to Emma's Deep Dive")}
                    title="Listen to Emma's Deep Dive"
                  >
                    {activeKey === 'deepDive' && speechState === 'playing' ? '⏸️' : (activeKey === 'deepDive' && speechState === 'paused' ? '▶️' : '🔊')}
                  </button>
              </div>
              <EmmaMarkdown>{stripDuplicateMicroLines(advancedMicros)}</EmmaMarkdown>
          </div>
      )}
      
      <div className="recipe-footer">
        <p><em>Generated by Emma Advanced for The Chris and Emma Show Premium Vault.</em></p>
      </div>

      {showRegenReasonModal && (
        <div
          className="regen-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="regen-reason-modal-title"
          onClick={(e) => {
            if (e.target === e.currentTarget && !effectiveGeneratingImage) {
              setShowRegenReasonModal(false);
            }
          }}
        >
          <div className="regen-modal-card">
            <div className="regen-modal-header">
              <h3 id="regen-reason-modal-title">Regenerate Masterpiece Photo (Free)</h3>
              <button
                type="button"
                className="regen-modal-close"
                onClick={() => setShowRegenReasonModal(false)}
                disabled={effectiveGeneratingImage}
                aria-label="Close regenerate photo modal"
              >
                ✕
              </button>
            </div>
            <p className="regen-modal-subtitle">
              Tell Emma what was off about the generated photo so she can fix it at <strong>0 tokens</strong>. Select a reason to continue:
            </p>

            <form onSubmit={handleConfirmMismatchRegenerate}>
              <div className="regen-reason-list" role="radiogroup" aria-label="Reason for regenerating image">
                {IMAGE_REGEN_REASONS.map((reason) => {
                  const isSelected = regenReasonId === reason.id;
                  return (
                    <label
                      key={reason.id}
                      className={`regen-reason-option ${isSelected ? 'selected' : ''}`}
                    >
                      <input
                        type="radio"
                        name="regen-reason"
                        value={reason.id}
                        checked={isSelected}
                        onChange={() => setRegenReasonId(reason.id)}
                        disabled={effectiveGeneratingImage}
                      />
                      <div>
                        <strong>{reason.label}</strong>
                        <span>{reason.detail}</span>
                      </div>
                    </label>
                  );
                })}
              </div>

              <div className="regen-extra-note-wrap">
                <label htmlFor="regen-extra-note">Optional: What should Emma fix? </label>
                <textarea
                  id="regen-extra-note"
                  rows={2}
                  className="regen-extra-note-input"
                  value={regenExtraNote}
                  onChange={(e) => setRegenExtraNote(e.target.value)}
                  placeholder="E.g., Show whole roasted chickpeas and kale in a bowl instead of pasta..."
                  maxLength={300}
                  disabled={effectiveGeneratingImage}
                />
              </div>

              <div className="regen-modal-actions">
                <button
                  type="button"
                  className="regen-cancel-btn"
                  onClick={() => setShowRegenReasonModal(false)}
                  disabled={effectiveGeneratingImage}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="regen-confirm-btn"
                  disabled={!regenReasonId || effectiveGeneratingImage}
                >
                  Regenerate Image (Free)
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default RecipeResult;