// src/components/RecipeDashboard/RecipeResult.jsx
import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { sendChatMessage } from '../../services/geminiApi';
import { getMicroCalculationInstructions } from '../../utils/promptBuilder';
import { useEmmaVoice } from '../../hooks/useEmmaVoice';
import LiveChat from '../LiveChat'; // Bringing in Live Mode
import './RecipeResult.css';

const RecipeResult = ({ recipeMarkdown, imageUrl, isDraft, isChat }) => {
  const { user } = useAuth(); 
  const currentUserName = user?.username || 'Love';

  const [isSaving, setIsSaving] = useState(false);
  const [advancedMicros, setAdvancedMicros] = useState(null);
  const [isCalculatingMicros, setIsCalculatingMicros] = useState(false);
  
  const [showDeepDive, setShowDeepDive] = useState(false);
  const [showLiveChat, setShowLiveChat] = useState(false); // Live chat state

  const { speechState, handleSpeak } = useEmmaVoice();

  useEffect(() => {
    if (recipeMarkdown && !isChat && !isDraft && !advancedMicros && !isCalculatingMicros) {
        const fetchBackgroundMicros = async () => {
            setIsCalculatingMicros(true);
            try {
                const instructions = getMicroCalculationInstructions(currentUserName);
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
  }, [recipeMarkdown, isChat, isDraft, advancedMicros, isCalculatingMicros, currentUserName]);

  const handleDownload = () => {
    if (!recipeMarkdown) return;
    let filename = isDraft ? 'emma-wfpb-draft.md' : 'emma-wfpb-recipe.md';
    const titleMatch = recipeMarkdown.match(/^#\s+(.+)$/m);
    if (titleMatch && titleMatch[1]) {
      const safeTitle = titleMatch[1].toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      filename = `${safeTitle}.md`;
    }
    const finalOutput = advancedMicros ? `${recipeMarkdown}\n\n## Advanced Analysis\n${advancedMicros}` : recipeMarkdown;
    const blob = new Blob([finalOutput], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleSaveToVault = async () => {
      if (!recipeMarkdown) return;
      setIsSaving(true);
      
      let recipeTitle = 'Untitled Emma Masterpiece';
      const titleMatch = recipeMarkdown.match(/^#\s+(.+)$/m);
      if (titleMatch && titleMatch[1]) recipeTitle = titleMatch[1].trim();

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
      const calMatch = recipeMarkdown.match(/Calories:\s*(\d+)/i);
      if (calMatch) calories = parseInt(calMatch[1], 10);
      
      const proMatch = recipeMarkdown.match(/Protein:\s*(\d+)/i);
      if (proMatch) protein_g = parseInt(proMatch[1], 10);
      
      const carbMatch = recipeMarkdown.match(/Carbs:\s*(\d+)/i);
      if (carbMatch) carbs_g = parseInt(carbMatch[1], 10);
      
      const fatMatch = recipeMarkdown.match(/Fat:\s*(\d+)/i);
      if (fatMatch) fat_g = parseInt(fatMatch[1], 10);

      const fiberMatch = recipeMarkdown.match(/Fiber:\s*(\d+)/i);
      if (fiberMatch) fiber_g = parseInt(fiberMatch[1], 10);

      const parsedMicros = [];
      if (advancedMicros) {
          const microRegex = /\*\s+\*?\*?([a-zA-Z\s\-]+)\*?\*?:\s*([\d.]+)\s*([a-zA-Z]+)[^\d]+([\d.]+)%/g;
          let match;
          while ((match = microRegex.exec(advancedMicros)) !== null) {
              parsedMicros.push({
                  name: match[1].trim(),
                  amount: parseFloat(match[2]),
                  unit: match[3].trim(),
                  dv: parseFloat(match[4])
              });
          }
      }

      try {
          await api.saveGeneratedRecipe({
          title: recipeTitle, 
          description, 
          imageUrl: imageUrl || '', 
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
          micros: parsedMicros
        });
        const successMsg = isDraft ? 'Smashing! Your recipe draft has been locked in the Veggie Vault.' : 'Brilliant! The full recipe and image have been safely vaulted.';
        alert(successMsg);
      } catch (error) {
        console.error('Failed to save to the vault:', error);
        alert('Oh dear. Something went pear-shaped while saving to the database.');
      } finally {
        setIsSaving(false);
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

  if (!recipeMarkdown) return null;

  return (
    <div className="recipe-result-card">
      
      {imageUrl && (
        <div className="recipe-image-container">
            <img src={imageUrl} alt="A glorious AI-generated WFPB meal" />
        </div>
      )}

      {/* Live Chat Toggle Button */}
      {!isChat && (
          <button 
              onClick={() => setShowLiveChat(!showLiveChat)}
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

      {/* The Inline Live Chat Box */}
      {showLiveChat && !isChat && (
          <div style={{ marginBottom: '2rem', clear: 'both', width: '100%' }}>
              <LiveChat recipeContext={`The user is currently cooking or reviewing this recipe: \n\n${recipeMarkdown.substring(0, 1000)}`} />
          </div>
      )}

      {/* YOUR ORIGINAL ACTION ROW RESTORED */}
      <div className="action-row result-actions" style={{ clear: 'both' }}>
        {!isChat && (
            <>
                <button 
                onClick={handleSaveToVault}
                disabled={isSaving || isCalculatingMicros}
                className={`action-btn vault-btn ${(isSaving || isCalculatingMicros) ? 'saving' : ''}`}
                >
                {isCalculatingMicros ? '⏳ Finalizing Nutrition...' : (isSaving ? '🔒 Vaulting...' : (isDraft ? '📝 Save Draft to Vault' : '📸 Save Full Recipe'))}
                </button>

                <button onClick={handleDownload} className="action-btn download-btn">
                💾 Local Copy
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

      <div className="recipe-content">
        <ReactMarkdown>{recipeMarkdown}</ReactMarkdown>
      </div>

      {!isChat && !isDraft && (
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
              <ReactMarkdown>{advancedMicros}</ReactMarkdown>
          </div>
      )}
      
      <div className="recipe-footer">
        <p><em>Generated by Emma Advanced for The Chris and Emma Show Premium Vault.</em></p>
      </div>
    </div>
  );
};

export default RecipeResult;