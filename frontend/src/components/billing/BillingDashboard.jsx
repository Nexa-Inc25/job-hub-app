/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
/**
 * BillingDashboard - Complete Unit-Price Billing Workflow
 * 
 * Integrates all billing components into a unified PM dashboard:
 * - Unit Approval Grid with Master-Detail pattern
 * - Claims Management with Oracle export
 * - Real-time sync status
 * 
 * @module components/billing/BillingDashboard
 */

import React, { useState, useCallback, useEffect } from 'react';
import PropTypes from 'prop-types';
import {
  Box,
  Tabs,
  Tab,
  Typography,
  Button,
  Alert,
  Snackbar,
  AppBar,
  Toolbar,
  Badge,
  Chip,
  CircularProgress,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import UnitsIcon from '@mui/icons-material/Assignment';
import ClaimsIcon from '@mui/icons-material/Receipt';
import RefreshIcon from '@mui/icons-material/Refresh';
import SuccessIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import AnalyticsIcon from '@mui/icons-material/TrendingUp';
import PriceBookIcon from '@mui/icons-material/MenuBook';
import { useNavigate } from 'react-router-dom';
import UnitApprovalGrid from './UnitApprovalGrid';
import ClaimsManagement from './ClaimsManagement';
import DisputeDialog from './DisputeDialog';
import BillingAnalytics from './BillingAnalytics';
import { SyncBadgeMinimal, SyncStatusPanel } from '../SyncBadge';
import oracleExportService from '../../services/OracleExportService';
import api from '../../api';

/**
 * Tab Panel Component
 */
function TabPanel({ children, value, index, ...props }) {
  return (
    <Box
      role="tabpanel"
      hidden={value !== index}
      id={`billing-tabpanel-${index}`}
      aria-labelledby={`billing-tab-${index}`}
      sx={{ height: '100%', overflow: 'hidden' }}
      {...props}
    >
      {value === index && children}
    </Box>
  );
}

TabPanel.propTypes = {
  children: PropTypes.node,
  value: PropTypes.number.isRequired,
  index: PropTypes.number.isRequired,
};

/**
 * BillingDashboard Component
 */
const BillingDashboard = ({ jobId }) => {
  const navigate = useNavigate();
  
  // Tab state
  const [activeTab, setActiveTab] = useState(0);
  
  // Data state
  const [units, setUnits] = useState([]);
  const [claims, setClaims] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // Selection state
  const [selectedUnits, setSelectedUnits] = useState({ type: 'include', ids: new Set() });
  const [statusFilter, setStatusFilter] = useState('all');
  
  // UI state
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });
  const [syncPanelOpen, setSyncPanelOpen] = useState(false);
  const [exportProgress, setExportProgress] = useState(null);
  
  // Dispute dialog state
  const [disputeDialogOpen, setDisputeDialogOpen] = useState(false);
  const [disputeUnit, setDisputeUnit] = useState(null);
  
  // Delete dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [unitToDelete, setUnitToDelete] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Fetch units
  const fetchUnits = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      const params = jobId ? { jobId } : {};
      const response = await api.get('/api/billing/units', { params });
      setUnits(response.data.units || response.data || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load units');
      console.error('Failed to fetch units:', err);
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  // Fetch claims
  const fetchClaims = useCallback(async () => {
    try {
      const params = jobId ? { jobId } : {};
      const response = await api.get('/api/billing/claims', { params });
      setClaims(response.data.claims || response.data || []);
    } catch (err) {
      console.error('Failed to fetch claims:', err);
    }
  }, [jobId]);

  // Initial load
  useEffect(() => {
    fetchUnits();
    fetchClaims();
  }, [fetchUnits, fetchClaims]);

  // Oracle export event listener
  useEffect(() => {
    const unsubscribe = oracleExportService.subscribe((event, data) => {
      switch (event) {
        case 'export_start':
          setExportProgress({ status: 'exporting', claimId: data.claimId });
          break;
        case 'export_complete':
          setExportProgress(null);
          showSnackbar(`Claim exported successfully`, 'success');
          break;
        case 'export_failed':
          setExportProgress(null);
          showSnackbar(`Export failed: ${data.error}`, 'error');
          break;
      }
    });
    
    return unsubscribe;
  }, []);

  // Show snackbar helper
  const showSnackbar = (message, severity = 'success') => {
    setSnackbar({ open: true, message, severity });
  };

  // Unit actions
  const handleSubmitUnit = useCallback(async (unit) => {
    try {
      await api.post(`/api/billing/units/${unit._id}/submit`);
      showSnackbar('Unit submitted for review');
      fetchUnits();
    } catch (err) {
      showSnackbar(err.response?.data?.message || 'Failed to submit unit', 'error');
    }
  }, [fetchUnits]);

  const handleVerifyUnit = useCallback(async (unit) => {
    try {
      await api.post(`/api/billing/units/${unit._id}/verify`);
      showSnackbar('Unit verified successfully');
      fetchUnits();
    } catch (err) {
      showSnackbar(err.response?.data?.message || 'Failed to verify unit', 'error');
    }
  }, [fetchUnits]);

  const handleApproveUnit = useCallback(async (unit) => {
    try {
      await api.post(`/api/billing/units/${unit._id}/approve`);
      showSnackbar('Unit approved successfully');
      fetchUnits();
    } catch (err) {
      showSnackbar(err.response?.data?.message || 'Failed to approve unit', 'error');
    }
  }, [fetchUnits]);

  // Open dispute dialog
  const handleDisputeUnit = useCallback((unit) => {
    setDisputeUnit(unit);
    setDisputeDialogOpen(true);
  }, []);

  // Delete unit (draft only) - open dialog
  const handleDeleteUnit = useCallback((unit) => {
    setUnitToDelete(unit);
    setDeleteDialogOpen(true);
  }, []);

  // Confirm delete unit
  const handleDeleteConfirm = useCallback(async () => {
    if (!unitToDelete) return;
    
    setDeleteLoading(true);
    try {
      await api.delete(`/api/billing/units/${unitToDelete._id}`);
      showSnackbar('Unit deleted successfully');
      setDeleteDialogOpen(false);
      setUnitToDelete(null);
      fetchUnits();
    } catch (err) {
      showSnackbar(err.response?.data?.error || 'Failed to delete unit', 'error');
    } finally {
      setDeleteLoading(false);
    }
  }, [unitToDelete, fetchUnits]);

  // Cancel delete
  const handleDeleteCancel = useCallback(() => {
    setDeleteDialogOpen(false);
    setUnitToDelete(null);
  }, []);
  
  // Handle dispute success (both create and resolve)
  const handleDisputeSuccess = useCallback(() => {
    showSnackbar(disputeUnit?.isDisputed ? 'Dispute resolved' : 'Dispute submitted');
    fetchUnits();
  }, [disputeUnit, fetchUnits]);

  // Add units to claim
  const handleAddToClaim = useCallback((unitsToAdd) => {
    // Filter only approved units
    const approvedUnits = unitsToAdd.filter(u => u.status === 'approved');
    
    if (approvedUnits.length === 0) {
      showSnackbar('Only approved units can be added to a claim', 'warning');
      return;
    }

    // Store selected units and switch to claims tab
    setSelectedUnits(approvedUnits.map(u => u._id));
    setActiveTab(1); // Switch to claims tab
  }, []);

  // Create claim
  const handleCreateClaim = useCallback(async (claimData) => {
    try {
      const response = await api.post('/api/billing/claims', claimData);
      showSnackbar(`Claim ${response.data.claimNumber} created successfully`);
      setSelectedUnits([]);
      fetchUnits();
      fetchClaims();
    } catch (err) {
      showSnackbar(err.response?.data?.message || 'Failed to create claim', 'error');
    }
  }, [fetchUnits, fetchClaims]);

  // Update claim
  const handleUpdateClaim = useCallback(async (claimId, updates) => {
    try {
      await api.put(`/api/billing/claims/${claimId}`, updates);
      showSnackbar('Claim updated successfully');
      fetchClaims();
    } catch (err) {
      showSnackbar(err.response?.data?.message || 'Failed to update claim', 'error');
    }
  }, [fetchClaims]);

  // Delete claim
  const handleDeleteClaim = useCallback(async (claimId) => {
    if (!confirm('Are you sure you want to delete this claim?')) return;
    
    try {
      await api.delete(`/api/billing/claims/${claimId}`);
      showSnackbar('Claim deleted');
      fetchClaims();
    } catch (err) {
      showSnackbar(err.response?.data?.message || 'Failed to delete claim', 'error');
    }
  }, [fetchClaims]);

  // Export to Oracle
  const handleExportOracle = useCallback(async (claim) => {
    try {
      // Get units for this claim
      const claimUnits = units.filter(u => 
        claim.lineItems?.some(li => li.unitEntryId === u._id)
      );
      
      const result = await oracleExportService.exportClaim(claim, claimUnits, {
        dryRun: false,
      });
      
      if (result.success) {
        // Update claim status
        await handleUpdateClaim(claim._id, { status: 'exported' });
      }
    } catch (err) {
      console.error('Oracle export failed:', err);
      showSnackbar(err.message || 'Oracle export failed', 'error');
    }
  }, [units, handleUpdateClaim]);

  // Record payment
  const handleRecordPayment = useCallback(async (claim) => {
    const amountStr = prompt(`Enter payment amount (Due: $${(claim.amountDue || claim.totalAmount).toFixed(2)}):`);
    if (!amountStr) return;
    
    const amount = Number.parseFloat(amountStr);
    if (Number.isNaN(amount) || amount <= 0) {
      showSnackbar('Invalid payment amount', 'error');
      return;
    }
    
    try {
      await api.post(`/api/billing/claims/${claim._id}/payment`, {
        amount,
        paymentDate: new Date().toISOString(),
        paymentMethod: 'check',
        reference: `PAY-${Date.now()}`,
      });
      showSnackbar('Payment recorded');
      fetchClaims();
    } catch (err) {
      showSnackbar(err.response?.data?.message || 'Failed to record payment', 'error');
    }
  }, [fetchClaims]);

  // Get selected units for claim creation
  const selectedUnitsForClaim = units.filter(u => 
    selectedUnits.ids.has(u._id) && u.status === 'approved'
  );

  // Stats - simplified workflow (submitted -> approved)
  const stats = {
    draft: units.filter(u => u.status === 'draft').length,
    pending: units.filter(u => u.status === 'submitted').length,
    approved: units.filter(u => u.status === 'approved').length,
    totalValue: units.reduce((sum, u) => sum + (u.totalAmount || 0), 0),
    claimsTotal: claims.reduce((sum, c) => sum + (c.totalAmount || 0), 0),
  };

  return (
    <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <AppBar position="static" color="default" elevation={1}>
        <Toolbar>
          <Typography variant="h6" sx={{ flexGrow: 0, mr: 3 }}>
            Unit-Price Billing
          </Typography>
          
          {/* Stats chips */}
          <Chip 
            label={`${stats.pending} Pending`} 
            size="small" 
            color="warning" 
            sx={{ mr: 1 }}
          />
          <Chip 
            label={`${stats.approved} Approved`} 
            size="small" 
            color="success" 
            sx={{ mr: 1 }}
          />
          <Chip 
            label={`$${stats.totalValue.toLocaleString()}`} 
            size="small" 
            color="primary" 
            variant="outlined"
          />
          
          <Box sx={{ flexGrow: 1 }} />
          
          {/* Actions */}
          <Button
            variant="outlined"
            size="small"
            startIcon={loading ? <CircularProgress size={16} /> : <RefreshIcon />}
            onClick={() => { fetchUnits(); fetchClaims(); }}
            disabled={loading}
            sx={{ mr: 2 }}
          >
            Refresh
          </Button>
          
          {/* Price Book Admin */}
          <Tooltip title="Manage Rate Sheets">
            <Button
              color="inherit"
              startIcon={<PriceBookIcon />}
              onClick={() => navigate('/billing/pricebooks')}
              sx={{ mr: 2, textTransform: 'none' }}
            >
              Price Books
            </Button>
          </Tooltip>
          
          {/* Sync Status */}
          <SyncBadgeMinimal onClick={() => setSyncPanelOpen(true)} />
        </Toolbar>
      </AppBar>

      {/* Error Banner */}
      {error && (
        <Alert severity="error" onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Export Progress */}
      {exportProgress && (
        <Alert severity="info" icon={<CircularProgress size={20} />}>
          Exporting claim to Oracle...
        </Alert>
      )}

      {/* Tabs */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tabs value={activeTab} onChange={(e, v) => setActiveTab(v)}>
          <Tab 
            icon={<Badge badgeContent={stats.pending} color="warning"><UnitsIcon /></Badge>}
            label="Unit Review" 
            iconPosition="start"
          />
          <Tab 
            icon={<Badge badgeContent={claims.length} color="primary"><ClaimsIcon /></Badge>}
            label="Claims" 
            iconPosition="start"
          />
          <Tab 
            icon={<AnalyticsIcon />}
            label="Analytics" 
            iconPosition="start"
          />
        </Tabs>
      </Box>

      {/* Tab Panels */}
      <Box sx={{ flex: 1, overflow: 'hidden' }}>
        <TabPanel value={activeTab} index={0}>
          <UnitApprovalGrid
            units={units}
            loading={loading}
            selectionModel={selectedUnits}
            onSelectionChange={setSelectedUnits}
            statusFilter={statusFilter}
            onStatusFilterChange={setStatusFilter}
            onSubmit={handleSubmitUnit}
            onVerify={handleVerifyUnit}
            onApprove={handleApproveUnit}
            onDispute={handleDisputeUnit}
            onDelete={handleDeleteUnit}
            onAddToClaim={handleAddToClaim}
            onRefresh={fetchUnits}
            onExport={() => {
              // Export selected to CSV
              const selectedData = units.filter(u => selectedUnits.ids.has(u._id));
              console.warn('Export selected:', selectedData);
            }}
          />
        </TabPanel>

        <TabPanel value={activeTab} index={1}>
          <Box sx={{ p: 2, height: '100%', overflow: 'auto' }}>
            <ClaimsManagement
              claims={claims}
              loading={loading}
              selectedUnits={selectedUnitsForClaim}
              onCreateClaim={handleCreateClaim}
              onUpdateClaim={handleUpdateClaim}
              onDeleteClaim={handleDeleteClaim}
              onExportOracle={handleExportOracle}
              onRecordPayment={handleRecordPayment}
              onViewClaim={(claim) => console.warn('View claim:', claim)}
            />
          </Box>
        </TabPanel>

        <TabPanel value={activeTab} index={2}>
          <Box sx={{ p: 2, height: '100%', overflow: 'auto' }}>
            <BillingAnalytics units={units} claims={claims} />
          </Box>
        </TabPanel>
      </Box>

      {/* Sync Status Panel */}
      <SyncStatusPanel 
        open={syncPanelOpen} 
        onClose={() => setSyncPanelOpen(false)} 
      />

      {/* Dispute Dialog */}
      <DisputeDialog
        open={disputeDialogOpen}
        onClose={() => {
          setDisputeDialogOpen(false);
          setDisputeUnit(null);
        }}
        unit={disputeUnit}
        onSuccess={handleDisputeSuccess}
      />

      {/* Delete Unit Confirmation Dialog */}
      <Dialog
        open={deleteDialogOpen}
        onClose={handleDeleteCancel}
      >
        <DialogTitle>
          Delete Unit Entry?
        </DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to delete this unit entry?
            {unitToDelete && (
              <>
                <br /><br />
                <strong>Item:</strong> {unitToDelete.priceBookItemCode || unitToDelete.itemCode}<br />
                <strong>Description:</strong> {unitToDelete.itemDescription || unitToDelete.description}<br />
                <strong>Quantity:</strong> {unitToDelete.quantity}<br />
                {unitToDelete.totalAmount > 0 && (
                  <>
                    <strong>Value:</strong> ${unitToDelete.totalAmount?.toFixed(2)}
                  </>
                )}
              </>
            )}
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button 
            onClick={handleDeleteCancel}
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
            {deleteLoading ? 'Deleting...' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert 
          onClose={() => setSnackbar({ ...snackbar, open: false })}
          severity={snackbar.severity}
          variant="filled"
          icon={snackbar.severity === 'success' ? <SuccessIcon /> : <ErrorIcon />}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

BillingDashboard.propTypes = {
  jobId: PropTypes.string,
};

export default BillingDashboard;

