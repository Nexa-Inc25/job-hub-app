// src/components/JobFileSystem.js
import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../api';
import {
  Box,
  Typography,
  Autocomplete,
  TextField,
  Switch,
  FormControlLabel,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  ListItemIcon,
  CircularProgress,
  Alert,
  AppBar,
  Toolbar,
  Tooltip,
  Menu,
  MenuItem,
  Divider,
  Fab,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Badge,
} from '@mui/material';
import FolderIcon from '@mui/icons-material/Folder';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import AddIcon from '@mui/icons-material/Add';
import DownloadIcon from '@mui/icons-material/Download';
import SearchIcon from '@mui/icons-material/Search';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import VisibilityIcon from '@mui/icons-material/Visibility';
import DarkModeIcon from '@mui/icons-material/DarkMode';
import LightModeIcon from '@mui/icons-material/LightMode';
import CloseIcon from '@mui/icons-material/Close';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import CameraAltIcon from '@mui/icons-material/CameraAlt';
import PhotoLibraryIcon from '@mui/icons-material/PhotoLibrary';
import HomeIcon from '@mui/icons-material/Home';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import EmailIcon from '@mui/icons-material/Email';
import { SimpleTreeView } from '@mui/x-tree-view/SimpleTreeView';
import { TreeItem } from '@mui/x-tree-view/TreeItem';
import PDFFormEditor from './PDFFormEditor';
import FeedbackButton from './FeedbackButton';
import OfflineIndicator from './OfflineIndicator';
import OfflinePhotoCapture from './OfflinePhotoCapture';
import { useThemeMode } from '../ThemeContext';
import { useOffline } from '../hooks/useOffline';
import { alpha } from '@mui/material/styles';
import { red, blue } from '@mui/material/colors';

// Helper to parse user permissions from JWT token
const parseUserPermissions = (token) => {
  if (!token) return { isAdmin: false, canApprove: false };
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return {
      isAdmin: payload.isAdmin || false,
      canApprove: payload.canApprove || payload.isAdmin || ['gf', 'pm', 'admin'].includes(payload.role)
    };
  } catch {
    return { isAdmin: false, canApprove: false };
  }
};

// Helper to handle API errors and return error message
const getApiErrorMessage = (err, navigate) => {
  if (err.response?.status === 404) return 'Job not found';
  if (err.response?.status === 401) {
    localStorage.removeItem('token');
    navigate('/login');
    return 'Session expired. Please log in again.';
  }
  return err.response?.data?.error || err.message || 'Failed to fetch job data';
};

// Helper to find and select updated folder after upload/changes
const findUpdatedFolder = (jobData, selectedFolder) => {
  if (!selectedFolder || !jobData?.folders) return null;
  
  // Nested subfolder: e.g., ACI > Pre-Field Documents > Job Photos
  if (selectedFolder.grandParentFolder) {
    const grandParent = jobData.folders.find(f => f.name === selectedFolder.grandParentFolder);
    const parent = grandParent?.subfolders?.find(sf => sf.name === selectedFolder.parentFolder);
    const folder = parent?.subfolders?.find(nsf => nsf.name === selectedFolder.name);
    if (folder) {
      return { ...folder, parentFolder: selectedFolder.parentFolder, grandParentFolder: selectedFolder.grandParentFolder };
    }
  }
  // Direct subfolder: e.g., ACI > Photos  
  else if (selectedFolder.parentFolder) {
    const parent = jobData.folders.find(f => f.name === selectedFolder.parentFolder);
    const folder = parent?.subfolders?.find(sf => sf.name === selectedFolder.name);
    if (folder) {
      return { ...folder, parentFolder: selectedFolder.parentFolder };
    }
  }
  // Top-level folder
  else {
    const folder = jobData.folders.find(f => f.name === selectedFolder.name);
    if (folder) return folder;
  }
  
  return null;
};

// Helper to get subfolder path for uploads
const getSubfolderPath = (folder) => {
  if (folder?.grandParentFolder) {
    return `${folder.parentFolder}/${folder.name}`;
  }
  if (folder?.parentFolder) {
    return folder.name;
  }
  return null;
};

// Helper to get the root folder name for API calls
const getRootFolderName = (folder) => {
  return folder?.grandParentFolder || folder?.parentFolder || folder?.name;
};

// Helper to check if extraction polling should run
const shouldPollForExtraction = (job) => {
  if (!job) return false;
  if (job.aiExtractionComplete === true) return false;
  if (!job.aiExtractionStarted) return false;
  return true;
};

// Helper to fetch job data - extracted to reduce component complexity
const fetchJobDataHelper = async (id, navigate) => {
  const token = localStorage.getItem('token');
  if (!token) {
    return { error: 'No authentication token found. Please log in.' };
  }
  if (!id) {
    return { error: 'No job ID provided' };
  }
  
  try {
    const [jobResponse, jobsListResponse] = await Promise.all([
      api.get(`/api/jobs/${id}`),
      api.get('/api/jobs')
    ]);
    return { job: jobResponse.data, jobs: jobsListResponse.data };
  } catch (err) {
    console.error('Error fetching job data:', err);
    return { error: getApiErrorMessage(err, navigate) };
  }
};

// Handle job data load result - extracted to reduce component complexity
const handleJobLoadResult = (result, setters, cacheJob, getPendingPhotos, id) => {
  const { setError, setJob, setJobs, setSelectedFolder, setLoading, setPendingPhotos } = setters;
  
  if (result.error) {
    setError(result.error);
    setLoading(false);
    return;
  }
  
  setJob(result.job);
  setJobs(result.jobs);
  cacheJob(result.job);
  getPendingPhotos(id).then(photos => setPendingPhotos(photos));
  
  if (result.job.folders?.length > 0) {
    setSelectedFolder(result.job.folders[0]);
  }
  setLoading(false);
};

// Create polling function for extraction - extracted to reduce complexity
const createExtractionPoller = (jobId, setJob, updateJobInList) => {
  return async (intervalId) => {
    try {
      const response = await api.get(`/api/jobs/${jobId}`);
      if (response.data.aiExtractionComplete) {
        setJob(response.data);
        updateJobInList(response.data);
        clearInterval(intervalId);
      }
    } catch (err) {
      console.error('Error polling for extraction:', err);
      clearInterval(intervalId);
    }
  };
};

// Helper to upload files and refresh job data - extracted to reduce complexity
const uploadFilesAndRefresh = async (id, folderName, formData, selectedFolder, setters) => {
  const token = localStorage.getItem('token');
  await api.post(`/api/jobs/${id}/folders/${folderName}/upload`, formData, {
    headers: { Authorization: `Bearer ${token}` },
  });
  
  const response = await api.get(`/api/jobs/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  setters.setJob(response.data);
  
  const updatedFolder = findUpdatedFolder(response.data, selectedFolder);
  if (updatedFolder) {
    setters.setSelectedFolder(updatedFolder);
  } else {
    console.warn('Could not find updated folder, keeping current selection');
    setters.setSelectedFolder(prev => ({ ...prev, documents: [] }));
  }
};

// Helper to find and select a subfolder after job refresh
const selectSubfolderAfterRefresh = (jobData, parentFolderName, subfolderName, setSelectedFolder) => {
  const parentFolder = jobData.folders.find(f => f.name === parentFolderName);
  if (!parentFolder) return;
  const subfolder = parentFolder.subfolders?.find(sf => sf.name === subfolderName);
  if (subfolder) setSelectedFolder({ ...subfolder, parentFolder: parentFolderName });
};

// Helper to generate photo filename
const generatePhotoFilename = (job, prefix, extension) => {
  const timestamp = Date.now();
  const division = job?.division || 'DA';
  const pmNumber = job?.pmNumber || 'NOPM';
  return `${division}_${pmNumber}_${prefix}_${timestamp}.${extension}`;
};

// Helper to determine folder types - extracted to reduce component complexity
const getFolderTypes = (selectedFolder) => ({
  isPhotosFolder: selectedFolder?.name === 'Photos',
  isPreFieldFolder: selectedFolder?.name === 'Pre-Field Documents' || 
                    selectedFolder?.name === 'Job Photos' ||
                    selectedFolder?.parentFolder === 'Pre-Field Documents',
  isJobPhotosFolder: selectedFolder?.name === 'Job Photos',
  isGFAuditFolder: selectedFolder?.name === 'GF Audit'
});

// Helper to refresh job data after document operations - extracted to reduce complexity
const refreshJobAfterDocOperation = async (jobId, setJob, selectedFolder, setSelectedFolder, findFolderFn) => {
  const token = localStorage.getItem('token');
  const response = await api.get(`/api/jobs/${jobId}`, { headers: { Authorization: `Bearer ${token}` } });
  setJob(response.data);
  if (selectedFolder && findFolderFn) {
    const updatedFolder = findFolderFn(response.data.folders, selectedFolder.name);
    if (updatedFolder) setSelectedFolder(updatedFolder);
  }
  return response.data;
};

// Helper to handle document approval/rejection - extracted to reduce complexity
const handleDocumentApproval = async (jobId, docId, action, reason, setJob, selectedFolder, setSelectedFolder, findFolderFn, setApprovalLoading, setError) => {
  if (!docId) return;
  setApprovalLoading(docId);
  try {
    const endpoint = `/api/jobs/${jobId}/documents/${docId}/${action}`;
    const payload = action === 'reject' ? { reason } : undefined;
    await api.post(endpoint, payload);
    await refreshJobAfterDocOperation(jobId, setJob, selectedFolder, setSelectedFolder, findFolderFn);
  } catch (err) {
    console.error(`Error ${action}ing document:`, err);
    setError(err.response?.data?.error || `Failed to ${action} document`);
  } finally {
    setApprovalLoading(null);
  }
};

// Helper to delete a document and refresh - extracted to reduce complexity
const deleteDocumentAndRefresh = async (jobId, docId, folderInfo, setJob, selectedFolder, setSelectedFolder, setError) => {
  const token = localStorage.getItem('token');
  try {
    await api.delete(`/api/jobs/${jobId}/documents/${docId}`, {
      headers: { Authorization: `Bearer ${token}` },
      data: folderInfo
    });
  } catch (err) {
    // 404 is acceptable - document may already be deleted
    if (err.response?.status !== 404) {
      console.error('Error deleting document:', err);
      setError('Failed to delete document');
      throw err;
    }
    console.log('Document already deleted or not found, refreshing...');
  }
  // Always refresh to get current state
  const response = await api.get(`/api/jobs/${jobId}`, { headers: { Authorization: `Bearer ${token}` } });
  setJob(response.data);
  const updatedFolder = findUpdatedFolder(response.data, selectedFolder);
  if (updatedFolder) setSelectedFolder(updatedFolder);
};

// Generic photo upload handler factory - reduces code duplication
const createPhotoUploadHandler = (id, job, uploadEndpoint, subfolderName, setJob, setSelectedFolder, setError) => {
  return async (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const formData = new FormData();
    const prefix = subfolderName === 'GF Audit' ? 'GF_Audit' : 'PreField_Photo';
    
    Array.from(files).forEach((file) => {
      const ext = file.name.split('.').pop();
      const key = subfolderName ? 'files' : 'photos';
      formData.append(key, file, generatePhotoFilename(job, prefix, ext));
    });
    
    if (subfolderName) {
      formData.append('subfolder', subfolderName);
    }

    try {
      const token = localStorage.getItem('token');
      await api.post(uploadEndpoint, formData, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const response = await api.get(`/api/jobs/${id}`, { headers: { Authorization: `Bearer ${token}` } });
      setJob(response.data);
      selectSubfolderAfterRefresh(response.data, 'ACI', subfolderName || 'Photos', setSelectedFolder);
    } catch (err) {
      console.error(`${subfolderName || 'Photo'} upload error:`, err);
      setError('Photo upload failed');
    }
  };
};

const JobFileSystem = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { darkMode, toggleDarkMode } = useThemeMode();
  const { cacheJob, getPendingPhotos } = useOffline();
  const [jobs, setJobs] = useState([]);
  const [job, setJob] = useState(null);
  const [selectedFolder, setSelectedFolder] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewDetails, setViewDetails] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [anchorEl, setAnchorEl] = useState(null);
  const fileInputRef = useRef(null);
  const photoInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  
  // Admin/approval state
  const [isAdmin, setIsAdmin] = useState(false);
  const [canApprove, setCanApprove] = useState(false);
  const [createFolderOpen, setCreateFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderParent, setNewFolderParent] = useState('');
  const [isSubfolder, setIsSubfolder] = useState(false);
  const [approvalLoading, setApprovalLoading] = useState(null); // docId being approved/rejected
  
  // Offline photo capture
  const [photoCaptureOpen, setPhotoCaptureOpen] = useState(false);
  const [pendingPhotos, setPendingPhotos] = useState([]);
  const [deleteLoading, setDeleteLoading] = useState(false); // Prevent double-click deletes

  // Check user permissions from JWT
  useEffect(() => {
    const token = localStorage.getItem('token');
    const permissions = parseUserPermissions(token);
    setIsAdmin(permissions.isAdmin);
    setCanApprove(permissions.canApprove);
  }, []);

  useEffect(() => {
    const setters = { setError, setJob, setJobs, setSelectedFolder, setLoading, setPendingPhotos };
    fetchJobDataHelper(id, navigate).then(result => 
      handleJobLoadResult(result, setters, cacheJob, getPendingPhotos, id)
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Helper to update job in list
  const updateJobInList = useCallback((updatedJob) => {
    setJobs(prev => prev.map(j => j._id === updatedJob._id ? updatedJob : j));
  }, []);

  // Poll for extraction completion if extraction is actively in progress
  useEffect(() => {
    if (!shouldPollForExtraction(job)) return;

    const poller = createExtractionPoller(job._id, setJob, updateJobInList);
    const pollInterval = setInterval(() => poller(pollInterval), 5000);
    const timeout = setTimeout(() => clearInterval(pollInterval), 5 * 60 * 1000);
    
    return () => {
      clearInterval(pollInterval);
      clearTimeout(timeout);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?._id, job?.aiExtractionStarted, job?.aiExtractionComplete, updateJobInList]);

  const handleJobChange = (event, newValue) => {
    if (newValue) {
      navigate(`/jobs/${newValue._id}/files`);
    }
  };

  const handleFolderSelect = (folder) => {
    setSelectedFolder(folder);
  };

  const handleUploadClick = () => {
    fileInputRef.current.click();
  };

  const handleFileUpload = async (e) => {
    const files = e.target.files;
    if (!selectedFolder || files.length === 0) return;

    const formData = new FormData();
    Array.from(files).forEach((file) => formData.append('files', file));
    
    const subfolderPath = getSubfolderPath(selectedFolder);
    if (subfolderPath) formData.append('subfolder', subfolderPath);

    try {
      const folderName = getRootFolderName(selectedFolder);
      await uploadFilesAndRefresh(id, folderName, formData, selectedFolder, { setJob, setSelectedFolder });
    } catch (error_) {
      console.error('File upload error:', error_);
      setError('File upload failed');
    }
  };

  // Handle photo upload (from library or camera)
  const handlePhotoUpload = async (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const formData = new FormData();
    Array.from(files).forEach((file) => {
      const ext = file.name.split('.').pop();
      const prefix = `${job?.notificationNumber || 'NONOTIF'}_${job?.matCode || '2AA'}_Photo`;
      formData.append('photos', file, generatePhotoFilename(job, prefix, ext));
    });

    try {
      const token = localStorage.getItem('token');
      await api.post(`/api/jobs/${id}/photos`, formData, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const response = await api.get(`/api/jobs/${id}`, { headers: { Authorization: `Bearer ${token}` } });
      setJob(response.data);
      selectSubfolderAfterRefresh(response.data, 'ACI', 'Photos', setSelectedFolder);
    } catch (err) {
      console.error('Photo upload error:', err);
      setError('Photo upload failed');
    }
  };

  // Check folder types using extracted helper
  const { isPhotosFolder, isPreFieldFolder, isJobPhotosFolder, isGFAuditFolder } = getFolderTypes(selectedFolder);
  
  // State for export loading
  const [exportLoading, setExportLoading] = useState(false);
  
  // Refs for photo uploads
  const preFieldPhotoInputRef = useRef(null);
  const preFieldCameraInputRef = useRef(null);
  
  // Refs for GF Audit photo uploads
  const gfAuditPhotoInputRef = useRef(null);
  const gfAuditCameraInputRef = useRef(null);

  // Handle photo upload for GF Audit folder - using factory
  const handleGFAuditPhotoUpload = useMemo(
    () => createPhotoUploadHandler(id, job, `/api/jobs/${id}/folders/ACI/upload`, 'GF Audit', setJob, setSelectedFolder, setError),
    [id, job]
  );

  // Handle photo upload for Pre-Field Documents
  const handlePreFieldPhotoUpload = async (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const formData = new FormData();
    Array.from(files).forEach((file) => {
      const ext = file.name.split('.').pop();
      const timestamp = Date.now();
      const newName = `${job?.division || 'DA'}_${job?.pmNumber || 'NOPM'}_PreField_Photo_${timestamp}.${ext}`;
      formData.append('photos', file, newName);
    });

    try {
      const token = localStorage.getItem('token');
      await api.post(`/api/jobs/${id}/prefield-photos`, formData, {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      // Refresh job data
      const response = await api.get(`/api/jobs/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setJob(response.data);
      
      // Re-select the Job Photos folder to show new uploads
      const aciFolder = response.data.folders.find((f) => f.name === 'ACI');
      if (aciFolder) {
        const preFieldFolder = aciFolder.subfolders.find((sf) => sf.name === 'Pre-Field Documents');
        if (preFieldFolder?.subfolders) {
          const jobPhotosFolder = preFieldFolder.subfolders.find((sf) => sf.name === 'Job Photos');
          if (jobPhotosFolder) {
            setSelectedFolder({ ...jobPhotosFolder, parentFolder: 'Pre-Field Documents', grandParentFolder: 'ACI' });
          }
        }
      }
    } catch (err) {
      console.error('Pre-field photo upload error:', err);
      setError('Photo upload failed');
    }
  };

  // Handle GF Audit folder export to email
  const handleExportToEmail = async () => {
    if (!selectedFolder || !job) return;
    
    setExportLoading(true);
    try {
      const token = localStorage.getItem('token');
      const apiBase = process.env.REACT_APP_API_URL || 'https://api.jobhubpro.com';
      
      // Build the export URL with proper folder path
      let exportUrl = `${apiBase}/api/jobs/${job._id}/folders/${encodeURIComponent(getRootFolderName(selectedFolder))}/export`;
      
      // Add subfolder param if nested
      const subfolderPath = getSubfolderPath(selectedFolder);
      if (subfolderPath) {
        exportUrl += `?subfolder=${encodeURIComponent(subfolderPath)}`;
      }
      
      // Fetch the ZIP file
      const response = await fetch(exportUrl, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Export failed');
      }
      
      // Get the ZIP file as blob with explicit MIME type
      // Using arrayBuffer + explicit type ensures correct MIME type is preserved
      const arrayBuffer = await response.arrayBuffer();
      const blob = new Blob([arrayBuffer], { type: 'application/zip' });
      const filename = `${job.pmNumber || job.woNumber || 'Job'}_GF_Audit_${Date.now()}.zip`;
      const emailSubject = `GF Audit Photos - ${job.pmNumber || job.woNumber || 'Job'} - ${job.address || ''}`;
      const emailBody = `Hi,\n\nPlease find attached the GF Audit photos for:\n\nJob: ${job.pmNumber || job.woNumber || 'N/A'}\nAddress: ${job.address || 'N/A'}, ${job.city || ''}\n\nPlease let me know if you have any questions.\n\nBest regards`;
      
      // Try Web Share API first (works on mobile and some desktops)
      // This allows direct sharing to email apps with file attached
      if (navigator.canShare?.({ files: [new File([blob], filename, { type: 'application/zip' })] })) {
        try {
          const file = new File([blob], filename, { type: 'application/zip' });
          await navigator.share({
            title: emailSubject,
            text: emailBody,
            files: [file]
          });
          console.log('Shared via Web Share API');
          return; // Success - don't fall through to mailto
        } catch (error_) {
          // User cancelled or share failed - fall through to download + mailto
          if (error_.name !== 'AbortError') {
            console.log('Web Share failed, falling back to download:', error_.message);
          }
        }
      }
      
      // Fallback: Download ZIP and open mailto (user manually attaches)
      const downloadUrl = globalThis.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      globalThis.URL.revokeObjectURL(downloadUrl);
      
      // Open email client with pre-filled subject/body
      // Note: mailto cannot attach files - user must attach the downloaded ZIP
      const subject = encodeURIComponent(emailSubject);
      const body = encodeURIComponent(emailBody + `\n\nPlease attach the downloaded file: ${filename}`);
      globalThis.location.href = `mailto:?subject=${subject}&body=${body}`;
      
    } catch (err) {
      console.error('Export to email error:', err);
      setError(err.message || 'Failed to export folder');
    } finally {
      setExportLoading(false);
    }
  };

  // Context menu and PDF viewer state - must be declared before handlers that use them
  const [contextDoc, setContextDoc] = useState(null);
  const [pdfViewerOpen, setPdfViewerOpen] = useState(false);
  const [viewingDoc, setViewingDoc] = useState(null);
  const [editorMode, setEditorMode] = useState(false); // Toggle between view and edit mode
  const [imageViewerOpen, setImageViewerOpen] = useState(false);
  const [viewingImage, setViewingImage] = useState(null);

  const handleDocDownload = () => {
    if (contextDoc) {
      handleDownload(contextDoc);
    }
    handleCloseMenu();
  };

  const handlePreview = () => {
    if (contextDoc) {
      handleDocDoubleClick(contextDoc);
    }
    handleCloseMenu();
  };

  const handleDeleteDoc = async () => {
    if (!contextDoc || !job || deleteLoading) {
      handleCloseMenu();
      return;
    }
    if (!globalThis.confirm(`Are you sure you want to delete "${contextDoc.name}"?`)) {
      handleCloseMenu();
      return;
    }
    setDeleteLoading(true);
    try {
      const folderInfo = {
        folderName: selectedFolder?.parentFolder || selectedFolder?.name,
        subfolderName: selectedFolder?.parentFolder ? selectedFolder?.name : null
      };
      await deleteDocumentAndRefresh(job._id, contextDoc._id, folderInfo, setJob, selectedFolder, setSelectedFolder, setError);
    } catch {
      // Error already handled in helper
    } finally {
      setDeleteLoading(false);
      handleCloseMenu();
    }
  };

  const handleContextMenu = (event, doc) => {
    event.preventDefault();
    setAnchorEl(event.currentTarget);
    setContextDoc(doc);
  };

  const handleCloseMenu = () => {
    setAnchorEl(null);
  };

  // Approve a draft document - uses extracted helper
  const handleApproveDocument = (doc) => {
    handleDocumentApproval(job._id, doc?._id, 'approve', null, setJob, selectedFolder, setSelectedFolder, findFolderByName, setApprovalLoading, setError);
  };

  // Reject a draft document - uses extracted helper
  const handleRejectDocument = (doc, reason) => {
    const rejectReason = reason || globalThis.prompt('Enter rejection reason:');
    if (!rejectReason) return;
    handleDocumentApproval(job._id, doc?._id, 'reject', rejectReason, setJob, selectedFolder, setSelectedFolder, findFolderByName, setApprovalLoading, setError);
  };

  // Helper to find folder by name in nested structure
  const findFolderByName = (folders, name) => {
    for (const folder of folders) {
      if (folder.name === name) return folder;
      if (folder.subfolders) {
        const found = findFolderByName(folder.subfolders, name);
        if (found) return found;
      }
    }
    return null;
  };

  // Helper to render nested subfolder tree item (extracted to reduce nesting)
  const renderNestedSubfolder = (nestedSubfolder, subfolder, folder) => (
    <TreeItem
      key={`${folder.name}-${subfolder.name}-${nestedSubfolder.name}`}
      itemId={`${folder.name}-${subfolder.name}-${nestedSubfolder.name}`}
      label={
        <Box sx={{ display: 'flex', alignItems: 'center', width: '100%' }}>
          <FolderIcon sx={{ mr: 1, fontSize: '0.875rem', color: 'secondary.main' }} />
          <Typography sx={{ flexGrow: 1, fontSize: '0.8rem' }}>{nestedSubfolder.name}</Typography>
          <Chip 
            label={nestedSubfolder.documents?.length || 0} 
            size="small" 
            color="secondary"
            sx={{ height: 16, fontSize: '0.65rem' }} 
          />
        </Box>
      }
      onClick={(e) => {
        e.stopPropagation();
        handleFolderSelect({ 
          ...nestedSubfolder, 
          parentFolder: subfolder.name,
          grandParentFolder: folder.name
        });
      }}
    />
  );

  // Helper to render subfolder tree item (extracted to reduce nesting)
  const renderSubfolder = (subfolder, folder) => (
    <TreeItem 
      key={`${folder.name}-${subfolder.name}`} 
      itemId={`${folder.name}-${subfolder.name}`}
      label={
        <Box sx={{ display: 'flex', alignItems: 'center', width: '100%' }}>
          <FolderIcon sx={{ mr: 1, fontSize: '1rem' }} />
          <Typography sx={{ flexGrow: 1, fontSize: '0.875rem' }}>{subfolder.name}</Typography>
          <Chip 
            label={(subfolder.documents?.length || 0) + (subfolder.subfolders?.length || 0)} 
            size="small" 
            sx={{ mr: 1, height: 18, fontSize: '0.7rem' }} 
          />
          {isAdmin && (
            <IconButton
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                handleDeleteFolder(subfolder.name, folder.name);
              }}
              sx={{ p: 1, minWidth: 44, minHeight: 44, color: 'error.main' }}
              aria-label="Delete subfolder"
            >
              <DeleteIcon fontSize="small" />
            </IconButton>
          )}
        </Box>
      }
      onClick={(e) => {
        e.stopPropagation();
        handleFolderSelect({ ...subfolder, parentFolder: folder.name });
      }}
    >
      {subfolder.subfolders?.map((nestedSubfolder) => 
        renderNestedSubfolder(nestedSubfolder, subfolder, folder)
      )}
    </TreeItem>
  );

  // Get the correct URL for a document
  const getDocUrl = (doc) => {
    if (!doc) return '';
    // Use Railway backend URL directly for file access (Vercel proxy doesn't work for file streaming)
    const apiBase = process.env.REACT_APP_API_URL || 'https://api.jobhubpro.com';
    
    let resultUrl = '';
    
    // If URL is already a full URL (e.g., direct R2/Cloudflare worker URL), use as-is
    if (doc.url?.startsWith('http://') || doc.url?.startsWith('https://')) {
      resultUrl = doc.url;
    }
    // If it's a template, use the template URL
    else if (doc.url?.startsWith('/templates/')) {
      resultUrl = `${apiBase}${doc.url}`;
    }
    // If it's an uploaded file
    else if (doc.url?.startsWith('/uploads/')) {
      resultUrl = `${apiBase}${doc.url}`;
    }
    // If URL starts with /api/, prepend API base
    else if (doc.url?.startsWith('/api/')) {
      resultUrl = `${apiBase}${doc.url}`;
    }
    // If it has a path but no proper URL
    else if (doc.path) {
      const filename = doc.path.split('/').pop();
      if (doc.path.includes('templates')) {
        resultUrl = `${apiBase}/templates/master/${encodeURIComponent(doc.name)}`;
      } else {
        resultUrl = `${apiBase}/uploads/${filename}`;
      }
    }
    // If it's an R2 key, use the files endpoint
    else if (doc.r2Key) {
      resultUrl = `${apiBase}/api/files/${doc.r2Key}`;
    }
    else {
      resultUrl = doc.url || '';
    }
    
    
    return resultUrl;
  };

  // Admin: Create new folder
  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    
    try {
      const token = localStorage.getItem('token');
      await api.post(`/api/jobs/${job._id}/folders`, {
        folderName: newFolderName.trim(),
        parentFolder: isSubfolder ? newFolderParent : null,
        isSubfolder
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      // Refresh job data
      const response = await api.get(`/api/jobs/${job._id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setJob(response.data);
      
      // Reset form
      setNewFolderName('');
      setNewFolderParent('');
      setIsSubfolder(false);
      setCreateFolderOpen(false);
    } catch (err) {
      console.error('Error creating folder:', err);
      setError(err.response?.data?.error || 'Failed to create folder');
    }
  };

  // Admin: Delete folder
  const handleDeleteFolder = async (folderName, parentFolder = null) => {
    if (!globalThis.confirm(`Are you sure you want to delete the folder "${folderName}"? All documents inside will be removed.`)) {
      return;
    }
    
    try {
      const token = localStorage.getItem('token');
      await api.delete(`/api/jobs/${job._id}/folders/${encodeURIComponent(folderName)}`, {
        headers: { Authorization: `Bearer ${token}` },
        data: { parentFolder }
      });
      
      // Refresh job data
      const response = await api.get(`/api/jobs/${job._id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setJob(response.data);
      setSelectedFolder(response.data.folders[0] || null);
    } catch (err) {
      console.error('Error deleting folder:', err);
      setError(err.response?.data?.error || 'Failed to delete folder');
    }
  };

  // Handle double-click to open PDF viewer
  const handleDocDoubleClick = (doc) => {
    // Check if it's an image file
    const isImage = doc.name?.match(/\.(jpg|jpeg|png|gif|webp)$/i) || doc.type === 'image' || doc.type === 'photo' || doc.type === 'drawing' || doc.type === 'map';
    
    if (isImage) {
      // Open image in modal viewer
      setViewingImage(doc);
      setImageViewerOpen(true);
    } else {
      // Open PDF editor for PDFs
      setViewingDoc(doc);
      setEditorMode(true);
      setPdfViewerOpen(true);
    }
  };

  // Handle saving edited PDF
  const handleSaveEditedPdf = async (base64Data, documentName) => {
    try {
      const token = localStorage.getItem('token');
      await api.post(`/api/jobs/${id}/save-edited-pdf`, {
        pdfData: base64Data,
        originalName: documentName,
        folderName: selectedFolder?.parentFolder || selectedFolder?.name,
        subfolderName: selectedFolder?.parentFolder ? selectedFolder?.name : null,
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      
      // Refresh job data to show the new document
      const jobResponse = await api.get(`/api/jobs/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setJob(jobResponse.data);
      
      // Update selected folder
      const updatedFolder = findUpdatedFolder(jobResponse.data, selectedFolder);
      if (updatedFolder) {
        setSelectedFolder(updatedFolder);
      }
      
      return true;
    } catch (err) {
      console.error('Error saving edited PDF:', err);
      throw err;
    }
  };

  // Handle download
  const handleDownload = (doc) => {
    const url = getDocUrl(doc);
    if (url) {
      globalThis.open(url, '_blank');
    }
  };

  if (loading) return <CircularProgress />;
  if (error) return <Alert severity="error">{error}</Alert>;

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <AppBar position="static">
        <Toolbar>
          <Tooltip title="Back to Dashboard">
            <IconButton color="inherit" onClick={() => navigate('/dashboard')} sx={{ mr: 1 }} aria-label="Back to Dashboard">
              <HomeIcon />
            </IconButton>
          </Tooltip>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            Job File System
          </Typography>
          <Autocomplete
            options={jobs}
            getOptionLabel={(option) => option.title}
            value={job}
            onChange={handleJobChange}
            renderInput={(params) => <TextField {...params} id="job-selector" label="Select Job" variant="outlined" size="small" />}
            sx={{ width: 300, mr: 2 }}
          />
          <Tooltip title={darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}>
            <IconButton color="inherit" onClick={toggleDarkMode} sx={{ mr: 1 }} aria-label="Toggle dark mode">
              {darkMode ? <LightModeIcon /> : <DarkModeIcon />}
            </IconButton>
          </Tooltip>
          
          {/* Offline Status Indicator */}
          <OfflineIndicator color="inherit" />
          
          {/* Camera Capture Button */}
          <Tooltip title="Capture Photo">
            <IconButton 
              color="inherit" 
              onClick={() => setPhotoCaptureOpen(true)}
              sx={{ mr: 1 }}
              aria-label="Capture Photo"
            >
              <Badge badgeContent={pendingPhotos.length} color="warning" max={9}>
                <CameraAltIcon />
              </Badge>
            </IconButton>
          </Tooltip>
          
          {/* Feedback Button - Critical for Pilot */}
          <FeedbackButton color="inherit" jobId={id} />
          <FormControlLabel
            control={<Switch checked={viewDetails} onChange={() => setViewDetails(!viewDetails)} />}
            label={<Typography sx={{ fontWeight: 500 }}>View Details</Typography>}
          />
            {isAdmin && (
              <Button
                variant="contained"
                color="secondary"
                startIcon={<AddIcon />}
                onClick={() => setCreateFolderOpen(true)}
                sx={{ ml: 2 }}
              >
                New Folder
              </Button>
            )}
          </Toolbar>
        </AppBar>

        <Box sx={{ display: 'flex', height: 'calc(100vh - 64px)' }}>
          {/* Left: Tree View */}
          <Paper sx={{ width: 300, p: 2, overflowY: 'auto' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
              <SearchIcon sx={{ mr: 1 }} />
              <TextField
                id="search-folders-files"
                fullWidth
                size="small"
                placeholder="Search folders/files..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </Box>
            <SimpleTreeView
              slots={{ collapseIcon: ExpandMoreIcon, expandIcon: ChevronRightIcon }}
              defaultExpandedItems={['root', ...job.folders.map(f => f.name)]}
            >
              {/* Root: WO Number */}
              <TreeItem
                itemId="root"
                label={
                  <Box sx={{ display: 'flex', alignItems: 'center' }}>
                    <FolderIcon sx={{ mr: 1, color: 'primary.main' }} />
                    <Typography variant="subtitle1" fontWeight="bold">
                      {job.pmNumber || job.woNumber || 'Work Order'}
                    </Typography>
                  </Box>
                }
              >
                {job.folders
                  .filter((folder) => folder.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                    folder.subfolders?.some(sf => sf.name.toLowerCase().includes(searchQuery.toLowerCase())))
                  .map((folder) => (
                    <TreeItem
                      key={folder.name}
                      itemId={folder.name}
                      label={
                        <Box sx={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                          <FolderIcon sx={{ mr: 1, color: folder.name === 'ACI' ? 'success.main' : 'warning.main' }} />
                          <Typography sx={{ flexGrow: 1 }}>{folder.name}</Typography>
                          <Chip 
                            label={folder.documents?.length + (folder.subfolders?.reduce((acc, sf) => acc + (sf.documents?.length || 0), 0) || 0)} 
                            size="small" 
                            sx={{ mr: 1 }} 
                          />
                          {isAdmin && folder.name !== 'ACI' && folder.name !== 'UTC' && (
                            <IconButton
                              size="small"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteFolder(folder.name);
                              }}
                              sx={{ p: 0.5, color: 'error.main' }}
                              aria-label="Delete folder"
                            >
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          )}
                        </Box>
                      }
                      onClick={() => handleFolderSelect({ ...folder, isParent: true })}
                    >
                      {folder.subfolders?.map((subfolder) => renderSubfolder(subfolder, folder))}
                    </TreeItem>
                  ))}
              </TreeItem>
            </SimpleTreeView>
          </Paper>

          {/* Right: Folder Details */}
          <Box sx={{ flexGrow: 1, p: 4, overflowY: 'auto' }}>
            {selectedFolder ? (
              <>
                <Typography variant="h5" sx={{ mb: 2, textAlign: 'center', color: 'primary.main', fontWeight: 500 }}>
                  {selectedFolder.name}
                </Typography>
                
                {/* Photo Upload Buttons - Only show for Photos folder */}
                {isPhotosFolder && (
                  <Paper sx={{ p: 2, mb: 2, display: 'flex', gap: 2, justifyContent: 'center', flexWrap: 'wrap' }}>
                    <Button
                      variant="contained"
                      color="primary"
                      startIcon={<CameraAltIcon />}
                      onClick={() => cameraInputRef.current?.click()}
                    >
                      Take Photo
                    </Button>
                    <Button
                      variant="outlined"
                      color="primary"
                      startIcon={<PhotoLibraryIcon />}
                      onClick={() => photoInputRef.current?.click()}
                    >
                      Upload from Library
                    </Button>
                    <input
                      id="photos-camera-input"
                      name="photos-camera"
                      ref={cameraInputRef}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      multiple
                      onChange={handlePhotoUpload}
                      style={{ display: 'none' }}
                    />
                    <input
                      id="photos-library-input"
                      name="photos-library"
                      ref={photoInputRef}
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={handlePhotoUpload}
                      style={{ display: 'none' }}
                    />
                  </Paper>
                )}
                
                {/* Pre-Field Documents Actions - Photo Upload */}
                {(isPreFieldFolder || isJobPhotosFolder) && (
                  <Paper sx={{ p: 2, mb: 2, display: 'flex', gap: 2, justifyContent: 'center', flexWrap: 'wrap', flexDirection: 'column', alignItems: 'center' }}>
                    <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
                      Upload Job Photos
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', justifyContent: 'center' }}>
                      <Button
                        variant="contained"
                        color="primary"
                        startIcon={<CameraAltIcon />}
                        onClick={() => preFieldCameraInputRef.current?.click()}
                      >
                        Take Photo
                      </Button>
                      <Button
                        variant="outlined"
                        color="primary"
                        startIcon={<PhotoLibraryIcon />}
                        onClick={() => preFieldPhotoInputRef.current?.click()}
                      >
                        Upload from Library
                      </Button>
                    </Box>
                    
                    {job?.aiExtractionComplete && (
                      <Alert severity="info" sx={{ mt: 2, width: '100%' }}>
                        Photos, drawings, and maps have been automatically extracted from the job package PDF
                      </Alert>
                    )}
                    
                    <input
                      id="prefield-camera-input"
                      name="prefield-camera"
                      ref={preFieldCameraInputRef}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      multiple
                      onChange={handlePreFieldPhotoUpload}
                      style={{ display: 'none' }}
                    />
                    <input
                      id="prefield-library-input"
                      name="prefield-library"
                      ref={preFieldPhotoInputRef}
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={handlePreFieldPhotoUpload}
                      style={{ display: 'none' }}
                    />
                  </Paper>
                )}
                
                {/* GF Audit Folder Actions - Upload & Export to Email */}
                {isGFAuditFolder && (
                  <Paper sx={{ p: 2, mb: 2, display: 'flex', gap: 2, justifyContent: 'center', flexWrap: 'wrap', flexDirection: 'column', alignItems: 'center', bgcolor: 'primary.light', color: 'primary.contrastText' }}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>
                      📋 GF Audit - Pre-Field Photos
                    </Typography>
                    <Typography variant="body2" sx={{ mb: 1, opacity: 0.9 }}>
                      Upload photos taken during pre-fielding, then export to email your Project Coordinator
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', justifyContent: 'center' }}>
                      <Button
                        variant="contained"
                        color="secondary"
                        startIcon={<CameraAltIcon />}
                        onClick={() => gfAuditCameraInputRef.current?.click()}
                      >
                        Take Photo
                      </Button>
                      <Button
                        variant="outlined"
                        sx={{ bgcolor: 'white', '&:hover': { bgcolor: 'grey.100' } }}
                        startIcon={<PhotoLibraryIcon />}
                        onClick={() => gfAuditPhotoInputRef.current?.click()}
                      >
                        Upload from Library
                      </Button>
                      <Button
                        variant="contained"
                        color="success"
                        startIcon={exportLoading ? <CircularProgress size={20} color="inherit" /> : <EmailIcon />}
                        onClick={handleExportToEmail}
                        disabled={exportLoading || !selectedFolder?.documents?.length}
                      >
                        {exportLoading ? 'Exporting...' : 'Export to Email'}
                      </Button>
                    </Box>
                    {selectedFolder?.documents?.length > 0 && (
                      <Chip 
                        label={`${selectedFolder.documents.length} photo${selectedFolder.documents.length === 1 ? '' : 's'} ready to export`}
                        color="success"
                        sx={{ mt: 1 }}
                      />
                    )}
                    
                    {/* Hidden file inputs for GF Audit */}
                    <input
                      id="gf-audit-camera-input"
                      name="gf-audit-camera"
                      ref={gfAuditCameraInputRef}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      multiple
                      onChange={handleGFAuditPhotoUpload}
                      style={{ display: 'none' }}
                    />
                    <input
                      id="gf-audit-library-input"
                      name="gf-audit-library"
                      ref={gfAuditPhotoInputRef}
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={handleGFAuditPhotoUpload}
                      style={{ display: 'none' }}
                    />
                  </Paper>
                )}
                <TableContainer>
                  <Table size="small" aria-label="documents table">
                    <TableHead>
                      <TableRow>
                        <TableCell>Name</TableCell>
                        <TableCell>Date</TableCell>
                        <TableCell>Actions</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {selectedFolder.documents.length > 0 ? (
                        selectedFolder.documents.map((doc, idx) => {
                          return (
                          <TableRow
                            key={doc.url || doc.name + idx}
                            onContextMenu={(e) => handleContextMenu(e, doc)}
                            onDoubleClick={() => handleDocDoubleClick(doc)}
                            sx={{ 
                              '&:hover': { bgcolor: alpha(blue[50], 0.5), cursor: 'pointer' },
                              cursor: 'pointer',
                              // Highlight draft documents
                              ...(doc.approvalStatus === 'pending_approval' && {
                                bgcolor: alpha('#FFA726', 0.1),
                                borderLeft: '3px solid #FFA726'
                              }),
                              ...(doc.approvalStatus === 'approved' && {
                                bgcolor: alpha('#66BB6A', 0.05)
                              })
                            }}
                          >
                            <TableCell>
                              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                <ListItemIcon sx={{ minWidth: 30, display: 'inline-flex' }}>
                                  <InsertDriveFileIcon fontSize="small" color={doc.isTemplate ? 'primary' : 'action'} />
                                </ListItemIcon>
                                <Box>
                                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <Typography variant="body2">{doc.name}</Typography>
                                    {/* Approval status badges */}
                                    {doc.approvalStatus === 'pending_approval' && (
                                      <Chip 
                                        label="DRAFT" 
                                        size="small" 
                                        color="warning" 
                                        sx={{ height: 20, fontSize: '0.65rem', fontWeight: 'bold' }}
                                      />
                                    )}
                                    {doc.approvalStatus === 'approved' && (
                                      <Chip 
                                        label="APPROVED" 
                                        size="small" 
                                        color="success" 
                                        sx={{ height: 20, fontSize: '0.65rem' }}
                                      />
                                    )}
                                    {doc.approvalStatus === 'rejected' && (
                                      <Chip 
                                        label="REJECTED" 
                                        size="small" 
                                        color="error" 
                                        sx={{ height: 20, fontSize: '0.65rem' }}
                                      />
                                    )}
                                  </Box>
                                  <Typography variant="caption" color="text.secondary">
                                    {doc.approvalStatus === 'pending_approval' 
                                      ? 'Awaiting approval • Double-click to review'
                                      : 'Double-click to open'}
                                  </Typography>
                                </Box>
                              </Box>
                            </TableCell>
                            <TableCell>{doc.uploadDate ? new Date(doc.uploadDate).toLocaleString() : '-'}</TableCell>
                            <TableCell>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                <Tooltip title="Open">
                                  <IconButton size="medium" onClick={() => handleDocDoubleClick(doc)} aria-label="Open document" sx={{ minWidth: 44, minHeight: 44 }}>
                                    <VisibilityIcon />
                                  </IconButton>
                                </Tooltip>
                                <Tooltip title="Download">
                                  <IconButton size="medium" onClick={() => handleDownload(doc)} aria-label="Download document" sx={{ minWidth: 44, minHeight: 44 }}>
                                    <DownloadIcon />
                                  </IconButton>
                                </Tooltip>
                                
                                {/* Approval buttons for GF/PM/Admin */}
                                {doc.approvalStatus === 'pending_approval' && canApprove && (
                                  <>
                                    <Tooltip title="Approve document">
                                      <IconButton 
                                        size="small" 
                                        color="success"
                                        onClick={(e) => { e.stopPropagation(); handleApproveDocument(doc); }}
                                        disabled={approvalLoading === doc._id}
                                        aria-label="Approve document"
                                      >
                                        {approvalLoading === doc._id ? (
                                          <CircularProgress size={16} />
                                        ) : (
                                          <CheckCircleIcon fontSize="small" />
                                        )}
                                      </IconButton>
                                    </Tooltip>
                                    <Tooltip title="Reject document">
                                      <IconButton 
                                        size="small" 
                                        color="error"
                                        onClick={(e) => { e.stopPropagation(); handleRejectDocument(doc); }}
                                        disabled={approvalLoading === doc._id}
                                        aria-label="Reject document"
                                      >
                                        <CancelIcon fontSize="small" />
                                      </IconButton>
                                    </Tooltip>
                                  </>
                                )}
                                
                                <Tooltip title="More options">
                                  <IconButton size="medium" onClick={(e) => handleContextMenu(e, doc)} aria-label="More options" sx={{ minWidth: 44, minHeight: 44 }}>
                                    <MoreVertIcon />
                                  </IconButton>
                                </Tooltip>
                              </Box>
                            </TableCell>
                          </TableRow>
                          );
                        })
                      ) : (
                        <TableRow>
                          <TableCell colSpan={3} align="center">
                            Drop files here or click to upload
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </TableContainer>
              </>
            ) : (
              <Typography color="text.secondary" sx={{ textAlign: 'center', mt: 10 }}>
                Select a folder to view or drop files to upload
              </Typography>
            )}
          </Box>

          {/* Floating Action Button for quick upload */}
          <Fab color="primary" aria-label="add" sx={{ position: 'fixed', bottom: 32, right: 32 }} onClick={handleUploadClick}>
            <AddIcon />
          </Fab>
          <input
            id="file-upload-input"
            name="file-upload"
            type="file"
            ref={fileInputRef}
            style={{ display: 'none' }}
            multiple
            onChange={handleFileUpload}
          />

          {/* Context Menu */}
          <Menu
            anchorEl={anchorEl}
            open={Boolean(anchorEl)}
            onClose={handleCloseMenu}
            slotProps={{ paper: { style: { width: 200 } } }}
          >
            <MenuItem onClick={handlePreview}>
              <VisibilityIcon sx={{ mr: 1 }} /> Open / Edit
            </MenuItem>
            <MenuItem onClick={handleDocDownload}>
              <DownloadIcon sx={{ mr: 1 }} /> Download
            </MenuItem>
            <Divider />
            <MenuItem onClick={handleDeleteDoc} sx={{ color: red[500] }}>
              <DeleteIcon sx={{ mr: 1 }} /> Delete
            </MenuItem>
          </Menu>
        </Box>

        {/* PDF Viewer/Editor Dialog - fullScreen on mobile/tablet */}
        <Dialog
          open={pdfViewerOpen}
          onClose={() => {
            setPdfViewerOpen(false);
            setEditorMode(false);
          }}
          maxWidth="xl"
          fullWidth
          fullScreen={globalThis.innerWidth < 1024}
          slotProps={{ 
            paper: { 
            sx: {
                height: { xs: '100vh', md: '95vh' }, 
                maxHeight: { xs: '100vh', md: '95vh' },
                width: '100%'
              } 
            }
          }}
        >
          <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <InsertDriveFileIcon color="primary" />
              <Typography variant="h6">{viewingDoc?.name || 'Document'}</Typography>
              {viewingDoc?.isTemplate && (
                <Chip label="Template" size="small" color="primary" />
              )}
              <Chip 
                label={editorMode ? "Edit Mode" : "View Mode"} 
                size="small" 
                color={editorMode ? "success" : "default"}
              />
            </Box>
            <Box>
              <Button
                variant={editorMode ? "outlined" : "contained"}
                size="small"
                startIcon={<EditIcon />}
                onClick={() => setEditorMode(!editorMode)}
                sx={{ mr: 1 }}
              >
                {editorMode ? 'View Only' : 'Edit & Fill'}
              </Button>
              <Tooltip title="Download Original">
                <IconButton onClick={() => viewingDoc && handleDownload(viewingDoc)} aria-label="Download">
                  <DownloadIcon />
                </IconButton>
              </Tooltip>
              <Tooltip title="Close">
                <IconButton onClick={() => {
                  setPdfViewerOpen(false);
                  setEditorMode(false);
                }} aria-label="Close">
                  <CloseIcon />
                </IconButton>
              </Tooltip>
            </Box>
          </DialogTitle>
          <DialogContent sx={{ p: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {editorMode ? (
              /* PDF Editor Mode */
              <Box sx={{ flex: 1, p: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                <PDFFormEditor
                  pdfUrl={getDocUrl(viewingDoc)}
                  jobInfo={{
                    pmNumber: job?.pmNumber,
                    woNumber: job?.woNumber,
                    notificationNumber: job?.notificationNumber,
                    address: job?.address,
                    city: job?.city,
                    client: job?.client,
                  }}
                  documentName={viewingDoc?.name}
                  onSave={handleSaveEditedPdf}
                />
              </Box>
            ) : (
              /* View Only Mode */
              <>
                {/* Job Info Banner for Templates */}
                {viewingDoc?.isTemplate && job && (
                  <Paper sx={{ p: 2, m: 2, mb: 0, bgcolor: 'primary.light', color: 'primary.contrastText' }}>
                    <Typography variant="subtitle2" gutterBottom>Job Information:</Typography>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
                      <Typography variant="body2"><strong>PM#:</strong> {job.pmNumber || 'N/A'}</Typography>
                      <Typography variant="body2"><strong>WO#:</strong> {job.woNumber || 'N/A'}</Typography>
                      <Typography variant="body2"><strong>Notification:</strong> {job.notificationNumber || 'N/A'}</Typography>
                      <Typography variant="body2"><strong>Address:</strong> {job.address || 'N/A'}, {job.city || ''}</Typography>
                      <Typography variant="body2"><strong>Client:</strong> {job.client || 'N/A'}</Typography>
                    </Box>
                  </Paper>
                )}
                {/* PDF Embed */}
                <Box sx={{ flex: 1, p: 2 }}>
                  {viewingDoc && (
                    <iframe
                      src={getDocUrl(viewingDoc)}
                      style={{
                        width: '100%',
                        height: '100%',
                        border: 'none',
                        borderRadius: '8px',
                        minHeight: '600px'
                      }}
                      title={viewingDoc.name}
                    />
                  )}
                </Box>
              </>
            )}
          </DialogContent>
          {!editorMode && (
            <DialogActions sx={{ p: 2, borderTop: '1px solid', borderColor: 'divider' }}>
              <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>
                Click "Edit & Fill" to add text and checkmarks to this document
              </Typography>
              <Button onClick={() => {
                setPdfViewerOpen(false);
                setEditorMode(false);
              }}>Close</Button>
              <Button 
                variant="contained" 
                startIcon={<EditIcon />}
                onClick={() => setEditorMode(true)}
              >
                Edit & Fill Form
              </Button>
            </DialogActions>
          )}
        </Dialog>

        {/* Image Viewer Dialog */}
        <Dialog
          open={imageViewerOpen}
          onClose={() => {
            setImageViewerOpen(false);
            setViewingImage(null);
          }}
          maxWidth="lg"
          fullWidth
          slotProps={{ paper: { sx: { bgcolor: 'black', maxHeight: '95vh' } } }}
        >
          <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 1, bgcolor: 'rgba(0,0,0,0.8)', color: 'white' }}>
            <Typography variant="h6">{viewingImage?.name || 'Image'}</Typography>
            <Box>
              <Tooltip title="Download">
                <IconButton onClick={() => viewingImage && handleDownload(viewingImage)} sx={{ color: 'white' }} aria-label="Download">
                  <DownloadIcon />
                </IconButton>
              </Tooltip>
              <Tooltip title="Close">
                <IconButton onClick={() => {
                  setImageViewerOpen(false);
                  setViewingImage(null);
                }} sx={{ color: 'white' }} aria-label="Close">
                  <CloseIcon />
                </IconButton>
              </Tooltip>
            </Box>
          </DialogTitle>
          <DialogContent sx={{ p: 0, display: 'flex', justifyContent: 'center', alignItems: 'center', bgcolor: 'black', minHeight: '60vh' }}>
            {viewingImage && (
              <img
                src={getDocUrl(viewingImage)}
                alt={viewingImage.name}
                style={{
                  maxWidth: '100%',
                  maxHeight: '80vh',
                  objectFit: 'contain',
                }}
                onError={(e) => {
                  console.error('Image failed to load:', getDocUrl(viewingImage));
                  e.target.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><text x="50%" y="50%" text-anchor="middle" fill="white">Failed to load image</text></svg>';
                }}
              />
            )}
          </DialogContent>
        </Dialog>

        {/* Admin: Create Folder Dialog */}
        <Dialog open={createFolderOpen} onClose={() => setCreateFolderOpen(false)} maxWidth="sm" fullWidth>
          <DialogTitle>Create New Folder</DialogTitle>
          <DialogContent>
            <Box sx={{ pt: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <TextField
                id="new-folder-name"
                fullWidth
                label="Folder Name"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder="e.g., Safety Documents"
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={isSubfolder}
                    onChange={(e) => setIsSubfolder(e.target.checked)}
                  />
                }
                label="Create as subfolder"
              />
              {isSubfolder && (
                <Autocomplete
                  options={job?.folders?.map(f => f.name) || []}
                  value={newFolderParent}
                  onChange={(e, val) => setNewFolderParent(val || '')}
                  renderInput={(params) => (
                    <TextField {...params} id="parent-folder-select" label="Parent Folder" placeholder="Select parent folder" />
                  )}
                />
              )}
            </Box>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => {
              setCreateFolderOpen(false);
              setNewFolderName('');
              setNewFolderParent('');
              setIsSubfolder(false);
            }}>
              Cancel
            </Button>
            <Button 
              variant="contained" 
              onClick={handleCreateFolder}
              disabled={!newFolderName.trim() || (isSubfolder && !newFolderParent)}
            >
              Create Folder
            </Button>
          </DialogActions>
        </Dialog>
        
        {/* Offline Photo Capture Dialog */}
        <OfflinePhotoCapture
          open={photoCaptureOpen}
          onClose={() => setPhotoCaptureOpen(false)}
          jobId={id}
          folders={job?.folders || []}
          onPhotoSaved={(photoData) => {
            // Add to pending photos list
            setPendingPhotos(prev => [...prev, photoData]);
          }}
        />
      </Box>
  );
};

export default JobFileSystem;
