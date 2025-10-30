import React, { useState, useEffect, createContext, useContext, useReducer, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line } from 'recharts';
import { ArrowUpRight, ArrowDownRight, User, Users, LineChart as ChartIcon, Briefcase, LogOut, Settings, Shield, DollarSign, PlusCircle } from 'lucide-react';
import { authAPI, stockAPI, userAPI, adminAPI } from './api';

// --- MOCK DATA ---
const initialStockData = {
  "TCS": { name: "Tata Consultancy Services", sector: "IT", price: 3850.25 },
  "INFY": { name: "Infosys", sector: "IT", price: 1620.10 },
  "RELIANCE": { name: "Reliance Industries", sector: "Energy", price: 2910.40 },
  "HDFCBANK": { name: "HDFC Bank", sector: "Finance", price: 1530.75 },
  "ICICIBANK": { name: "ICICI Bank", sector: "Finance", price: 1105.00 },
  "TATAMOTORS": { name: "Tata Motors", sector: "Auto", price: 975.80 },
  "SUNPHARMA": { name: "Sun Pharmaceutical", sector: "Pharma", price: 1480.60 },
  "LT": { name: "Larsen & Toubro", sector: "Infra", price: 3600.30 },
};
const sectors = ["All", "IT", "Energy", "Finance", "Auto", "Pharma", "Infra"];

// --- UTILITY FUNCTIONS ---
// (Same as before)
const generateStockHistory = (basePrice) => {
  const data = { day: [], week: [], year: [] };
  let price = basePrice;
  for (let i = 0; i < 12; i++) {
    price = price * (1 + (Math.random() - 0.5) * 0.01);
    data.day.push({ name: `T-${12 - i}`, price: parseFloat(price.toFixed(2)) });
  }
  price = basePrice * (1 + (Math.random() - 0.5) * 0.02);
  for (let i = 0; i < 7; i++) {
    price = price * (1 + (Math.random() - 0.5) * 0.05);
    data.week.push({ name: `Day ${i + 1}`, price: parseFloat(price.toFixed(2)) });
  }
  price = basePrice * (1 + (Math.random() - 0.7) * 0.2);
  for (let i = 0; i < 12; i++) {
    price = price * (1 + (Math.random() - 0.4) * 0.15);
    data.year.push({ name: `M ${i + 1}`, price: parseFloat(price.toFixed(2)) });
  }
  return data;
};

// --- AUTH & DATA CONTEXT ---
const AppContext = createContext(null);
function appReducer(state, action) {
  let newState;
  switch (action.type) {
    case 'LOAD_STATE':
      return action.payload;
    case 'LOGIN': {
      const { email, password } = action.payload;
      const admin = state.users.find(u => u.email === email && u.password === password && u.isAdmin);
      if (admin) {
        newState = { ...state, isAuthenticated: true, isAdmin: true, currentUser: admin, error: null };
      } else {
        const user = state.users.find(u => u.email === email && u.password === password && !u.isAdmin);
        if (user) {
          newState = { ...state, isAuthenticated: true, isAdmin: false, currentUser: user, error: null };
        } else {
          newState = { ...state, error: "Invalid email or password." };
        }
      }
      return newState;
    }
    case 'REGISTER': {
      const { name, email, password, phone } = action.payload;
      if (state.users.find(u => u.email === email)) {
        return { ...state, error: "User with this email already exists." };
      }
      const newUser = {
        id: `u_${Date.now()}`, name, email, password, phone,
        balance: 100000.00, portfolio: {}, transactions: [], isAdmin: false
      };
      const newUsers = [...state.users, newUser];
      newState = { ...state, users: newUsers, isAuthenticated: true, isAdmin: false, currentUser: newUser, error: null };
      return newState;
    }
    case 'LOGOUT':
      localStorage.removeItem('token');
      return { ...state, isAuthenticated: false, isAdmin: false, currentUser: null, error: null };
    case 'CLEAR_ERROR':
      return { ...state, error: null };
    case 'SET_SUCCESS':
      return { ...state, success: action.payload, error: null };
    case 'CLEAR_SUCCESS':
      return { ...state, success: null };
    case 'ADD_FUNDS': {
      const amount = action.payload;
      if (amount <= 0) return state;
      const updatedUser = { ...state.currentUser, balance: state.currentUser.balance + amount };
      const updatedUsers = state.users.map(u => u.id === updatedUser.id ? updatedUser : u);
      newState = { ...state, currentUser: updatedUser, users: updatedUsers };
      return newState;
    }
    case 'TRADE': {
      const { type, symbol, quantity, price, risk } = action.payload;
      const cost = price * quantity;
      let updatedUser = { ...state.currentUser };
      if (type === 'BUY') {
        if (updatedUser.balance < cost) {
          return { ...state, error: "Insufficient funds to complete this trade." };
        }
        updatedUser.balance -= cost;
        const existingHolding = updatedUser.portfolio[symbol];
        if (existingHolding) {
          const totalQuantity = existingHolding.quantity + quantity;
          const totalCost = (existingHolding.avgPrice * existingHolding.quantity) + cost;
          const newAvgPrice = totalCost / totalQuantity;
          updatedUser.portfolio[symbol] = { quantity: totalQuantity, avgPrice: newAvgPrice };
        } else {
          updatedUser.portfolio[symbol] = { quantity: quantity, avgPrice: price };
        }
      } else {
        const holding = updatedUser.portfolio[symbol];
        if (!holding || holding.quantity < quantity) {
          return { ...state, error: "You do not own enough shares to sell." };
        }
        updatedUser.balance += cost;
        const newQuantity = holding.quantity - quantity;
        if (newQuantity === 0) {
          delete updatedUser.portfolio[symbol];
        } else {
          updatedUser.portfolio[symbol] = { ...holding, quantity: newQuantity };
        }
      }
      updatedUser.transactions.unshift({
        id: `t_${Date.now()}`, date: new Date().toISOString(),
        type, symbol, quantity, price, risk
      });
      const updatedUsers = state.users.map(u => u.id === updatedUser.id ? updatedUser : u);
      newState = { ...state, currentUser: updatedUser, users: updatedUsers, error: null };
      return newState;
    }
    case 'UPDATE_PRICES': {
      const newStocks = { ...state.stocks };
      for (const symbol in newStocks) {
        const stock = newStocks[symbol];
        const changePercent = (Math.random() - 0.48) * 0.05;
        const newPrice = parseFloat((stock.price * (1 + changePercent)).toFixed(2));
        newStocks[symbol] = { ...stock, price: newPrice };
      }
      return { ...state, stocks: newStocks };
    }
    case 'UPDATE_PRICES_FROM_API':
      return { ...state, stocks: action.payload };
    case 'SET_USER': {
      const user = action.payload.user;
      // Normalize portfolio from array to object
      const portfolioObj = {};
      if (user.portfolio && Array.isArray(user.portfolio)) {
        user.portfolio.forEach(item => {
          portfolioObj[item.symbol] = {
            quantity: item.quantity,
            avgPrice: item.avgPrice
          };
        });
      }
      return { 
        ...state, 
        isAuthenticated: true, 
        isAdmin: action.payload.isAdmin,
        currentUser: {
          ...user,
          id: user._id,
          portfolio: portfolioObj,
          transactions: user.transactions || []
        },
        error: null 
      };
    }
    case 'SET_ERROR':
      return { ...state, error: action.payload };
    case 'UPDATE_USER_DATA': {
      const updatedUser = { ...state.currentUser };
      if (action.payload.balance !== undefined) {
        updatedUser.balance = action.payload.balance;
      }
      if (action.payload.portfolio !== undefined) {
        updatedUser.portfolio = action.payload.portfolio;
      }
      if (action.payload.transaction) {
        updatedUser.transactions = [action.payload.transaction, ...(updatedUser.transactions || [])];
      }
      return { ...state, currentUser: updatedUser, error: null };
    }
    default:
      return state;
  }
}

// --- CSS STYLES COMPONENT ---
// This component injects all our CSS into the document head
function GlobalStyles() {
  return (
    <style>{`
      /* --- Base & Resets --- */
      :root {
        --bg-primary: #111827; /* gray-900 */
        --bg-secondary: #1F2937; /* gray-800 */
        --bg-tertiary: #374151; /* gray-700 */
        --border-color: #4B5563; /* gray-600 */
        --text-primary: #F9FAFB; /* gray-100 */
        --text-secondary: #D1D5DB; /* gray-300 */
        --text-tertiary: #9CA3AF; /* gray-400 */
        --accent-green: #22C55E; /* green-500 */
        --accent-green-hover: #16A34A; /* green-600 */
        --accent-red: #EF4444; /* red-500 */
        --accent-red-hover: #DC2626; /* red-600 */
        --accent-blue: #3B82F6; /* blue-500 */
        --accent-blue-hover: #2563EB; /* blue-600 */
        --accent-yellow: #EAB308; /* yellow-500 */
      }
      
      * { box-sizing: border-box; margin: 0; padding: 0; }
      
      body {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        background-color: var(--bg-primary);
        color: var(--text-primary);
        min-height: 100vh;
      }
      
      h1, h2, h3, h4 { font-weight: 600; margin-bottom: 0.5em; }
      h1 { font-size: 2rem; }
      h2 { font-size: 1.5rem; }
      p { margin-bottom: 1em; line-height: 1.5; color: var(--text-secondary); }
      
      /* --- Utility --- */
      .text-green { color: var(--accent-green); }
      .text-red { color: var(--accent-red); }
      .text-yellow { color: var(--accent-yellow); }
      .font-semibold { font-weight: 600; }
      .text-sm { font-size: 0.875rem; }
      .text-center { text-align: center; }
      
      /* --- Layout --- */
      .page-container {
        padding: 1rem;
        max-width: 80rem;
        margin: 0 auto;
      }
      .page-spacing > * + * {
        margin-top: 1.5rem; /* space-y-6 */
      }
      
      /* --- Buttons --- */
      .btn {
        padding: 0.5rem 1rem;
        font-size: 0.875rem;
        font-weight: 600;
        border: none;
        border-radius: 0.375rem;
        cursor: pointer;
        transition: background-color 0.15s ease;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 0.5rem;
        text-decoration: none;
        color: white;
      }
      .btn:disabled { opacity: 0.5; cursor: not-allowed; }
      
      .btn-primary { background-color: var(--accent-green-hover); }
      .btn-primary:hover { background-color: #15803D; }
      
      .btn-danger { background-color: var(--accent-red-hover); }
      .btn-danger:hover { background-color: #B91C1C; }
      
      .btn-blue { background-color: var(--accent-blue); }
      .btn-blue:hover { background-color: var(--accent-blue-hover); }

      .btn-secondary { background-color: var(--bg-tertiary); color: var(--text-primary); }
      .btn-secondary:hover { background-color: var(--border-color); }
      
      /* --- Auth Forms --- */
      .auth-container {
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 80vh;
      }
      .auth-card {
        width: 100%;
        max-width: 28rem; /* max-w-md */
        padding: 2rem;
        background-color: var(--bg-secondary);
        border-radius: 0.5rem;
        box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -2px rgba(0,0,0,0.05);
      }
      .auth-card h2 { text-align: center; }
      .auth-form { display: flex; flex-direction: column; gap: 1.5rem; margin-top: 1.5rem; }
      .form-group { display: flex; flex-direction: column; gap: 0.25rem; }
      .form-label { font-size: 0.875rem; font-weight: 500; color: var(--text-secondary); }
      .form-input {
        width: 100%;
        padding: 0.5rem 0.75rem;
        color: var(--text-primary);
        background-color: var(--bg-tertiary);
        border: 1px solid var(--border-color);
        border-radius: 0.375rem;
        font-size: 1rem;
      }
      .form-input:focus {
        outline: none;
        border-color: var(--accent-green);
        box-shadow: 0 0 0 2px var(--accent-green);
      }
      .auth-switch {
        font-size: 0.875rem;
        text-align: center;
        color: var(--text-tertiary);
        margin-top: 1.5rem;
      }
      .auth-switch-link {
        font-weight: 500;
        color: var(--accent-green);
        cursor: pointer;
      }
      .auth-switch-link:hover { text-decoration: underline; }
      
      /* --- Navbar --- */
      .navbar {
        background-color: var(--bg-secondary);
        box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);
      }
      .navbar-content {
        max-width: 80rem; /* max-w-7xl */
        margin: 0 auto;
        padding: 0 1rem;
        display: flex;
        align-items: center;
        justify-content: space-between;
        height: 4rem;
      }
      .navbar-left, .navbar-right, .navbar-links {
        display: flex;
        align-items: center;
      }
      .navbar-brand {
        font-weight: bold;
        font-size: 1.25rem;
        color: white;
        display: flex;
        align-items: center;
        gap: 0.5rem;
      }
      .navbar-brand-icon { color: var(--accent-green); }
      .navbar-links {
        display: none; /* hidden md:block */
        margin-left: 2.5rem;
        gap: 1rem;
      }
      .nav-item {
        cursor: pointer;
        padding: 0.5rem 0.75rem;
        border-radius: 0.375rem;
        font-size: 0.875rem;
        font-weight: 500;
        color: var(--text-secondary);
      }
      .nav-item:hover {
        background-color: var(--bg-primary);
        color: white;
      }
      .nav-item-active {
        background-color: var(--bg-tertiary);
        color: white;
      }
      .navbar-user {
        display: none; /* hidden md:block */
        color: var(--text-secondary);
        margin-right: 1rem;
        font-size: 0.875rem;
      }
      
      /* --- Card (Base for content blocks) --- */
      .card {
        background-color: var(--bg-secondary);
        border-radius: 0.5rem;
        box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);
        overflow: hidden;
      }
      .card-header {
        padding: 1rem 1.5rem;
        border-bottom: 1px solid var(--border-color);
      }
      .card-header h2 { margin: 0; }
      .card-body {
        padding: 1.5rem;
      }
      .card-header-flex {
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        align-items: flex-start;
        gap: 1rem;
      }
      
      /* --- Dashboard Header --- */
      .dashboard-header {
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        align-items: center;
        gap: 1rem;
        padding: 1.5rem;
      }
      .dashboard-header-right {
        display: flex;
        flex-direction: column;
        align-items: stretch;
        gap: 1rem;
        width: 100%;
      }
      .balance-card {
        padding: 1rem;
        background-color: var(--bg-tertiary);
        border-radius: 0.5rem;
        text-align: center;
      }
      .balance-label {
        font-size: 0.875rem;
        color: var(--text-tertiary);
      }
      .balance-amount {
        font-size: 1.5rem;
        font-weight: 600;
        color: var(--accent-green);
      }
      
      /* --- Filter Bar --- */
      .filter-bar {
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      .filter-select {
        background-color: var(--bg-tertiary);
        color: var(--text-primary);
        border: 1px solid var(--border-color);
        border-radius: 0.375rem;
        padding: 0.25rem 0.5rem;
        font-size: 0.875rem;
      }
      .filter-select:focus {
        outline: none;
        border-color: var(--accent-green);
      }
      
      /* --- Table --- */
      .table-container {
        overflow-x: auto;
      }
      .table {
        width: 100%;
        min-width: 640px; /* min-w-full */
        border-collapse: collapse;
      }
      .table thead {
        background-color: var(--bg-tertiary);
      }
      .table th, .table td {
        padding: 0.75rem 1.5rem;
        text-align: left;
        white-space: nowrap;
      }
      .table th {
        font-size: 0.75rem;
        font-weight: 500;
        color: var(--text-secondary);
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }
      .table tbody tr {
        border-bottom: 1px solid var(--border-color);
      }
      .table tbody tr:last-child {
        border-bottom: none;
      }
      .table tbody tr:hover {
        background-color: var(--bg-tertiary);
      }
      .table td {
        font-size: 0.875rem;
        color: var(--text-secondary);
      }
      .table-symbol {
        font-weight: 600;
        color: var(--text-primary);
      }
      .table-actions {
        text-align: center;
        display: flex;
        gap: 0.5rem;
        justify-content: center;
      }
      .table-actions .btn {
        padding: 0.25rem 0.75rem; /* px-3 py-1 */
        font-size: 0.75rem; /* text-xs */
      }
      .table-no-data {
        text-align: center;
        padding: 2.5rem;
        color: var(--text-tertiary);
      }
      
      /* --- Portfolio Stats --- */
      .stats-grid {
        display: grid;
        grid-template-columns: 1fr;
        gap: 1rem;
      }
      .stat-card {
        padding: 1rem;
        background-color: var(--bg-tertiary);
        border-radius: 0.5rem;
      }
      .stat-label {
        font-size: 0.875rem;
        color: var(--text-tertiary);
      }
      .stat-value {
        font-size: 1.5rem;
        font-weight: 600;
        color: var(--text-primary);
      }
      .stat-value-pl {
        font-size: 1.25rem;
      }
      .stat-value-pl .text-sm {
        margin-left: 0.5rem;
      }
      
      /* --- Modal --- */
      .modal-backdrop {
        position: fixed;
        inset: 0;
        background-color: rgba(0, 0, 0, 0.75);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 50;
        padding: 1rem;
      }
      .modal-content {
        background-color: var(--bg-secondary);
        border-radius: 0.5rem;
        box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1);
        padding: 1.5rem;
        width: 100%;
        position: relative;
      }
      .modal-content-medium { max-width: 32rem; /* max-w-xl */ }
      .modal-content-large { max-width: 56rem; /* max-w-4xl */ }
      .modal-close-btn {
        position: absolute;
        top: 0.75rem;
        right: 0.75rem;
        font-size: 1.5rem;
        line-height: 1;
        color: var(--text-tertiary);
        background: none;
        border: none;
        cursor: pointer;
      }
      .modal-close-btn:hover { color: var(--text-primary); }
      .modal-header {
        font-size: 1.5rem;
        font-weight: 600;
        margin-bottom: 1rem;
      }
      .modal-body > * + * {
        margin-top: 1rem;
      }
      .modal-footer {
        display: flex;
        justify-content: flex-end;
        gap: 0.75rem;
        margin-top: 1.5rem;
      }
      
      /* --- Trade Modal Specific --- */
      .trade-details p { margin-bottom: 0.5rem; }
      .trade-details span { font-weight: 600; color: var(--text-primary); }
      .risk-card {
        background-color: var(--bg-primary);
        border: 1px solid var(--border-color);
        border-radius: 0.5rem;
        padding: 1rem;
        text-align: center;
      }
      .risk-card-header {
        font-weight: 600;
        font-size: 1.125rem;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0.5rem;
        margin-bottom: 0.5rem;
      }
      .risk-level {
        font-size: 1.875rem; /* text-3xl */
        font-weight: 700;
      }
      
      /* --- Chart Modal Specific --- */
      .chart-header {
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        gap: 1rem;
        margin-bottom: 1rem;
      }
      .chart-price-info {
        display: flex;
        align-items: flex-end;
        gap: 0.75rem;
      }
      .chart-price { font-size: 2rem; font-weight: 700; }
      .chart-change { font-size: 1.125rem; font-weight: 600; }
      .chart-timeframe {
        display: flex;
        gap: 0.5rem;
        background-color: var(--bg-tertiary);
        padding: 0.25rem;
        border-radius: 0.5rem;
      }
      .chart-timeframe-btn {
        padding: 0.25rem 0.75rem;
        font-size: 0.875rem;
        font-weight: 600;
        border: none;
        border-radius: 0.375rem;
        background-color: transparent;
        color: var(--text-secondary);
        cursor: pointer;
      }
      .chart-timeframe-btn-active {
        background-color: var(--accent-green);
        color: white;
      }
      .chart-container {
        height: 18rem; /* 288px */
        width: 100%;
      }
      
      /* --- Add Funds Modal --- */
      .preset-amounts {
        display: flex;
        gap: 0.5rem;
        margin-bottom: 1rem;
      }
      .preset-amounts .btn {
        flex: 1;
      }
      
      /* --- Admin Dashboard --- */
      .admin-grid {
        display: grid;
        grid-template-columns: 1fr;
        gap: 1.5rem;
      }
      .admin-stat-card {
        display: flex;
        align-items: center;
        gap: 1rem;
        padding: 1.5rem;
        background-color: var(--bg-secondary);
        border-radius: 0.5rem;
        box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);
      }
      .admin-stat-icon {
        padding: 0.75rem;
        border-radius: 9999px;
        color: white;
      }
      .admin-stat-icon-blue { background-color: var(--accent-blue); }
      .admin-stat-icon-green { background-color: var(--accent-green); }
      .admin-stat-icon-yellow { background-color: var(--accent-yellow); }
      .admin-stat-label { font-size: 0.875rem; color: var(--text-tertiary); }
      .admin-stat-value { font-size: 1.875rem; font-weight: 700; color: white; }
      .admin-chart-container {
        height: 18rem; /* 288px */
      }
      .admin-table-container {
        max-height: 18rem;
        overflow-y: auto;
      }
      .admin-table-container .table thead {
        position: sticky;
        top: 0;
      }
      
      /* --- Misc --- */
      .loading-spinner-container {
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 100vh;
      }
      .spinner {
        width: 4rem;
        height: 4rem;
        border-radius: 50%;
        border: 4px solid var(--border-color);
        border-top-color: var(--accent-green);
        animation: spin 1s linear infinite;
      }
      @keyframes spin {
        to { transform: rotate(360deg); }
      }
      
      .error-notification {
        position: fixed;
        top: 5rem;
        right: 2rem;
        background-color: var(--accent-red);
        color: white;
        padding: 0.75rem 1.25rem;
        border-radius: 0.375rem;
        font-weight: 600;
        z-index: 100;
        box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);
        animation: slideIn 0.3s ease-out;
      }

      .success-notification {
        position: fixed;
        top: 5rem;
        right: 2rem;
        background-color: var(--accent-green);
        color: white;
        padding: 0.75rem 1.25rem;
        border-radius: 0.375rem;
        font-weight: 600;
        z-index: 100;
        box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);
        animation: slideIn 0.3s ease-out;
      }

      @keyframes slideIn {
        from {
          transform: translateX(100%);
          opacity: 0;
        }
        to {
          transform: translateX(0);
          opacity: 1;
        }
      }

      /* --- Responsive Media Queries --- */
      @media (min-width: 768px) {
        .page-container { padding: 2rem; }
      
        .navbar-links { display: flex; }
        .navbar-user { display: block; }
        
        .dashboard-header {
          flex-direction: row;
          align-items: center;
        }
        .dashboard-header-right {
          flex-direction: row;
          align-items: center;
          width: auto;
        }
        .balance-card { text-align: right; }
        
        .card-header-flex {
          flex-direction: row;
          align-items: center;
        }

        .stats-grid { grid-template-columns: repeat(3, 1fr); }
        .admin-grid { grid-template-columns: repeat(3, 1fr); }
        .admin-grid-large { grid-template-columns: 1fr 1fr; }
        
        .chart-header { flex-direction: row; align-items: center; }
        .chart-container { height: 24rem; /* 384px */ }
      }
    `}
    </style>
  );
}

// --- APP COMPONENT (Main) ---
export default function App() {
  const initialState = {
    isAuthenticated: false,
    isAdmin: false,
    currentUser: null,
    users: [],
    stocks: initialStockData,
    historicalData: {},
    error: null,
    success: null,
  };

  const [state, dispatch] = useReducer(appReducer, initialState);
  const [currentPage, setCurrentPage] = useState('login');
  const [isInitialized, setIsInitialized] = useState(false);

  // Check if user is already logged in (token exists)
  useEffect(() => {
    const initApp = async () => {
      const token = localStorage.getItem('token');
      if (token) {
        try {
          const { data } = await authAPI.getMe();
          const loadedState = { ...initialState };
          loadedState.isAuthenticated = true;
          loadedState.isAdmin = data.isAdmin || false;
          
          // Normalize portfolio from array to object
          const portfolioObj = {};
          if (data.portfolio && Array.isArray(data.portfolio)) {
            data.portfolio.forEach(item => {
              portfolioObj[item.symbol] = {
                quantity: item.quantity,
                avgPrice: item.avgPrice
              };
            });
          }
          loadedState.currentUser = {
            ...data,
            id: data._id,
            portfolio: portfolioObj,
            transactions: data.transactions || []
          };
          
          // Load stocks
          const stocksRes = await stockAPI.getAll();
          const stocksObj = {};
          stocksRes.data.forEach(s => {
            stocksObj[s.symbol] = { name: s.name, sector: s.sector, price: s.price };
          });
          loadedState.stocks = stocksObj;
          
          const history = {};
          for (const symbol in loadedState.stocks) {
            history[symbol] = generateStockHistory(loadedState.stocks[symbol].price);
          }
          loadedState.historicalData = history;
          
          dispatch({ type: 'LOAD_STATE', payload: loadedState });
        } catch (error) {
          console.error('Token validation failed:', error);
          localStorage.removeItem('token');
          // Load stocks even if not authenticated
          try {
            const stocksRes = await stockAPI.getAll();
            const stocksObj = {};
            stocksRes.data.forEach(s => {
              stocksObj[s.symbol] = { name: s.name, sector: s.sector, price: s.price };
            });
            const loadedState = { ...initialState, stocks: stocksObj };
            const history = {};
            for (const symbol in loadedState.stocks) {
              history[symbol] = generateStockHistory(loadedState.stocks[symbol].price);
            }
            loadedState.historicalData = history;
            dispatch({ type: 'LOAD_STATE', payload: loadedState });
          } catch (e) {
            console.error('Failed to load stocks:', e);
            dispatch({ type: 'LOAD_STATE', payload: initialState });
          }
        }
      } else {
        // No token, just load stocks
        try {
          const stocksRes = await stockAPI.getAll();
          const stocksObj = {};
          stocksRes.data.forEach(s => {
            stocksObj[s.symbol] = { name: s.name, sector: s.sector, price: s.price };
          });
          const loadedState = { ...initialState, stocks: stocksObj };
          const history = {};
          for (const symbol in loadedState.stocks) {
            history[symbol] = generateStockHistory(loadedState.stocks[symbol].price);
          }
          loadedState.historicalData = history;
          dispatch({ type: 'LOAD_STATE', payload: loadedState });
        } catch (e) {
          console.error('Failed to load stocks:', e);
          dispatch({ type: 'LOAD_STATE', payload: initialState });
        }
      }
      setIsInitialized(true);
    };
    
    initApp();
  }, []);

  // Stock price updates from backend
  useEffect(() => {
    if (!state.isAuthenticated) return;
    const interval = setInterval(async () => {
      try {
        const stocksRes = await stockAPI.getAll();
        const stocksObj = {};
        stocksRes.data.forEach(s => {
          stocksObj[s.symbol] = { name: s.name, sector: s.sector, price: s.price };
        });
        dispatch({ type: 'UPDATE_PRICES_FROM_API', payload: stocksObj });
      } catch (error) {
        console.error('Failed to update prices:', error);
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [state.isAuthenticated]);

  useEffect(() => {
    if (state.isAuthenticated) {
      setCurrentPage(state.isAdmin ? 'admin' : 'dashboard');
    } else {
      setCurrentPage('login');
    }
  }, [state.isAuthenticated, state.isAdmin]);

  if (!isInitialized) {
    return <LoadingSpinner />;
  }

  return (
    <AppContext.Provider value={{ state, dispatch }}>
      <GlobalStyles />
      <div className="app-container">
        {state.isAuthenticated && <Navbar setPage={setCurrentPage} currentPage={currentPage} />}
        <main className="page-container">
          {state.error && <ErrorNotification message={state.error} />}
          {state.success && <SuccessNotification message={state.success} />}
          {!state.isAuthenticated ? (
            currentPage === 'login' ? (
              <Login setPage={setCurrentPage} />
            ) : (
              <Register setPage={setCurrentPage} />
            )
          ) : state.isAdmin ? (
            <AdminDashboard />
          ) : (
            <>
              {currentPage === 'dashboard' && <Dashboard />}
              {currentPage === 'portfolio' && <Portfolio />}
              {currentPage === 'transactions' && <TransactionHistory />}
            </>
          )}
        </main>
      </div>
    </AppContext.Provider>
  );
}

// --- COMPONENTS ---

function Navbar({ setPage, currentPage }) {
  const { state, dispatch } = useContext(AppContext);
  const { currentUser, isAdmin } = state;

  const handleLogout = () => {
    dispatch({ type: 'LOGOUT' });
    setPage('login');
  };

  const navItemClasses = (page) =>
    `nav-item ${currentPage === page ? 'nav-item-active' : ''}`;

  return (
    <nav className="navbar">
      <div className="navbar-content">
        <div className="navbar-left">
          <span className="navbar-brand">
            <DollarSign className="navbar-brand-icon" />
            VirtualTrader
          </span>
          <div className="navbar-links">
            {!isAdmin ? (
              <>
                <span onClick={() => setPage('dashboard')} className={navItemClasses('dashboard')}>
                  Dashboard
                </span>
                <span onClick={() => setPage('portfolio')} className={navItemClasses('portfolio')}>
                  Portfolio
                </span>
                <span onClick={() => setPage('transactions')} className={navItemClasses('transactions')}>
                  History
                </span>
              </>
            ) : (
              <span onClick={() => setPage('admin')} className={navItemClasses('admin')}>
                Admin Panel
              </span>
            )}
          </div>
        </div>
        <div className="navbar-right">
          <span className="navbar-user">
            Welcome, <span className="font-semibold">{currentUser.name}</span>
          </span>
          <button onClick={handleLogout} className="btn btn-danger">
            <LogOut size={16} />
            Logout
          </button>
        </div>
      </div>
    </nav>
  );
}

function Login({ setPage }) {
  const { dispatch } = useContext(AppContext);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginType, setLoginType] = useState('user'); // 'user' or 'admin'
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const loginFunc = loginType === 'admin' ? authAPI.loginAdmin : authAPI.loginUser;
      const { data } = await loginFunc({ email, password });
      
      localStorage.setItem('token', data.token);
      dispatch({ 
        type: 'SET_USER', 
        payload: { 
          user: data.user, 
          isAdmin: loginType === 'admin' 
        } 
      });
    } catch (error) {
      const message = error.response?.data?.message || 'Login failed. Please try again.';
      dispatch({ type: 'SET_ERROR', payload: message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        {/* (NEW) Login Tabs */}
        <div className="auth-tabs">
          <div
            className={`auth-tab ${loginType === 'user' ? 'auth-tab-active' : ''}`}
            onClick={() => setLoginType('user')}
          >
            User Login
          </div>
          <div
            className={`auth-tab ${loginType === 'admin' ? 'auth-tab-active' : ''}`}
            onClick={() => setLoginType('admin')}
          >
            Admin Login
          </div>
        </div>

        <div className="auth-card-body">
          <h2>Welcome {loginType === 'admin' ? 'Administrator' : 'Back'}</h2>
          
          <form className="auth-form" onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label">{loginType === 'admin' ? 'Admin ' : ''}Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="form-input"
              />
            </div>
            <div className="form-group">
              <label className="form-label">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="form-input"
              />
            </div>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Logging in...' : `Login as ${loginType === 'admin' ? 'Admin' : 'User'}`}
            </button>
          </form>

          {loginType === 'user' && (
            <p className="auth-switch">
              New to VirtualTrader?{' '}
              <span onClick={() => setPage('register')} className="auth-switch-link">
                Create an account
              </span>
            </p>
          )}
        </div>
      </div>

      {/* --- Add this style block --- */}
      <style>{`
        .auth-tabs {
          display: flex;
          justify-content: space-between;
          background: #1e1e1e;
          border-radius: 8px 8px 0 0;
          overflow: hidden;
        }
        .auth-tab {
          flex: 1;
          text-align: center;
          padding: 0.75rem 0;
          color: #aaa;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
          border-bottom: 3px solid transparent;
        }
        .auth-tab:hover {
          color: #fff;
          background: #2a2a2a;
        }
        .auth-tab-active {
          color: #22c55e;
          background: #111;
          border-bottom: 3px solid #22c55e;
        }
      `}</style>
    </div>
  );
}


function Register({ setPage }) {
  const { dispatch } = useContext(AppContext);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await authAPI.register({ name, email, password, phone });
      
      localStorage.setItem('token', data.token);
      dispatch({ 
        type: 'SET_USER', 
        payload: { 
          user: data.user, 
          isAdmin: false 
        } 
      });
    } catch (error) {
      const message = error.response?.data?.message || 'Registration failed. Please try again.';
      dispatch({ type: 'SET_ERROR', payload: message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <h2>Create Account</h2>
        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Full Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="form-input"
            />
          </div>
          <div className="form-group">
            <label className="form-label">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="form-input"
            />
          </div>
          <div className="form-group">
              <label className="form-label">Phone Number</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
                className="form-input"
              />
            </div>
          <div className="form-group">
            <label className="form-label">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="form-input"
            />
          </div>
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? 'Registering...' : 'Register'}
          </button>
        </form>
        <p className="auth-switch">
          Already have an account?{' '}
          <span onClick={() => setPage('login')} className="auth-switch-link">
            Login here
          </span>
        </p>
      </div>
    </div>
  );
}

function Dashboard() {
  const { state } = useContext(AppContext);
  const [filter, setFilter] = useState('All');
  const [selectedStock, setSelectedStock] = useState(null);
  const [tradeType, setTradeType] = useState('BUY');
  const [viewStock, setViewStock] = useState(null);
  const [showAddFunds, setShowAddFunds] = useState(false);
  
  const { currentUser, stocks } = state;

  // Safety check
  if (!currentUser) {
    return (
      <div className="page-spacing">
        <div className="card">
          <h2>Loading...</h2>
          <p>Please wait while we load your data.</p>
        </div>
      </div>
    );
  }

  const filteredStocks = useMemo(() => {
    return Object.entries(stocks)
      .filter(([symbol, data]) => filter === 'All' || data.sector === filter)
      .map(([symbol, data]) => ({ ...data, symbol }));
  }, [stocks, filter]);

  const openTradeModal = (symbol, type) => {
    setSelectedStock(symbol);
    setTradeType(type);
  };
  
  const openChartModal = (symbol) => {
    setViewStock(symbol);
  };
  
  const getPriceColor = (symbol) => {
    const oldPrice = initialStockData[symbol]?.price || 0;
    const newPrice = stocks[symbol]?.price || 0;
    if (newPrice > oldPrice) return 'text-green';
    if (newPrice < oldPrice) return 'text-red';
    return 'text-tertiary';
  };

  return (
    <div className="page-spacing">
      <div className="dashboard-header card">
        <div>
          <h1>Trading Dashboard</h1>
          <p>Welcome back, {currentUser.name}!</p>
        </div>
        <div className="dashboard-header-right">
          <div className="balance-card">
            <div className="balance-label">Virtual Balance</div>
            <div className="balance-amount">
              ₹{currentUser.balance.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
            </div>
          </div>
          <button 
            onClick={() => setShowAddFunds(true)}
            className="btn btn-blue"
          >
            <PlusCircle size={18} />
            Add Funds
          </button>
        </div>
      </div>
      
      <div className="card">
        <div className="card-header filter-bar">
          <h2>Market Overview</h2>
          <div>
            <label className="text-sm text-tertiary" style={{ marginRight: '0.5rem' }}>Filter by Sector:</label>
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="filter-select"
            >
              {sectors.map(sector => (
                <option key={sector} value={sector}>{sector}</option>
              ))}
            </select>
          </div>
        </div>
        
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Symbol</th>
                <th>Company</th>
                <th>Sector</th>
                <th>Price (₹)</th>
                <th style={{ textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredStocks.map(stock => (
                <tr key={stock.symbol}>
                  <td className="table-symbol">{stock.symbol}</td>
                  <td>{stock.name}</td>
                  <td>{stock.sector}</td>
                  <td className={`font-semibold ${getPriceColor(stock.symbol)}`}>
                    {stock.price.toLocaleString('en-IN')}
                  </td>
                  <td className="table-actions">
                    <button onClick={() => openTradeModal(stock.symbol, 'BUY')} className="btn btn-primary">
                      Buy
                    </button>
                    <button onClick={() => openTradeModal(stock.symbol, 'SELL')} className="btn btn-danger">
                      Sell
                    </button>
                    <button onClick={() => openChartModal(stock.symbol)} className="btn btn-blue">
                      Chart
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      
      {selectedStock && (
        <TradeModal 
          symbol={selectedStock}
          type={tradeType}
          onClose={() => setSelectedStock(null)}
        />
      )}
      
      {viewStock && (
        <StockChartModal
          symbol={viewStock}
          onClose={() => setViewStock(null)}
        />
      )}
      
      {showAddFunds && (
        <AddFundsModal onClose={() => setShowAddFunds(false)} />
      )}
    </div>
  );
}

function Portfolio() {
  const { state } = useContext(AppContext);
  const { currentUser, stocks } = state;
  
  if (!currentUser) {
    return (
      <div className="page-spacing">
        <div className="card">
          <h2>Loading...</h2>
        </div>
      </div>
    );
  }
  
  const { portfolio } = currentUser;

  const holdings = useMemo(() => {
    return Object.entries(portfolio).map(([symbol, data]) => {
      const currentPrice = stocks[symbol]?.price || 0;
      const totalValue = data.quantity * currentPrice;
      const totalCost = data.quantity * data.avgPrice;
      const profitLoss = totalValue - totalCost;
      const profitLossPct = totalCost === 0 ? 0 : (profitLoss / totalCost) * 100;
      return {
        symbol,
        name: stocks[symbol]?.name || 'N/A',
        quantity: data.quantity,
        avgPrice: data.avgPrice,
        currentPrice,
        totalValue,
        profitLoss,
        profitLossPct,
      };
    });
  }, [portfolio, stocks]);

  const totals = useMemo(() => {
    return holdings.reduce((acc, holding) => {
      acc.totalValue += holding.totalValue;
      acc.totalInvested += holding.quantity * holding.avgPrice;
      acc.totalPL += holding.profitLoss;
      return acc;
    }, { totalValue: 0, totalInvested: 0, totalPL: 0 });
  }, [holdings]);
  
  const totalPLPct = totals.totalInvested === 0 ? 0 : (totals.totalPL / totals.totalInvested) * 100;

  return (
    <div className="page-spacing">
      <div className="card">
        <div className="card-body">
          <h1 style={{ marginBottom: '1rem' }}>My Portfolio</h1>
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-label">Total Invested</div>
              <div className="stat-value">
                ₹{totals.totalInvested.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Current Value</div>
              <div className="stat-value">
                ₹{totals.totalValue.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Overall P/L</div>
              <div className={`stat-value stat-value-pl ${totals.totalPL >= 0 ? 'text-green' : 'text-red'}`}>
                ₹{totals.totalPL.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                <span className="text-sm">({totalPLPct.toFixed(2)}%)</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <div className="card">
        <div className="card-header">
          <h2>Current Holdings</h2>
        </div>
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Symbol</th>
                <th>Quantity</th>
                <th>Avg. Price (₹)</th>
                <th>Current Price (₹)</th>
                <th>Total Value (₹)</th>
                <th>P/L (₹)</th>
                <th>P/L (%)</th>
              </tr>
            </thead>
            <tbody>
              {holdings.length > 0 ? holdings.map(h => (
                <tr key={h.symbol}>
                  <td className="table-symbol">{h.symbol}</td>
                  <td>{h.quantity}</td>
                  <td>{h.avgPrice.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</td>
                  <td>{h.currentPrice.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</td>
                  <td>{h.totalValue.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</td>
                  <td className={`font-semibold ${h.profitLoss >= 0 ? 'text-green' : 'text-red'}`}>
                    {h.profitLoss.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                  </td>
                  <td className={`font-semibold ${h.profitLossPct >= 0 ? 'text-green' : 'text-red'}`}>
                    {h.profitLossPct.toFixed(2)}%
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan="7" className="table-no-data">You have no holdings in your portfolio.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function TransactionHistory() {
  const { state } = useContext(AppContext);
  const { currentUser } = state;
  
  if (!currentUser) {
    return (
      <div className="page-spacing">
        <div className="card">
          <h2>Loading...</h2>
        </div>
      </div>
    );
  }
  
  const { transactions } = currentUser;
  
  const getRiskColor = (risk) => {
    if (risk === 'Low') return 'text-green';
    if (risk === 'Moderate') return 'text-yellow';
    if (risk === 'High') return 'text-red';
    return 'text-tertiary';
  };

  return (
    <div className="page-spacing">
      <div className="card">
        <div className="card-header">
          <h1>Transaction History</h1>
        </div>
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Symbol</th>
                <th>Quantity</th>
                <th>Price (₹)</th>
                <th>Total Value (₹)</th>
                <th>Risk Level</th>
              </tr>
            </thead>
            <tbody>
              {transactions.length > 0 ? transactions.map(t => (
                <tr key={t.id}>
                  <td className="text-sm">{new Date(t.date).toLocaleString()}</td>
                  <td className={`font-semibold ${t.type === 'BUY' ? 'text-green' : 'text-red'}`}>
                    {t.type}
                  </td>
                  <td className="table-symbol">{t.symbol}</td>
                  <td>{t.quantity}</td>
                  <td>{t.price.toLocaleString('en-IN')}</td>
                  <td>{(t.quantity * t.price).toLocaleString('en-IN')}</td>
                  <td className={`font-semibold ${getRiskColor(t.risk)}`}>
                    {t.risk}
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan="7" className="table-no-data">You have no transactions.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// --- MODAL COMPONENTS ---

function TradeModal({ symbol, type, onClose }) {
  const { state, dispatch } = useContext(AppContext);
  const { stocks, currentUser } = state;
  const [quantity, setQuantity] = useState(1);
  const [step, setStep] = useState(1);
  const [risk, setRisk] = useState('Low');
  const [loading, setLoading] = useState(false);
  
  const stock = stocks[symbol];
  const total = stock.price * quantity;
  
  const handleTrade = async () => {
    setLoading(true);
    try {
      const { data } = await userAPI.trade({ type, symbol, quantity, price: stock.price, risk });
      
      // Backend returns user object directly
      const user = data;
      
      // Normalize portfolio from array to object
      const portfolioObj = {};
      if (user.portfolio && Array.isArray(user.portfolio)) {
        user.portfolio.forEach(item => {
          portfolioObj[item.symbol] = {
            quantity: item.quantity,
            avgPrice: item.avgPrice
          };
        });
      }
      
      // Create transaction object for local state
      const newTransaction = {
        id: Date.now(),
        type,
        symbol,
        quantity,
        price: stock.price,
        risk,
        timestamp: new Date().toISOString()
      };
      
      dispatch({ 
        type: 'UPDATE_USER_DATA', 
        payload: {
          balance: user.balance,
          portfolio: portfolioObj,
          transaction: newTransaction
        }
      });
      dispatch({ 
        type: 'SET_SUCCESS', 
        payload: `Successfully ${type === 'BUY' ? 'bought' : 'sold'} ${quantity} shares of ${symbol}!` 
      });
      onClose();
    } catch (error) {
      const message = error.response?.data?.msg || error.response?.data?.message || 'Trade failed. Please try again.';
      dispatch({ type: 'SET_ERROR', payload: message });
      setLoading(false);
    }
  };
  
  const goToConfirm = () => {
    const priceFluctuation = Math.abs((stock.price - initialStockData[symbol].price) / initialStockData[symbol].price);
    let calculatedRisk = 'Low';
    if (priceFluctuation > 0.1) calculatedRisk = 'Moderate';
    if (priceFluctuation > 0.25) calculatedRisk = 'High';
    setRisk(calculatedRisk);
    setStep(2);
  };
  
  const maxSellable = currentUser.portfolio[symbol]?.quantity || 0;
  const maxBuyable = Math.floor(currentUser.balance / stock.price);
  const maxQuantity = type === 'BUY' ? maxBuyable : maxSellable;

  return (
    <Modal onClose={onClose} size="medium">
      <h2 className={`modal-header ${type === 'BUY' ? 'text-green' : 'text-red'}`}>
        {type} {symbol}
      </h2>
      
      {step === 1 && (
        <div className="modal-body">
          <div className="trade-details">
            <p>Current Price: <span>₹{stock.price.toLocaleString('en-IN')}</span></p>
            <p>Available Balance: <span>₹{currentUser.balance.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span></p>
            {type === 'SELL' && (
               <p>Shares Owned: <span>{maxSellable}</span></p>
            )}
          </div>
          
          <div className="form-group">
            <label className="form-label">Quantity</label>
            <input
              type="number"
              value={quantity}
              onChange={(e) => {
                let val = parseInt(e.target.value);
                if (val < 1) val = 1;
                if (val > maxQuantity) val = maxQuantity;
                setQuantity(val || 1);
              }}
              min="1"
              max={maxQuantity}
              className="form-input"
            />
            {type === 'BUY' && (
              <p className="text-sm text-tertiary" style={{ marginTop: '0.25rem', marginBottom: 0 }}>
                Max you can buy: {maxBuyable}
              </p>
            )}
          </div>
          
          <h3 className="font-semibold" style={{ fontSize: '1.25rem' }}>
            Total: ₹{total.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
          </h3>
          
          <div className="modal-footer">
            <button onClick={onClose} className="btn btn-secondary">Cancel</button>
            <button 
              onClick={goToConfirm} 
              disabled={quantity <= 0 || quantity > maxQuantity || isNaN(quantity)}
              className={`btn ${type === 'BUY' ? 'btn-primary' : 'btn-danger'}`}
            >
              Review Trade
            </button>
          </div>
        </div>
      )}
      
      {step === 2 && (
        <div className="modal-body" style={{ textAlign: 'center' }}>
          <h3 className="modal-header" style={{ textAlign: 'center' }}>Trade Confirmation</h3>
          <p>Please review your trade details.</p>
          
          <div style={{ padding: '1rem', backgroundColor: 'var(--bg-tertiary)', borderRadius: '0.5rem', textAlign: 'left', margin: '1rem 0' }}>
            <p>Action: <span className={`font-semibold ${type === 'BUY' ? 'text-green' : 'text-red'}`}>{type} {quantity} x {symbol}</span></p>
            <p>Price: <span className="font-semibold">@ ₹{stock.price.toLocaleString('en-IN')}</span></p>
            <p>Total: <span className="font-semibold">₹{total.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span></p>
          </div>
          
          <div className="risk-card">
            <h4 className="risk-card-header">
              <Shield size={20} />
              Risk Evaluation
            </h4>
            <p className={`risk-level ${
              risk === 'Low' ? 'text-green' :
              risk === 'Moderate' ? 'text-yellow' : 'text-red'
            }`}>
              {risk} Risk
            </p>
            <p className="text-sm text-tertiary" style={{ marginTop: '0.5rem', marginBottom: 0 }}>
              {risk === 'Low' && 'This trade appears to have low volatility based on recent price action.'}
              {risk === 'Moderate' && 'This stock has shown moderate price swings. Please invest cautiously.'}
              {risk === 'High' && 'Warning: This stock is experiencing high volatility. This is a high-risk trade.'}
            </p>
          </div>
          
          <div className="modal-footer" style={{ justifyContent: 'center' }}>
            <button onClick={() => setStep(1)} className="btn btn-secondary" disabled={loading}>Back</button>
            <button 
              onClick={handleTrade}
              className={`btn ${type === 'BUY' ? 'btn-primary' : 'btn-danger'}`}
              disabled={loading}
            >
              {loading ? 'Processing...' : `Confirm ${type}`}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function StockChartModal({ symbol, onClose }) {
  const { state } = useContext(AppContext);
  const [timeframe, setTimeframe] = useState('day');
  const stock = state.stocks[symbol];
  const history = state.historicalData[symbol];
  
  if (!stock || !history) return null;
  
  const data = history[timeframe];
  
  const timeframes = [
    { key: 'day', label: '1D' },
    { key: 'week', label: '1W' },
    { key: 'year', label: '1Y' },
  ];
  
  const priceColor = stock.price >= data[0].price ? 'text-green' : 'text-red';
  const priceChange = stock.price - data[0].price;
  const priceChangePct = (priceChange / data[0].price) * 100;

  return (
    <Modal onClose={onClose} size="large">
      <div className="chart-header">
        <div>
          <h2 className="modal-header" style={{ marginBottom: 0 }}>{stock.name} ({symbol})</h2>
          <div className="chart-price-info">
            <span className={`chart-price ${priceColor}`}>₹{stock.price.toLocaleString('en-IN')}</span>
            <span className={`chart-change ${priceColor}`}>
              {priceChange >= 0 ? '+' : ''}
              {priceChange.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
              {' '}({priceChangePct.toFixed(2)}%)
            </span>
            <span className="text-sm text-tertiary">({timeframe === 'day' ? 'Today' : `Past ${timeframe}`})</span>
          </div>
        </div>
        <div className="chart-timeframe">
          {timeframes.map(tf => (
            <button
              key={tf.key}
              onClick={() => setTimeframe(tf.key)}
              className={`chart-timeframe-btn ${timeframe === tf.key ? 'chart-timeframe-btn-active' : ''}`}
            >
              {tf.label}
            </button>
          ))}
        </div>
      </div>
      <div className="chart-container">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 5, right: 20, left: -20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
            <XAxis dataKey="name" stroke="var(--text-tertiary)" fontSize={12} />
            <YAxis stroke="var(--text-tertiary)" fontSize={12} domain={['dataMin - 10', 'dataMax + 10']} />
            <Tooltip
              contentStyle={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '0.5rem' }}
              labelStyle={{ color: 'var(--text-primary)', fontWeight: 'bold' }}
              itemStyle={{ color: 'var(--text-secondary)' }}
              formatter={(value) => [`₹${value.toLocaleString('en-IN')}`, 'Price']}
            />
            <Line 
              type="monotone" 
              dataKey="price" 
              stroke={priceColor.includes('green') ? 'var(--accent-green)' : 'var(--accent-red)'} 
              strokeWidth={2} 
              dot={false} 
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Modal>
  );
}

function AddFundsModal({ onClose }) {
  const { dispatch } = useContext(AppContext);
  const [amount, setAmount] = useState(10000);
  const [loading, setLoading] = useState(false);
  
  const handleAdd = async () => {
    setLoading(true);
    try {
      const { data } = await userAPI.addFunds(Number(amount));
      dispatch({ 
        type: 'UPDATE_USER_DATA', 
        payload: { balance: data.balance }
      });
      dispatch({ 
        type: 'SET_SUCCESS', 
        payload: `Successfully added ₹${Number(amount).toLocaleString('en-IN')} to your account!` 
      });
      onClose();
    } catch (error) {
      const message = error.response?.data?.message || 'Failed to add funds. Please try again.';
      dispatch({ type: 'SET_ERROR', payload: message });
      setLoading(false);
    }
  };
  
  const presetAmounts = [5000, 10000, 25000, 50000];

  return (
    <Modal onClose={onClose} size="medium">
      <h2 className="modal-header">Add Virtual Funds</h2>
      <div className="modal-body">
        <p>Select or enter an amount to add to your virtual balance. This is for simulation only.</p>
        
        <div className="preset-amounts">
          {presetAmounts.map(amt => (
            <button
              key={amt}
              onClick={() => setAmount(amt)}
              className={`btn ${amount === amt ? 'btn-primary' : 'btn-secondary'}`}
            >
              ₹{amt.toLocaleString('en-IN')}
            </button>
          ))}
        </div>
        
        <div className="form-group">
          <label className="form-label">Custom Amount</label>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            min="100"
            step="100"
            className="form-input"
          />
        </div>
      </div>
      
      <div className="modal-footer">
        <button onClick={onClose} className="btn btn-secondary" disabled={loading}>Cancel</button>
        <button onClick={handleAdd} className="btn btn-primary" disabled={loading}>
          {loading ? 'Adding...' : `Add ₹${Number(amount).toLocaleString('en-IN')}`}
        </button>
      </div>
    </Modal>
  );
}

function AdminDashboard() {
  const { state } = useContext(AppContext);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    const loadAdminData = async () => {
      try {
        const { data } = await adminAPI.getUsers();
        setUsers(data);
      } catch (error) {
        console.error('Failed to load admin data:', error);
      } finally {
        setLoading(false);
      }
    };
    loadAdminData();
  }, []);
  
  if (loading) {
    return (
      <div className="page-spacing">
        <div className="card">
          <h2>Loading admin data...</h2>
        </div>
      </div>
    );
  }
  
  const nonAdminUsers = users.filter(u => !u.isAdmin);
  const totalUserCount = nonAdminUsers.length;
  
  const totalInvested = nonAdminUsers.reduce((sum, user) => {
    if (!user.portfolio) return sum;
    
    // Handle both array and object portfolio formats
    const portfolioArray = Array.isArray(user.portfolio) ? user.portfolio : Object.entries(user.portfolio).map(([symbol, data]) => ({ symbol, ...data }));
    
    const portfolioValue = portfolioArray.reduce((acc, holding) => {
      const stock = state.stocks[holding.symbol];
      const currentPrice = stock ? stock.price : holding.avgPrice;
      return acc + (holding.quantity * currentPrice);
    }, 0);
    return sum + portfolioValue;
  }, 0);
  
  const userGrowthData = [
    { name: 'Jan', users: 10 }, { name: 'Feb', users: 15 }, { name: 'Mar', users: 22 },
    { name: 'Apr', users: 30 }, { name: 'May', users: 45 },
    { name: 'Jun', users: (nonAdminUsers.length > 60 ? 0 : 60) + totalUserCount },
  ];

  return (
    <div className="page-spacing">
      <h1 style={{ marginBottom: '1.5rem' }}>Admin Dashboard</h1>
      
      <div className="admin-grid">
        <div className="admin-stat-card">
          <div className="admin-stat-icon admin-stat-icon-blue">
            <Users size={28} />
          </div>
          <div>
            <div className="admin-stat-label">Total Users</div>
            <div className="admin-stat-value">{totalUserCount}</div>
          </div>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-icon admin-stat-icon-green">
            <DollarSign size={28} />
          </div>
          <div>
            <div className="admin-stat-label">Total Virtual Invested</div>
            <div className="admin-stat-value">
              ₹{totalInvested.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
            </div>
          </div>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-icon admin-stat-icon-yellow">
            <Briefcase size={28} />
          </div>
          <div>
            <div className="admin-stat-label">Total Stocks</div>
            <div className="admin-stat-value">{Object.keys(state.stocks).length}</div>
          </div>
        </div>
      </div>
      
      <div className="admin-grid" style={{ gridTemplateColumns: '1fr' }}>
        <div className="card">
          <div className="card-header">
            <h2>User Growth</h2>
          </div>
          <div className="card-body">
            <div className="admin-chart-container">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={userGrowthData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                  <XAxis dataKey="name" stroke="var(--text-tertiary)" fontSize={12} />
                  <YAxis stroke="var(--text-tertiary)" fontSize={12} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '0.5rem' }}
                    labelStyle={{ color: 'var(--text-primary)', fontWeight: 'bold' }}
                  />
                  <Legend />
                  <Bar dataKey="users" fill="var(--accent-blue)" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
        
        <div className="card">
          <div className="card-header">
            <h2>User List</h2>
          </div>
          <div className="admin-table-container table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Phone</th>
                  <th>Balance (₹)</th>
                </tr>
              </thead>
              <tbody>
                {nonAdminUsers.map(user => (
                  <tr key={user.id}>
                    <td className="table-symbol">{user.name}</td>
                    <td>{user.email}</td>
                    <td className={user.phone ? '' : 'text-tertiary'}>
                      {user.phone || 'N/A'}
                    </td>
                    <td>{user.balance.toLocaleString('en-IN')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

// --- UTILITY COMPONENTS ---

function Modal({ children, onClose, size = 'medium' }) {
  const sizeClass = size === 'large' ? 'modal-content-large' : 'modal-content-medium';
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div 
        className={`modal-content ${sizeClass}`}
        onClick={(e) => e.stopPropagation()}
      >
        <button onClick={onClose} className="modal-close-btn">&times;</button>
        {children}
      </div>
    </div>
  );
}

function ErrorNotification({ message }) {
  const { dispatch } = useContext(AppContext);
  
  useEffect(() => {
    const timer = setTimeout(() => {
      dispatch({ type: 'CLEAR_ERROR' });
    }, 5000);
    return () => clearTimeout(timer);
  }, [dispatch]);
  
  return (
    <div className="error-notification">
      {message}
    </div>
  );
}

function SuccessNotification({ message }) {
  const { dispatch } = useContext(AppContext);
  
  useEffect(() => {
    const timer = setTimeout(() => {
      dispatch({ type: 'CLEAR_SUCCESS' });
    }, 3000);
    return () => clearTimeout(timer);
  }, [dispatch]);
  
  return (
    <div className="success-notification">
      {message}
    </div>
  );
}

function LoadingSpinner() {
  return (
    <div className="loading-spinner-container">
      <div className="spinner"></div>
    </div>
  );
}
