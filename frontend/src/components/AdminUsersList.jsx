/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
// src/components/AdminUsersList.js
// Detailed view of all platform users organized by company

import React, { useState, useEffect, useCallback } from 'react';
import api from '../api';
import {
  Container,
  Typography,
  Box,
  Paper,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Collapse,
  TextField,
  InputAdornment,
  IconButton,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Button,
  Snackbar,
  Alert,
  CircularProgress,
} from '@mui/material';
import PeopleIcon from '@mui/icons-material/People';
import BusinessIcon from '@mui/icons-material/Business';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import SearchIcon from '@mui/icons-material/Search';
import AdminIcon from '@mui/icons-material/AdminPanelSettings';
import PersonIcon from '@mui/icons-material/Person';
import DeleteIcon from '@mui/icons-material/Delete';
import { useThemeMode } from '../ThemeContext';
import { getThemeColors, LoadingState, ErrorState, ROLE_COLORS, ROLE_LABELS, AdminPageHeader } from './shared';

const AdminUsersList = () => {
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedCompanies, setExpandedCompanies] = useState({});
  const [search, setSearch] = useState('');
  const [stats, setStats] = useState({ totalUsers: 0, totalCompanies: 0 });
  const { mode } = useThemeMode();
  const { cardBg, textPrimary, textSecondary, borderColor, pageBg, rowHoverBg, tableHeaderBg, sectionHeaderBg, sectionHeaderHoverBg } = getThemeColors(mode);
  
  // Delete state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const response = await api.get('/api/superadmin/companies');
      
      // Fetch users for each company
      const companiesWithUsers = await Promise.all(
        response.data.map(async (company) => {
          try {
            const usersRes = await api.get(`/api/superadmin/companies/${company._id}/users`);
            return { ...company, users: usersRes.data };
          } catch (error) {
            // Users fetch failed for this company, return empty array
            console.warn(`Failed to fetch users for company ${company._id}:`, error.message);
            return { ...company, users: [] };
          }
        })
      );
      
      setCompanies(companiesWithUsers);
      
      // Calculate stats
      const totalUsers = companiesWithUsers.reduce((sum, c) => sum + (c.users?.length || 0), 0);
      setStats({ totalUsers, totalCompanies: companiesWithUsers.length });
      
      // Expand all companies by default
      const expanded = {};
      companiesWithUsers.forEach(c => { expanded[c._id] = true; });
      setExpandedCompanies(expanded);
      
    } catch (err) {
      console.error('Error fetching data:', err);
      if (err.response?.status === 403) {
        setError('Super Admin access required');
      } else {
        setError('Failed to load users');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const toggleCompany = (companyId) => {
    setExpandedCompanies(prev => ({
      ...prev,
      [companyId]: !prev[companyId]
    }));
  };

  // Filter users based on search
  const filterUsers = (users) => {
    if (!search) return users;
    const searchLower = search.toLowerCase();
    return users.filter(u => 
      u.name?.toLowerCase().includes(searchLower) ||
      u.email?.toLowerCase().includes(searchLower) ||
      u.role?.toLowerCase().includes(searchLower)
    );
  };

  // Handle delete user
  const handleDeleteClick = useCallback((user, e) => {
    e.stopPropagation();
    setUserToDelete(user);
    setDeleteDialogOpen(true);
  }, []);

  const handleDeleteConfirm = useCallback(async () => {
    if (!userToDelete) return;
    
    setDeleteLoading(true);
    try {
      await api.delete(`/api/admin/users/${userToDelete._id}`);
      setSnackbar({ 
        open: true, 
        message: `User ${userToDelete.name} has been deactivated`, 
        severity: 'success' 
      });
      setDeleteDialogOpen(false);
      setUserToDelete(null);
      fetchData(); // Refresh the list
    } catch (err) {
      console.error('Error deactivating user:', err);
      setSnackbar({ 
        open: true, 
        message: err.response?.data?.error || 'Failed to deactivate user', 
        severity: 'error' 
      });
    } finally {
      setDeleteLoading(false);
    }
  }, [userToDelete, fetchData]);

  const handleDeleteCancel = useCallback(() => {
    setDeleteDialogOpen(false);
    setUserToDelete(null);
  }, []);

  if (loading) {
    return <LoadingState bgcolor={pageBg} />;
  }

  if (error) {
    return <ErrorState message={error} bgcolor={pageBg} />;
  }

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: pageBg }}>
      <AdminPageHeader
        title="All Users"
        icon={PeopleIcon}
        chipLabel={`${stats.totalUsers} users across ${stats.totalCompanies} companies`}
        cardBg={cardBg}
        textPrimary={textPrimary}
        borderColor={borderColor}
      />

      <Container maxWidth="lg" sx={{ py: 4 }}>
        {/* Search */}
        <Paper sx={{ p: 2, mb: 3, bgcolor: cardBg, border: `1px solid ${borderColor}`, borderRadius: 2 }}>
          <TextField
            fullWidth
            placeholder="Search by name, email, or role..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon sx={{ color: textSecondary }} />
                </InputAdornment>
              ),
            }}
            sx={{ '& .MuiOutlinedInput-root': { bgcolor: 'transparent' } }}
          />
        </Paper>

        {/* Companies with Users */}
        {companies.map((company) => {
          const filteredUsers = filterUsers(company.users || []);
          if (search && filteredUsers.length === 0) return null;

          return (
            <Paper 
              key={company._id} 
              sx={{ mb: 2, bgcolor: cardBg, border: `1px solid ${borderColor}`, borderRadius: 3, overflow: 'hidden' }}
            >
              {/* Company Header */}
              <Box
                onClick={() => toggleCompany(company._id)}
                sx={{
                  p: 2,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  bgcolor: sectionHeaderBg,
                  '&:hover': { bgcolor: sectionHeaderHoverBg }
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <BusinessIcon sx={{ color: '#6366f1' }} />
                  <Typography variant="h6" sx={{ color: textPrimary, fontWeight: 600 }}>
                    {company.name}
                  </Typography>
                  <Chip 
                    size="small" 
                    label={`${filteredUsers.length} users`}
                    sx={{ bgcolor: '#22c55e20', color: '#22c55e' }}
                  />
                </Box>
                {expandedCompanies[company._id] ? <ExpandLessIcon /> : <ExpandMoreIcon />}
              </Box>

              {/* Users Table */}
              <Collapse in={expandedCompanies[company._id]}>
                <TableContainer>
                  <Table size="small">
<TableHead>
                                      <TableRow sx={{ bgcolor: tableHeaderBg }}>
                                        <TableCell sx={{ color: textSecondary, fontWeight: 600 }}>Name</TableCell>
                                        <TableCell sx={{ color: textSecondary, fontWeight: 600 }}>Email</TableCell>
                                        <TableCell sx={{ color: textSecondary, fontWeight: 600 }}>Role</TableCell>
                                        <TableCell sx={{ color: textSecondary, fontWeight: 600 }}>Status</TableCell>
                                        <TableCell sx={{ color: textSecondary, fontWeight: 600 }}>Created</TableCell>
                                        <TableCell sx={{ color: textSecondary, fontWeight: 600, width: 80 }} align="center">Actions</TableCell>
                                      </TableRow>
                                    </TableHead>
                    <TableBody>
                      {filteredUsers.length === 0 ? (
<TableRow>
                                          <TableCell colSpan={6} sx={{ textAlign: 'center', color: textSecondary, py: 4 }}>
                                            No users in this company
                                          </TableCell>
                                        </TableRow>
                      ) : (
                        filteredUsers.map((user) => (
                          <TableRow key={user._id} sx={{ '&:hover': { bgcolor: rowHoverBg } }}>
                            <TableCell>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                {user.isSuperAdmin ? (
                                  <AdminIcon sx={{ color: '#f59e0b', fontSize: 20 }} />
                                ) : (
                                  <PersonIcon sx={{ color: textSecondary, fontSize: 20 }} />
                                )}
                                <Typography sx={{ color: textPrimary, fontWeight: 500 }}>
                                  {user.name}
                                </Typography>
                                {user.isSuperAdmin && (
                                  <Chip size="small" label="Founder" sx={{ height: 18, fontSize: '0.65rem', bgcolor: '#f59e0b20', color: '#f59e0b' }} />
                                )}
                              </Box>
                            </TableCell>
                            <TableCell sx={{ color: textSecondary }}>{user.email}</TableCell>
                            <TableCell>
                              <Chip 
                                size="small" 
                                label={ROLE_LABELS[user.role] || user.role}
                                sx={{ 
                                  bgcolor: `${ROLE_COLORS[user.role] || '#64748b'}20`,
                                  color: ROLE_COLORS[user.role] || '#64748b',
                                  fontWeight: 600,
                                  fontSize: '0.7rem'
                                }}
                              />
                            </TableCell>
                            <TableCell>
                              <Chip 
                                size="small" 
                                label={user.isAdmin ? 'Admin' : 'Active'}
                                sx={{ 
                                  bgcolor: user.isAdmin ? '#6366f120' : '#22c55e20',
                                  color: user.isAdmin ? '#6366f1' : '#22c55e',
                                  fontSize: '0.65rem'
                                }}
                              />
                            </TableCell>
<TableCell sx={{ color: textSecondary, fontSize: '0.85rem' }}>
                                              {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'N/A'}
                                            </TableCell>
                                            <TableCell align="center">
                                              {!user.isSuperAdmin && (
                                                <Tooltip title="Deactivate User">
                                                  <IconButton
                                                    size="small"
                                                    onClick={(e) => handleDeleteClick(user, e)}
                                                    sx={{ color: '#ef4444' }}
                                                  >
                                                    <DeleteIcon fontSize="small" />
                                                  </IconButton>
                                                </Tooltip>
                                              )}
                                            </TableCell>
                                          </TableRow>
                                        ))
                                      )}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Collapse>
            </Paper>
          );
        })}
      </Container>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteDialogOpen}
        onClose={handleDeleteCancel}
        PaperProps={{ sx: { bgcolor: cardBg } }}
      >
        <DialogTitle sx={{ color: textPrimary }}>
          Deactivate User?
        </DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ color: textSecondary }}>
            Are you sure you want to deactivate <strong>{userToDelete?.name}</strong> ({userToDelete?.email})?
            They will no longer be able to log in. This action can be reversed by a Super Admin.
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button 
            onClick={handleDeleteCancel} 
            sx={{ color: textSecondary }}
            disabled={deleteLoading}
          >
            Cancel
          </Button>
          <Button 
            onClick={handleDeleteConfirm} 
            variant="contained"
            color="error"
            disabled={deleteLoading}
            startIcon={deleteLoading ? <CircularProgress size={16} color="inherit" /> : <DeleteIcon />}
          >
            {deleteLoading ? 'Deactivating...' : 'Deactivate'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar for feedback */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar(prev => ({ ...prev, open: false }))}
      >
        <Alert 
          onClose={() => setSnackbar(prev => ({ ...prev, open: false }))} 
          severity={snackbar.severity}
          sx={{ width: '100%' }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default AdminUsersList;

