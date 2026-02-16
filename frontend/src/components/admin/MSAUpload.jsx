/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
/**
 * MSA Upload Page - Contractor onboarding rate extraction.
 *
 * Admin uploads MSA PDF → system extracts rates → admin reviews → activates.
 * Rates then auto-fill into LME labor totals and field ticket T&M amounts.
 *
 * @module components/admin/MSAUpload
 */

import React, { useState, useCallback } from 'react';
import {
  Box, Typography, Button, Paper, Alert, AlertTitle, CircularProgress,
  Table, TableHead, TableRow, TableCell, TableBody, TableContainer,
  Chip, Divider, Tabs, Tab,
} from '@mui/material';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import EditIcon from '@mui/icons-material/Edit';
import api from '../../api';

const MSAUpload = () => {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const [extractedRates, setExtractedRates] = useState(null);
  const [ratesId, setRatesId] = useState(null);
  const [activeTab, setActiveTab] = useState(0);
  const [activating, setActivating] = useState(false);
  const [activated, setActivated] = useState(false);

  const handleUpload = useCallback(async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== 'application/pdf') {
      setError('Please upload a PDF file');
      return;
    }

    setUploading(true);
    setError(null);
    setExtractedRates(null);

    try {
      const formData = new FormData();
      formData.append('msa', file);
      formData.append('utilityCode', 'PGE');

      const response = await api.post('/api/onboarding/upload-msa', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 120000,
      });

      setExtractedRates(response.data.rates);
      setRatesId(response.data.ratesId);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to process MSA');
    } finally {
      setUploading(false);
    }
  }, []);

  const handleActivate = useCallback(async () => {
    if (!ratesId) return;
    setActivating(true);
    try {
      await api.put(`/api/onboarding/rates/${ratesId}`, { status: 'active' });
      setActivated(true);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to activate rates');
    } finally {
      setActivating(false);
    }
  }, [ratesId]);

  const formatCurrency = (val) => {
    if (val == null || isNaN(val)) return '—';
    return `$${Number(val).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  return (
    <Box sx={{ maxWidth: 1000, mx: 'auto', p: 3 }}>
      <Typography variant="h5" fontWeight={700} sx={{ mb: 1 }}>
        Contract Rate Setup
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Upload the MSA contract PDF to extract labor rates, equipment rates, and unit pricing.
        These rates auto-fill into LME timesheets and T&M field tickets.
      </Typography>

      {/* Upload section */}
      {!extractedRates && (
        <Paper sx={{ p: 4, textAlign: 'center', border: '2px dashed', borderColor: 'primary.light', borderRadius: 2 }}>
          <UploadFileIcon sx={{ fontSize: 48, color: 'primary.main', mb: 2 }} />
          <Typography variant="h6" sx={{ mb: 1 }}>Upload MSA Contract PDF</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            The system will extract labor classifications, crew rates, equipment rates, and unit pricing.
          </Typography>
          <Button
            variant="contained"
            component="label"
            disabled={uploading}
            startIcon={uploading ? <CircularProgress size={20} /> : <UploadFileIcon />}
            sx={{ px: 4, py: 1.5 }}
          >
            {uploading ? 'Processing MSA...' : 'Choose PDF File'}
            <input type="file" hidden accept=".pdf" onChange={handleUpload} />
          </Button>
          {uploading && (
            <Typography variant="caption" display="block" sx={{ mt: 2, color: 'text.secondary' }}>
              Extracting rates from contract... This may take 30-60 seconds.
            </Typography>
          )}
        </Paper>
      )}

      {error && (
        <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>
      )}

      {/* Extracted rates preview */}
      {extractedRates && (
        <Box>
          {activated ? (
            <Alert severity="success" sx={{ mb: 2 }} icon={<CheckCircleIcon />}>
              <AlertTitle>Rates Activated</AlertTitle>
              Contract rates are now active. LME and field ticket calculations will use these rates automatically.
            </Alert>
          ) : (
            <Alert severity="info" sx={{ mb: 2 }}>
              <AlertTitle>Review Extracted Rates</AlertTitle>
              {extractedRates.contractNumber && `Contract: ${extractedRates.contractNumber} | `}
              {extractedRates.laborRates?.length || 0} labor classifications,{' '}
              {extractedRates.crewRates?.length || 0} crew configs,{' '}
              {extractedRates.equipmentRates?.length || 0} equipment types,{' '}
              {extractedRates.unitRates?.length || 0} unit rates extracted.
            </Alert>
          )}

          {/* Tabs */}
          <Tabs value={activeTab} onChange={(_, v) => setActiveTab(v)} sx={{ mb: 2 }}>
            <Tab label={`Labor (${extractedRates.laborRates?.length || 0})`} />
            <Tab label={`Crews (${extractedRates.crewRates?.length || 0})`} />
            <Tab label={`Equipment (${extractedRates.equipmentRates?.length || 0})`} />
            <Tab label={`Units (${extractedRates.unitRates?.length || 0})`} />
          </Tabs>

          {/* Labor Rates */}
          {activeTab === 0 && (
            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 700 }}>Classification</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>Base Wage</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>Burdened Rate</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {(extractedRates.laborRates || []).map((r, i) => (
                    <TableRow key={i}>
                      <TableCell>{r.classification}</TableCell>
                      <TableCell align="right">{formatCurrency(r.baseWage)}/hr</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 600 }}>{formatCurrency(r.totalBurdenedRate)}/hr</TableCell>
                    </TableRow>
                  ))}
                  {(!extractedRates.laborRates?.length) && (
                    <TableRow><TableCell colSpan={3} sx={{ textAlign: 'center', color: 'text.secondary' }}>No labor rates extracted</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          )}

          {/* Crew Rates */}
          {activeTab === 1 && (
            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 700 }}>Crew Config</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>ST Rate</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>OT Rate</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>DT Rate</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {(extractedRates.crewRates || []).map((r, i) => (
                    <TableRow key={i}>
                      <TableCell>
                        {r.crewConfig}
                        <Chip label={`${r.crewSize}-man`} size="small" sx={{ ml: 1 }} />
                      </TableCell>
                      <TableCell align="right">{formatCurrency(r.straightTimeRate)}/hr</TableCell>
                      <TableCell align="right">{formatCurrency(r.overtimeRate)}/hr</TableCell>
                      <TableCell align="right">{formatCurrency(r.doubleTimeRate)}/hr</TableCell>
                    </TableRow>
                  ))}
                  {(!extractedRates.crewRates?.length) && (
                    <TableRow><TableCell colSpan={4} sx={{ textAlign: 'center', color: 'text.secondary' }}>No crew rates extracted</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          )}

          {/* Equipment Rates */}
          {activeTab === 2 && (
            <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 400 }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 700 }}>Equipment</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>Hourly</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>Daily</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>Weekly</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {(extractedRates.equipmentRates || []).map((r, i) => (
                    <TableRow key={i}>
                      <TableCell>{r.equipmentType}</TableCell>
                      <TableCell align="right">{formatCurrency(r.hourlyRate)}</TableCell>
                      <TableCell align="right">{formatCurrency(r.dailyRate)}</TableCell>
                      <TableCell align="right">{formatCurrency(r.weeklyRate)}</TableCell>
                    </TableRow>
                  ))}
                  {(!extractedRates.equipmentRates?.length) && (
                    <TableRow><TableCell colSpan={4} sx={{ textAlign: 'center', color: 'text.secondary' }}>No equipment rates extracted</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          )}

          {/* Unit Rates */}
          {activeTab === 3 && (
            <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 400 }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 700 }}>Ref Code</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Description</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>UOM</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>Labor %</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>Regions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {(extractedRates.unitRates || []).map((r, i) => (
                    <TableRow key={i}>
                      <TableCell sx={{ fontFamily: 'monospace' }}>{r.refCode}</TableCell>
                      <TableCell>{r.unitDescription}</TableCell>
                      <TableCell>{r.unitOfMeasure}</TableCell>
                      <TableCell align="right">{r.laborPercent ? `${(r.laborPercent * 100).toFixed(0)}%` : '—'}</TableCell>
                      <TableCell align="right">{r.regionRates?.length || 0}</TableCell>
                    </TableRow>
                  ))}
                  {(!extractedRates.unitRates?.length) && (
                    <TableRow><TableCell colSpan={5} sx={{ textAlign: 'center', color: 'text.secondary' }}>No unit rates extracted</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          )}

          <Divider sx={{ my: 3 }} />

          {/* Action buttons */}
          {!activated && (
            <Box sx={{ display: 'flex', gap: 2 }}>
              <Button
                variant="contained"
                color="success"
                size="large"
                startIcon={activating ? <CircularProgress size={20} /> : <CheckCircleIcon />}
                onClick={handleActivate}
                disabled={activating}
                sx={{ flex: 1, py: 1.5, fontWeight: 700 }}
              >
                {activating ? 'Activating...' : 'Activate Rates'}
              </Button>
              <Button
                variant="outlined"
                size="large"
                startIcon={<EditIcon />}
                sx={{ flex: 1, py: 1.5 }}
                disabled
              >
                Edit Rates (Coming Soon)
              </Button>
            </Box>
          )}

          {activated && (
            <Button
              variant="outlined"
              fullWidth
              startIcon={<UploadFileIcon />}
              onClick={() => { setExtractedRates(null); setActivated(false); setRatesId(null); }}
              sx={{ py: 1.5 }}
            >
              Upload New MSA
            </Button>
          )}
        </Box>
      )}
    </Box>
  );
};

export default MSAUpload;
