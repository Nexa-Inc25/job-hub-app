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

import React, { useState, useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  Button,
  IconButton,
  Card,
  CardContent,
  Grid,
  Chip,
  Alert,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Fab,
  Tabs,
  Tab,
  LinearProgress,
  Avatar,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  ListItemSecondaryAction,
} from '@mui/material';
import BackIcon from '@mui/icons-material/ArrowBack';
import CameraIcon from '@mui/icons-material/CameraAlt';
import PhotoLibraryIcon from '@mui/icons-material/PhotoLibrary';
import DescriptionIcon from '@mui/icons-material/Description';
import EditIcon from '@mui/icons-material/Edit';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ReceiptIcon from '@mui/icons-material/Receipt';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import ShieldIcon from '@mui/icons-material/Shield';
import SendIcon from '@mui/icons-material/Send';
import OfflineIcon from '@mui/icons-material/CloudOff';
import OnlineIcon from '@mui/icons-material/CloudQueue';
import AddAPhotoIcon from '@mui/icons-material/AddAPhoto';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import DeleteIcon from '@mui/icons-material/Delete';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import GroupsIcon from '@mui/icons-material/Groups';
import CloseIcon from '@mui/icons-material/Close';
import DirectionsIcon from '@mui/icons-material/Directions';
import api from '../api';
import { openDirections } from '../utils/navigation';
import { useOffline } from '../hooks/useOffline';
import PDFFormEditor from './PDFFormEditor';
import { useAppColors } from './shared/themeUtils';

// Tab panel wrapper
function TabPanel({ children, value, index, ...other }) {
  return (
    <div role="tabpanel" hidden={value !== index} {...other}>
      {value === index && <Box sx={{ py: 2 }}>{children}</Box>}
    </div>
  );
}

TabPanel.propTypes = {
  children: PropTypes.node,
  value: PropTypes.number.isRequired,
  index: PropTypes.number.isRequired,
};

/**
 * Photo Section - Upload/capture job photos
 */
const PhotoSection = ({ jobId, photos, onPhotoAdded, onPhotoDeleted }) => {
  const COLORS = useAppColors();
  const [uploading, setUploading] = useState(false);
  const [previewPhoto, setPreviewPhoto] = useState(null);
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);

  const handleFileSelect = async (e, source) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    setUploading(true);
    try {
      for (const file of files) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('folder', 'ACI');
        formData.append('subfolder', 'GF Audit');
        formData.append('photoType', source === 'camera' ? 'field_capture' : 'uploaded');

        // Get GPS location if available
        if (navigator.geolocation) {
          try {
            const pos = await new Promise((resolve, reject) => 
              navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 })
            );
            formData.append('latitude', pos.coords.latitude);
            formData.append('longitude', pos.coords.longitude);
          } catch {
            // GPS not available, continue without
          }
        }

        const res = await api.post(`/api/jobs/${jobId}/upload`, formData);
        if (res.data?.document) {
          onPhotoAdded(res.data.document);
        }
      }
    } catch (err) {
      console.error('Photo upload failed:', err);
    } finally {
      setUploading(false);
      // Reset inputs
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (cameraInputRef.current) cameraInputRef.current.value = '';
    }
  };

  return (
    <Box>
      {/* Upload buttons */}
      <Box sx={{ display: 'flex', gap: 2, mb: 3 }}>
        <Button
          variant="contained"
          startIcon={<CameraIcon />}
          onClick={() => cameraInputRef.current?.click()}
          disabled={uploading}
          sx={{
            flex: 1,
            py: 2,
            bgcolor: COLORS.primary,
            color: COLORS.bg,
            fontWeight: 700,
            fontSize: '1rem',
            '&:hover': { bgcolor: COLORS.primaryDark },
          }}
        >
          Take Photo
        </Button>
        <Button
          variant="outlined"
          startIcon={<PhotoLibraryIcon />}
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          sx={{
            flex: 1,
            py: 2,
            borderColor: COLORS.secondary,
            color: COLORS.secondary,
            fontWeight: 700,
            fontSize: '1rem',
          }}
        >
          Gallery
        </Button>
      </Box>

      {/* Hidden file inputs */}
      <input
        id="foreman-camera-input"
        name="foreman-camera-input"
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => handleFileSelect(e, 'camera')}
        aria-label="Take photo with camera"
      />
      <input
        id="foreman-gallery-input"
        name="foreman-gallery-input"
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => handleFileSelect(e, 'gallery')}
        aria-label="Select photos from gallery"
      />

      {uploading && <LinearProgress sx={{ mb: 2 }} />}

      {/* Photo grid */}
      <Typography sx={{ color: COLORS.textSecondary, fontWeight: 600, fontSize: '0.75rem', mb: 1 }}>
        JOB PHOTOS ({photos.length})
      </Typography>
      
      {photos.length === 0 ? (
        <Box sx={{ 
          border: `2px dashed ${COLORS.border}`, 
          borderRadius: 2, 
          p: 4, 
          textAlign: 'center' 
        }}>
          <AddAPhotoIcon sx={{ fontSize: 48, color: COLORS.textSecondary, mb: 1 }} />
          <Typography sx={{ color: COLORS.textSecondary }}>
            No photos yet. Tap above to add.
          </Typography>
        </Box>
      ) : (
        <Grid container spacing={1}>
          {photos.map((photo, idx) => (
            <Grid size={4} key={photo._id || idx}>
              <Box
                sx={{
                  position: 'relative',
                  paddingTop: '100%',
                  borderRadius: 1,
                  overflow: 'hidden',
                  bgcolor: COLORS.surface,
                  cursor: 'pointer',
                }}
                onClick={() => setPreviewPhoto(photo)}
              >
                <img
                  src={photo.url || photo.thumbnailUrl}
                  alt={photo.name}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                  }}
                />
                {photo.latitude && (
                  <Chip
                    icon={<LocationOnIcon sx={{ fontSize: 12 }} />}
                    label="GPS"
                    size="small"
                    sx={{
                      position: 'absolute',
                      bottom: 4,
                      left: 4,
                      bgcolor: 'rgba(0,0,0,0.7)',
                      color: COLORS.success,
                      height: 20,
                      '& .MuiChip-label': { fontSize: '0.65rem', px: 0.5 },
                    }}
                  />
                )}
              </Box>
            </Grid>
          ))}
        </Grid>
      )}

      {/* Photo preview dialog */}
      <Dialog
        open={!!previewPhoto}
        onClose={() => setPreviewPhoto(null)}
        maxWidth="md"
        fullWidth
        PaperProps={{ sx: { bgcolor: COLORS.bg } }}
      >
        <DialogContent sx={{ p: 0 }}>
          {previewPhoto && (
            <img
              src={previewPhoto.url}
              alt={previewPhoto.name}
              style={{ width: '100%', height: 'auto' }}
            />
          )}
        </DialogContent>
        <DialogActions sx={{ bgcolor: COLORS.surface }}>
          <Button 
            color="error" 
            startIcon={<DeleteIcon />}
            onClick={() => {
              onPhotoDeleted(previewPhoto);
              setPreviewPhoto(null);
            }}
          >
            Delete
          </Button>
          <Button onClick={() => setPreviewPhoto(null)} sx={{ color: COLORS.text }}>
            Close
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

PhotoSection.propTypes = {
  jobId: PropTypes.string.isRequired,
  photos: PropTypes.arrayOf(PropTypes.shape({
    _id: PropTypes.string,
    name: PropTypes.string,
    url: PropTypes.string,
    thumbnailUrl: PropTypes.string,
    latitude: PropTypes.number,
  })).isRequired,
  onPhotoAdded: PropTypes.func.isRequired,
  onPhotoDeleted: PropTypes.func.isRequired,
};

/**
 * Documents Section - View/edit PDFs
 */
const DocumentsSection = ({ jobId: _jobId, documents, onNavigatePDF }) => {
  const COLORS = useAppColors();
  const editableDocs = documents.filter(d => 
    d.name?.endsWith('.pdf') || d.type === 'template'
  );

  return (
    <Box>
      <Typography sx={{ color: COLORS.textSecondary, fontWeight: 600, fontSize: '0.75rem', mb: 1 }}>
        FORMS & DOCUMENTS ({editableDocs.length})
      </Typography>

      {editableDocs.length === 0 ? (
        <Alert severity="info" sx={{ bgcolor: COLORS.surface }}>
          No documents available for this job yet.
        </Alert>
      ) : (
        <List sx={{ p: 0 }}>
          {editableDocs.map((doc, idx) => (
            <Card 
              key={doc._id || idx}
              sx={{ 
                bgcolor: COLORS.surface, 
                mb: 1.5, 
                border: `1px solid ${COLORS.border}`,
              }}
            >
              <ListItem 
                sx={{ cursor: 'pointer' }}
                onClick={() => onNavigatePDF(doc)}
              >
                <ListItemIcon>
                  <PictureAsPdfIcon sx={{ color: '#ff5252', fontSize: 32 }} />
                </ListItemIcon>
                <ListItemText
                  primary={
                    <Typography sx={{ color: COLORS.text, fontWeight: 600 }}>
                      {doc.name}
                    </Typography>
                  }
                  secondary={
                    <Typography sx={{ color: COLORS.textSecondary, fontSize: '0.75rem' }}>
                      {doc.isTemplate ? 'Template' : 'Uploaded'} • Tap to edit
                    </Typography>
                  }
                />
                <ListItemSecondaryAction>
                  <IconButton onClick={() => onNavigatePDF(doc)} aria-label="Edit document">
                    <EditIcon sx={{ color: COLORS.secondary }} />
                  </IconButton>
                </ListItemSecondaryAction>
              </ListItem>
            </Card>
          ))}
        </List>
      )}
    </Box>
  );
};

DocumentsSection.propTypes = {
  jobId: PropTypes.string.isRequired,
  documents: PropTypes.arrayOf(PropTypes.shape({
    _id: PropTypes.string,
    name: PropTypes.string,
    type: PropTypes.string,
    isTemplate: PropTypes.bool,
  })).isRequired,
  onNavigatePDF: PropTypes.func.isRequired,
};

/**
 * Units Section - Submit bid units for approval
 */
const UnitsSection = ({ jobId: _jobId, units, onNavigateUnits }) => {
  const COLORS = useAppColors();
  const pendingUnits = units.filter(u => u.status === 'pending');
  const approvedUnits = units.filter(u => u.status === 'approved');
  const totalValue = units.reduce((sum, u) => sum + (u.totalAmount || 0), 0);

  return (
    <Box>
      {/* Summary cards */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid size={6}>
          <Card sx={{ bgcolor: COLORS.surface, border: `1px solid ${COLORS.border}` }}>
            <CardContent sx={{ textAlign: 'center', py: 2 }}>
              <Typography sx={{ color: COLORS.primary, fontSize: '2rem', fontWeight: 700 }}>
                {units.length}
              </Typography>
              <Typography sx={{ color: COLORS.textSecondary, fontSize: '0.75rem' }}>
                Units Logged
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={6}>
          <Card sx={{ bgcolor: COLORS.surface, border: `1px solid ${COLORS.border}` }}>
            <CardContent sx={{ textAlign: 'center', py: 2 }}>
              <Typography sx={{ color: COLORS.success, fontSize: '1.5rem', fontWeight: 700 }}>
                ${totalValue.toLocaleString()}
              </Typography>
              <Typography sx={{ color: COLORS.textSecondary, fontSize: '0.75rem' }}>
                Total Value
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Status breakdown */}
      <Box sx={{ mb: 3 }}>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          <Chip
            icon={<AccessTimeIcon />}
            label={`${pendingUnits.length} Pending`}
            sx={{ bgcolor: `${COLORS.warning}20`, color: COLORS.warning }}
          />
          <Chip
            icon={<CheckCircleIcon />}
            label={`${approvedUnits.length} Approved`}
            sx={{ bgcolor: `${COLORS.success}20`, color: COLORS.success }}
          />
        </Box>
      </Box>

      {/* Action button */}
      <Button
        fullWidth
        variant="contained"
        startIcon={<ReceiptIcon />}
        onClick={onNavigateUnits}
        sx={{
          py: 2,
          bgcolor: COLORS.primary,
          color: COLORS.bg,
          fontWeight: 700,
          fontSize: '1rem',
          '&:hover': { bgcolor: COLORS.primaryDark },
        }}
      >
        Log New Unit
      </Button>

      {/* Recent units */}
      {units.length > 0 && (
        <Box sx={{ mt: 3 }}>
          <Typography sx={{ color: COLORS.textSecondary, fontWeight: 600, fontSize: '0.75rem', mb: 1 }}>
            RECENT ENTRIES
          </Typography>
          {units.slice(0, 5).map((unit, idx) => (
            <Card 
              key={unit._id || idx}
              sx={{ 
                bgcolor: COLORS.surface, 
                mb: 1, 
                border: `1px solid ${COLORS.border}`,
              }}
            >
              <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Box>
                    <Typography sx={{ color: COLORS.primary, fontWeight: 700 }}>
                      {unit.itemCode}
                    </Typography>
                    <Typography sx={{ color: COLORS.textSecondary, fontSize: '0.75rem' }}>
                      Qty: {unit.quantity} • ${unit.totalAmount?.toFixed(2)}
                    </Typography>
                  </Box>
                  <Chip
                    size="small"
                    label={unit.status}
                    sx={{
                      bgcolor: unit.status === 'approved' ? `${COLORS.success}20` : `${COLORS.warning}20`,
                      color: unit.status === 'approved' ? COLORS.success : COLORS.warning,
                      textTransform: 'capitalize',
                    }}
                  />
                </Box>
              </CardContent>
            </Card>
          ))}
        </Box>
      )}
    </Box>
  );
};

UnitsSection.propTypes = {
  jobId: PropTypes.string.isRequired,
  units: PropTypes.arrayOf(PropTypes.shape({
    _id: PropTypes.string,
    itemCode: PropTypes.string,
    quantity: PropTypes.number,
    totalAmount: PropTypes.number,
    status: PropTypes.string,
  })).isRequired,
  onNavigateUnits: PropTypes.func.isRequired,
};

/**
 * Tailboard Section - Safety briefing access
 */
const TailboardSection = ({ jobId: _jobId, tailboard, onNavigateTailboard }) => {
  const COLORS = useAppColors();
  const isComplete = tailboard?.status === 'completed';
  const crewCount = tailboard?.crewMembers?.length || 0;

  return (
    <Box>
      <Card sx={{ 
        bgcolor: COLORS.surface, 
        border: `1px solid ${isComplete ? COLORS.success : COLORS.warning}`,
        mb: 3,
      }}>
        <CardContent>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
            <Avatar sx={{ bgcolor: isComplete ? COLORS.success : COLORS.warning, width: 56, height: 56 }}>
              <ShieldIcon sx={{ fontSize: 32 }} />
            </Avatar>
            <Box>
              <Typography sx={{ color: COLORS.text, fontWeight: 700, fontSize: '1.25rem' }}>
                Daily Tailboard
              </Typography>
              <Typography sx={{ color: isComplete ? COLORS.success : COLORS.warning }}>
                {isComplete ? 'Completed' : 'Not Started'}
              </Typography>
            </Box>
          </Box>

          {tailboard && (
            <Box sx={{ mb: 2 }}>
              <Chip
                icon={<GroupsIcon />}
                label={`${crewCount} crew member${crewCount === 1 ? '' : 's'}`}
                sx={{ mr: 1, bgcolor: COLORS.surfaceLight, color: COLORS.text }}
              />
              {tailboard.hazardCount > 0 && (
                <Chip
                  label={`${tailboard.hazardCount} hazards identified`}
                  sx={{ bgcolor: `${COLORS.warning}20`, color: COLORS.warning }}
                />
              )}
            </Box>
          )}

          <Button
            fullWidth
            variant="contained"
            startIcon={isComplete ? <CheckCircleIcon /> : <ShieldIcon />}
            onClick={onNavigateTailboard}
            sx={{
              py: 1.5,
              bgcolor: isComplete ? COLORS.success : COLORS.warning,
              color: COLORS.bg,
              fontWeight: 700,
              '&:hover': { 
                bgcolor: isComplete ? COLORS.primaryDark : '#e69500',
              },
            }}
          >
            {isComplete ? 'View Tailboard' : 'Start Tailboard'}
          </Button>
        </CardContent>
      </Card>
    </Box>
  );
};

TailboardSection.propTypes = {
  jobId: PropTypes.string.isRequired,
  tailboard: PropTypes.shape({
    status: PropTypes.string,
    crewMembers: PropTypes.array,
    hazardCount: PropTypes.number,
  }),
  onNavigateTailboard: PropTypes.func.isRequired,
};

/**
 * LME Section - Daily Statement of Labor, Material, Equipment (PG&E format)
 */
const TimesheetSection = ({ jobId: _jobId, timesheet, onNavigateTimesheet }) => {
  const COLORS = useAppColors();
  const todayEntries = timesheet?.entries?.filter(e => {
    const entryDate = new Date(e.date).toDateString();
    return entryDate === new Date().toDateString();
  }) || [];

  const totalHours = todayEntries.reduce((sum, e) => sum + (e.hours || 0), 0);

  return (
    <Box>
      <Card sx={{ 
        bgcolor: COLORS.surface, 
        border: `1px solid ${COLORS.border}`,
        mb: 3,
      }}>
        <CardContent>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
            <Avatar sx={{ bgcolor: COLORS.secondary, width: 56, height: 56 }}>
              <AccessTimeIcon sx={{ fontSize: 32 }} />
            </Avatar>
            <Box>
              <Typography sx={{ color: COLORS.text, fontWeight: 700, fontSize: '1.25rem' }}>
                Daily LME
              </Typography>
              <Typography sx={{ color: COLORS.textSecondary }}>
                {todayEntries.length > 0 
                  ? `${totalHours} hrs logged today`
                  : 'Labor, Material & Equipment'
                }
              </Typography>
            </Box>
          </Box>

          <Button
            fullWidth
            variant="contained"
            startIcon={<AccessTimeIcon />}
            onClick={onNavigateTimesheet}
            sx={{
              py: 1.5,
              bgcolor: COLORS.secondary,
              color: COLORS.text,
              fontWeight: 700,
              '&:hover': { bgcolor: '#1565c0' },
            }}
          >
            Fill Out LME
          </Button>
        </CardContent>
      </Card>
    </Box>
  );
};

TimesheetSection.propTypes = {
  jobId: PropTypes.string.isRequired,
  timesheet: PropTypes.shape({
    entries: PropTypes.arrayOf(PropTypes.shape({
      date: PropTypes.string,
      hours: PropTypes.number,
    })),
  }),
  onNavigateTimesheet: PropTypes.func.isRequired,
};

/**
 * Main Foreman Close Out Component
 */
const ForemanCloseOut = () => {
  const COLORS = useAppColors();
  const { jobId } = useParams();
  const navigate = useNavigate();
  const { isOnline } = useOffline();

  // State
  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState(0);
  const [photos, setPhotos] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [units, setUnits] = useState([]);
  const [tailboard, setTailboard] = useState(null);
  const [timesheet, setTimesheet] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [showSubmitDialog, setShowSubmitDialog] = useState(false);
  
  // PDF Editor state
  const [pdfEditorOpen, setPdfEditorOpen] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState(null);
  const [filledPdfUrl, setFilledPdfUrl] = useState(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  
  // SmartForms templates
  const [smartFormTemplates, setSmartFormTemplates] = useState([]);
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);

  // Load job data
  useEffect(() => {
    const loadJob = async () => {
      try {
        setLoading(true);
        const res = await api.get(`/api/jobs/${jobId}`);
        const jobData = res.data;
        setJob(jobData);

        // Extract photos from GF Audit folder
        const aciFolder = jobData.folders?.find(f => f.name === 'ACI');
        const gfAuditFolder = aciFolder?.subfolders?.find(sf => sf.name === 'GF Audit');
        setPhotos(gfAuditFolder?.documents || []);

        // Extract editable documents from Pre-Field and General Forms
        const preFieldFolder = aciFolder?.subfolders?.find(sf => sf.name === 'Pre-Field Documents');
        const generalFormsFolder = aciFolder?.subfolders?.find(sf => sf.name === 'General Forms');
        const allDocs = [
          ...(preFieldFolder?.documents || []),
          ...(generalFormsFolder?.documents || []),
        ];
        setDocuments(allDocs);

        // Load units for this job
        try {
          const unitsRes = await api.get(`/api/billing/units?jobId=${jobId}`);
          // API returns array directly, not wrapped in { units: [] }
          setUnits(Array.isArray(unitsRes.data) ? unitsRes.data : []);
        } catch {
          setUnits([]);
        }

        // Load tailboard status (today's tailboard for this job)
        try {
          const tailboardRes = await api.get(`/api/tailboards/job/${jobId}/today`);
          setTailboard(tailboardRes.data || null);
        } catch {
          setTailboard(null);
        }

        // Load timesheet for this job
        try {
          const timesheetRes = await api.get(`/api/timesheets?jobId=${jobId}&limit=1`);
          // API returns first timesheet directly when limit=1, or array otherwise
          const data = timesheetRes.data;
          setTimesheet(Array.isArray(data) ? data[0] || null : data || null);
        } catch {
          setTimesheet(null);
        }

        // Load active SmartForms templates
        try {
          const templatesRes = await api.get('/api/smartforms/templates?status=active');
          setSmartFormTemplates(Array.isArray(templatesRes.data) ? templatesRes.data : []);
        } catch {
          setSmartFormTemplates([]);
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

  // Handlers
  const handlePhotoAdded = (photo) => {
    setPhotos(prev => [...prev, photo]);
  };

  const handlePhotoDeleted = async (photo) => {
    try {
      await api.delete(`/api/jobs/${jobId}/documents/${photo._id}`);
      setPhotos(prev => prev.filter(p => p._id !== photo._id));
    } catch (err) {
      console.error('Delete failed:', err);
    }
  };

  const handleNavigatePDF = (doc) => {
    // If we have SmartForms templates, show the template picker
    if (smartFormTemplates.length > 0) {
      setSelectedDocument(doc);
      setTemplatePickerOpen(true);
    } else {
      // No templates - open blank PDF editor
      setSelectedDocument(doc);
      setFilledPdfUrl(null);
      setPdfEditorOpen(true);
    }
  };
  
  // Fill template with job data and open editor
  const handleSelectTemplate = async (template) => {
    setTemplatePickerOpen(false);
    setPdfLoading(true);
    
    try {
      // Call SmartForms fill API to get pre-populated PDF
      const response = await api.post(
        `/api/smartforms/templates/${template._id}/fill`,
        { jobId },
        { responseType: 'blob' }
      );
      
      // Create blob URL for the filled PDF
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      
      setFilledPdfUrl(url);
      setPdfEditorOpen(true);
    } catch (err) {
      console.error('Failed to fill template:', err);
      setError('Failed to pre-fill form. Opening blank form instead.');
      // Fall back to opening the original document
      setFilledPdfUrl(null);
      setPdfEditorOpen(true);
    } finally {
      setPdfLoading(false);
    }
  };
  
  // Skip template and open blank document
  const handleSkipTemplate = () => {
    setTemplatePickerOpen(false);
    setFilledPdfUrl(null);
    setPdfEditorOpen(true);
  };
  
  const handlePdfSave = async (pdfBase64) => {
    try {
      // Convert base64 to bytes
      // IMPORTANT: Must use charCodeAt (not codePointAt) for binary data!
      // charCodeAt returns 0-255 byte values matching the decoded base64 bytes.
      // codePointAt returns Unicode code points which can exceed 255 for
      // multi-byte characters, causing data corruption when assigned to Uint8Array.
      // See: https://developer.mozilla.org/en-US/docs/Web/API/atob
      const binaryString = atob(pdfBase64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i); // NOSONAR: charCodeAt is correct for binary data
      }
      
      // Upload the edited PDF back to R2
      const formData = new FormData();
      const blob = new Blob([bytes], { type: 'application/pdf' });
      formData.append('file', blob, selectedDocument.name);
      formData.append('folder', 'ACI');
      formData.append('subfolder', 'Completed Forms');
      
      await api.post(`/api/jobs/${jobId}/files`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 180000, // 3 minutes for PDF uploads
      });
      
      setPdfEditorOpen(false);
      setSelectedDocument(null);
      
      // Reload job to get updated documents
      const res = await api.get(`/api/jobs/${jobId}`);
      const jobData = res.data;
      setJob(jobData);
      
      // Re-extract documents
      const aciFolder = jobData.folders?.find(f => f.name === 'ACI');
      const preFieldFolder = aciFolder?.subfolders?.find(sf => sf.name === 'Pre-Field Documents');
      const generalFormsFolder = aciFolder?.subfolders?.find(sf => sf.name === 'General Forms');
      const completedFormsFolder = aciFolder?.subfolders?.find(sf => sf.name === 'Completed Forms');
      const allDocs = [
        ...(preFieldFolder?.documents || []),
        ...(generalFormsFolder?.documents || []),
        ...(completedFormsFolder?.documents || []),
      ];
      setDocuments(allDocs);
    } catch (err) {
      console.error('Failed to save PDF:', err);
      setError('Failed to save document');
    }
  };
  
  const getDocumentUrl = (doc) => {
    if (doc.url) return doc.url;
    if (doc.r2Key) {
      const apiBase = import.meta.env.VITE_API_URL || 'https://api.fieldledger.io';
      return `${apiBase}/api/files/stream/${encodeURIComponent(doc.r2Key)}`;
    }
    return '';
  };

  const handleNavigateUnits = () => {
    navigate(`/jobs/${jobId}/log-unit`);
  };

  const handleNavigateTailboard = () => {
    navigate(`/jobs/${jobId}/tailboard`);
  };

  const handleNavigateTimesheet = () => {
    // Navigate to PG&E LME form (Daily Statement of Labor, Material, Equipment)
    navigate(`/jobs/${jobId}/lme`);
  };

  const handleSubmitForReview = async () => {
    setSubmitting(true);
    try {
      // Skip GF/QA review - go directly to PM for approval
      await api.put(`/api/jobs/${jobId}/status`, {
        status: 'pending_pm_approval',
      });
      setShowSubmitDialog(false);
      navigate('/dashboard', { state: { message: 'Job submitted for PM approval!' } });
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // Calculate completion status
  const completionStatus = {
    photos: photos.length >= 3,
    tailboard: tailboard?.status === 'completed',
    units: units.length > 0,
    documents: documents.some(d => d.signedDate),
  };
  const completionPercent = Object.values(completionStatus).filter(Boolean).length / 4 * 100;
  const canSubmit = completionPercent >= 50; // At least 50% complete

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
      <Box sx={{ 
        bgcolor: COLORS.surface, 
        px: 2, 
        py: 2,
        borderBottom: `1px solid ${COLORS.border}`,
        position: 'sticky',
        top: 0,
        zIndex: 10,
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <IconButton onClick={() => navigate(-1)} sx={{ color: COLORS.text, p: 0.5 }} aria-label="Go back">
              <BackIcon />
            </IconButton>
            <Box>
              <Typography sx={{ color: COLORS.text, fontWeight: 700, fontSize: '1.1rem' }}>
                Close Out Job
              </Typography>
              <Typography sx={{ color: COLORS.textSecondary, fontSize: '0.75rem' }}>
                {job?.woNumber || job?.jobNumber} • {job?.address?.slice(0, 30)}...
              </Typography>
            </Box>
            {/* Navigate to job button */}
            {job?.address && (
              <IconButton
                onClick={() => openDirections(job.address, job.city)}
                sx={{ 
                  color: COLORS.secondary,
                  bgcolor: `${COLORS.secondary}20`,
                  ml: 1,
                  '&:hover': { bgcolor: `${COLORS.secondary}40` }
                }}
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
            sx={{
              bgcolor: isOnline ? `${COLORS.success}20` : `${COLORS.warning}20`,
              color: isOnline ? COLORS.success : COLORS.warning,
            }}
          />
        </Box>

        {/* Progress bar */}
        <Box sx={{ mt: 2 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
            <Typography sx={{ color: COLORS.textSecondary, fontSize: '0.75rem' }}>
              Completion Progress
            </Typography>
            <Typography sx={{ color: COLORS.primary, fontWeight: 600, fontSize: '0.75rem' }}>
              {Math.round(completionPercent)}%
            </Typography>
          </Box>
          <LinearProgress 
            variant="determinate" 
            value={completionPercent}
            sx={{
              height: 8,
              borderRadius: 4,
              bgcolor: COLORS.surfaceLight,
              '& .MuiLinearProgress-bar': { bgcolor: COLORS.primary, borderRadius: 4 },
            }}
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
          '& .MuiTab-root': { 
            color: COLORS.textSecondary, 
            fontWeight: 600,
            minHeight: 56,
          },
          '& .Mui-selected': { color: COLORS.primary },
          '& .MuiTabs-indicator': { bgcolor: COLORS.primary },
        }}
      >
        <Tab icon={<CameraIcon />} label="Photos" iconPosition="start" />
        <Tab icon={<DescriptionIcon />} label="Docs" iconPosition="start" />
        <Tab icon={<ReceiptIcon />} label="Units" iconPosition="start" />
        <Tab icon={<ShieldIcon />} label="Safety" iconPosition="start" />
        <Tab icon={<AccessTimeIcon />} label="Time" iconPosition="start" />
      </Tabs>

      {/* Tab content */}
      <Box sx={{ p: 2 }}>
        <TabPanel value={activeTab} index={0}>
          <PhotoSection 
            jobId={jobId} 
            photos={photos} 
            onPhotoAdded={handlePhotoAdded}
            onPhotoDeleted={handlePhotoDeleted}
          />
        </TabPanel>

        <TabPanel value={activeTab} index={1}>
          <DocumentsSection 
            jobId={jobId} 
            documents={documents} 
            onNavigatePDF={handleNavigatePDF}
          />
        </TabPanel>

        <TabPanel value={activeTab} index={2}>
          <UnitsSection 
            jobId={jobId} 
            units={units} 
            onNavigateUnits={handleNavigateUnits}
          />
        </TabPanel>

        <TabPanel value={activeTab} index={3}>
          <TailboardSection 
            jobId={jobId} 
            tailboard={tailboard} 
            onNavigateTailboard={handleNavigateTailboard}
          />
        </TabPanel>

        <TabPanel value={activeTab} index={4}>
          <TimesheetSection 
            jobId={jobId} 
            timesheet={timesheet} 
            onNavigateTimesheet={handleNavigateTimesheet}
          />
        </TabPanel>
      </Box>

      {/* Submit FAB */}
      <Fab
        variant="extended"
        onClick={() => setShowSubmitDialog(true)}
        disabled={!canSubmit}
        sx={{
          position: 'fixed',
          bottom: 24,
          right: 24,
          bgcolor: canSubmit ? COLORS.primary : COLORS.border,
          color: COLORS.bg,
          fontWeight: 700,
          '&:hover': { bgcolor: COLORS.primaryDark },
          '&.Mui-disabled': { bgcolor: COLORS.border, color: COLORS.textSecondary },
        }}
      >
        <SendIcon sx={{ mr: 1 }} />
        Submit for Review
      </Fab>

      {/* Submit confirmation dialog */}
      <Dialog
        open={showSubmitDialog}
        onClose={() => setShowSubmitDialog(false)}
        PaperProps={{ sx: { bgcolor: COLORS.surface } }}
      >
        <DialogTitle sx={{ color: COLORS.text }}>
          Submit Job for GF Review?
        </DialogTitle>
        <DialogContent>
          <Typography sx={{ color: COLORS.textSecondary, mb: 2 }}>
            This will notify the General Foreman that this job is ready for review.
          </Typography>
          
          <Box sx={{ mb: 2 }}>
            <Typography sx={{ color: COLORS.text, fontWeight: 600, mb: 1 }}>
              Completion Checklist:
            </Typography>
            {[
              { label: 'Photos uploaded (3+ required)', done: completionStatus.photos },
              { label: 'Tailboard completed', done: completionStatus.tailboard },
              { label: 'Units logged', done: completionStatus.units },
              { label: 'Documents signed', done: completionStatus.documents },
            ].map((item) => (
              <Box key={item.label} sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                <CheckCircleIcon sx={{ 
                  color: item.done ? COLORS.success : COLORS.border,
                  fontSize: 20,
                }} />
                <Typography sx={{ 
                  color: item.done ? COLORS.text : COLORS.textSecondary,
                  fontSize: '0.875rem',
                }}>
                  {item.label}
                </Typography>
              </Box>
            ))}
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setShowSubmitDialog(false)} sx={{ color: COLORS.textSecondary }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleSubmitForReview}
            disabled={submitting}
            sx={{ bgcolor: COLORS.primary, color: COLORS.bg }}
          >
            {submitting ? <CircularProgress size={20} /> : 'Submit'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Template Picker Dialog */}
      <Dialog
        open={templatePickerOpen}
        onClose={() => setTemplatePickerOpen(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: { bgcolor: COLORS.surface, color: COLORS.text },
        }}
      >
        <DialogTitle sx={{ borderBottom: `1px solid ${COLORS.border}` }}>
          <Typography sx={{ fontWeight: 700 }}>
            Select Form Template
          </Typography>
          <Typography variant="body2" sx={{ color: COLORS.textSecondary, mt: 0.5 }}>
            Choose a template to auto-fill with job data
          </Typography>
        </DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          {pdfLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress sx={{ color: COLORS.primary }} />
            </Box>
          ) : (
            <List sx={{ p: 0 }}>
              {smartFormTemplates.map((template) => (
                <Card 
                  key={template._id}
                  sx={{ 
                    bgcolor: COLORS.surfaceLight, 
                    mb: 1.5, 
                    border: `1px solid ${COLORS.border}`,
                    cursor: 'pointer',
                    '&:hover': { borderColor: COLORS.primary },
                  }}
                  onClick={() => handleSelectTemplate(template)}
                >
                  <ListItem>
                    <ListItemIcon>
                      <PictureAsPdfIcon sx={{ color: COLORS.primary, fontSize: 32 }} />
                    </ListItemIcon>
                    <ListItemText
                      primary={
                        <Typography sx={{ color: COLORS.text, fontWeight: 600 }}>
                          {template.name}
                        </Typography>
                      }
                      secondary={
                        <Typography sx={{ color: COLORS.textSecondary, fontSize: '0.75rem' }}>
                          {template.description || template.category || 'SmartForm template'}
                        </Typography>
                      }
                    />
                    <Chip 
                      label="Auto-fill" 
                      size="small" 
                      sx={{ 
                        bgcolor: COLORS.primary, 
                        color: COLORS.bg,
                        fontWeight: 600,
                      }} 
                    />
                  </ListItem>
                </Card>
              ))}
            </List>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2, borderTop: `1px solid ${COLORS.border}` }}>
          <Button 
            onClick={handleSkipTemplate} 
            sx={{ color: COLORS.textSecondary }}
          >
            Skip - Open Blank Form
          </Button>
        </DialogActions>
      </Dialog>

      {/* PDF Editor Dialog */}
      <Dialog
        open={pdfEditorOpen}
        onClose={() => {
          setPdfEditorOpen(false);
          setSelectedDocument(null);
          // Clean up blob URL
          if (filledPdfUrl) {
            URL.revokeObjectURL(filledPdfUrl);
            setFilledPdfUrl(null);
          }
        }}
        fullScreen
        PaperProps={{
          sx: { bgcolor: COLORS.bg },
        }}
      >
        <Box sx={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'space-between',
          p: 1,
          borderBottom: `1px solid ${COLORS.border}`,
          bgcolor: COLORS.surface,
        }}>
          <Typography sx={{ color: COLORS.text, fontWeight: 600, ml: 1 }}>
            {selectedDocument?.name || 'Edit Document'}
          </Typography>
          <IconButton 
            onClick={() => {
              setPdfEditorOpen(false);
              setSelectedDocument(null);
            }}
            sx={{ color: COLORS.text }}
          >
            <CloseIcon />
          </IconButton>
        </Box>
        {selectedDocument && (
          <PDFFormEditor
            pdfUrl={filledPdfUrl || getDocumentUrl(selectedDocument)}
            jobInfo={{
              pmNumber: job?.pmNumber,
              woNumber: job?.woNumber,
              address: job?.address,
              city: job?.city,
            }}
            documentName={selectedDocument.name}
            onSave={handlePdfSave}
          />
        )}
        {pdfLoading && (
          <Box sx={{ 
            display: 'flex', 
            flexDirection: 'column',
            alignItems: 'center', 
            justifyContent: 'center', 
            height: '100%',
            gap: 2,
          }}>
            <CircularProgress sx={{ color: COLORS.primary }} />
            <Typography sx={{ color: COLORS.text }}>
              Pre-filling form with job data...
            </Typography>
          </Box>
        )}
      </Dialog>
    </Box>
  );
};

export default ForemanCloseOut;

