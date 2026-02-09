/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
// src/components/shared/index.js
// Export all shared components

export { default as StatCard } from './StatCard';
export { default as ThemeToggle } from './ThemeToggle';
export { default as AuthLayout } from './AuthLayout';
export { default as LoadingState } from './LoadingState';
export { default as ErrorState } from './ErrorState';
export { default as AdminPageHeader } from './AdminPageHeader';
export { getThemeColors, CHART_COLORS, STATUS_COLORS, STATUS_LABELS, ROLE_COLORS, ROLE_LABELS, PRIORITY_COLORS } from './themeUtils';
export { 
  getPhotoUrl, 
  getDocumentUrl, 
  downloadBlob, 
  openMailto, 
  tryWebShare, 
  exportFolderToEmail 
} from './exportUtils';

