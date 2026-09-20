import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import styles from './Login.module.css';

export default function ResetPassword() {
    const [password, setPassword] = useState('');
    const [message, setMessage] = useState(null);
    const [error, setError] = useState(null);
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();

    const token = searchParams.get('token');

    const handleReset = async (e) => {
        e.preventDefault();
        
        try {
            const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/users/reset-password`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token, password })
            });
            const data = await response.json();
            
            if (!response.ok) throw new Error(data.message);
            
            setMessage(data.message);
            setTimeout(() => navigate('/login'), 2000);
        } catch (err) {
            setError(err.message);
        }
    };

    if (!token) return <div className={styles.loginCard}><h2>Error: No reset token provided in the URL.</h2></div>;

    return (
        <div className={styles.loginContainer}>
            <div className={styles.loginCard}>
                <h2>Set New Password</h2>
                <p style={{ textAlign: 'center', marginBottom: '1.5rem', color: '#666' }}>
                    Make it a good one this time, yeah?
                </p>

                {error && <p className={styles.errorMessage}>{error}</p>}
                {message && <p className={styles.successMessage}>{message}</p>}
                
                <form onSubmit={handleReset}>
                    <div className={styles.inputGroup}>
                        <label>New Password</label>
                        <input 
                            type="password" 
                            value={password} 
                            onChange={(e) => setPassword(e.target.value)} 
                            required 
                        />
                    </div>
                    <button type="submit" className={styles.loginButton}>Save Password</button>
                </form>

                {/* Here is your brand new hover-ready back link! */}
                <p className={styles.toggleText} style={{ marginTop: '1.5rem' }}>
                    Changed your mind? <span onClick={() => navigate('/login')}>Back to Login</span>.
                </p>
            </div>
        </div>
    );
}