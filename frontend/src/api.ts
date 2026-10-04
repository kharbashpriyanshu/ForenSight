const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:8000') + '/api';

export async function fetchApi(endpoint: string, options: RequestInit = {}, timeoutMs = 15000) {
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
  }

  if (response.status === 401) {
    localStorage.removeItem('token');
    window.location.href = '/login';
  }

  return response;
}
