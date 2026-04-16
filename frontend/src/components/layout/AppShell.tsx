import type { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar.tsx';
import { BottomNav } from './BottomNav.tsx';
import { ModalController } from './ModalController.tsx';
import classes from './AppShell.module.css';
import { useAuthStore } from '../../stores/authStore';

interface AppShellProps {
  children: ReactNode;
}

export const AppShell = ({ children }: AppShellProps) => {
  const { userId } = useAuthStore();
  const location = useLocation();

  // If not logged in, or on onboarding, don't show the shell
  if (!userId || location.pathname.startsWith('/onboarding')) {
    return <>{children}</>;
  }

  return (
    <div className={classes.appContainer}>
      <ModalController />
      <Sidebar />
      <main className={`${classes.mainContent} no-scrollbar`}>
        {children}
      </main>
      <BottomNav />
    </div>
  );
};
