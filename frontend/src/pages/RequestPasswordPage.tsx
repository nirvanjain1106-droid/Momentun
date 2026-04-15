import { Link } from 'react-router-dom';
import classes from './Auth.module.css';

export default function RequestPasswordPage() {
  return (
    <div className={classes.authContainer}>
      <div className={`glass-panel ${classes.authCard}`}>
        <div className={classes.header}>
          <h1>Reset Password</h1>
          <p>Enter your email to receive a reset link.</p>
        </div>
        <div style={{ textAlign: 'center', marginTop: '1rem' }}>
          <p className={classes.footerText}>
            <Link to="/login">Back to Login</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
