// src/components/RecipeDashboard/RecipeForm.jsx
import React, { useState, useEffect, useRef } from 'react';
import { useSpeechToText } from '../../hooks/useSpeechToText';
import { DEFAULT_IMAGE_STYLE_OPTIONS } from '../../services/geminiApi';
import {
  ACCEPTED_REFERENCE_EXTENSIONS,
  formatFileSize,
  parseReferenceFile,
} from '../../utils/referenceDocument';
import ImageStyleOptions from './ImageStyleOptions';

const RecipeForm = ({
  onGenerate,
  isLoading,
  isBroke,
  engineMode,
  onToggleLiveChat = null,
  showLiveChat = false,
  initialPrompt = '',
  shouldFocusPrompt = false,
}) => {
  const [userRequest, setUserRequest] = useState(() => String(initialPrompt || ''));

  const baseTextRef = useRef('');
  const requestTextareaRef = useRef(null);
  const referencePasteRef = useRef(null);

  useEffect(() => {
    const el = requestTextareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [userRequest]);

  useEffect(() => {
    if (!shouldFocusPrompt) return;
    const timer = setTimeout(() => {
      const el = requestTextareaRef.current;
      if (!el) return;
      el.focus();
      const len = el.value.length;
      if (typeof el.setSelectionRange === 'function') {
        el.setSelectionRange(len, len);
      }
    }, 50);
    return () => clearTimeout(timer);
  }, [shouldFocusPrompt]);

  const [prefs, setPrefs] = useState({
    oilFree: true,
    glutenFree: false,
    sugarFree: true,
  });

  // Reference document / pasted base recipe state
  const [showReferenceBox, setShowReferenceBox] = useState(false);
  const [pastedReference, setPastedReference] = useState('');

  useEffect(() => {
    const el = referencePasteRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [pastedReference, showReferenceBox]);
  const [uploadedDoc, setUploadedDoc] = useState(null);
  const [isParsingFile, setIsParsingFile] = useState(false);
  const [fileError, setFileError] = useState(null);
  const [showMobileContextPrompt, setShowMobileContextPrompt] = useState(false);
  const [showMobileContextInput, setShowMobileContextInput] = useState(false);
  const [mobileContextDraft, setMobileContextDraft] = useState('');

  // Masterpiece image style & kitchen customization state
  const [imageOptions, setImageOptions] = useState({ ...DEFAULT_IMAGE_STYLE_OPTIONS });

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
    setPrefs((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const processSelectedFile = async (file, inputEl, { openReferenceDrawer = true } = {}) => {
    if (!file) return;

    setIsParsingFile(true);
    setFileError(null);
    if (openReferenceDrawer) {
      setShowReferenceBox(true);
    }
    try {
      const parsed = await parseReferenceFile(file);
      setUploadedDoc(parsed);
      if (!openReferenceDrawer) {
        setShowMobileContextInput(false);
        setMobileContextDraft(pastedReference || '');
        setShowMobileContextPrompt(true);
      }
    } catch (err) {
      setFileError(err.message || 'Could not read the selected file.');
      setUploadedDoc(null);
    } finally {
      setIsParsingFile(false);
      if (inputEl) {
        inputEl.value = '';
      }
    }
  };

  const handleFileChange = (e) => processSelectedFile(e.target.files?.[0], e.target, { openReferenceDrawer: true });

  const handleMobilePaperclipFileChange = (e) =>
    processSelectedFile(e.target.files?.[0], e.target, { openReferenceDrawer: false });

  const hasReference = Boolean(pastedReference.trim() || uploadedDoc);
  const canSubmit = Boolean(userRequest.trim() || hasReference);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!canSubmit || isParsingFile) return;
    onGenerate(
      userRequest,
      prefs,
      { pastedReference, uploadedDoc },
      imageOptions
    );
  };

  const getPlaceholder = () => {
    if (isListening) return "Listening... Go ahead and speak, love!";
    if (engineMode === 'chat') {
      return hasReference
        ? "E.g., Make this oil-free, suggest healthy swaps, or break down the nutrition..."
        : "E.g., What are the best plant-based sources of iron, Emma?";
    }
    return hasReference
      ? "E.g., Turn my reference recipe into a spicy Instant Pot oil-free version for 6 servings..."
      : "E.g., A massive bowl of spicy lentil stew, or a proper good vegan shepherd's pie...";
  };

  const getLabel = () => {
    if (engineMode === 'chat') return "Ask Emma a question...";
    return "What are you craving, then?";
  };

  const getButtonText = () => {
    if (isLoading) return "Emma's having a think...";
    if (engineMode === 'chat') return "Chat with Emma (free)";
    if (engineMode === 'draft') return "Create Recipe (free)";
    if (isBroke) return "🪙 Create Full Masterpiece (Top Up Tokens)";
    return "Create Full Masterpiece";
  };

  const pastedWordCount = pastedReference.trim()
    ? pastedReference.trim().split(/\s+/).filter(Boolean).length
    : 0;

  return (
    <>
    <form className="recipe-form" onSubmit={handleSubmit}>
      <div className="input-group">
        <label htmlFor="recipe-request">{getLabel()}</label>

        {/* We wrap the textarea and action icons in a container for styling */}
        <div className="textarea-wrapper">
          <textarea
            ref={requestTextareaRef}
            id="recipe-request"
            value={userRequest}
            onChange={(e) => setUserRequest(e.target.value)}
            placeholder={getPlaceholder()}
            disabled={isLoading}
            rows="4"
            style={{ overflowY: 'hidden', resize: 'none' }}
            required={!hasReference}
          />

          <div className="textarea-action-icons">
            <label
              className={`mobile-attach-paperclip-btn ${hasReference ? 'has-ref' : ''} ${(isLoading || isParsingFile) ? 'disabled' : ''}`}
              title="Attach a file or image for Emma"
              aria-label="Attach a file or image for Emma"
            >
              <span aria-hidden="true">{isParsingFile ? '⏳' : '📎'}</span>
              {hasReference && <span className="mobile-attach-dot" aria-hidden="true" />}
              <input
                type="file"
                accept={ACCEPTED_REFERENCE_EXTENSIONS}
                onChange={handleMobilePaperclipFileChange}
                disabled={isLoading || isParsingFile}
                hidden
              />
            </label>

            {/* Only render the mic button if their browser supports it! */}
            {isSupported && (
              <button
                type="button"
                className={`mic-btn ${isListening ? 'listening' : ''}`}
                onClick={handleMicClick}
                disabled={isLoading}
                title={isListening ? 'Stop listening' : 'Click to speak'}
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="mic-icon">
                  <path d="M12 14C10.3431 14 9 12.6569 9 11V5C9 3.34315 10.3431 2 12 2C13.6569 2 15 3.34315 15 5V11C15 12.6569 13.6569 14 12 14ZM12 16C14.7614 16 17 13.7614 17 11H19C19 14.4447 16.5126 17.3113 13 17.8926V21H11V17.8926C7.48743 17.3113 5 14.4447 5 11H7C7 13.7614 9.23858 16 12 16Z"></path>
                </svg>
              </button>
            )}
          </div>
        </div>

        {(uploadedDoc || pastedReference.trim()) && (
          <div className="mobile-attached-bar">
            {uploadedDoc && (
              <span className="reference-summary-pill">
                📄 {uploadedDoc.fileName}
              </span>
            )}
            {pastedReference.trim() && (
              <span className="reference-summary-pill">
                📋 {pastedWordCount} {pastedWordCount === 1 ? 'word' : 'words'} context
              </span>
            )}
            <button
              type="button"
              className="mobile-attached-action-btn"
              onClick={() => {
                setMobileContextDraft(pastedReference || '');
                setShowMobileContextInput(true);
                setShowMobileContextPrompt(true);
              }}
              disabled={isLoading}
            >
              {pastedReference.trim() ? 'Edit Context' : '+ Add Context'}
            </button>
            <button
              type="button"
              className="mobile-attached-remove-btn"
              onClick={() => {
                setUploadedDoc(null);
                setPastedReference('');
                setFileError(null);
              }}
              disabled={isLoading}
              aria-label="Remove attached file and context"
            >
              ✕
            </button>
          </div>
        )}

        {fileError && (
          <div className="mobile-file-error-wrap">
            <div className="reference-error-msg" role="alert">
              {fileError}
            </div>
          </div>
        )}
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

      {engineMode === 'full' && (
        <ImageStyleOptions
          value={imageOptions}
          onChange={setImageOptions}
          disabled={isLoading}
        />
      )}

      {engineMode === 'chat' && onToggleLiveChat ? (
        <div className="chat-submit-split-row">
          <button
            type="submit"
            className="submit-btn chat-split-send-btn"
            disabled={isLoading || isParsingFile || !canSubmit}
          >
            {getButtonText()}
          </button>
          <button
            type="button"
            onClick={onToggleLiveChat}
            disabled={isLoading}
            className={`chat-tool-btn live-audio-toggle-btn chat-split-live-btn ${showLiveChat ? 'active' : ''}`}
            title="Start talking with Emma in Live Audio Mode (0.10 Tokens/min)"
          >
            {showLiveChat ? (
              '🛑 Close Live'
            ) : (
              <>
                🎙️ Go Live<span className="live-cost-desktop"> (0.10/min)</span>
              </>
            )}
          </button>
        </div>
      ) : (
        <button
          type="submit"
          className="submit-btn"
          disabled={isLoading || isParsingFile || !canSubmit}
        >
          {getButtonText()}
        </button>
      )}

      {/* Reference Document / Base Recipe Section */}
      <div className={`reference-section ${showReferenceBox ? 'open' : ''}`} style={{ marginTop: '0.85rem' }}>
        <div className="reference-toggle-row">
          <button
            type="button"
            className={`reference-toggle-btn ${hasReference ? 'has-ref' : ''}`}
            onClick={() => setShowReferenceBox((prev) => !prev)}
            disabled={isLoading}
            aria-expanded={showReferenceBox}
          >
            <span>📎 Attach or Paste a Reference Recipe / Document (Optional)</span>
            <span className="reference-toggle-arrow" aria-hidden="true">
              {showReferenceBox ? '▲' : '▼'}
            </span>
          </button>

          {hasReference && (
            <div className="reference-summary-pills">
              {uploadedDoc && (
                <span className="reference-summary-pill">📄 {uploadedDoc.fileName}</span>
              )}
              {pastedWordCount > 0 && (
                <span className="reference-summary-pill">
                  📋 {pastedWordCount} {pastedWordCount === 1 ? 'word' : 'words'} pasted
                </span>
              )}
            </div>
          )}
        </div>

        <div
          className={`collapsible-drawer-shell ${showReferenceBox ? 'is-open' : ''}`}
          aria-hidden={!showReferenceBox}
        >
          <div className="collapsible-drawer-inner">
            <div className="reference-drawer">
            <p className="reference-help-text">
              Upload an existing recipe file or paste your base recipe/notes below. Emma will use it as the foundation and adapt it to your prompt and dietary preferences.
            </p>

            <div className="reference-upload-row">
              <label className={`reference-upload-btn ${(isLoading || isParsingFile) ? 'disabled' : ''}`}>
                <span>
                  {isParsingFile
                    ? '⏳ Reading Document...'
                    : '📄 Upload Document (.txt, .md, .docx, .pdf, .csv, .json, or image)'}
                </span>
                <input
                  type="file"
                  accept={ACCEPTED_REFERENCE_EXTENSIONS}
                  onChange={handleFileChange}
                  disabled={isLoading || isParsingFile}
                  hidden
                />
              </label>

              {uploadedDoc && (
                <div className="reference-file-chip">
                  <span className="reference-chip-name">
                    📄 {uploadedDoc.fileName} ({formatFileSize(uploadedDoc.fileSize)})
                  </span>
                  <span className="reference-chip-kind">
                    {uploadedDoc.kind === 'inlineData' ? 'Multimodal File' : 'Text Extracted'}
                  </span>
                  <button
                    type="button"
                    className="reference-remove-btn"
                    onClick={() => {
                      setUploadedDoc(null);
                      setFileError(null);
                    }}
                    disabled={isLoading}
                    aria-label="Remove uploaded document"
                  >
                    ✕
                  </button>
                </div>
              )}
            </div>

            {fileError && (
              <div className="reference-error-msg" role="alert">
                {fileError}
              </div>
            )}

            <div className="reference-paste-group">
              <div className="reference-paste-header">
                <label htmlFor="reference-paste-area">
                  📋 Or paste a base recipe / ingredient list / notes here
                </label>
                {pastedReference && (
                  <button
                    type="button"
                    className="reference-clear-paste-btn"
                    onClick={() => setPastedReference('')}
                    disabled={isLoading}
                  >
                    Clear Text
                  </button>
                )}
              </div>
              <textarea
                ref={referencePasteRef}
                id="reference-paste-area"
                className="reference-paste-textarea"
                rows="4"
                value={pastedReference}
                onChange={(e) => setPastedReference(e.target.value)}
                placeholder="Paste ingredients, steps, blog notes, or a non-vegan recipe here for Emma to transform..."
                disabled={isLoading}
              />
            </div>
            </div>
          </div>
        </div>
      </div>
    </form>

    {showMobileContextPrompt && uploadedDoc && (
      <div
        className="mobile-context-modal-overlay"
        role="dialog"
        aria-modal="true"
        aria-labelledby="mobile-context-modal-title"
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            setShowMobileContextPrompt(false);
          }
        }}
      >
        <div className="mobile-context-modal-card">
          <div className="mobile-context-modal-header">
            <h3 id="mobile-context-modal-title">File Attached</h3>
            <span className="mobile-context-file-badge">
              📄 {uploadedDoc.fileName} ({formatFileSize(uploadedDoc.fileSize)})
            </span>
          </div>
          <p className="mobile-context-modal-question">
            Would you like to give Emma extra context about this image or document?
          </p>

          {!showMobileContextInput ? (
            <div className="mobile-context-actions">
              <button
                type="button"
                className="mobile-context-btn-primary"
                onClick={() => setShowMobileContextInput(true)}
              >
                Add Extra Context
              </button>
              <button
                type="button"
                className="mobile-context-btn-secondary"
                onClick={() => setShowMobileContextPrompt(false)}
              >
                Continue Without Extra Context
              </button>
            </div>
          ) : (
            <div className="mobile-context-input-panel">
              <textarea
                rows={4}
                className="mobile-context-textarea"
                value={mobileContextDraft}
                onChange={(e) => setMobileContextDraft(e.target.value)}
                placeholder="E.g., Make this oil-free, swap out dairy, or adapt for 6 servings..."
                autoFocus
              />
              <div className="mobile-context-actions">
                <button
                  type="button"
                  className="mobile-context-btn-primary"
                  onClick={() => {
                    setPastedReference(mobileContextDraft.trim());
                    setShowMobileContextPrompt(false);
                  }}
                >
                  Save Context
                </button>
                <button
                  type="button"
                  className="mobile-context-btn-secondary"
                  onClick={() => {
                    setPastedReference('');
                    setShowMobileContextPrompt(false);
                  }}
                >
                  Continue Without
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    )}
    </>
  );
};

export default RecipeForm;
