import { useEffect } from 'react';
import { drainQueue } from '../lib/offlineQueue';

export function useOfflineSync() {
  useEffect(() => {
    const handleOnline = () => {
      drainQueue();
    };

    window.addEventListener('online', handleOnline);
    
    // Attempt drain on initial mount if online
    if (navigator.onLine) {
      drainQueue();
    }

    return () => {
      window.removeEventListener('online', handleOnline);
    };
  }, []);
}
