import axios from 'axios';

// API Configuration
const API_BASE_URL = 'http://localhost:5000/api';

// Create axios instance
const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers['x-auth-token'] = token;
  }
  return config;
});

// API functions
export const authAPI = {
  register: (data) => api.post('/auth/register', data),
  loginUser: (data) => api.post('/auth/login/user', data),
  loginAdmin: (data) => api.post('/auth/login/admin', data),
  getMe: () => api.get('/auth/me'),
};

export const stockAPI = {
  getAll: () => api.get('/stocks'),
};

export const userAPI = {
  getPortfolio: () => api.get('/portfolio'),
  getTransactions: () => api.get('/transactions'),
  addFunds: (amount) => api.post('/addfunds', { amount }),
  trade: (data) => api.post('/trade', data),
};

export const adminAPI = {
  getStats: () => api.get('/admin/stats'),
  getUsers: () => api.get('/admin/users'),
};

export default api;
