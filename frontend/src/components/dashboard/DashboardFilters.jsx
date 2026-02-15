/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
/**
 * DashboardFilters - Search bar and status filter dropdown.
 *
 * @module components/dashboard/DashboardFilters
 */

import React, { useState } from 'react';
import PropTypes from 'prop-types';
import {
  Box,
  TextField,
  InputAdornment,
  Button,
  Paper,
  Menu,
  MenuItem,
  Divider,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import FilterIcon from '@mui/icons-material/FilterList';
import BlockIcon from '@mui/icons-material/Block';

const DashboardFilters = ({ search, onSearchChange, filter, onFilterChange }) => {
  const [anchorEl, setAnchorEl] = useState(null);

  const applyFilter = (value) => {
    onFilterChange(value);
    setAnchorEl(null);
  };

  return (
    <Paper sx={{ p: 3, mb: 4, borderRadius: 2, boxShadow: 1 }}>
      <Box display="flex" gap={2} alignItems="center" flexWrap="wrap">
        <TextField
          id="search"
          name="search"
          fullWidth
          variant="outlined"
          placeholder="Search work orders by title, description, or client..."
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon />
              </InputAdornment>
            ),
          }}
          sx={{ maxWidth: 500 }}
        />

        <Button
          variant="outlined"
          startIcon={<FilterIcon />}
          onClick={(e) => setAnchorEl(e.currentTarget)}
          sx={{ borderRadius: 2 }}
        >
          Filter: {filter === 'all' ? 'All Status' : filter.replace('_', ' ')}
        </Button>

        <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={() => setAnchorEl(null)} disableRestoreFocus>
          <MenuItem onClick={() => applyFilter('all')}>All Status</MenuItem>
          <Divider />
          <MenuItem disabled sx={{ opacity: 0.7, fontSize: '0.75rem' }}>— New Jobs —</MenuItem>
          <MenuItem onClick={() => applyFilter('new')}>New</MenuItem>
          <MenuItem onClick={() => applyFilter('assigned_to_gf')}>Assigned to GF</MenuItem>
          <Divider />
          <MenuItem disabled sx={{ opacity: 0.7, fontSize: '0.75rem' }}>— Pre-Field —</MenuItem>
          <MenuItem onClick={() => applyFilter('pre_fielding')}>Pre-Fielding</MenuItem>
          <MenuItem onClick={() => applyFilter('scheduled')}>Scheduled</MenuItem>
          <Divider />
          <MenuItem disabled sx={{ opacity: 0.7, fontSize: '0.75rem' }}>— In Progress —</MenuItem>
          <MenuItem onClick={() => applyFilter('in_progress')}>In Progress</MenuItem>
          <MenuItem onClick={() => applyFilter('pending_gf_review')}>Awaiting GF Review</MenuItem>
          <MenuItem onClick={() => applyFilter('pending_qa_review')}>Awaiting QA Review</MenuItem>
          <MenuItem onClick={() => applyFilter('pending_pm_approval')}>Awaiting PM Approval</MenuItem>
          <Divider />
          <MenuItem disabled sx={{ opacity: 0.7, fontSize: '0.75rem' }}>— Completed —</MenuItem>
          <MenuItem onClick={() => applyFilter('ready_to_submit')}>Ready to Submit</MenuItem>
          <MenuItem onClick={() => applyFilter('submitted')}>Submitted</MenuItem>
          <MenuItem onClick={() => applyFilter('billed')}>Billed</MenuItem>
          <MenuItem onClick={() => applyFilter('invoiced')}>Invoiced</MenuItem>
          <Divider />
          <MenuItem onClick={() => applyFilter('stuck')}>
            <BlockIcon fontSize="small" sx={{ mr: 1, color: 'error.main' }} />
            Stuck
          </MenuItem>
        </Menu>
      </Box>
    </Paper>
  );
};

DashboardFilters.propTypes = {
  search: PropTypes.string.isRequired,
  onSearchChange: PropTypes.func.isRequired,
  filter: PropTypes.string.isRequired,
  onFilterChange: PropTypes.func.isRequired,
};

export default DashboardFilters;
