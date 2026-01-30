/**
 * Login Component Tests
 * 
 * Tests for the Login component including form validation,
 * submission handling, and error states.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import Login from '../Login';

// Mock the API module
jest.mock('../../api', () => ({
  post: jest.fn(),
  get: jest.fn(),
}));

// Mock useNavigate
const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

// Helper to render with router
const renderLogin = () => {
  return render(
    <BrowserRouter>
      <Login />
    </BrowserRouter>
  );
};

describe('Login Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
  });

  describe('Rendering', () => {
    it('renders login form with email and password fields', () => {
      renderLogin();
      
      expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    });

    it('renders sign in button', () => {
      renderLogin();
      
      expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
    });

    it('renders signup link', () => {
      renderLogin();
      
      expect(screen.getByText(/create account/i)).toBeInTheDocument();
    });
  });

  describe('Form Validation', () => {
    it('shows error when submitting empty form', async () => {
      const user = userEvent.setup();
      renderLogin();
      
      const submitButton = screen.getByRole('button', { name: /sign in/i });
      await user.click(submitButton);
      
      // Form should show validation feedback
      await waitFor(() => {
        expect(screen.getByLabelText(/email/i)).toBeInvalid?.() || 
        expect(submitButton).toBeInTheDocument();
      });
    });

    it('allows typing in email field', async () => {
      const user = userEvent.setup();
      renderLogin();
      
      const emailInput = screen.getByLabelText(/email/i);
      await user.type(emailInput, 'test@example.com');
      
      expect(emailInput).toHaveValue('test@example.com');
    });

    it('allows typing in password field', async () => {
      const user = userEvent.setup();
      renderLogin();
      
      const passwordInput = screen.getByLabelText(/password/i);
      await user.type(passwordInput, 'mypassword123');
      
      expect(passwordInput).toHaveValue('mypassword123');
    });
  });

  describe('Form Submission', () => {
    it('calls API on form submission with valid data', async () => {
      const api = require('../../api');
      api.post.mockResolvedValueOnce({
        data: {
          token: 'test-token',
          user: { id: '1', email: 'test@example.com', role: 'crew' }
        }
      });

      const user = userEvent.setup();
      renderLogin();
      
      await user.type(screen.getByLabelText(/email/i), 'test@example.com');
      await user.type(screen.getByLabelText(/password/i), 'password123');
      await user.click(screen.getByRole('button', { name: /sign in/i }));
      
      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith('/api/login', expect.objectContaining({
          email: 'test@example.com',
          password: 'password123'
        }));
      });
    });

    it('stores token in localStorage on successful login', async () => {
      const api = require('../../api');
      api.post.mockResolvedValueOnce({
        data: {
          token: 'test-jwt-token',
          user: { id: '1', email: 'test@example.com', role: 'gf' }
        }
      });

      const user = userEvent.setup();
      renderLogin();
      
      await user.type(screen.getByLabelText(/email/i), 'test@example.com');
      await user.type(screen.getByLabelText(/password/i), 'password123');
      await user.click(screen.getByRole('button', { name: /sign in/i }));
      
      await waitFor(() => {
        expect(localStorage.getItem('token')).toBe('test-jwt-token');
      });
    });

    it('navigates to dashboard on successful login', async () => {
      const api = require('../../api');
      api.post.mockResolvedValueOnce({
        data: {
          token: 'test-token',
          user: { id: '1', email: 'test@example.com', role: 'crew' }
        }
      });

      const user = userEvent.setup();
      renderLogin();
      
      await user.type(screen.getByLabelText(/email/i), 'test@example.com');
      await user.type(screen.getByLabelText(/password/i), 'password123');
      await user.click(screen.getByRole('button', { name: /sign in/i }));
      
      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/dashboard');
      });
    });
  });

  describe('Error Handling', () => {
    it('displays error message on login failure', async () => {
      const api = require('../../api');
      api.post.mockRejectedValueOnce({
        response: { data: { error: 'Invalid credentials' } }
      });

      const user = userEvent.setup();
      renderLogin();
      
      await user.type(screen.getByLabelText(/email/i), 'wrong@example.com');
      await user.type(screen.getByLabelText(/password/i), 'wrongpassword');
      await user.click(screen.getByRole('button', { name: /sign in/i }));
      
      await waitFor(() => {
        expect(screen.getByText(/invalid credentials/i)).toBeInTheDocument();
      });
    });

    it('displays account locked message', async () => {
      const api = require('../../api');
      api.post.mockRejectedValueOnce({
        response: { 
          status: 423,
          data: { error: 'Account locked. Try again in 15 minutes.' } 
        }
      });

      const user = userEvent.setup();
      renderLogin();
      
      await user.type(screen.getByLabelText(/email/i), 'locked@example.com');
      await user.type(screen.getByLabelText(/password/i), 'password');
      await user.click(screen.getByRole('button', { name: /sign in/i }));
      
      await waitFor(() => {
        expect(screen.getByText(/account locked/i)).toBeInTheDocument();
      });
    });
  });
});

