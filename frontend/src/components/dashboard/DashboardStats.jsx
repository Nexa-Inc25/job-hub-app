/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
/**
 * DashboardStats - Stat cards showing job counts by category.
 *
 * @module components/dashboard/DashboardStats
 */

import React from 'react';
import PropTypes from 'prop-types';
import { Grid, Card, CardContent, Box, Typography } from '@mui/material';
import AssessmentIcon from '@mui/icons-material/Assessment';
import DescriptionIcon from '@mui/icons-material/Description';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import FolderIcon from '@mui/icons-material/Folder';

const DashboardStats = ({ stats }) => (
  <Grid container spacing={3} mb={4}>
    <Grid size={{ xs: 12, sm: 6, md: 3 }}>
      <Card sx={{ borderRadius: 2, boxShadow: 2 }}>
        <CardContent>
          <Box display="flex" alignItems="center" justifyContent="space-between">
            <Box>
              <Typography color="text.secondary" gutterBottom>Total Orders</Typography>
              <Typography variant="h4" component="p" fontWeight="bold">{stats.total}</Typography>
            </Box>
            <AssessmentIcon sx={{ fontSize: 40, color: 'primary.main', opacity: 0.7 }} />
          </Box>
        </CardContent>
      </Card>
    </Grid>

    <Grid size={{ xs: 12, sm: 6, md: 3 }}>
      <Card sx={{ borderRadius: 2, boxShadow: 2 }}>
        <CardContent>
          <Box display="flex" alignItems="center" justifyContent="space-between">
            <Box>
              <Typography color="text.secondary" gutterBottom>In Progress</Typography>
              <Typography variant="h4" component="p" fontWeight="bold" color="info.main">{stats.inProgress}</Typography>
            </Box>
            <DescriptionIcon sx={{ fontSize: 40, color: 'info.main', opacity: 0.7 }} />
          </Box>
        </CardContent>
      </Card>
    </Grid>

    <Grid size={{ xs: 12, sm: 6, md: 3 }}>
      <Card sx={{ borderRadius: 2, boxShadow: 2 }}>
        <CardContent>
          <Box display="flex" alignItems="center" justifyContent="space-between">
            <Box>
              <Typography color="text.secondary" gutterBottom>Completed</Typography>
              <Typography variant="h4" component="p" fontWeight="bold" color="success.main">{stats.completed}</Typography>
            </Box>
            <CheckCircleIcon sx={{ fontSize: 40, color: 'success.main', opacity: 0.7 }} />
          </Box>
        </CardContent>
      </Card>
    </Grid>

    <Grid size={{ xs: 12, sm: 6, md: 3 }}>
      <Card sx={{ borderRadius: 2, boxShadow: 2 }}>
        <CardContent>
          <Box display="flex" alignItems="center" justifyContent="space-between">
            <Box>
              <Typography color="text.secondary" gutterBottom>Pre-Field</Typography>
              <Typography variant="h4" component="p" fontWeight="bold" color="info.main">{stats.preField}</Typography>
            </Box>
            <FolderIcon sx={{ fontSize: 40, color: 'info.main', opacity: 0.7 }} />
          </Box>
        </CardContent>
      </Card>
    </Grid>
  </Grid>
);

DashboardStats.propTypes = {
  stats: PropTypes.shape({
    total: PropTypes.number.isRequired,
    pending: PropTypes.number,
    inProgress: PropTypes.number.isRequired,
    completed: PropTypes.number.isRequired,
    preField: PropTypes.number.isRequired,
  }).isRequired,
};

export default DashboardStats;
