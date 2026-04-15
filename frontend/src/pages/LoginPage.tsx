import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { useUIStore } from '../stores/uiStore';
import { client, setAccessToken } from '../api/client';
import classes from './Auth.module.css';
import { Loader2 } from 'lucide-react';

export default function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuthStore();
  const { addToast } = useUIStore();
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await client.post('/auth/login', { email, password });
      const { user_id, onboarding_complete, access_token } = response.data;
      
      setAccessToken(access_token);
      login(user_id, '', onboarding_complete);
      
      if (onboarding_complete) {
        navigate('/dashboard');
      } else {
        navigate('/onboarding');
      }
    } catch (error: any) {
      addToast({
        type: 'error',
        message: error.response?.data?.detail || 'Login failed. Please check your credentials.',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={classes.authContainer}>
      <div className={classes.decorativeOrb1} />
      <div className={classes.decorativeOrb2} />
      
      <div className={`glass-panel ${classes.authCard}`}>
        <div className={classes.header}>
          <div className={classes.logoMark} />
          <h1>Welcome Back</h1>
          <p>Ready to build momentum?</p>
        </div>

        <form onSubmit={handleSubmit} className={classes.form}>
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
            <div className={classes.labelRow}>
              <label htmlFor="password">Password</label>
              <Link to="/request-password" className={classes.forgotLink}>
                Forgot password?
              </Link>
            </div>
            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className={classes.input}
            />
          </div>

          <button type="submit" disabled={loading} className={classes.submitButton}>
            {loading ? <Loader2 className={classes.spin} size={20} /> : 'Sign In'}
          </button>
        </form>

        <p className={classes.footerText}>
          Don't have an account? <Link to="/register">Create one</Link>
        </p>
      </div>
    </div>
  );
}
