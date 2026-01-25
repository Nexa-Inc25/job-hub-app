// src/components/AdminUsersList.js
// Detailed view of all platform users organized by company

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import {
  Container,
  Typography,
  Box,
  Paper,
  IconButton,
  AppBar,
  Toolbar,
  Chip,
  CircularProgress,
  Alert,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Collapse,
  TextField,
  InputAdornment,
} from '@mui/material';
import {
  ArrowBack as ArrowBackIcon,
  People as PeopleIcon,
  Business as BusinessIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  Search as SearchIcon,
  AdminPanelSettings as AdminIcon,
  Person as PersonIcon,
} from '@mui/icons-material';
import { useThemeMode } from '../ThemeContext';

const ROLE_COLORS = {
  admin: '#6366f1',
  pm: '#8b5cf6',
  gf: '#f59e0b',
  foreman: '#22c55e',
  crew: '#64748b',
};

const ROLE_LABELS = {
  admin: 'Admin',
  pm: 'Project Manager',
  gf: 'General Foreman',
  foreman: 'Foreman',
  crew: 'Crew',
};

const AdminUsersList = () => {
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedCompanies, setExpandedCompanies] = useState({});
  const [search, setSearch] = useState('');
  const [stats, setStats] = useState({ totalUsers: 0, totalCompanies: 0 });
  const navigate = useNavigate();
  const { mode } = useThemeMode();

  const cardBg = mode === 'dark' ? '#1e1e2e' : '#ffffff';
  const textPrimary = mode === 'dark' ? '#e2e8f0' : '#1e293b';
  const textSecondary = mode === 'dark' ? '#94a3b8' : '#64748b';
  const borderColor = mode === 'dark' ? '#334155' : '#e2e8f0';

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
          } catch (err) {
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

  if (loading) {
    return (
      <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: mode === 'dark' ? '#0f0f1a' : '#f8fafc' }}>
        <CircularProgress size={48} sx={{ color: '#6366f1' }} />
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: mode === 'dark' ? '#0f0f1a' : '#f8fafc', p: 3 }}>
        <Alert severity="error">{error}</Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: mode === 'dark' ? '#0f0f1a' : '#f1f5f9' }}>
      <AppBar position="sticky" elevation={0} sx={{ bgcolor: mode === 'dark' ? '#1e1e2e' : '#ffffff', borderBottom: `1px solid ${borderColor}` }}>
        <Toolbar>
          <IconButton onClick={() => navigate('/admin/owner-dashboard')} sx={{ mr: 2, color: textPrimary }}>
            <ArrowBackIcon />
          </IconButton>
          <PeopleIcon sx={{ mr: 1.5, color: '#6366f1' }} />
          <Typography variant="h6" sx={{ flexGrow: 1, color: textPrimary, fontWeight: 700 }}>
            All Users
          </Typography>
          <Chip 
            label={`${stats.totalUsers} users across ${stats.totalCompanies} companies`}
            sx={{ bgcolor: '#6366f120', color: '#6366f1', fontWeight: 600 }}
          />
        </Toolbar>
      </AppBar>

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
                  bgcolor: mode === 'dark' ? '#252538' : '#f8fafc',
                  '&:hover': { bgcolor: mode === 'dark' ? '#2a2a40' : '#f1f5f9' }
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
                      <TableRow sx={{ bgcolor: mode === 'dark' ? '#1a1a28' : '#f8fafc' }}>
                        <TableCell sx={{ color: textSecondary, fontWeight: 600 }}>Name</TableCell>
                        <TableCell sx={{ color: textSecondary, fontWeight: 600 }}>Email</TableCell>
                        <TableCell sx={{ color: textSecondary, fontWeight: 600 }}>Role</TableCell>
                        <TableCell sx={{ color: textSecondary, fontWeight: 600 }}>Status</TableCell>
                        <TableCell sx={{ color: textSecondary, fontWeight: 600 }}>Created</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {filteredUsers.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} sx={{ textAlign: 'center', color: textSecondary, py: 4 }}>
                            No users in this company
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredUsers.map((user) => (
                          <TableRow key={user._id} sx={{ '&:hover': { bgcolor: mode === 'dark' ? '#252538' : '#f8fafc' } }}>
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
    </Box>
  );
};

export default AdminUsersList;

