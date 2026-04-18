import posthog from 'posthog-js';

const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY;
const POSTHOG_HOST = import.meta.env.VITE_POSTHOG_HOST || 'https://us.i.posthog.com';

let isInitialized = false;
type AnalyticsProperties = Record<string, unknown>;

export const initAnalytics = () => {
    if (typeof window !== 'undefined' && POSTHOG_KEY && !isInitialized) {
        posthog.init(POSTHOG_KEY, {
            api_host: POSTHOG_HOST,
            loaded: () => {
                isInitialized = true;
            },
            // Disable automatic pageview tracking if doing SPA routing manually, 
            // but for typical React apps, 'always_send' or relying on posthog defaults is fine.
            capture_pageview: false 
        });
    }
};

export const analytics = {
    identify: (userId: string, properties?: AnalyticsProperties) => {
        if (isInitialized) {
            posthog.identify(userId, properties);
        }
    },
    
    track: (eventName: string, properties?: AnalyticsProperties) => {
        if (isInitialized) {
            posthog.capture(eventName, properties);
        }
    },
    
    reset: () => {
        if (isInitialized) {
            posthog.reset();
        }
    }
};
