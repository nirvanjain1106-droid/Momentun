import { useEffect } from 'react';
import { WifiOff } from 'lucide-react';
import { useUIStore } from '../../stores/uiStore';

export function OfflineBanner() {
  const isOffline = useUIStore(state => state.isOffline);
  const setOffline = useUIStore(state => state.setOffline);

  useEffect(() => {
    const handleOnline = () => setOffline(false);
    const handleOffline = () => setOffline(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [setOffline]);

  if (!isOffline) return null;

  return (
    <div className="bg-warning text-white px-4 py-2 text-sm font-medium flex items-center justify-center gap-2 transition-all fixed top-0 left-0 right-0 z-[200]">
      <WifiOff size={16} /> You are currently offline. Local changes will sync when reconnected.
    </div>
  );
}
