// src/components/shared/themeUtils.js
// Shared theme utilities to reduce duplication

/**
 * Get theme-aware colors based on light/dark mode
 * @param {string} mode - 'light' or 'dark'
 * @returns {Object} Theme color object
 */
export const getThemeColors = (mode) => ({
  cardBg: mode === 'dark' ? '#1e1e2e' : '#ffffff',
  textPrimary: mode === 'dark' ? '#e2e8f0' : '#1e293b',
  textSecondary: mode === 'dark' ? '#94a3b8' : '#64748b',
  borderColor: mode === 'dark' ? '#334155' : '#e2e8f0',
  chartGridColor: mode === 'dark' ? '#334155' : '#e5e7eb',
  pageBg: mode === 'dark' ? '#0f0f1a' : '#f8fafc',
  dialogBg: mode === 'dark' ? '#1e1e2e' : '#ffffff',
});

/**
 * Common color palette for charts
 */
export const CHART_COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899'];

/**
 * Job status colors
 */
export const STATUS_COLORS = {
  new: '#3b82f6',
  assigned_to_gf: '#8b5cf6',
  pre_fielding: '#f59e0b',
  scheduled: '#06b6d4',
  in_progress: '#22c55e',
  pending_gf_review: '#eab308',
  pending_qa_review: '#f59e0b',
  pending_pm_approval: '#f97316',
  ready_to_submit: '#10b981',
  submitted: '#6366f1',
  billed: '#8b5cf6',
  invoiced: '#22c55e',
  stuck: '#ef4444',
  // Audit statuses
  pending_qa: '#f59e0b',
  accepted: '#ef4444',
  disputed: '#22c55e',
  correction_assigned: '#8b5cf6',
  correction_submitted: '#06b6d4',
  resolved: '#22c55e',
  closed: '#6366f1',
};

