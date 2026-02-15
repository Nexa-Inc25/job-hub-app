/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
/**
 * Shared helper functions and constants for Dashboard components.
 *
 * @module components/dashboard/dashboardHelpers
 */

// Status colors for new workflow + legacy statuses
export const STATUS_COLORS_MAP = {
  new: 'warning',
  assigned_to_gf: 'info',
  pre_fielding: 'info',
  scheduled: 'primary',
  stuck: 'error',
  in_progress: 'primary',
  pending_gf_review: 'warning',
  pending_qa_review: 'warning',
  pending_pm_approval: 'warning',
  ready_to_submit: 'success',
  submitted: 'success',
  go_back: 'error',
  billed: 'secondary',
  invoiced: 'default',
  pending: 'warning',
  'pre-field': 'info',
  'in-progress': 'primary',
  completed: 'success',
};

// Human-readable status labels
export const STATUS_LABELS_MAP = {
  new: 'New',
  assigned_to_gf: 'Assigned to GF',
  pre_fielding: 'Pre-Fielding',
  scheduled: 'Scheduled',
  stuck: 'Stuck',
  in_progress: 'In Progress',
  pending_gf_review: 'Awaiting GF Review',
  pending_qa_review: 'Awaiting QA Review',
  pending_pm_approval: 'Awaiting PM Approval',
  ready_to_submit: 'Ready to Submit',
  submitted: 'Submitted',
  go_back: 'Go-Back',
  billed: 'Billed',
  invoiced: 'Invoiced',
  pending: 'Pending',
  'pre-field': 'Pre-Field',
  'in-progress': 'In Progress',
  completed: 'Completed',
};

export const needsPreField = (status) =>
  ['new', 'assigned_to_gf', 'pending', 'pre_fielding', 'pre-field'].includes(status);

export const getDependencyStatusColor = (status) => {
  const colorMap = { not_required: 'success', scheduled: 'info', required: 'warning', check: 'default' };
  return colorMap[status] || 'default';
};

export const getDependencyChipSx = (status) => {
  const baseStyles = { fontSize: '0.65rem', height: 20, fontWeight: 600 };
  if (status === 'warning' || status === 'required') {
    return { ...baseStyles, borderColor: '#b45309', color: '#92400e', bgcolor: '#fef3c7' };
  }
  if (status === 'default' || status === 'check') {
    return { ...baseStyles, borderColor: '#374151', color: '#1f2937', bgcolor: '#f3f4f6' };
  }
  return baseStyles;
};

export const getDependencyStatusLabel = (status) => {
  const labels = { required: 'REQUIRED', check: 'CHECK', scheduled: 'SCHEDULED', not_required: 'NOT REQUIRED' };
  return labels[status] || status;
};

export const getDependencyTypeLabel = (type) => {
  const labels = {
    usa: 'USA', vegetation: 'Vegetation', traffic_control: 'Traffic Control',
    no_parks: 'No Parks', cwc: 'CWC', afw_type: 'AFW Type',
    special_equipment: 'Special Equipment', civil: 'Civil',
  };
  return labels[type] || type;
};

// Pre-field checklist items
export const preFieldItems = [
  { key: 'usa', label: 'USA', description: 'Underground utility locate needed' },
  { key: 'vegetation', label: 'Vegetation', description: 'Vegetation management needed' },
  { key: 'traffic_control', label: 'Traffic Control', description: 'TC plan or flaggers needed' },
  { key: 'no_parks', label: 'No Parks', description: 'No parks restriction applies' },
  { key: 'cwc', label: 'CWC', description: 'CWC coordination required' },
  { key: 'afw_type', label: 'AFW Type', description: 'AFW type specification (if CWC)' },
  { key: 'special_equipment', label: 'Special Equipment', description: 'Special equipment needed' },
  { key: 'civil', label: 'Civil', description: 'Trenching, boring, or excavation' },
];

export const statusCycle = ['required', 'check', 'scheduled', 'not_required'];

export const getLocalDateString = (date) => {
  const d = new Date(date);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
};

export const createInitialChecklist = () =>
  preFieldItems.reduce((acc, item) => {
    acc[item.key] = { checked: false, notes: '' };
    return acc;
  }, {});

export const shouldShowGFView = (userRole, isAdmin, filter, search) => {
  const hasGFPermissions = userRole === 'gf' || userRole === 'admin' || userRole === 'pm' || isAdmin;
  const isUnfilteredView = filter === 'all' && !search;
  return hasGFPermissions && isUnfilteredView;
};

export const canManageJobs = (userRole, isAdmin, isSuperAdmin = false) =>
  isAdmin || isSuperAdmin || ['gf', 'pm'].includes(userRole);

export const canMarkAsStuck = (job) => {
  if (!job || job.status === 'stuck') return false;
  const terminalStatuses = ['ready_to_submit', 'submitted', 'billed', 'invoiced'];
  return !terminalStatuses.includes(job.status);
};

export const getTagBackgroundColor = (tagType) => {
  const colorMap = { A: '#d32f2f', E: '#f57c00', B: '#1976d2' };
  return colorMap[tagType];
};

export const getTagDueDateColor = (dueDate) => {
  const due = new Date(dueDate);
  const now = new Date();
  const oneWeekFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  if (due < now) return 'error';
  if (due < oneWeekFromNow) return 'warning';
  return 'default';
};

export const getRoadAccessLabel = (roadAccess) => {
  const labelMap = { accessible: 'Road Access', backyard: 'Backyard' };
  return labelMap[roadAccess] || roadAccess;
};

export const getRoadAccessColor = (roadAccess) => {
  const colorMap = { accessible: 'success', 'non-accessible': 'error' };
  return colorMap[roadAccess] || 'warning';
};

export const getWelcomeMessage = (userName) => {
  if (!userName) return 'Welcome Back!';
  return `Welcome back, ${userName.split(' ')[0]}!`;
};

export const parseTokenPayload = (token) => {
  if (!token) return null;
  try {
    return JSON.parse(atob(token.split('.')[1]));
  } catch {
    return null;
  }
};

export const extractUserPermissions = (payload) => {
  if (!payload) return { isAdmin: false, isSuperAdmin: false, userRole: null, canApprove: false };
  return {
    isAdmin: payload.isAdmin || false,
    isSuperAdmin: payload.isSuperAdmin || false,
    userRole: payload.role || null,
    canApprove: payload.canApprove || payload.isAdmin || ['gf', 'pm', 'admin'].includes(payload.role),
  };
};

export const getJobDisplayTitle = (job) => job?.title || job?.pmNumber || 'this work order';

// Job categorization predicates
export const isPreFieldingInProgress = (job) =>
  ['pre_fielding', 'pre-field'].includes(job.status) && !job.assignedTo && !job.crewScheduledDate;

export const isPendingPreField = (job) => ['new', 'assigned_to_gf', 'pending'].includes(job.status);

export const needsScheduling = (job) =>
  ['pre_fielding', 'pre-field'].includes(job.status) && job.assignedTo && !job.crewScheduledDate;

export const isStuck = (job) => job.status === 'stuck';

export const isScheduledForDate = (job, dateStr) => {
  if (!job.crewScheduledDate) return false;
  return getLocalDateString(job.crewScheduledDate) === dateStr && ['scheduled', 'in_progress', 'in-progress'].includes(job.status);
};

export const isScheduledAfterDate = (job, dateStr) => {
  if (!job.crewScheduledDate) return false;
  return getLocalDateString(job.crewScheduledDate) > dateStr && ['scheduled', 'in_progress'].includes(job.status);
};

export const getAssignmentDataFromJob = (job) => ({
  assignedTo: job?.assignedTo?._id || job?.assignedTo || '',
  crewScheduledDate: job?.crewScheduledDate ? job.crewScheduledDate.split('T')[0] : '',
  crewScheduledEndDate: job?.crewScheduledEndDate ? job.crewScheduledEndDate.split('T')[0] : '',
  assignmentNotes: job?.assignmentNotes || '',
});

export const prepareAssignmentDataForApi = (assignmentData) => {
  const data = { ...assignmentData };
  if (data.crewScheduledDate) data.crewScheduledDate = new Date(data.crewScheduledDate + 'T12:00:00').toISOString();
  if (data.crewScheduledEndDate) data.crewScheduledEndDate = new Date(data.crewScheduledEndDate + 'T12:00:00').toISOString();
  return data;
};

export const EMPTY_ASSIGNMENT_DATA = { assignedTo: '', crewScheduledDate: '', crewScheduledEndDate: '', assignmentNotes: '' };

export const hasTagsOrLabels = (job) => job.ecTag?.tagType || job.ecTag?.tagDueDate || job.preFieldLabels;

export const renderECTagChips = (job) => {
  const chips = [];
  if (job.ecTag?.tagType) {
    chips.push({ key: 'ec-tag-type', label: `${job.ecTag.tagType}-TAG`, color: ['A', 'E', 'emergency'].includes(job.ecTag.tagType) ? 'error' : 'default', sx: { height: 22, fontWeight: 700, bgcolor: getTagBackgroundColor(job.ecTag.tagType), color: ['A', 'E', 'B'].includes(job.ecTag.tagType) ? 'white' : undefined } });
  }
  if (job.ecTag?.tagDueDate) {
    chips.push({ key: 'ec-due-date', label: `Due: ${new Date(job.ecTag.tagDueDate).toLocaleDateString()}`, color: getTagDueDateColor(job.ecTag.tagDueDate), variant: 'outlined', sx: { height: 22, fontWeight: 600 } });
  }
  if (job.ecTag?.programType) {
    chips.push({ key: 'ec-program', label: job.ecTag.programCode || job.ecTag.programType.replace('-', ' '), variant: 'outlined', sx: { height: 22, fontSize: '0.65rem' } });
  }
  return chips;
};

export const renderPreFieldChipData = (job) => {
  const chips = [];
  const labels = job.preFieldLabels;
  if (!labels) return chips;
  if (labels.constructionType) {
    chips.push({ key: 'construction-type', label: labels.constructionType.toUpperCase(), sx: { height: 22, bgcolor: labels.constructionType === 'underground' ? '#795548' : '#4caf50', color: 'white' } });
  }
  if (labels.roadAccess) {
    chips.push({ key: 'road-access', label: getRoadAccessLabel(labels.roadAccess), color: getRoadAccessColor(labels.roadAccess), variant: 'outlined', sx: { height: 22 } });
  }
  if (labels.craneRequired) {
    chips.push({ key: 'crane-required', label: labels.craneType || 'CRANE', sx: { height: 22, bgcolor: '#ff5722', color: 'white', fontWeight: 700 } });
  }
  if (labels.poleWork) {
    chips.push({ key: 'pole-work', label: `Pole ${labels.poleWork}`, variant: 'outlined', sx: { height: 22 } });
  }
  return chips;
};
