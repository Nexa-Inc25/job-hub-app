// src/components/PDFFormEditor.js
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import {
  Box,
  Button,
  IconButton,
  Tooltip,
  TextField,
  Paper,
  Typography,
  Slider,
  ToggleButton,
  ToggleButtonGroup,
  CircularProgress,
  Alert,
  Snackbar,
  Divider,
} from '@mui/material';
import SaveIcon from '@mui/icons-material/Save';
import TextFieldsIcon from '@mui/icons-material/TextFields';
import CheckBoxIcon from '@mui/icons-material/CheckBox';
import UndoIcon from '@mui/icons-material/Undo';
import ZoomInIcon from '@mui/icons-material/ZoomIn';
import ZoomOutIcon from '@mui/icons-material/ZoomOut';
import DeleteIcon from '@mui/icons-material/Delete';
import NavigateBeforeIcon from '@mui/icons-material/NavigateBefore';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';

// Set up PDF.js worker - use legacy CommonJS build for CRA compatibility
pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js';

const PDFFormEditor = ({ pdfUrl, jobInfo, onSave, documentName }) => {
  const [pdfBytes, setPdfBytes] = useState(null);
  const [numPages, setNumPages] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [annotations, setAnnotations] = useState([]);
  const [currentTool, setCurrentTool] = useState('text');
  const [fontSize, setFontSize] = useState(12);
  const [zoom, setZoom] = useState(1.0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });
  const [currentText, setCurrentText] = useState('');
  const [selectedAnnotation, setSelectedAnnotation] = useState(null);
  const containerRef = useRef(null);
  const pageRef = useRef(null);

  // Load PDF bytes for pdf-lib
  useEffect(() => {
    const loadPdfBytes = async () => {
      try {
        setLoading(true);
        const response = await fetch(pdfUrl);
        if (!response.ok) throw new Error('Failed to load PDF');
        const arrayBuffer = await response.arrayBuffer();
        setPdfBytes(arrayBuffer);
        setError('');
      } catch (err) {
        console.error('Error loading PDF:', err);
        setError('Failed to load PDF: ' + err.message);
      } finally {
        setLoading(false);
      }
    };

    if (pdfUrl) {
      loadPdfBytes();
    }
  }, [pdfUrl]);

  const onDocumentLoadSuccess = ({ numPages }) => {
    setNumPages(numPages);
    setLoading(false);
  };


  // Handle click on PDF to add annotation
  const handlePageClick = useCallback((e) => {
    if (!pageRef.current) return;

    const rect = pageRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / zoom;
    const y = (e.clientY - rect.top) / zoom;

    console.log('Click at:', x, y, 'Tool:', currentTool, 'Text:', currentText);

    // Generate unique ID using timestamp + random string to prevent collisions
    const generateUniqueId = () => `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    if (currentTool === 'text') {
      if (currentText.trim()) {
        const newAnnotation = {
          id: generateUniqueId(),
          type: 'text',
          x,
          y,
          text: currentText,
          fontSize,
          color: 'black',
          page: currentPage
        };
        setAnnotations(prev => [...prev, newAnnotation]);
        setCurrentText('');
        console.log('Added text annotation:', newAnnotation);
      }
    } else if (currentTool === 'check') {
      const newAnnotation = {
        id: generateUniqueId(),
        type: 'check',
        x,
        y,
        size: fontSize,
        page: currentPage
      };
      setAnnotations(prev => [...prev, newAnnotation]);
      console.log('Added check annotation:', newAnnotation);
    }
  }, [currentTool, currentText, fontSize, zoom, currentPage]);

  // Remove annotation
  const handleRemoveAnnotation = (id) => {
    setAnnotations(annotations.filter(a => a.id !== id));
    setSelectedAnnotation(null);
  };

  // Undo last annotation
  const handleUndo = () => {
    setAnnotations(annotations.slice(0, -1));
  };

  // Save PDF with annotations
  const handleSave = async () => {
    if (!pdfBytes || annotations.length === 0) {
      setSnackbar({ open: true, message: 'No changes to save', severity: 'info' });
      return;
    }

    try {
      setSaving(true);

      // Load the PDF with pdf-lib
      const pdfDoc = await PDFDocument.load(pdfBytes);
      const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const pages = pdfDoc.getPages();

      // Add annotations to PDF
      for (const annotation of annotations) {
        const pageIndex = (annotation.page || 1) - 1;
        if (pageIndex >= pages.length) continue;
        
        const page = pages[pageIndex];
        const { height } = page.getSize();

        if (annotation.type === 'text') {
          page.drawText(annotation.text, {
            x: annotation.x,
            y: height - annotation.y, // Flip Y coordinate (PDF origin is bottom-left)
            size: annotation.fontSize,
            font: helveticaFont,
            color: rgb(0, 0, 0),
          });
        } else if (annotation.type === 'check') {
          page.drawText('✓', {
            x: annotation.x,
            y: height - annotation.y,
            size: annotation.size,
            font: helveticaFont,
            color: rgb(0, 0, 0),
          });
        }
      }

      // Get the modified PDF bytes
      const modifiedPdfBytes = await pdfDoc.save();

      // Convert to base64 for sending to server
      const base64 = btoa(
        new Uint8Array(modifiedPdfBytes)
          .reduce((data, byte) => data + String.fromCharCode(byte), '')
      );

      // Call the onSave callback with the modified PDF
      if (onSave) {
        await onSave(base64, documentName);
      }

      setSnackbar({ open: true, message: 'Document saved successfully!', severity: 'success' });
      setAnnotations([]); // Clear annotations after save
    } catch (err) {
      console.error('Error saving PDF:', err);
      setSnackbar({ open: true, message: 'Failed to save: ' + err.message, severity: 'error' });
    } finally {
      setSaving(false);
    }
  };

  // Quick fill buttons for common job info
  const quickFillOptions = [
    { label: 'PM#', value: jobInfo?.pmNumber },
    { label: 'WO#', value: jobInfo?.woNumber },
    { label: 'Notification', value: jobInfo?.notificationNumber },
    { label: 'Address', value: jobInfo?.address },
    { label: 'City', value: jobInfo?.city },
    { label: 'Client', value: jobInfo?.client },
    { label: 'Date', value: new Date().toLocaleDateString() },
  ].filter(opt => opt.value);

  // Get annotations for current page
  const currentPageAnnotations = annotations.filter(a => (a.page || 1) === currentPage);

  if (error) {
    return <Alert severity="error">{error}</Alert>;
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Toolbar */}
      <Paper sx={{ p: 1, mb: 1, display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
        {/* Tool Selection */}
        <ToggleButtonGroup
          value={currentTool}
          exclusive
          onChange={(e, val) => val && setCurrentTool(val)}
          size="small"
        >
          <ToggleButton value="text">
            <Tooltip title="Add Text">
              <TextFieldsIcon />
            </Tooltip>
          </ToggleButton>
          <ToggleButton value="check">
            <Tooltip title="Add Checkmark">
              <CheckBoxIcon />
            </Tooltip>
          </ToggleButton>
        </ToggleButtonGroup>

        <Divider orientation="vertical" flexItem />

        {/* Text Input */}
        {currentTool === 'text' && (
          <TextField
            size="small"
            placeholder="Type text, then click on PDF"
            value={currentText}
            onChange={(e) => setCurrentText(e.target.value)}
            sx={{ minWidth: 200 }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
              }
            }}
          />
        )}

        {/* Font Size */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 150 }}>
          <Typography variant="caption">Size:</Typography>
          <Slider
            value={fontSize}
            onChange={(e, val) => setFontSize(val)}
            min={8}
            max={24}
            size="small"
            sx={{ width: 80 }}
          />
          <Typography variant="caption">{fontSize}</Typography>
        </Box>

        <Divider orientation="vertical" flexItem />

        {/* Zoom */}
        <IconButton size="small" onClick={() => setZoom(z => Math.max(0.5, z - 0.1))}>
          <ZoomOutIcon />
        </IconButton>
        <Typography variant="caption">{Math.round(zoom * 100)}%</Typography>
        <IconButton size="small" onClick={() => setZoom(z => Math.min(2, z + 0.1))}>
          <ZoomInIcon />
        </IconButton>

        <Divider orientation="vertical" flexItem />

        {/* Undo */}
        <Tooltip title="Undo">
          <span>
            <IconButton size="small" onClick={handleUndo} disabled={annotations.length === 0}>
              <UndoIcon />
            </IconButton>
          </span>
        </Tooltip>

        {/* Save */}
        <Button
          variant="contained"
          color="primary"
          startIcon={saving ? <CircularProgress size={16} /> : <SaveIcon />}
          onClick={handleSave}
          disabled={saving || annotations.length === 0}
          sx={{ ml: 'auto' }}
        >
          {saving ? 'Saving...' : 'Save Changes'}
        </Button>
      </Paper>

      {/* Quick Fill Buttons */}
      {quickFillOptions.length > 0 && (
        <Paper sx={{ p: 1, mb: 1 }}>
          <Typography variant="caption" color="text.secondary" sx={{ mr: 1 }}>
            Quick Fill (click to add to text field):
          </Typography>
          {quickFillOptions.map((opt, idx) => (
            <Button
              key={idx}
              size="small"
              variant="outlined"
              sx={{ mr: 0.5, mb: 0.5, textTransform: 'none' }}
              onClick={() => setCurrentText(opt.value)}
            >
              {opt.label}: {opt.value}
            </Button>
          ))}
        </Paper>
      )}

      {/* Page Navigation */}
      {numPages && numPages > 1 && (
        <Paper sx={{ p: 1, mb: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
          <IconButton 
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            disabled={currentPage <= 1}
          >
            <NavigateBeforeIcon />
          </IconButton>
          <Typography>
            Page {currentPage} of {numPages}
          </Typography>
          <IconButton 
            onClick={() => setCurrentPage(p => Math.min(numPages, p + 1))}
            disabled={currentPage >= numPages}
          >
            <NavigateNextIcon />
          </IconButton>
        </Paper>
      )}

      {/* PDF Display with Annotations Overlay */}
      <Box
        ref={containerRef}
        sx={{
          flex: 1,
          overflow: 'auto',
          bgcolor: 'grey.300',
          display: 'flex',
          justifyContent: 'center',
          p: 2,
        }}
      >
        <Box
          sx={{
            position: 'relative',
            cursor: currentTool === 'text' ? 'text' : 'crosshair',
            boxShadow: 3,
          }}
        >
          {/* PDF Page */}
          <Box
            ref={pageRef}
            onClick={handlePageClick}
            sx={{ position: 'relative' }}
          >
            {loading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 400, width: 600, bgcolor: 'white' }}>
                <CircularProgress />
                <Typography sx={{ ml: 2 }}>Loading PDF...</Typography>
              </Box>
            ) : (
              <Document
                file={pdfUrl}
                onLoadSuccess={onDocumentLoadSuccess}
                loading={
                  <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 400, width: 600, bgcolor: 'white' }}>
                    <CircularProgress />
                  </Box>
                }
              >
                <Page
                  pageNumber={currentPage}
                  scale={zoom}
                  renderTextLayer={false}
                  renderAnnotationLayer={false}
                />
              </Document>
            )}

            {/* Annotations Overlay */}
            {currentPageAnnotations.map((annotation) => (
              <Box
                key={annotation.id}
                sx={{
                  position: 'absolute',
                  left: annotation.x * zoom,
                  top: annotation.y * zoom,
                  cursor: 'pointer',
                  '&:hover': { bgcolor: 'rgba(255,255,0,0.3)' },
                  padding: '2px',
                  borderRadius: '2px',
                  border: selectedAnnotation === annotation.id ? '2px solid blue' : 'none',
                  zIndex: 10,
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedAnnotation(annotation.id);
                }}
              >
                {annotation.type === 'text' ? (
                  <Typography
                    sx={{
                      fontSize: annotation.fontSize * zoom,
                      fontFamily: 'Helvetica, Arial, sans-serif',
                      color: 'black',
                      whiteSpace: 'nowrap',
                      lineHeight: 1,
                    }}
                  >
                    {annotation.text}
                  </Typography>
                ) : (
                  <Typography sx={{ fontSize: annotation.size * zoom, color: 'green', lineHeight: 1 }}>
                    ✓
                  </Typography>
                )}
                {selectedAnnotation === annotation.id && (
                  <IconButton
                    size="small"
                    sx={{
                      position: 'absolute',
                      top: -24,
                      right: -24,
                      bgcolor: 'error.main',
                      color: 'white',
                      '&:hover': { bgcolor: 'error.dark' },
                      width: 24,
                      height: 24,
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRemoveAnnotation(annotation.id);
                    }}
                  >
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                )}
              </Box>
            ))}
          </Box>
        </Box>
      </Box>

      {/* Instructions */}
      <Paper sx={{ p: 1, mt: 1, bgcolor: 'info.light' }}>
        <Typography variant="body2" color="text.primary">
          <strong>How to edit:</strong> 1) Select <strong>Text</strong> or <strong>Checkmark</strong> tool → 
          2) For text: type in the field above → 
          3) <strong>Click directly on the PDF</strong> where you want to place it → 
          4) Click <strong>Save Changes</strong> when done
        </Typography>
      </Paper>

      {/* Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
      >
        <Alert severity={snackbar.severity}>{snackbar.message}</Alert>
      </Snackbar>
    </Box>
  );
};

export default PDFFormEditor;
