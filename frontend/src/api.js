import axios from 'axios';

// Create axios instance with base URL
// Use custom domain for API
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'https://api.jobhubpro.com',
  timeout: 60000, // 60 second timeout for large PDF uploads
  maxContentLength: 100 * 1024 * 1024, // 100MB
  maxBodyLength: 100 * 1024 * 1024, // 100MB
});

// Add auth token to all requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle 401 responses (token expired)
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('isAdmin');
      // Optionally redirect to login
      if (globalThis.location.pathname !== '/login' && globalThis.location.pathname !== '/signup') {
        globalThis.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default api;
