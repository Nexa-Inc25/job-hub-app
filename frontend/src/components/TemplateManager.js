// src/components/TemplateManager.js
import React, { useState, useEffect, useRef } from 'react';
import api from '../api';
import {
  Box,
  Typography,
  Paper,
  Button,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  CircularProgress,
  Alert,
  Divider,
  Chip
} from '@mui/material';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';

const TemplateManager = () => {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef(null);

  const token = localStorage.getItem('token');

  useEffect(() => {
    if (!token) {
      setError('Please log in first to manage templates');
      return;
    }
    fetchTemplates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Handle drag events
  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      handleUploadFiles(files);
    }
  };

  const fetchTemplates = async () => {
    setLoading(true);
    try {
      const response = await api.get('/api/admin/templates', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setTemplates(response.data.templates || []);
    } catch (error) {
      console.error('Failed to load templates:', error);
      setError('Failed to load templates');
    } finally {
      setLoading(false);
    }
  };

  // Handle file input change
  const handleUpload = (e) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleUploadFiles(files);
    }
  };

  // Actual upload logic (used by both input and drag/drop)
  const handleUploadFiles = async (files) => {
    if (!files || files.length === 0) return;

    if (!token) {
      setError('Please log in first');
      return;
    }

    console.log('Uploading files:', Array.from(files).map(f => f.name));
    setUploading(true);
    setError('');
    setSuccess('');

    const formData = new FormData();
    Array.from(files).forEach(file => {
      formData.append('templates', file);
    });

    try {
      console.log('Sending upload request...');
      const response = await api.post('/api/admin/templates', formData, {
        headers: { 
          Authorization: `Bearer ${token}`
        }
      });
      console.log('Upload response:', response.data);
      setSuccess(`Uploaded ${response.data.templates.length} template(s) successfully!`);
      fetchTemplates(); // Refresh list
    } catch (err) {
      console.error('Upload error:', err);
      setError('Upload failed - ' + (err.response?.data?.error || err.message));
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  return (
    <Box sx={{ maxWidth: 800, margin: '0 auto', padding: 3 }}>
      <Paper sx={{ p: 3 }}>
        <Typography variant="h5" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <UploadFileIcon color="primary" />
          Template Manager
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Upload PG&E forms and utility templates here. These will be available in the Pre-Field Documents folder for all jobs.
        </Typography>

        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}

        {/* Upload Section */}
        <Box 
          sx={{ 
            border: '2px dashed',
            borderColor: isDragging ? 'success.main' : 'primary.main',
            borderRadius: 2,
            p: 4,
            textAlign: 'center',
            mb: 3,
            bgcolor: isDragging ? 'success.light' : 'action.hover',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            '&:hover': { bgcolor: 'action.selected' }
          }}
          onClick={() => fileInputRef.current?.click()}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <CloudUploadIcon sx={{ fontSize: 48, color: isDragging ? 'success.main' : 'primary.main', mb: 1 }} />
          <Typography variant="h6">
            {uploading ? 'Uploading...' : isDragging ? 'Drop files here!' : 'Click or drag PDF templates here'}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Supported: PDF files (FUCA, Tailboard, Safety Forms, etc.)
          </Typography>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf"
            multiple
            onChange={handleUpload}
            style={{ display: 'none' }}
          />
          {uploading && <CircularProgress sx={{ mt: 2 }} />}
        </Box>

        <Divider sx={{ my: 2 }} />

        {/* Template List */}
        <Typography variant="h6" gutterBottom>
          Uploaded Templates
          <Chip label={templates.length} size="small" sx={{ ml: 1 }} />
        </Typography>

        {loading ? (
          <CircularProgress />
        ) : templates.length === 0 ? (
          <Typography color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>
            No templates uploaded yet. Upload your PG&E forms above.
          </Typography>
        ) : (
          <List>
            {templates.map((template, index) => (
              <ListItem 
                key={index}
                sx={{ 
                  bgcolor: 'background.paper',
                  mb: 1,
                  borderRadius: 1,
                  border: '1px solid',
                  borderColor: 'divider'
                }}
              >
                <ListItemIcon>
                  <PictureAsPdfIcon color="error" />
                </ListItemIcon>
                <ListItemText 
                  primary={template.name}
                  secondary={template.url}
                />
                <Button 
                  variant="outlined" 
                  size="small"
                  href={template.url}
                  target="_blank"
                >
                  Preview
                </Button>
              </ListItem>
            ))}
          </List>
        )}

        <Divider sx={{ my: 3 }} />

        <Typography variant="body2" color="text.secondary">
          <strong>How it works:</strong> Templates uploaded here become available in every job's 
          "Pre-Field Documents" folder. When a GF opens a template, the system will auto-fill 
          basic job info (PM#, WO#, Address, etc.) into the form.
        </Typography>
      </Paper>
    </Box>
  );
};

export default TemplateManager;
