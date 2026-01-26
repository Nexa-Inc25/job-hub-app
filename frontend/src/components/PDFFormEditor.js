// src/components/PDFFormEditor.js
import React, { useState, useRef, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { Document, Page } from 'react-pdf';
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
import GestureIcon from '@mui/icons-material/Gesture';
import DrawIcon from '@mui/icons-material/Draw';
import CloseIcon from '@mui/icons-material/Close';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';

// PDF.js worker is set globally in App.js

const PDFFormEditor = ({ pdfUrl, jobInfo, onSave, documentName }) => {
  const [pdfBytes, setPdfBytes] = useState(null);
  const [numPages, setNumPages] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [annotations, setAnnotations] = useState([]);
  const [currentTool, setCurrentTool] = useState('text');
  const [fontSize, setFontSize] = useState(12);
  const [zoom, setZoom] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });
  const [currentText, setCurrentText] = useState('');
  const [selectedAnnotation, setSelectedAnnotation] = useState(null);
  const [signatureDialogOpen, setSignatureDialogOpen] = useState(false);
  const [savedSignature, setSavedSignature] = useState(null); // Base64 image of signature
  const [isDrawing, setIsDrawing] = useState(false);
  // Drag state for moving annotations
  const [isDragging, setIsDragging] = useState(false);
  const [dragAnnotationId, setDragAnnotationId] = useState(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const containerRef = useRef(null);
  const pageRef = useRef(null);
  const signatureCanvasRef = useRef(null);

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

    // Generate unique ID using timestamp + cryptographically secure random string
    const generateUniqueId = () => {
      const array = new Uint32Array(2);
      crypto.getRandomValues(array);
      return `${Date.now()}_${array[0].toString(36)}${array[1].toString(36)}`;
    };
    
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
    } else if (currentTool === 'signature') {
      if (savedSignature) {
        const newAnnotation = {
          id: generateUniqueId(),
          type: 'signature',
          x,
          y,
          imageData: savedSignature,
          width: 150, // Default signature width
          height: 50, // Default signature height
          page: currentPage
        };
        setAnnotations(prev => [...prev, newAnnotation]);
        console.log('Added signature annotation:', newAnnotation);
      } else {
        // Open signature dialog if no signature saved
        setSignatureDialogOpen(true);
      }
    }
  }, [currentTool, currentText, fontSize, zoom, currentPage, savedSignature]);

  // Signature canvas drawing functions
  const initSignatureCanvas = useCallback(() => {
    const canvas = signatureCanvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }, []);

  useEffect(() => {
    if (signatureDialogOpen) {
      // Small delay to ensure canvas is mounted
      setTimeout(initSignatureCanvas, 100);
    }
  }, [signatureDialogOpen, initSignatureCanvas]);

  const getCanvasCoords = (e, canvas) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    // Handle both mouse and touch events
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY
    };
  };

  const handleSignatureStart = (e) => {
    e.preventDefault();
    const canvas = signatureCanvasRef.current;
    if (!canvas) return;
    
    setIsDrawing(true);
    const ctx = canvas.getContext('2d');
    const coords = getCanvasCoords(e, canvas);
    ctx.beginPath();
    ctx.moveTo(coords.x, coords.y);
  };

  const handleSignatureMove = (e) => {
    if (!isDrawing) return;
    e.preventDefault();
    
    const canvas = signatureCanvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    const coords = getCanvasCoords(e, canvas);
    ctx.lineTo(coords.x, coords.y);
    ctx.stroke();
  };

  const handleSignatureEnd = () => {
    setIsDrawing(false);
  };

  const clearSignature = () => {
    initSignatureCanvas();
  };

  const saveSignature = () => {
    const canvas = signatureCanvasRef.current;
    if (!canvas) return;
    
    // Get the signature as a PNG data URL
    const dataUrl = canvas.toDataURL('image/png');
    setSavedSignature(dataUrl);
    setSignatureDialogOpen(false);
    setCurrentTool('signature');
  };

  // Start dragging an annotation
  const handleDragStart = (e, annotationId) => {
    e.stopPropagation();
    e.preventDefault();
    
    const annotation = annotations.find(a => a.id === annotationId);
    if (!annotation || !pageRef.current) return;
    
    const rect = pageRef.current.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    
    // Calculate offset from annotation position to click position
    const clickX = (clientX - rect.left) / zoom;
    const clickY = (clientY - rect.top) / zoom;
    
    setDragOffset({
      x: clickX - annotation.x,
      y: clickY - annotation.y
    });
    
    setIsDragging(true);
    setDragAnnotationId(annotationId);
    setSelectedAnnotation(annotationId);
  };

  // Handle drag movement
  const handleDragMove = useCallback((e) => {
    if (!isDragging || !dragAnnotationId || !pageRef.current) return;
    
    e.preventDefault();
    
    const rect = pageRef.current.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    
    // Calculate new position
    const newX = (clientX - rect.left) / zoom - dragOffset.x;
    const newY = (clientY - rect.top) / zoom - dragOffset.y;
    
    // Update annotation position
    setAnnotations(prev => prev.map(a => 
      a.id === dragAnnotationId 
        ? { ...a, x: Math.max(0, newX), y: Math.max(0, newY) }
        : a
    ));
  }, [isDragging, dragAnnotationId, zoom, dragOffset]);

  // End dragging
  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
    setDragAnnotationId(null);
    setDragOffset({ x: 0, y: 0 });
  }, []);

  // Add global mouse/touch listeners for dragging
  useEffect(() => {
    if (isDragging) {
      const handleMouseMove = (e) => handleDragMove(e);
      const handleMouseUp = () => handleDragEnd();
      const handleTouchMove = (e) => handleDragMove(e);
      const handleTouchEnd = () => handleDragEnd();
      
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.addEventListener('touchmove', handleTouchMove, { passive: false });
      document.addEventListener('touchend', handleTouchEnd);
      
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        document.removeEventListener('touchmove', handleTouchMove);
        document.removeEventListener('touchend', handleTouchEnd);
      };
    }
  }, [isDragging, handleDragMove, handleDragEnd]);

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

      // Helper to draw a single annotation on a page
      const drawAnnotation = async (annotation, page, pageHeight, font, pdfDoc) => {
        const y = pageHeight - annotation.y;
        
        if (annotation.type === 'text') {
          page.drawText(annotation.text, {
            x: annotation.x, y, size: annotation.fontSize, font, color: rgb(0, 0, 0),
          });
          return;
        }
        
        if (annotation.type === 'check') {
          page.drawText('X', {
            x: annotation.x, y, size: annotation.size, font, color: rgb(0, 0, 0),
          });
          return;
        }
        
        if (annotation.type === 'signature' && annotation.imageData) {
          try {
            const signatureBase64 = annotation.imageData.split(',')[1];
            const signatureBytes = Uint8Array.from(atob(signatureBase64), c => c.codePointAt(0));
            const signatureImage = await pdfDoc.embedPng(signatureBytes);
            page.drawImage(signatureImage, {
              x: annotation.x,
              y: y - annotation.height,
              width: annotation.width,
              height: annotation.height,
            });
          } catch (sigErr) {
            console.error('Error embedding signature:', sigErr);
          }
        }
      };

      // Add annotations to PDF
      for (const annotation of annotations) {
        const pageIndex = (annotation.page || 1) - 1;
        if (pageIndex >= pages.length) continue;
        
        const page = pages[pageIndex];
        const { height } = page.getSize();
        await drawAnnotation(annotation, page, height, helveticaFont, pdfDoc);
      }

      // Get the modified PDF bytes
      const modifiedPdfBytes = await pdfDoc.save();

      // Convert to base64 for sending to server
      const base64 = btoa(
        new Uint8Array(modifiedPdfBytes)
          .reduce((data, byte) => data + String.fromCodePoint(byte), '')
      );

      // Call the onSave callback with the modified PDF
      if (onSave) {
        await onSave(base64, documentName);
      }

      setSnackbar({ open: true, message: 'Document saved successfully!', severity: 'success' });
      setAnnotations([]); // Clear annotations after save
    } catch (err) {
      console.error('Error saving PDF:', err);
      let errorMsg = 'Failed to save';
      if (err.code === 'ECONNABORTED' || err.message?.includes('timeout')) {
        errorMsg = 'Request timed out - PDF may be too large';
      } else if (err.code === 'ERR_NETWORK' || err.message?.includes('Network Error')) {
        errorMsg = 'Network error - check your connection';
      } else if (err.response?.data?.error) {
        errorMsg = err.response.data.error;
      } else if (err.message) {
        errorMsg = err.message;
      }
      setSnackbar({ open: true, message: 'Failed to save: ' + errorMsg, severity: 'error' });
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
          <ToggleButton value="signature">
            <Tooltip title="Add Signature">
              <GestureIcon />
            </Tooltip>
          </ToggleButton>
        </ToggleButtonGroup>

        {/* Signature status */}
        {currentTool === 'signature' && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {savedSignature ? (
              <>
                <Typography variant="caption" color="success.main">
                  ✓ Signature ready - click on PDF to place
                </Typography>
                <Button 
                  size="small" 
                  onClick={() => setSignatureDialogOpen(true)}
                  startIcon={<DrawIcon />}
                >
                  Redraw
                </Button>
              </>
            ) : (
              <Button 
                size="small" 
                variant="outlined"
                onClick={() => setSignatureDialogOpen(true)}
                startIcon={<DrawIcon />}
              >
                Draw Signature
              </Button>
            )}
          </Box>
        )}

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
                  cursor: isDragging && dragAnnotationId === annotation.id ? 'grabbing' : 'grab',
                  '&:hover': { 
                    bgcolor: 'rgba(255,255,0,0.3)',
                    boxShadow: '0 0 0 2px rgba(25, 118, 210, 0.5)',
                  },
                  padding: '2px',
                  borderRadius: '2px',
                  border: selectedAnnotation === annotation.id ? '2px solid blue' : '1px dashed transparent',
                  zIndex: isDragging && dragAnnotationId === annotation.id ? 100 : 10,
                  transition: isDragging ? 'none' : 'box-shadow 0.2s',
                  userSelect: 'none',
                  touchAction: 'none',
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  if (!isDragging) {
                    setSelectedAnnotation(annotation.id);
                  }
                }}
                onMouseDown={(e) => handleDragStart(e, annotation.id)}
                onTouchStart={(e) => handleDragStart(e, annotation.id)}
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
                ) : annotation.type === 'signature' ? (
                  <img 
                    src={annotation.imageData} 
                    alt="Signature"
                    style={{
                      width: annotation.width * zoom,
                      height: annotation.height * zoom,
                      pointerEvents: 'none',
                    }}
                  />
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
          <strong>How to edit:</strong> 1) Select <strong>Text</strong>, <strong>Checkmark</strong>, or <strong>Signature</strong> tool → 
          2) For text: type in the field above → 
          3) <strong>Click directly on the PDF</strong> where you want to place it → 
          4) <strong>Drag to reposition</strong> if needed → 
          5) Click <strong>Save Changes</strong> when done
        </Typography>
      </Paper>

      {/* Signature Drawing Dialog */}
      <Dialog 
        open={signatureDialogOpen} 
        onClose={() => setSignatureDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <GestureIcon color="primary" />
            Draw Your Signature
          </Box>
          <IconButton size="small" onClick={() => setSignatureDialogOpen(false)}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Use your finger, stylus, or Apple Pencil to sign below. Your signature will be saved for this session.
          </Typography>
          <Box 
            sx={{ 
              border: '2px solid',
              borderColor: 'grey.400',
              borderRadius: 1,
              bgcolor: 'white',
              touchAction: 'none', // Prevent scrolling while drawing
              cursor: 'crosshair',
            }}
          >
            <canvas
              ref={signatureCanvasRef}
              width={500}
              height={150}
              style={{ 
                width: '100%', 
                height: 150,
                display: 'block',
              }}
              onMouseDown={handleSignatureStart}
              onMouseMove={handleSignatureMove}
              onMouseUp={handleSignatureEnd}
              onMouseLeave={handleSignatureEnd}
              onTouchStart={handleSignatureStart}
              onTouchMove={handleSignatureMove}
              onTouchEnd={handleSignatureEnd}
            />
          </Box>
          <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
            Tip: Sign naturally - this will be embedded in the PDF exactly as drawn.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={clearSignature} color="inherit">
            Clear
          </Button>
          <Button onClick={() => setSignatureDialogOpen(false)}>
            Cancel
          </Button>
          <Button onClick={saveSignature} variant="contained" color="primary">
            Use This Signature
          </Button>
        </DialogActions>
      </Dialog>

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

PDFFormEditor.propTypes = {
  pdfUrl: PropTypes.string.isRequired,
  jobInfo: PropTypes.shape({
    pmNumber: PropTypes.string,
    woNumber: PropTypes.string,
    notificationNumber: PropTypes.string,
    address: PropTypes.string,
    city: PropTypes.string,
    client: PropTypes.string,
  }),
  onSave: PropTypes.func,
  documentName: PropTypes.string,
};

export default PDFFormEditor;
