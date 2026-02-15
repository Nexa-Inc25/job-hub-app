/**
 * TemplateEditor - Orchestrator for SmartForms PDF template editor
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 *
 * Sub-components: FieldMapper, FieldMappingList, TemplatePreview
 */
import React, { useState, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box, Typography, Button, Paper, IconButton, CircularProgress, Alert,
  Chip, Divider, List, ListItem, ListItemText, ListItemSecondaryAction,
  Tooltip, Snackbar,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SaveIcon from '@mui/icons-material/Save';
import AddBoxIcon from '@mui/icons-material/AddBox';
import EditIcon from '@mui/icons-material/Edit';
import LinkIcon from '@mui/icons-material/Link';
import ZoomInIcon from '@mui/icons-material/ZoomIn';
import ZoomOutIcon from '@mui/icons-material/ZoomOut';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import { useThemeMode } from '../../ThemeContext';
import { renderFieldOverlays, FieldEditDialog } from './FieldMapper';
import FieldMappingList from './FieldMappingList';
import TemplatePreview from './TemplatePreview';

const API_BASE = import.meta.env.VITE_API_URL || '';

// ——— API helpers ———
async function fetchWithAuth(url, options = {}) {
  const token = localStorage.getItem('token');
  return fetch(url, { ...options, headers: { Authorization: `Bearer ${token}`, ...options.headers } });
}
async function loadTemplateData(id) { const r = await fetchWithAuth(`${API_BASE}/api/smartforms/templates/${id}`); if (!r.ok) throw new Error('Failed to load template'); return r.json(); }
async function loadPdfBlob(id) { const r = await fetchWithAuth(`${API_BASE}/api/smartforms/templates/${id}/pdf`); if (!r.ok) throw new Error('Failed to fetch PDF'); return URL.createObjectURL(await r.blob()); }
async function loadDataPaths() { const r = await fetchWithAuth(`${API_BASE}/api/smartforms/data-paths`); return r.ok ? r.json() : []; }
async function saveTemplateFields(id, fields) { const r = await fetchWithAuth(`${API_BASE}/api/smartforms/templates/${id}/fields`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fields }) }); if (!r.ok) throw new Error('Failed to save fields'); return r.json(); }
async function saveTemplateMappings(id, mappings) { const r = await fetchWithAuth(`${API_BASE}/api/smartforms/templates/${id}/mappings`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mappings }) }); if (!r.ok) throw new Error('Failed to save mappings'); return r.json(); }
async function activateTemplate(id) { const r = await fetchWithAuth(`${API_BASE}/api/smartforms/templates/${id}/activate`, { method: 'POST' }); if (!r.ok) throw new Error('Failed to activate template'); return r.json(); }

function convertMappingsToObject(dm) { if (!dm) return {}; const o = {}; for (const [k, v] of Object.entries(dm)) o[k] = v; return o; }
function generateFieldId() { return `field_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`; } // NOSONAR
function calculateDrawRect(sx, sy, cx, cy) { return { left: Math.min(sx, cx), top: Math.min(sy, cy), width: Math.abs(cx - sx), height: Math.abs(cy - sy) }; }

// ——— Custom hooks ———
function useTemplateData(templateId) {
  const [template, setTemplate] = useState(null);
  const [fields, setFields] = useState([]);
  const [mappings, setMappings] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pdfBlobUrl, setPdfBlobUrl] = useState(null);
  const [dataPaths, setDataPaths] = useState([]);
  useEffect(() => { setLoading(true); loadTemplateData(templateId).then(d => { setTemplate(d); setFields(d.fields || []); setMappings(convertMappingsToObject(d.dataMappings)); setError(''); }).catch(e => { console.error('Error loading template:', e); setError(e.message); }).finally(() => setLoading(false)); }, [templateId]);
  useEffect(() => { if (!template) return; let url = null; loadPdfBlob(templateId).then(u => { url = u; setPdfBlobUrl(u); }).catch(e => { console.error('[TemplateEditor] PDF blob error:', e); setError('Failed to load PDF: ' + e.message); }); return () => { if (url) URL.revokeObjectURL(url); }; }, [template, templateId]);
  useEffect(() => { loadDataPaths().then(d => setDataPaths(d)).catch(e => console.error('Error loading data paths:', e)); }, []);
  return { template, setTemplate, fields, setFields, mappings, setMappings, loading, error, setError, pdfBlobUrl, dataPaths };
}

function useFieldDrawing(template, currentPage, fieldsLength, onFieldCreated) {
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawStart, setDrawStart] = useState(null);
  const [drawRect, setDrawRect] = useState(null);
  const [drawMode, setDrawMode] = useState(false);
  const handleMouseDown = useCallback((e) => { if (!drawMode) return; const r = e.currentTarget.getBoundingClientRect(); const sx = e.clientX - r.left; const sy = e.clientY - r.top; setIsDrawing(true); setDrawStart({ x: sx, y: sy }); setDrawRect({ left: sx, top: sy, width: 0, height: 0 }); }, [drawMode]);
  const handleMouseMove = useCallback((e) => { if (!isDrawing || !drawStart) return; const r = e.currentTarget.getBoundingClientRect(); setDrawRect(calculateDrawRect(drawStart.x, drawStart.y, e.clientX - r.left, e.clientY - r.top)); }, [isDrawing, drawStart]);
  const handleMouseUp = useCallback((e) => {
    if (!isDrawing || !drawRect || !drawStart) { setIsDrawing(false); return; }
    if (drawRect.width < 10 || drawRect.height < 10) { setIsDrawing(false); setDrawRect(null); setDrawStart(null); return; }
    const pageDim = template?.sourceFile?.pageDimensions?.[currentPage - 1]; if (!pageDim) return;
    const pr = e.currentTarget.getBoundingClientRect(); const scaleX = pageDim.width / pr.width; const scaleY = pageDim.height / pr.height;
    const newField = { id: generateFieldId(), name: `field_${fieldsLength + 1}`, label: `Field ${fieldsLength + 1}`, page: currentPage, type: 'text',
      bounds: { x: drawRect.left * scaleX, y: pageDim.height - (drawRect.top + drawRect.height) * scaleY, width: drawRect.width * scaleX, height: drawRect.height * scaleY }, fontSize: 10, fontColor: '#000000', required: false };
    onFieldCreated(newField); setIsDrawing(false); setDrawRect(null); setDrawStart(null); setDrawMode(false);
  }, [isDrawing, drawRect, drawStart, currentPage, template, fieldsLength, onFieldCreated]);
  const handleMouseLeave = useCallback(() => { if (isDrawing) { setIsDrawing(false); setDrawRect(null); setDrawStart(null); } }, [isDrawing]);
  return { isDrawing, drawRect, drawMode, setDrawMode, handleMouseDown, handleMouseMove, handleMouseUp, handleMouseLeave };
}

// ——— FieldsPanel (sidebar) ———
function FieldsPanel({ fields, mappings, selectedField, setSelectedField, setCurrentPage, numPages, currentPage, onEditField }) {
  return (
    <Paper sx={{ width: 300, flexShrink: 0, overflow: 'auto', borderLeft: 1, borderColor: 'divider' }}>
      <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}><Typography variant="subtitle1" fontWeight={600}>Fields ({fields.length})</Typography></Box>
      <List dense>
        {fields.length === 0 ? (<Box sx={{ p: 3, textAlign: 'center' }}><Typography variant="body2" color="text.secondary">Click &quot;Add Field&quot; and draw on the PDF to create fields</Typography></Box>) : (
          fields.map(field => (
            <ListItem key={field.id} button selected={selectedField === field.id}
              onClick={() => { setSelectedField(field.id); setCurrentPage(field.page); }}
              sx={{ borderLeft: 3, borderColor: mappings[field.name] ? 'success.main' : 'transparent' }}>
              <ListItemText primary={field.name} secondary={<>{field.type} • Page {field.page}{mappings[field.name] && <Typography component="span" variant="caption" color="success.main" sx={{ display: 'block' }}>→ {mappings[field.name]}</Typography>}</>} />
              <ListItemSecondaryAction><IconButton size="small" onClick={() => onEditField(field)} aria-label="Edit field"><EditIcon fontSize="small" /></IconButton></ListItemSecondaryAction>
            </ListItem>
          ))
        )}
      </List>
      {numPages > 1 && (
        <Box sx={{ p: 2, borderTop: 1, borderColor: 'divider' }}>
          <Typography variant="caption" color="text.secondary" gutterBottom>Navigate Pages</Typography>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 1 }}>
            {Array.from({ length: numPages }, (_, i) => <Chip key={i + 1} label={i + 1} size="small" color={currentPage === i + 1 ? 'primary' : 'default'} onClick={() => setCurrentPage(i + 1)} />)}
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

// ——— Main Component ———
export default function TemplateEditor() {
  const { templateId } = useParams();
  const navigate = useNavigate();
  const { darkMode } = useThemeMode();
  const { template, setTemplate, fields, setFields, mappings, setMappings, loading, error, setError, pdfBlobUrl, dataPaths } = useTemplateData(templateId);
  const [saving, setSaving] = useState(false);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });
  const [numPages, setNumPages] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [_pgRender, setPgRender] = useState(0);
  const [selectedField, setSelectedField] = useState(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingField, setEditingField] = useState(null);
  const [mappingDrawerOpen, setMappingDrawerOpen] = useState(false);

  const handleFieldCreated = useCallback((f) => { setFields(p => [...p, f]); setSelectedField(f.id); setEditingField(f); setEditDialogOpen(true); }, [setFields]);
  const { isDrawing, drawRect, drawMode, setDrawMode, handleMouseDown, handleMouseMove, handleMouseUp, handleMouseLeave } = useFieldDrawing(template, currentPage, fields.length, handleFieldCreated);

  const pdfToScreenCoords = useCallback((px, py, pw, ph, el) => {
    if (!el || !template?.sourceFile?.pageDimensions) return { left: 0, top: 0, width: 0, height: 0 };
    const r = el.getBoundingClientRect(); const pd = template.sourceFile.pageDimensions[currentPage - 1]; if (!pd) return { left: 0, top: 0, width: 0, height: 0 };
    const sx = r.width / pd.width; const sy = r.height / pd.height;
    return { left: px * sx, top: (pd.height - py - ph) * sy, width: pw * sx, height: ph * sy };
  }, [template, currentPage]);

  const handleSaveFields = async () => {
    try { setSaving(true); await saveTemplateFields(templateId, fields); await saveTemplateMappings(templateId, mappings); setSnackbar({ open: true, message: 'Template saved!', severity: 'success' });
    } catch (e) { setSnackbar({ open: true, message: e.message, severity: 'error' }); } finally { setSaving(false); }
  };
  const handleActivate = async () => {
    if (fields.length === 0) { setSnackbar({ open: true, message: 'Add at least one field', severity: 'warning' }); return; }
    try { setSaving(true); await handleSaveFields(); await activateTemplate(templateId); setTemplate(p => ({ ...p, status: 'active' })); setSnackbar({ open: true, message: 'Template activated!', severity: 'success' });
    } catch (e) { setSnackbar({ open: true, message: e.message, severity: 'error' }); } finally { setSaving(false); }
  };
  const handleDeleteField = useCallback((fid) => {
    const fd = fields.find(f => f.id === fid);
    setFields(p => p.filter(f => f.id !== fid)); setSelectedField(p => p === fid ? null : p);
    if (fd) setMappings(p => { const u = { ...p }; delete u[fd.name]; return u; });
  }, [fields, setFields, setMappings]);
  const openEditDialog = useCallback((f) => { setEditingField(f); setEditDialogOpen(true); }, []);

  const overlayRenderer = useCallback((pageEl) => renderFieldOverlays(fields, currentPage, pdfToScreenCoords, pageEl, selectedField, mappings, setSelectedField, openEditDialog, handleDeleteField), [fields, currentPage, pdfToScreenCoords, selectedField, mappings, openEditDialog, handleDeleteField]);

  const handleBack = useCallback(() => navigate('/smartforms'), [navigate]);
  if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '80vh' }}><CircularProgress /></Box>;
  if (error) return <Box sx={{ p: 3 }}><Alert severity="error">{error}</Alert><Button startIcon={<ArrowBackIcon />} onClick={handleBack} sx={{ mt: 2 }}>Back to SmartForms</Button></Box>;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 64px)' }}>
      {/* Toolbar */}
      <Paper sx={{ px: 2, py: 1, display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
        <IconButton onClick={handleBack} aria-label="Go back"><ArrowBackIcon /></IconButton>
        <Box sx={{ flex: 1 }}><Typography variant="h6" fontWeight={600}>{template?.name}</Typography><Typography variant="caption" color="text.secondary">{fields.length} field{fields.length === 1 ? '' : 's'} • Page {currentPage} of {numPages || 1}</Typography></Box>
        <Chip label={template?.status === 'active' ? 'Active' : 'Draft'} color={template?.status === 'active' ? 'success' : 'warning'} size="small" />
        <Divider orientation="vertical" flexItem />
        <Tooltip title="Draw New Field"><Button variant={drawMode ? 'contained' : 'outlined'} startIcon={<AddBoxIcon />} onClick={() => setDrawMode(!drawMode)} color={drawMode ? 'secondary' : 'primary'}>{drawMode ? 'Drawing...' : 'Add Field'}</Button></Tooltip>
        <Tooltip title="Map Data"><Button variant="outlined" startIcon={<LinkIcon />} onClick={() => setMappingDrawerOpen(true)}>Mappings</Button></Tooltip>
        <Divider orientation="vertical" flexItem />
        <IconButton onClick={() => setZoom(z => Math.max(0.5, z - 0.25))} aria-label="Zoom out"><ZoomOutIcon /></IconButton>
        <Typography variant="body2" sx={{ minWidth: 40, textAlign: 'center' }}>{Math.round(zoom * 100)}%</Typography>
        <IconButton onClick={() => setZoom(z => Math.min(2, z + 0.25))} aria-label="Zoom in"><ZoomInIcon /></IconButton>
        <Divider orientation="vertical" flexItem />
        <Button variant="outlined" startIcon={saving ? <CircularProgress size={20} /> : <SaveIcon />} onClick={handleSaveFields} disabled={saving}>Save</Button>
        {template?.status !== 'active' && <Button variant="contained" color="success" startIcon={<PlayArrowIcon />} onClick={handleActivate} disabled={saving || fields.length === 0}>Activate</Button>}
      </Paper>

      <Box sx={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <TemplatePreview
          pdfBlobUrl={pdfBlobUrl} currentPage={currentPage} zoom={zoom} isDark={darkMode}
          drawMode={drawMode} onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseLeave}
          isDrawing={isDrawing} drawRect={drawRect}
          onDocumentLoadSuccess={({ numPages: p }) => setNumPages(p)} onError={setError}
          renderOverlays={overlayRenderer} onPageRendered={() => setPgRender(p => p + 1)}
        />
        <FieldsPanel fields={fields} mappings={mappings} selectedField={selectedField} setSelectedField={setSelectedField} setCurrentPage={setCurrentPage} numPages={numPages} currentPage={currentPage} onEditField={openEditDialog} />
      </Box>

      <FieldEditDialog
        open={editDialogOpen} field={editingField} dataPaths={dataPaths} mappings={mappings}
        onFieldChange={setEditingField} onMappingsChange={setMappings} onDelete={handleDeleteField}
        onClose={() => setEditDialogOpen(false)}
        onSave={() => { if (editingField) { setFields(p => p.map(f => f.id === editingField.id ? { ...f, ...editingField } : f)); } setEditDialogOpen(false); }}
      />
      <FieldMappingList open={mappingDrawerOpen} onClose={() => setMappingDrawerOpen(false)} fields={fields} mappings={mappings} onMappingsChange={setMappings} dataPaths={dataPaths} onSave={handleSaveFields} />

      <Snackbar open={snackbar.open} autoHideDuration={4000} onClose={() => setSnackbar(s => ({ ...s, open: false }))} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity={snackbar.severity} onClose={() => setSnackbar(s => ({ ...s, open: false }))}>{snackbar.message}</Alert>
      </Snackbar>
    </Box>
  );
}
