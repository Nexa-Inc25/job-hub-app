/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
import { createTheme, alpha } from '@mui/material/styles';
import { blue, grey, green, orange } from '@mui/material/colors';

// Create theme based on mode
export const getTheme = (mode) =>
  createTheme({
    palette: {
      mode,
      primary: {
        main: mode === 'dark' ? blue[400] : blue[700],
        light: mode === 'dark' ? blue[300] : blue[500],
        dark: mode === 'dark' ? blue[600] : blue[900],
      },
      secondary: {
        main: mode === 'dark' ? orange[400] : orange[700],
      },
      success: {
        main: mode === 'dark' ? green[400] : green[700],
      },
      background: {
        default: mode === 'dark' ? '#121212' : '#f5f7fa',
        paper: mode === 'dark' ? '#1e1e1e' : '#ffffff',
      },
      text: {
        primary: mode === 'dark' ? '#ffffff' : '#1a1a1a',
        // grey[700] (#616161) provides 5.74:1 contrast ratio on #f5f7fa (WCAG AA compliant)
        secondary: mode === 'dark' ? grey[400] : grey[700],
      },
    },
    typography: {
      fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
      h4: {
        fontWeight: 700,
      },
      h5: {
        fontWeight: 600,
      },
      h6: {
        fontWeight: 600,
      },
    },
    shape: {
      borderRadius: 12,
    },
    components: {
      MuiPaper: {
        styleOverrides: {
          root: {
            backgroundImage: 'none',
            ...(mode === 'dark' && {
              backgroundColor: alpha('#1e1e1e', 0.9),
              backdropFilter: 'blur(10px)',
            }),
          },
        },
      },
      MuiCard: {
        styleOverrides: {
          root: {
            boxShadow: mode === 'dark' 
              ? '0 4px 20px rgba(0,0,0,0.5)' 
              : '0 2px 12px rgba(0,0,0,0.08)',
            transition: 'transform 0.2s ease, box-shadow 0.2s ease',
            '&:hover': {
              transform: 'translateY(-2px)',
              boxShadow: mode === 'dark' 
                ? '0 8px 30px rgba(0,0,0,0.6)' 
                : '0 4px 20px rgba(0,0,0,0.12)',
            },
          },
        },
      },
      MuiButton: {
        styleOverrides: {
          root: {
            textTransform: 'none',
            fontWeight: 600,
            borderRadius: 8,
          },
        },
      },
      MuiAppBar: {
        styleOverrides: {
          root: {
            backgroundImage: 'none',
            backgroundColor: mode === 'dark' ? '#1e1e1e' : blue[700],
          },
        },
      },
      MuiChip: {
        styleOverrides: {
          root: {
            fontWeight: 500,
          },
        },
      },
      MuiTextField: {
        styleOverrides: {
          root: {
            '& .MuiOutlinedInput-root': {
              borderRadius: 8,
            },
          },
        },
      },
    },
  });

// Helper to get/set dark mode preference
export const getDarkModePreference = () => {
  const stored = localStorage.getItem('darkMode');
  if (stored !== null) {
    return stored === 'true';
  }
  // Default to system preference
  return globalThis.matchMedia?.('(prefers-color-scheme: dark)')?.matches ?? false;
};

export const setDarkModePreference = (isDark) => {
  localStorage.setItem('darkMode', isDark.toString());
};
