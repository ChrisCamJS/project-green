// src/components/RecipeDashboard/RecipeForm.jsx
import React, { useState, useEffect, useRef } from 'react';
import { useSpeechToText } from '../../hooks/useSpeechToText';

const RecipeForm = ({ onGenerate, isLoading, isBroke, engineMode }) => {
  const [userRequest, setUserRequest] = useState('');

  const baseTextRef = useRef('');
  
  const [prefs, setPrefs] = useState({
    oilFree: true,
    glutenFree: false,
    sugarFree: true 
  });

  // Initialize our microphone capabilities!
  const { isListening, transcript, toggleListening, isSupported } = useSpeechToText();

  const handleMicClick = () => {
      if (!isListening) {
          // The moment they click "listen", save whatever is currently in the text box
          baseTextRef.current = userRequest;
      }
      toggleListening();
  };

  // Watch the transcript. Emma hears new words, append them to the text area!
  useEffect(() => {
      if (transcript) {
          const spacer = baseTextRef.current.trim().length > 0 ? ' ' : '';
          setUserRequest(baseTextRef.current + spacer + transcript);
      }
  }, [transcript]);

  const handleToggle = (key) => {
    setPrefs(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!userRequest.trim()) return;
    onGenerate(userRequest, prefs);
  };

  const getPlaceholder = () => {
    // If the mic is hot, change the placeholder to let the user know we are listening!
    if (isListening) return "Listening... Go ahead and speak, love!";
    if (engineMode === 'chat') return "E.g., What are the best plant-based sources of iron, Emma?";
    return "E.g., A massive bowl of spicy lentil stew, or a proper good vegan shepherd's pie...";
  };

  const getLabel = () => {
    if (engineMode === 'chat') return "Ask Emma a question...";
    return "What are you craving, then?";
  };

  const getButtonText = () => {
      if (isLoading) return "Emma's having a think...";
      if (engineMode === 'chat') return "Chat with Emma (free)";
      if (engineMode === 'draft') return "Create Recipe (free)";
      return "Create Full Masterpiece";
  }

  return (
    <form className="recipe-form" onSubmit={handleSubmit}>
      
      <div className="input-group">
        <label htmlFor="recipe-request">{getLabel()}</label>
        
        {/* We wrap the textarea and mic button in a container for styling */}
        <div className="textarea-wrapper">
            <textarea
              id="recipe-request"
              value={userRequest}
              onChange={(e) => setUserRequest(e.target.value)}
              placeholder={getPlaceholder()}
              disabled={isLoading}
              rows="4"
              required
            />
            
            {/* Only render the mic button if their browser supports it! */}
            {isSupported && (
                <button
                    type="button"
                    className={`mic-btn ${isListening ? 'listening' : ''}`}
                    onClick={handleMicClick}
                    disabled={isLoading}
                    title={isListening ? "Stop listening" : "Click to speak"}
                >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="mic-icon">
                        <path d="M12 14C10.3431 14 9 12.6569 9 11V5C9 3.34315 10.3431 2 12 2C13.6569 2 15 3.34315 15 5V11C15 12.6569 13.6569 14 12 14ZM12 16C14.7614 16 17 13.7614 17 11H19C19 14.4447 16.5126 17.3113 13 17.8926V21H11V17.8926C7.48743 17.3113 5 14.4447 5 11H7C7 13.7614 9.23858 16 12 16Z"></path>
                    </svg>
                </button>
             )}
        </div>
      </div>

      {engineMode !== 'chat' && (
          <div className="dietary-toggles-container">
            <button 
                type="button" 
                className={`diet-pill ${prefs.oilFree ? 'active' : 'warning'}`}
                onClick={() => handleToggle('oilFree')}
                disabled={isLoading}
                title="Toggle strictly oil-free"
            >
                {prefs.oilFree ? '✅ Oil-Free' : '⚠️ Oil Allowed'}
            </button>
            
            <button 
                type="button" 
                className={`diet-pill ${prefs.glutenFree ? 'active' : ''}`}
                onClick={() => handleToggle('glutenFree')}
                disabled={isLoading}
            >
                {prefs.glutenFree ? '✅ Gluten-Free' : 'Gluten-Free'}
            </button>
            
            <button 
                type="button" 
                className={`diet-pill ${prefs.sugarFree ? 'active' : 'warning'}`}
                onClick={() => handleToggle('sugarFree')}
                disabled={isLoading}
                title="Refined Sugar-Free"
            >
                {prefs.sugarFree ? '✅ Refined Sugar-Free' : '⚠️ Refined Sugar Allowed'}
            </button>
          </div>
      )}

      <button 
        type="submit" 
        className="submit-btn" 
        disabled={isBroke || isLoading || !userRequest.trim()}
      >
        {getButtonText()}
      </button>

    </form>
  );
};

export default RecipeForm;