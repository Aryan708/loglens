// Set VITE_API_URL (the ApiUrl output of `sam deploy`) to enable cloud mode.
// Without it the app runs fully in the browser, which is what the live demo uses.
export const API_URL = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');
export const CLOUD_ENABLED = API_URL.length > 0;
export const LOCAL_MAX_BYTES = 25 * 1024 * 1024;
