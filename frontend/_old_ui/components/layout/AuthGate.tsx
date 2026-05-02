import { useEffect, useRef } from 'react';
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
  const hasRedirected = useRef(false);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  // Move ALL navigation into useEffect so React doesn't warn about
  // "Cannot update a component while rendering a different component"
  useEffect(() => {
    if (!isHydrated || isBootRefreshing) return;

    const publicPaths = ['/login', '/register', '/reset-password', '/request-password'];
    const isPublicPath = publicPaths.some(p => location.pathname.startsWith(p));
    const isRootPath = location.pathname === '/';

    // Unauthenticated user on a protected route → send to login
    if (!userId && !isPublicPath) {
      navigate('/login', { replace: true });
      return;
    }

    // Authenticated user on a public/root path → redirect to correct landing
    if (userId && (isPublicPath || isRootPath)) {
      navigate(onboardingComplete ? '/home' : '/onboarding', { replace: true });
      return;
    }

    // Authenticated but onboarding incomplete → force onboarding
    if (userId && !onboardingComplete && !location.pathname.startsWith('/onboarding')) {
      navigate('/onboarding', { replace: true });
      return;
    }

    // Authenticated with onboarding complete but still on /onboarding → go home
    if (userId && onboardingComplete && location.pathname.startsWith('/onboarding')) {
      navigate('/home', { replace: true });
      return;
    }

    hasRedirected.current = false;
  }, [isHydrated, isBootRefreshing, userId, onboardingComplete, location.pathname, navigate]);

  // Block rendering until hydration and boot refresh finish
  if (!isHydrated || isBootRefreshing) {
    return (
      <div className={classes.loaderContainer}>
        <div className={classes.spinner} />
        <p className={classes.loaderText}>Loading Momentum...</p>
      </div>
    );
  }

  // Render children (App routing)
  return <>{children}</>;
};
