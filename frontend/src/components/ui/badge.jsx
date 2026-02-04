/**
 * FieldLedger - Badge Component
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 */

import React from 'react';
import PropTypes from 'prop-types';
import { cva } from 'class-variance-authority';
import { cn } from '../../lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground',
        secondary: 'border-transparent bg-secondary text-secondary-foreground',
        destructive: 'border-transparent bg-destructive text-destructive-foreground',
        outline: 'text-foreground',
        success: 'border-transparent bg-success/10 text-success',
        warning: 'border-transparent bg-warning/10 text-warning',
        info: 'border-transparent bg-info/10 text-info',
        // Status variants for jobs
        new: 'border-transparent bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
        active: 'border-transparent bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
        pending: 'border-transparent bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
        completed: 'border-transparent bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
        billed: 'border-transparent bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400',
        stuck: 'border-transparent bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

const Badge = React.forwardRef(({ className, variant, ...props }, ref) => {
  return (
    <div ref={ref} className={cn(badgeVariants({ variant }), className)} {...props} />
  );
});

Badge.displayName = 'Badge';

Badge.propTypes = {
  className: PropTypes.string,
  variant: PropTypes.oneOf([
    'default',
    'secondary',
    'destructive',
    'outline',
    'success',
    'warning',
    'info',
    'new',
    'active',
    'pending',
    'completed',
    'billed',
    'stuck',
  ]),
};

// Status badge helper - maps job status to badge variant
const getStatusVariant = (status) => {
  const statusMap = {
    new: 'new',
    assigned_to_gf: 'info',
    pre_fielding: 'warning',
    scheduled: 'info',
    in_progress: 'active',
    pending_gf_review: 'warning',
    pending_qa_review: 'warning',
    pending_pm_approval: 'warning',
    ready_to_submit: 'success',
    submitted: 'completed',
    go_back: 'stuck',
    billed: 'billed',
    invoiced: 'success',
    stuck: 'stuck',
    pending: 'pending',
  };
  return statusMap[status] || 'secondary';
};

const StatusBadge = ({ status, className, ...props }) => {
  const variant = getStatusVariant(status);
  const label = status?.replaceAll('_', ' ') || 'Unknown';
  
  return (
    <Badge variant={variant} className={cn('capitalize', className)} {...props}>
      {label}
    </Badge>
  );
};

StatusBadge.propTypes = {
  status: PropTypes.string,
  className: PropTypes.string,
};

export { Badge, badgeVariants, StatusBadge, getStatusVariant };

