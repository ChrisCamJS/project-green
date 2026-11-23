// src/services/geminiApi.js
import { api } from './api';

export const sendChatMessage = async (chatHistory, systemInstructionText) => {
  // Strip UI-only properties (such as displayParts) so Gemini's strict schema doesn't reject follow-up turns
  const apiContents = chatHistory.map(({ role, parts }) => ({
    role,
    parts,
  }));

  try {
    const data = await api.aiChat(apiContents, {
      parts: [{ text: systemInstructionText }]
    });
    return data.text;
  } catch (error) {
    console.error("Gemini Chat API Error:", error);
    throw error;
  }
};


export const DEFAULT_IMAGE_STYLE_OPTIONS = {
  kitchenColorScheme: '',
  surfaceStyle: '',
  lightingStyle: '',
  cameraAngle: '',
  customDetails: '',
};

export const buildRecipeImagePrompt = (dishName, imageOptions = {}) => {
  const {
    kitchenColorScheme = '',
    surfaceStyle = '',
    lightingStyle = '',
    cameraAngle = '',
    customDetails = '',
  } = imageOptions || {};

  const cleanDish = (dishName || 'Whole-Food Plant-Based dish')
    .replace(/^I want a recipe for:\s*/i, '')
    .trim();
  const surfaceClause = surfaceStyle
    ? `Served on ${surfaceStyle}.`
    : 'Served on a rustic butcher block counter.';
  const kitchenColorClause = kitchenColorScheme?.trim()
    ? `Set in a kitchen featuring a ${kitchenColorScheme.trim()} color scheme.`
    : '';
  const lightingClause = lightingStyle
    ? `Lighting: ${lightingStyle}.`
    : 'Beautiful, natural window lighting.';
  const angleClause = cameraAngle
    ? `Camera angle and framing: ${cameraAngle}.`
    : '';
  const customClause = customDetails?.trim()
    ? `Additional scene and styling details: ${customDetails.trim()}.`
    : '';

  return [
    `A professional, mouth-watering, high-resolution food photography shot of ${cleanDish} (prepared 100% vegan, whole-food plant-based, and oil-free).`,
    surfaceClause,
    kitchenColorClause,
    lightingClause,
    angleClause,
    customClause,
  ]
    .filter(Boolean)
    .join(' ');
};

/**
 * Fires off a prompt to the Gemini 3.1 Flash Image model.
 * @param {string} dishName - What we want it to draw.
 * @param {Object} imageOptions - Optional kitchen color scheme, surface, lighting, framing, and custom visual details.
 * @returns {Promise<string>} The base64 image string.
 */
export const generateRecipeImage = async (dishName, imageOptions = {}) => {
  const imagePrompt = buildRecipeImagePrompt(dishName, imageOptions);

  try {
    const data = await api.aiGenerateImage(imagePrompt);
    return data?.imageBase64 || null;
  } catch (error) {
    console.error("Gemini Image API Error:", error);
    return null;
  }
};