import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { useUIStore } from '../stores/uiStore';
import { client, setAccessToken } from '../api/client';
import { getErrorMessage } from '../lib/errorUtils';
import classes from './Auth.module.css';
import { Loader2 } from 'lucide-react';

export default function RegisterPage() {
  const navigate = useNavigate();
  const { login } = useAuthStore();
  const { addToast } = useUIStore();
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await client.post('/auth/register', { 
        email, 
        password,
        name
      });
      
      const { user_id, onboarding_complete, access_token } = response.data;
      
      setAccessToken(access_token);
      login(user_id, name, onboarding_complete);
      
      navigate('/onboarding');
      addToast({
        type: 'success',
        message: 'Account created successfully! Let\'s get you set up.',
      });
    } catch (error: unknown) {
      addToast({
        type: 'error',
        message: getErrorMessage(error, 'Registration failed. Please try again.'),
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={classes.authContainer}>
      <div className={classes.decorativeOrb1} />
      <div className={classes.decorativeOrb2} />
      
      <div className={`surface-card ${classes.authCard}`}>
        <div className={classes.header}>
          <div className={classes.logoMark} />
          <h1>Create Account</h1>
          <p>Start mastering your time today.</p>
        </div>

        <form onSubmit={handleSubmit} className={classes.form}>
          <div className={classes.inputGroup}>
            <label htmlFor="name">Full Name</label>
            <input
              id="name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Alex Chen"
              className={classes.input}
            />
          </div>

          <div className={classes.inputGroup}>
            <label htmlFor="email">Email address</label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className={classes.input}
            />
          </div>

          <div className={classes.inputGroup}>
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              className={classes.input}
            />
          </div>

          <button type="submit" disabled={loading} className={classes.submitButton}>
            {loading ? <Loader2 className={classes.spin} size={20} /> : 'Create Account'}
          </button>
        </form>

        <p className={classes.footerText}>
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
