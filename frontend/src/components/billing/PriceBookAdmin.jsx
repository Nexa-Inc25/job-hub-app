/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
/**
 * Price Book Admin - Rate Management for PMs
 * 
 * Features:
 * - List all price books (draft, active, archived)
 * - Create new price book
 * - CSV import for bulk rate loading
 * - Edit items inline (draft only)
 * - Activate/Archive workflow
 * - Rate search and filtering
 * 
 * @module components/billing/PriceBookAdmin
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import PropTypes from 'prop-types';
import {
  Box,
  Paper,
  Typography,
  Button,
  IconButton,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  Chip,
  Tooltip,
  Alert,
  AlertTitle,
  CircularProgress,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  InputAdornment,
  Card,
  CardContent,
  CardActions,
  Grid,
  Tabs,
  Tab,
  Snackbar,
  LinearProgress,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import UploadIcon from '@mui/icons-material/Upload';
import DownloadIcon from '@mui/icons-material/Download';
import ActivateIcon from '@mui/icons-material/CheckCircle';
import SearchIcon from '@mui/icons-material/Search';
import RefreshIcon from '@mui/icons-material/Refresh';
import CloseIcon from '@mui/icons-material/Close';
import PriceIcon from '@mui/icons-material/AttachMoney';
import CategoryIcon from '@mui/icons-material/Category';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import CheckIcon from '@mui/icons-material/Check';
import api from '../../api';

// Category colors
const CATEGORY_COLORS = {
  civil: '#ff9800',
  electrical: '#2196f3',
  overhead: '#9c27b0',
  underground: '#795548',
  traffic_control: '#f44336',
  vegetation: '#4caf50',
  emergency: '#e91e63',
  other: '#607d8b',
};

const CATEGORY_LABELS = {
  civil: 'Civil',
  electrical: 'Electrical',
  overhead: 'Overhead',
  underground: 'Underground',
  traffic_control: 'Traffic Control',
  vegetation: 'Vegetation',
  emergency: 'Emergency',
  other: 'Other',
};

// Status badges
const StatusChip = ({ status }) => {
  const config = {
    draft: { color: 'default', label: 'Draft' },
    active: { color: 'success', label: 'Active' },
    superseded: { color: 'warning', label: 'Superseded' },
    archived: { color: 'default', label: 'Archived' },
  };
  const { color, label } = config[status] || config.draft;
  return <Chip size="small" color={color} label={label} />;
};

StatusChip.propTypes = {
  status: PropTypes.string.isRequired,
};

/**
 * Price Book Card - List view item
 */
const PriceBookCard = ({ priceBook, onView, onActivate, onDelete }) => {
  const categoryBreakdown = priceBook.categoryBreakdown || {};
  const topCategories = Object.entries(categoryBreakdown)
    .filter(([, count]) => count > 0)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3);

  return (
    <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <CardContent sx={{ flex: 1 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
          <Typography variant="h6" fontWeight={600} sx={{ flex: 1 }}>
            {priceBook.name}
          </Typography>
          <StatusChip status={priceBook.status} />
        </Box>
        
        {priceBook.contractNumber && (
          <Typography variant="body2" color="text.secondary" gutterBottom>
            Contract: {priceBook.contractNumber}
          </Typography>
        )}
        
        <Typography variant="body2" color="text.secondary">
          Effective: {new Date(priceBook.effectiveDate).toLocaleDateString()}
          {priceBook.expirationDate && ` - ${new Date(priceBook.expirationDate).toLocaleDateString()}`}
        </Typography>
        
        <Box sx={{ mt: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
          <PriceIcon color="action" fontSize="small" />
          <Typography variant="body2">
            <strong>{priceBook.itemCount || 0}</strong> rate items
          </Typography>
        </Box>
        
        {topCategories.length > 0 && (
          <Box sx={{ mt: 1, display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
            {topCategories.map(([category, count]) => (
              <Chip
                key={category}
                size="small"
                label={`${CATEGORY_LABELS[category] || category}: ${count}`}
                sx={{ 
                  bgcolor: `${CATEGORY_COLORS[category]}20`,
                  color: CATEGORY_COLORS[category],
                  fontSize: '0.7rem',
                }}
              />
            ))}
          </Box>
        )}
      </CardContent>
      
      <CardActions sx={{ justifyContent: 'space-between', px: 2, pb: 2 }}>
        <Button size="small" onClick={() => onView(priceBook)}>
          View Items
        </Button>
        <Box>
          {priceBook.status === 'draft' && (
            <>
              <Tooltip title="Activate">
                <IconButton size="small" color="success" onClick={() => onActivate(priceBook)}>
                  <ActivateIcon />
                </IconButton>
              </Tooltip>
              <Tooltip title="Delete">
                <IconButton size="small" color="error" onClick={() => onDelete(priceBook)}>
                  <DeleteIcon />
                </IconButton>
              </Tooltip>
            </>
          )}
        </Box>
      </CardActions>
    </Card>
  );
};

PriceBookCard.propTypes = {
  priceBook: PropTypes.object.isRequired,
  onView: PropTypes.func.isRequired,
  onActivate: PropTypes.func.isRequired,
  onDelete: PropTypes.func.isRequired,
};

/**
 * Create Price Book Dialog
 */
const CreatePriceBookDialog = ({ open, onClose, utilities, onSuccess }) => {
  const [name, setName] = useState('');
  const [utilityId, setUtilityId] = useState('');
  const [contractNumber, setContractNumber] = useState('');
  const [effectiveDate, setEffectiveDate] = useState(new Date().toISOString().split('T')[0]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async () => {
    if (!name.trim() || !utilityId || !effectiveDate) {
      setError('Name, utility, and effective date are required');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const response = await api.post('/api/pricebooks', {
        name: name.trim(),
        utilityId,
        contractNumber: contractNumber.trim() || undefined,
        effectiveDate,
      });
      onSuccess(response.data);
      handleClose();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create price book');
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    setName('');
    setUtilityId('');
    setContractNumber('');
    setEffectiveDate(new Date().toISOString().split('T')[0]);
    setError(null);
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>Create New Price Book</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
          <TextField
            fullWidth
            label="Price Book Name"
            placeholder="e.g., PG&E MSA 2026 Rates"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          
          <FormControl fullWidth required>
            <InputLabel>Utility</InputLabel>
            <Select
              value={utilityId}
              onChange={(e) => setUtilityId(e.target.value)}
              label="Utility"
            >
              {utilities.map((u) => (
                <MenuItem key={u._id} value={u._id}>{u.name}</MenuItem>
              ))}
            </Select>
          </FormControl>
          
          <TextField
            fullWidth
            label="Contract Number"
            placeholder="MSA-2026-001"
            value={contractNumber}
            onChange={(e) => setContractNumber(e.target.value)}
          />
          
          <TextField
            fullWidth
            type="date"
            label="Effective Date"
            value={effectiveDate}
            onChange={(e) => setEffectiveDate(e.target.value)}
            InputLabelProps={{ shrink: true }}
            required
          />
          
          {error && (
            <Alert severity="error">{error}</Alert>
          )}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={submitting}>Cancel</Button>
        <Button 
          onClick={handleSubmit} 
          variant="contained" 
          disabled={submitting}
          startIcon={submitting ? <CircularProgress size={20} /> : <AddIcon />}
        >
          Create
        </Button>
      </DialogActions>
    </Dialog>
  );
};

CreatePriceBookDialog.propTypes = {
  open: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  utilities: PropTypes.array.isRequired,
  onSuccess: PropTypes.func.isRequired,
};

/**
 * CSV Import Dialog
 */
const CSVImportDialog = ({ open, onClose, priceBookId, onSuccess }) => {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const handleUpload = async () => {
    if (!file) {
      setError('Please select a CSV file');
      return;
    }

    setUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await api.post(`/api/pricebooks/${priceBookId}/import`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      setResult(response.data);
      onSuccess();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to import CSV');
    } finally {
      setUploading(false);
    }
  };

  const handleClose = () => {
    setFile(null);
    setResult(null);
    setError(null);
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>Import Rate Items from CSV</DialogTitle>
      <DialogContent>
        {result ? (
          <Box sx={{ mt: 1 }}>
            <Alert severity={result.errors > 0 ? 'warning' : 'success'}>
              <AlertTitle>Import Complete</AlertTitle>
              <strong>{result.imported}</strong> items imported successfully.
              {result.errors > 0 && (
                <> <strong>{result.errors}</strong> rows had errors.</>
              )}
            </Alert>

            {result.errorDetails?.length > 0 && (
              <Box sx={{ mt: 2, maxHeight: 200, overflow: 'auto' }}>
                <Typography variant="subtitle2" gutterBottom>
                  Errors:
                </Typography>
                {result.errorDetails.map((err) => (
                  <Typography key={`row-${err.row}`} variant="body2" color="error.main">
                    Row {err.row}: {err.message}
                  </Typography>
                ))}
              </Box>
            )}
          </Box>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <Alert severity="info">
              <AlertTitle>CSV Format</AlertTitle>
              Required columns: <strong>itemCode, description, category, unit, unitPrice</strong>
              <br />
              Optional: shortDescription, subcategory, laborRate, materialRate, oracleItemId
            </Alert>

            <Box
              sx={{
                border: '2px dashed',
                borderColor: file ? 'success.main' : 'divider',
                borderRadius: 2,
                p: 4,
                textAlign: 'center',
                cursor: 'pointer',
                '&:hover': { borderColor: 'primary.main' },
              }}
              onClick={() => document.getElementById('csv-upload').click()}
            >
              <input
                id="csv-upload"
                type="file"
                accept=".csv"
                hidden
                onChange={(e) => setFile(e.target.files?.[0] || null)}
              />
              {file ? (
                <Box>
                  <CheckIcon color="success" sx={{ fontSize: 48 }} />
                  <Typography>{file.name}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {(file.size / 1024).toFixed(1)} KB
                  </Typography>
                </Box>
              ) : (
                <Box>
                  <CloudUploadIcon sx={{ fontSize: 48, color: 'action.active' }} />
                  <Typography>Click to select CSV file</Typography>
                </Box>
              )}
            </Box>

            {error && (
              <Alert severity="error">{error}</Alert>
            )}
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>
          {result ? 'Close' : 'Cancel'}
        </Button>
        {!result && (
          <Button
            onClick={handleUpload}
            variant="contained"
            disabled={!file || uploading}
            startIcon={uploading ? <CircularProgress size={20} /> : <UploadIcon />}
          >
            {uploading ? 'Importing...' : 'Import'}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
};

CSVImportDialog.propTypes = {
  open: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  priceBookId: PropTypes.string.isRequired,
  onSuccess: PropTypes.func.isRequired,
};

/**
 * Price Book Detail View - Items Table
 */
const PriceBookDetail = ({ priceBook, onBack, onImport, onActivate, onRefresh: _onRefresh }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);

  const filteredItems = useMemo(() => {
    if (!priceBook?.items) return [];
    
    let items = priceBook.items.filter(i => i.isActive !== false);
    
    if (categoryFilter !== 'all') {
      items = items.filter(i => i.category === categoryFilter);
    }
    
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      items = items.filter(i =>
        i.itemCode.toLowerCase().includes(query) ||
        i.description.toLowerCase().includes(query)
      );
    }
    
    return items;
  }, [priceBook, categoryFilter, searchQuery]);

  const paginatedItems = filteredItems.slice(
    page * rowsPerPage,
    page * rowsPerPage + rowsPerPage
  );

  const handleExportCSV = () => {
    if (!priceBook?.items) return;
    
    const headers = ['itemCode', 'description', 'category', 'unit', 'unitPrice', 'laborRate', 'materialRate'];
    const rows = priceBook.items.map(item =>
      headers.map(h => item[h] || '').join(',')
    );
    
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${priceBook.name.replaceAll(/\s+/g, '_')}_rates.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Button startIcon={<CloseIcon />} onClick={onBack}>
            Back
          </Button>
          <Typography variant="h5" fontWeight={600}>
            {priceBook.name}
          </Typography>
          <StatusChip status={priceBook.status} />
        </Box>
        
        <Box sx={{ display: 'flex', gap: 1 }}>
          {priceBook.status === 'draft' && (
            <>
              <Button
                variant="outlined"
                startIcon={<UploadIcon />}
                onClick={onImport}
              >
                Import CSV
              </Button>
              <Button
                variant="contained"
                color="success"
                startIcon={<ActivateIcon />}
                onClick={() => onActivate(priceBook)}
                disabled={!priceBook.items?.length}
              >
                Activate
              </Button>
            </>
          )}
          <Button
            variant="outlined"
            startIcon={<DownloadIcon />}
            onClick={handleExportCSV}
          >
            Export CSV
          </Button>
        </Box>
      </Box>

      {/* Filters */}
      <Paper sx={{ p: 2, mb: 2 }}>
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
          <TextField
            placeholder="Search by code or description..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            size="small"
            sx={{ minWidth: 300 }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon />
                </InputAdornment>
              ),
            }}
          />
          
          <FormControl size="small" sx={{ minWidth: 150 }}>
            <InputLabel>Category</InputLabel>
            <Select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              label="Category"
            >
              <MenuItem value="all">All Categories</MenuItem>
              {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
                <MenuItem key={key} value={key}>{label}</MenuItem>
              ))}
            </Select>
          </FormControl>
          
          <Typography variant="body2" color="text.secondary" sx={{ alignSelf: 'center', ml: 'auto' }}>
            Showing {filteredItems.length} of {priceBook.items?.length || 0} items
          </Typography>
        </Box>
      </Paper>

      {/* Items Table */}
      <Paper>
        <TableContainer sx={{ maxHeight: 'calc(100vh - 350px)' }}>
          <Table stickyHeader size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 600 }}>Item Code</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Description</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Category</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Unit</TableCell>
                <TableCell align="right" sx={{ fontWeight: 600 }}>Unit Price</TableCell>
                <TableCell align="right" sx={{ fontWeight: 600 }}>Labor</TableCell>
                <TableCell align="right" sx={{ fontWeight: 600 }}>Material</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {paginatedItems.map((item, idx) => (
                <TableRow key={item._id || idx} hover>
                  <TableCell>
                    <Typography variant="body2" fontWeight={600} fontFamily="monospace">
                      {item.itemCode}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">
                      {item.description}
                    </Typography>
                    {item.shortDescription && (
                      <Typography variant="caption" color="text.secondary">
                        ({item.shortDescription})
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      label={CATEGORY_LABELS[item.category] || item.category}
                      sx={{
                        bgcolor: `${CATEGORY_COLORS[item.category]}20`,
                        color: CATEGORY_COLORS[item.category],
                      }}
                    />
                  </TableCell>
                  <TableCell>{item.unit}</TableCell>
                  <TableCell align="right">
                    <Typography fontWeight={600}>
                      ${item.unitPrice?.toFixed(2)}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    {item.laborRate ? `$${item.laborRate.toFixed(2)}` : '-'}
                  </TableCell>
                  <TableCell align="right">
                    {item.materialRate ? `$${item.materialRate.toFixed(2)}` : '-'}
                  </TableCell>
                </TableRow>
              ))}
              
              {paginatedItems.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} align="center" sx={{ py: 4 }}>
                    <Typography color="text.secondary">
                      {priceBook.items?.length === 0 
                        ? 'No rate items yet. Import a CSV to get started.'
                        : 'No items match your search.'}
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
        
        <TablePagination
          component="div"
          count={filteredItems.length}
          page={page}
          onPageChange={(e, newPage) => setPage(newPage)}
          rowsPerPage={rowsPerPage}
          onRowsPerPageChange={(e) => {
            setRowsPerPage(Number.parseInt(e.target.value, 10));
            setPage(0);
          }}
          rowsPerPageOptions={[10, 25, 50, 100]}
        />
      </Paper>
    </Box>
  );
};

PriceBookDetail.propTypes = {
  priceBook: PropTypes.object.isRequired,
  onBack: PropTypes.func.isRequired,
  onImport: PropTypes.func.isRequired,
  onActivate: PropTypes.func.isRequired,
  onRefresh: PropTypes.func.isRequired,
};

/**
 * Main Price Book Admin Component
 */
const PriceBookAdmin = () => {
  const [priceBooks, setPriceBooks] = useState([]);
  const [utilities, setUtilities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // UI state
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedPriceBook, setSelectedPriceBook] = useState(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });

  const showSnackbar = (message, severity = 'success') => {
    setSnackbar({ open: true, message, severity });
  };

  // Fetch data
  const fetchPriceBooks = useCallback(async () => {
    try {
      setLoading(true);
      const params = statusFilter === 'all' ? {} : { status: statusFilter };
      const response = await api.get('/api/pricebooks', { params });
      setPriceBooks(response.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load price books');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  const fetchUtilities = useCallback(async () => {
    try {
      const response = await api.get('/api/utilities');
      setUtilities(response.data);
    } catch (err) {
      console.error('Failed to fetch utilities:', err);
    }
  }, []);

  useEffect(() => {
    fetchPriceBooks();
    fetchUtilities();
  }, [fetchPriceBooks, fetchUtilities]);

  // Handlers
  const handleViewPriceBook = async (priceBook) => {
    try {
      const response = await api.get(`/api/pricebooks/${priceBook._id}`);
      setSelectedPriceBook(response.data);
    } catch (err) {
      showSnackbar(err.response?.data?.error || 'Failed to load price book', 'error');
    }
  };

  const handleActivatePriceBook = async (priceBook) => {
    if (!confirm(`Activate "${priceBook.name}"? This will make it the active rate sheet and supersede any existing active price book.`)) {
      return;
    }

    try {
      await api.post(`/api/pricebooks/${priceBook._id}/activate`);
      showSnackbar('Price book activated successfully');
      fetchPriceBooks();
      if (selectedPriceBook?._id === priceBook._id) {
        handleViewPriceBook(priceBook);
      }
    } catch (err) {
      showSnackbar(err.response?.data?.error || 'Failed to activate price book', 'error');
    }
  };

  const handleDeletePriceBook = async (priceBook) => {
    if (!confirm(`Delete "${priceBook.name}"? This cannot be undone.`)) {
      return;
    }

    try {
      await api.delete(`/api/pricebooks/${priceBook._id}`);
      showSnackbar('Price book deleted');
      fetchPriceBooks();
    } catch (err) {
      showSnackbar(err.response?.data?.error || 'Failed to delete price book', 'error');
    }
  };

  const handleCreateSuccess = (newPriceBook) => {
    showSnackbar('Price book created');
    fetchPriceBooks();
    handleViewPriceBook(newPriceBook);
  };

  const handleImportSuccess = () => {
    showSnackbar('Items imported successfully');
    if (selectedPriceBook) {
      handleViewPriceBook(selectedPriceBook);
    }
    fetchPriceBooks();
  };

  const filteredPriceBooks = useMemo(() => {
    if (statusFilter === 'all') return priceBooks;
    return priceBooks.filter(pb => pb.status === statusFilter);
  }, [priceBooks, statusFilter]);

  // Detail view
  if (selectedPriceBook) {
    return (
      <Box sx={{ p: 3 }}>
        <PriceBookDetail
          priceBook={selectedPriceBook}
          onBack={() => setSelectedPriceBook(null)}
          onImport={() => setImportDialogOpen(true)}
          onActivate={handleActivatePriceBook}
          onRefresh={() => handleViewPriceBook(selectedPriceBook)}
        />

        <CSVImportDialog
          open={importDialogOpen}
          onClose={() => setImportDialogOpen(false)}
          priceBookId={selectedPriceBook._id}
          onSuccess={handleImportSuccess}
        />

        <Snackbar
          open={snackbar.open}
          autoHideDuration={4000}
          onClose={() => setSnackbar({ ...snackbar, open: false })}
        >
          <Alert severity={snackbar.severity} variant="filled">
            {snackbar.message}
          </Alert>
        </Snackbar>
      </Box>
    );
  }

  // List view
  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h4" fontWeight={700}>
            Price Book Management
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Manage utility contract rate sheets for unit-price billing
          </Typography>
        </Box>
        
        <Box sx={{ display: 'flex', gap: 2 }}>
          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={fetchPriceBooks}
            disabled={loading}
          >
            Refresh
          </Button>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setCreateDialogOpen(true)}
          >
            Create Price Book
          </Button>
        </Box>
      </Box>

      {/* Status Filter Tabs */}
      <Box sx={{ mb: 3 }}>
        <Tabs
          value={statusFilter}
          onChange={(e, v) => setStatusFilter(v)}
          indicatorColor="primary"
        >
          <Tab value="all" label="All" />
          <Tab value="draft" label="Draft" />
          <Tab value="active" label="Active" />
          <Tab value="superseded" label="Superseded" />
          <Tab value="archived" label="Archived" />
        </Tabs>
      </Box>

      {/* Error state */}
      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {/* Loading state */}
      {loading && <LinearProgress sx={{ mb: 2 }} />}

      {/* Empty state */}
      {!loading && filteredPriceBooks.length === 0 && (
        <Paper sx={{ p: 6, textAlign: 'center' }}>
          <CategoryIcon sx={{ fontSize: 64, color: 'action.disabled', mb: 2 }} />
          <Typography variant="h6" gutterBottom>
            No Price Books Found
          </Typography>
          <Typography color="text.secondary" sx={{ mb: 3 }}>
            Create a price book to start managing your utility contract rates.
          </Typography>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setCreateDialogOpen(true)}
          >
            Create Price Book
          </Button>
        </Paper>
      )}

      {/* Price Books Grid */}
      {!loading && filteredPriceBooks.length > 0 && (
        <Grid container spacing={3}>
          {filteredPriceBooks.map((pb) => (
            <Grid item xs={12} sm={6} md={4} key={pb._id}>
              <PriceBookCard
                priceBook={pb}
                onView={handleViewPriceBook}
                onActivate={handleActivatePriceBook}
                onDelete={handleDeletePriceBook}
              />
            </Grid>
          ))}
        </Grid>
      )}

      {/* Create Dialog */}
      <CreatePriceBookDialog
        open={createDialogOpen}
        onClose={() => setCreateDialogOpen(false)}
        utilities={utilities}
        onSuccess={handleCreateSuccess}
      />

      {/* Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
      >
        <Alert severity={snackbar.severity} variant="filled">
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default PriceBookAdmin;

