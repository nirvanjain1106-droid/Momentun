import React, { useEffect, useState } from 'react';
import { AlertCircle, X } from 'lucide-react';
import { getDeadLetterQueue, clearDeadLetterQueue, retryDeadLetterQueue } from '../../lib/offlineQueue';

export const SyncFailedBanner: React.FC = () => {
  const [deadLetterCount, setDeadLetterCount] = useState(0);

  const checkQueue = async () => {
    const queue = await getDeadLetterQueue();
    setDeadLetterCount(queue.length);
  };

  useEffect(() => {
    // Wrap initial check in a microtask to avoid synchronous setState in effect body
    void Promise.resolve().then(() => checkQueue());

    const handleDeadLetter = () => {
      checkQueue();
    };

    window.addEventListener('sync-dead-letter', handleDeadLetter);
    return () => {
      window.removeEventListener('sync-dead-letter', handleDeadLetter);
    };
  }, []);

  const handleRetry = async () => {
    await retryDeadLetterQueue();
    setDeadLetterCount(0);
  };

  const handleDismiss = async () => {
    await clearDeadLetterQueue();
    setDeadLetterCount(0);
  };

  if (deadLetterCount === 0) return null;

  return (
    <div className="bg-red-50 dark:bg-red-900/30 border-l-4 border-red-500 p-4 mb-4 rounded shadow-sm flex items-center justify-between">
      <div className="flex items-center">
        <AlertCircle className="h-5 w-5 text-red-500 mr-3" />
        <p className="text-sm text-red-700 dark:text-red-200">
          <strong>Sync Failed:</strong> {deadLetterCount} action(s) could not be synced after multiple attempts.
        </p>
      </div>
      <div className="flex items-center space-x-2">
        <button 
          onClick={handleRetry} 
          className="text-sm font-medium text-red-700 hover:text-red-900 dark:text-red-200 dark:hover:text-white px-2 py-1 bg-red-100 hover:bg-red-200 dark:bg-red-800 dark:hover:bg-red-700 rounded transition-colors"
        >
          Retry
        </button>
        <button 
          onClick={handleDismiss} 
          className="text-red-500 hover:text-red-700 p-1"
          aria-label="Dismiss banner"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
};
