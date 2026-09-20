import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import styles from './Login.module.css';

export default function ForgotPassword() {
    const [email, setEmail] = useState('');
    const [message, setMessage] = useState(null);
    const [error, setError] = useState(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError(null);
        setMessage(null);
        setIsSubmitting(true);

        try {
            const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/users/request-reset`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || 'Something went completely pear-shaped.');
            }

            // Show the success message and clear the input so they don't spam the button
            setMessage(data.message);
            setEmail('');

        } catch (err) {
            setError(err.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className={styles.loginContainer}>
            <div className={styles.loginCard}>
                <h2>Forgot Password?</h2>
                <p style={{ textAlign: 'center', marginBottom: '1.5rem', color: '#666' }}>
                    Memory acting up, love? Pop your email below and we'll dispatch a shiny new link to sort you out.
                </p>
                
                {error && <p className={styles.errorMessage}>{error}</p>}
                {message && <p className={styles.successMessage}>{message}</p>}
                
                <form onSubmit={handleSubmit}>
                    <div className={styles.inputGroup}>
                        <label>Email Address</label>
                        <input 
                            id='email'
                            type="email" 
                            value={email} 
                            onChange={(e) => setEmail(e.target.value)} 
                            required 
                            disabled={isSubmitting}
                        />
                    </div>
                    <button id='reset-btn' type="submit" className={styles.loginButton} disabled={isSubmitting}>
                        {isSubmitting ? 'Dispatching...' : 'Send Reset Link'}
                    </button>
                </form>
                
                <p className={styles.toggleText}>
                    Suddenly remembered it? <span onClick={() => navigate('/login')}>Back to Login</span>.
                </p>
            </div>
        </div>
    );
}