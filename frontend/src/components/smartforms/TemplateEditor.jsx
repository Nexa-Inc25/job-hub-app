/**
 * TemplateEditor - Field drawing and data mapping interface for SmartForms
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import PropTypes from 'prop-types';
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

/**
 * Convert data mappings from server format to object
 */
function convertMappingsToObject(dataMappings) {
  if (!dataMappings) return {};
  const mappingsObj = {};
  for (const [key, value] of Object.entries(dataMappings)) {
    mappingsObj[key] = value;
  }
  return mappingsObj;
}

/**
 * Generate unique field ID
 */
function generateFieldId() {
  return `field_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * Calculate draw rectangle from start and current position
 */
function calculateDrawRect(startX, startY, currentX, currentY) {
  return {
    left: Math.min(startX, currentX),
    top: Math.min(startY, currentY),
    width: Math.abs(currentX - startX),
    height: Math.abs(currentY - startY),
  };
}

/**
 * Create a new field from draw rectangle
 */
function createFieldFromDrawRect(drawRect, currentPage, pageDim, pageRect, fieldsCount) {
  const scaleX = pageDim.width / pageRect.width;
  const scaleY = pageDim.height / pageRect.height;

  const pdfX = drawRect.left * scaleX;
  const pdfWidth = drawRect.width * scaleX;
  const pdfHeight = drawRect.height * scaleY;
  const pdfY = pageDim.height - (drawRect.top + drawRect.height) * scaleY;

  return {
    id: generateFieldId(),
    name: `field_${fieldsCount + 1}`,
    label: `Field ${fieldsCount + 1}`,
    page: currentPage,
    type: 'text',
    bounds: { x: pdfX, y: pdfY, width: pdfWidth, height: pdfHeight },
    fontSize: 10,
    fontColor: '#000000',
    required: false,
  };
}

/**
 * Custom hook for container width tracking
 * Reduces cognitive complexity in main component
 */
function useContainerWidth(containerRef) {
  const [containerWidth, setContainerWidth] = useState(null);

  useEffect(() => {
    const updateWidth = () => {
      if (containerRef.current) {
        setContainerWidth(containerRef.current.clientWidth);
}
    };

    updateWidth();
    globalThis.addEventListener('resize', updateWidth);
    return () => globalThis.removeEventListener('resize', updateWidth);
  }, [containerRef]);

  return containerWidth;
}

/**
 * Custom hook for template data loading
 * Reduces cognitive complexity in main component
 */
function useTemplateData(templateId) {
  const [template, setTemplate] = useState(null);
  const [fields, setFields] = useState([]);
  const [mappings, setMappings] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pdfBlobUrl, setPdfBlobUrl] = useState(null);
  const [dataPaths, setDataPaths] = useState([]);

  // Load template
  useEffect(() => {
        setLoading(true);
    loadTemplateData(templateId)
      .then(data => {
        setTemplate(data);
        setFields(data.fields || []);
        setMappings(convertMappingsToObject(data.dataMappings));
        setError('');
      })
      .catch(err => {
        console.error('Error loading template:', err);
        setError(err.message);
      })
      .finally(() => setLoading(false));
  }, [templateId]);

  // Fetch PDF as blob
  useEffect(() => {
      if (!template) return;
      
    let blobUrl = null;
    loadPdfBlob(templateId)
      .then(url => {
        blobUrl = url;
        setPdfBlobUrl(url);
      })
      .catch(err => {
        console.error('[TemplateEditor] Error fetching PDF blob:', err);
        setError('Failed to load PDF: ' + err.message);
      });
    
    return () => { if (blobUrl) URL.revokeObjectURL(blobUrl); };
  }, [template, templateId]);

  // Load data paths
  useEffect(() => {
    loadDataPaths()
      .then(data => setDataPaths(data))
      .catch(err => console.error('Error loading data paths:', err));
  }, []);

    return {
    template, setTemplate,
    fields, setFields,
    mappings, setMappings,
    loading, error, setError,
    pdfBlobUrl,
    dataPaths,
  };
}

/**
 * Custom hook for field drawing on PDF
 * Reduces cognitive complexity in main component
 */
function useFieldDrawing(template, currentPage, fieldsLength, onFieldCreated) {
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawStart, setDrawStart] = useState(null);
  const [drawRect, setDrawRect] = useState(null);
  const [drawMode, setDrawMode] = useState(false);

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

    const rect = e.currentTarget.getBoundingClientRect();
    const currentX = e.clientX - rect.left;
    const currentY = e.clientY - rect.top;

    setDrawRect(calculateDrawRect(drawStart.x, drawStart.y, currentX, currentY));
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

    const pageDim = template?.sourceFile?.pageDimensions?.[currentPage - 1];
    if (!pageDim) return;

    const pageRect = e.currentTarget.getBoundingClientRect();
    const newField = createFieldFromDrawRect(drawRect, currentPage, pageDim, pageRect, fieldsLength);

    onFieldCreated(newField);
    setIsDrawing(false);
    setDrawRect(null);
    setDrawStart(null);
    setDrawMode(false);
  }, [isDrawing, drawRect, drawStart, currentPage, template, fieldsLength, onFieldCreated]);

  return {
    isDrawing,
    drawRect,
    drawMode,
    setDrawMode,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
  };
}

/**
 * API helper for template operations
 * Reduces cognitive complexity in main component
 */
async function fetchWithAuth(url, options = {}) {
      const token = localStorage.getItem('token');
  const headers = {
    Authorization: `Bearer ${token}`,
    ...options.headers,
  };
  return fetch(url, { ...options, headers });
}

async function loadTemplateData(templateId) {
  const response = await fetchWithAuth(`${API_BASE}/api/smartforms/templates/${templateId}`);
  if (!response.ok) throw new Error('Failed to load template');
  return response.json();
}

async function loadPdfBlob(templateId) {
  const response = await fetchWithAuth(`${API_BASE}/api/smartforms/templates/${templateId}/pdf`);
  if (!response.ok) throw new Error('Failed to fetch PDF');
  const blob = await response.blob();
  return URL.createObjectURL(blob);
}

async function loadDataPaths() {
  const response = await fetchWithAuth(`${API_BASE}/api/smartforms/data-paths`);
  if (response.ok) return response.json();
  return [];
}

async function saveTemplateFields(templateId, fields) {
  const response = await fetchWithAuth(`${API_BASE}/api/smartforms/templates/${templateId}/fields`, {
        method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields }),
      });
  if (!response.ok) throw new Error('Failed to save fields');
  return response.json();
}

async function saveTemplateMappings(templateId, mappings) {
  const response = await fetchWithAuth(`${API_BASE}/api/smartforms/templates/${templateId}/mappings`, {
        method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mappings }),
      });
  if (!response.ok) throw new Error('Failed to save mappings');
  return response.json();
    }

async function activateTemplate(templateId) {
  const response = await fetchWithAuth(`${API_BASE}/api/smartforms/templates/${templateId}/activate`, {
    method: 'POST',
      });
      if (!response.ok) throw new Error('Failed to activate template');
  return response.json();
}

/**
 * Loading state component
 */
function LoadingState() {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '80vh' }}>
      <CircularProgress />
    </Box>
  );
    }

/**
 * Error state component
 */
function ErrorState({ error, onBack }) {
  return (
    <Box sx={{ p: 3 }}>
      <Alert severity="error">{error}</Alert>
      <Button startIcon={<ArrowBackIcon />} onClick={onBack} sx={{ mt: 2 }}>
        Back to SmartForms
      </Button>
    </Box>
  );
}

ErrorState.propTypes = {
  error: PropTypes.string.isRequired,
  onBack: PropTypes.func.isRequired,
  };

/**
 * Convert a field to its screen overlay representation
 * Returns null if field is invalid or has no visible dimensions
 */
function fieldToOverlay(field, pdfToScreenCoords, pageElement) {
      if (!field?.bounds) return null;
      
      const screenPos = pdfToScreenCoords(
        field.bounds.x, field.bounds.y, field.bounds.width, field.bounds.height, pageElement
      );
      
      if (screenPos.width <= 0 || screenPos.height <= 0) return null;

  return { field, screenPos };
}

/**
 * FieldOverlay - Renders a single field overlay on the PDF
 */
function FieldOverlay({ field, screenPos, isSelected, hasMapping, onSelect, onEdit, onDelete }) {
    return (
    <Box
      sx={{
        position: 'absolute',
        left: screenPos.left,
        top: screenPos.top,
        width: screenPos.width,
        height: screenPos.height,
        border: isSelected ? '3px solid #1976d2' : '2px solid #4caf50',
        bgcolor: isSelected ? 'rgba(25, 118, 210, 0.2)' : 'rgba(76, 175, 80, 0.15)',
        cursor: 'pointer',
        '&:hover': { bgcolor: 'rgba(25, 118, 210, 0.3)' },
      }}
      onClick={(e) => { e.stopPropagation(); onSelect(field.id); }}
    >
      <Chip
        size="small"
        label={field.name}
        color={hasMapping ? 'success' : 'default'}
        icon={hasMapping ? <LinkIcon /> : undefined}
        sx={{ position: 'absolute', top: -12, left: 0, height: 20, fontSize: 10 }}
      />
      {isSelected && (
        <Box sx={{ position: 'absolute', top: -12, right: 0, display: 'flex', gap: 0.5 }}>
          <IconButton
            size="small"
            onClick={(e) => { e.stopPropagation(); onEdit(field); }}
            sx={{ bgcolor: 'white', width: 24, height: 24 }}
          >
            <EditIcon sx={{ fontSize: 14 }} />
          </IconButton>
          <IconButton
            size="small"
            onClick={(e) => { e.stopPropagation(); onDelete(field.id); }}
            sx={{ bgcolor: 'white', width: 24, height: 24 }}
            color="error"
          >
            <DeleteIcon sx={{ fontSize: 14 }} />
          </IconButton>
        </Box>
      )}
      </Box>
    );
  }

FieldOverlay.propTypes = {
  field: PropTypes.shape({
    id: PropTypes.string.isRequired,
    name: PropTypes.string.isRequired,
  }).isRequired,
  screenPos: PropTypes.shape({
    left: PropTypes.number.isRequired,
    top: PropTypes.number.isRequired,
    width: PropTypes.number.isRequired,
    height: PropTypes.number.isRequired,
  }).isRequired,
  isSelected: PropTypes.bool.isRequired,
  hasMapping: PropTypes.bool.isRequired,
  onSelect: PropTypes.func.isRequired,
  onEdit: PropTypes.func.isRequired,
  onDelete: PropTypes.func.isRequired,
};

/**
 * EditorToolbar - Toolbar component for template editor
 * Extracted to reduce cognitive complexity of main component
 */
function EditorToolbar({ 
  template, fields, currentPage, numPages, drawMode, setDrawMode, 
  setMappingDrawerOpen, zoom, setZoom, saving, onSave, onActivate, onBack 
}) {
  const zoomOut = () => setZoom((z) => Math.max(0.5, z - 0.25));
  const zoomIn = () => setZoom((z) => Math.min(2, z + 0.25));
  const toggleDrawMode = () => setDrawMode(!drawMode);
  const openMappings = () => setMappingDrawerOpen(true);

  return (
      <Paper sx={{ px: 2, py: 1, display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
      <IconButton onClick={onBack}>
          <ArrowBackIcon />
        </IconButton>

        <Box sx={{ flex: 1 }}>
          <Typography variant="h6" fontWeight={600}>
            {template?.name}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {fields.length} field{fields.length === 1 ? '' : 's'} • Page {currentPage} of {numPages || 1}
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
          onClick={toggleDrawMode}
            color={drawMode ? 'secondary' : 'primary'}
          >
            {drawMode ? 'Drawing...' : 'Add Field'}
          </Button>
        </Tooltip>

        <Tooltip title="Map Data">
        <Button variant="outlined" startIcon={<LinkIcon />} onClick={openMappings}>
            Mappings
          </Button>
        </Tooltip>

        <Divider orientation="vertical" flexItem />

      <IconButton onClick={zoomOut}>
          <ZoomOutIcon />
        </IconButton>
        <Typography variant="body2" sx={{ minWidth: 40, textAlign: 'center' }}>
          {Math.round(zoom * 100)}%
        </Typography>
      <IconButton onClick={zoomIn}>
          <ZoomInIcon />
        </IconButton>

        <Divider orientation="vertical" flexItem />

        <Button
          variant="outlined"
          startIcon={saving ? <CircularProgress size={20} /> : <SaveIcon />}
        onClick={onSave}
          disabled={saving}
        >
          Save
        </Button>

        {template?.status !== 'active' && (
          <Button
            variant="contained"
            color="success"
            startIcon={<PlayArrowIcon />}
          onClick={onActivate}
            disabled={saving || fields.length === 0}
          >
            Activate
          </Button>
        )}
      </Paper>
  );
}

EditorToolbar.propTypes = {
  template: PropTypes.object,
  fields: PropTypes.array.isRequired,
  currentPage: PropTypes.number.isRequired,
  numPages: PropTypes.number,
  drawMode: PropTypes.bool.isRequired,
  setDrawMode: PropTypes.func.isRequired,
  setMappingDrawerOpen: PropTypes.func.isRequired,
  zoom: PropTypes.number.isRequired,
  setZoom: PropTypes.func.isRequired,
  saving: PropTypes.bool.isRequired,
  onSave: PropTypes.func.isRequired,
  onActivate: PropTypes.func.isRequired,
  onBack: PropTypes.func.isRequired,
};

/**
 * FieldsPanel - Sidebar showing field list and page navigation
 * Extracted to reduce cognitive complexity of main component
 */
function FieldsPanel({ 
  fields, mappings, selectedField, setSelectedField, setCurrentPage, 
  numPages, currentPage, onEditField 
}) {
  return (
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
              Click &quot;Add Field&quot; and draw on the PDF to create fields
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
                <IconButton size="small" onClick={() => onEditField(field)}>
                  <EditIcon fontSize="small" />
                </IconButton>
              </ListItemSecondaryAction>
            </ListItem>
          ))
        )}
      </List>

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
  );
}

FieldsPanel.propTypes = {
  fields: PropTypes.array.isRequired,
  mappings: PropTypes.object.isRequired,
  selectedField: PropTypes.string,
  setSelectedField: PropTypes.func.isRequired,
  setCurrentPage: PropTypes.func.isRequired,
  numPages: PropTypes.number,
  currentPage: PropTypes.number.isRequired,
  onEditField: PropTypes.func.isRequired,
};

export default function TemplateEditor() {
  const { templateId } = useParams();
  const navigate = useNavigate();
  const { darkMode } = useThemeMode();
  const isDark = darkMode;

  // Template data hook - handles loading, PDF blob, and data paths
  const {
    template, setTemplate,
    fields, setFields,
    mappings, setMappings,
    loading, error,
    pdfBlobUrl,
    dataPaths,
  } = useTemplateData(templateId);

  // UI state
  const [saving, setSaving] = useState(false);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });

  // PDF state
  const [numPages, setNumPages] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [zoom, setZoom] = useState(1);
  const containerRef = useRef(null);
  const containerWidth = useContainerWidth(containerRef);

  // Selection state
  const [selectedField, setSelectedField] = useState(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingField, setEditingField] = useState(null);
  const [mappingDrawerOpen, setMappingDrawerOpen] = useState(false);

  // Field drawing hook - handles all drawing state and mouse events
  const handleFieldCreated = useCallback((newField) => {
    setFields((prev) => [...prev, newField]);
    setSelectedField(newField.id);
    setEditingField(newField);
    setEditDialogOpen(true);
  }, [setFields]);

  const {
    isDrawing,
    drawRect,
    drawMode,
    setDrawMode,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
  } = useFieldDrawing(template, currentPage, fields.length, handleFieldCreated);

  const onDocumentLoadSuccess = ({ numPages: pages }) => {
    setNumPages(pages);
    console.log('[TemplateEditor] PDF loaded, pages:', pages);
  };

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

  // Save fields
  const handleSaveFields = async () => {
    try {
      setSaving(true);
      await saveTemplateFields(templateId, fields);
      await saveTemplateMappings(templateId, mappings);
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
      // Save fields and mappings first
      await handleSaveFields();
      // Activate template
      await activateTemplate(templateId);
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

  // Delete field - needs fields in dependency for mapping lookup
  const handleDeleteField = useCallback((fieldId) => {
    const fieldToDelete = fields.find((f) => f.id === fieldId);
    setFields((prev) => prev.filter((f) => f.id !== fieldId));
    setSelectedField((prevSelected) => prevSelected === fieldId ? null : prevSelected);
    // Remove mapping if field had one
    if (fieldToDelete) {
      setMappings((prev) => {
        const updated = { ...prev };
        delete updated[fieldToDelete.name];
        return updated;
      });
    }
  }, [fields, setFields, setMappings]);

  // Open edit dialog for a field
  const openEditDialog = useCallback((f) => {
    setEditingField(f);
    setEditDialogOpen(true);
  }, []);

  // Render field overlays - uses extracted helper function
  const renderFieldOverlays = useCallback((pageElement) => {
    if (!pageElement) return null;
    
    return fields
      .filter((f) => f.page === currentPage)
      .map((field) => {
        const overlay = fieldToOverlay(field, pdfToScreenCoords, pageElement);
        if (!overlay) return null;

        return (
          <FieldOverlay
            key={field.id}
            field={overlay.field}
            screenPos={overlay.screenPos}
            isSelected={selectedField === field.id}
            hasMapping={!!mappings[field.name]}
            onSelect={setSelectedField}
            onEdit={openEditDialog}
            onDelete={handleDeleteField}
          />
        );
      });
  }, [fields, currentPage, pdfToScreenCoords, selectedField, mappings, openEditDialog, handleDeleteField]);

  // Callback for navigating back - must be before early returns (React hooks rule)
  const handleBack = useCallback(() => navigate('/smartforms'), [navigate]);

  // Early return states - extracted to separate components
  if (loading) return <LoadingState />;
  if (error) return <ErrorState error={error} onBack={handleBack} />;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 64px)' }}>
      {/* Toolbar - extracted component */}
      <EditorToolbar
        template={template}
        fields={fields}
        currentPage={currentPage}
        numPages={numPages}
        drawMode={drawMode}
        setDrawMode={setDrawMode}
        setMappingDrawerOpen={setMappingDrawerOpen}
        zoom={zoom}
        setZoom={setZoom}
        saving={saving}
        onSave={handleSaveFields}
        onActivate={handleActivate}
        onBack={handleBack}
      />

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
          {pdfBlobUrl ? (
            <Document
              file={pdfBlobUrl}
              onLoadSuccess={onDocumentLoadSuccess}
              onLoadError={(err) => {
                console.error('[TemplateEditor] PDF load error:', err);
                setError('Failed to load PDF: ' + err.message);
              }}
              loading={
                <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
                  <CircularProgress />
                </Box>
              }
              error={
                <Box sx={{ p: 4, textAlign: 'center' }}>
                  <Alert severity="error">Failed to load PDF. Please try again.</Alert>
                </Box>
              }
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
                    // Force re-render of overlays when page renders
                  }}
                  onRenderError={(err) => {
                    console.error('Page render error:', err);
                  }}
                  error={
                    <Box sx={{ p: 4, textAlign: 'center', bgcolor: 'white' }}>
                      <Alert severity="error">Failed to render page {currentPage}</Alert>
                    </Box>
                  }
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
          ) : (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', p: 4, minHeight: 400 }}>
              <CircularProgress />
              <Typography sx={{ ml: 2 }}>Loading PDF...</Typography>
            </Box>
          )}
        </Box>

        {/* Fields Panel - extracted component */}
        <FieldsPanel
          fields={fields}
          mappings={mappings}
          selectedField={selectedField}
          setSelectedField={setSelectedField}
          setCurrentPage={setCurrentPage}
          numPages={numPages}
          currentPage={currentPage}
          onEditField={openEditDialog}
                  />
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

