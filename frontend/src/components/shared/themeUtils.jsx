/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
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
  // Table/row backgrounds for hover and headers
  rowHoverBg: mode === 'dark' ? '#252538' : '#f8fafc',
  tableHeaderBg: mode === 'dark' ? '#1a1a28' : '#f8fafc',
  sectionHeaderBg: mode === 'dark' ? '#252538' : '#f8fafc',
  sectionHeaderHoverBg: mode === 'dark' ? '#2a2a40' : '#f1f5f9',
});

/**
 * Common color palette for charts
 */
export const CHART_COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899'];

/**
 * User role colors
 */
export const ROLE_COLORS = {
  admin: '#6366f1',
  pm: '#8b5cf6',
  gf: '#f59e0b',
  foreman: '#22c55e',
  crew: '#64748b',
};

/**
 * User role labels
 */
export const ROLE_LABELS = {
  admin: 'Admin',
  pm: 'Project Manager',
  gf: 'General Foreman',
  foreman: 'Foreman',
  crew: 'Crew',
};

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
  go_back: '#ef4444',
  billed: '#8b5cf6',
  invoiced: '#22c55e',
  stuck: '#ef4444',
  pending: '#64748b',
  // Audit statuses
  pending_qa: '#f59e0b',
  accepted: '#ef4444',
  disputed: '#22c55e',
  correction_assigned: '#8b5cf6',
  correction_submitted: '#06b6d4',
  resolved: '#22c55e',
  closed: '#6366f1',
};

/**
 * Job status labels
 */
export const STATUS_LABELS = {
  new: 'New',
  assigned_to_gf: 'Assigned to GF',
  pre_fielding: 'Pre-Fielding',
  scheduled: 'Scheduled',
  in_progress: 'In Progress',
  pending_gf_review: 'GF Review',
  pending_qa_review: 'QA Review',
  pending_pm_approval: 'PM Approval',
  ready_to_submit: 'Ready to Submit',
  submitted: 'Submitted',
  go_back: 'Go-Back',
  billed: 'Billed',
  invoiced: 'Invoiced',
  stuck: 'Stuck',
  pending: 'Pending',
};

/**
 * Priority colors
 */
export const PRIORITY_COLORS = {
  emergency: '#ef4444',
  high: '#f59e0b',
  medium: '#6366f1',
  low: '#22c55e',
};

