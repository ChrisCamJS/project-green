// src/components/AdminEmmaContextPanel.jsx
import React, { useState, useEffect, useRef } from 'react';
import { api } from '../services/api';
import { useToast } from '../context/ToastContext';
import { parseReferenceFile } from '../utils/referenceDocument';
import './AdminEmmaContextPanel.css';

const ACCEPTED_CONTEXT_EXTENSIONS =
  '.txt,.md,.markdown,.csv,.json,.html,.htm,.xml,.rtf,.docx,.pdf';

export default function AdminEmmaContextPanel() {
  const { addToast } = useToast();
  const fileInputRef = useRef(null);

  const [loading, setLoading] = useState(true);
  const [parsingFile, setParsingFile] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [fileName, setFileName] = useState('');
  const [contextText, setContextText] = useState('');
  const [savedMeta, setSavedMeta] = useState(null);
  const [statusMsg, setStatusMsg] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    api
      .getAdminEmmaContext()
      .then((res) => {
        if (!active) return;
        const ctx = res?.context || null;
        if (ctx) {
          setFileName(ctx.file_name || '');
          setContextText(ctx.context_text || '');
          setSavedMeta({
            fileName: ctx.file_name || 'Manual / Custom Context',
            charCount: ctx.char_count || (ctx.context_text || '').length,
            updatedAt: ctx.updated_at || null,
          });
        } else {
          setSavedMeta(null);
        }
      })
      .catch((err) => {
        if (!active) return;
        setErrorMsg(err?.message || 'Could not load saved admin context.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const handleFileSelected = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setParsingFile(true);
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      const parsed = await parseReferenceFile(file);
      let extractedText = '';

      if (parsed.kind === 'text') {
        extractedText = parsed.textContent || '';
      } else if (parsed.kind === 'inlineData' && parsed.mimeType === 'application/pdf') {
        setStatusMsg(`Extracting text from PDF "${file.name}" so Emma can use it in both chat and live audio...`);
        const aiRes = await api.aiChat(
          [
            {
              role: 'user',
              parts: [
                { inlineData: parsed.inlineData },
                {
                  text: 'Extract and transcribe all readable text from this attached document faithfully as plain text or Markdown, without summarizing or adding commentary.',
                },
              ],
            },
          ],
          null
        );
        extractedText = String(aiRes?.text || '').trim();
      } else {
        throw new Error(
          'Please upload a document file (.txt, .md, .docx, .pdf, .csv, .json, .rtf, or .html).'
        );
      }

      if (!extractedText.trim()) {
        throw new Error(`No readable text could be extracted from "${file.name}".`);
      }

      setFileName(file.name);
      setContextText(extractedText);
      setStatusMsg(
        `Loaded "${file.name}" (${extractedText.length.toLocaleString()} chars). Review below and click Save Context.`
      );
    } catch (err) {
      setErrorMsg(err?.message || 'Could not read document.');
    } finally {
      setParsingFile(false);
    }
  };

  const handleSave = async (e) => {
    e?.preventDefault();
    const trimmed = contextText.trim();
    if (!trimmed) {
      setErrorMsg('Please upload a document or enter context text before saving.');
      return;
    }

    setSaving(true);
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      const res = await api.saveAdminEmmaContext({
        file_name: fileName.trim() || 'Admin Context Document',
        context_text: trimmed,
      });
      if (res?.success) {
        const ctx = res.context || {};
        setSavedMeta({
          fileName: ctx.file_name || fileName.trim() || 'Admin Context Document',
          charCount: ctx.char_count || trimmed.length,
          updatedAt: ctx.updated_at || new Date().toISOString(),
        });
        setStatusMsg(
          'Saved! Emma will now include this context whenever speaking with you in any text chat or live audio session.'
        );
        addToast("Emma's admin context document saved!", 'success');
      }
    } catch (err) {
      const msg = err?.message || 'Failed to save admin context document.';
      setErrorMsg(msg);
      addToast(msg, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm("Remove your saved Emma background context document? You can always upload another one later.")) {
      return;
    }

    setDeleting(true);
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      const res = await api.deleteAdminEmmaContext();
      if (res?.success) {
        setFileName('');
        setContextText('');
        setSavedMeta(null);
        setStatusMsg('Removed saved admin context document.');
        addToast('Admin context document removed.', 'success');
      }
    } catch (err) {
      const msg = err?.message || 'Failed to remove admin context document.';
      setErrorMsg(msg);
      addToast(msg, 'error');
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <section className="admin-context-panel">
        <p className="admin-context-loading">Loading Emma admin context settings...</p>
      </section>
    );
  }

  return (
    <section className="admin-context-panel">
      <div className="admin-context-header">
        <div>
          <h3>🧠 Emma Personal Context Document (Admin Only)</h3>
          <p className="admin-context-subtitle">
            Upload a document (biography, podcast notes, health &amp; style preferences, brand background, or anything else Emma should know about you). When you chat with Emma or start Live Audio anywhere on The Veggie Vault, Emma automatically receives this confidential context — without exposing it to other users or embedding private notes in public recipes.
          </p>
        </div>

        {savedMeta ? (
          <span className="admin-context-badge active">
            ✅ Active · {savedMeta.charCount.toLocaleString()} chars
          </span>
        ) : (
          <span className="admin-context-badge empty">No Context Saved</span>
        )}
      </div>

      {savedMeta && (
        <div className="admin-context-meta-bar">
          <span>
            <strong>Document:</strong> {savedMeta.fileName}
          </span>
          {savedMeta.updatedAt && (
            <span>
              <strong>Last updated:</strong> {new Date(savedMeta.updatedAt).toLocaleString()}
            </span>
          )}
        </div>
      )}

      <div className="admin-context-upload-row">
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_CONTEXT_EXTENSIONS}
          onChange={handleFileSelected}
          hidden
        />
        <button
          type="button"
          className="admin-context-upload-btn"
          onClick={() => fileInputRef.current?.click()}
          disabled={parsingFile || saving || deleting}
        >
          {parsingFile ? '⏳ Reading Document...' : '📄 Upload Context Document'}
        </button>
        <span className="admin-context-formats">
          Supports .txt, .md, .docx, .pdf, .csv, .json, .rtf, .html (up to 100,000 chars)
        </span>
      </div>

      {errorMsg && (
        <div className="admin-context-alert error" role="alert">
          {errorMsg}
        </div>
      )}

      {statusMsg && (
        <div className="admin-context-alert success" role="status">
          {statusMsg}
        </div>
      )}

      <form onSubmit={handleSave} className="admin-context-form">
        <div className="admin-context-field">
          <label htmlFor="admin-context-filename">Document Label / File Name</label>
          <input
            id="admin-context-filename"
            type="text"
            value={fileName}
            onChange={(e) => setFileName(e.target.value)}
            placeholder="e.g. Chris_Bio_and_Vault_Notes.md"
            maxLength={255}
            disabled={parsingFile || saving || deleting}
          />
        </div>

        <div className="admin-context-field">
          <div className="admin-context-label-row">
            <label htmlFor="admin-context-textarea">Context Sent to Emma (Editable)</label>
            <span className="admin-context-char-count">
              {contextText.trim().length.toLocaleString()} / 100,000 characters
            </span>
          </div>
          <textarea
            id="admin-context-textarea"
            rows={12}
            value={contextText}
            onChange={(e) => setContextText(e.target.value)}
            placeholder="Upload a document above or paste background notes about yourself, podcast/show context, personal health notes, recurring preferences, etc..."
            disabled={parsingFile || saving || deleting}
          />
        </div>

        <div className="admin-context-actions">
          <button
            type="submit"
            className="admin-context-save-btn"
            disabled={parsingFile || saving || deleting || !contextText.trim()}
          >
            {saving ? 'Saving...' : '💾 Save Context'}
          </button>

          {(savedMeta || contextText.trim()) && (
            <button
              type="button"
              className="admin-context-delete-btn"
              onClick={handleDelete}
              disabled={parsingFile || saving || deleting}
            >
              {deleting ? 'Removing...' : '🗑️ Remove Context'}
            </button>
          )}
        </div>
      </form>
    </section>
  );
}
