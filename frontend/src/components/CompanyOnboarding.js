// src/components/CompanyOnboarding.js
// Super simple UI for Job Hub owners to onboard new contractor companies
// Designed to be usable by non-technical people

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import {
  Container,
  Typography,
  Box,
  Paper,
  Button,
  TextField,
  IconButton,
  Alert,
  Snackbar,
  AppBar,
  Toolbar,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Divider,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Collapse,
  CircularProgress,
} from '@mui/material';
import {
  ArrowBack as ArrowBackIcon,
  Add as AddIcon,
  Business as BusinessIcon,
  Person as PersonIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  Key as KeyIcon,
  Folder as FolderIcon,
  Delete as DeleteIcon,
  CreateNewFolder as CreateNewFolderIcon,
} from '@mui/icons-material';
import { useThemeMode } from '../ThemeContext';

// Role descriptions for the dropdown
const ROLE_OPTIONS = [
  { value: 'crew', label: 'Crew Member', description: 'Field worker - can view assigned jobs' },
  { value: 'foreman', label: 'Foreman', description: 'Crew lead - can update job status & upload photos' },
  { value: 'gf', label: 'General Foreman', description: 'Pre-fields jobs, schedules crews, reviews work' },
  { value: 'pm', label: 'Project Manager', description: 'Full access - approves work, manages jobs' },
  { value: 'admin', label: 'Company Admin', description: 'Full access + company settings' },
];

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
  const [newFolderName, setNewFolderName] = useState('');
  const [newSubfolderName, setNewSubfolderName] = useState('');
  const [selectedFolderIndex, setSelectedFolderIndex] = useState(null);
  
  // Form data
  const [companyForm, setCompanyForm] = useState({
    name: '',
    email: '',
    phone: '',
    city: '',
    state: 'CA',
  });
  const [userForm, setUserForm] = useState({
    name: '',
    email: '',
    password: '',
    role: 'crew',
    phone: '',
  });
  const [newPassword, setNewPassword] = useState('');
  
  const navigate = useNavigate();
  const { mode } = useThemeMode();

  // Theme colors
  const cardBg = mode === 'dark' ? '#1e1e2e' : '#ffffff';
  const textPrimary = mode === 'dark' ? '#e2e8f0' : '#1e293b';
  const textSecondary = mode === 'dark' ? '#94a3b8' : '#64748b';
  const borderColor = mode === 'dark' ? '#334155' : '#e2e8f0';

  const fetchCompanies = useCallback(async () => {
    try {
      setLoading(true);
      const response = await api.get('/api/superadmin/companies');
      setCompanies(response.data);
    } catch (err) {
      console.error('Error fetching companies:', err);
      if (err.response?.status === 403) {
        setError('Access denied. Super Admin privileges required.');
      } else {
        setError('Failed to load companies');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchCompanyUsers = useCallback(async (companyId) => {
    try {
      const response = await api.get(`/api/superadmin/companies/${companyId}/users`);
      setCompanyUsers(prev => ({ ...prev, [companyId]: response.data }));
    } catch (err) {
      console.error('Error fetching users:', err);
    }
  }, []);

  useEffect(() => {
    fetchCompanies();
  }, [fetchCompanies]);

  const handleExpandCompany = async (companyId) => {
    if (expandedCompany === companyId) {
      setExpandedCompany(null);
    } else {
      setExpandedCompany(companyId);
      if (!companyUsers[companyId]) {
        await fetchCompanyUsers(companyId);
      }
    }
  };

  const handleCreateCompany = async () => {
    try {
      if (!companyForm.name.trim()) {
        setSnackbar({ open: true, message: 'Company name is required', severity: 'error' });
        return;
      }
      
      const response = await api.post('/api/superadmin/companies', companyForm);
      setCompanies([response.data, ...companies]);
      setNewCompanyDialog(false);
      setCompanyForm({ name: '', email: '', phone: '', city: '', state: 'CA' });
      setSnackbar({ open: true, message: `Company "${response.data.name}" created!`, severity: 'success' });
    } catch (err) {
      setSnackbar({ 
        open: true, 
        message: err.response?.data?.error || 'Failed to create company', 
        severity: 'error' 
      });
    }
  };

  const handleCreateUser = async () => {
    try {
      if (!userForm.name.trim() || !userForm.email.trim() || !userForm.password.trim()) {
        setSnackbar({ open: true, message: 'Name, email, and password are required', severity: 'error' });
        return;
      }
      
      const response = await api.post(`/api/superadmin/companies/${selectedCompanyId}/users`, userForm);
      
      // Update users list
      setCompanyUsers(prev => ({
        ...prev,
        [selectedCompanyId]: [response.data, ...(prev[selectedCompanyId] || [])]
      }));
      
      // Update company user count
      setCompanies(companies.map(c => 
        c._id === selectedCompanyId ? { ...c, userCount: (c.userCount || 0) + 1 } : c
      ));
      
      setNewUserDialog(false);
      setUserForm({ name: '', email: '', password: '', role: 'crew', phone: '' });
      setSnackbar({ open: true, message: `User "${response.data.name}" added!`, severity: 'success' });
    } catch (err) {
      setSnackbar({ 
        open: true, 
        message: err.response?.data?.error || 'Failed to create user', 
        severity: 'error' 
      });
    }
  };

  const handleResetPassword = async () => {
    try {
      if (!newPassword || newPassword.length < 6) {
        setSnackbar({ open: true, message: 'Password must be at least 6 characters', severity: 'error' });
        return;
      }
      
      await api.post(`/api/superadmin/users/${selectedUser._id}/reset-password`, { newPassword });
      setResetPasswordDialog(false);
      setNewPassword('');
      setSelectedUser(null);
      setSnackbar({ open: true, message: 'Password reset successfully!', severity: 'success' });
    } catch (err) {
      setSnackbar({ 
        open: true, 
        message: err.response?.data?.error || 'Failed to reset password', 
        severity: 'error' 
      });
    }
  };

  const openAddUserDialog = (companyId) => {
    setSelectedCompanyId(companyId);
    setUserForm({ name: '', email: '', password: '', role: 'crew', phone: '' });
    setNewUserDialog(true);
  };

  const openResetPasswordDialog = (user) => {
    setSelectedUser(user);
    setNewPassword('');
    setResetPasswordDialog(true);
  };

  // Generate a random password
  const generatePassword = () => {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const length = 12;
    // Use cryptographically secure random number generator
    const randomValues = new Uint32Array(length);
    crypto.getRandomValues(randomValues);
    return Array.from(randomValues, (v) => chars[v % chars.length]).join('');
  };

  // Folder Template Functions
  const openFolderTemplateDialog = (company) => {
    setSelectedCompanyForFolders(company);
    setFolderTemplate(company.folderTemplate || []);
    setNewFolderName('');
    setNewSubfolderName('');
    setSelectedFolderIndex(null);
    setFolderTemplateDialog(true);
  };

  const addParentFolder = () => {
    if (!newFolderName.trim()) return;
    setFolderTemplate([...folderTemplate, { name: newFolderName.trim(), subfolders: [] }]);
    setNewFolderName('');
  };

  const addSubfolder = (folderIndex) => {
    if (!newSubfolderName.trim()) return;
    const updated = [...folderTemplate];
    if (!updated[folderIndex].subfolders) updated[folderIndex].subfolders = [];
    updated[folderIndex].subfolders.push({ name: newSubfolderName.trim(), subfolders: [] });
    setFolderTemplate(updated);
    setNewSubfolderName('');
  };

  const removeFolder = (folderIndex) => {
    setFolderTemplate(folderTemplate.filter((_, i) => i !== folderIndex));
    setSelectedFolderIndex(null);
  };

  const removeSubfolder = (folderIndex, subfolderIndex) => {
    const updated = [...folderTemplate];
    updated[folderIndex].subfolders = updated[folderIndex].subfolders.filter((_, i) => i !== subfolderIndex);
    setFolderTemplate(updated);
  };

  const saveFolderTemplate = async () => {
    try {
      await api.put(`/api/superadmin/companies/${selectedCompanyForFolders._id}/folder-template`, {
        folderTemplate
      });
      
      // Update local state
      setCompanies(companies.map(c => 
        c._id === selectedCompanyForFolders._id ? { ...c, folderTemplate } : c
      ));
      
      setFolderTemplateDialog(false);
      setSnackbar({ 
        open: true, 
        message: `Folder structure saved for ${selectedCompanyForFolders.name}!`, 
        severity: 'success' 
      });
    } catch (err) {
      setSnackbar({ 
        open: true, 
        message: err.response?.data?.error || 'Failed to save folder template', 
        severity: 'error' 
      });
    }
  };

  if (loading) {
    return (
      <Box sx={{ 
        minHeight: '100vh', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        bgcolor: mode === 'dark' ? '#0f0f1a' : '#f8fafc'
      }}>
        <CircularProgress size={48} sx={{ color: '#6366f1' }} />
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ 
        minHeight: '100vh', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        bgcolor: mode === 'dark' ? '#0f0f1a' : '#f8fafc',
        p: 3
      }}>
        <Alert severity="error" sx={{ maxWidth: 500 }}>{error}</Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: mode === 'dark' ? '#0f0f1a' : '#f1f5f9' }}>
      {/* Header */}
      <AppBar 
        position="sticky" 
        elevation={0}
        sx={{ 
          bgcolor: mode === 'dark' ? '#1e1e2e' : '#ffffff',
          borderBottom: `1px solid ${borderColor}`
        }}
      >
        <Toolbar>
          <IconButton 
            onClick={() => navigate('/admin/owner-dashboard')} 
            sx={{ mr: 2, color: textPrimary }}
          >
            <ArrowBackIcon />
          </IconButton>
          <BusinessIcon sx={{ mr: 1.5, color: '#6366f1' }} />
          <Typography variant="h6" sx={{ flexGrow: 1, color: textPrimary, fontWeight: 700 }}>
            Customer Onboarding
          </Typography>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setNewCompanyDialog(true)}
            sx={{ 
              bgcolor: '#22c55e', 
              '&:hover': { bgcolor: '#16a34a' },
              borderRadius: 2,
              textTransform: 'none',
              fontWeight: 600
            }}
          >
            Add New Company
          </Button>
        </Toolbar>
      </AppBar>

      <Container maxWidth="lg" sx={{ py: 4 }}>
        {/* Instructions */}
        <Paper sx={{ 
          p: 3, 
          mb: 4, 
          bgcolor: '#6366f120', 
          border: '1px solid #6366f1',
          borderRadius: 3
        }}>
          <Typography variant="h6" sx={{ color: '#6366f1', mb: 1, fontWeight: 600 }}>
            How to Add a New Customer
          </Typography>
          <Typography variant="body1" sx={{ color: textPrimary }}>
            1. Click <strong>"Add New Company"</strong> and enter the company name<br/>
            2. Click on the company to expand it<br/>
            3. Click <strong>"Add Employee"</strong> to add users with their roles<br/>
            4. Give them their login credentials (email + password you set)
          </Typography>
        </Paper>

        {/* Companies List */}
        <Typography variant="h5" sx={{ color: textPrimary, mb: 3, fontWeight: 600 }}>
          Contractor Companies ({companies.length})
        </Typography>

        {companies.length === 0 ? (
          <Paper sx={{ p: 6, textAlign: 'center', bgcolor: cardBg, borderRadius: 3 }}>
            <BusinessIcon sx={{ fontSize: 64, color: textSecondary, mb: 2 }} />
            <Typography variant="h6" sx={{ color: textSecondary }}>
              No companies yet
            </Typography>
            <Typography variant="body2" sx={{ color: textSecondary, mb: 3 }}>
              Click "Add New Company" to onboard your first customer
            </Typography>
          </Paper>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {companies.map((company) => (
              <Paper 
                key={company._id} 
                sx={{ 
                  bgcolor: cardBg, 
                  border: `1px solid ${borderColor}`,
                  borderRadius: 3,
                  overflow: 'hidden'
                }}
              >
                {/* Company Header */}
                <Box
                  onClick={() => handleExpandCompany(company._id)}
                  sx={{ 
                    p: 3, 
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    '&:hover': { bgcolor: mode === 'dark' ? '#252538' : '#f8fafc' }
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <Box sx={{ 
                      bgcolor: '#6366f120', 
                      borderRadius: 2, 
                      p: 1.5,
                      display: 'flex'
                    }}>
                      <BusinessIcon sx={{ color: '#6366f1', fontSize: 28 }} />
                    </Box>
                    <Box>
                      <Typography variant="h6" sx={{ color: textPrimary, fontWeight: 600 }}>
                        {company.name}
                      </Typography>
                      <Typography variant="body2" sx={{ color: textSecondary }}>
                        {company.city && company.state ? `${company.city}, ${company.state}` : 'No location set'}
                        {company.email && ` • ${company.email}`}
                      </Typography>
                    </Box>
                  </Box>
                  
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <Chip 
                      icon={<PersonIcon sx={{ fontSize: 16 }} />}
                      label={`${company.userCount || 0} employees`}
                      size="small"
                      sx={{ 
                        bgcolor: '#22c55e20', 
                        color: '#22c55e',
                        fontWeight: 600
                      }}
                    />
                    {expandedCompany === company._id ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                  </Box>
                </Box>

                {/* Expanded Content - Users */}
                <Collapse in={expandedCompany === company._id}>
                  <Divider />
                  <Box sx={{ p: 3, bgcolor: mode === 'dark' ? '#151520' : '#f8fafc' }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                      <Typography variant="subtitle1" sx={{ color: textPrimary, fontWeight: 600 }}>
                        Employees
                      </Typography>
                      <Box sx={{ display: 'flex', gap: 1 }}>
                        <Button
                          variant="outlined"
                          size="small"
                          startIcon={<FolderIcon />}
                          onClick={() => openFolderTemplateDialog(company)}
                          sx={{ 
                            borderRadius: 2, 
                            textTransform: 'none',
                            borderColor: '#f59e0b',
                            color: '#f59e0b',
                            '&:hover': { borderColor: '#d97706', bgcolor: '#f59e0b10' }
                          }}
                        >
                          Folder Structure
                        </Button>
                        <Button
                          variant="outlined"
                          size="small"
                          startIcon={<AddIcon />}
                          onClick={() => openAddUserDialog(company._id)}
                          sx={{ borderRadius: 2, textTransform: 'none' }}
                        >
                          Add Employee
                        </Button>
                      </Box>
                    </Box>

                    {!companyUsers[company._id] ? (
                      <Box sx={{ textAlign: 'center', py: 3 }}>
                        <CircularProgress size={24} />
                      </Box>
                    ) : companyUsers[company._id].length === 0 ? (
                      <Typography variant="body2" sx={{ color: textSecondary, textAlign: 'center', py: 3 }}>
                        No employees yet. Click "Add Employee" to add the first one.
                      </Typography>
                    ) : (
                      <List dense>
                        {companyUsers[company._id].map((user) => (
                          <ListItem 
                            key={user._id}
                            sx={{ 
                              bgcolor: cardBg, 
                              borderRadius: 2, 
                              mb: 1,
                              border: `1px solid ${borderColor}`
                            }}
                          >
                            <ListItemText
                              primary={
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                  <Typography sx={{ fontWeight: 500, color: textPrimary }}>
                                    {user.name}
                                  </Typography>
                                  <Chip 
                                    label={user.role.toUpperCase()} 
                                    size="small"
                                    sx={{ 
                                      height: 20,
                                      fontSize: '0.65rem',
                                      bgcolor: { admin: '#6366f120', pm: '#6366f120', gf: '#f59e0b20' }[user.role] || '#64748b20',
                                      color: { admin: '#6366f1', pm: '#6366f1', gf: '#f59e0b' }[user.role] || textSecondary
                                    }}
                                  />
                                </Box>
                              }
                              secondary={user.email}
                              secondaryTypographyProps={{ sx: { color: textSecondary } }}
                            />
                            <ListItemSecondaryAction>
                              <IconButton 
                                size="small" 
                                onClick={() => openResetPasswordDialog(user)}
                                sx={{ color: textSecondary }}
                              >
                                <KeyIcon fontSize="small" />
                              </IconButton>
                            </ListItemSecondaryAction>
                          </ListItem>
                        ))}
                      </List>
                    )}
                  </Box>
                </Collapse>
              </Paper>
            ))}
          </Box>
        )}
      </Container>

      {/* New Company Dialog */}
      <Dialog 
        open={newCompanyDialog} 
        onClose={() => setNewCompanyDialog(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ fontWeight: 600 }}>
          Add New Contractor Company
        </DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <TextField
              label="Company Name *"
              value={companyForm.name}
              onChange={(e) => setCompanyForm({ ...companyForm, name: e.target.value })}
              placeholder="e.g., ABC Electric Inc."
              fullWidth
              autoFocus
              autoComplete="organization"
            />
            <TextField
              label="Email"
              type="email"
              value={companyForm.email}
              onChange={(e) => setCompanyForm({ ...companyForm, email: e.target.value })}
              placeholder="office@company.com"
              fullWidth
              autoComplete="email"
            />
            <TextField
              label="Phone"
              value={companyForm.phone}
              onChange={(e) => setCompanyForm({ ...companyForm, phone: e.target.value })}
              placeholder="(555) 123-4567"
              fullWidth
              autoComplete="tel"
            />
            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField
                label="City"
                value={companyForm.city}
                onChange={(e) => setCompanyForm({ ...companyForm, city: e.target.value })}
                placeholder="Sacramento"
                sx={{ flex: 2 }}
                autoComplete="address-level2"
              />
              <TextField
                label="State"
                value={companyForm.state}
                onChange={(e) => setCompanyForm({ ...companyForm, state: e.target.value })}
                placeholder="CA"
                sx={{ flex: 1 }}
                autoComplete="address-level1"
              />
            </Box>
          </Box>
        </DialogContent>
        <DialogActions sx={{ p: 3 }}>
          <Button onClick={() => setNewCompanyDialog(false)}>Cancel</Button>
          <Button 
            variant="contained" 
            onClick={handleCreateCompany}
            sx={{ bgcolor: '#22c55e', '&:hover': { bgcolor: '#16a34a' } }}
          >
            Create Company
          </Button>
        </DialogActions>
      </Dialog>

      {/* New User Dialog */}
      <Dialog 
        open={newUserDialog} 
        onClose={() => setNewUserDialog(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ fontWeight: 600 }}>
          Add Employee
        </DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <TextField
              label="Full Name *"
              value={userForm.name}
              onChange={(e) => setUserForm({ ...userForm, name: e.target.value })}
              placeholder="John Smith"
              fullWidth
              autoFocus
              autoComplete="name"
            />
            <TextField
              label="Email *"
              type="email"
              value={userForm.email}
              onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
              placeholder="john@company.com"
              helperText="This will be their login username"
              fullWidth
              autoComplete="email"
            />
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
              <TextField
                label="Password *"
                type="text"
                value={userForm.password}
                onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
                placeholder="Enter a password"
                helperText="At least 6 characters. Give this to the employee."
                fullWidth
                autoComplete="new-password"
              />
              <Button
                variant="outlined"
                onClick={() => setUserForm({ ...userForm, password: generatePassword() })}
                sx={{ mt: 1, whiteSpace: 'nowrap' }}
              >
                Generate
              </Button>
            </Box>
            <FormControl fullWidth>
              <InputLabel>Role *</InputLabel>
              <Select
                value={userForm.role}
                label="Role *"
                onChange={(e) => setUserForm({ ...userForm, role: e.target.value })}
              >
                {ROLE_OPTIONS.map((role) => (
                  <MenuItem key={role.value} value={role.value}>
                    <Box>
                      <Typography variant="body1">{role.label}</Typography>
                      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                        {role.description}
                      </Typography>
                    </Box>
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              label="Phone (optional)"
              value={userForm.phone}
              onChange={(e) => setUserForm({ ...userForm, phone: e.target.value })}
              placeholder="(555) 123-4567"
              fullWidth
              autoComplete="tel"
            />
          </Box>
        </DialogContent>
        <DialogActions sx={{ p: 3 }}>
          <Button onClick={() => setNewUserDialog(false)}>Cancel</Button>
          <Button 
            variant="contained" 
            onClick={handleCreateUser}
            sx={{ bgcolor: '#6366f1', '&:hover': { bgcolor: '#4f46e5' } }}
          >
            Add Employee
          </Button>
        </DialogActions>
      </Dialog>

      {/* Reset Password Dialog */}
      <Dialog 
        open={resetPasswordDialog} 
        onClose={() => setResetPasswordDialog(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ fontWeight: 600 }}>
          Reset Password for {selectedUser?.name}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <Alert severity="info">
              Set a new password for this user. They will need to use this password to log in.
            </Alert>
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
              <TextField
                label="New Password"
                type="text"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Enter new password"
                helperText="At least 6 characters"
                fullWidth
                autoFocus
                autoComplete="new-password"
              />
              <Button
                variant="outlined"
                onClick={() => setNewPassword(generatePassword())}
                sx={{ mt: 1, whiteSpace: 'nowrap' }}
              >
                Generate
              </Button>
            </Box>
          </Box>
        </DialogContent>
        <DialogActions sx={{ p: 3 }}>
          <Button onClick={() => setResetPasswordDialog(false)}>Cancel</Button>
          <Button 
            variant="contained" 
            onClick={handleResetPassword}
            sx={{ bgcolor: '#f59e0b', '&:hover': { bgcolor: '#d97706' } }}
          >
            Reset Password
          </Button>
        </DialogActions>
      </Dialog>

      {/* Folder Template Dialog */}
      <Dialog 
        open={folderTemplateDialog} 
        onClose={() => setFolderTemplateDialog(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle sx={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 1 }}>
          <FolderIcon sx={{ color: '#f59e0b' }} />
          Folder Structure for {selectedCompanyForFolders?.name}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, mt: 1 }}>
            <Alert severity="info">
              Define the folder structure for new jobs created by this company. 
              Each job will automatically have these folders.
            </Alert>
            
            {/* Add Parent Folder */}
            <Paper sx={{ p: 2, bgcolor: mode === 'dark' ? '#1e1e2e' : '#f8fafc' }}>
              <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600, color: textPrimary }}>
                Add Parent Folder
              </Typography>
              <Box sx={{ display: 'flex', gap: 1 }}>
                <TextField
                  size="small"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  placeholder="e.g., Fuse Electric, Job Documents"
                  fullWidth
                  onKeyDown={(e) => e.key === 'Enter' && addParentFolder()}
                  autoComplete="off"
                />
                <Button
                  variant="contained"
                  startIcon={<CreateNewFolderIcon />}
                  onClick={addParentFolder}
                  sx={{ bgcolor: '#22c55e', '&:hover': { bgcolor: '#16a34a' }, whiteSpace: 'nowrap' }}
                >
                  Add Folder
                </Button>
              </Box>
            </Paper>

            {/* Folder List */}
            {folderTemplate.length === 0 ? (
              <Box sx={{ textAlign: 'center', py: 4, color: textSecondary }}>
                <FolderIcon sx={{ fontSize: 48, mb: 1, opacity: 0.5 }} />
                <Typography>No folders yet. Add a parent folder above.</Typography>
                <Typography variant="caption">
                  If left empty, the default folder structure (ACI, UCS, UTCS) will be used.
                </Typography>
              </Box>
            ) : (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {folderTemplate.map((folder, folderIndex) => (
                  <Paper 
                    key={folderIndex}
                    sx={{ 
                      p: 2, 
                      border: `1px solid ${selectedFolderIndex === folderIndex ? '#6366f1' : borderColor}`,
                      borderRadius: 2
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <FolderIcon sx={{ color: '#f59e0b' }} />
                        <Typography variant="h6" sx={{ fontWeight: 600, color: textPrimary }}>
                          {folder.name}
                        </Typography>
                      </Box>
                      <IconButton 
                        size="small" 
                        onClick={() => removeFolder(folderIndex)}
                        sx={{ color: '#ef4444' }}
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Box>
                    
                    {/* Subfolders */}
                    <Box sx={{ pl: 4 }}>
                      {folder.subfolders && folder.subfolders.length > 0 && (
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mb: 2 }}>
                          {folder.subfolders.map((subfolder) => (
                            <Box 
                              key={subfolder.name}
                              sx={{ 
                                display: 'flex', 
                                alignItems: 'center', 
                                justifyContent: 'space-between',
                                bgcolor: mode === 'dark' ? '#252538' : '#f1f5f9',
                                px: 2,
                                py: 1,
                                borderRadius: 1
                              }}
                            >
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <FolderIcon sx={{ fontSize: 18, color: textSecondary }} />
                                <Typography variant="body2" sx={{ color: textPrimary }}>
                                  {subfolder.name}
                                </Typography>
                              </Box>
                              <IconButton 
                                size="small" 
                                onClick={() => removeSubfolder(folderIndex, folder.subfolders.indexOf(subfolder))}
                                sx={{ color: '#ef4444' }}
                              >
                                <DeleteIcon fontSize="small" />
                              </IconButton>
                            </Box>
                          ))}
                        </Box>
                      )}
                      
                      {/* Add Subfolder */}
                      <Box sx={{ display: 'flex', gap: 1 }}>
                        <TextField
                          size="small"
                          value={selectedFolderIndex === folderIndex ? newSubfolderName : ''}
                          onChange={(e) => {
                            setSelectedFolderIndex(folderIndex);
                            setNewSubfolderName(e.target.value);
                          }}
                          onFocus={() => setSelectedFolderIndex(folderIndex)}
                          placeholder="Add subfolder..."
                          sx={{ flex: 1 }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && selectedFolderIndex === folderIndex) {
                              addSubfolder(folderIndex);
                            }
                          }}
                        />
                        <Button
                          size="small"
                          variant="outlined"
                          onClick={() => {
                            setSelectedFolderIndex(folderIndex);
                            addSubfolder(folderIndex);
                          }}
                          disabled={selectedFolderIndex !== folderIndex || !newSubfolderName.trim()}
                        >
                          Add
                        </Button>
                      </Box>
                    </Box>
                  </Paper>
                ))}
              </Box>
            )}
          </Box>
        </DialogContent>
        <DialogActions sx={{ p: 3 }}>
          <Button onClick={() => setFolderTemplateDialog(false)}>Cancel</Button>
          <Button 
            variant="contained" 
            onClick={saveFolderTemplate}
            sx={{ bgcolor: '#f59e0b', '&:hover': { bgcolor: '#d97706' } }}
          >
            Save Folder Structure
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert 
          severity={snackbar.severity} 
          onClose={() => setSnackbar({ ...snackbar, open: false })}
          sx={{ width: '100%' }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default CompanyOnboarding;

