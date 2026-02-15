/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
/**
 * PriceBookVersionHistory - Version Chain Viewer
 *
 * Displays the supersession chain for a price book lineage,
 * highlighting the current version and showing effective dates.
 *
 * @module components/billing/PriceBookVersionHistory
 */

import React, { useState, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';
import {
  Box,
  Paper,
  Typography,
  Button,
  Chip,
  CircularProgress,
  Alert,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material';
import HistoryIcon from '@mui/icons-material/History';
import AddIcon from '@mui/icons-material/Add';
import api from '../../api';
import { StatusChip } from './PriceBookItemEditor';

const PriceBookVersionHistory = ({ priceBookId, priceBookName, onCreateVersion }) => {
  const [versions, setVersions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const fetchVersions = useCallback(async () => {
    if (!priceBookId) return;
    setLoading(true);
    setError(null);
    try {
      const response = await api.get(`/api/pricebooks/${priceBookId}/versions`);
      setVersions(response.data.versions || []);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load version history');
    } finally {
      setLoading(false);
    }
  }, [priceBookId]);

  useEffect(() => {
    if (dialogOpen) {
      fetchVersions();
    }
  }, [dialogOpen, fetchVersions]);

  return (
    <>
      <Button
        variant="outlined"
        size="small"
        startIcon={<HistoryIcon />}
        onClick={() => setDialogOpen(true)}
      >
        Version History
      </Button>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <HistoryIcon />
            Version History: {priceBookName}
          </Box>
        </DialogTitle>
        <DialogContent>
          {loading && (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress />
            </Box>
          )}

          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>
          )}

          {!loading && versions.length === 0 && (
            <Typography color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
              No version history available.
            </Typography>
          )}

          {!loading && versions.length > 0 && (
            <Paper variant="outlined">
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 600 }}>Version</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Name</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Status</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Effective</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Expires</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Items</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {versions.map((v) => {
                      const isCurrent = v._id === priceBookId;
                      return (
                        <TableRow
                          key={v._id}
                          sx={isCurrent ? { bgcolor: 'action.selected' } : undefined}
                        >
                          <TableCell>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              v{v.version || 1}
                              {isCurrent && (
                                <Chip size="small" label="Current" color="primary" variant="outlined" />
                              )}
                            </Box>
                          </TableCell>
                          <TableCell>{v.name}</TableCell>
                          <TableCell>
                            <StatusChip status={v.status} />
                          </TableCell>
                          <TableCell>
                            {v.effectiveDate
                              ? new Date(v.effectiveDate).toLocaleDateString()
                              : '-'}
                          </TableCell>
                          <TableCell>
                            {v.expirationDate
                              ? new Date(v.expirationDate).toLocaleDateString()
                              : 'No expiry'}
                          </TableCell>
                          <TableCell>{v.itemCount || 0}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            </Paper>
          )}
        </DialogContent>
        <DialogActions>
          {onCreateVersion && (
            <Button
              startIcon={<AddIcon />}
              onClick={() => {
                setDialogOpen(false);
                onCreateVersion();
              }}
            >
              Create New Version
            </Button>
          )}
          <Button onClick={() => setDialogOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

PriceBookVersionHistory.propTypes = {
  priceBookId: PropTypes.string.isRequired,
  priceBookName: PropTypes.string.isRequired,
  onCreateVersion: PropTypes.func,
};

export default PriceBookVersionHistory;
