import { Link } from 'react-router-dom';
import classes from './Auth.module.css';

export default function ResetPasswordPage() {
  return (
    <div className={classes.authContainer}>
      <div className={`surface-card ${classes.authCard}`}>
        <div className={classes.header}>
          <h1>Set New Password</h1>
          <p>Enter your new password below.</p>
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
