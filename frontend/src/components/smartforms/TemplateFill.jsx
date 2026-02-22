/**
 * TemplateFill - Fill a SmartForms template with job data
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 */

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  Button,
  Paper,
  TextField,
  Checkbox,
  CircularProgress,
  Alert,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Snackbar,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import DownloadIcon from '@mui/icons-material/Download';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import DescriptionIcon from '@mui/icons-material/Description';

const API_BASE = import.meta.env.VITE_API_URL || '';

export default function TemplateFill() {
  const { templateId } = useParams();
  const navigate = useNavigate();

  const [template, setTemplate] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [selectedJobs, setSelectedJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filling, setFilling] = useState(false);
  const [error, setError] = useState('');
  const [results, setResults] = useState(null);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });

  // Search/filter
  const [searchQuery, setSearchQuery] = useState('');

  // Load template and jobs
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const token = localStorage.getItem('token');

        // Fetch template
        const templateRes = await fetch(`${API_BASE}/api/smartforms/templates/${templateId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!templateRes.ok) throw new Error('Failed to load template');
        const templateData = await templateRes.json();
        setTemplate(templateData);

        // Fetch jobs
        const jobsRes = await fetch(`${API_BASE}/api/jobs`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (jobsRes.ok) {
          const jobsData = await jobsRes.json();
          setJobs(jobsData);
        }

        setError('');
      } catch (err) {
        console.error('Error loading data:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [templateId]);

  // Toggle job selection
  const toggleJobSelection = (jobId) => {
    setSelectedJobs((prev) =>
      prev.includes(jobId)
        ? prev.filter((id) => id !== jobId)
        : [...prev, jobId]
    );
  };

  // Select all visible jobs
  const handleSelectAll = () => {
    const visibleJobIds = filteredJobs.map((j) => j._id);
    const allSelected = visibleJobIds.every((id) => selectedJobs.includes(id));
    
    if (allSelected) {
      setSelectedJobs((prev) => prev.filter((id) => !visibleJobIds.includes(id)));
    } else {
      setSelectedJobs((prev) => [...new Set([...prev, ...visibleJobIds])]);
    }
  };

  // Filter jobs
  const filteredJobs = jobs.filter((job) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      job.pmNumber?.toLowerCase().includes(query) ||
      job.woNumber?.toLowerCase().includes(query) ||
      job.title?.toLowerCase().includes(query) ||
      job.address?.toLowerCase().includes(query)
    );
  });

  // Fill single job
  const handleFillSingle = async (jobId) => {
    try {
      setFilling(true);
      const token = localStorage.getItem('token');

      const response = await fetch(`${API_BASE}/api/smartforms/templates/${templateId}/fill`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ jobId }),
      });

      if (!response.ok) throw new Error('Failed to fill template');

      // Download the PDF
      const blob = await response.blob();
      const url = globalThis.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${template.name}_filled.pdf`;
      document.body.appendChild(a);
      a.click();
      globalThis.URL.revokeObjectURL(url);
      a.remove();

      setSnackbar({ open: true, message: 'PDF downloaded!', severity: 'success' });
    } catch (err) {
      console.error('Error filling template:', err);
      setSnackbar({ open: true, message: err.message, severity: 'error' });
    } finally {
      setFilling(false);
    }
  };

  // Batch fill
  const handleBatchFill = async () => {
    if (selectedJobs.length === 0) {
      setSnackbar({ open: true, message: 'Select at least one job', severity: 'warning' });
      return;
    }

    try {
      setFilling(true);
      const token = localStorage.getItem('token');

      const response = await fetch(`${API_BASE}/api/smartforms/templates/${templateId}/batch-fill`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ jobIds: selectedJobs }),
      });

      if (!response.ok) throw new Error('Failed to batch fill');

      const data = await response.json();
      setResults(data);
      setSnackbar({
        open: true,
        message: `Filled ${data.successCount} of ${data.totalJobs} PDFs`,
        severity: data.failureCount > 0 ? 'warning' : 'success',
      });
    } catch (err) {
      console.error('Error batch filling:', err);
      setSnackbar({ open: true, message: err.message, severity: 'error' });
    } finally {
      setFilling(false);
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '80vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">{error}</Alert>
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/smartforms')} sx={{ mt: 2 }}>
          Back to SmartForms
        </Button>
      </Box>
    );
  }

  if (template?.status !== 'active') {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="warning">
          This template is not active. Please activate it in the editor first.
        </Alert>
        <Button
          startIcon={<ArrowBackIcon />}
          onClick={() => navigate(`/smartforms/editor/${templateId}`)}
          sx={{ mt: 2 }}
        >
          Go to Editor
        </Button>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
        <IconButton onClick={() => navigate('/smartforms')}>
          <ArrowBackIcon />
        </IconButton>
        <Box sx={{ flex: 1 }}>
          <Typography variant="h5" fontWeight={700}>
            Fill: {template?.name}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {template?.fields?.length || 0} fields mapped • Select jobs to fill
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={filling ? <CircularProgress size={20} color="inherit" /> : <PlayArrowIcon />}
          onClick={handleBatchFill}
          disabled={filling || selectedJobs.length === 0}
          size="large"
        >
          {(() => {
            if (selectedJobs.length === 0) return 'Fill Selected';
            const plural = selectedJobs.length === 1 ? '' : 's';
            return `Fill ${selectedJobs.length} Job${plural}`;
          })()}
        </Button>
      </Box>

      {/* Results */}
      {results && (
        <Paper sx={{ p: 2, mb: 3 }}>
          <Typography variant="h6" gutterBottom>
            Batch Fill Results
          </Typography>
          <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
            <Chip
              icon={<CheckCircleIcon />}
              label={`${results.successCount} Successful`}
              color="success"
            />
            {results.failureCount > 0 && (
              <Chip
                icon={<ErrorIcon />}
                label={`${results.failureCount} Failed`}
                color="error"
              />
            )}
          </Box>
          <TableContainer sx={{ maxHeight: 300 }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell>Job</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell align="right">Action</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {results.results.map((result) => (
                  <TableRow key={result.jobId}>
                    <TableCell>{result.jobNumber || result.jobId}</TableCell>
                    <TableCell>
                      {result.success ? (
                        <Chip size="small" icon={<CheckCircleIcon />} label="Success" color="success" />
                      ) : (
                        <Chip size="small" icon={<ErrorIcon />} label={result.error} color="error" />
                      )}
                    </TableCell>
                    <TableCell align="right">
                      {result.success && result.downloadUrl && (
                        <Button
                          size="small"
                          startIcon={<DownloadIcon />}
                          href={result.downloadUrl}
                          target="_blank"
                        >
                          Download
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}

      {/* Job Selection */}
      <Paper sx={{ p: 2, mb: 2 }}>
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
          <TextField
            size="small"
            placeholder="Search jobs by PM, WO, title, or address..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            sx={{ flex: 1 }}
          />
          <Typography variant="body2" color="text.secondary">
            {selectedJobs.length} selected
          </Typography>
          <Button variant="outlined" size="small" onClick={handleSelectAll}>
            {filteredJobs.every((j) => selectedJobs.includes(j._id)) ? 'Deselect All' : 'Select All'}
          </Button>
        </Box>
      </Paper>

      {/* Jobs Table */}
      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell padding="checkbox">
                <Checkbox
                  checked={filteredJobs.length > 0 && filteredJobs.every((j) => selectedJobs.includes(j._id))}
                  indeterminate={
                    filteredJobs.some((j) => selectedJobs.includes(j._id)) &&
                    !filteredJobs.every((j) => selectedJobs.includes(j._id))
                  }
                  onChange={handleSelectAll}
                />
              </TableCell>
              <TableCell>PM/WO</TableCell>
              <TableCell>Title</TableCell>
              <TableCell>Address</TableCell>
              <TableCell>Status</TableCell>
              <TableCell align="right">Quick Fill</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredJobs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} align="center" sx={{ py: 4 }}>
                  <Typography color="text.secondary">No jobs found</Typography>
                </TableCell>
              </TableRow>
            ) : (
              filteredJobs.map((job) => (
                <TableRow
                  key={job._id}
                  hover
                  selected={selectedJobs.includes(job._id)}
                  onClick={() => toggleJobSelection(job._id)}
                  sx={{ cursor: 'pointer' }}
                >
                  <TableCell padding="checkbox">
                    <Checkbox
                      checked={selectedJobs.includes(job._id)}
                      onClick={(e) => e.stopPropagation()}
                      onChange={() => toggleJobSelection(job._id)}
                    />
                  </TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <DescriptionIcon fontSize="small" color="action" />
                      <Box>
                        <Typography fontWeight={600}>{job.pmNumber || job.woNumber || '-'}</Typography>
                        {job.woNumber && job.pmNumber && (
                          <Typography variant="caption" color="text.secondary">
                            WO: {job.woNumber}
                          </Typography>
                        )}
                      </Box>
                    </Box>
                  </TableCell>
                  <TableCell>{job.title || '-'}</TableCell>
                  <TableCell>
                    {job.address}
                    {job.city && `, ${job.city}`}
                  </TableCell>
                  <TableCell>
                    <Chip size="small" label={job.status || 'active'} />
                  </TableCell>
                  <TableCell align="right">
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={<DownloadIcon />}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleFillSingle(job._id);
                      }}
                      disabled={filling}
                    >
                      Fill
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={snackbar.severity} onClose={() => setSnackbar((s) => ({ ...s, open: false }))}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}

