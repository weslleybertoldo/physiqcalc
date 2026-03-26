import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const SUPABASE_URL = "https://uxwpwdbbnlticxgtzcsb.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV4d3B3ZGJibmx0aWN4Z3R6Y3NiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM5NzE3OTcsImV4cCI6MjA4OTU0Nzc5N30.AFEAJgrzbirf_kgkO9Yt7LtVzFqpWkvOjdwxbm8fs2Q";

// Fetch com timeout e retry automático para todas as queries
function createResilientFetch(retries = 2, timeout = 15000) {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= retries; attempt++) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      try {
        const response = await fetch(input, {
          ...init,
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        // Não faz retry em erros de auth (401/403)
        if (response.status === 401 || response.status === 403) {
          return response;
        }

        // Retry em 5xx e 429 (rate limit)
        if (response.status >= 500 || response.status === 429) {
          if (attempt < retries) {
            const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
            await new Promise((r) => setTimeout(r, delay + Math.random() * 500));
            continue;
          }
        }

        return response;
      } catch (err) {
        clearTimeout(timeoutId);
        lastError = err as Error;

        if (attempt < retries && (err as Error).name !== "AbortError") {
          const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }
      }
    }

    throw lastError || new Error("Fetch failed after retries");
  };
}

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  global: {
    fetch: createResilientFetch(2, 15000),
  },
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  },
});
