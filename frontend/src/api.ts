const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:8000') + '/api';

interface CacheEntry {
  response: Response;
  timestamp: number;
}

const GET_CACHE_TTL_MS = 20000; // 20 seconds in-memory cache for ultra-fast routing
const getCache = new Map<string, CacheEntry>();
const inFlightRequests = new Map<string, Promise<Response>>();

/**
 * Invalidate cached GET responses.
 * @param filterPattern Optional substring to invalidate specific endpoints (e.g. '/evidence/67')
 */
export function invalidateApiCache(filterPattern?: string) {
  if (!filterPattern) {
    getCache.clear();
  } else {
    for (const key of getCache.keys()) {
      if (key.includes(filterPattern)) {
        getCache.delete(key);
      }
    }
  }
}

/**
 * Pre-warm the in-memory cache for an endpoint in the background on hover.
 */
export function prefetchApi(endpoint: string, options: RequestInit = {}): void {
  fetchApi(endpoint, options).catch(() => {});
}

export async function fetchApi(endpoint: string, options: RequestInit = {}, timeoutMs = 15000): Promise<Response> {
  const method = (options.method || 'GET').toUpperCase();
  const isGet = method === 'GET';
  const isJobPoll = endpoint.includes('/jobs/');
  const isNoStore = options.cache === 'no-store' || (options as any).bypassCache || isJobPoll;

  // Invalidate cache on write operations
  if (!isGet) {
    invalidateApiCache();
  }

  const cacheKey = `${endpoint}_${options.headers ? JSON.stringify(options.headers) : ''}`;
  if (isGet && !isNoStore) {
    const cached = getCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < GET_CACHE_TTL_MS) {
      return cached.response.clone();
    }
    if (inFlightRequests.has(cacheKey)) {
      const inFlight = inFlightRequests.get(cacheKey)!;
      const res = await inFlight;
      return res.clone();
    }
  }

  const token = localStorage.getItem('token');
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
  const abortFromCaller = () => controller.abort(options.signal?.reason);

  if (options.signal?.aborted) {
    abortFromCaller();
  } else {
    options.signal?.addEventListener('abort', abortFromCaller, { once: true });
  }
  
  const headers = new Headers(options.headers || {});
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  const executeFetch = async (): Promise<Response> => {
    let response: Response;
    try {
      response = await fetch(`${API_BASE}${endpoint}`, {
        ...options,
        headers,
        signal: controller.signal,
      });
    } catch (error) {
      if (controller.signal.aborted && !options.signal?.aborted) {
        throw new Error(`The request timed out after ${Math.ceil(timeoutMs / 1000)} seconds. Retry when the service is available.`);
      }
      if (error instanceof TypeError) {
        throw new Error('Cannot reach the ForenSight API. Check that the backend is running, then retry.');
      }
      throw error;
    } finally {
      window.clearTimeout(timeoutId);
      options.signal?.removeEventListener('abort', abortFromCaller);
      if (isGet) {
        inFlightRequests.delete(cacheKey);
      }
    }

    if (response.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }

    if (isGet && response.ok && !isNoStore) {
      getCache.set(cacheKey, {
        response: response.clone(),
        timestamp: Date.now(),
      });
    }

    return response;
  };

  if (isGet && !isNoStore) {
    const promise = executeFetch();
    inFlightRequests.set(cacheKey, promise);
    const res = await promise;
    return res.clone();
  }

  return executeFetch();
}
