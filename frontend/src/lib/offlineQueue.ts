import { idbCache } from './idbCache';
import { client } from '../api/client';

export type QueuedAction = {
  id: string;
  task_id: string;
  type: 'update' | 'delete' | 'complete' | 'park' | 'undo';
  payload?: unknown;
  retryCount: number;
  nextRetryAt?: number; // timestamp in ms
  timestamp: string;
};

const QUEUE_KEY = 'pending_actions_queue';
export const DEAD_LETTER_KEY = 'dead_letter_queue';

const MAX_RETRIES = 10;
const BACKOFF_BASE_MS = 1000;
const BACKOFF_MAX_MS = 30000;
let isDraining = false;

type ConflictServerState = {
  task_status?: string;
  deleted_at?: string | null;
};

type SyncError = {
  response?: {
    status?: number;
    data?: {
      detail?: {
        server_state?: ConflictServerState;
      };
    };
  };
};

function asSyncError(error: unknown): SyncError | null {
  if (typeof error !== 'object' || error === null) {
    return null;
  }

  return error as SyncError;
}

export async function enqueueAction(action: Omit<QueuedAction, 'id' | 'retryCount' | 'timestamp'>) {
  const queue = await getQueue();
  queue.push({
    ...action,
    id: crypto.randomUUID(),
    retryCount: 0,
    timestamp: new Date().toISOString(),
  });
  await idbCache.setItem(QUEUE_KEY, queue);
  console.log(`[offlineQueue] Enqueued action: ${action.type}. Current queue size: ${queue.length}`);
  drainQueue(); // Attempt to sync immediately
}

export async function getQueue(): Promise<QueuedAction[]> {
  const q = await idbCache.getItem<QueuedAction[]>(QUEUE_KEY);
  return q || [];
}

export async function getDeadLetterQueue(): Promise<QueuedAction[]> {
  const q = await idbCache.getItem<QueuedAction[]>(DEAD_LETTER_KEY);
  return q || [];
}

export async function clearDeadLetterQueue() {
  await idbCache.setItem(DEAD_LETTER_KEY, []);
}

async function dequeue(id: string) {
  const q = await getQueue();
  await idbCache.setItem(QUEUE_KEY, q.filter(a => a.id !== id));
}

async function updateAction(action: QueuedAction) {
  const q = await getQueue();
  const idx = q.findIndex(a => a.id === action.id);
  if (idx > -1) {
    q[idx] = action;
    await idbCache.setItem(QUEUE_KEY, q);
  }
}

async function moveToDeadLetter(action: QueuedAction) {
  const dead = await getDeadLetterQueue();
  const payload =
    typeof action.payload === 'object' && action.payload !== null ? action.payload : {};

  dead.push({
    ...action,
    payload: { ...payload, reason: `Failed after ${MAX_RETRIES} retries` },
  });
  await idbCache.setItem(DEAD_LETTER_KEY, dead);
}

export async function retryDeadLetterQueue() {
  const dead = await getDeadLetterQueue();
  await clearDeadLetterQueue();
  for (const action of dead) {
    await enqueueAction({
      task_id: action.task_id,
      type: action.type,
      payload: action.payload,
    });
  }
}

// Status tracking to avoid double drain
export async function drainQueue() {
  if (!navigator.onLine) return;
  if (isDraining) return;
  
  isDraining = true;
  
  try {
    let hasMore = true;
    while (hasMore) {
      const actions = await getQueue();
      const now = Date.now();
      
      // Filter out items that are still in backoff
      const processable = actions.filter(a => !a.nextRetryAt || a.nextRetryAt <= now);
      
      if (processable.length === 0) {
        hasMore = false;
        break;
      }

      for (const action of processable) {
        const result = await attemptSync(action);
        
        if (result === 'success' || result === 'conflict_resolved') {
          await dequeue(action.id);
        } else if (result === 'retry') {
          action.retryCount++;
          if (action.retryCount >= MAX_RETRIES) {
            await moveToDeadLetter(action);
            await dequeue(action.id);
            window.dispatchEvent(new Event('sync-dead-letter'));
          } else {
            // Temporal Deferral: Calculate exponential backoff and set nextRetryAt
            const delay = Math.min(BACKOFF_BASE_MS * Math.pow(2, action.retryCount), BACKOFF_MAX_MS);
            action.nextRetryAt = Date.now() + delay;
            await updateAction(action);
          }
        }
      }
      
      // Check if new items were added while we were processing
      const freshQueue = await getQueue();
      const stashed = freshQueue.filter(a => !a.nextRetryAt || a.nextRetryAt <= Date.now());
      hasMore = stashed.length > 0;
    }
  } catch (error) {
    console.error('[offlineQueue] Drain failed:', error);
  } finally {
    isDraining = false;
  }
}

async function attemptSync(action: QueuedAction): Promise<'success' | 'retry' | 'conflict_resolved'> {
  try {
    if (action.type === 'complete') {
      await client.post(`/tasks/${action.task_id}/complete`, action.payload);
    } else if (action.type === 'park') {
      await client.post(`/tasks/${action.task_id}/park`, action.payload);
    } else if (action.type === 'undo') {
      await client.post(`/tasks/${action.task_id}/undo`);
    } else if (action.type === 'update') {
      await client.patch(`/tasks/${action.task_id}`, action.payload);
    } else if (action.type === 'delete') {
      await client.delete(`/tasks/${action.task_id}`);
    }
    return 'success';
  } catch (error: unknown) {
    const syncError = asSyncError(error);

    if (syncError?.response?.status === 409) {
      const serverState = syncError.response.data?.detail?.server_state;
      if (serverState) {
        return handleConflict(action, serverState) ? 'conflict_resolved' : 'retry';
      }
    }
    if (syncError?.response?.status === 404) {
      // Task already gone
      return 'conflict_resolved';
    }
    return 'retry';
  }
}

function handleConflict(localAction: QueuedAction, serverState: ConflictServerState): boolean {
  if (serverState.task_status === 'completed') {
    // completed wins
    return true; 
  }
  if (serverState.deleted_at || serverState.task_status === 'deleted') {
    // local action completed but server is deleted? -> completion discarded, true
    if (localAction.type === 'complete') return true; 
    return true;
  }
  // Other merges can be handled, but simple overwrites will do for this scope
  return true;
}
