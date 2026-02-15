/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
/**
 * DashboardCharts - Pending approvals alert and analytics placeholder.
 *
 * Currently renders the pending approvals banner; analytics charts
 * will be added in a future sprint.
 *
 * @module components/dashboard/DashboardCharts
 */

import React from 'react';
import PropTypes from 'prop-types';
import { Alert, Typography, Button } from '@mui/material';

const DashboardCharts = ({ canApprove, pendingApprovals, onReviewFirst }) => {
  if (!canApprove || pendingApprovals.length === 0) return null;

  return (
    <Alert
      severity="warning"
      sx={{ mb: 3, borderRadius: 2 }}
      action={
        <Button color="inherit" size="small" onClick={onReviewFirst}>
          Review Now
        </Button>
      }
    >
      <Typography variant="body2">
        <strong>
          {pendingApprovals.length} document{pendingApprovals.length > 1 ? 's' : ''} awaiting approval
        </strong>{' '}
        - Draft documents need GF/PM review before submission
      </Typography>
    </Alert>
  );
};

DashboardCharts.propTypes = {
  canApprove: PropTypes.bool.isRequired,
  pendingApprovals: PropTypes.array.isRequired,
  onReviewFirst: PropTypes.func.isRequired,
};

export default DashboardCharts;
