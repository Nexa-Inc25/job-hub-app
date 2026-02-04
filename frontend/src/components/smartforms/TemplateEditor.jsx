/**
 * TemplateEditor - Field drawing and data mapping interface for SmartForms
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

import {
  Box,
  Typography,
  Button,
  Paper,
  IconButton,
  TextField,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  CircularProgress,
  Alert,
  Tooltip,
  Chip,
  Divider,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Drawer,
  Autocomplete,
  Snackbar,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SaveIcon from '@mui/icons-material/Save';
import AddBoxIcon from '@mui/icons-material/AddBox';
import DeleteIcon from '@mui/icons-material/Delete';
import ZoomInIcon from '@mui/icons-material/ZoomIn';
import ZoomOutIcon from '@mui/icons-material/ZoomOut';
import EditIcon from '@mui/icons-material/Edit';
import LinkIcon from '@mui/icons-material/Link';
import TextFieldsIcon from '@mui/icons-material/TextFields';
import DateRangeIcon from '@mui/icons-material/DateRange';
import CheckBoxIcon from '@mui/icons-material/CheckBox';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import { useThemeMode } from '../../ThemeContext';

const API_BASE = import.meta.env.VITE_API_URL || '';

const FIELD_TYPES = [
  { value: 'text', label: 'Text', icon: TextFieldsIcon },
  { value: 'date', label: 'Date', icon: DateRangeIcon },
  { value: 'checkbox', label: 'Checkbox', icon: CheckBoxIcon },
  { value: 'number', label: 'Number', icon: TextFieldsIcon },
];

export default function TemplateEditor() {
  const { templateId } = useParams();
  const navigate = useNavigate();
  const { mode } = useThemeMode();
  const isDark = mode === 'dark';

  // Template state
  const [template, setTemplate] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });

  // PDF state
  const [numPages, setNumPages] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [containerWidth, setContainerWidth] = useState(null);
  const containerRef = useRef(null);

  // Fields state
  const [fields, setFields] = useState([]);
  const [selectedField, setSelectedField] = useState(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawStart, setDrawStart] = useState(null);
  const [drawRect, setDrawRect] = useState(null);
  const [drawMode, setDrawMode] = useState(false);

  // Mapping state
  const [dataPaths, setDataPaths] = useState([]);
  const [mappings, setMappings] = useState({});
  const [mappingDrawerOpen, setMappingDrawerOpen] = useState(false);

  // Field edit dialog
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingField, setEditingField] = useState(null);

  // Load template
  useEffect(() => {
    const fetchTemplate = async () => {
      try {
        setLoading(true);
        const token = localStorage.getItem('token');
        const response = await fetch(`${API_BASE}/api/smartforms/templates/${templateId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!response.ok) throw new Error('Failed to load template');

        const data = await response.json();
        setTemplate(data);
        setFields(data.fields || []);
        
        // Convert Map to object for mappings
        const mappingsObj = {};
        if (data.dataMappings) {
          for (const [key, value] of Object.entries(data.dataMappings)) {
            mappingsObj[key] = value;
          }
        }
        setMappings(mappingsObj);
        setError('');
      } catch (err) {
        console.error('Error loading template:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchTemplate();
  }, [templateId]);

  // Load data paths
  useEffect(() => {
    const fetchDataPaths = async () => {
      try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${API_BASE}/api/smartforms/data-paths`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (response.ok) {
          const data = await response.json();
          setDataPaths(data);
        }
      } catch (err) {
        console.error('Error loading data paths:', err);
      }
    };

    fetchDataPaths();
  }, []);

  // Container width tracking
  useEffect(() => {
    const updateWidth = () => {
      if (containerRef.current) {
        setContainerWidth(containerRef.current.clientWidth);
      }
    };

    updateWidth();
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, []);

  const onDocumentLoadSuccess = ({ numPages: pages }) => {
    setNumPages(pages);
  };

  // Get PDF URL
  const pdfUrl = template
    ? `${API_BASE}/api/smartforms/templates/${templateId}/pdf`
    : null;

  // Generate unique field ID
  const generateFieldId = () => `field_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;

  // Convert PDF coords to screen coords for display
  const pdfToScreenCoords = useCallback((pdfX, pdfY, pdfWidth, pdfHeight, pageElement) => {
    if (!pageElement || !template?.sourceFile?.pageDimensions) return { left: 0, top: 0, width: 0, height: 0 };

    const rect = pageElement.getBoundingClientRect();
    const pageDim = template.sourceFile.pageDimensions[currentPage - 1];
    if (!pageDim) return { left: 0, top: 0, width: 0, height: 0 };

    const scaleX = rect.width / pageDim.width;
    const scaleY = rect.height / pageDim.height;

    return {
      left: pdfX * scaleX,
      top: (pageDim.height - pdfY - pdfHeight) * scaleY,
      width: pdfWidth * scaleX,
      height: pdfHeight * scaleY,
    };
  }, [template, currentPage]);

  // Mouse handlers for drawing
  const handleMouseDown = useCallback((e) => {
    if (!drawMode) return;

    const pageElement = e.currentTarget;
    const rect = pageElement.getBoundingClientRect();
    const startX = e.clientX - rect.left;
    const startY = e.clientY - rect.top;

    setIsDrawing(true);
    setDrawStart({ x: startX, y: startY, clientX: e.clientX, clientY: e.clientY });
    setDrawRect({ left: startX, top: startY, width: 0, height: 0 });
  }, [drawMode]);

  const handleMouseMove = useCallback((e) => {
    if (!isDrawing || !drawStart) return;

    const pageElement = e.currentTarget;
    const rect = pageElement.getBoundingClientRect();
    const currentX = e.clientX - rect.left;
    const currentY = e.clientY - rect.top;

    const left = Math.min(drawStart.x, currentX);
    const top = Math.min(drawStart.y, currentY);
    const width = Math.abs(currentX - drawStart.x);
    const height = Math.abs(currentY - drawStart.y);

    setDrawRect({ left, top, width, height });
  }, [isDrawing, drawStart]);

  const handleMouseUp = useCallback((e) => {
    if (!isDrawing || !drawRect || !drawStart) {
      setIsDrawing(false);
      return;
    }

    // Minimum size check (10x10 pixels)
    if (drawRect.width < 10 || drawRect.height < 10) {
      setIsDrawing(false);
      setDrawRect(null);
      setDrawStart(null);
      return;
    }

    const pageElement = e.currentTarget;
    const pageDim = template?.sourceFile?.pageDimensions?.[currentPage - 1];
    if (!pageDim) return;

    const rect = pageElement.getBoundingClientRect();
    const scaleX = pageDim.width / rect.width;
    const scaleY = pageDim.height / rect.height;

    // Convert to PDF coordinates
    const pdfX = drawRect.left * scaleX;
    const pdfWidth = drawRect.width * scaleX;
    const pdfHeight = drawRect.height * scaleY;
    // PDF Y is from bottom
    const pdfY = pageDim.height - (drawRect.top + drawRect.height) * scaleY;

    const newField = {
      id: generateFieldId(),
      name: `field_${fields.length + 1}`,
      label: `Field ${fields.length + 1}`,
      page: currentPage,
      type: 'text',
      bounds: {
        x: pdfX,
        y: pdfY,
        width: pdfWidth,
        height: pdfHeight,
      },
      fontSize: 10,
      fontColor: '#000000',
      required: false,
    };

    setFields((prev) => [...prev, newField]);
    setSelectedField(newField.id);
    setIsDrawing(false);
    setDrawRect(null);
    setDrawStart(null);
    setDrawMode(false);

    // Open edit dialog for the new field
    setEditingField(newField);
    setEditDialogOpen(true);
  }, [isDrawing, drawRect, drawStart, currentPage, template, fields.length]);

  // Save fields
  const handleSaveFields = async () => {
    try {
      setSaving(true);
      const token = localStorage.getItem('token');

      // Save fields
      const fieldsResponse = await fetch(`${API_BASE}/api/smartforms/templates/${templateId}/fields`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ fields }),
      });

      if (!fieldsResponse.ok) throw new Error('Failed to save fields');

      // Save mappings
      const mappingsResponse = await fetch(`${API_BASE}/api/smartforms/templates/${templateId}/mappings`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ mappings }),
      });

      if (!mappingsResponse.ok) throw new Error('Failed to save mappings');

      setSnackbar({ open: true, message: 'Template saved successfully!', severity: 'success' });
    } catch (err) {
      console.error('Error saving template:', err);
      setSnackbar({ open: true, message: err.message, severity: 'error' });
    } finally {
      setSaving(false);
    }
  };

  // Activate template
  const handleActivate = async () => {
    if (fields.length === 0) {
      setSnackbar({ open: true, message: 'Add at least one field before activating', severity: 'warning' });
      return;
    }

    try {
      setSaving(true);
      const token = localStorage.getItem('token');

      // Save fields and mappings first
      await handleSaveFields();

      // Update status
      const response = await fetch(`${API_BASE}/api/smartforms/templates/${templateId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: 'active' }),
      });

      if (!response.ok) throw new Error('Failed to activate template');

      setTemplate((prev) => ({ ...prev, status: 'active' }));
      setSnackbar({ open: true, message: 'Template activated!', severity: 'success' });
    } catch (err) {
      console.error('Error activating template:', err);
      setSnackbar({ open: true, message: err.message, severity: 'error' });
    } finally {
      setSaving(false);
    }
  };

  // Update field
  const handleUpdateField = (fieldId, updates) => {
    setFields((prev) =>
      prev.map((f) => (f.id === fieldId ? { ...f, ...updates } : f))
    );
  };

  // Delete field
  const handleDeleteField = (fieldId) => {
    setFields((prev) => prev.filter((f) => f.id !== fieldId));
    if (selectedField === fieldId) setSelectedField(null);
    // Remove mapping
    setMappings((prev) => {
      const updated = { ...prev };
      const field = fields.find((f) => f.id === fieldId);
      if (field) delete updated[field.name];
      return updated;
    });
  };

  // Render field overlays
  const renderFieldOverlays = (pageElement) => {
    const pageFields = fields.filter((f) => f.page === currentPage);

    return pageFields.map((field) => {
      const screenPos = pdfToScreenCoords(
        field.bounds.x,
        field.bounds.y,
        field.bounds.width,
        field.bounds.height,
        pageElement
      );

      const isSelected = selectedField === field.id;
      const hasMapping = mappings[field.name];

      return (
        <Box
          key={field.id}
          sx={{
            position: 'absolute',
            left: screenPos.left,
            top: screenPos.top,
            width: screenPos.width,
            height: screenPos.height,
            border: isSelected ? '3px solid #1976d2' : '2px solid #4caf50',
            bgcolor: isSelected ? 'rgba(25, 118, 210, 0.2)' : 'rgba(76, 175, 80, 0.15)',
            cursor: 'pointer',
            '&:hover': {
              bgcolor: 'rgba(25, 118, 210, 0.3)',
            },
          }}
          onClick={(e) => {
            e.stopPropagation();
            setSelectedField(field.id);
          }}
        >
          <Chip
            size="small"
            label={field.name}
            color={hasMapping ? 'success' : 'default'}
            icon={hasMapping ? <LinkIcon /> : undefined}
            sx={{
              position: 'absolute',
              top: -12,
              left: 0,
              height: 20,
              fontSize: 10,
            }}
          />
          {isSelected && (
            <Box sx={{ position: 'absolute', top: -12, right: 0, display: 'flex', gap: 0.5 }}>
              <IconButton
                size="small"
                onClick={(e) => {
                  e.stopPropagation();
                  setEditingField(field);
                  setEditDialogOpen(true);
                }}
                sx={{ bgcolor: 'white', width: 24, height: 24 }}
              >
                <EditIcon sx={{ fontSize: 14 }} />
              </IconButton>
              <IconButton
                size="small"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteField(field.id);
                }}
                sx={{ bgcolor: 'white', width: 24, height: 24 }}
                color="error"
              >
                <DeleteIcon sx={{ fontSize: 14 }} />
              </IconButton>
            </Box>
          )}
        </Box>
      );
    });
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

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 64px)' }}>
      {/* Toolbar */}
      <Paper sx={{ px: 2, py: 1, display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
        <IconButton onClick={() => navigate('/smartforms')}>
          <ArrowBackIcon />
        </IconButton>

        <Box sx={{ flex: 1 }}>
          <Typography variant="h6" fontWeight={600}>
            {template?.name}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {fields.length} field{fields.length !== 1 ? 's' : ''} • Page {currentPage} of {numPages || 1}
          </Typography>
        </Box>

        <Chip
          label={template?.status === 'active' ? 'Active' : 'Draft'}
          color={template?.status === 'active' ? 'success' : 'warning'}
          size="small"
        />

        <Divider orientation="vertical" flexItem />

        <Tooltip title="Draw New Field">
          <Button
            variant={drawMode ? 'contained' : 'outlined'}
            startIcon={<AddBoxIcon />}
            onClick={() => setDrawMode(!drawMode)}
            color={drawMode ? 'secondary' : 'primary'}
          >
            {drawMode ? 'Drawing...' : 'Add Field'}
          </Button>
        </Tooltip>

        <Tooltip title="Map Data">
          <Button
            variant="outlined"
            startIcon={<LinkIcon />}
            onClick={() => setMappingDrawerOpen(true)}
          >
            Mappings
          </Button>
        </Tooltip>

        <Divider orientation="vertical" flexItem />

        <IconButton onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))}>
          <ZoomOutIcon />
        </IconButton>
        <Typography variant="body2" sx={{ minWidth: 40, textAlign: 'center' }}>
          {Math.round(zoom * 100)}%
        </Typography>
        <IconButton onClick={() => setZoom((z) => Math.min(2, z + 0.25))}>
          <ZoomInIcon />
        </IconButton>

        <Divider orientation="vertical" flexItem />

        <Button
          variant="outlined"
          startIcon={saving ? <CircularProgress size={20} /> : <SaveIcon />}
          onClick={handleSaveFields}
          disabled={saving}
        >
          Save
        </Button>

        {template?.status !== 'active' && (
          <Button
            variant="contained"
            color="success"
            startIcon={<PlayArrowIcon />}
            onClick={handleActivate}
            disabled={saving || fields.length === 0}
          >
            Activate
          </Button>
        )}
      </Paper>

      {/* Main Content */}
      <Box sx={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* PDF Canvas */}
        <Box
          ref={containerRef}
          sx={{
            flex: 1,
            overflow: 'auto',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'flex-start',
            p: 2,
            bgcolor: isDark ? 'grey.900' : 'grey.300',
          }}
        >
          {pdfUrl && (
            <Document
              file={pdfUrl}
              onLoadSuccess={onDocumentLoadSuccess}
              loading={
                <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
                  <CircularProgress />
                </Box>
              }
              options={{
                httpHeaders: {
                  Authorization: `Bearer ${localStorage.getItem('token')}`,
                },
              }}
            >
              <Box
                sx={{
                  position: 'relative',
                  bgcolor: 'white',
                  boxShadow: 3,
                  cursor: drawMode ? 'crosshair' : 'default',
                }}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={() => {
                  if (isDrawing) {
                    setIsDrawing(false);
                    setDrawRect(null);
                    setDrawStart(null);
                  }
                }}
              >
                <Page
                  pageNumber={currentPage}
                  scale={zoom}
                  renderTextLayer={false}
                  renderAnnotationLayer={false}
                  width={containerWidth ? Math.min(containerWidth - 64, 800) : undefined}
                  onRenderSuccess={() => {
                    // Force re-render of overlays
                  }}
                />

                {/* Field overlays */}
                {containerRef.current && renderFieldOverlays(containerRef.current.querySelector('.react-pdf__Page'))}

                {/* Drawing rectangle */}
                {isDrawing && drawRect && (
                  <Box
                    sx={{
                      position: 'absolute',
                      left: drawRect.left,
                      top: drawRect.top,
                      width: drawRect.width,
                      height: drawRect.height,
                      border: '2px dashed #1976d2',
                      bgcolor: 'rgba(25, 118, 210, 0.2)',
                      pointerEvents: 'none',
                    }}
                  />
                )}
              </Box>
            </Document>
          )}
        </Box>

        {/* Fields Panel */}
        <Paper
          sx={{
            width: 300,
            flexShrink: 0,
            overflow: 'auto',
            borderLeft: 1,
            borderColor: 'divider',
          }}
        >
          <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
            <Typography variant="subtitle1" fontWeight={600}>
              Fields ({fields.length})
            </Typography>
          </Box>
          <List dense>
            {fields.length === 0 ? (
              <Box sx={{ p: 3, textAlign: 'center' }}>
                <Typography variant="body2" color="text.secondary">
                  Click "Add Field" and draw on the PDF to create fields
                </Typography>
              </Box>
            ) : (
              fields.map((field) => (
                <ListItem
                  key={field.id}
                  button
                  selected={selectedField === field.id}
                  onClick={() => {
                    setSelectedField(field.id);
                    setCurrentPage(field.page);
                  }}
                  sx={{
                    borderLeft: 3,
                    borderColor: mappings[field.name] ? 'success.main' : 'transparent',
                  }}
                >
                  <ListItemText
                    primary={field.name}
                    secondary={
                      <>
                        {field.type} • Page {field.page}
                        {mappings[field.name] && (
                          <Typography component="span" variant="caption" color="success.main" sx={{ display: 'block' }}>
                            → {mappings[field.name]}
                          </Typography>
                        )}
                      </>
                    }
                  />
                  <ListItemSecondaryAction>
                    <IconButton
                      size="small"
                      onClick={() => {
                        setEditingField(field);
                        setEditDialogOpen(true);
                      }}
                    >
                      <EditIcon fontSize="small" />
                    </IconButton>
                  </ListItemSecondaryAction>
                </ListItem>
              ))
            )}
          </List>

          {/* Page Navigation */}
          {numPages && numPages > 1 && (
            <Box sx={{ p: 2, borderTop: 1, borderColor: 'divider' }}>
              <Typography variant="caption" color="text.secondary" gutterBottom>
                Navigate Pages
              </Typography>
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 1 }}>
                {Array.from({ length: numPages }, (_, i) => (
                  <Chip
                    key={i + 1}
                    label={i + 1}
                    size="small"
                    color={currentPage === i + 1 ? 'primary' : 'default'}
                    onClick={() => setCurrentPage(i + 1)}
                  />
                ))}
              </Box>
            </Box>
          )}
        </Paper>
      </Box>

      {/* Field Edit Dialog */}
      <Dialog open={editDialogOpen} onClose={() => setEditDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Edit Field</DialogTitle>
        <DialogContent>
          {editingField && (
            <Box sx={{ pt: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <TextField
                label="Field Name"
                value={editingField.name}
                onChange={(e) => setEditingField({ ...editingField, name: e.target.value })}
                fullWidth
                helperText="Used for data mapping (no spaces)"
              />
              <TextField
                label="Label"
                value={editingField.label || ''}
                onChange={(e) => setEditingField({ ...editingField, label: e.target.value })}
                fullWidth
                helperText="Display label (optional)"
              />
              <TextField
                select
                label="Field Type"
                value={editingField.type}
                onChange={(e) => setEditingField({ ...editingField, type: e.target.value })}
                fullWidth
              >
                {FIELD_TYPES.map((t) => (
                  <MenuItem key={t.value} value={t.value}>
                    {t.label}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                label="Font Size"
                type="number"
                value={editingField.fontSize}
                onChange={(e) => setEditingField({ ...editingField, fontSize: Number.parseInt(e.target.value, 10) || 10 })}
                fullWidth
                inputProps={{ min: 6, max: 48 }}
              />
              {editingField.type === 'date' && (
                <TextField
                  label="Date Format"
                  value={editingField.dateFormat || 'MM/DD/YYYY'}
                  onChange={(e) => setEditingField({ ...editingField, dateFormat: e.target.value })}
                  fullWidth
                  helperText="e.g., MM/DD/YYYY, YYYY-MM-DD"
                />
              )}
              <TextField
                label="Default Value"
                value={editingField.defaultValue || ''}
                onChange={(e) => setEditingField({ ...editingField, defaultValue: e.target.value })}
                fullWidth
              />

              {/* Data Mapping */}
              <Autocomplete
                options={dataPaths}
                getOptionLabel={(option) => `${option.label} (${option.path})`}
                groupBy={(option) => option.category}
                value={dataPaths.find((p) => p.path === mappings[editingField.name]) || null}
                onChange={(e, newValue) => {
                  setMappings((prev) => ({
                    ...prev,
                    [editingField.name]: newValue?.path || '',
                  }));
                }}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Map to Data Field"
                    helperText="Select which FieldLedger data to fill here"
                  />
                )}
              />
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button
            color="error"
            onClick={() => {
              handleDeleteField(editingField.id);
              setEditDialogOpen(false);
            }}
          >
            Delete Field
          </Button>
          <Box sx={{ flex: 1 }} />
          <Button onClick={() => setEditDialogOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={() => {
              handleUpdateField(editingField.id, editingField);
              setEditDialogOpen(false);
            }}
          >
            Save Field
          </Button>
        </DialogActions>
      </Dialog>

      {/* Mapping Drawer */}
      <Drawer
        anchor="right"
        open={mappingDrawerOpen}
        onClose={() => setMappingDrawerOpen(false)}
      >
        <Box sx={{ width: 400, p: 2 }}>
          <Typography variant="h6" gutterBottom>
            Data Mappings
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Connect template fields to FieldLedger data for auto-fill
          </Typography>
          <Divider sx={{ mb: 2 }} />

          {fields.length === 0 ? (
            <Alert severity="info">Add fields to the template first</Alert>
          ) : (
            <List>
              {fields.map((field) => (
                <ListItem key={field.id} sx={{ flexDirection: 'column', alignItems: 'stretch' }}>
                  <Typography variant="subtitle2" fontWeight={600}>
                    {field.name}
                  </Typography>
                  <Autocomplete
                    size="small"
                    options={dataPaths}
                    getOptionLabel={(option) => `${option.label} (${option.path})`}
                    groupBy={(option) => option.category}
                    value={dataPaths.find((p) => p.path === mappings[field.name]) || null}
                    onChange={(e, newValue) => {
                      setMappings((prev) => ({
                        ...prev,
                        [field.name]: newValue?.path || '',
                      }));
                    }}
                    renderInput={(params) => (
                      <TextField {...params} placeholder="Select data source..." size="small" />
                    )}
                    sx={{ mt: 1 }}
                  />
                </ListItem>
              ))}
            </List>
          )}

          <Box sx={{ mt: 3 }}>
            <Button
              variant="contained"
              fullWidth
              onClick={() => {
                handleSaveFields();
                setMappingDrawerOpen(false);
              }}
              startIcon={<SaveIcon />}
            >
              Save Mappings
            </Button>
          </Box>
        </Box>
      </Drawer>

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

