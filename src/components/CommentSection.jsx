import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import './CommentSection.css';

const CommentForm = ({ recipeId, parentId = null, onCommentAdded, onCancel }) => {
  const [authorName, setAuthorName] = useState('');
  const [body, setBody] = useState('');
  const [image, setImage] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => setImage(reader.result);
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!body.trim()) return;
    setIsSubmitting(true);

    try {
      const response = await api.addComment({
        recipe_id: recipeId,
        parent_id: parentId,
        author_name: authorName,
        body,
        image
      });
      if (response.success) {
        setBody('');
        setImage(null);
        setAuthorName('');
        onCommentAdded();
        if (onCancel) onCancel(); // Close reply form if nested
      }
    } catch (error) {
      console.error("Failed to post comment:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form className="comment-form" onSubmit={handleSubmit}>
      <input 
        type="text" 
        placeholder="Your Name (Optional)" 
        value={authorName}
        onChange={(e) => setAuthorName(e.target.value)}
        className="comment-input"
      />
      <textarea 
        placeholder={parentId ? "Write a reply..." : "Share your thoughts or variations..."}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        className="comment-textarea"
        required
      />
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

const CommentThread = ({ comment, recipeId, refreshComments }) => {
  const [isReplying, setIsReplying] = useState(false);
  const [hasVoted, setHasVoted] = useState(false); // Prevents spam-clicking visually

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

  return (
    <div className="comment-item">
      <div className="comment-header">
        <span className="comment-author">{comment.author_name || 'Vault Guest'}</span>
        <span className="comment-date">{new Date(comment.created_at).toLocaleDateString()}</span>
      </div>
      <p className="comment-body">{comment.body}</p>
      
      {comment.image_url && (
        <img src={`http://localhost/pantry-rebuild-api/public${comment.image_url}`} alt="Comment receipt" className="comment-image" />
      )}

      <div className="comment-footer">
        <button onClick={() => handleVote('like')} className="vote-btn">👍 {comment.likes || 0}</button>
        <button onClick={() => handleVote('dislike')} className="vote-btn">👎 {comment.dislikes || 0}</button>
        <button onClick={() => setIsReplying(!isReplying)} className="reply-btn">Reply</button>
      </div>

      {isReplying && (
        <div className="reply-form-wrapper">
          <CommentForm 
            recipeId={recipeId} 
            parentId={comment.id} 
            onCommentAdded={refreshComments} 
            onCancel={() => setIsReplying(false)} 
          />
        </div>
      )}

      {comment.children && comment.children.length > 0 && (
        <div className="comment-replies">
          {comment.children.map(child => (
            <CommentThread key={child.id} comment={child} recipeId={recipeId} refreshComments={refreshComments} />
          ))}
        </div>
      )}
    </div>
  );
};

export default function CommentSection({ recipeId }) {
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchComments = async () => {
    try {
      const data = await api.getComments(recipeId);
      
      // Build a nested tree from the flat array
      const tree = [];
      const lookup = {};
      data.forEach(c => lookup[c.id] = { ...c, children: [] });
      data.forEach(c => {
        if (c.parent_id && lookup[c.parent_id]) {
          lookup[c.parent_id].children.push(lookup[c.id]);
        } else {
          tree.push(lookup[c.id]);
        }
      });
      
      setComments(tree);
    } catch (error) {
      console.error("Failed to fetch comments", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (recipeId) fetchComments();
  }, [recipeId]);

  return (
    <div className="comment-section">
      <h3>Community Notes</h3>
      <CommentForm recipeId={recipeId} onCommentAdded={fetchComments} />
      
      {loading ? (
        <p>Loading banter...</p>
      ) : comments.length > 0 ? (
        <div className="comments-list">
          {comments.map(comment => (
            <CommentThread key={comment.id} comment={comment} recipeId={recipeId} refreshComments={fetchComments} />
          ))}
        </div>
      ) : (
        <p className="no-comments">No one has chimed in yet. Be the first to review this dish!</p>
      )}
    </div>
  );
}