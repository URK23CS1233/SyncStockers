import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Products from './pages/Products';
import ProductDetail from './pages/ProductDetail';
import Selectors from './pages/Selectors';
import Alerts from './pages/Alerts';
import { PageLoading } from './components/ui';

function Protected({ children }) {
  const { user, booting } = useAuth();
  if (booting) return <PageLoading label="Booting StockLens…" />;
  if (!user) return <Navigate to="/login" replace />;
  return <Layout>{children}</Layout>;
}

function RedirectIfAuthed({ children }) {
  const { user, booting } = useAuth();
  if (booting) return <PageLoading label="Booting StockLens…" />;
  if (user) return <Navigate to="/" replace />;
  return children;
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/login"
          element={
            <RedirectIfAuthed>
              <Login />
            </RedirectIfAuthed>
          }
        />
        <Route
          path="/"
          element={
            <Protected>
              <Dashboard />
            </Protected>
          }
        />
        <Route
          path="/inventory"
          element={
            <Protected>
              <Products />
            </Protected>
          }
        />
        <Route
          path="/inventory/:id"
          element={
            <Protected>
              <ProductDetail />
            </Protected>
          }
        />
        <Route
          path="/selectors"
          element={
            <Protected>
              <Selectors />
            </Protected>
          }
        />
        <Route
          path="/alerts"
          element={
            <Protected>
              <Alerts />
            </Protected>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
