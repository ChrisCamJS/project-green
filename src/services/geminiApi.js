// src/services/geminiApi.js

export const sendChatMessage = async (chatHistory, systemInstructionText) => {
  const API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
  if (!API_KEY) throw new Error("The Gemini API key is missing. Check your .env file.");

  const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${API_KEY}`;

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: systemInstructionText }]
        },
        contents: chatHistory, // This is our array of { role: 'user'/'model', parts: [{ text: '...' }] }
        generationConfig: { temperature: 0.7, maxOutputTokens: 5000 },
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


/**
 * Fires off a prompt to the Gemini 3.1 Flash Image Preview (Nano Banana 2) model.
 * @param {string} dishName - What we want it to draw.
 * @returns {Promise<string>} The base64 image string.
 */
export const generateRecipeImage = async (dishName) => {
  const API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
  
  // Using the unified generateContent endpoint with the new image model
  const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-image:generateContent?key=${API_KEY}`;

  const imagePrompt = `A professional, mouth-watering, high-resolution food photography shot of a vegan, whole-food plant-based dish: ${dishName}. Served on a rustic butcher block counter. Beautiful, natural window lighting.`;

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
            { parts: [{ text: imagePrompt }] }
        ]
        // Notice we completely removed the generationConfig block here!
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