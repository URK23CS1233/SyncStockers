import axios from 'axios';

export const API_BASE = 'http://localhost:5000/api';

const api = axios.create({ baseURL: API_BASE });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('sl_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response && err.response.status === 401) {
      localStorage.removeItem('sl_token');
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(err);
  }
);

// Pull the human-readable message out of any API error.
export function errMsg(err, fallback = 'Something went wrong') {
  return (err && err.response && err.response.data && (err.response.data.message || err.response.data.error)) || fallback;
}

export default api;
