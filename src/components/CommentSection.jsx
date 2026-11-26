import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import UserHoverFollow from './UserHoverFollow';
import './CommentSection.css';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '');

const resolveCommentImageUrl = (url) => {
  if (!url) return '';
  if (/^https?:\/\//i.test(url) || url.startsWith('data:')) return url;
  return `${API_BASE_URL}${url.startsWith('/') ? '' : '/'}${url}`;
};

const decodeHtmlEntities = (text) => {
  if (!text || typeof document === 'undefined') return text || '';
  const el = document.createElement('textarea');
  el.innerHTML = text;
  return el.value;
};

const CommentForm = ({ recipeId, parentId = null, onCommentAdded, onCancel, currentUser }) => {
  const { user: authUser } = useAuth();
  const activeUser = currentUser || authUser;
  const [body, setBody] = useState('');
  const [image, setImage] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const textareaRef = useRef(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [body]);

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => setImage(reader.result);
    reader.readAsDataURL(file);
  };

  const [submitError, setSubmitError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!body.trim() || !activeUser) return;
    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const response = await api.addComment({
        recipe_id: recipeId,
        parent_id: parentId,
        body,
        image,
      });
      if (response.success) {
        setBody('');
        setImage(null);
        onCommentAdded();
        if (onCancel) onCancel(); // Close reply form if nested
      }
    } catch (error) {
      console.error('Failed to post comment:', error);
      setSubmitError(error?.message || 'Could not post comment. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form className="comment-form" onSubmit={handleSubmit}>
      <div className="commenting-as-bar">
        Commenting as <strong>@{activeUser?.username || 'Member'}</strong>
      </div>
      <textarea
        ref={textareaRef}
        placeholder={parentId ? 'Write a reply...' : 'Share your thoughts or variations...'}
        value={body}
        onChange={(e) => {
          setBody(e.target.value);
          if (submitError) setSubmitError(null);
        }}
        className="comment-textarea"
        required
      />
      {submitError && (
        <p
          className="comment-error-msg"
          role="alert"
          style={{
            color: '#b91c1c',
            backgroundColor: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: '6px',
            padding: '0.5rem 0.75rem',
            fontSize: '0.88rem',
            margin: '0.5rem 0 0',
          }}
        >
          {submitError}
        </p>
      )}
      <div className="comment-actions">
        <label className="image-upload-btn">
          📷 Attach Photo
          <input type="file" accept="image/*" onChange={handleImageUpload} hidden />
        </label>
        {image && <span className="image-preview-text">Image attached!</span>}
        <div className="button-group">
          {onCancel && <button type="button" onClick={onCancel} className="cancel-btn">Cancel</button>}
          <button type="submit" disabled={isSubmitting || !body.trim()} className="submit-btn">
            {isSubmitting ? 'Vaulting...' : 'Post'}
          </button>
        </div>
      </div>
    </form>
  );
};

const CommentThread = ({ comment, recipeId, recipeOwnerId, refreshComments, user }) => {
  const [isReplying, setIsReplying] = useState(false);
  const [hasVoted, setHasVoted] = useState(false); // Prevents spam-clicking visually
  const [isDeleting, setIsDeleting] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editBody, setEditBody] = useState('');
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [editError, setEditError] = useState(null);

  const isRecipeOwner = Boolean(user && recipeOwnerId && Number(user.id) === Number(recipeOwnerId));
  const isCommentAuthor = Boolean(user && comment.user_id && Number(user.id) === Number(comment.user_id));
  const isAdmin = Boolean(user && (Number(user.is_admin) === 1 || user.is_admin === true));
  const canEdit = isCommentAuthor;
  const canDelete = isRecipeOwner || isCommentAuthor || isAdmin;

  const handleVote = async (type) => {
    if (hasVoted) return;
    try {
      await api.voteComment(comment.id, type);
      setHasVoted(true);
      refreshComments();
    } catch (error) {
      console.error("Voting failed:", error);
    }
  };

  const handleDelete = async () => {
    if (isDeleting) return;
    const hasReplies = Array.isArray(comment.children) && comment.children.length > 0;
    const confirmMsg = hasReplies
      ? 'Delete this comment and its replies? This cannot be undone.'
      : 'Delete this comment? This cannot be undone.';
    if (!window.confirm(confirmMsg)) return;

    setIsDeleting(true);
    try {
      const res = await api.deleteComment(comment.id);
      if (res?.success) {
        refreshComments();
      }
    } catch (error) {
      console.error('Failed to delete comment:', error);
      alert(error?.message || 'Could not delete comment. Please try again.');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleStartEdit = () => {
    setEditBody(decodeHtmlEntities(comment.body || ''));
    setEditError(null);
    setIsReplying(false);
    setIsEditing(true);
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (!editBody.trim() || isSavingEdit) return;
    setIsSavingEdit(true);
    setEditError(null);
    try {
      const res = await api.updateComment(comment.id, editBody.trim());
      if (res?.success) {
        setIsEditing(false);
        refreshComments();
      }
    } catch (error) {
      console.error('Failed to update comment:', error);
      setEditError(error?.message || 'Could not update comment. Please try again.');
    } finally {
      setIsSavingEdit(false);
    }
  };

  return (
    <div className="comment-item">
      <div className="comment-header">
        {comment.user_id ? (
          <UserHoverFollow
            userId={comment.user_id}
            username={comment.author_name}
            profileLink={`/profile/${comment.user_id}`}
            className="comment-author comment-author-link"
          >
            {comment.author_name || 'Vault Guest'}
          </UserHoverFollow>
        ) : (
          <span className="comment-author">{comment.author_name || 'Vault Guest'}</span>
        )}
        <span className="comment-date">{new Date(comment.created_at).toLocaleDateString()}</span>
      </div>
      {isEditing ? (
        <form className="comment-edit-form" onSubmit={handleSaveEdit}>
          <textarea
            value={editBody}
            onChange={(e) => {
              setEditBody(e.target.value);
              if (editError) setEditError(null);
            }}
            className="comment-textarea"
            rows={3}
            required
          />
          {editError && (
            <p
              className="comment-error-msg"
              role="alert"
              style={{
                color: '#b91c1c',
                backgroundColor: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: '6px',
                padding: '0.5rem 0.75rem',
                fontSize: '0.88rem',
                margin: 0,
              }}
            >
              {editError}
            </p>
          )}
          <div className="comment-edit-actions">
            <button
              type="button"
              onClick={() => {
                setIsEditing(false);
                setEditError(null);
              }}
              className="cancel-btn"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSavingEdit || !editBody.trim()}
              className="submit-btn"
            >
              {isSavingEdit ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      ) : (
        <p className="comment-body">{decodeHtmlEntities(comment.body)}</p>
      )}
      
      {comment.image_url && (
        <img src={resolveCommentImageUrl(comment.image_url)} alt="Comment attachment" className="comment-image" />
      )}

      <div className="comment-footer">
        <span className="vote-count">👍 {comment.likes || 0}</span>
        <span className="vote-count">👎 {comment.dislikes || 0}</span>
        
        {/* Only show interactive buttons if logged in */}
        {user && (
          <>
            <button onClick={() => handleVote('like')} className="vote-btn">Like</button>
            <button onClick={() => handleVote('dislike')} className="vote-btn">Dislike</button>
            <button onClick={() => setIsReplying(!isReplying)} className="reply-btn">Reply</button>
            {canEdit && !isEditing && (
              <button
                type="button"
                onClick={handleStartEdit}
                className="edit-comment-btn"
              >
                Edit
              </button>
            )}
            {canDelete && (
              <button
                type="button"
                onClick={handleDelete}
                disabled={isDeleting}
                className="delete-comment-btn"
              >
                {isDeleting ? 'Deleting...' : 'Delete'}
              </button>
            )}
          </>
        )}
      </div>

      {isReplying && user && (
        <div className="reply-form-wrapper">
          <CommentForm 
            recipeId={recipeId} 
            parentId={comment.id} 
            onCommentAdded={refreshComments} 
            onCancel={() => setIsReplying(false)}
            currentUser={user} 
          />
        </div>
      )}

      {comment.children && comment.children.length > 0 && (
        <div className="comment-replies">
          {comment.children.map(child => (
            <CommentThread 
              key={child.id} 
              comment={child} 
              recipeId={recipeId} 
              recipeOwnerId={recipeOwnerId}
              refreshComments={refreshComments} 
              user={user} 
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default function CommentSection({ recipeId, recipeOwnerId = null }) {
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);

  // Pull your logged-in user from context
  const { user } = useAuth();

  const fetchComments = useCallback(async () => {
    try {
      const data = await api.getComments(recipeId);

      // Build a nested tree from the flat array
      const tree = [];
      const lookup = {};
      data.forEach((c) => {
        lookup[c.id] = { ...c, children: [] };
      });
      data.forEach((c) => {
        if (c.parent_id && lookup[c.parent_id]) {
          lookup[c.parent_id].children.push(lookup[c.id]);
        } else {
          tree.push(lookup[c.id]);
        }
      });

      setComments(tree);
    } catch (error) {
      console.error('Failed to fetch comments', error);
    } finally {
      setLoading(false);
    }
  }, [recipeId]);

  useEffect(() => {
    if (recipeId) fetchComments();
  }, [recipeId, fetchComments]);

  return (
    <div className="comment-section">
      <h3>Community Notes</h3>
      {user ? (
        <CommentForm recipeId={recipeId} onCommentAdded={fetchComments} currentUser={user} />
      ) : (
        <div className="login-prompt">
          <p>You must be <Link to="/login">logged in</Link> to join the conversation, darling.</p>
        </div>
      )}
      
      {loading ? (
        <p>Loading banter...</p>
      ) : comments.length > 0 ? (
        <div className="comments-list">
          {comments.map(comment => (
            <CommentThread 
              key={comment.id} 
              comment={comment} 
              recipeId={recipeId} 
              recipeOwnerId={recipeOwnerId}
              refreshComments={fetchComments} 
              user={user} 
            />
          ))}
        </div>
      ) : (
        <p className="no-comments">No comments posted. Log in to be the first!</p>
      )}
    </div>
  );
}
