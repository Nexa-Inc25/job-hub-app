/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
/**
 * Skeletons - Content-aware skeleton loaders for better perceived performance
 * 
 * Provides skeleton loading states that match the shape of actual content,
 * making load times feel shorter and providing visual stability.
 */

import React from 'react';
import PropTypes from 'prop-types';
import { Box, Skeleton, Card, CardContent, TableRow, TableCell } from '@mui/material';

/**
 * JobCardSkeleton - Skeleton for job cards in dashboard
 */
export const JobCardSkeleton = ({ variant = 'default' }) => {
  if (variant === 'compact') {
    return (
      <Box sx={{ 
        display: 'flex', 
        alignItems: 'center', 
        py: 1.5, 
        px: 2,
        borderBottom: '1px solid',
        borderColor: 'divider',
      }}>
        <Box sx={{ flex: 1, mr: 2 }}>
          <Skeleton variant="text" width="60%" height={20} />
          <Skeleton variant="text" width="80%" height={16} />
        </Box>
        <Skeleton variant="rounded" width={60} height={24} />
      </Box>
    );
  }

  return (
    <Card sx={{ mb: 2 }}>
      <CardContent>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
          <Skeleton variant="text" width="40%" height={24} />
          <Skeleton variant="rounded" width={80} height={24} />
        </Box>
        <Skeleton variant="text" width="70%" height={18} />
        <Skeleton variant="text" width="50%" height={16} sx={{ mt: 1 }} />
        <Box sx={{ display: 'flex', gap: 1, mt: 2 }}>
          <Skeleton variant="rounded" width={60} height={24} />
          <Skeleton variant="rounded" width={60} height={24} />
          <Skeleton variant="rounded" width={60} height={24} />
        </Box>
      </CardContent>
    </Card>
  );
};

JobCardSkeleton.propTypes = {
  variant: PropTypes.oneOf(['default', 'compact']),
};

/**
 * JobListSkeleton - Multiple job card skeletons
 */
export const JobListSkeleton = ({ count = 5, variant = 'compact' }) => {
  return (
    <Box>
      {Array.from({ length: count }).map((_, index) => (
        <JobCardSkeleton key={index} variant={variant} />
      ))}
    </Box>
  );
};

JobListSkeleton.propTypes = {
  count: PropTypes.number,
  variant: PropTypes.oneOf(['default', 'compact']),
};

/**
 * TableRowSkeleton - Skeleton for table rows
 */
export const TableRowSkeleton = ({ columns = 5 }) => {
  return (
    <TableRow>
      {Array.from({ length: columns }).map((_, index) => (
        <TableCell key={index}>
          <Skeleton variant="text" width={index === 0 ? '60%' : '80%'} height={20} />
        </TableCell>
      ))}
    </TableRow>
  );
};

TableRowSkeleton.propTypes = {
  columns: PropTypes.number,
};

/**
 * TableSkeleton - Multiple table row skeletons
 */
export const TableSkeleton = ({ rows = 5, columns = 5 }) => {
  return (
    <>
      {Array.from({ length: rows }).map((_, index) => (
        <TableRowSkeleton key={index} columns={columns} />
      ))}
    </>
  );
};

TableSkeleton.propTypes = {
  rows: PropTypes.number,
  columns: PropTypes.number,
};

/**
 * StatCardSkeleton - Skeleton for stat/metric cards
 */
export const StatCardSkeleton = () => {
  return (
    <Card>
      <CardContent sx={{ textAlign: 'center', py: 3 }}>
        <Skeleton variant="circular" width={48} height={48} sx={{ mx: 'auto', mb: 1 }} />
        <Skeleton variant="text" width="60%" height={36} sx={{ mx: 'auto' }} />
        <Skeleton variant="text" width="40%" height={20} sx={{ mx: 'auto' }} />
      </CardContent>
    </Card>
  );
};

/**
 * FormSkeleton - Skeleton for form fields
 */
export const FormSkeleton = ({ fields = 4 }) => {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {Array.from({ length: fields }).map((_, index) => (
        <Box key={index}>
          <Skeleton variant="text" width={120} height={16} sx={{ mb: 0.5 }} />
          <Skeleton variant="rounded" width="100%" height={56} />
        </Box>
      ))}
      <Box sx={{ display: 'flex', gap: 2, justifyContent: 'flex-end', mt: 2 }}>
        <Skeleton variant="rounded" width={80} height={36} />
        <Skeleton variant="rounded" width={100} height={36} />
      </Box>
    </Box>
  );
};

FormSkeleton.propTypes = {
  fields: PropTypes.number,
};

/**
 * DetailsSkeleton - Skeleton for detail pages
 */
export const DetailsSkeleton = () => {
  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3 }}>
        <Box>
          <Skeleton variant="text" width={200} height={32} />
          <Skeleton variant="text" width={150} height={20} />
        </Box>
        <Skeleton variant="rounded" width={100} height={36} />
      </Box>
      
      {/* Content sections */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 3 }}>
        <Card>
          <CardContent>
            <Skeleton variant="text" width={120} height={24} sx={{ mb: 2 }} />
            <Skeleton variant="text" width="100%" height={18} />
            <Skeleton variant="text" width="80%" height={18} />
            <Skeleton variant="text" width="60%" height={18} />
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <Skeleton variant="text" width={120} height={24} sx={{ mb: 2 }} />
            <Skeleton variant="text" width="100%" height={18} />
            <Skeleton variant="text" width="70%" height={18} />
            <Skeleton variant="text" width="90%" height={18} />
          </CardContent>
        </Card>
      </Box>
    </Box>
  );
};

/**
 * DashboardSkeleton - Full dashboard loading skeleton
 */
export const DashboardSkeleton = () => {
  return (
    <Box>
      {/* Stats row */}
      <Box sx={{ 
        display: 'grid', 
        gridTemplateColumns: { xs: 'repeat(2, 1fr)', md: 'repeat(4, 1fr)' }, 
        gap: 2,
        mb: 3 
      }}>
        <StatCardSkeleton />
        <StatCardSkeleton />
        <StatCardSkeleton />
        <StatCardSkeleton />
      </Box>
      
      {/* Section header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Skeleton variant="text" width={150} height={28} />
        <Skeleton variant="rounded" width={100} height={32} />
      </Box>
      
      {/* Job list */}
      <Card>
        <CardContent sx={{ p: 0 }}>
          <JobListSkeleton count={6} variant="compact" />
        </CardContent>
      </Card>
    </Box>
  );
};

/**
 * BillingGridSkeleton - Skeleton for billing data grid
 */
export const BillingGridSkeleton = () => {
  return (
    <Box>
      {/* Toolbar */}
      <Box sx={{ display: 'flex', gap: 2, mb: 2, p: 2 }}>
        <Skeleton variant="rounded" width={200} height={40} />
        <Skeleton variant="rounded" width={150} height={40} />
        <Box sx={{ flex: 1 }} />
        <Skeleton variant="rounded" width={100} height={40} />
      </Box>
      
      {/* Grid header */}
      <Box sx={{ display: 'flex', px: 2, py: 1, borderBottom: '1px solid', borderColor: 'divider' }}>
        <Skeleton variant="rounded" width={24} height={24} sx={{ mr: 2 }} />
        <Skeleton variant="text" width={80} height={20} sx={{ mr: 2 }} />
        <Skeleton variant="text" width={100} height={20} sx={{ mr: 2 }} />
        <Skeleton variant="text" width={200} height={20} sx={{ flex: 1 }} />
        <Skeleton variant="text" width={80} height={20} sx={{ mr: 2 }} />
        <Skeleton variant="text" width={80} height={20} />
      </Box>
      
      {/* Grid rows */}
      {Array.from({ length: 8 }).map((_, index) => (
        <Box 
          key={index} 
          sx={{ 
            display: 'flex', 
            px: 2, 
            py: 1.5, 
            borderBottom: '1px solid', 
            borderColor: 'divider',
            '&:nth-of-type(odd)': { bgcolor: 'action.hover' }
          }}
        >
          <Skeleton variant="rounded" width={24} height={24} sx={{ mr: 2 }} />
          <Skeleton variant="rounded" width={60} height={24} sx={{ mr: 2 }} />
          <Skeleton variant="text" width={80} height={20} sx={{ mr: 2 }} />
          <Skeleton variant="text" width="30%" height={20} sx={{ flex: 1 }} />
          <Skeleton variant="text" width={60} height={20} sx={{ mr: 2 }} />
          <Skeleton variant="text" width={70} height={20} />
        </Box>
      ))}
    </Box>
  );
};

// Default export for convenience
const Skeletons = {
  JobCard: JobCardSkeleton,
  JobList: JobListSkeleton,
  TableRow: TableRowSkeleton,
  Table: TableSkeleton,
  StatCard: StatCardSkeleton,
  Form: FormSkeleton,
  Details: DetailsSkeleton,
  Dashboard: DashboardSkeleton,
  BillingGrid: BillingGridSkeleton,
};

export default Skeletons;

