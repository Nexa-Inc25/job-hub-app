/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
// src/components/WorkOrderList.js (Updated: Role-based actions in table, e.g., bid button for general foreman)
import React, { useState } from 'react';
import PropTypes from 'prop-types';
import { Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, TextField } from '@mui/material';

const WorkOrderList = ({ jobs, onSelectJob, userRole }) => {
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');

  const filteredJobs = jobs.filter((job) => {
    const matchesSearch = job.woNumber.toLowerCase().includes(search.toLowerCase()) ||
      job.address.toLowerCase().includes(search.toLowerCase()) ||
      job.client.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = filterStatus === 'all' || job.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  return (
    <div style={{ marginBottom: '20px' }}>
      <h2>Work Orders List</h2>
      <TextField
        label="Search by WO#, Address, or Client"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{ marginBottom: '10px', width: '100%' }}
      />
      <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} style={{ marginBottom: '10px' }}>
        <option value="all">All Statuses</option>
        <option value="active">Active (Pre-Bid)</option>
        <option value="in progress">In Progress (Construction)</option>
        <option value="completed">Completed</option>
      </select>
      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>WO Number</TableCell>
              <TableCell>Address</TableCell>
              <TableCell>Client</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredJobs.map((job) => (
              <TableRow key={job._id}>
                <TableCell>{job.woNumber}</TableCell>
                <TableCell>{job.address}</TableCell>
                <TableCell>{job.client}</TableCell>
                <TableCell>{job.status}</TableCell>
                <TableCell>
                  <button onClick={() => onSelectJob(job._id)}>View/Details</button>
                  {userRole === 'foreman' && job.status === 'active' && <button style={{ marginLeft: '10px' }}>Bid</button>} {/* Triggers bid section in details */}
                  {userRole === 'contributor' && job.status === 'in progress' && <button style={{ marginLeft: '10px' }}>Start Construction</button>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </div>
  );
};

WorkOrderList.propTypes = {
  jobs: PropTypes.arrayOf(PropTypes.shape({
    _id: PropTypes.string,
    woNumber: PropTypes.string,
    address: PropTypes.string,
    client: PropTypes.string,
    status: PropTypes.string,
  })).isRequired,
  onSelectJob: PropTypes.func.isRequired,
  userRole: PropTypes.string,
};

export default WorkOrderList;