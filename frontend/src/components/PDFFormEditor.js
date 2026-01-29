// src/components/PDFFormEditor.js - Foreman-Optimized PDF Form Editor
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
  ToggleButton,
  ToggleButtonGroup,
  CircularProgress,
  Alert,
  Snackbar,
  Chip,
  Fab,
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
  Badge,
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
import DrawIcon from '@mui/icons-material/Draw';
import CloseIcon from '@mui/icons-material/Close';
import TodayIcon from '@mui/icons-material/Today';
import PersonIcon from '@mui/icons-material/Person';
import TagIcon from '@mui/icons-material/Tag';
import AddIcon from '@mui/icons-material/Add';
import RemoveIcon from '@mui/icons-material/Remove';
import MenuIcon from '@mui/icons-material/Menu';
import ClearIcon from '@mui/icons-material/Clear';
import EditIcon from '@mui/icons-material/Edit';

// PDF.js worker is set globally in App.js

// Color palette
const INK_COLORS = {
  black: { hex: '#000000', displayHex: '#000000', label: 'Black' },
  blue: { hex: '#0000cc', displayHex: '#0000cc', label: 'Blue' },
  red: { hex: '#cc0000', displayHex: '#cc0000', label: 'Red' },
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

  // Tool state
  const [currentTool, setCurrentTool] = useState('check'); // Default to checkmark for foreman
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
  const [drawerOpen, setDrawerOpen] = useState(false);

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

  // Handle click on PDF to add annotation
  const handlePageClick = useCallback((e) => {
    if (!pageRef.current || isDragging) return;
    
    // Deselect any selected annotation
    setSelectedAnnotation(null);

    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / zoom;
    const y = (e.clientY - rect.top) / zoom;
    
    const baseAnnotation = {
      id: generateId(),
      x,
      y,
      color: inkColor,
      page: currentPage,
    };

    if (currentTool === 'text' && currentText.trim()) {
      setAnnotations(prev => [...prev, {
        ...baseAnnotation,
        type: 'text',
        text: currentText,
        fontSize,
      }]);
      setCurrentText('');
    } else if (currentTool === 'check') {
      setAnnotations(prev => [...prev, {
        ...baseAnnotation,
        type: 'check',
        size: fontSize,
      }]);
    } else if (currentTool === 'date') {
      setAnnotations(prev => [...prev, {
        ...baseAnnotation,
        type: 'text',
        text: new Date().toLocaleDateString(),
        fontSize,
      }]);
    } else if (currentTool === 'initials') {
      if (userInitials) {
        setAnnotations(prev => [...prev, {
          ...baseAnnotation,
          type: 'text',
          text: userInitials,
          fontSize: fontSize + 2,
        }]);
      } else {
        setInitialsDialogOpen(true);
      }
    } else if (currentTool === 'signature' && savedSignature) {
      setAnnotations(prev => [...prev, {
        ...baseAnnotation,
        type: 'signature',
        imageData: savedSignature,
        width: 150,
        height: 50,
      }]);
    } else if (currentTool === 'signature' && !savedSignature) {
      setSignatureDialogOpen(true);
    } else if (currentTool === 'pmNumber' && jobInfo?.pmNumber) {
      setAnnotations(prev => [...prev, {
        ...baseAnnotation,
        type: 'text',
        text: jobInfo.pmNumber,
        fontSize,
      }]);
    }
  }, [currentTool, currentText, fontSize, zoom, currentPage, savedSignature, inkColor, userInitials, jobInfo, isDragging]);

  // Signature canvas functions
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

  const handleDragMove = useCallback((e) => {
    if (!isDragging || !dragAnnotationId) return;
    e.preventDefault();
    
    const container = containerRef.current?.querySelector(`[data-page="${currentPage}"]`);
    if (!container) return;
    
    const rect = container.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    
    const newX = (clientX - rect.left) / zoom - dragOffset.x;
    const newY = (clientY - rect.top) / zoom - dragOffset.y;
    
    setAnnotations(prev => prev.map(a => 
      a.id === dragAnnotationId 
        ? { ...a, x: Math.max(0, newX), y: Math.max(0, newY) }
        : a
    ));
  }, [isDragging, dragAnnotationId, zoom, dragOffset, currentPage]);

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

  // Clear all annotations
  const handleClearAll = () => {
    setAnnotations([]);
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
        const { height } = page.getSize();
        const y = height - annotation.y;
        const color = getColorRgb(annotation.color);

        if (annotation.type === 'text') {
          page.drawText(annotation.text, {
            x: annotation.x,
            y: y - annotation.fontSize,
            size: annotation.fontSize,
            font: helveticaFont,
            color,
          });
        } else if (annotation.type === 'check') {
          // Draw a proper checkmark
          page.drawText('✓', {
            x: annotation.x,
            y: y - annotation.size,
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
              y: y - annotation.height,
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

      setSnackbar({ open: true, message: 'Document saved!', severity: 'success' });
      setAnnotations([]);
    } catch (err) {
      console.error('Error saving PDF:', err);
      setSnackbar({ open: true, message: 'Save failed: ' + err.message, severity: 'error' });
    } finally {
      setSaving(false);
    }
  };

  // Quick action buttons data
  const quickActions = [
    { tool: 'check', icon: <CheckIcon />, label: 'Checkmark', color: 'success' },
    { tool: 'date', icon: <TodayIcon />, label: 'Date', color: 'primary' },
    { tool: 'initials', icon: <PersonIcon />, label: 'Initials', color: 'secondary' },
    { tool: 'signature', icon: <GestureIcon />, label: 'Signature', color: 'warning', badge: savedSignature ? '✓' : null },
    { tool: 'pmNumber', icon: <TagIcon />, label: 'PM#', color: 'info', disabled: !jobInfo?.pmNumber },
    { tool: 'text', icon: <TextFieldsIcon />, label: 'Text', color: 'default' },
  ];

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
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, overflow: 'hidden', bgcolor: '#f5f5f5' }}>
      {/* Top Toolbar - Touch Friendly */}
      <Paper 
        elevation={2}
        sx={{ 
          px: 1, 
          py: 1, 
          display: 'flex', 
          alignItems: 'center', 
          gap: 1, 
          flexWrap: 'wrap',
          borderRadius: 0,
        }}
      >
        {/* Tool Quick Actions */}
        <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', flex: 1 }}>
          {quickActions.map((action) => (
            <Tooltip key={action.tool} title={action.label}>
              <span>
                <Badge 
                  badgeContent={action.badge} 
                  color="success"
                  sx={{ '& .MuiBadge-badge': { fontSize: 10, minWidth: 16, height: 16 } }}
                >
                  <ToggleButton
                    value={action.tool}
                    selected={currentTool === action.tool}
                    onChange={() => setCurrentTool(action.tool)}
                    disabled={action.disabled}
                    sx={{
                      minWidth: 48,
                      minHeight: 48,
                      borderRadius: 2,
                      border: currentTool === action.tool ? '2px solid' : '1px solid',
                      borderColor: currentTool === action.tool ? `${action.color}.main` : 'divider',
                      bgcolor: currentTool === action.tool ? `${action.color}.light` : 'background.paper',
                      '&:hover': { bgcolor: `${action.color}.light` },
                    }}
                  >
                    {action.icon}
                  </ToggleButton>
                </Badge>
              </span>
            </Tooltip>
          ))}
        </Box>

        {/* Ink Color */}
        <Box sx={{ display: 'flex', gap: 0.5, borderLeft: 1, borderColor: 'divider', pl: 1 }}>
          {Object.entries(INK_COLORS).map(([name, { displayHex, label }]) => (
            <Tooltip key={name} title={label}>
              <IconButton
                onClick={() => setInkColor(name)}
                sx={{
                  width: 36,
                  height: 36,
                  border: inkColor === name ? '3px solid' : '1px solid',
                  borderColor: inkColor === name ? 'primary.main' : 'grey.400',
                  bgcolor: displayHex,
                  '&:hover': { bgcolor: displayHex, opacity: 0.8 },
                }}
              />
            </Tooltip>
          ))}
        </Box>

        {/* Zoom Controls */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, borderLeft: 1, borderColor: 'divider', pl: 1 }}>
          <IconButton onClick={() => setZoom(z => Math.max(0.5, z - 0.25))} size="small">
            <ZoomOutIcon />
          </IconButton>
          <Chip label={`${Math.round(zoom * 100)}%`} size="small" sx={{ minWidth: 50 }} />
          <IconButton onClick={() => setZoom(z => Math.min(2, z + 0.25))} size="small">
            <ZoomInIcon />
          </IconButton>
        </Box>

        {/* Actions */}
        <Box sx={{ display: 'flex', gap: 0.5, borderLeft: 1, borderColor: 'divider', pl: 1 }}>
          <Tooltip title="Undo">
            <span>
              <IconButton onClick={handleUndo} disabled={annotations.length === 0} size="small">
                <UndoIcon />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title="Clear All">
            <span>
              <IconButton onClick={handleClearAll} disabled={annotations.length === 0} size="small" color="error">
                <ClearIcon />
              </IconButton>
            </span>
          </Tooltip>
          <IconButton onClick={() => setDrawerOpen(true)} size="small">
            <MenuIcon />
          </IconButton>
        </Box>
      </Paper>

      {/* Text Input Bar - Shows when text tool selected */}
      {currentTool === 'text' && (
        <Paper sx={{ px: 2, py: 1, display: 'flex', alignItems: 'center', gap: 1, borderRadius: 0 }}>
          <TextField
            fullWidth
            size="small"
            placeholder="Type text, then tap on PDF to place..."
            value={currentText}
            onChange={(e) => setCurrentText(e.target.value)}
            autoFocus
            sx={{ '& .MuiInputBase-input': { fontSize: 16 } }}
          />
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <IconButton size="small" onClick={() => setFontSize(s => Math.max(8, s - 2))}>
              <RemoveIcon fontSize="small" />
            </IconButton>
            <Chip label={fontSize} size="small" />
            <IconButton size="small" onClick={() => setFontSize(s => Math.min(32, s + 2))}>
              <AddIcon fontSize="small" />
            </IconButton>
          </Box>
        </Paper>
      )}

      {/* PDF Display */}
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
                      label={`${pageNum} / ${numPages}`}
                      size="small"
                      sx={{
                        position: 'absolute',
                        bottom: 8,
                        right: 8,
                        bgcolor: 'rgba(0,0,0,0.7)',
                        color: 'white',
                      }}
                    />

                    {/* Annotations */}
                    {pageAnnotations.map((annotation) => (
                      <Box
                        key={annotation.id}
                        sx={{
                          position: 'absolute',
                          left: annotation.x * zoom,
                          top: annotation.y * zoom,
                          cursor: isDragging && dragAnnotationId === annotation.id ? 'grabbing' : 'grab',
                          padding: '4px',
                          borderRadius: 1,
                          border: selectedAnnotation === annotation.id ? '2px solid #1976d2' : '2px dashed transparent',
                          bgcolor: selectedAnnotation === annotation.id ? 'rgba(25, 118, 210, 0.1)' : 'transparent',
                          '&:hover': {
                            bgcolor: 'rgba(255, 235, 59, 0.3)',
                            border: '2px dashed #ffc107',
                          },
                          zIndex: isDragging && dragAnnotationId === annotation.id ? 100 : 10,
                          transition: 'background-color 0.2s',
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
                              color: INK_COLORS[annotation.color]?.displayHex || '#000',
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
                              fontSize: annotation.size * zoom * 1.2,
                              color: INK_COLORS[annotation.color]?.displayHex || '#000',
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
                              top: -20,
                              right: -20,
                              bgcolor: 'error.main',
                              color: 'white',
                              width: 28,
                              height: 28,
                              '&:hover': { bgcolor: 'error.dark' },
                            }}
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        )}
                      </Box>
                    ))}
                  </Box>
                );
              })}
            </Document>
          )}
        </Box>
      </Box>

      {/* Bottom Action Bar */}
      <Paper
        elevation={3}
        sx={{
          p: 1.5,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderRadius: 0,
          gap: 2,
        }}
      >
        <Typography variant="body2" color="text.secondary">
          {annotations.length === 0 
            ? `Tap ${currentTool === 'check' ? 'checkmark' : currentTool} on PDF` 
            : `${annotations.length} annotation${annotations.length !== 1 ? 's' : ''}`}
        </Typography>
        
        <Button
          variant="contained"
          color="success"
          size="large"
          startIcon={saving ? <CircularProgress size={20} color="inherit" /> : <SaveIcon />}
          onClick={handleSave}
          disabled={saving || annotations.length === 0}
          sx={{ 
            minWidth: 140,
            height: 48,
            fontSize: 16,
            fontWeight: 600,
          }}
        >
          {saving ? 'Saving...' : 'Save'}
        </Button>
      </Paper>

      {/* Side Drawer for More Options */}
      <Drawer anchor="right" open={drawerOpen} onClose={() => setDrawerOpen(false)}>
        <Box sx={{ width: 280, pt: 2 }}>
          <Typography variant="h6" sx={{ px: 2, pb: 1 }}>Options</Typography>
          <Divider />
          <List>
            <ListItem disablePadding>
              <ListItemButton onClick={() => { setSignatureDialogOpen(true); setDrawerOpen(false); }}>
                <ListItemIcon><DrawIcon /></ListItemIcon>
                <ListItemText 
                  primary={savedSignature ? "Redraw Signature" : "Draw Signature"} 
                  secondary={savedSignature ? "Signature saved" : "No signature yet"}
                />
                {savedSignature && <CheckCircleIcon color="success" />}
              </ListItemButton>
            </ListItem>
            <ListItem disablePadding>
              <ListItemButton onClick={() => { setInitialsDialogOpen(true); setDrawerOpen(false); }}>
                <ListItemIcon><PersonIcon /></ListItemIcon>
                <ListItemText 
                  primary="Set Initials" 
                  secondary={userInitials || "Not set"}
                />
              </ListItemButton>
            </ListItem>
            {savedSignature && (
              <ListItem disablePadding>
                <ListItemButton onClick={() => { clearSignature(); setDrawerOpen(false); }}>
                  <ListItemIcon><DeleteIcon color="error" /></ListItemIcon>
                  <ListItemText primary="Clear Saved Signature" />
                </ListItemButton>
              </ListItem>
            )}
          </List>
          <Divider />
          <List>
            <ListItem>
              <ListItemText primary="Font Size" />
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <IconButton size="small" onClick={() => setFontSize(s => Math.max(8, s - 2))}>
                  <RemoveIcon />
                </IconButton>
                <Chip label={fontSize} />
                <IconButton size="small" onClick={() => setFontSize(s => Math.min(32, s + 2))}>
                  <AddIcon />
                </IconButton>
              </Box>
            </ListItem>
          </List>
          {jobInfo && (
            <>
              <Divider />
              <Typography variant="subtitle2" sx={{ px: 2, pt: 2, pb: 1 }}>Job Info</Typography>
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

      {/* Signature Dialog */}
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
          <Box
            sx={{
              border: '2px solid',
              borderColor: 'grey.300',
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
              style={{ width: '100%', height: 150, display: 'block' }}
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
            Sign in the box above using your finger or mouse
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={initSignatureCanvas} startIcon={<ClearIcon />}>
            Clear
          </Button>
          <Button variant="contained" onClick={saveSignature} startIcon={<SaveIcon />}>
            Save Signature
          </Button>
        </DialogActions>
      </Dialog>

      {/* Initials Dialog */}
      <Dialog open={initialsDialogOpen} onClose={() => setInitialsDialogOpen(false)}>
        <DialogTitle>Enter Your Initials</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            placeholder="e.g., JD"
            defaultValue={userInitials}
            inputProps={{ maxLength: 4, style: { fontSize: 24, textAlign: 'center', textTransform: 'uppercase' } }}
            sx={{ mt: 1 }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                saveInitials(e.target.value.toUpperCase());
              }
            }}
            id="initials-input"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setInitialsDialogOpen(false)}>Cancel</Button>
          <Button 
            variant="contained" 
            onClick={() => {
              const input = document.getElementById('initials-input');
              saveInitials(input?.value?.toUpperCase() || '');
            }}
          >
            Save
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={3000}
        onClose={() => setSnackbar(s => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={snackbar.severity} onClose={() => setSnackbar(s => ({ ...s, open: false }))}>
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
