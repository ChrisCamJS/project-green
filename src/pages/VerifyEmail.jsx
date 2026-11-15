import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import styles from './Login.module.css';

export default function VerifyEmail() {
    const [searchParams] = useSearchParams();
    const token = searchParams.get('token') || '';
    const navigate = useNavigate();
    const { login } = useAuth();

    const [status, setStatus] = useState(token ? 'verifying' : 'error');
    const [message, setMessage] = useState(
        token
            ? 'Verifying your email address...'
            : 'Missing verification token. Please use the link from your email.'
    );

    useEffect(() => {
        if (!token) return;
        let active = true;

        api.verifyEmail(token)
            .then((data) => {
                if (!active) return;
                setStatus('success');
                setMessage(data.message || 'Email verified! Welcome to The Veggie Vault.');
                if (data.user) {
                    login(data.user);
                }
                setTimeout(() => {
                    if (active) navigate('/');
                }, 1800);
            })
            .catch((err) => {
                if (!active) return;
                setStatus('error');
                setMessage(err.message || 'Verification failed or link has expired.');
            });

        return () => {
            active = false;
        };
    }, [token, login, navigate]);

    return (
        <div className={styles.loginContainer}>
            <div className={styles.loginCard}>
                <h2>Email Verification</h2>
                {status === 'verifying' && <p>{message}</p>}
                {status === 'success' && (
                    <div className={styles.successMessage}>
                        {message} Redirecting you to the Vault...
                    </div>
                )}
                {status === 'error' && (
                    <>
                        <div className={styles.errorMessage}>{message}</div>
                        <p style={{ marginTop: '1rem' }}>
                            <Link to="/login">Go to Login</Link> or{' '}
                            <Link to="/register">Register</Link>
                        </p>
                    </>
                )}
            </div>
        </div>
    );
}
