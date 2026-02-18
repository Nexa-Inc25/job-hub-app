/**
 * FieldLedger - As-Built Wizard Page
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * 
 * Page wrapper that fetches the utility config, job data, and user data,
 * then renders the AsBuiltWizard with all required props.
 * 
 * Route: /jobs/:jobId/asbuilt-wizard
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box, Typography, Button, CircularProgress, Alert, AlertTitle,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';

import AsBuiltWizard from './AsBuiltWizard';
import api from '../../api';

const AsBuiltWizardPage = () => {
  const { jobId } = useParams();
  const navigate = useNavigate();

  const [job, setJob] = useState(null);
  const [user, setUser] = useState(null);
  const [utilityConfig, setUtilityConfig] = useState(null);
  const [sketchPdfUrl, setSketchPdfUrl] = useState(null);
  const [jobPackagePdfUrl, setJobPackagePdfUrl] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        setError(null);

        // Fetch job data
        const jobRes = await api.get(`/api/jobs/${jobId}`);
        const jobData = jobRes.data;
        setJob(jobData);

        // Fetch current user profile
        try {
          const userRes = await api.get('/api/users/me');
          setUser(userRes.data);
        } catch (userErr) {
          // Fallback: build minimal user from token
          console.warn('Could not fetch user profile:', userErr.message);
          const token = localStorage.getItem('token');
          if (token) {
            try {
              const payload = JSON.parse(atob(token.split('.')[1]));
              setUser({ _id: payload.userId, role: payload.role, username: payload.email });
            } catch { /* ignore */ }
          }
        }

        // Fetch utility config — default to PGE for now
        // TODO: derive utility code from job.utilityId when multi-utility is active
        const utilityCode = 'PGE';
        try {
          const configRes = await api.get(`/api/asbuilt/config/${utilityCode}`);
          setUtilityConfig(configRes.data);
        } catch (configErr) {
          console.error('Failed to load utility config:', configErr);
          // Non-fatal — wizard will show a warning
        }

        // Find PDFs from job folders
        if (jobData.folders) {
          const allDocs = [];
          for (const folder of jobData.folders) {
            if (folder.documents) allDocs.push(...folder.documents);
            for (const sub of folder.subfolders || []) {
              if (sub.documents) allDocs.push(...sub.documents);
              for (const nested of sub.subfolders || []) {
                if (nested.documents) allDocs.push(...nested.documents);
              }
            }
          }

          const getUrl = async (doc) => {
            if (doc.r2Key) {
              try { return await api.getSignedFileUrl(doc.r2Key); } catch { return ''; }
            }
            return doc.url || '';
          };

          // Find construction sketch
          const sketch = allDocs.find(d =>
            d.category === 'SKETCH' || d.type === 'drawing' ||
            d.name?.toLowerCase().includes('sketch') ||
            d.name?.toLowerCase().includes('drawing')
          );
          if (sketch) setSketchPdfUrl(await getUrl(sketch));

          // Find the job package PDF (the main multi-page document)
          // It's typically the largest PDF, or named "FM Pack" / "Job Package"
          const jobPackage = allDocs.find(d =>
            d.type === 'pdf' &&
            (d.name?.toLowerCase().includes('pack') ||
             d.name?.toLowerCase().includes('fm pack') ||
             d.name?.toLowerCase().includes('job package'))
          ) || allDocs.find(d =>
            d.type === 'pdf' && !d.extractedFrom && !d.category
          );
          if (jobPackage) setJobPackagePdfUrl(await getUrl(jobPackage));
        }
      } catch (err) {
        console.error('Failed to load wizard data:', err);
        setError(err.response?.data?.error || err.message || 'Failed to load job data');
      } finally {
        setLoading(false);
      }
    };

    if (jobId) loadData();
  }, [jobId]);

  const handleComplete = useCallback(async (submission) => {
    try {
      const res = await api.post('/api/asbuilt/wizard/submit', { submission });
      if (res.data?.success) {
        navigate(`/jobs/${jobId}`, {
          state: { message: `As-built package submitted! UTVAC Score: ${res.data.validation?.score}%` },
        });
      }
    } catch (err) {
      console.error('Submission failed:', err);
      setError(err.response?.data?.error || 'Submission failed');
    }
  }, [jobId, navigate]);

  const handleOpenSketchEditor = useCallback(() => {
    // For now, open the sketch in a new tab using the existing PDF editor
    // TODO: integrate SketchMarkupEditor as a modal/full-screen overlay
    if (sketchPdfUrl) {
      window.open(sketchPdfUrl, '_blank');
    }
  }, [sketchPdfUrl]);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', gap: 2 }}>
        <CircularProgress size={48} />
        <Typography variant="body1" color="text.secondary">
          Loading As-Built Wizard...
        </Typography>
      </Box>
    );
  }

  if (error && !job) {
    return (
      <Box sx={{ maxWidth: 600, mx: 'auto', mt: 4, px: 2 }}>
        <Alert severity="error" sx={{ mb: 2 }}>
          <AlertTitle>Error</AlertTitle>
          {error}
        </Alert>
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate(-1)}>
          Go Back
        </Button>
      </Box>
    );
  }

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      {/* Back button */}
      <Box sx={{ px: 2, pt: 2 }}>
        <Button
          startIcon={<ArrowBackIcon />}
          onClick={() => navigate(`/jobs/${jobId}`)}
          size="small"
          sx={{ mb: 1 }}
        >
          Back to Job
        </Button>
      </Box>

      {error && (
        <Box sx={{ px: 2 }}>
          <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 2 }}>
            {error}
          </Alert>
        </Box>
      )}

      <AsBuiltWizard
        utilityConfig={utilityConfig}
        job={job}
        user={user}
        sketchPdfUrl={sketchPdfUrl}
        jobPackagePdfUrl={jobPackagePdfUrl}
        onComplete={handleComplete}
        onOpenSketchEditor={handleOpenSketchEditor}
      />
    </Box>
  );
};

export default AsBuiltWizardPage;

