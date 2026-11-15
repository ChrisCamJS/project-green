import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import styles from './Login.module.css';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';

const Login = () => {
    // Grabbing the login dispatcher from AuthContext
    const { login } = useAuth();
    
    // State to hold user input (trimmed down to just what the form actually uses)
    const [credentials, setCredentials] = useState({ email: '', password: '' });
    
    // State for catching and displaying validation or server errors
    const [error, setError] = useState('');
    const [unverifiedEmail, setUnverifiedEmail] = useState('');
    const [resendBusy, setResendBusy] = useState(false);
    const [resendMsg, setResendMsg] = useState('');

    // Navigation hook to redirect the user after a successful vault unlock
    const navigate = useNavigate();

    // Handler to update local state dynamically as the user types
    const handleChange = (e) => {
        const { name, value } = e.target;
        setCredentials(prev => ({ ...prev, [name]: value }));
    };

    // Handle click submission for the login form
    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setUnverifiedEmail('');
        setResendMsg('');

        // Basic front-end validation check
        if (!credentials.email || !credentials.password) {
            setError("Both fields are required.");
            return;
        }

        try {
            // Send credentials to the PHP backend via our api wrapper
            const response = await api.login(credentials);

            if (response.success) {
                // Save user data to context
                login(response.user);
                
                const isAdmin = response.user.is_admin === 1 || response.user.is_admin === '1' || response.user.is_admin === true;
                const identifier = response.user.username;
                
                alert(isAdmin 
                    ? `Welcome back, ${identifier} => You're wielding Admin privileges!` 
                    : `Welcome back to the vault, ${identifier}!`
                );
                
                navigate(isAdmin ? '/admin' : '/');
            } else {
                setError(response.message || 'Login failed.');
            }
        } catch (err) {
            const msg = err.message || 'Login failed. Are you entirely sure you belong in the vault?';
            setError(msg);
            if (msg.toLowerCase().includes('verify your email')) {
                setUnverifiedEmail(credentials.email.trim());
            }
            console.error('Login error:', err);
        }
    };

    const handleResendVerification = async () => {
        if (!unverifiedEmail || resendBusy) return;
        setResendBusy(true);
        setResendMsg('');
        try {
            const res = await api.resendVerification(unverifiedEmail);
            setResendMsg(res.message || 'Verification email resent!');
        } catch (err) {
            setError(err.message || 'Failed to resend verification email.');
        } finally {
            setResendBusy(false);
        }
    };

    return (
        <div className={styles.loginContainer}>
            <div className={styles.loginCard}>
                <h2>Vault Access</h2>
                <p>Authorized personnel only.</p>
                
                {/* Conditionally render error messages if they pop up */}
                {error && <div className={styles.errorMessage}>{error}</div>}
                {resendMsg && <div className={styles.successMessage}>{resendMsg}</div>}
                {unverifiedEmail && (
                    <button
                        type="button"
                        onClick={handleResendVerification}
                        disabled={resendBusy}
                        className={styles.loginButton}
                        style={{ marginBottom: '1rem' }}
                    >
                        {resendBusy ? 'Sending...' : 'Resend Verification Email'}
                    </button>
                )}

                <form onSubmit={handleSubmit} className={styles.loginForm}>
                    <div className={styles.formGroup}>
                        <label htmlFor="email">Email</label>
                        <input 
                            type="text" 
                            id="email"
                            name="email" 
                            value={credentials.email}
                            onChange={handleChange}
                            placeholder="Enter your email address"
                        />
                    </div>

                    <div className={styles.formGroup}>
                        <label htmlFor="password">Password</label>
                        <input 
                            type="password" 
                            id="password"
                            name="password" 
                            value={credentials.password}
                            onChange={handleChange}
                            placeholder="Enter your password"
                        />
                    </div>

                    <button type="submit" className={styles.loginBtn}>
                        Unlock Vault
                    </button>
                    <p className={styles.toggleText} style={{ marginTop: '14px', marginBottom: '6px' }}>
                        Got a beta invite code? <span onClick={() => navigate('/register')}>Register here</span>.
                    </p>
                    <p className={styles.toggleText} style={{ marginTop: '4px', marginBottom: 0 }}>
                        Forgot your password? <span onClick={() => navigate('/forgot-password')}>Reset it here</span>.
                    </p>
                </form>
            </div>
        </div>
    );
};

export default Login;