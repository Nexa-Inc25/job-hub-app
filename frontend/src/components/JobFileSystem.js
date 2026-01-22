// src/components/JobFileSystem.js
import React, { useEffect, useState, useRef } from 'react';
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
import { TreeView, TreeItem } from '@mui/x-tree-view';
import PDFFormEditor from './PDFFormEditor';
import { useThemeMode } from '../ThemeContext';
import { alpha } from '@mui/material/styles';
import { red, blue } from '@mui/material/colors';

const JobFileSystem = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { darkMode, toggleDarkMode } = useThemeMode();
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
  
  // Admin state
  const [isAdmin, setIsAdmin] = useState(false);
  const [createFolderOpen, setCreateFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderParent, setNewFolderParent] = useState('');
  const [isSubfolder, setIsSubfolder] = useState(false);

  // Check if user is admin
  useEffect(() => {
    const checkAdmin = async () => {
      const token = localStorage.getItem('token');
      if (!token) return;
      try {
        const response = await api.get('/api/user/me', {
          headers: { Authorization: `Bearer ${token}` }
        });
        setIsAdmin(response.data.isAdmin || false);
      } catch (err) {
        console.log('Could not fetch user info');
      }
    };
    checkAdmin();
  }, []);

  useEffect(() => {
    const fetchJobs = async () => {
      const token = localStorage.getItem('token');
      if (!token) {
        setError('No authentication token found. Please log in.');
        setLoading(false);
        return;
      }
      try {
        const response = await api.get('/api/jobs', {
          headers: { Authorization: `Bearer ${token}` },
        });
        setJobs(response.data);
        const currentJob = response.data.find((j) => j._id === id);
        if (currentJob) {
          setJob(currentJob);
          setSelectedFolder(currentJob.folders[0]); // Select first folder by default
        } else {
          setError('Job not found');
        }
      } catch (err) {
        setError(err.response?.data?.error || 'Failed to fetch jobs');
      } finally {
        setLoading(false);
      }
    };
    fetchJobs();
  }, [id]);

  // Poll for extraction completion if not yet complete
  useEffect(() => {
    if (!job || job.aiExtractionComplete) return;
    
    const pollInterval = setInterval(async () => {
      try {
        const token = localStorage.getItem('token');
        const response = await api.get(`/api/jobs/${job._id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const updatedJob = response.data;
        
        if (updatedJob.aiExtractionComplete) {
          console.log('Extraction complete, refreshing job data');
          setJob(updatedJob);
          // Update jobs list too
          setJobs(prev => prev.map(j => j._id === updatedJob._id ? updatedJob : j));
          clearInterval(pollInterval);
        }
      } catch (err) {
        console.error('Error polling for extraction:', err);
      }
    }, 3000); // Poll every 3 seconds
    
    return () => clearInterval(pollInterval);
  }, [job?._id, job?.aiExtractionComplete]);

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
    
    // If this is a subfolder, include the subfolder name
    if (selectedFolder.parentFolder) {
      formData.append('subfolder', selectedFolder.name);
    }

    try {
      const token = localStorage.getItem('token');
      const folderName = selectedFolder.parentFolder || selectedFolder.name;
      await api.post(`/api/jobs/${id}/folders/${folderName}/upload`, formData, {
        headers: { Authorization: `Bearer ${token}` },
      });
      // Refresh job data
      const response = await api.get(`/api/jobs/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setJob(response.data);
      
      // Re-select the folder to show updated documents
      if (selectedFolder.parentFolder) {
        const parentFolder = response.data.folders?.find((f) => f.name === selectedFolder.parentFolder);
        const updatedSubfolder = parentFolder?.subfolders?.find((sf) => sf.name === selectedFolder.name);
        if (updatedSubfolder) {
          setSelectedFolder({ ...updatedSubfolder, parentFolder: selectedFolder.parentFolder });
        } else {
          // Fallback: keep current folder but refresh documents from response
          console.warn('Could not find updated subfolder, keeping current selection');
          setSelectedFolder(prev => ({ ...prev, documents: [] }));
        }
      } else {
        const updatedFolder = response.data.folders?.find((f) => f.name === selectedFolder.name);
        if (updatedFolder) {
          setSelectedFolder(updatedFolder);
        } else {
          // Fallback: keep current folder but refresh documents from response
          console.warn('Could not find updated folder, keeping current selection');
          setSelectedFolder(prev => ({ ...prev, documents: [] }));
        }
      }
    } catch (err) {
      setError('File upload failed');
    }
  };

  // Handle photo upload (from library or camera)
  const handlePhotoUpload = async (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const formData = new FormData();
    Array.from(files).forEach((file) => {
      // Generate proper filename for photos: DA_PM#_Notification#_MAT_Photo_timestamp.jpg
      const ext = file.name.split('.').pop();
      const timestamp = Date.now();
      const newName = `${job?.division || 'DA'}_${job?.pmNumber || 'NOPM'}_${job?.notificationNumber || 'NONOTIF'}_${job?.matCode || '2AA'}_Photo_${timestamp}.${ext}`;
      formData.append('photos', file, newName);
    });

    try {
      const token = localStorage.getItem('token');
      await api.post(`/api/jobs/${id}/photos`, formData, {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      // Refresh job data
      const response = await api.get(`/api/jobs/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setJob(response.data);
      
      // Re-select the Photos folder to show new uploads
      const aciFolder = response.data.folders.find((f) => f.name === 'ACI');
      if (aciFolder) {
        const photosFolder = aciFolder.subfolders.find((sf) => sf.name === 'Photos');
        if (photosFolder) {
          setSelectedFolder({ ...photosFolder, parentFolder: 'ACI' });
        }
      }
    } catch (err) {
      console.error('Photo upload error:', err);
      setError('Photo upload failed');
    }
  };

  // Check if current folder is Photos or Pre-Field Documents (or Job Photos subfolder)
  const isPhotosFolder = selectedFolder?.name === 'Photos';
  const isPreFieldFolder = selectedFolder?.name === 'Pre-Field Documents' || 
                           selectedFolder?.name === 'Job Photos' ||
                           selectedFolder?.parentFolder === 'Pre-Field Documents';
  const isJobPhotosFolder = selectedFolder?.name === 'Job Photos';
  
  // Refs for photo uploads
  const preFieldPhotoInputRef = useRef(null);
  const preFieldCameraInputRef = useRef(null);

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
    if (!contextDoc || !job) {
      handleCloseMenu();
      return;
    }

    // Confirm deletion
    if (!window.confirm(`Are you sure you want to delete "${contextDoc.name}"?`)) {
      handleCloseMenu();
      return;
    }

    try {
      const token = localStorage.getItem('token');
      await api.delete(`/api/jobs/${job._id}/documents/${contextDoc._id}`, {
        headers: { Authorization: `Bearer ${token}` },
        data: {
          folderName: selectedFolder?.parentFolder || selectedFolder?.name,
          subfolderName: selectedFolder?.parentFolder ? selectedFolder?.name : null
        }
      });

      // Refresh job data
      const response = await api.get(`/api/jobs/${job._id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setJob(response.data);

      // Re-select folder to show updated documents
      if (selectedFolder?.parentFolder) {
        const parentFolder = response.data.folders?.find((f) => f.name === selectedFolder.parentFolder);
        const updatedSubfolder = parentFolder?.subfolders?.find((sf) => sf.name === selectedFolder.name);
        if (updatedSubfolder) {
          setSelectedFolder({ ...updatedSubfolder, parentFolder: selectedFolder.parentFolder });
        }
      } else {
        const updatedFolder = response.data.folders?.find((f) => f.name === selectedFolder.name);
        if (updatedFolder) {
          setSelectedFolder(updatedFolder);
        }
      }

      console.log('Document deleted successfully');
    } catch (err) {
      console.error('Error deleting document:', err);
      setError('Failed to delete document');
    } finally {
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

  // Get the correct URL for a document
  const getDocUrl = (doc) => {
    if (!doc) return '';
    // Use the API base URL from environment or default to relative path
    const apiBase = process.env.REACT_APP_API_URL || '';
    
    let resultUrl = '';
    
    // If it's a template, use the template URL
    if (doc.url?.startsWith('/templates/')) {
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
    
    // Debug logging
    console.log('getDocUrl:', { docName: doc.name, docUrl: doc.url, r2Key: doc.r2Key, apiBase, resultUrl });
    
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
    if (!window.confirm(`Are you sure you want to delete the folder "${folderName}"? All documents inside will be removed.`)) {
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
      const response = await api.post(`/api/jobs/${id}/save-edited-pdf`, {
        pdfData: base64Data,
        originalName: documentName,
        folderName: selectedFolder?.parentFolder || selectedFolder?.name,
        subfolderName: selectedFolder?.parentFolder ? selectedFolder?.name : null,
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      console.log('PDF saved:', response.data);
      
      // Refresh job data to show the new document
      const jobResponse = await api.get(`/api/jobs/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setJob(jobResponse.data);
      
      // Update selected folder
      if (selectedFolder?.parentFolder) {
        const parentFolder = jobResponse.data.folders.find((f) => f.name === selectedFolder.parentFolder);
        const updatedSubfolder = parentFolder?.subfolders?.find((sf) => sf.name === selectedFolder.name);
        if (updatedSubfolder) {
          setSelectedFolder({ ...updatedSubfolder, parentFolder: selectedFolder.parentFolder });
        }
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
      window.open(url, '_blank');
    }
  };

  if (loading) return <CircularProgress />;
  if (error) return <Alert severity="error">{error}</Alert>;

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <AppBar position="static">
        <Toolbar>
          <Tooltip title="Back to Dashboard">
            <IconButton color="inherit" onClick={() => navigate('/dashboard')} sx={{ mr: 1 }}>
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
            renderInput={(params) => <TextField {...params} label="Select Job" variant="outlined" size="small" />}
            sx={{ width: 300, mr: 2 }}
          />
          <Tooltip title={darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}>
            <IconButton color="inherit" onClick={toggleDarkMode} sx={{ mr: 1 }}>
              {darkMode ? <LightModeIcon /> : <DarkModeIcon />}
            </IconButton>
          </Tooltip>
          <FormControlLabel
            control={<Switch checked={viewDetails} onChange={() => setViewDetails(!viewDetails)} />}
            label="View Details"
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
                fullWidth
                size="small"
                placeholder="Search folders/files..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </Box>
            <TreeView
              defaultCollapseIcon={<ExpandMoreIcon />}
              defaultExpandIcon={<ChevronRightIcon />}
              defaultExpanded={['root', ...job.folders.map(f => f.name)]}
            >
              {/* Root: WO Number */}
              <TreeItem
                nodeId="root"
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
                      nodeId={folder.name}
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
                            >
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          )}
                        </Box>
                      }
                      onClick={() => handleFolderSelect({ ...folder, isParent: true })}
                    >
                      {folder.subfolders?.map((subfolder) => (
                        <TreeItem 
                          key={`${folder.name}-${subfolder.name}`} 
                          nodeId={`${folder.name}-${subfolder.name}`}
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
                                  sx={{ p: 0.25, color: 'error.main' }}
                                >
                                  <DeleteIcon sx={{ fontSize: '0.875rem' }} />
                                </IconButton>
                              )}
                            </Box>
                          }
                          onClick={(e) => {
                            e.stopPropagation();
                            handleFolderSelect({ ...subfolder, parentFolder: folder.name });
                          }}
                        >
                          {/* Render nested subfolders (e.g., Job Photos, Construction Drawings under Pre-Field Documents) */}
                          {subfolder.subfolders?.map((nestedSubfolder) => (
                            <TreeItem
                              key={`${folder.name}-${subfolder.name}-${nestedSubfolder.name}`}
                              nodeId={`${folder.name}-${subfolder.name}-${nestedSubfolder.name}`}
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
                          ))}
                        </TreeItem>
                      ))}
                    </TreeItem>
                  ))}
              </TreeItem>
            </TreeView>
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
                      ref={cameraInputRef}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      multiple
                      onChange={handlePhotoUpload}
                      style={{ display: 'none' }}
                    />
                    <input
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
                        AI has automatically extracted photos, drawings, and maps from the job package PDF
                      </Alert>
                    )}
                    
                    <input
                      ref={preFieldCameraInputRef}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      multiple
                      onChange={handlePreFieldPhotoUpload}
                      style={{ display: 'none' }}
                    />
                    <input
                      ref={preFieldPhotoInputRef}
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={handlePreFieldPhotoUpload}
                      style={{ display: 'none' }}
                    />
                  </Paper>
                )}
                <TableContainer>
                  <Table size="small" aria-label="documents table">
                    <TableHead>
                      <TableRow>
                        <TableCell>Name</TableCell>
                        <TableCell>Date Created</TableCell>
                        <TableCell>Actions</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {selectedFolder.documents.length > 0 ? (
                        selectedFolder.documents.map((doc, idx) => (
                          <TableRow
                            key={doc.url || doc.name + idx}
                            onContextMenu={(e) => handleContextMenu(e, doc)}
                            onDoubleClick={() => handleDocDoubleClick(doc)}
                            sx={{ 
                              '&:hover': { bgcolor: alpha(blue[50], 0.5), cursor: 'pointer' },
                              cursor: 'pointer'
                            }}
                          >
                            <TableCell>
                              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                <ListItemIcon sx={{ minWidth: 30, display: 'inline-flex' }}>
                                  <InsertDriveFileIcon fontSize="small" color={doc.isTemplate ? 'primary' : 'action'} />
                                </ListItemIcon>
                                <Box>
                                  <Typography variant="body2">{doc.name}</Typography>
                                  <Typography variant="caption" color="text.secondary">
                                    Double-click to open
                                  </Typography>
                                </Box>
                              </Box>
                            </TableCell>
                            <TableCell>{doc.uploadDate ? new Date(doc.uploadDate).toLocaleString() : '-'}</TableCell>
                            <TableCell>
                              <Tooltip title="Open">
                                <IconButton size="small" onClick={() => handleDocDoubleClick(doc)}>
                                  <VisibilityIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                              <Tooltip title="Download">
                                <IconButton size="small" onClick={() => handleDownload(doc)}>
                                  <DownloadIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                              <Tooltip title="More options">
                                <IconButton size="small" onClick={(e) => handleContextMenu(e, doc)}>
                                  <MoreVertIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            </TableCell>
                          </TableRow>
                        ))
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
            PaperProps={{ style: { width: 200 } }}
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

        {/* PDF Viewer/Editor Dialog */}
        <Dialog
          open={pdfViewerOpen}
          onClose={() => {
            setPdfViewerOpen(false);
            setEditorMode(false);
          }}
          maxWidth="xl"
          fullWidth
          PaperProps={{
            sx: {
              height: '95vh',
              maxHeight: '95vh',
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
                <IconButton onClick={() => viewingDoc && handleDownload(viewingDoc)}>
                  <DownloadIcon />
                </IconButton>
              </Tooltip>
              <Tooltip title="Close">
                <IconButton onClick={() => {
                  setPdfViewerOpen(false);
                  setEditorMode(false);
                }}>
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
          PaperProps={{
            sx: {
              bgcolor: 'black',
              maxHeight: '95vh',
            }
          }}
        >
          <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 1, bgcolor: 'rgba(0,0,0,0.8)', color: 'white' }}>
            <Typography variant="h6">{viewingImage?.name || 'Image'}</Typography>
            <Box>
              <Tooltip title="Download">
                <IconButton onClick={() => viewingImage && handleDownload(viewingImage)} sx={{ color: 'white' }}>
                  <DownloadIcon />
                </IconButton>
              </Tooltip>
              <Tooltip title="Close">
                <IconButton onClick={() => {
                  setImageViewerOpen(false);
                  setViewingImage(null);
                }} sx={{ color: 'white' }}>
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
                    <TextField {...params} label="Parent Folder" placeholder="Select parent folder" />
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
      </Box>
  );
};

export default JobFileSystem;