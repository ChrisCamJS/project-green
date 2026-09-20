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
                
                const isAdmin = response.user.is_admin;
                const identifier = response.user.username;
                
                alert(isAdmin === 1 
                    ? `Welcome back, ${identifier} => You're wielding Admin privileges!` 
                    : `Welcome back to the vault, ${identifier}!`
                );
                
                navigate('/admin');
            } else {
                setError(response.message || 'Login failed.');
            }
        } catch (err) {
            setError('Login failed. Are you entirely sure you belong in the vault?');
            console.error('Login error:', err);
        }
    };

    return (
        <div className={styles.loginContainer}>
            <div className={styles.loginCard}>
                <h2>Vault Access</h2>
                <p>Authorized personnel only.</p>
                
                {/* Conditionally render error messages if they pop up */}
                {error && <div className={styles.errorMessage}>{error}</div>}

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
                </form>
            </div>
        </div>
    );
};

export default Login;