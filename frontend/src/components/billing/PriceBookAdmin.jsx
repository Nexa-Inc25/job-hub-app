/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
/**
 * Price Book Admin - Rate Management for PMs
 *
 * Features:
 * - List all price books (draft, active, archived)
 * - Create new price book / new version
 * - CSV import for bulk rate loading (PriceBookImport)
 * - View items with search/filter (PriceBookItemEditor)
 * - Version history viewer (PriceBookVersionHistory)
 * - Activate/Archive workflow
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
  Chip,
  Tooltip,
  Alert,
  CircularProgress,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
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
import ActivateIcon from '@mui/icons-material/CheckCircle';
import RefreshIcon from '@mui/icons-material/Refresh';
import PriceIcon from '@mui/icons-material/AttachMoney';
import CategoryIcon from '@mui/icons-material/Category';
import api from '../../api';

// Extracted sub-components
import PriceBookImport from './PriceBookImport';
import PriceBookItemEditor, {
  CATEGORY_COLORS,
  CATEGORY_LABELS,
  StatusChip,
} from './PriceBookItemEditor';
import PriceBookVersionHistory from './PriceBookVersionHistory';

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

  const handleCreateVersion = async () => {
    if (!selectedPriceBook) return;

    try {
      const response = await api.post(`/api/pricebooks/${selectedPriceBook._id}/new-version`, {
        effectiveDate: new Date().toISOString().split('T')[0],
      });
      showSnackbar('New version created as draft');
      fetchPriceBooks();
      handleViewPriceBook(response.data);
    } catch (err) {
      showSnackbar(err.response?.data?.error || 'Failed to create version', 'error');
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
        {/* Version history button alongside the item editor */}
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1 }}>
          <PriceBookVersionHistory
            priceBookId={selectedPriceBook._id}
            priceBookName={selectedPriceBook.name}
            onCreateVersion={handleCreateVersion}
          />
        </Box>

        <PriceBookItemEditor
          priceBook={selectedPriceBook}
          onBack={() => setSelectedPriceBook(null)}
          onImport={() => setImportDialogOpen(true)}
          onActivate={handleActivatePriceBook}
        />

        <PriceBookImport
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
          onChange={(_e, v) => setStatusFilter(v)}
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
            <Grid size={{ xs: 12, sm: 6, md: 4 }} key={pb._id}>
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
