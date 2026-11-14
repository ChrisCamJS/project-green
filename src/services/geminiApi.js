// src/services/geminiApi.js

export const sendChatMessage = async (chatHistory, systemInstructionText) => {
  const API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
  if (!API_KEY) throw new Error("The Gemini API key is missing. Check your .env file.");

  // Updated to the new 3.5 Flash-Lite model (or gemini-3.5-flash if you prefer the full version)
  const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${API_KEY}`;

  // Strip UI-only properties (such as displayParts) so Gemini's strict schema doesn't reject follow-up turns
  const apiContents = chatHistory.map(({ role, parts }) => ({
    role,
    parts,
  }));

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: systemInstructionText }]
        },
        contents: apiContents, // Strictly alternating { role: 'user'/'model', parts: [{ text: '...' }] }
        // Removed custom temperature/sampling so the new 3.x models don't throw a strop
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error?.message || "Text generation went completely pear-shaped.");
    }

    const data = await response.json();
    return data.candidates[0].content.parts[0].text;
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
    `A professional, mouth-watering, high-resolution food photography shot of a vegan, whole-food plant-based dish: ${cleanDish}.`,
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
  const API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
  
  const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-image:generateContent?key=${API_KEY}`;

  const imagePrompt = buildRecipeImagePrompt(dishName, imageOptions);

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          { parts: [{ text: imagePrompt }] }
        ]
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.warn("Image generation failed:", errorData);
      return null; 
    }

    const data = await response.json();
    
    // Gemini Image models return the image inside an 'inlineData' object
    const imagePart = data.candidates[0].content.parts.find(part => part.inlineData);
    
    if (imagePart) {
        return imagePart.inlineData.data; // This is the raw base64 string
    }
    
    return null;
  } catch (error) {
    console.error("Gemini Image API Error:", error);
    return null; 
  }
};