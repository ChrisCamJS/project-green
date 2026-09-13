import React, {useState} from 'react';
import {useNavigate} from 'react-router-dom';
import styles from './Login.module.css';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';




const Login = () => {
    //grabbing login from AuthContext
    const { login } = useAuth();
    // state to hold user input
    const [credentials, setCredentials] = useState({username: '', password: '', is_admin: false});
    // state for errors
    const [error, setError] = useState('');

    // to redirect the user after a successful login
    const navigate = useNavigate();

    // handler to update state as the user types
    const handleChange = (e) => {
        const {name, value} = e.target;
        setCredentials(prev => ({...prev, [name]: value}));
    }

    // handle click for the submit button
    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');

        // basic validation
        if (!credentials.username || !credentials.password) {
            setError("Both Fields Are Required");
            return;
        }
        try {
            
            const response = await api.login(credentials);

            if (response.success) {
                // console.log(response);
                login(response.user);
                const isAdmin = response.user.is_admin;
                alert(isAdmin === 1 ? `Welcome Back ${response.user.email} => You're an Admin!` : `Welcome Back ${response.user.email}`);
                navigate('/admin');
            }
            else {
                setError(response.message || 'Login failed Homie.');
            }
        }
        catch (err) {
            setError('Login failed. Are you sure you belong in the Vault?');
            console.error('Login error:', err);
        }
    }

    return (
        <div className={styles.loginContainer}>
            <div className={styles.loginCard}>
                <h2>Vault Access</h2>
                <p>Authorized personnel only.</p>
                
                {/* Display errors if we catch any */}
                {error && <div className={styles.errorMessage}>{error}</div>}

                <form onSubmit={handleSubmit} className={styles.loginForm}>
                    <div className={styles.formGroup}>
                        <label htmlFor="username">Username</label>
                        <input 
                            type="text" 
                            id="username"
                            name="username" 
                            value={credentials.username}
                            onChange={handleChange}
                            placeholder="Enter your username"
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
    )
}

export default Login;