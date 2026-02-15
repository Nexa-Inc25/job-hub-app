/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
/**
 * PriceBookImport - CSV Import Dialog for Price Book Rate Items
 *
 * Extracted from PriceBookAdmin.jsx for modularity.
 * Handles file selection, upload, and result display.
 *
 * @module components/billing/PriceBookImport
 */

import React, { useState } from 'react';
import PropTypes from 'prop-types';
import {
  Box,
  Typography,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
  AlertTitle,
  CircularProgress,
} from '@mui/material';
import UploadIcon from '@mui/icons-material/Upload';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import CheckIcon from '@mui/icons-material/Check';
import api from '../../api';

const PriceBookImport = ({ open, onClose, priceBookId, onSuccess }) => {
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
              onClick={() => document.getElementById('csv-upload-import').click()}
            >
              <input
                id="csv-upload-import"
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

PriceBookImport.propTypes = {
  open: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  priceBookId: PropTypes.string.isRequired,
  onSuccess: PropTypes.func.isRequired,
};

export default PriceBookImport;
