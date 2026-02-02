/**
 * UnitApprovalGrid Component - Master-Detail DataGrid
 * 
 * Displays unit entries for PM review with:
 * - Expandable detail panels showing ProofPanel
 * - Batch selection for claim creation
 * - Auto-flagging of GPS errors and missing photos
 * - Status workflow actions
 * 
 * @module components/billing/UnitApprovalGrid
 */

import React, { useState, useCallback, useMemo } from 'react';
import PropTypes from 'prop-types';
import {
  Box,
  Paper,
  Typography,
  Button,
  Chip,
  Tooltip,
  IconButton,
  Alert,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Divider,
  TextField,
  InputAdornment,
  ToggleButton,
  ToggleButtonGroup,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
} from '@mui/material';
import {
  DataGrid,
  GridToolbar,
  GridActionsCellItem,
} from '@mui/x-data-grid';
import ApproveIcon from '@mui/icons-material/CheckCircle';
import RejectIcon from '@mui/icons-material/Cancel';
import WarningIcon from '@mui/icons-material/Warning';
import ErrorIcon from '@mui/icons-material/Error';
import VerifiedIcon from '@mui/icons-material/VerifiedUser';
import LocationIcon from '@mui/icons-material/LocationOn';
import PhotoIcon from '@mui/icons-material/PhotoCamera';
import ExpandIcon from '@mui/icons-material/ExpandMore';
import CollapseIcon from '@mui/icons-material/ExpandLess';
import AddToClaimIcon from '@mui/icons-material/AddShoppingCart';
import SearchIcon from '@mui/icons-material/Search';
import FilterIcon from '@mui/icons-material/FilterList';
import RefreshIcon from '@mui/icons-material/Refresh';
import ExportIcon from '@mui/icons-material/Download';
import MoreIcon from '@mui/icons-material/MoreVert';
import CloseIcon from '@mui/icons-material/Close';
import SendIcon from '@mui/icons-material/Send';
import ProofPanel from './ProofPanel';

// Status configurations
const STATUS_CONFIG = {
  draft: { label: 'Draft', color: 'default', icon: null },
  submitted: { label: 'Submitted', color: 'info', icon: null },
  verified: { label: 'Verified', color: 'primary', icon: VerifiedIcon },
  approved: { label: 'Approved', color: 'success', icon: ApproveIcon },
  disputed: { label: 'Disputed', color: 'error', icon: RejectIcon },
  invoiced: { label: 'Invoiced', color: 'secondary', icon: null },
  paid: { label: 'Paid', color: 'success', icon: CheckCircleIcon },
};

// Tier colors
const TIER_COLORS = {
  prime: 'default',
  sub: 'info',
  sub_of_sub: 'secondary',
};

// Import missing icon
import CheckCircleIcon from '@mui/icons-material/CheckCircle';

/**
 * Check if unit has validation warnings
 */
function getUnitWarnings(unit) {
  const warnings = [];

  // GPS accuracy check
  if (!unit.location?.latitude || !unit.location?.longitude) {
    warnings.push({ type: 'gps', severity: 'error', message: 'Missing GPS' });
  } else if (unit.location.accuracy > 50) {
    warnings.push({ 
      type: 'gps', 
      severity: 'warning', 
      message: `GPS ${unit.location.accuracy.toFixed(0)}m` 
    });
  }

  // Photo check
  if ((!unit.photos || unit.photos.length === 0) && !unit.photoWaived) {
    warnings.push({ type: 'photo', severity: 'error', message: 'No photo' });
  }

  // Checksum check
  if (!unit.checksum) {
    warnings.push({ type: 'hash', severity: 'warning', message: 'No hash' });
  }

  return warnings;
}

/**
 * UnitApprovalGrid Component
 */
const UnitApprovalGrid = ({
  units = [],
  loading = false,
  onSubmit,
  onVerify,
  onApprove,
  onDispute,
  onAddToClaim,
  onRefresh,
  onExport,
  selectionModel = [],
  onSelectionChange,
  statusFilter = 'all',
  onStatusFilterChange,
}) => {
  const [expandedRows, setExpandedRows] = useState([]);
  const [searchText, setSearchText] = useState('');
  const [menuAnchor, setMenuAnchor] = useState(null);
  const [selectedUnit, setSelectedUnit] = useState(null);

  // Toggle row expansion (single row for Dialog)
  const handleToggleExpand = useCallback((id) => {
    setExpandedRows(prev => 
      prev.includes(id) 
        ? []  // Close if already open
        : [id]  // Replace with single row (Dialog can only show one)
    );
  }, []);

  // Filter units based on search and status
  const filteredUnits = useMemo(() => {
    let result = [...units];

    // Status filter
    if (statusFilter !== 'all') {
      result = result.filter(u => u.status === statusFilter);
    }

    // Text search
    if (searchText) {
      const search = searchText.toLowerCase();
      result = result.filter(u => 
        u.itemCode?.toLowerCase().includes(search) ||
        u.itemDescription?.toLowerCase().includes(search) ||
        u.priceBookItemCode?.toLowerCase().includes(search) ||
        u.performedBy?.subContractorName?.toLowerCase().includes(search)
      );
    }

    return result;
  }, [units, statusFilter, searchText]);

  // Count by status for filter badges
  const statusCounts = useMemo(() => {
    const counts = { all: units.length };
    units.forEach(u => {
      counts[u.status] = (counts[u.status] || 0) + 1;
    });
    return counts;
  }, [units]);

  // Define columns
  const columns = useMemo(() => [
    // Expand toggle
    {
      field: 'expand',
      headerName: '',
      width: 50,
      sortable: false,
      filterable: false,
      disableColumnMenu: true,
      renderCell: (params) => {
        if (!params?.row) return null;
        return (
          <IconButton 
            size="small" 
            onClick={() => handleToggleExpand(params.row._id)}
            aria-label={expandedRows.includes(params.row._id) ? 'Collapse' : 'Expand'}
          >
            {expandedRows.includes(params.row._id) ? <CollapseIcon /> : <ExpandIcon />}
          </IconButton>
        );
      },
    },
    // Status with warnings
    {
      field: 'status',
      headerName: 'Status',
      width: 140,
      renderCell: (params) => {
        if (!params?.row) return null;
        const config = STATUS_CONFIG[params.value] || STATUS_CONFIG.draft;
        const warnings = getUnitWarnings(params.row);
        const hasError = warnings.some(w => w.severity === 'error');
        const hasWarning = warnings.some(w => w.severity === 'warning');

        return (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Chip
              label={config.label}
              color={config.color}
              size="small"
            />
            {hasError && (
              <Tooltip title={warnings.filter(w => w.severity === 'error').map(w => w.message).join(', ')}>
                <ErrorIcon fontSize="small" color="error" />
              </Tooltip>
            )}
            {!hasError && hasWarning && (
              <Tooltip title={warnings.filter(w => w.severity === 'warning').map(w => w.message).join(', ')}>
                <WarningIcon fontSize="small" color="warning" />
              </Tooltip>
            )}
          </Box>
        );
      },
    },
    // Item Code
    {
      field: 'itemCode',
      headerName: 'Item Code',
      width: 120,
      valueGetter: (params) => params?.row?.priceBookItemCode || params?.row?.itemCode || '-',
    },
    // Description
    {
      field: 'description',
      headerName: 'Description',
      flex: 1,
      minWidth: 200,
      valueGetter: (params) => params?.row?.itemDescription || params?.row?.description || '-',
    },
    // Quantity
    {
      field: 'quantity',
      headerName: 'Qty',
      width: 80,
      type: 'number',
    },
    // Unit Price
    {
      field: 'unitPrice',
      headerName: 'Unit Price',
      width: 100,
      type: 'number',
      valueFormatter: (params) => params?.value ? `$${params.value.toFixed(2)}` : '-',
    },
    // Total
    {
      field: 'totalAmount',
      headerName: 'Total',
      width: 110,
      type: 'number',
      valueGetter: (params) => params?.row?.totalAmount || ((params?.row?.quantity || 0) * (params?.row?.unitPrice || 0)),
      valueFormatter: (params) => params?.value ? `$${params.value.toFixed(2)}` : '-',
    },
    // Tier
    {
      field: 'tier',
      headerName: 'Tier',
      width: 100,
      valueGetter: (params) => params?.row?.performedBy?.tier || 'prime',
      renderCell: (params) => {
        if (!params?.row) return null;
        return (
          <Chip
            label={params.value?.replace('_', ' ') || 'prime'}
            color={TIER_COLORS[params.value] || 'default'}
            size="small"
            variant="outlined"
          />
        );
      },
    },
    // Work Date
    {
      field: 'workDate',
      headerName: 'Work Date',
      width: 110,
      type: 'date',
      valueGetter: (params) => params?.row?.workDate ? new Date(params.row.workDate) : null,
      valueFormatter: (params) => params?.value ? params.value.toLocaleDateString() : '-',
    },
    // Evidence indicators
    {
      field: 'evidence',
      headerName: 'Evidence',
      width: 100,
      sortable: false,
      renderCell: (params) => {
        if (!params?.row) return null;
        const hasPhoto = params.row?.photos?.length > 0 || params.row?.photoWaived;
        const hasGPS = params.row?.location?.latitude && params.row?.location?.accuracy <= 50;
        
        return (
          <Box sx={{ display: 'flex', gap: 0.5 }}>
            <Tooltip title={hasPhoto ? 'Photo verified' : 'Missing photo'}>
              <PhotoIcon 
                fontSize="small" 
                color={hasPhoto ? 'success' : 'error'} 
              />
            </Tooltip>
            <Tooltip title={hasGPS ? `GPS: ${params.row?.location?.accuracy?.toFixed(0)}m` : 'GPS issue'}>
              <LocationIcon 
                fontSize="small" 
                color={hasGPS ? 'success' : 'error'} 
              />
            </Tooltip>
          </Box>
        );
      },
    },
    // Actions
    {
      field: 'actions',
      type: 'actions',
      headerName: 'Actions',
      width: 120,
      getActions: (params) => {
        if (!params?.row) return [];
        const actions = [];
        const status = params.row?.status;

        // Draft units can be submitted for review
        if (status === 'draft' && onSubmit) {
          actions.push(
            <GridActionsCellItem
              key="submit"
              icon={<SendIcon />}
              label="Submit for Review"
              onClick={() => onSubmit(params.row)}
              color="primary"
            />
          );
        }

        if (status === 'submitted' && onVerify) {
          actions.push(
            <GridActionsCellItem
              key="verify"
              icon={<VerifiedIcon />}
              label="Verify"
              onClick={() => onVerify(params.row)}
              color="primary"
            />
          );
        }

        if (status === 'verified' && onApprove) {
          actions.push(
            <GridActionsCellItem
              key="approve"
              icon={<ApproveIcon />}
              label="Approve"
              onClick={() => onApprove(params.row)}
              color="success"
            />
          );
        }

        if ((status === 'submitted' || status === 'verified') && onDispute) {
          actions.push(
            <GridActionsCellItem
              key="dispute"
              icon={<RejectIcon />}
              label="Dispute"
              onClick={() => onDispute(params.row)}
              color="error"
            />
          );
        }

        actions.push(
          <GridActionsCellItem
            key="more"
            icon={<MoreIcon />}
            label="More"
            onClick={(e) => {
              setMenuAnchor(e.currentTarget);
              setSelectedUnit(params.row);
            }}
          />
        );

        return actions;
      },
    },
  ], [expandedRows, handleToggleExpand, onSubmit, onVerify, onApprove, onDispute]);

  // Get selected unit for detail panel
  const expandedUnit = useMemo(() => {
    if (expandedRows.length === 0) return null;
    return filteredUnits.find(u => u._id === expandedRows[0]) || null;
  }, [expandedRows, filteredUnits]);

  // Handle bulk actions
  const handleBulkApprove = useCallback(() => {
    if (onApprove && selectionModel.length > 0) {
      const selectedUnits = units.filter(u => selectionModel.includes(u._id));
      selectedUnits.forEach(unit => {
        if (unit.status === 'verified') {
          onApprove(unit);
        }
      });
    }
  }, [onApprove, selectionModel, units]);

  const handleAddSelectedToClaim = useCallback(() => {
    if (onAddToClaim && selectionModel.length > 0) {
      const selectedUnits = units.filter(u => 
        selectionModel.includes(u._id) && u.status === 'approved'
      );
      if (selectedUnits.length > 0) {
        onAddToClaim(selectedUnits);
      }
    }
  }, [onAddToClaim, selectionModel, units]);

  // Count approved units in selection
  const approvedInSelection = useMemo(() => {
    return units.filter(u => 
      selectionModel.includes(u._id) && u.status === 'approved'
    ).length;
  }, [units, selectionModel]);

  return (
    <Paper sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Toolbar */}
      <Box sx={{ p: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
          {/* Search */}
          <TextField
            size="small"
            placeholder="Search units..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              ),
            }}
            sx={{ width: 250 }}
          />

          {/* Status Filter */}
          <ToggleButtonGroup
            value={statusFilter}
            exclusive
            onChange={(e, val) => val && onStatusFilterChange?.(val)}
            size="small"
          >
            <ToggleButton value="all">
              All ({statusCounts.all || 0})
            </ToggleButton>
            <ToggleButton value="submitted">
              Submitted ({statusCounts.submitted || 0})
            </ToggleButton>
            <ToggleButton value="verified">
              Verified ({statusCounts.verified || 0})
            </ToggleButton>
            <ToggleButton value="approved">
              Approved ({statusCounts.approved || 0})
            </ToggleButton>
          </ToggleButtonGroup>

          <Box sx={{ flex: 1 }} />

          {/* Bulk Actions */}
          {selectionModel.length > 0 && (
            <>
              <Typography variant="body2" color="text.secondary">
                {selectionModel.length} selected
              </Typography>
              
              <Button
                variant="outlined"
                size="small"
                startIcon={<ApproveIcon />}
                onClick={handleBulkApprove}
                disabled={!selectionModel.some(id => 
                  units.find(u => u._id === id)?.status === 'verified'
                )}
              >
                Approve Selected
              </Button>

              <Button
                variant="contained"
                size="small"
                startIcon={<AddToClaimIcon />}
                onClick={handleAddSelectedToClaim}
                disabled={approvedInSelection === 0}
              >
                Add to Claim ({approvedInSelection})
              </Button>
            </>
          )}

          {/* Actions */}
          <Tooltip title="Refresh">
            <IconButton onClick={onRefresh} disabled={loading}>
              {loading ? <CircularProgress size={20} /> : <RefreshIcon />}
            </IconButton>
          </Tooltip>

          <Tooltip title="Export">
            <IconButton onClick={onExport}>
              <ExportIcon />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      {/* Warning Banner for flagged items */}
      {units.some(u => getUnitWarnings(u).length > 0) && (
        <Alert severity="warning" sx={{ mx: 2, mt: 1 }}>
          Some units have validation warnings. Expand rows to review evidence before approval.
        </Alert>
      )}

      {/* DataGrid */}
      <Box sx={{ flex: 1, p: 2 }}>
        <DataGrid
          rows={filteredUnits}
          columns={columns}
          getRowId={(row) => row._id}
          loading={loading}
          checkboxSelection
          disableRowSelectionOnClick
          rowSelectionModel={selectionModel}
          onRowSelectionModelChange={onSelectionChange}
          pageSizeOptions={[25, 50, 100]}
          initialState={{
            pagination: { paginationModel: { pageSize: 25 } },
            sorting: { sortModel: [{ field: 'workDate', sort: 'desc' }] },
          }}
          slots={{
            toolbar: GridToolbar,
          }}
          slotProps={{
            toolbar: {
              showQuickFilter: false,
              printOptions: { disableToolbarButton: true },
            },
          }}
          onRowDoubleClick={(params) => params?.row && handleToggleExpand(params.row._id)}
          sx={{
            '& .MuiDataGrid-row': {
              cursor: 'pointer',
            },
          }}
        />
      </Box>

      {/* Context Menu */}
      <Menu
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={() => setMenuAnchor(null)}
      >
        <MenuItem 
          onClick={() => {
            handleToggleExpand(selectedUnit?._id);
            setMenuAnchor(null);
          }}
        >
          <ListItemIcon>
            {expandedRows.includes(selectedUnit?._id) ? <CollapseIcon /> : <ExpandIcon />}
          </ListItemIcon>
          <ListItemText>
            {expandedRows.includes(selectedUnit?._id) ? 'Collapse' : 'View Evidence'}
          </ListItemText>
        </MenuItem>
        <Divider />
        {selectedUnit?.status === 'approved' && (
          <MenuItem 
            onClick={() => {
              onAddToClaim?.([selectedUnit]);
              setMenuAnchor(null);
            }}
          >
            <ListItemIcon><AddToClaimIcon /></ListItemIcon>
            <ListItemText>Add to Claim</ListItemText>
          </MenuItem>
        )}
      </Menu>

      {/* Evidence Detail Dialog */}
      <Dialog
        open={expandedRows.length > 0 && expandedUnit !== null}
        onClose={() => setExpandedRows([])}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle component="div" sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: '1.25rem', fontWeight: 500 }}>
            Evidence Review - {expandedUnit?.priceBookItemCode || expandedUnit?.itemCode || 'Unit'}
          </span>
          <IconButton onClick={() => setExpandedRows([])} size="small" aria-label="Close dialog">
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          {expandedUnit && <ProofPanel unit={expandedUnit} />}
        </DialogContent>
      </Dialog>
    </Paper>
  );
};

UnitApprovalGrid.propTypes = {
  units: PropTypes.arrayOf(PropTypes.object),
  loading: PropTypes.bool,
  onSubmit: PropTypes.func,
  onVerify: PropTypes.func,
  onApprove: PropTypes.func,
  onDispute: PropTypes.func,
  onAddToClaim: PropTypes.func,
  onRefresh: PropTypes.func,
  onExport: PropTypes.func,
  selectionModel: PropTypes.array,
  onSelectionChange: PropTypes.func,
  statusFilter: PropTypes.string,
  onStatusFilterChange: PropTypes.func,
};

export default UnitApprovalGrid;
