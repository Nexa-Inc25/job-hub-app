/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
/**
 * Foreman Close Out View
 *
 * Simplified mobile-first interface for field foremen to:
 * - Upload photos (before/during/after)
 * - Edit and sign PDFs
 * - Submit bid units for approval
 * - Complete tailboard/JHA
 * - Submit timesheet entries
 *
 * Hides file system complexity - that's for PM/Back Office staff.
 *
 * @module components/ForemanCloseOut
 */

import React, { useState, useEffect, useCallback, Suspense, lazy } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  IconButton,
  Chip,
  Alert,
  CircularProgress,
  Tabs,
  Tab,
  LinearProgress,
} from '@mui/material';
import BackIcon from '@mui/icons-material/ArrowBack';
import CameraIcon from '@mui/icons-material/CameraAlt';
import DescriptionIcon from '@mui/icons-material/Description';
import ReceiptIcon from '@mui/icons-material/Receipt';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import ShieldIcon from '@mui/icons-material/Shield';
import NoteAddIcon from '@mui/icons-material/NoteAdd';
import OfflineIcon from '@mui/icons-material/CloudOff';
import OnlineIcon from '@mui/icons-material/CloudQueue';
import DirectionsIcon from '@mui/icons-material/Directions';
import AssignmentTurnedInIcon from '@mui/icons-material/AssignmentTurnedIn';
import api from '../api';
import { openDirections } from '../utils/navigation';
import { useOffline } from '../hooks/useOffline';
import { useAppColors } from './shared/themeUtils';

// Sub-components
import { CloseOutPhotos, CloseOutSignatures } from './closeout';
import { TailboardCard, TimesheetCard, SubmitSection } from './closeout/CloseOutChecklist';
import { UnitsSection, ChangeOrderSection } from './closeout/CloseOutSummary';

// Lazy load As-Built Wizard — heavy component only needed when the tab is active
const AsBuiltWizard = lazy(() => import('./asbuilt/AsBuiltWizard'));

// Tab panel wrapper
function TabPanel({ children, value, index, ...other }) { // eslint-disable-line react/prop-types
  return (
    <div role="tabpanel" hidden={value !== index} {...other}>
      {value === index && <Box sx={{ py: 2 }}>{children}</Box>}
    </div>
  );
}

const ForemanCloseOut = () => {
  const COLORS = useAppColors();
  const { jobId } = useParams();
  const navigate = useNavigate();
  const { isOnline } = useOffline();

  // Core state
  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState(0);
  const [photos, setPhotos] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [units, setUnits] = useState([]);
  const [tailboard, setTailboard] = useState(null);
  const [lme, setLme] = useState(null);
  const [fieldTickets, setFieldTickets] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [showSubmitDialog, setShowSubmitDialog] = useState(false);

  // SmartForms templates
  const [smartFormTemplates, setSmartFormTemplates] = useState([]);

  // As-Built Wizard state
  const [user, setUser] = useState(null);
  const [utilityConfig, setUtilityConfig] = useState(null);
  const [sketchPdfUrl, setSketchPdfUrl] = useState(null);
  const [jobPackagePdfUrl, setJobPackagePdfUrl] = useState(null);

  // ---- Data Loading ----
  useEffect(() => {
    const loadJob = async () => {
      try {
        setLoading(true);
        const res = await api.get(`/api/jobs/${jobId}`);
        const jobData = res.data;
        setJob(jobData);

        // Extract photos from GF Audit folder
        const aciFolder = jobData.folders?.find((f) => f.name === 'ACI');
        const gfAuditFolder = aciFolder?.subfolders?.find((sf) => sf.name === 'GF Audit');
        setPhotos(gfAuditFolder?.documents || []);

        // Extract editable documents
        const preFieldFolder = aciFolder?.subfolders?.find((sf) => sf.name === 'Pre-Field Documents');
        const generalFormsFolder = aciFolder?.subfolders?.find((sf) => sf.name === 'General Forms');
        const allDocs = [...(preFieldFolder?.documents || []), ...(generalFormsFolder?.documents || [])];
        setDocuments(allDocs);

        // Load supplemental data in parallel
        const [unitsRes, tailboardRes, lmeRes, ftRes, templatesRes] = await Promise.allSettled([
          api.get(`/api/billing/units?jobId=${jobId}`),
          api.get(`/api/tailboard/job/${jobId}/today`),
          api.get(`/api/lme?jobId=${jobId}`),
          api.get(`/api/fieldtickets?jobId=${jobId}`),
          api.get('/api/smartforms/templates?status=active'),
        ]);

        setUnits(unitsRes.status === 'fulfilled' && Array.isArray(unitsRes.value.data) ? unitsRes.value.data : []);
        setTailboard(tailboardRes.status === 'fulfilled' ? tailboardRes.value.data || null : null);
        const lmeList = lmeRes.status === 'fulfilled' && Array.isArray(lmeRes.value.data) ? lmeRes.value.data : [];
        setLme(lmeList.length > 0 ? lmeList[0] : null);
        setFieldTickets(ftRes.status === 'fulfilled' && Array.isArray(ftRes.value.data) ? ftRes.value.data : []);
        setSmartFormTemplates(templatesRes.status === 'fulfilled' && Array.isArray(templatesRes.value.data) ? templatesRes.value.data : []);

        // Load user & utility config for As-Built Wizard
        try {
          const userRes = await api.get('/api/users/me');
          setUser(userRes.data);
        } catch {
          const token = localStorage.getItem('token');
          if (token) {
            try {
              const payload = JSON.parse(atob(token.split('.')[1]));
              setUser({ _id: payload.userId, role: payload.role, username: payload.email });
            } catch { /* ignore */ }
          }
        }

        try {
          const configRes = await api.get('/api/asbuilt/config/PGE');
          setUtilityConfig(configRes.data);
        } catch { /* non-fatal */ }

        // Extract PDF URLs for wizard
        if (jobData.folders) {
          const flatDocs = [];
          for (const folder of jobData.folders) {
            if (folder.documents) flatDocs.push(...folder.documents);
            for (const sub of folder.subfolders || []) {
              if (sub.documents) flatDocs.push(...sub.documents);
              for (const nested of sub.subfolders || []) {
                if (nested.documents) flatDocs.push(...nested.documents);
              }
            }
          }
          const getUrl = async (doc) => {
            if (doc.r2Key) {
              try { return await api.getSignedFileUrl(doc.r2Key); } catch { return ''; }
            }
            return doc.url || '';
          };
          const sketch = flatDocs.find((d) => d.category === 'SKETCH' || d.type === 'drawing' || d.name?.toLowerCase().includes('sketch'));
          if (sketch) setSketchPdfUrl(await getUrl(sketch));
          const jobPkg = flatDocs.find((d) => d.type === 'pdf' && (d.name?.toLowerCase().includes('pack') || d.name?.toLowerCase().includes('job package'))) || flatDocs.find((d) => d.type === 'pdf' && !d.extractedFrom && !d.category);
          if (jobPkg) setJobPackagePdfUrl(await getUrl(jobPkg));
        }
      } catch (err) {
        console.error('Failed to load job:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    if (jobId) loadJob();
  }, [jobId]);

  // ---- Handlers ----
  const handlePhotoAdded = (photo) => setPhotos((prev) => [...prev, photo]);

  const handlePhotoDeleted = async (photo) => {
    try {
      await api.delete(`/api/jobs/${jobId}/documents/${photo._id}`);
      setPhotos((prev) => prev.filter((p) => p._id !== photo._id));
    } catch (err) {
      console.error('Delete failed:', err);
    }
  };

  const handleDocumentsChanged = async () => {
    try {
      const res = await api.get(`/api/jobs/${jobId}`);
      setJob(res.data);
      const aciFolder = res.data.folders?.find((f) => f.name === 'ACI');
      const preFieldFolder = aciFolder?.subfolders?.find((sf) => sf.name === 'Pre-Field Documents');
      const generalFormsFolder = aciFolder?.subfolders?.find((sf) => sf.name === 'General Forms');
      const completedFormsFolder = aciFolder?.subfolders?.find((sf) => sf.name === 'Completed Forms');
      setDocuments([...(preFieldFolder?.documents || []), ...(generalFormsFolder?.documents || []), ...(completedFormsFolder?.documents || [])]);
    } catch (err) {
      console.error('Failed to refresh documents:', err);
    }
  };

  const handleAsBuiltComplete = useCallback(async (submission) => {
    try {
      const res = await api.post('/api/asbuilt/wizard/submit', { submission });
      if (res.data?.success) {
        const score = res.data.validation?.score;
        navigate(`/jobs/${jobId}`, { state: { message: `Job submitted for review! As-built UTVAC Score: ${score}%` } });
      }
    } catch (err) {
      console.error('As-built submission failed:', err);
      setError(err.response?.data?.error || 'As-built submission failed');
    }
  }, [jobId, navigate]);

  const handleOpenSketchEditor = useCallback(() => {
    if (sketchPdfUrl) globalThis.open(sketchPdfUrl, '_blank');
  }, [sketchPdfUrl]);

  const handleSubmitForReview = async () => {
    setSubmitting(true);
    try {
      await api.put(`/api/jobs/${jobId}/status`, { status: 'pending_pm_approval' });
      setShowSubmitDialog(false);
      navigate('/dashboard', { state: { message: 'Job submitted for PM approval!' } });
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // ---- Computed values ----
  const timesheetHours = lme?.labor?.reduce((sum, l) => sum + (l.stHours || 0) + (l.otHours || 0) + (l.dtHours || 0), 0) || null;
  const completionStatus = {
    photos: photos.length >= 3,
    tailboard: tailboard?.status === 'completed',
    units: units.length > 0,
    documents: documents.some((d) => d.signedDate),
  };
  const completionPercent = (Object.values(completionStatus).filter(Boolean).length / 4) * 100;
  const canSubmit = completionPercent >= 50;

  // ---- Render ----
  if (loading) {
    return (
      <Box sx={{ bgcolor: COLORS.bg, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <CircularProgress sx={{ color: COLORS.primary }} />
      </Box>
    );
  }

  return (
    <Box sx={{ bgcolor: COLORS.bg, minHeight: '100vh' }}>
      {/* Header */}
      <Box sx={{ bgcolor: COLORS.surface, px: 2, py: 2, borderBottom: `1px solid ${COLORS.border}`, position: 'sticky', top: 0, zIndex: 10 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <IconButton onClick={() => navigate(-1)} sx={{ color: COLORS.text, p: 0.5 }} aria-label="Go back">
              <BackIcon />
            </IconButton>
            <Box>
              <Typography sx={{ color: COLORS.text, fontWeight: 700, fontSize: '1.1rem' }}>Close Out Job</Typography>
              <Typography sx={{ color: COLORS.textSecondary, fontSize: '0.75rem' }}>
                {job?.woNumber || job?.jobNumber} • {job?.address?.slice(0, 30)}...
              </Typography>
            </Box>
            {job?.address && (
              <IconButton
                onClick={() => openDirections(job.address, job.city)}
                sx={{ color: COLORS.secondary, bgcolor: `${COLORS.secondary}20`, ml: 1, '&:hover': { bgcolor: `${COLORS.secondary}40` } }}
                size="small"
              >
                <DirectionsIcon fontSize="small" />
              </IconButton>
            )}
          </Box>
          <Chip
            icon={isOnline ? <OnlineIcon /> : <OfflineIcon />}
            label={isOnline ? 'Online' : 'Offline'}
            size="small"
            sx={{ bgcolor: isOnline ? `${COLORS.success}20` : `${COLORS.warning}20`, color: isOnline ? COLORS.success : COLORS.warning }}
          />
        </Box>

        {/* Progress bar */}
        <Box sx={{ mt: 2 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
            <Typography sx={{ color: COLORS.textSecondary, fontSize: '0.75rem' }}>Completion Progress</Typography>
            <Typography sx={{ color: COLORS.primary, fontWeight: 600, fontSize: '0.75rem' }}>{Math.round(completionPercent)}%</Typography>
          </Box>
          <LinearProgress
            variant="determinate"
            value={completionPercent}
            sx={{ height: 8, borderRadius: 4, bgcolor: COLORS.surfaceLight, '& .MuiLinearProgress-bar': { bgcolor: COLORS.primary, borderRadius: 4 } }}
          />
        </Box>
      </Box>

      {/* Error display */}
      {error && (
        <Alert severity="error" sx={{ m: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Tabs */}
      <Tabs
        value={activeTab}
        onChange={(e, v) => setActiveTab(v)}
        variant="scrollable"
        scrollButtons="auto"
        sx={{
          bgcolor: COLORS.surface,
          '& .MuiTab-root': { color: COLORS.textSecondary, fontWeight: 600, minHeight: 56 },
          '& .Mui-selected': { color: COLORS.primary },
          '& .MuiTabs-indicator': { bgcolor: COLORS.primary },
        }}
      >
        <Tab icon={<CameraIcon />} label="Photos" iconPosition="start" />
        <Tab icon={<DescriptionIcon />} label="Docs" iconPosition="start" />
        <Tab icon={<ReceiptIcon />} label="Units" iconPosition="start" />
        <Tab icon={<NoteAddIcon />} label="T&M" iconPosition="start" />
        <Tab icon={<ShieldIcon />} label="Safety" iconPosition="start" />
        <Tab icon={<AccessTimeIcon />} label="Time" iconPosition="start" />
        <Tab icon={<AssignmentTurnedInIcon />} label="As-Built" iconPosition="start" />
      </Tabs>

      {/* Tab content */}
      <Box sx={{ p: 2 }}>
        <TabPanel value={activeTab} index={0}>
          <CloseOutPhotos jobId={jobId} photos={photos} onPhotoAdded={handlePhotoAdded} onPhotoDeleted={handlePhotoDeleted} />
        </TabPanel>

        <TabPanel value={activeTab} index={1}>
          <CloseOutSignatures jobId={jobId} job={job} documents={documents} smartFormTemplates={smartFormTemplates} onDocumentsChanged={handleDocumentsChanged} />
        </TabPanel>

        <TabPanel value={activeTab} index={2}>
          <UnitsSection units={units} onNavigateUnits={() => navigate(`/jobs/${jobId}/log-unit`)} />
        </TabPanel>

        <TabPanel value={activeTab} index={3}>
          <ChangeOrderSection
            fieldTickets={fieldTickets}
            onNavigateFieldTicket={(ticket) => navigate(`/jobs/${jobId}/field-ticket/${ticket._id}`)}
            onCreateFieldTicket={() => navigate(`/jobs/${jobId}/field-ticket`)}
          />
        </TabPanel>

        <TabPanel value={activeTab} index={4}>
          <TailboardCard tailboard={tailboard} onNavigateTailboard={() => navigate(`/jobs/${jobId}/tailboard`)} />
        </TabPanel>

        <TabPanel value={activeTab} index={5}>
          <TimesheetCard lme={lme} onNavigateTimesheet={() => navigate(`/jobs/${jobId}/lme`)} />
        </TabPanel>

        <TabPanel value={activeTab} index={6}>
          <Suspense
            fallback={
              <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', py: 6, gap: 2 }}>
                <CircularProgress sx={{ color: COLORS.primary }} />
                <Typography sx={{ color: COLORS.textSecondary }}>Loading As-Built Wizard...</Typography>
              </Box>
            }
          >
            <AsBuiltWizard
              utilityConfig={utilityConfig}
              job={job}
              user={user}
              timesheetHours={timesheetHours}
              unitEntries={units}
              tailboard={tailboard}
              lmeData={lme}
              sketchPdfUrl={sketchPdfUrl}
              jobPackagePdfUrl={jobPackagePdfUrl}
              onComplete={handleAsBuiltComplete}
              onOpenSketchEditor={handleOpenSketchEditor}
            />
          </Suspense>
        </TabPanel>
      </Box>

      {/* Submit FAB + dialog */}
      <SubmitSection
        canSubmit={canSubmit}
        completionStatus={completionStatus}
        completionPercent={completionPercent}
        showSubmitDialog={showSubmitDialog}
        setShowSubmitDialog={setShowSubmitDialog}
        submitting={submitting}
        onSubmitForReview={handleSubmitForReview}
      />
    </Box>
  );
};

export default ForemanCloseOut;
