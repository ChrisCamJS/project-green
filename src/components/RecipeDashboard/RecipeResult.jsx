// src/components/RecipeDashboard/RecipeResult.jsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import EmmaMarkdown from '../EmmaMarkdown';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import {
  sendChatMessage,
  generateRecipeImage,
  DEFAULT_IMAGE_STYLE_OPTIONS,
} from '../../services/geminiApi';
import { getMicroCalculationInstructions, parseMicrosFromDeepDive, cleanRecipeTitle } from '../../utils/promptBuilder';
import { useEmmaVoice } from '../../hooks/useEmmaVoice';
import LiveChat from '../LiveChat'; // Bringing in Live Mode
import { copyRichRecipeToClipboard } from '../../utils/recipeClipboard';
import ImageStyleOptions from './ImageStyleOptions';
import './RecipeResult.css';

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
  const [upgradeStatusMsg, setUpgradeStatusMsg] = useState(null);
  const [workshopImageOptions, setWorkshopImageOptions] = useState({
    ...DEFAULT_IMAGE_STYLE_OPTIONS,
    ...(imageStyleOptions || {}),
  });

  const [advancedMicros, setAdvancedMicros] = useState(null);
  const [isCalculatingMicros, setIsCalculatingMicros] = useState(false);
  
  const [showDeepDive, setShowDeepDive] = useState(false);
  const [showLiveChat, setShowLiveChat] = useState(false); // Live chat state

  const { speechState, handleSpeak } = useEmmaVoice();

  const displayImageUrl = localImageUrl || imageUrl;
  const isOilFree = Boolean(dietaryPrefs?.oilFree ?? true);
  const isGlutenFree = Boolean(dietaryPrefs?.glutenFree || /gluten[-\s]?free/i.test(recipeMarkdown || ''));
  const isSugarFree = Boolean(dietaryPrefs?.sugarFree ?? true);

  useEffect(() => {
    if (recipeMarkdown && !isChat && !isDraft && !advancedMicros && !isCalculatingMicros) {
        const fetchBackgroundMicros = async () => {
            setIsCalculatingMicros(true);
            try {
                const instructions = getMicroCalculationInstructions();
                const chatHistory = [{ role: 'user', parts: [{ text: `Here is the recipe I need you to deeply analyze:\n\n${recipeMarkdown}` }] }];
                
                const mathResult = await sendChatMessage(chatHistory, instructions);
                setAdvancedMicros(mathResult);
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

  const [copiedRecipe, setCopiedRecipe] = useState(false);

  const handleCopyRecipe = async () => {
    if (!recipeMarkdown) return;
    const finalOutput = advancedMicros
      ? `${recipeMarkdown}\n\n## Advanced Analysis\n${advancedMicros}`
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
      
      let recipeTitle = 'Untitled Emma Masterpiece';
      const titleMatch = recipeMarkdown.match(/^#\s+(.+)$/m);
      if (titleMatch && titleMatch[1]) {
          recipeTitle = cleanRecipeTitle(titleMatch[1]) || recipeTitle;
      }

      const descMatch = recipeMarkdown.match(/^#\s+[^\n]+\n+([\s\S]*?)(?=\n\*\*|\n##)/);
      const description = descMatch ? descMatch[1].trim() : 'A glorious AI-generated WFPB meal.';

      let prepTime = 0; let cookTime = 0; let yields = '';
      const prepMatch = recipeMarkdown.match(/prep(?:aration)?\s*time.*?(?:(\d+)\s*min)/i);
      if (prepMatch) prepTime = parseInt(prepMatch[1], 10);
      const cookMatch = recipeMarkdown.match(/cook\s*time.*?(?:(\d+)\s*min)/i);
      if (cookMatch) cookTime = parseInt(cookMatch[1], 10);
      const yieldMatch = recipeMarkdown.match(/yields?:?\s*(.+?)(?:\n|$)/i);
      if (yieldMatch) yields = yieldMatch[1].trim();

      const ingredientsMatch = recipeMarkdown.match(/##\s*Ingredients([\s\S]*?)(?=\n##\s*(?:Instructions|Nutrition Information|Chef's Notes)|$)/i);
      const ingredients = ingredientsMatch ? ingredientsMatch[1].split('\n').filter(line => line.trim().match(/^[-*]/)).map(line => line.replace(/^[-*]\s*/, '').trim()) : [];

      const instructionsMatch = recipeMarkdown.match(/##\s*Instructions([\s\S]*?)(?=\n##\s*(?:Nutrition Information|Chef's Notes)|$)/i);
      const instructions = instructionsMatch ? instructionsMatch[1].split('\n').filter(line => line.trim().match(/^\d+\./)).map(line => line.replace(/^\d+\.\s*/, '').trim()) : [];

      const notesMatch = recipeMarkdown.match(/##\s*Chef's?\s*Notes([\s\S]*?)(?=##|$)/i);
      let notes = notesMatch ? notesMatch[1].trim() : '';

      if (advancedMicros) {
          notes = notes ? `${notes}\n\n### Advanced Nutritional Analysis\n${advancedMicros}` : `### Advanced Nutritional Analysis\n${advancedMicros}`;
      }

      let calories = 0, protein_g = 0, carbs_g = 0, fat_g = 0, fiber_g = 0;
      const calMatch = recipeMarkdown.match(/(?:\*\*|__)?Calories(?:\*\*|__)?:\s*(\d+(?:\.\d+)?)/i);
      if (calMatch) calories = Math.round(parseFloat(calMatch[1]));
      
      const proMatch = recipeMarkdown.match(/(?:\*\*|__)?Protein(?:\*\*|__)?:\s*(\d+(?:\.\d+)?)/i);
      if (proMatch) protein_g = Math.round(parseFloat(proMatch[1]));
      
      const carbMatch = recipeMarkdown.match(/(?:\*\*|__)?Carbs?(?:\*\*|__)?:\s*(\d+(?:\.\d+)?)/i);
      if (carbMatch) carbs_g = Math.round(parseFloat(carbMatch[1]));
      
      const fatMatch = recipeMarkdown.match(/(?:\*\*|__)?Fat(?:\*\*|__)?:\s*(\d+(?:\.\d+)?)/i);
      if (fatMatch) fat_g = Math.round(parseFloat(fatMatch[1]));

      const fiberMatch = recipeMarkdown.match(/(?:\*\*|__)?(?:Dietary\s+)?Fiber(?:\*\*|__)?:\s*(\d+(?:\.\d+)?)/i);
      if (fiberMatch) fiber_g = Math.round(parseFloat(fiberMatch[1]) * 10) / 10;

      const parsedMicros = parseMicrosFromDeepDive(advancedMicros || '');

      try {
          const res = await api.saveGeneratedRecipe({
          title: recipeTitle, 
          description, 
          imageUrl: displayImageUrl || '', 
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
          isSugarFree
        });
        if (res?.recipeId) {
          setSavedRecipeId(res.recipeId);
        }
        if (!isDraft && displayImageUrl) {
          setIsPublishedMasterpiece(true);
        }
        const successMsg = isDraft
          ? 'Smashing! Your recipe draft has been locked in the Veggie Vault.'
          : (displayImageUrl
              ? 'Brilliant! The full recipe and image have been safely vaulted.'
              : 'Your Masterpiece text has been saved to drafts while the image is pending—retry generating the photo below at no cost to publish!');
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

  const handleMasterpieceImageRetry = async () => {
    if (!onRetryImage || isGeneratingImage) return;
    setUpgradeStatusMsg(null);
    const generatedDataUrl = await onRetryImage(extractRecipeTitle(), activeRetryStyleOptions);
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

      const instructions = getMicroCalculationInstructions();
      const chatPayload = [{ role: 'user', parts: [{ text: `Here is the recipe I need you to deeply analyze:\n\n${recipeMarkdown}` }] }];
      const mathResult = await sendChatMessage(chatPayload, instructions);
      const parsedMicros = parseMicrosFromDeepDive(mathResult);

      const res = await api.upgradeRecipeNutrition(savedRecipeId, mathResult, parsedMicros);
      setAdvancedMicros(mathResult);
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

  let speakBtnText = "🗣️ Read Aloud";
  let speakBtnClass = "speak-btn-idle"; 
  if (speechState === 'playing') {
    speakBtnText = "⏸️ Pause Emma";
    speakBtnClass = "speak-btn-playing"; 
  } else if (speechState === 'paused') {
    speakBtnText = "▶️ Resume";
    speakBtnClass = "speak-btn-paused"; 
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
              className={`emma-chat-speak-btn ${speakBtnClass}`}
              title="Listen to Emma's reply"
            >
              {speakBtnText}
            </button>
          </div>
        </div>

        <div className="recipe-content chat-markdown">
          <EmmaMarkdown>{recipeMarkdown}</EmmaMarkdown>
        </div>
      </div>
    );
  }

  return (
    <div className="recipe-result-card">
      
      {displayImageUrl ? (
        <div className="recipe-image-container">
            <img src={displayImageUrl} alt="A glorious AI-generated WFPB meal" />
        </div>
      ) : (!isDraft && !isChat && (
        <>
          {isGeneratingImage && (
            <div className="masterpiece-image-status generating">
              <span className="status-icon">🎨</span>
              <span>Emma is painting your Masterpiece dish photo...</span>
            </div>
          )}
          {imageGenFailed && !isGeneratingImage && (
            <div className="masterpiece-image-status failed">
              <div className="masterpiece-failed-top">
                <div className="status-text">
                  <strong>⚠️ Image Generation Failed</strong>
                  <p>Your Masterpiece recipe is ready, but the AI camera jammed while creating the photo. You won&apos;t be charged again to retry!</p>
                </div>
                <button
                  type="button"
                  className="retry-image-btn"
                  onClick={handleMasterpieceImageRetry}
                  disabled={isGeneratingImage}
                >
                  🔄 Try Generating Image Again (Free)
                </button>
              </div>
              <div className="masterpiece-failed-style-box">
                <ImageStyleOptions
                  value={activeRetryStyleOptions}
                  onChange={handleRetryStyleChange}
                  disabled={isGeneratingImage}
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
          {isOilFree && <span className="result-dietary-pill oil-free">🌿 Oil-Free</span>}
          {isGlutenFree && <span className="result-dietary-pill gluten-free">🌾 Gluten-Free</span>}
          {isSugarFree && <span className="result-dietary-pill sugar-free">🍯 Refined Sugar-Free</span>}
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
                disabled={isSaving || isCalculatingMicros || Boolean(savedRecipeId)}
                className={`action-btn vault-btn ${(isSaving || isCalculatingMicros || savedRecipeId) ? 'saving' : ''}`}
                >
                {isCalculatingMicros
                  ? '⏳ Finalizing Nutrition...'
                  : (isSaving
                      ? '🔒 Vaulting...'
                      : (savedRecipeId
                          ? (isPublishedMasterpiece ? '🌟 Published Masterpiece' : '✅ Saved to Private Drafts')
                          : (isDraft ? '📝 Save Draft to Vault' : '📸 Save Full Recipe')))}
                </button>

                <button type="button" onClick={handleCopyRecipe} className="action-btn download-btn">
                {copiedRecipe ? '✓ Recipe Copied!' : '📋 Copy Full Recipe'}
                </button>
            </>
        )}

        <button 
          onClick={() => handleSpeak(advancedMicros ? `${recipeMarkdown}\n\n${advancedMicros}` : recipeMarkdown)} 
          className={`action-btn speak-btn ${speakBtnClass}`}
        >
          {speakBtnText}
        </button>
      </div>

      {isDraft && savedRecipeId && (
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
        <EmmaMarkdown>{recipeMarkdown}</EmmaMarkdown>
      </div>

      {!isChat && (!isDraft || advancedMicros || isCalculatingMicros) && (
          <div className="calc-micros-container">
              <button 
                onClick={() => setShowDeepDive(!showDeepDive)}
                disabled={isCalculatingMicros}
                className={`calc-micros-btn ${isCalculatingMicros ? 'calculating' : ''}`}
              >
                  {isCalculatingMicros ? '🧮 Emma is crunching the micros in the background...' : (showDeepDive ? '🙈 Hide Emma\'s Deep Dive' : '🔬 View Emma\'s Nutritional Deep Dive')}
              </button>
          </div>
      )}

      {showDeepDive && advancedMicros && (
          <div className="advanced-micros-content">
              <h3>🔬 Emma's Deep Dive Analysis</h3>
              <EmmaMarkdown>{advancedMicros}</EmmaMarkdown>
          </div>
      )}
      
      <div className="recipe-footer">
        <p><em>Generated by Emma Advanced for The Chris and Emma Show Premium Vault.</em></p>
      </div>
    </div>
  );
};

export default RecipeResult;