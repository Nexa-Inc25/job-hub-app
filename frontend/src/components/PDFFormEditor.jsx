// src/components/PDFFormEditor.js - Foreman-Optimized PDF Form Editor
import React, { useState, useRef, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

// Set PDF.js worker - initialized here to avoid loading react-pdf in main bundle
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

import {
  Box,
  Button,
  IconButton,
  TextField,
  Paper,
  Typography,
  CircularProgress,
  Alert,
  Snackbar,
  Chip,
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Divider,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material';
import SaveIcon from '@mui/icons-material/Save';
import TextFieldsIcon from '@mui/icons-material/TextFields';
import CheckIcon from '@mui/icons-material/Check';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import UndoIcon from '@mui/icons-material/Undo';
import ZoomInIcon from '@mui/icons-material/ZoomIn';
import ZoomOutIcon from '@mui/icons-material/ZoomOut';
import DeleteIcon from '@mui/icons-material/Delete';
import GestureIcon from '@mui/icons-material/Gesture';
import CloseIcon from '@mui/icons-material/Close';
import TodayIcon from '@mui/icons-material/Today';
import PersonIcon from '@mui/icons-material/Person';
import TagIcon from '@mui/icons-material/Tag';
import AddIcon from '@mui/icons-material/Add';
import RemoveIcon from '@mui/icons-material/Remove';
import SettingsIcon from '@mui/icons-material/Settings';

// Color palette
const INK_COLORS = {
  black: { hex: '#000000', label: 'Black' },
  blue: { hex: '#0000cc', label: 'Blue' },
  red: { hex: '#cc0000', label: 'Red' },
};

// Get RGB values for pdf-lib
const getColorRgb = (colorName) => {
  switch (colorName) {
    case 'red': return rgb(0.8, 0, 0);
    case 'blue': return rgb(0, 0, 0.8);
    default: return rgb(0, 0, 0);
  }
};

// LocalStorage keys
const STORAGE_KEYS = {
  signature: 'pdfEditor_signature',
  initials: 'pdfEditor_initials',
};

const PDFFormEditor = ({ pdfUrl, jobInfo, onSave, documentName }) => {
  // Core state
  const [pdfBytes, setPdfBytes] = useState(null);
  const [numPages, setNumPages] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [annotations, setAnnotations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });
  
  // PDF page dimensions (actual PDF units, not screen pixels)
  const [pdfPageDimensions, setPdfPageDimensions] = useState({ width: 612, height: 792 });

  // Tool state
  const [currentTool, setCurrentTool] = useState('check');
  const [inkColor, setInkColor] = useState('black');
  const [fontSize, setFontSize] = useState(14);
  const [zoom, setZoom] = useState(1);
  const [currentText, setCurrentText] = useState('');
  const [selectedAnnotation, setSelectedAnnotation] = useState(null);

  // Signature state
  const [signatureDialogOpen, setSignatureDialogOpen] = useState(false);
  const [savedSignature, setSavedSignature] = useState(null);
  const [isDrawing, setIsDrawing] = useState(false);
  
  // Initials state
  const [userInitials, setUserInitials] = useState('');
  const [initialsDialogOpen, setInitialsDialogOpen] = useState(false);

  // Drag state
  const [isDragging, setIsDragging] = useState(false);
  const [dragAnnotationId, setDragAnnotationId] = useState(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  // UI state
  const [containerWidth, setContainerWidth] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Refs
  const containerRef = useRef(null);
  const pageRef = useRef(null);
  const signatureCanvasRef = useRef(null);

  // Load saved signature and initials from localStorage
  useEffect(() => {
    try {
      const savedSig = localStorage.getItem(STORAGE_KEYS.signature);
      if (savedSig) setSavedSignature(savedSig);
      
      const savedInitials = localStorage.getItem(STORAGE_KEYS.initials);
      if (savedInitials) setUserInitials(savedInitials);
    } catch (e) {
      console.warn('Could not load saved data:', e);
    }
  }, []);

  // Track container width for responsive PDF sizing
  useEffect(() => {
    const updateWidth = () => {
      if (containerRef.current) {
        setContainerWidth(containerRef.current.clientWidth);
      }
    };
    
    updateWidth();
    globalThis.addEventListener('resize', updateWidth);
    const timeout = setTimeout(updateWidth, 100);
    
    return () => {
      globalThis.removeEventListener('resize', updateWidth);
      clearTimeout(timeout);
    };
  }, []);

  // Load PDF bytes
  useEffect(() => {
    const loadPdfBytes = async () => {
      try {
        setLoading(true);
        
        // Check if this is an API endpoint that needs authentication
        const isApiEndpoint = pdfUrl.includes('/api/');
        const token = localStorage.getItem('token');
        
        const fetchOptions = isApiEndpoint && token ? {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        } : {};
        
        const response = await fetch(pdfUrl, fetchOptions);
        if (!response.ok) {
          if (response.status === 401) {
            throw new Error('Authentication required - please log in again');
          }
          throw new Error(`Failed to load PDF (${response.status})`);
        }
        const arrayBuffer = await response.arrayBuffer();
        setPdfBytes(arrayBuffer);
        
        // Extract actual PDF page dimensions and rotation for coordinate conversion
        try {
          const pdfDoc = await PDFDocument.load(arrayBuffer);
          const pages = pdfDoc.getPages();
          if (pages.length > 0) {
            const firstPage = pages[0];
            const { width, height } = firstPage.getSize();
            setPdfPageDimensions({ width, height });
            console.log(`PDF page dimensions: ${width}x${height}`);
          }
        } catch (error_) {
          console.warn('Could not read PDF dimensions:', error_);
        }
        
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

  const onDocumentLoadSuccess = ({ numPages: pages }) => {
    setNumPages(pages);
    setLoading(false);
  };

  // Generate unique ID
  const generateId = () => {
    const array = new Uint32Array(2);
    crypto.getRandomValues(array);
    return `${Date.now()}_${array[0].toString(36)}${array[1].toString(36)}`;
  };

  // Create annotation based on current tool - extracted to reduce complexity
  const createAnnotationForTool = (baseAnnotation, toolState) => {
    const { tool, text, size, initials, signature, pmNumber } = toolState;
    
    switch (tool) {
      case 'text':
        return text?.trim() ? { ...baseAnnotation, type: 'text', text, fontSize: size } : null;
      case 'check':
        return { ...baseAnnotation, type: 'check', size };
      case 'date':
        return { ...baseAnnotation, type: 'text', text: new Date().toLocaleDateString(), fontSize: size };
      case 'initials':
        return initials ? { ...baseAnnotation, type: 'text', text: initials, fontSize: size + 2 } : null;
      case 'signature':
        return signature ? { ...baseAnnotation, type: 'signature', imageData: signature, width: 150, height: 50 } : null;
      case 'pmNumber':
        return pmNumber ? { ...baseAnnotation, type: 'text', text: pmNumber, fontSize: size } : null;
      default:
        return null;
    }
  };

  // Handle dialog opens for tools that need setup
  const handleToolDialogIfNeeded = (tool, initials, signature) => {
    if (tool === 'initials' && !initials) {
      setInitialsDialogOpen(true);
      return true;
    }
    if (tool === 'signature' && !signature) {
      setSignatureDialogOpen(true);
      return true;
    }
    return false;
  };

  // Handle click on PDF to add annotation
  const handlePageClick = useCallback((e) => {
    if (!pageRef.current || isDragging) return;
    
    setSelectedAnnotation(null);

    // Get rect from the Box wrapper (e.currentTarget) since annotations 
    // are positioned with position:absolute relative to this Box
    const rect = e.currentTarget.getBoundingClientRect();
    
    // Calculate the scale factor between rendered size and actual PDF size
    // The rendered width is rect.width, the actual PDF width is pdfPageDimensions.width
    const renderedWidth = rect.width;
    const scaleToActualPdf = pdfPageDimensions.width / renderedWidth;
    
    // The annotation Box has 4px padding, so offset coordinates
    const PADDING_OFFSET = 4;
    
    // Get screen position relative to the page element
    const screenX = e.clientX - rect.left - PADDING_OFFSET;
    const screenY = e.clientY - rect.top - PADDING_OFFSET;
    
    // Convert screen coordinates to PDF coordinates
    // This accounts for both zoom AND width-based scaling
    const x = screenX * scaleToActualPdf;
    const y = screenY * scaleToActualPdf;
    
    // Store both screen coords (for display) and PDF coords (for saving)
    // Check if we need to open a dialog first
    if (handleToolDialogIfNeeded(currentTool, userInitials, savedSignature)) {
      return;
    }

    const baseAnnotation = {
      id: generateId(),
      x,           // PDF coordinates for saving
      y,           // PDF coordinates for saving
      screenX,     // Screen coordinates for display positioning
      screenY,     // Screen coordinates for display positioning
      scaleToActualPdf, // Store scale for re-rendering
      color: inkColor,
      page: currentPage,
    };

    const annotation = createAnnotationForTool(baseAnnotation, {
      tool: currentTool,
      text: currentText,
      size: fontSize,
      initials: userInitials,
      signature: savedSignature,
      pmNumber: jobInfo?.pmNumber,
    });

    if (annotation) {
      setAnnotations(prev => [...prev, annotation]);
      if (currentTool === 'text') setCurrentText('');
    }
  }, [currentTool, currentText, fontSize, currentPage, savedSignature, inkColor, userInitials, jobInfo, isDragging, pdfPageDimensions]);

  // Signature canvas functions
  const initSignatureCanvas = useCallback(() => {
    const canvas = signatureCanvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    // Clear to transparent (don't fill with white)
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }, []);

  useEffect(() => {
    if (signatureDialogOpen) {
      setTimeout(initSignatureCanvas, 100);
    }
  }, [signatureDialogOpen, initSignatureCanvas]);

  const getCanvasCoords = (e) => {
    const canvas = signatureCanvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
      x: clientX - rect.left,
      y: clientY - rect.top
    };
  };

  const handleSignatureStart = (e) => {
    e.preventDefault();
    setIsDrawing(true);
    const ctx = signatureCanvasRef.current?.getContext('2d');
    if (!ctx) return;
    const { x, y } = getCanvasCoords(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const handleSignatureMove = (e) => {
    if (!isDrawing) return;
    e.preventDefault();
    const ctx = signatureCanvasRef.current?.getContext('2d');
    if (!ctx) return;
    const { x, y } = getCanvasCoords(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const handleSignatureEnd = () => {
    setIsDrawing(false);
  };

  const saveSignature = () => {
    const canvas = signatureCanvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL('image/png');
    setSavedSignature(dataUrl);
    try {
      localStorage.setItem(STORAGE_KEYS.signature, dataUrl);
    } catch (e) {
      console.warn('Could not save signature:', e);
    }
    setSignatureDialogOpen(false);
    setSnackbar({ open: true, message: 'Signature saved! Tap PDF to place it.', severity: 'success' });
  };

  const clearSignature = () => {
    setSavedSignature(null);
    try {
      localStorage.removeItem(STORAGE_KEYS.signature);
    } catch (e) {
      console.warn('Could not clear signature:', e);
    }
    initSignatureCanvas();
  };

  // Save initials
  const saveInitials = (initials) => {
    setUserInitials(initials);
    try {
      localStorage.setItem(STORAGE_KEYS.initials, initials);
    } catch (e) {
      console.warn('Could not save initials:', e);
    }
    setInitialsDialogOpen(false);
  };

  // Drag handlers
  const handleDragStart = (e, annotationId) => {
    e.stopPropagation();
    e.preventDefault();
    
    const annotation = annotations.find(a => a.id === annotationId);
    if (!annotation) return;
    
    const rect = e.currentTarget.parentElement.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    
    // Use screen coordinates for drag offset
    const displayX = annotation.screenX === undefined 
      ? annotation.x / (annotation.scaleToActualPdf || 1)
      : annotation.screenX;
    const displayY = annotation.screenY === undefined 
      ? annotation.y / (annotation.scaleToActualPdf || 1)
      : annotation.screenY;
    
    const clickX = clientX - rect.left;
    const clickY = clientY - rect.top;
    
    setDragOffset({
      x: clickX - displayX,
      y: clickY - displayY
    });
    
    setIsDragging(true);
    setDragAnnotationId(annotationId);
    setSelectedAnnotation(annotationId);
  };

  const handleDragMove = useCallback((e) => {
    if (!isDragging || !dragAnnotationId) return;
    e.preventDefault();
    
    const container = containerRef.current?.querySelector(`[data-page="${currentPage}"]`);
    if (!container) return;
    
    const rect = container.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    
    // Calculate new screen coordinates
    const newScreenX = clientX - rect.left - dragOffset.x;
    const newScreenY = clientY - rect.top - dragOffset.y;
    
    // Get the annotation to find its scale factor
    const annotation = annotations.find(a => a.id === dragAnnotationId);
    const scaleToActualPdf = annotation?.scaleToActualPdf || (pdfPageDimensions.width / rect.width);
    
    // Convert screen coords to PDF coords for saving
    const newX = newScreenX * scaleToActualPdf;
    const newY = newScreenY * scaleToActualPdf;
    
    setAnnotations(prev => prev.map(a => 
      a.id === dragAnnotationId 
        ? { 
            ...a, 
            x: Math.max(0, newX), 
            y: Math.max(0, newY),
            screenX: Math.max(0, newScreenX),
            screenY: Math.max(0, newScreenY),
            scaleToActualPdf
          }
        : a
    ));
  }, [isDragging, dragAnnotationId, dragOffset, currentPage, annotations, pdfPageDimensions]);

  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
    setDragAnnotationId(null);
    setDragOffset({ x: 0, y: 0 });
  }, []);

  useEffect(() => {
    if (isDragging) {
      const handleMove = (e) => handleDragMove(e);
      const handleEnd = () => handleDragEnd();
      
      document.addEventListener('mousemove', handleMove);
      document.addEventListener('mouseup', handleEnd);
      document.addEventListener('touchmove', handleMove, { passive: false });
      document.addEventListener('touchend', handleEnd);
      
      return () => {
        document.removeEventListener('mousemove', handleMove);
        document.removeEventListener('mouseup', handleEnd);
        document.removeEventListener('touchmove', handleMove);
        document.removeEventListener('touchend', handleEnd);
      };
    }
  }, [isDragging, handleDragMove, handleDragEnd]);

  // Remove annotation
  const handleRemoveAnnotation = (id) => {
    setAnnotations(prev => prev.filter(a => a.id !== id));
    setSelectedAnnotation(null);
  };

  // Undo last annotation
  const handleUndo = () => {
    setAnnotations(prev => prev.slice(0, -1));
    setSelectedAnnotation(null);
  };

  // Save PDF with annotations
  const handleSave = async () => {
    if (!pdfBytes || annotations.length === 0) return;

    setSaving(true);
    try {
      const pdfDoc = await PDFDocument.load(pdfBytes);
      const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
      const pages = pdfDoc.getPages();

      for (const annotation of annotations) {
        const pageIndex = (annotation.page || 1) - 1;
        if (pageIndex >= pages.length) continue;
        
        const page = pages[pageIndex];
        const { height: pageHeight } = page.getSize();
        
        // PDF Y coordinate: flip from top-down (screen) to bottom-up (PDF)
        // annotation.y is already scaled to PDF units
        const pdfY = pageHeight - annotation.y;
        const color = getColorRgb(annotation.color);

        if (annotation.type === 'text') {
          page.drawText(annotation.text, {
            x: annotation.x,
            y: pdfY - annotation.fontSize,
            size: annotation.fontSize,
            font: helveticaFont,
            color,
          });
        } else if (annotation.type === 'check') {
          // Use 'X' instead of Unicode checkmark - WinAnsi encoding doesn't support ✓
          page.drawText('X', {
            x: annotation.x,
            y: pdfY - annotation.size,
            size: annotation.size,
            font: helveticaBold,
            color,
          });
        } else if (annotation.type === 'signature' && annotation.imageData) {
          try {
            const signatureBase64 = annotation.imageData.split(',')[1];
            const signatureBytes = Uint8Array.from(atob(signatureBase64), c => c.codePointAt(0));
            const signatureImage = await pdfDoc.embedPng(signatureBytes);
            page.drawImage(signatureImage, {
              x: annotation.x,
              y: pdfY - annotation.height,
              width: annotation.width,
              height: annotation.height,
            });
          } catch (err) {
            console.error('Error embedding signature:', err);
          }
        }
      }

      const modifiedPdfBytes = await pdfDoc.save();
      const base64 = btoa(
        new Uint8Array(modifiedPdfBytes)
          .reduce((data, byte) => data + String.fromCodePoint(byte), '')
      );

      if (onSave) {
        await onSave(base64, documentName);
      }

      setSnackbar({ open: true, message: 'Document saved to Close Out Documents!', severity: 'success' });
      setAnnotations([]);
    } catch (err) {
      console.error('Error saving PDF:', err);
      setSnackbar({ open: true, message: 'Save failed: ' + err.message, severity: 'error' });
    } finally {
      setSaving(false);
    }
  };

  // Tool button style - Compact for more document space
  const toolButtonStyle = (isSelected, colorTheme = 'primary') => ({
    minWidth: 44,
    minHeight: 44,
    px: 1.5,
    py: 0.5,
    fontSize: '0.7rem',
    fontWeight: isSelected ? 700 : 500,
    border: isSelected ? '3px solid' : '1px solid',
    borderColor: isSelected ? `${colorTheme}.main` : 'grey.400',
    bgcolor: isSelected ? `${colorTheme}.light` : 'background.paper',
    color: isSelected ? `${colorTheme}.dark` : 'text.primary',
    borderRadius: 1.5,
    textTransform: 'none',
    '&:hover': {
      bgcolor: `${colorTheme}.light`,
      borderColor: `${colorTheme}.main`,
    },
    '& .MuiSvgIcon-root': {
      fontSize: 20,
      mr: 0.5,
    },
  });

  if (error) {
    return (
      <Box sx={{ p: 3, textAlign: 'center' }}>
        <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>
        <Button variant="outlined" onClick={() => globalThis.location.reload()}>
          Reload
        </Button>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, overflow: 'hidden', bgcolor: '#e0e0e0' }}>
      
      {/* ===== COMPACT TOOLBAR ===== */}
      <Paper 
        elevation={2}
        sx={{ 
          px: 1,
          py: 0.75,
          display: 'flex', 
          flexDirection: 'column',
          gap: 0.75,
          borderRadius: 0,
          bgcolor: 'background.paper',
          flexShrink: 0,
        }}
      >
        {/* Single Row: Tools + Colors + Zoom + Actions */}
        <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Tool Buttons */}
          <Button
            size="small"
            variant={currentTool === 'check' ? 'contained' : 'outlined'}
            color="success"
            onClick={() => setCurrentTool('check')}
            sx={toolButtonStyle(currentTool === 'check', 'success')}
          >
            <CheckIcon />✓
          </Button>

          <Button
            size="small"
            variant={currentTool === 'date' ? 'contained' : 'outlined'}
            color="primary"
            onClick={() => setCurrentTool('date')}
            sx={toolButtonStyle(currentTool === 'date', 'primary')}
          >
            <TodayIcon />Date
          </Button>

          <Button
            size="small"
            variant={currentTool === 'initials' ? 'contained' : 'outlined'}
            color="secondary"
            onClick={() => setCurrentTool('initials')}
            sx={toolButtonStyle(currentTool === 'initials', 'secondary')}
          >
            <PersonIcon />{userInitials || 'Init'}
          </Button>

          <Button
            size="small"
            variant={currentTool === 'signature' ? 'contained' : 'outlined'}
            color="warning"
            onClick={() => {
              if (savedSignature) {
                setCurrentTool('signature');
              } else {
                setSignatureDialogOpen(true);
              }
            }}
            sx={toolButtonStyle(currentTool === 'signature', 'warning')}
          >
            <GestureIcon />{savedSignature ? 'Sign✓' : 'Sign'}
          </Button>

          {jobInfo?.pmNumber && (
            <Button
              size="small"
              variant={currentTool === 'pmNumber' ? 'contained' : 'outlined'}
              color="info"
              onClick={() => setCurrentTool('pmNumber')}
              sx={toolButtonStyle(currentTool === 'pmNumber', 'info')}
            >
              <TagIcon />PM#
            </Button>
          )}

          <Button
            size="small"
            variant={currentTool === 'text' ? 'contained' : 'outlined'}
            onClick={() => setCurrentTool('text')}
            sx={toolButtonStyle(currentTool === 'text', 'primary')}
          >
            <TextFieldsIcon />Text
          </Button>

          {/* Divider */}
          <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />

          {/* Ink Colors - compact circles */}
          {Object.entries(INK_COLORS).map(([name, { hex }]) => (
            <IconButton
              key={name}
              size="small"
              onClick={() => setInkColor(name)}
              sx={{
                width: 28,
                height: 28,
                bgcolor: hex,
                border: inkColor === name ? '3px solid #1976d2' : '2px solid #888',
                '&:hover': { bgcolor: hex, opacity: 0.8 },
              }}
              aria-label={`${name} ink`}
            />
          ))}

          {/* Divider */}
          <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />

          {/* Zoom - compact */}
          <IconButton size="small" onClick={() => setZoom(z => Math.max(0.5, z - 0.25))} aria-label="Zoom out">
            <ZoomOutIcon fontSize="small" />
          </IconButton>
          <Typography variant="caption" sx={{ minWidth: 32, textAlign: 'center', fontWeight: 500 }}>
            {Math.round(zoom * 100)}%
          </Typography>
          <IconButton size="small" onClick={() => setZoom(z => Math.min(2, z + 0.25))} aria-label="Zoom in">
            <ZoomInIcon fontSize="small" />
          </IconButton>

          {/* Divider */}
          <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />

          {/* Undo & Settings */}
          <IconButton 
            size="small"
            onClick={handleUndo} 
            disabled={annotations.length === 0}
            aria-label="Undo"
          >
            <UndoIcon fontSize="small" />
          </IconButton>
          <IconButton 
            size="small"
            onClick={() => setSettingsOpen(true)}
            aria-label="Settings"
          >
            <SettingsIcon fontSize="small" />
          </IconButton>

          {/* Save Button - right aligned */}
          <Button
            size="small"
            variant="contained"
            color="success"
            onClick={handleSave}
            disabled={saving || annotations.length === 0}
            sx={{ 
              ml: 'auto',
              minWidth: 70,
              fontWeight: 600,
            }}
            startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <SaveIcon fontSize="small" />}
          >
            {saving ? '...' : 'Save'}
          </Button>
        </Box>

        {/* Text Input Row (only when text tool selected) */}
        {currentTool === 'text' && (
          <TextField
            fullWidth
            size="small"
            placeholder="Type here, then tap PDF to place..."
            value={currentText}
            onChange={(e) => setCurrentText(e.target.value)}
            autoFocus
            sx={{ '& .MuiInputBase-input': { fontSize: 14, py: 0.75 } }}
          />
        )}
      </Paper>

      {/* ===== PDF DISPLAY ===== */}
      <Box
        ref={containerRef}
        sx={{
          flex: 1,
          overflow: 'auto',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'flex-start',
          p: 2,
          WebkitOverflowScrolling: 'touch',
          minHeight: 0,
        }}
      >
        <Box ref={pageRef} sx={{ position: 'relative' }}>
          {loading ? (
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 400, width: 300, bgcolor: 'white', borderRadius: 2, boxShadow: 2 }}>
              <CircularProgress size={48} />
              <Typography sx={{ mt: 2 }}>Loading PDF...</Typography>
            </Box>
          ) : (
            <Document
              file={pdfUrl}
              onLoadSuccess={onDocumentLoadSuccess}
              loading={
                <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 400, width: 300, bgcolor: 'white' }}>
                  <CircularProgress />
                </Box>
              }
            >
              {Array.from(new Array(numPages || 1), (_, index) => {
                const pageNum = index + 1;
                const pageAnnotations = annotations.filter(a => (a.page || 1) === pageNum);
                return (
                  <Box
                    key={`page-${pageNum}`}
                    data-page={pageNum}
                    sx={{
                      position: 'relative',
                      mb: 2,
                      bgcolor: 'white',
                      boxShadow: 3,
                      borderRadius: 1,
                      overflow: 'hidden',
                      cursor: currentTool === 'text' ? 'text' : 'crosshair',
                    }}
                    onClick={(e) => {
                      if (e.target === e.currentTarget || e.target.tagName === 'CANVAS') {
                        setCurrentPage(pageNum);
                        handlePageClick(e);
                      }
                    }}
                  >
                    <Page
                      pageNumber={pageNum}
                      scale={zoom}
                      renderTextLayer={false}
                      renderAnnotationLayer={false}
                      width={containerWidth ? Math.min(containerWidth - 32, 700) : undefined}
                    />
                    
                    {/* Page number */}
                    <Chip
                      label={`Page ${pageNum} / ${numPages}`}
                      size="small"
                      sx={{
                        position: 'absolute',
                        bottom: 8,
                        right: 8,
                        bgcolor: 'rgba(0,0,0,0.7)',
                        color: 'white',
                        fontSize: 12,
                      }}
                    />

                    {/* Annotations */}
                    {pageAnnotations.map((annotation) => {
                      // Convert PDF coordinates back to screen coordinates for display
                      // Use screenX/screenY if available (new annotations), otherwise calculate from PDF coords
                      const displayX = annotation.screenX === undefined 
                        ? annotation.x / (annotation.scaleToActualPdf || 1)
                        : annotation.screenX;
                      const displayY = annotation.screenY === undefined 
                        ? annotation.y / (annotation.scaleToActualPdf || 1)
                        : annotation.screenY;
                      
                      return (
                      <Box
                        key={annotation.id}
                        sx={{
                          position: 'absolute',
                          left: displayX,
                          top: displayY,
                          cursor: isDragging && dragAnnotationId === annotation.id ? 'grabbing' : 'grab',
                          padding: '4px',
                          borderRadius: 1,
                          border: selectedAnnotation === annotation.id ? '3px solid #1976d2' : '2px dashed transparent',
                          bgcolor: selectedAnnotation === annotation.id ? 'rgba(25, 118, 210, 0.15)' : 'transparent',
                          '&:hover': {
                            bgcolor: 'rgba(255, 235, 59, 0.4)',
                            border: '2px dashed #ffc107',
                          },
                          zIndex: isDragging && dragAnnotationId === annotation.id ? 100 : 10,
                          userSelect: 'none',
                          touchAction: 'none',
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedAnnotation(annotation.id);
                        }}
                        onMouseDown={(e) => handleDragStart(e, annotation.id)}
                        onTouchStart={(e) => handleDragStart(e, annotation.id)}
                      >
                        {annotation.type === 'text' && (
                          <Typography
                            sx={{
                              fontSize: annotation.fontSize * zoom,
                              fontFamily: 'Helvetica, Arial, sans-serif',
                              color: INK_COLORS[annotation.color]?.hex || '#000',
                              whiteSpace: 'nowrap',
                              lineHeight: 1,
                              fontWeight: 500,
                            }}
                          >
                            {annotation.text}
                          </Typography>
                        )}
                        {annotation.type === 'check' && (
                          <Typography
                            sx={{
                              fontSize: annotation.size * zoom * 1.5,
                              color: INK_COLORS[annotation.color]?.hex || '#000',
                              lineHeight: 1,
                              fontWeight: 700,
                            }}
                          >
                            ✓
                          </Typography>
                        )}
                        {annotation.type === 'signature' && (
                          <img
                            src={annotation.imageData}
                            alt="Signature"
                            style={{
                              width: annotation.width * zoom,
                              height: annotation.height * zoom,
                              pointerEvents: 'none',
                            }}
                          />
                        )}
                        
                        {/* Delete button */}
                        {selectedAnnotation === annotation.id && (
                          <IconButton
                            size="small"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRemoveAnnotation(annotation.id);
                            }}
                            sx={{
                              position: 'absolute',
                              top: -16,
                              right: -16,
                              bgcolor: 'error.main',
                              color: 'white',
                              width: 32,
                              height: 32,
                              '&:hover': { bgcolor: 'error.dark' },
                            }}
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        )}
                      </Box>
                    );
                    })}
                  </Box>
                );
              })}
            </Document>
          )}
        </Box>
      </Box>

      {/* ===== BOTTOM STATUS BAR (minimal) ===== */}
      {annotations.length > 0 && (
        <Paper
          elevation={1}
          sx={{
            px: 2,
            py: 0.5,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 0,
            flexShrink: 0,
            bgcolor: 'success.light',
          }}
        >
          <Typography variant="body2" sx={{ fontWeight: 500 }}>
            {annotations.length} item{annotations.length === 1 ? '' : 's'} placed — tap Save when done
          </Typography>
        </Paper>
      )}

      {/* ===== SETTINGS DRAWER ===== */}
      <Drawer anchor="right" open={settingsOpen} onClose={() => setSettingsOpen(false)}>
        <Box sx={{ width: 300, pt: 2 }}>
          <Typography variant="h6" sx={{ px: 2, pb: 1 }}>Settings</Typography>
          <Divider />
          <List>
            <ListItem>
              <ListItemText primary="Font Size" />
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <IconButton onClick={() => setFontSize(s => Math.max(8, s - 2))} aria-label="Decrease font size">
                  <RemoveIcon />
                </IconButton>
                <Chip label={fontSize} sx={{ minWidth: 40 }} />
                <IconButton onClick={() => setFontSize(s => Math.min(32, s + 2))} aria-label="Increase font size">
                  <AddIcon />
                </IconButton>
              </Box>
            </ListItem>
            <Divider />
            <ListItem disablePadding>
              <ListItemButton onClick={() => { setSignatureDialogOpen(true); setSettingsOpen(false); }}>
                <ListItemIcon><GestureIcon /></ListItemIcon>
                <ListItemText 
                  primary={savedSignature ? "Redraw Signature" : "Draw Signature"} 
                  secondary={savedSignature ? "✓ Signature saved" : "No signature yet"}
                />
              </ListItemButton>
            </ListItem>
            <ListItem disablePadding>
              <ListItemButton onClick={() => { setInitialsDialogOpen(true); setSettingsOpen(false); }}>
                <ListItemIcon><PersonIcon /></ListItemIcon>
                <ListItemText 
                  primary="Set Initials" 
                  secondary={userInitials || "Not set"}
                />
              </ListItemButton>
            </ListItem>
            {savedSignature && (
              <ListItem disablePadding>
                <ListItemButton onClick={() => { clearSignature(); setSettingsOpen(false); }}>
                  <ListItemIcon><DeleteIcon color="error" /></ListItemIcon>
                  <ListItemText primary="Clear Saved Signature" />
                </ListItemButton>
              </ListItem>
            )}
          </List>
          {jobInfo && (
            <>
              <Divider />
              <Typography variant="subtitle2" sx={{ px: 2, pt: 2, pb: 1, fontWeight: 600 }}>Job Info</Typography>
              <List dense>
                {jobInfo.pmNumber && (
                  <ListItem>
                    <ListItemText primary="PM#" secondary={jobInfo.pmNumber} />
                  </ListItem>
                )}
                {jobInfo.woNumber && (
                  <ListItem>
                    <ListItemText primary="WO#" secondary={jobInfo.woNumber} />
                  </ListItem>
                )}
                {jobInfo.address && (
                  <ListItem>
                    <ListItemText primary="Address" secondary={jobInfo.address} />
                  </ListItem>
                )}
              </List>
            </>
          )}
        </Box>
      </Drawer>

      {/* ===== SIGNATURE DIALOG ===== */}
      <Dialog
        open={signatureDialogOpen}
        onClose={() => setSignatureDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <GestureIcon color="primary" />
            <Typography variant="h6">Draw Your Signature</Typography>
          </Box>
          <IconButton onClick={() => setSignatureDialogOpen(false)} aria-label="Close signature dialog">
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Use your finger or stylus to sign below
          </Typography>
          <Box
            sx={{
              border: '3px solid',
              borderColor: 'grey.400',
              borderRadius: 2,
              bgcolor: 'white',
              touchAction: 'none',
              cursor: 'crosshair',
            }}
          >
            <canvas
              ref={signatureCanvasRef}
              width={400}
              height={150}
              style={{ 
                width: '100%', 
                height: 150, 
                display: 'block',
                backgroundColor: '#fff', // Visual background for signing (not in PNG)
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
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 3 }}>
          <Button onClick={initSignatureCanvas} variant="outlined" size="large">
            Clear
          </Button>
          <Button variant="contained" onClick={saveSignature} size="large" startIcon={<CheckCircleIcon />}>
            Save Signature
          </Button>
        </DialogActions>
      </Dialog>

      {/* ===== INITIALS DIALOG ===== */}
      <Dialog open={initialsDialogOpen} onClose={() => setInitialsDialogOpen(false)}>
        <DialogTitle>Enter Your Initials</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Enter 2-4 letters (e.g., JD, ABC)
          </Typography>
          <TextField
            autoFocus
            fullWidth
            placeholder="JD"
            defaultValue={userInitials}
            inputProps={{ 
              maxLength: 4, 
              style: { 
                fontSize: 32, 
                textAlign: 'center', 
                textTransform: 'uppercase',
                letterSpacing: 4,
                fontWeight: 700,
              } 
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                saveInitials(e.target.value.toUpperCase());
              }
            }}
            id="initials-input"
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 3 }}>
          <Button onClick={() => setInitialsDialogOpen(false)} variant="outlined" size="large">
            Cancel
          </Button>
          <Button 
            variant="contained" 
            size="large"
            onClick={() => {
              const input = document.getElementById('initials-input');
              saveInitials(input?.value?.toUpperCase() || '');
            }}
          >
            Save
          </Button>
        </DialogActions>
      </Dialog>

      {/* ===== SNACKBAR ===== */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={3000}
        onClose={() => setSnackbar(s => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={snackbar.severity} onClose={() => setSnackbar(s => ({ ...s, open: false }))} sx={{ fontSize: 16 }}>
          {snackbar.message}
        </Alert>
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
