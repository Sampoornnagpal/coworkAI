import axios from 'axios';

const configApi = axios.create({
  baseURL: 'http://127.0.0.1:8001',
});

// Auth header is optional for backend, but we include it mirroring the main api.js pattern
configApi.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

configApi.interceptors.response.use(
  (response) => response,
  (error) => {
    // Standard error interceptor
    return Promise.reject(error);
  }
);

export default configApi;
