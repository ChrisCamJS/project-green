import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import styles from './Login.module.css'; // Borrowing the login styles to keep things tidy!

export default function Register() {
    const [email, setEmail] = useState('');
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [inviteCode, setInviteCode] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState(null);
    const [successMsg, setSuccessMsg] = useState(null);

    const navigate = useNavigate();

    // Bring in your login function from the global context
    const { login } = useAuth();

    // Password strength checks
    const passwordChecks = {
        minLength: password.length >= 8,
        mixedCase: /[a-z]/.test(password) && /[A-Z]/.test(password),
        hasNumber: /\d/.test(password),
        hasSpecial: /[^A-Za-z0-9]/.test(password),
    };

    const passedCount = Object.values(passwordChecks).filter(Boolean).length;
    const strengthMeta = [
        { label: 'Too short', color: '#e03a3e', width: '15%' },
        { label: 'Weak', color: '#e03a3e', width: '25%' },
        { label: 'Fair', color: '#d97706', width: '50%' },
        { label: 'Good', color: '#2563eb', width: '75%' },
        { label: 'Strong', color: '#16a34a', width: '100%' },
    ][passwordChecks.minLength ? passedCount : 0];

    const passwordsMatch = confirmPassword.length > 0 && password === confirmPassword;

    const handleRegister = async (e) => {
        e.preventDefault();
        setError(null);
        setSuccessMsg(null);

        if (!passwordChecks.minLength) {
            setError('Your password must be at least 8 characters long.');
            return;
        }

        if (password !== confirmPassword) {
            setError("Those passwords don't match, mate. Double-check them!");
            return;
        }

        setIsSubmitting(true);

        try {
            const data = await api.register({
                email: email.trim(),
                username: username.trim(),
                password,
                confirmPassword,
                inviteCode: inviteCode.trim(),
            });

            setSuccessMsg(data.message || "Brilliant! You're on the list. Rolling out the red carpet...");
            
            // Update the React app's global state so the navbar and protected routes know we are in!
            if (data.user) {
                login(data.user);
            }

            // Whisk them straight into the vault after a brief moment to read the success message
            setTimeout(() => navigate('/'), 1500);

        } catch (err) {
            setError(err.message || 'Registration failed.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className={styles.loginContainer}>
            <div className={styles.loginCard}>
                <h2>Veggie Vault Beta Access</h2>
                <p>Claim your golden ticket and set up your vault credentials.</p>
                {error && <div className={styles.errorMessage}>{error}</div>}
                {successMsg && <div className={styles.successMessage}>{successMsg}</div>}
                
                <form onSubmit={handleRegister} className={styles.loginForm}>
                    <div className={styles.formGroup}>
                        <label htmlFor="reg-email">Email Address</label>
                        <input 
                            id="reg-email"
                            type="email" 
                            value={email} 
                            onChange={(e) => setEmail(e.target.value)} 
                            placeholder="Enter your email address"
                            disabled={isSubmitting}
                            required 
                        />
                    </div>

                    <div className={styles.formGroup}>
                        <label htmlFor="reg-username">Public Username</label>
                        <input 
                            id="reg-username"
                            type="text" 
                            value={username} 
                            onChange={(e) => setUsername(e.target.value)} 
                            placeholder="Choose a public username"
                            disabled={isSubmitting}
                            required 
                        />
                    </div>

                    <div className={styles.formGroup}>
                        <label htmlFor="reg-password">Set Password</label>
                        <div className={styles.passwordWrapper}>
                            <input 
                                id="reg-password"
                                type={showPassword ? 'text' : 'password'} 
                                value={password} 
                                onChange={(e) => setPassword(e.target.value)} 
                                placeholder="At least 8 characters"
                                disabled={isSubmitting}
                                required 
                            />
                            <button
                                type="button"
                                className={styles.passwordToggle}
                                onClick={() => setShowPassword((prev) => !prev)}
                                aria-label={showPassword ? 'Hide password' : 'Show password'}
                            >
                                {showPassword ? 'Hide' : 'Show'}
                            </button>
                        </div>

                        {password.length > 0 && (
                            <div className={styles.strengthContainer}>
                                <div className={styles.strengthBarTrack}>
                                    <div
                                        className={styles.strengthBarFill}
                                        style={{
                                            width: strengthMeta.width,
                                            backgroundColor: strengthMeta.color,
                                        }}
                                    />
                                </div>
                                <div className={styles.strengthMeta}>
                                    <span>Password strength:</span>
                                    <strong style={{ color: strengthMeta.color }}>{strengthMeta.label}</strong>
                                </div>
                                <ul className={styles.passwordChecklist}>
                                    <li className={passwordChecks.minLength ? styles.checkPassed : styles.checkPending}>
                                        {passwordChecks.minLength ? '✓' : '○'} 8+ characters
                                    </li>
                                    <li className={passwordChecks.mixedCase ? styles.checkPassed : styles.checkPending}>
                                        {passwordChecks.mixedCase ? '✓' : '○'} Upper &amp; lowercase
                                    </li>
                                    <li className={passwordChecks.hasNumber ? styles.checkPassed : styles.checkPending}>
                                        {passwordChecks.hasNumber ? '✓' : '○'} Number
                                    </li>
                                    <li className={passwordChecks.hasSpecial ? styles.checkPassed : styles.checkPending}>
                                        {passwordChecks.hasSpecial ? '✓' : '○'} Symbol
                                    </li>
                                </ul>
                            </div>
                        )}
                    </div>

                    <div className={styles.formGroup}>
                        <label htmlFor="reg-confirm-password">Confirm Password</label>
                        <div className={styles.passwordWrapper}>
                            <input 
                                id="reg-confirm-password"
                                type={showConfirmPassword ? 'text' : 'password'} 
                                value={confirmPassword} 
                                onChange={(e) => setConfirmPassword(e.target.value)} 
                                placeholder="Re-enter your password"
                                disabled={isSubmitting}
                                required 
                            />
                            <button
                                type="button"
                                className={styles.passwordToggle}
                                onClick={() => setShowConfirmPassword((prev) => !prev)}
                                aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                            >
                                {showConfirmPassword ? 'Hide' : 'Show'}
                            </button>
                        </div>
                        {confirmPassword.length > 0 && (
                            <div className={`${styles.matchFeedback} ${passwordsMatch ? styles.matchSuccess : styles.matchError}`}>
                                {passwordsMatch ? '✓ Passwords match' : '✗ Passwords do not match'}
                            </div>
                        )}
                    </div>

                    <div className={styles.formGroup}>
                        <label htmlFor="reg-invite-code">Beta Invite Code</label>
                        <input 
                            id="reg-invite-code"
                            type="text" 
                            value={inviteCode} 
                            onChange={(e) => setInviteCode(e.target.value)} 
                            placeholder="Enter your VIP invite code"
                            disabled={isSubmitting}
                            required 
                        />
                    </div>

                    <button type="submit" className={styles.loginBtn} disabled={isSubmitting}>
                        {isSubmitting ? 'Unlocking Beta Access...' : 'Join the Beta'}
                    </button>
                </form>
                <p className={styles.toggleText} style={{ marginTop: '15px', marginBottom: 0 }}>
                    Already have the golden ticket? <span onClick={() => navigate('/login')}>Log in here</span>.
                </p>
            </div>
        </div>
    );
}