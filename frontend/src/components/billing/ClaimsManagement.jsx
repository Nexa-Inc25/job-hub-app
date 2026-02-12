/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
/**
 * ClaimsManagement Component - Create and Manage Payment Claims
 * 
 * Allows PM to:
 * - Create claims from approved units
 * - Review claim line items
 * - Export to Oracle Payables format
 * - Track claim status and payments
 * 
 * @module components/billing/ClaimsManagement
 */

import React, { useState, useCallback, useMemo } from 'react';
import PropTypes from 'prop-types';
import {
  Box,
  Typography,
  Button,
  IconButton,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Divider,
  Alert,
  AlertTitle,
  CircularProgress,
  Tooltip,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Card,
  CardContent,
  CardActions,
  Grid,
  Collapse,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import SubmitIcon from '@mui/icons-material/Send';
import ClaimIcon from '@mui/icons-material/Receipt';
import ExpandIcon from '@mui/icons-material/ExpandMore';
import CollapseIcon from '@mui/icons-material/ExpandLess';
import MoreIcon from '@mui/icons-material/MoreVert';
import DeleteIcon from '@mui/icons-material/Delete';
import ViewIcon from '@mui/icons-material/Visibility';
import PaymentIcon from '@mui/icons-material/AttachMoney';
import WarningIcon from '@mui/icons-material/Warning';
import ExportIcon from '@mui/icons-material/CloudUpload';
import CSVIcon from '@mui/icons-material/Description';
import JSONIcon from '@mui/icons-material/Code';
import { formatForOracle, exportToCSV, validateForExport } from '../../utils/oracleMapper';

// Claim status configurations
const CLAIM_STATUS = {
  draft: { label: 'Draft', color: 'default' },
  submitted: { label: 'Submitted', color: 'info' },
  approved: { label: 'Approved', color: 'success' },
  rejected: { label: 'Rejected', color: 'error' },
  exported: { label: 'Exported', color: 'secondary' },
  paid: { label: 'Paid', color: 'success' },
  partial_paid: { label: 'Partial', color: 'warning' },
};

/**
 * Format currency
 */
function formatCurrency(amount) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount || 0);
}

/**
 * Format date
 */
function formatDate(date) {
  if (!date) return '-';
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Create Claim Dialog
 */
const CreateClaimDialog = ({ 
  open, 
  onClose, 
  units = [],
  onSubmit,
  loading,
}) => {
  const [description, setDescription] = useState('');
  const [notes, setNotes] = useState('');

  const totals = useMemo(() => {
    const subtotal = units.reduce((sum, u) => sum + (u.totalAmount || u.quantity * u.unitPrice), 0);
    const byTier = {
      prime: units.filter(u => u.performedBy?.tier !== 'sub' && u.performedBy?.tier !== 'sub_of_sub')
        .reduce((sum, u) => sum + (u.totalAmount || 0), 0),
      sub: units.filter(u => u.performedBy?.tier === 'sub')
        .reduce((sum, u) => sum + (u.totalAmount || 0), 0),
      sub_of_sub: units.filter(u => u.performedBy?.tier === 'sub_of_sub')
        .reduce((sum, u) => sum + (u.totalAmount || 0), 0),
    };
    return { subtotal, byTier };
  }, [units]);

  const validation = useMemo(() => {
    return validateForExport({ _id: 'preview' }, units);
  }, [units]);

  const handleSubmit = () => {
    onSubmit({
      description: description || `Claim - ${formatDate(new Date())}`,
      notes,
      unitIds: units.map(u => u._id),
      subtotal: totals.subtotal,
      tierTotals: totals.byTier,
    });
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <ClaimIcon color="primary" />
        Create Payment Claim
      </DialogTitle>
      
      <DialogContent dividers>
        {/* Validation Warnings */}
        {validation.warnings.length > 0 && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            <AlertTitle>Review Required</AlertTitle>
            <ul style={{ margin: 0, paddingLeft: 20 }}>
              {validation.warnings.slice(0, 5).map((w) => (
                <li key={w}>{w}</li>
              ))}
              {validation.warnings.length > 5 && (
                <li>...and {validation.warnings.length - 5} more</li>
              )}
            </ul>
          </Alert>
        )}

        {/* Claim Details */}
        <Grid container spacing={2} sx={{ mb: 2 }}>
          <Grid size={12}>
            <TextField
              label="Claim Description"
              fullWidth
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={`Claim - ${formatDate(new Date())}`}
            />
          </Grid>
          <Grid size={12}>
            <TextField
              label="Notes (Optional)"
              fullWidth
              multiline
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </Grid>
        </Grid>

        {/* Summary Cards */}
        <Grid container spacing={2} sx={{ mb: 2 }}>
          <Grid size={{ xs: 6, md: 3 }}>
            <Card variant="outlined">
              <CardContent sx={{ textAlign: 'center', py: 1 }}>
                <Typography variant="h4" color="primary">
                  {units.length}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Line Items
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid size={{ xs: 6, md: 3 }}>
            <Card variant="outlined">
              <CardContent sx={{ textAlign: 'center', py: 1 }}>
                <Typography variant="h5" color="success.main">
                  {formatCurrency(totals.subtotal)}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Subtotal
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid size={{ xs: 6, md: 3 }}>
            <Card variant="outlined">
              <CardContent sx={{ textAlign: 'center', py: 1 }}>
                <Typography variant="h6">
                  {formatCurrency(totals.byTier.prime)}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Prime
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid size={{ xs: 6, md: 3 }}>
            <Card variant="outlined">
              <CardContent sx={{ textAlign: 'center', py: 1 }}>
                <Typography variant="h6">
                  {formatCurrency(totals.byTier.sub + totals.byTier.sub_of_sub)}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Subcontractors
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        {/* Line Items Table */}
        <Typography variant="subtitle2" gutterBottom>
          Included Units
        </Typography>
        <TableContainer sx={{ maxHeight: 300 }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell>Item Code</TableCell>
                <TableCell>Description</TableCell>
                <TableCell align="right">Qty</TableCell>
                <TableCell align="right">Unit Price</TableCell>
                <TableCell align="right">Total</TableCell>
                <TableCell>Tier</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {units.map((unit, index) => (
                <TableRow key={unit._id || index}>
                  <TableCell>{unit.priceBookItemCode || unit.itemCode || '-'}</TableCell>
                  <TableCell>{unit.itemDescription || unit.description || '-'}</TableCell>
                  <TableCell align="right">{unit.quantity}</TableCell>
                  <TableCell align="right">{formatCurrency(unit.unitPrice)}</TableCell>
                  <TableCell align="right">
                    {formatCurrency(unit.totalAmount || unit.quantity * unit.unitPrice)}
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={unit.performedBy?.tier?.replace('_', ' ') || 'Prime'}
                      size="small"
                      variant="outlined"
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={loading || units.length === 0}
          startIcon={loading ? <CircularProgress size={20} /> : <AddIcon />}
        >
          Create Claim
        </Button>
      </DialogActions>
    </Dialog>
  );
};

CreateClaimDialog.propTypes = {
  open: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  units: PropTypes.array,
  onSubmit: PropTypes.func.isRequired,
  loading: PropTypes.bool,
};

/**
 * Claim Card Component
 */
const ClaimCard = ({
  claim,
  units = [],
  onView,
  onApprove,
  onExportOracle,
  onExportFBDI,
  onExportCSV,
  onRecordPayment,
  onDelete,
  expanded,
  onToggleExpand,
}) => {
  const [menuAnchor, setMenuAnchor] = useState(null);
  const [exportAnchor, setExportAnchor] = useState(null);
  const isAdmin = localStorage.getItem('isAdmin') === 'true';

  const status = CLAIM_STATUS[claim.status] || CLAIM_STATUS.draft;
  const validation = validateForExport(claim, units);

  return (
    <Card sx={{ mb: 2 }}>
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
              <Typography variant="h6">
                {claim.claimNumber || `CLM-${claim._id?.slice(-6)}`}
              </Typography>
              <Chip label={status.label} color={status.color} size="small" />
              {!validation.valid && (
                <Tooltip title="Has validation issues">
                  <WarningIcon color="warning" fontSize="small" />
                </Tooltip>
              )}
            </Box>
            <Typography variant="body2" color="text.secondary">
              {claim.description || 'No description'}
            </Typography>
            <Typography variant="caption" color="text.secondary" display="block">
              Created: {formatDate(claim.createdAt)} • {claim.lineItems?.length || units.length} items
            </Typography>
          </Box>

          <Box sx={{ textAlign: 'right' }}>
            <Typography variant="h5" color="primary.main">
              {formatCurrency(claim.totalAmount || claim.subtotal)}
            </Typography>
            {claim.amountPaid > 0 && (
              <Typography variant="caption" color="success.main">
                Paid: {formatCurrency(claim.amountPaid)}
              </Typography>
            )}
          </Box>
        </Box>

        {/* Tier Breakdown */}
        {claim.tierTotals && (
          <Box sx={{ display: 'flex', gap: 2, mt: 1 }}>
            <Typography variant="caption">
              Prime: {formatCurrency(claim.tierTotals.prime)}
            </Typography>
            <Typography variant="caption">
              Sub: {formatCurrency(claim.tierTotals.sub)}
            </Typography>
            <Typography variant="caption">
              Sub-of-Sub: {formatCurrency(claim.tierTotals.sub_of_sub)}
            </Typography>
          </Box>
        )}
      </CardContent>

      <Divider />

      <CardActions sx={{ justifyContent: 'space-between' }}>
        <Box>
          <IconButton size="small" onClick={() => onToggleExpand(claim._id)} aria-label={expanded ? 'Collapse details' : 'Expand details'}>
            {expanded ? <CollapseIcon /> : <ExpandIcon />}
          </IconButton>
          <Button 
            size="small" 
            startIcon={<ViewIcon />}
            onClick={() => onView(claim)}
          >
            View Details
          </Button>
        </Box>

        <Box>
          {claim.status === 'draft' && (
            <Button
              size="small"
              startIcon={<SubmitIcon />}
              onClick={() => onApprove(claim)}
            >
              Submit
            </Button>
          )}

          {claim.status === 'approved' && (
            <Button
              size="small"
              variant="contained"
              startIcon={<ExportIcon />}
              onClick={(e) => setExportAnchor(e.currentTarget)}
            >
              Export
            </Button>
          )}

          {(claim.status === 'exported' || claim.status === 'approved') && (
            <Button
              size="small"
              startIcon={<PaymentIcon />}
              onClick={() => onRecordPayment(claim)}
            >
              Payment
            </Button>
          )}

          <IconButton
            size="small"
            onClick={(e) => setMenuAnchor(e.currentTarget)}
          >
            <MoreIcon />
          </IconButton>

          {/* Export Menu */}
          <Menu
            anchorEl={exportAnchor}
            open={Boolean(exportAnchor)}
            onClose={() => setExportAnchor(null)}
          >
            <MenuItem onClick={() => { onExportOracle(claim); setExportAnchor(null); }}>
              <ListItemIcon><JSONIcon /></ListItemIcon>
              <ListItemText 
                primary="Oracle REST API JSON" 
                secondary="For Oracle Fusion Cloud API"
              />
            </MenuItem>
            <MenuItem onClick={() => { onExportFBDI?.(claim); setExportAnchor(null); }}>
              <ListItemIcon><CSVIcon /></ListItemIcon>
              <ListItemText 
                primary="Oracle FBDI CSV" 
                secondary="For bulk import (PG&E preferred)"
              />
            </MenuItem>
            <Divider />
            <MenuItem onClick={() => { onExportCSV(claim); setExportAnchor(null); }}>
              <ListItemIcon><CSVIcon /></ListItemIcon>
              <ListItemText primary="Simple CSV" secondary="Human-readable format" />
            </MenuItem>
          </Menu>

          {/* More Menu */}
          <Menu
            anchorEl={menuAnchor}
            open={Boolean(menuAnchor)}
            onClose={() => setMenuAnchor(null)}
          >
            <MenuItem onClick={() => { onView(claim); setMenuAnchor(null); }}>
              <ListItemIcon><ViewIcon /></ListItemIcon>
              <ListItemText>View Details</ListItemText>
            </MenuItem>
            {(claim.status === 'draft' || isAdmin) && (
              <MenuItem onClick={() => { onDelete(claim); setMenuAnchor(null); }}>
                <ListItemIcon><DeleteIcon color="error" /></ListItemIcon>
                <ListItemText>{claim.status !== 'draft' ? 'Delete (Admin)' : 'Delete'}</ListItemText>
              </MenuItem>
            )}
          </Menu>
        </Box>
      </CardActions>

      {/* Expanded Line Items */}
      <Collapse in={expanded}>
        <Divider />
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Item</TableCell>
                <TableCell>Description</TableCell>
                <TableCell align="right">Qty</TableCell>
                <TableCell align="right">Amount</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {(claim.lineItems || units).slice(0, 10).map((item, index) => (
                <TableRow key={item._id || index}>
                  <TableCell>{item.priceBookItemCode || item.itemCode || '-'}</TableCell>
                  <TableCell>{item.itemDescription || item.description || '-'}</TableCell>
                  <TableCell align="right">{item.quantity}</TableCell>
                  <TableCell align="right">{formatCurrency(item.totalAmount)}</TableCell>
                </TableRow>
              ))}
              {(claim.lineItems?.length || units.length) > 10 && (
                <TableRow>
                  <TableCell colSpan={4} align="center">
                    <Typography variant="caption" color="text.secondary">
                      ...and {(claim.lineItems?.length || units.length) - 10} more items
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Collapse>
    </Card>
  );
};

ClaimCard.propTypes = {
  claim: PropTypes.object.isRequired,
  units: PropTypes.array,
  onView: PropTypes.func.isRequired,
  onApprove: PropTypes.func,
  onExportOracle: PropTypes.func,
  onExportFBDI: PropTypes.func,
  onExportCSV: PropTypes.func,
  onRecordPayment: PropTypes.func,
  onDelete: PropTypes.func,
  expanded: PropTypes.bool,
  onToggleExpand: PropTypes.func.isRequired,
};

/**
 * ClaimsManagement Component
 */
const ClaimsManagement = ({
  claims = [],
  unitsMap = {},
  loading = false,
  onCreateClaim,
  onUpdateClaim,
  onDeleteClaim,
  onExportOracle,
  onExportFBDI: _onExportFBDI,
  onExportCSV,
  onRecordPayment,
  onViewClaim,
  selectedUnits = [],
}) => {
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [expandedClaims, setExpandedClaims] = useState([]);

  const handleToggleExpand = useCallback((claimId) => {
    setExpandedClaims(prev =>
      prev.includes(claimId)
        ? prev.filter(id => id !== claimId)
        : [...prev, claimId]
    );
  }, []);

  const handleExportOracle = useCallback(async (claim) => {
    const units = unitsMap[claim._id] || claim.lineItems || [];
    try {
      // formatForOracle is async - see utils/oracleMapper.js
      const oraclePayload = await formatForOracle(claim, units); // NOSONAR - formatForOracle is async
      
      // Download as JSON
      const blob = new Blob([JSON.stringify(oraclePayload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `oracle_invoice_${claim.claimNumber || claim._id}.json`;
      a.click();
      URL.revokeObjectURL(url);

      // Also call the callback if provided
      if (onExportOracle) {
        onExportOracle(claim, oraclePayload);
      }
    } catch (err) {
      console.error('Oracle export failed:', err);
    }
  }, [unitsMap, onExportOracle]);

  // Export FBDI (File-Based Data Import) format for Oracle bulk import
  const handleExportFBDI = useCallback(async (claim) => {
    try {
      // Call backend FBDI export endpoint
      const response = await fetch(`/api/billing/claims/${claim._id}/export-fbdi`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      
      if (!response.ok) throw new Error('FBDI export failed');
      
      const csvContent = await response.text();
      
      // Download as CSV
      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${claim.claimNumber || claim._id}_FBDI.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('FBDI export failed:', err);
    }
  }, []);

  const handleExportCSV = useCallback((claim) => {
    const units = unitsMap[claim._id] || claim.lineItems || [];
    const csv = exportToCSV(claim, units);
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `claim_${claim.claimNumber || claim._id}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    if (onExportCSV) {
      onExportCSV(claim, csv);
    }
  }, [unitsMap, onExportCSV]);

  // Summary stats
  const stats = useMemo(() => {
    return {
      total: claims.length,
      draft: claims.filter(c => c.status === 'draft').length,
      approved: claims.filter(c => c.status === 'approved').length,
      exported: claims.filter(c => c.status === 'exported').length,
      totalValue: claims.reduce((sum, c) => sum + (c.totalAmount || c.subtotal || 0), 0),
      totalPaid: claims.reduce((sum, c) => sum + (c.amountPaid || 0), 0),
    };
  }, [claims]);

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
        <Typography variant="h6">
          Payment Claims
        </Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setCreateDialogOpen(true)}
          disabled={selectedUnits.length === 0}
        >
          Create Claim ({selectedUnits.length} units)
        </Button>
      </Box>

      {/* Summary Stats */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid size={{ xs: 6, md: 2 }}>
          <Card variant="outlined">
            <CardContent sx={{ textAlign: 'center', py: 1 }}>
              <Typography variant="h5">{stats.total}</Typography>
              <Typography variant="caption">Total Claims</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 6, md: 2 }}>
          <Card variant="outlined">
            <CardContent sx={{ textAlign: 'center', py: 1 }}>
              <Typography variant="h5" color="info.main">{stats.draft}</Typography>
              <Typography variant="caption">Draft</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 6, md: 2 }}>
          <Card variant="outlined">
            <CardContent sx={{ textAlign: 'center', py: 1 }}>
              <Typography variant="h5" color="success.main">{stats.approved}</Typography>
              <Typography variant="caption">Approved</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 6, md: 3 }}>
          <Card variant="outlined">
            <CardContent sx={{ textAlign: 'center', py: 1 }}>
              <Typography variant="h6" color="primary.main">
                {formatCurrency(stats.totalValue)}
              </Typography>
              <Typography variant="caption">Total Value</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, md: 3 }}>
          <Card variant="outlined">
            <CardContent sx={{ textAlign: 'center', py: 1 }}>
              <Typography variant="h6" color="success.main">
                {formatCurrency(stats.totalPaid)}
              </Typography>
              <Typography variant="caption">Total Paid</Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Claims List */}
      {loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress />
        </Box>
      )}
      {!loading && claims.length === 0 && (
        <Alert severity="info">
          No claims yet. Select approved units and click "Create Claim" to get started.
        </Alert>
      )}
      {!loading && claims.length > 0 && (
        claims.map(claim => (
          <ClaimCard
            key={claim._id}
            claim={claim}
            units={unitsMap[claim._id] || claim.lineItems || []}
            expanded={expandedClaims.includes(claim._id)}
            onToggleExpand={handleToggleExpand}
            onView={() => onViewClaim?.(claim)}
            onApprove={() => onUpdateClaim?.(claim._id, { status: 'submitted' })}
            onExportOracle={handleExportOracle}
            onExportFBDI={handleExportFBDI}
            onExportCSV={handleExportCSV}
            onRecordPayment={() => onRecordPayment?.(claim)}
            onDelete={() => onDeleteClaim?.(claim._id)}
          />
        ))
      )}

      {/* Create Claim Dialog */}
      <CreateClaimDialog
        open={createDialogOpen}
        onClose={() => setCreateDialogOpen(false)}
        units={selectedUnits}
        loading={loading}
        onSubmit={(data) => {
          onCreateClaim?.(data);
          setCreateDialogOpen(false);
        }}
      />
    </Box>
  );
};

ClaimsManagement.propTypes = {
  claims: PropTypes.array,
  unitsMap: PropTypes.object,
  loading: PropTypes.bool,
  onCreateClaim: PropTypes.func,
  onUpdateClaim: PropTypes.func,
  onDeleteClaim: PropTypes.func,
  onExportOracle: PropTypes.func,
  onExportFBDI: PropTypes.func,
  onExportCSV: PropTypes.func,
  onRecordPayment: PropTypes.func,
  onViewClaim: PropTypes.func,
  selectedUnits: PropTypes.array,
};

export default ClaimsManagement;

