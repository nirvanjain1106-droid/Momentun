import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import classes from './AuthGate.module.css';

interface AuthGateProps {
  children: React.ReactNode;
}

export const AuthGate = ({ children }: AuthGateProps) => {
  const { isHydrated, isBootRefreshing, userId, onboardingComplete, hydrate } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  // 1. Block rendering until hydration and boot refresh finish
  if (!isHydrated || isBootRefreshing) {
    return (
      <div className={classes.loaderContainer}>
        <div className={classes.spinner} />
        <p className={classes.loaderText}>Loading Momentum...</p>
      </div>
    );
  }

  // 2. Unauthenticated user handling
  if (!userId) {
    const publicPaths = ['/login', '/register', '/reset-password', '/request-password'];
    if (!publicPaths.some(p => location.pathname.startsWith(p))) {
      // Not on a public path, redirect to login
      navigate('/login', { replace: true });
      return null;
    }
  }

  // 3. Authenticated user handling
  if (userId) {
    const isPublicPath = ['/login', '/register', '/'].includes(location.pathname);
    
    if (isPublicPath) {
      if (!onboardingComplete) {
        navigate('/onboarding', { replace: true });
      } else {
        navigate('/dashboard', { replace: true });
      }
      return null;
    }

    if (!onboardingComplete && !location.pathname.startsWith('/onboarding')) {
      navigate('/onboarding', { replace: true });
      return null;
    }

    if (onboardingComplete && location.pathname.startsWith('/onboarding')) {
      navigate('/dashboard', { replace: true });
      return null;
    }
  }

  // Render children (App routing)
  return <>{children}</>;
};
