import { get, set, del, keys } from 'idb-keyval';

const CACHE_PREFIX = 'momentum-offline-cache:';

export const idbCache = {
  /**
   * Saves data to IndexedDB with the given key.
   */
  async setItem<T>(key: string, value: T): Promise<void> {
    try {
      await set(`${CACHE_PREFIX}${key}`, value);
    } catch (error) {
      console.warn(`[idbCache] Failed to save key "${key}":`, error);
    }
  },

  /**
   * Retrieves data from IndexedDB for the given key.
   */
  async getItem<T>(key: string): Promise<T | undefined> {
    try {
      return await get<T>(`${CACHE_PREFIX}${key}`);
    } catch (error) {
      console.warn(`[idbCache] Failed to read key "${key}":`, error);
      return undefined;
    }
  },

  /**
   * Removes data from IndexedDB for the given key.
   */
  async removeItem(key: string): Promise<void> {
    try {
      await del(`${CACHE_PREFIX}${key}`);
    } catch (error) {
      console.warn(`[idbCache] Failed to remove key "${key}":`, error);
    }
  },

  /**
   * Clears all cache entries associated with the momentum app.
   */
  async clearAll(): Promise<void> {
    try {
      const allKeys = await keys();
      const cacheKeys = allKeys.filter(
        (k) => typeof k === 'string' && k.startsWith(CACHE_PREFIX)
      );
      await Promise.all(cacheKeys.map((k) => del(k)));
    } catch (error) {
      console.warn('[idbCache] Failed to clear offline cache:', error);
    }
  },
};
