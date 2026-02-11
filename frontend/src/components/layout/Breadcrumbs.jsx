/**
 * FieldLedger - Breadcrumbs Component
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 */

import React from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { cn } from '../../lib/utils';
import { ChevronRight, Home } from 'lucide-react';

// Route to breadcrumb label mapping
const routeLabels = {
  dashboard: 'Dashboard',
  jobs: 'Jobs',
  billing: 'Billing',
  pricebooks: 'Price Books',
  capture: 'Capture',
  calendar: 'Calendar',
  admin: 'Admin',
  'owner-dashboard': 'Overview',
  users: 'Users',
  templates: 'Templates',
  security: 'Security',
  onboarding: 'Onboarding',
  procedures: 'Procedures',
  'ai-costs': 'AI Costs',
  'jobs-overview': 'Jobs Overview',
  qa: 'QA',
  'spec-library': 'Spec Library',
  closeout: 'Close Out',
  tailboard: 'Tailboard',
  timesheet: 'Timesheet',
  lme: 'LME',
  files: 'Files',
  details: 'Details',
  'asbuilt-assistant': 'As-Built Assistant',
  'log-unit': 'Log Unit',
  'create-wo': 'Create Work Order',
  'emergency-wo': 'Emergency Work Order',
  forms: 'Forms',
  'asbuilt-router': 'As-Built Router',
};

const Breadcrumbs = () => {
  const location = useLocation();
  const params = useParams();

  // Parse the pathname into segments
  const pathSegments = location.pathname
    .split('/')
    .filter(Boolean)
    .map((segment, index, arr) => {
      // Build the href for this segment
      const href = '/' + arr.slice(0, index + 1).join('/');

      // Check if this segment is a dynamic param (job ID, etc.)
      const isJobId = params.id && segment === params.id;
      const isJobIdParam = params.jobId && segment === params.jobId;

      let label = routeLabels[segment] || segment;

      // Format job IDs nicely
      if (isJobId || isJobIdParam) {
        // Could fetch job PM number here, for now show truncated ID
        label = `Job ${segment.slice(-6)}`;
      }

      return { label, href, isLast: index === arr.length - 1 };
    });

  // Don't show breadcrumbs on dashboard root
  if (pathSegments.length <= 1 && (pathSegments[0]?.href === '/dashboard' || pathSegments[0]?.href === '/')) {
    return null;
  }

  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-sm">
      {/* Home link */}
      <Link
        to="/dashboard"
        className="flex items-center text-muted-foreground hover:text-foreground"
        aria-label="Dashboard home"
      >
        <Home className="h-4 w-4" />
      </Link>

      {pathSegments.map((segment, index) => (
        <React.Fragment key={segment.href}>
          <ChevronRight className="h-4 w-4 text-muted-foreground/50" />
          {segment.isLast ? (
            <span className="font-medium text-foreground">{segment.label}</span>
          ) : (
            <Link
              to={segment.href}
              className={cn(
                'text-muted-foreground hover:text-foreground',
                'max-w-[120px] truncate'
              )}
            >
              {segment.label}
            </Link>
          )}
        </React.Fragment>
      ))}
    </nav>
  );
};

export default Breadcrumbs;

