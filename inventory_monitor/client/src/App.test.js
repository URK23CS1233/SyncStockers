import { render, screen } from '@testing-library/react';
import App from './App';
import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';

test('renders the StockLens sign-in screen when logged out', () => {
  localStorage.removeItem('sl_token');
  render(
    <AuthProvider>
      <ToastProvider>
        <App />
      </ToastProvider>
    </AuthProvider>
  );
  expect(screen.getByText(/Welcome back/i)).toBeInTheDocument();
  expect(screen.getByText(/Use demo account/i)).toBeInTheDocument();
});
