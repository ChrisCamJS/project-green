import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import styles from './Login.module.css'; // Borrowing the login styles to keep things tidy!

export default function Register() {
    const [email, setEmail] = useState('');
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [inviteCode, setInviteCode] = useState('');
    const [error, setError] = useState(null);
    const [successMsg, setSuccessMsg] = useState(null);

    const navigate = useNavigate();

    // Bring in your login function from the global context
    const { login } = useAuth();

    const handleRegister = async (e) => {
        e.preventDefault();
        setError(null);
        setSuccessMsg(null);

        try {
            const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, username, password, inviteCode })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || 'Registration failed.');
            }

            setSuccessMsg(data.message);
            
            // Update the React app's global state so the navbar and protected routes know we are in!
            if (data.user) {
                login(data.user);
            }

            // Whisk them straight into the vault after a brief moment to read the success message
            setTimeout(() => navigate('/'), 1500);

        } catch (err) {
            setError(err.message);
        }
    };

    return (
        <div className={styles.loginContainer}>
            <div className={styles.loginCard}>
                <h2>Veggie Vault Beta Access</h2>
                {error && <p className={styles.errorMessage}>{error}</p>}
                {successMsg && <p className={styles.successMessage}>{successMsg}</p>}
                
                <form onSubmit={handleRegister}>
                    <div className={styles.inputGroup}>
                        <label>Email Address</label>
                        <input 
                            type="email" 
                            value={email} 
                            onChange={(e) => setEmail(e.target.value)} 
                            required 
                        />
                    </div>
                    <div className={styles.inputGroup}>
                        <label>Public Username</label>
                        <input 
                            type="text" 
                            value={username} 
                            onChange={(e) => setUsername(e.target.value)} 
                            required 
                        />
                    </div>
                    <div className={styles.inputGroup}>
                        <label>Password</label>
                        <input 
                            type="password" 
                            value={password} 
                            onChange={(e) => setPassword(e.target.value)} 
                            required 
                        />
                    </div>
                    <div className={styles.inputGroup}>
                        <label>Beta Invite Code</label>
                        <input 
                            type="text" 
                            value={inviteCode} 
                            onChange={(e) => setInviteCode(e.target.value)} 
                            required 
                        />
                    </div>
                    <button type="submit" className={styles.loginButton}>Join the Beta</button>
                </form>
                <p className={styles.toggleText}>
                    Already have the golden ticket? <span onClick={() => navigate('/login')}>Log in here</span>.
                </p>
            </div>
        </div>
    );
}