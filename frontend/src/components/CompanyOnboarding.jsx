/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
// src/components/CompanyOnboarding.jsx
// Super simple UI for FieldLedger owners to onboard new contractor companies

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import {
  Container, Typography, Box, Paper, Button, IconButton,
  Alert, Snackbar, AppBar, Toolbar, Chip,
  Divider, List, ListItem, ListItemText, ListItemSecondaryAction,
  Collapse, CircularProgress
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import AddIcon from '@mui/icons-material/Add';
import BusinessIcon from '@mui/icons-material/Business';
import PersonIcon from '@mui/icons-material/Person';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import KeyIcon from '@mui/icons-material/Key';
import FolderIcon from '@mui/icons-material/Folder';
import { useThemeMode } from '../ThemeContext';

// Extracted step components
import OnboardingStepCompany from './shared/OnboardingStepCompany';
import { AddUserDialog, ResetPasswordDialog } from './shared/OnboardingStepUsers';
import OnboardingStepComplete from './shared/OnboardingStepComplete';

const CompanyOnboarding = () => {
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });
  const [expandedCompany, setExpandedCompany] = useState(null);
  const [companyUsers, setCompanyUsers] = useState({});

  // Dialog states
  const [newCompanyDialog, setNewCompanyDialog] = useState(false);
  const [newUserDialog, setNewUserDialog] = useState(false);
  const [resetPasswordDialog, setResetPasswordDialog] = useState(false);
  const [folderTemplateDialog, setFolderTemplateDialog] = useState(false);
  const [selectedCompanyId, setSelectedCompanyId] = useState(null);
  const [selectedUser, setSelectedUser] = useState(null);
  const [selectedCompanyForFolders, setSelectedCompanyForFolders] = useState(null);
  const [folderTemplate, setFolderTemplate] = useState([]);

  // Form data
  const [companyForm, setCompanyForm] = useState({ name: '', email: '', phone: '', city: '', state: 'CA' });
  const [userForm, setUserForm] = useState({ name: '', email: '', password: '', role: 'crew', phone: '' });
  const [newPassword, setNewPassword] = useState('');

  const navigate = useNavigate();
  const { darkMode } = useThemeMode();
  const mode = darkMode ? 'dark' : 'light';

  const cardBg = mode === 'dark' ? '#1e1e2e' : '#ffffff';
  const textPrimary = mode === 'dark' ? '#e2e8f0' : '#1e293b';
  const textSecondary = mode === 'dark' ? '#94a3b8' : '#64748b';
  const borderColor = mode === 'dark' ? '#334155' : '#e2e8f0';

  // ---------- Data fetching ----------
  const fetchCompanies = useCallback(async () => {
    try {
      setLoading(true);
      const response = await api.get('/api/superadmin/companies');
      setCompanies(response.data);
    } catch (err) {
      if (err.response?.status === 403) setError('Access denied. Super Admin privileges required.');
      else setError('Failed to load companies');
    } finally { setLoading(false); }
  }, []);

  const fetchCompanyUsers = useCallback(async (companyId) => {
    try {
      const response = await api.get(`/api/superadmin/companies/${companyId}/users`);
      setCompanyUsers((prev) => ({ ...prev, [companyId]: response.data }));
    } catch (err) { console.error('Error fetching users:', err); }
  }, []);

  useEffect(() => { fetchCompanies(); }, [fetchCompanies]);

  // ---------- Handlers ----------
  const handleExpandCompany = async (companyId) => {
    if (expandedCompany === companyId) { setExpandedCompany(null); return; }
    setExpandedCompany(companyId);
    if (!companyUsers[companyId]) await fetchCompanyUsers(companyId);
  };

  const handleCreateCompany = async () => {
    if (!companyForm.name.trim()) { setSnackbar({ open: true, message: 'Company name is required', severity: 'error' }); return; }
    try {
      const response = await api.post('/api/superadmin/companies', companyForm);
      setCompanies([response.data, ...companies]);
      setNewCompanyDialog(false);
      setCompanyForm({ name: '', email: '', phone: '', city: '', state: 'CA' });
      setSnackbar({ open: true, message: `Company "${response.data.name}" created!`, severity: 'success' });
    } catch (err) { setSnackbar({ open: true, message: err.response?.data?.error || 'Failed to create company', severity: 'error' }); }
  };

  const handleCreateUser = async () => {
    if (!userForm.name.trim() || !userForm.email.trim() || !userForm.password.trim()) { setSnackbar({ open: true, message: 'Name, email, and password are required', severity: 'error' }); return; }
    try {
      const response = await api.post(`/api/superadmin/companies/${selectedCompanyId}/users`, userForm);
      setCompanyUsers((prev) => ({ ...prev, [selectedCompanyId]: [response.data, ...(prev[selectedCompanyId] || [])] }));
      setCompanies(companies.map((c) => c._id === selectedCompanyId ? { ...c, userCount: (c.userCount || 0) + 1 } : c));
      setNewUserDialog(false);
      setUserForm({ name: '', email: '', password: '', role: 'crew', phone: '' });
      setSnackbar({ open: true, message: `User "${response.data.name}" added!`, severity: 'success' });
    } catch (err) { setSnackbar({ open: true, message: err.response?.data?.error || 'Failed to create user', severity: 'error' }); }
  };

  const handleResetPassword = async () => {
    if (!newPassword || newPassword.length < 6) { setSnackbar({ open: true, message: 'Password must be at least 6 characters', severity: 'error' }); return; }
    try {
      await api.post(`/api/superadmin/users/${selectedUser._id}/reset-password`, { newPassword });
      setResetPasswordDialog(false); setNewPassword(''); setSelectedUser(null);
      setSnackbar({ open: true, message: 'Password reset successfully!', severity: 'success' });
    } catch (err) { setSnackbar({ open: true, message: err.response?.data?.error || 'Failed to reset password', severity: 'error' }); }
  };

  const handleSaveFolderTemplate = async () => {
    try {
      await api.put(`/api/superadmin/companies/${selectedCompanyForFolders._id}/folder-template`, { folderTemplate });
      setCompanies(companies.map((c) => c._id === selectedCompanyForFolders._id ? { ...c, folderTemplate } : c));
      setFolderTemplateDialog(false);
      setSnackbar({ open: true, message: `Folder structure saved for ${selectedCompanyForFolders.name}!`, severity: 'success' });
    } catch (err) { setSnackbar({ open: true, message: err.response?.data?.error || 'Failed to save folder template', severity: 'error' }); }
  };

  // ---------- Small helpers ----------
  const openAddUserDialog = (companyId) => { setSelectedCompanyId(companyId); setUserForm({ name: '', email: '', password: '', role: 'crew', phone: '' }); setNewUserDialog(true); };
  const openResetPasswordDialog = (user) => { setSelectedUser(user); setNewPassword(''); setResetPasswordDialog(true); };
  const openFolderTemplateDialog = (company) => { setSelectedCompanyForFolders(company); setFolderTemplate(company.folderTemplate || []); setFolderTemplateDialog(true); };

  const renderCompanyUsers = (companyId) => {
    const users = companyUsers[companyId];
    if (!users) return <Box sx={{ textAlign: 'center', py: 3 }}><CircularProgress size={24} /></Box>;
    if (users.length === 0) return <Typography variant="body2" sx={{ color: textSecondary, textAlign: 'center', py: 3 }}>No employees yet. Click &quot;Add Employee&quot; to add the first one.</Typography>;
    return (
      <List dense>
        {users.map((user) => (
          <ListItem key={user._id} sx={{ bgcolor: cardBg, borderRadius: 2, mb: 1, border: `1px solid ${borderColor}` }}>
            <ListItemText
              primary={<Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}><Typography sx={{ fontWeight: 500, color: textPrimary }}>{user.name}</Typography><Chip label={user.role.toUpperCase()} size="small" sx={{ height: 20, fontSize: '0.65rem', bgcolor: { admin: '#6366f120', pm: '#6366f120', gf: '#f59e0b20' }[user.role] || '#64748b20', color: { admin: '#6366f1', pm: '#6366f1', gf: '#f59e0b' }[user.role] || textSecondary }} /></Box>}
              secondary={user.email}
              secondaryTypographyProps={{ sx: { color: textSecondary } }}
            />
            <ListItemSecondaryAction>
              <IconButton size="small" onClick={() => openResetPasswordDialog(user)} sx={{ color: textSecondary }} aria-label="Reset password"><KeyIcon fontSize="small" /></IconButton>
            </ListItemSecondaryAction>
          </ListItem>
        ))}
      </List>
    );
  };

  // ---------- Loading / Error states ----------
  if (loading) return <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: mode === 'dark' ? '#0f0f1a' : '#f8fafc' }}><CircularProgress size={48} sx={{ color: '#6366f1' }} /></Box>;
  if (error) return <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: mode === 'dark' ? '#0f0f1a' : '#f8fafc', p: 3 }}><Alert severity="error" sx={{ maxWidth: 500 }}>{error}</Alert></Box>;

  // ---------- Render ----------
  return (
    <Box sx={{ minHeight: '100vh', bgcolor: mode === 'dark' ? '#0f0f1a' : '#f1f5f9' }}>
      {/* Header */}
      <AppBar position="sticky" elevation={0} sx={{ bgcolor: mode === 'dark' ? '#1e1e2e' : '#ffffff', borderBottom: `1px solid ${borderColor}` }}>
        <Toolbar>
          <IconButton onClick={() => navigate('/admin/owner-dashboard')} sx={{ mr: 2, color: textPrimary }} aria-label="Back to owner dashboard"><ArrowBackIcon /></IconButton>
          <BusinessIcon sx={{ mr: 1.5, color: '#6366f1' }} />
          <Typography variant="h6" sx={{ flexGrow: 1, color: textPrimary, fontWeight: 700 }}>Customer Onboarding</Typography>
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setNewCompanyDialog(true)} sx={{ bgcolor: '#22c55e', '&:hover': { bgcolor: '#16a34a' }, borderRadius: 2, textTransform: 'none', fontWeight: 600 }}>Add New Company</Button>
        </Toolbar>
      </AppBar>

      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Paper sx={{ p: 3, mb: 4, bgcolor: '#6366f120', border: '1px solid #6366f1', borderRadius: 3 }}>
          <Typography variant="h6" sx={{ color: '#6366f1', mb: 1, fontWeight: 600 }}>How to Add a New Customer</Typography>
          <Typography variant="body1" sx={{ color: textPrimary }}>
            1. Click <strong>&quot;Add New Company&quot;</strong> and enter the company name<br/>
            2. Click on the company to expand it<br/>
            3. Click <strong>&quot;Add Employee&quot;</strong> to add users with their roles<br/>
            4. Give them their login credentials (email + password you set)
          </Typography>
        </Paper>

        <Typography variant="h5" sx={{ color: textPrimary, mb: 3, fontWeight: 600 }}>Contractor Companies ({companies.length})</Typography>

        {companies.length === 0 ? (
          <Paper sx={{ p: 6, textAlign: 'center', bgcolor: cardBg, borderRadius: 3 }}>
            <BusinessIcon sx={{ fontSize: 64, color: textSecondary, mb: 2 }} />
            <Typography variant="h6" sx={{ color: textSecondary }}>No companies yet</Typography>
            <Typography variant="body2" sx={{ color: textSecondary, mb: 3 }}>Click &quot;Add New Company&quot; to onboard your first customer</Typography>
          </Paper>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {companies.map((company) => (
              <Paper key={company._id} sx={{ bgcolor: cardBg, border: `1px solid ${borderColor}`, borderRadius: 3, overflow: 'hidden' }}>
                <Box onClick={() => handleExpandCompany(company._id)} sx={{ p: 3, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', '&:hover': { bgcolor: mode === 'dark' ? '#252538' : '#f8fafc' } }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <Box sx={{ bgcolor: '#6366f120', borderRadius: 2, p: 1.5, display: 'flex' }}><BusinessIcon sx={{ color: '#6366f1', fontSize: 28 }} /></Box>
                    <Box>
                      <Typography variant="h6" sx={{ color: textPrimary, fontWeight: 600 }}>{company.name}</Typography>
                      <Typography variant="body2" sx={{ color: textSecondary }}>{company.city && company.state ? `${company.city}, ${company.state}` : 'No location set'}{company.email && ` • ${company.email}`}</Typography>
                    </Box>
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <Chip icon={<PersonIcon sx={{ fontSize: 16 }} />} label={`${company.userCount || 0} employees`} size="small" sx={{ bgcolor: '#22c55e20', color: '#22c55e', fontWeight: 600 }} />
                    {expandedCompany === company._id ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                  </Box>
                </Box>

                <Collapse in={expandedCompany === company._id}>
                  <Divider />
                  <Box sx={{ p: 3, bgcolor: mode === 'dark' ? '#151520' : '#f8fafc' }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                      <Typography variant="subtitle1" sx={{ color: textPrimary, fontWeight: 600 }}>Employees</Typography>
                      <Box sx={{ display: 'flex', gap: 1 }}>
                        <Button variant="outlined" size="small" startIcon={<FolderIcon />} onClick={() => openFolderTemplateDialog(company)} sx={{ borderRadius: 2, textTransform: 'none', borderColor: '#f59e0b', color: '#f59e0b', '&:hover': { borderColor: '#d97706', bgcolor: '#f59e0b10' } }}>Folder Structure</Button>
                        <Button variant="outlined" size="small" startIcon={<AddIcon />} onClick={() => openAddUserDialog(company._id)} sx={{ borderRadius: 2, textTransform: 'none' }}>Add Employee</Button>
                      </Box>
                    </Box>
                    {renderCompanyUsers(company._id)}
                  </Box>
                </Collapse>
              </Paper>
            ))}
          </Box>
        )}
      </Container>

      {/* Dialogs (extracted step components) */}
      <OnboardingStepCompany open={newCompanyDialog} onClose={() => setNewCompanyDialog(false)} form={companyForm} onChange={setCompanyForm} onSubmit={handleCreateCompany} />
      <AddUserDialog open={newUserDialog} onClose={() => setNewUserDialog(false)} form={userForm} onChange={setUserForm} onSubmit={handleCreateUser} />
      <ResetPasswordDialog open={resetPasswordDialog} onClose={() => setResetPasswordDialog(false)} user={selectedUser} password={newPassword} onPasswordChange={setNewPassword} onSubmit={handleResetPassword} />
      <OnboardingStepComplete open={folderTemplateDialog} onClose={() => setFolderTemplateDialog(false)} company={selectedCompanyForFolders} folderTemplate={folderTemplate} onTemplateChange={setFolderTemplate} onSave={handleSaveFolderTemplate} textPrimary={textPrimary} textSecondary={textSecondary} borderColor={borderColor} mode={mode} />

      <Snackbar open={snackbar.open} autoHideDuration={4000} onClose={() => setSnackbar({ ...snackbar, open: false })} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity={snackbar.severity} onClose={() => setSnackbar({ ...snackbar, open: false })} sx={{ width: '100%' }}>{snackbar.message}</Alert>
      </Snackbar>
    </Box>
  );
};

export default CompanyOnboarding;
