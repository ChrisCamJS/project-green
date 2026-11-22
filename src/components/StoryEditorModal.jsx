import React, { useState, useRef, useEffect } from 'react';
import { api } from '../services/api';
import { resolveStoryAssetUrl } from '../utils/storyUtils';
import './StoryEditorModal.css';

const stripHtmlToText = (html = '') => {
  if (!html) return '';
  const spaced = String(html).replace(/<(\/p|\/h2|\/h3|\/li|\/blockquote|br\s*\/?)>/gi, ' ');
  const doc = typeof DOMParser !== 'undefined'
    ? new DOMParser().parseFromString(spaced, 'text/html')
    : null;
  const raw = doc?.body?.textContent || spaced.replace(/<[^>]+>/g, ' ');
  return raw.replace(/\s+/g, ' ').trim();
};

const computeWordCountAndReadTime = (html = '') => {
  const plain = stripHtmlToText(html);
  if (!plain) return { words: 0, minutes: 1 };
  const words = plain.split(/\s+/).filter(Boolean).length;
  return {
    words,
    minutes: Math.max(1, Math.ceil(words / 200)),
  };
};

const generateExcerptFromHtml = (html = '') => {
  const plain = stripHtmlToText(html);
  if (!plain) return '';
  if (plain.length <= 280) return plain;
  const sliced = plain.slice(0, 277);
  const lastSpace = sliced.lastIndexOf(' ');
  const cut = lastSpace > 160 ? sliced.slice(0, lastSpace) : sliced;
  return `${cut.replace(/[.,;:\s-]+$/, '')}...`;
};

const readFileAsDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Could not read the selected image file.'));
    reader.readAsDataURL(file);
  });

const parseYouTubeVideoId = (rawInput = '') => {
  const trimmed = String(rawInput || '').trim();
  if (!trimmed) return null;

  // If the user pasted a full <iframe src="..."> snippet, extract the src first
  const iframeSrcMatch = trimmed.match(/\bsrc=["']([^"']+)["']/i);
  const target = iframeSrcMatch ? iframeSrcMatch[1].trim() : trimmed;

  const patterns = [
    /^(?:https?:)?\/\/(?:www\.|m\.)?youtube(?:-nocookie)?\.com\/embed\/([a-zA-Z0-9_-]{11})(?:[?&/].*)?$/i,
    /^(?:https?:)?\/\/(?:www\.|m\.)?youtube\.com\/watch\?(?:[^#]*&)?v=([a-zA-Z0-9_-]{11})(?:[&#].*)?$/i,
    /^(?:https?:)?\/\/youtu\.be\/([a-zA-Z0-9_-]{11})(?:[?&/].*)?$/i,
    /^(?:https?:)?\/\/(?:www\.|m\.)?youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})(?:[?&/].*)?$/i,
    /^(?:https?:)?\/\/(?:www\.|m\.)?youtube\.com\/live\/([a-zA-Z0-9_-]{11})(?:[?&/].*)?$/i,
  ];

  for (const pattern of patterns) {
    const m = target.match(pattern);
    if (m && m[1]) return m[1];
  }
  return null;
};

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

const hydrateEditorHtmlImages = (html = '') => {
  if (!html || !API_BASE_URL) return html;
  return String(html).replace(
    /(<img\b[^>]*?\bsrc=["'])(\/(?:images|uploads)\/[^"']+)(["'])/gi,
    (_, prefix, relPath, suffix) => `${prefix}${API_BASE_URL}${relPath}${suffix}`
  );
};

const StoryEditorInner = ({ recipe, initialStory, onClose, onSaved }) => {
  const isEditing = Boolean(initialStory?.id);
  const defaultBodyHtml = hydrateEditorHtmlImages(
    initialStory?.contentHtml ||
      initialStory?.content_html ||
      '<p>Share the story behind making this recipe—who you cooked it for, any personal touches, or how it turned out at your table...</p>'
  );

  const [title, setTitle] = useState(() => initialStory?.title || '');
  const [excerpt, setExcerpt] = useState(() => initialStory?.excerpt || '');
  const [coverImagePath, setCoverImagePath] = useState(
    () => initialStory?.coverImage || initialStory?.cover_image || ''
  );
  const [htmlContent, setHtmlContent] = useState(() => defaultBodyHtml);
  const [isUploadingCover, setIsUploadingCover] = useState(false);
  const [isUploadingInline, setIsUploadingInline] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [linkUrlDraft, setLinkUrlDraft] = useState('https://');
  const [showYoutubeInput, setShowYoutubeInput] = useState(false);
  const [youtubeUrlDraft, setYoutubeUrlDraft] = useState('');

  const editorRef = useRef(null);
  const savedRangeRef = useRef(null);
  const initializedRef = useRef(false);

  // Initialize contentEditable innerHTML once on mount
  useEffect(() => {
    if (editorRef.current && !initializedRef.current) {
      editorRef.current.innerHTML = defaultBodyHtml;
      initializedRef.current = true;
    }
  }, [defaultBodyHtml]);

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && !isSubmitting && !isUploadingCover && !isUploadingInline) {
        onClose();
      }
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose, isSubmitting, isUploadingCover, isUploadingInline]);

  const saveSelection = () => {
    if (typeof window === 'undefined') return;
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && editorRef.current?.contains(sel.anchorNode)) {
      savedRangeRef.current = sel.getRangeAt(0).cloneRange();
    }
  };

  const restoreSelection = () => {
    if (typeof window === 'undefined' || !savedRangeRef.current) return;
    const sel = window.getSelection();
    if (sel) {
      sel.removeAllRanges();
      sel.addRange(savedRangeRef.current);
    }
  };

  const syncEditorState = () => {
    if (!editorRef.current) return;
    setHtmlContent(editorRef.current.innerHTML);
  };

  const runExecCommand = (command, value = null) => {
    if (!editorRef.current) return;
    editorRef.current.focus();
    restoreSelection();
    try {
      document.execCommand(command, false, value);
    } catch {
      // ignore fallback errors
    }
    saveSelection();
    syncEditorState();
  };

  const handleFormatBlock = (tag) => {
    runExecCommand('formatBlock', `<${tag}>`);
  };

  const handleInsertLink = (e) => {
    e.preventDefault();
    const cleanUrl = String(linkUrlDraft || '').trim();
    if (!cleanUrl || !/^https?:\/\/\S+$/i.test(cleanUrl)) {
      setError('Please enter a valid http:// or https:// URL.');
      return;
    }
    setError(null);
    restoreSelection();
    runExecCommand('createLink', cleanUrl);
    setShowLinkInput(false);
    setLinkUrlDraft('https://');
  };

  const handleInsertYoutube = (e) => {
    e.preventDefault();
    const videoId = parseYouTubeVideoId(youtubeUrlDraft);
    if (!videoId) {
      setError('Please enter a valid YouTube link (e.g., https://www.youtube.com/watch?v=... or https://youtu.be/...).');
      return;
    }
    setError(null);
    const embedMarkup = `<figure class="story-video-embed"><iframe src="https://www.youtube-nocookie.com/embed/${videoId}" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe></figure><p><br></p>`;

    if (editorRef.current) {
      editorRef.current.focus();
      restoreSelection();
      const inserted = document.execCommand('insertHTML', false, embedMarkup);
      if (!inserted) {
        editorRef.current.innerHTML += embedMarkup;
      }
      syncEditorState();
    }
    setShowYoutubeInput(false);
    setYoutubeUrlDraft('');
  };

  const handleCoverUpload = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) {
      setError('Please select a valid JPG, PNG, WebP, or GIF image.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError('Cover image must be 10 MB or smaller.');
      return;
    }

    setError(null);
    setIsUploadingCover(true);
    try {
      const dataUrl = await readFileAsDataUrl(file);
      const res = await api.uploadStoryImage(dataUrl, 'cover');
      if (res?.success && res.imageUrl) {
        setCoverImagePath(res.imageUrl);
      } else {
        throw new Error(res?.message || 'Could not upload cover photo.');
      }
    } catch (err) {
      setError(err?.message || 'Cover photo failed moderation or could not be uploaded.');
    } finally {
      setIsUploadingCover(false);
    }
  };

  const handleInlineImageUpload = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) {
      setError('Please select a valid JPG, PNG, WebP, or GIF image.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError('Inline photo must be 10 MB or smaller.');
      return;
    }

    setError(null);
    setIsUploadingInline(true);
    try {
      const dataUrl = await readFileAsDataUrl(file);
      const res = await api.uploadStoryImage(dataUrl, 'inline');
      if (res?.success && res.imageUrl) {
        const fullImgUrl = resolveStoryAssetUrl(res.imageUrl);
        const safeAlt = (title || recipe?.title || 'Story cooking photo').replace(/"/g, '&quot;');
        const imgMarkup = `<figure><img src="${fullImgUrl}" alt="${safeAlt}" /></figure><p><br></p>`;

        if (editorRef.current) {
          editorRef.current.focus();
          restoreSelection();
          const inserted = document.execCommand('insertHTML', false, imgMarkup);
          if (!inserted) {
            editorRef.current.innerHTML += imgMarkup;
          }
          syncEditorState();
        }
      } else {
        throw new Error(res?.message || 'Could not upload inline photo.');
      }
    } catch (err) {
      setError(err?.message || 'Inline photo failed safety check or could not be uploaded.');
    } finally {
      setIsUploadingInline(false);
    }
  };

  const handleAutoExcerpt = () => {
    const currentHtml = editorRef.current ? editorRef.current.innerHTML : htmlContent;
    const generated = generateExcerptFromHtml(currentHtml);
    if (generated) {
      setExcerpt(generated);
    }
  };

  const handleSubmit = async (targetStatus = 'published') => {
    if (isSubmitting || isUploadingCover || isUploadingInline) return;
    setError(null);

    const currentHtml = editorRef.current ? editorRef.current.innerHTML : htmlContent;
    const plainText = stripHtmlToText(currentHtml);
    const trimmedTitle = title.trim();

    if (trimmedTitle.length < 4) {
      setError('Please enter a story headline (at least 4 characters).');
      return;
    }

    if (plainText.length < 20) {
      setError('Please write at least a sentence or two in your story body before saving.');
      return;
    }

    const recipeId = initialStory?.recipeId || initialStory?.recipe_id || recipe?.id;
    if (!recipeId) {
      setError('Missing linked recipe ID.');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        id: initialStory?.id,
        recipe_id: Number(recipeId),
        title: trimmedTitle,
        excerpt: excerpt.trim() || generateExcerptFromHtml(currentHtml),
        cover_image: coverImagePath || null,
        content_html: currentHtml,
        status: targetStatus,
      };

      const res = isEditing
        ? await api.updateStory(payload)
        : await api.createStory(payload);

      if (res?.success) {
        if (onSaved) {
          onSaved(res);
        }
      } else {
        throw new Error(res?.message || 'Could not save your story.');
      }
    } catch (err) {
      setError(err?.message || 'Failed to save story. Please check your text and try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const { words, minutes } = computeWordCountAndReadTime(htmlContent);
  const recipeTitle = recipe?.title || initialStory?.recipeTitle || 'this recipe';
  const recipeFallbackCover = recipe?.imageUrl || recipe?.image_url || initialStory?.recipeImageUrl;
  const activeCoverPreview = coverImagePath
    ? resolveStoryAssetUrl(coverImagePath)
    : (recipeFallbackCover ? resolveStoryAssetUrl(recipeFallbackCover) : null);

  return (
    <div
      className="story-editor-backdrop no-print"
      role="dialog"
      aria-modal="true"
      aria-labelledby="story-editor-heading"
      onClick={() => {
        if (!isSubmitting && !isUploadingCover && !isUploadingInline) onClose();
      }}
    >
      <div className="story-editor-modal" onClick={(e) => e.stopPropagation()}>
        <header className="story-editor-header">
          <div className="story-editor-header-text">
            <span className="story-editor-kicker">📖 The Veggie Vault Editorial Studio</span>
            <h2 id="story-editor-heading" className="story-editor-title">
              {isEditing ? 'Edit Your Recipe Story' : 'Write a Recipe Story'}
            </h2>
            <p className="story-editor-subtitle">
              Linked to recipe: <strong>{recipeTitle}</strong>
            </p>
          </div>
          <button
            type="button"
            className="story-editor-close-btn"
            onClick={onClose}
            disabled={isSubmitting}
            aria-label="Close Story Editor"
          >
            ✕
          </button>
        </header>

        <div className="story-editor-form">
          {error && (
            <div className="story-editor-error" role="alert">
              ⚠️ {error}
            </div>
          )}

          {/* 1. Headline */}
          <div className="story-editor-field">
            <label htmlFor="story-headline-input" className="story-editor-label">
              1. Story Headline <span className="story-editor-req">*</span>
            </label>
            <input
              id="story-headline-input"
              type="text"
              className="story-editor-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              placeholder={`e.g., Sunday Family Dinner with ${recipeTitle}`}
              disabled={isSubmitting}
            />
          </div>

          {/* 2. Cover Image Upload */}
          <div className="story-editor-field">
            <div className="story-editor-label-row">
              <span className="story-editor-label">2. Hero Cover Image</span>
              <span className="story-editor-hint">
                {coverImagePath
                  ? 'Custom cover photo uploaded (EXIF stripped & AI-verified)'
                  : 'Defaults to the linked recipe photo if none uploaded'}
              </span>
            </div>

            <div className="story-editor-cover-row">
              {activeCoverPreview && (
                <div className="story-editor-cover-preview">
                  <img src={activeCoverPreview} alt="Cover preview" />
                  <span className="story-editor-cover-badge">
                    {coverImagePath ? '📸 Custom Cover' : '🍽️ Recipe Cover Fallback'}
                  </span>
                </div>
              )}

              <div className="story-editor-cover-actions">
                <label className="story-editor-upload-btn">
                  {isUploadingCover ? '🛡️ Checking & Uploading...' : '📸 Upload Cover Photo'}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    onChange={handleCoverUpload}
                    disabled={isUploadingCover || isSubmitting}
                    hidden
                  />
                </label>

                {coverImagePath && (
                  <button
                    type="button"
                    className="story-editor-remove-cover-btn"
                    onClick={() => setCoverImagePath('')}
                    disabled={isUploadingCover || isSubmitting}
                  >
                    Use Recipe Photo Instead
                  </button>
                )}
                <small className="story-editor-cover-note">
                  Used as the blog banner and Open Graph social preview card (`og:image`).
                </small>
              </div>
            </div>
          </div>

          {/* 3. Rich-Text Body Editor */}
          <div className="story-editor-field">
            <div className="story-editor-label-row">
              <span className="story-editor-label">
                3. Your Story <span className="story-editor-req">*</span>
              </span>
              <span className="story-editor-stats-pill">
                📝 {words} {words === 1 ? 'word' : 'words'} · 📖 ~{minutes} min read
              </span>
            </div>

            <div className="story-richtext-shell">
              <div className="story-richtext-toolbar" role="toolbar" aria-label="Formatting options">
                <button
                  type="button"
                  className="story-tool-btn"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => handleFormatBlock('P')}
                  title="Normal Paragraph"
                >
                  P
                </button>
                <button
                  type="button"
                  className="story-tool-btn"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => handleFormatBlock('H2')}
                  title="Section Heading (H2)"
                >
                  H2
                </button>
                <button
                  type="button"
                  className="story-tool-btn"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => handleFormatBlock('H3')}
                  title="Subheading (H3)"
                >
                  H3
                </button>

                <span className="story-tool-divider" aria-hidden="true" />

                <button
                  type="button"
                  className="story-tool-btn"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => runExecCommand('bold')}
                  title="Bold"
                >
                  <strong>B</strong>
                </button>
                <button
                  type="button"
                  className="story-tool-btn"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => runExecCommand('italic')}
                  title="Italic"
                >
                  <em>I</em>
                </button>
                <button
                  type="button"
                  className="story-tool-btn"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => runExecCommand('underline')}
                  title="Underline"
                >
                  <u>U</u>
                </button>

                <span className="story-tool-divider" aria-hidden="true" />

                <button
                  type="button"
                  className="story-tool-btn"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => handleFormatBlock('BLOCKQUOTE')}
                  title="Blockquote"
                >
                  ❝ Quote
                </button>
                <button
                  type="button"
                  className="story-tool-btn"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => runExecCommand('insertUnorderedList')}
                  title="Bulleted List"
                >
                  • List
                </button>
                <button
                  type="button"
                  className="story-tool-btn"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => runExecCommand('insertOrderedList')}
                  title="Numbered List"
                >
                  1. List
                </button>

                <span className="story-tool-divider" aria-hidden="true" />

                <button
                  type="button"
                  className={`story-tool-btn ${showLinkInput ? 'active' : ''}`}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    saveSelection();
                  }}
                  onClick={() => {
                    setShowYoutubeInput(false);
                    setShowLinkInput((prev) => !prev);
                  }}
                  title="Insert Link"
                >
                  🔗 Link
                </button>

                <label
                  className="story-tool-btn story-tool-upload-btn"
                  onMouseDown={() => saveSelection()}
                  title="Upload & insert an inline photo"
                >
                  {isUploadingInline ? '⏳ Uploading...' : '🖼️ Add Photo'}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    onChange={handleInlineImageUpload}
                    disabled={isUploadingInline || isSubmitting}
                    hidden
                  />
                </label>

                <button
                  type="button"
                  className={`story-tool-btn story-tool-youtube-btn ${showYoutubeInput ? 'active' : ''}`}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    saveSelection();
                  }}
                  onClick={() => {
                    setShowLinkInput(false);
                    setShowYoutubeInput((prev) => !prev);
                  }}
                  title="Embed a YouTube video"
                >
                  ▶️ YouTube
                </button>
              </div>

              {showLinkInput && (
                <div className="story-link-bar">
                  <input
                    type="url"
                    className="story-link-input"
                    value={linkUrlDraft}
                    onChange={(e) => setLinkUrlDraft(e.target.value)}
                    placeholder="https://example.com"
                  />
                  <button
                    type="button"
                    className="story-link-apply-btn"
                    onClick={handleInsertLink}
                  >
                    Insert Link
                  </button>
                  <button
                    type="button"
                    className="story-link-cancel-btn"
                    onClick={() => setShowLinkInput(false)}
                  >
                    Cancel
                  </button>
                </div>
              )}

              {showYoutubeInput && (
                <div className="story-link-bar story-youtube-bar">
                  <input
                    type="url"
                    className="story-link-input"
                    value={youtubeUrlDraft}
                    onChange={(e) => setYoutubeUrlDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleInsertYoutube(e);
                      }
                    }}
                    placeholder="Paste YouTube URL (e.g., https://www.youtube.com/watch?v=... or https://youtu.be/...)"
                    autoFocus
                  />
                  <button
                    type="button"
                    className="story-link-apply-btn story-youtube-apply-btn"
                    onClick={handleInsertYoutube}
                  >
                    ▶️ Embed Video
                  </button>
                  <button
                    type="button"
                    className="story-link-cancel-btn"
                    onClick={() => {
                      setShowYoutubeInput(false);
                      setYoutubeUrlDraft('');
                    }}
                  >
                    Cancel
                  </button>
                </div>
              )}

              <div
                ref={editorRef}
                className="story-richtext-canvas"
                contentEditable={!isSubmitting}
                suppressContentEditableWarning
                onInput={syncEditorState}
                onKeyUp={saveSelection}
                onMouseUp={saveSelection}
                onBlur={saveSelection}
                aria-label="Story rich text body"
              />
            </div>
          </div>

          {/* 4. Excerpt / Summary */}
          <div className="story-editor-field">
            <div className="story-editor-label-row">
              <label htmlFor="story-excerpt-input" className="story-editor-label">
                4. Short Excerpt / Social Preview Summary
              </label>
              <button
                type="button"
                className="story-auto-excerpt-btn"
                onClick={handleAutoExcerpt}
                disabled={isSubmitting}
              >
                ✨ Auto-Fill from Opening Paragraph
              </button>
            </div>
            <textarea
              id="story-excerpt-input"
              className="story-editor-textarea"
              rows={2}
              maxLength={320}
              value={excerpt}
              onChange={(e) => setExcerpt(e.target.value)}
              placeholder="Optional — leave blank to auto-generate from your opening paragraph for story cards and Open Graph social previews."
              disabled={isSubmitting}
            />
            <span className="story-editor-char-count">{excerpt.length} / 320 characters</span>
          </div>

          {/* Actions */}
          <footer className="story-editor-footer">
            <button
              type="button"
              className="story-editor-cancel-btn"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </button>

            <div className="story-editor-submit-group">
              <button
                type="button"
                className="story-editor-draft-btn"
                onClick={() => handleSubmit('draft')}
                disabled={isSubmitting || isUploadingCover || isUploadingInline}
              >
                {isSubmitting ? 'Saving...' : '🔒 Save as Draft'}
              </button>
              <button
                type="button"
                className="story-editor-publish-btn"
                onClick={() => handleSubmit('published')}
                disabled={isSubmitting || isUploadingCover || isUploadingInline}
              >
                {isSubmitting
                  ? 'Publishing...'
                  : isEditing
                    ? '✓ Save & Publish Story'
                    : '🚀 Publish Story'}
              </button>
            </div>
          </footer>
        </div>
      </div>
    </div>
  );
};

const StoryEditorModal = ({ isOpen, onClose, recipe, initialStory = null, onSaved }) => {
  if (!isOpen) return null;
  const modalKey = `${initialStory?.id || 'new'}-${recipe?.id || initialStory?.recipeId || 0}`;
  return (
    <StoryEditorInner
      key={modalKey}
      recipe={recipe}
      initialStory={initialStory}
      onClose={onClose}
      onSaved={onSaved}
    />
  );
};

export default StoryEditorModal;
