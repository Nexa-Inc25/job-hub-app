/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
/**
 * PriceBookItemEditor - Rate Item Table with Search/Filter
 *
 * Extracted from PriceBookAdmin.jsx (PriceBookDetail).
 * Displays rate items in a paginated, filterable table with
 * category chips and CSV export.
 *
 * @module components/billing/PriceBookItemEditor
 */

import React, { useState, useMemo } from 'react';
import PropTypes from 'prop-types';
import {
  Box,
  Paper,
  Typography,
  Button,
  TextField,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  Chip,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  InputAdornment,
} from '@mui/material';
import UploadIcon from '@mui/icons-material/Upload';
import DownloadIcon from '@mui/icons-material/Download';
import ActivateIcon from '@mui/icons-material/CheckCircle';
import SearchIcon from '@mui/icons-material/Search';
import CloseIcon from '@mui/icons-material/Close';

// Category colors and labels (shared constants)
export const CATEGORY_COLORS = {
  civil: '#ff9800',
  electrical: '#2196f3',
  overhead: '#9c27b0',
  underground: '#795548',
  traffic_control: '#f44336',
  vegetation: '#4caf50',
  emergency: '#e91e63',
  other: '#607d8b',
};

export const CATEGORY_LABELS = {
  civil: 'Civil',
  electrical: 'Electrical',
  overhead: 'Overhead',
  underground: 'Underground',
  traffic_control: 'Traffic Control',
  vegetation: 'Vegetation',
  emergency: 'Emergency',
  other: 'Other',
};

// Status chip helper
export const StatusChip = ({ status }) => {
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

const PriceBookItemEditor = ({ priceBook, onBack, onImport, onActivate }) => {
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
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon />
                  </InputAdornment>
                ),
              },
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
          onPageChange={(_e, newPage) => setPage(newPage)}
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

PriceBookItemEditor.propTypes = {
  priceBook: PropTypes.object.isRequired,
  onBack: PropTypes.func.isRequired,
  onImport: PropTypes.func.isRequired,
  onActivate: PropTypes.func.isRequired,
};

export default PriceBookItemEditor;
