/**
 * FieldLedger - Construction Sketch Markup Editor
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * 
 * Purpose-built editor for redlining/bluelining construction sketches
 * per utility as-built standards. Driven by UtilityAsBuiltConfig.
 * 
 * Tools:
 *  - Freehand draw (finger/stylus)
 *  - Line tool (straight lines for conductors)
 *  - Arrow tool (directional lines)
 *  - Symbol stamp (utility-specific symbols)
 *  - "Built As Designed" one-tap stamp
 *  - Text annotation
 * 
 * Color Modes (per utility convention, default PG&E):
 *  - RED: Removed / Changed from design
 *  - BLUE: New installation / Added
 *  - BLACK: Existing / Unchanged / Reference
 */

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import PropTypes from 'prop-types';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

import {
  Box, Paper, Typography, Button, IconButton, Tooltip, Divider,
  CircularProgress, Alert, Snackbar, Chip, Drawer, TextField,
  ToggleButton, ToggleButtonGroup,
} from '@mui/material';
import UndoIcon from '@mui/icons-material/Undo';
import RedoIcon from '@mui/icons-material/Redo';
import SaveIcon from '@mui/icons-material/Save';
import ZoomInIcon from '@mui/icons-material/ZoomIn';
import ZoomOutIcon from '@mui/icons-material/ZoomOut';
import GestureIcon from '@mui/icons-material/Gesture';
import TimelineIcon from '@mui/icons-material/Timeline';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import TextFieldsIcon from '@mui/icons-material/TextFields';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CategoryIcon from '@mui/icons-material/Category';
import NavigateBeforeIcon from '@mui/icons-material/NavigateBefore';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';

import SymbolPalette from './SymbolPalette';

// ---- Constants ----

const DEFAULT_COLORS = {
  red: { hex: '#CC0000', label: 'Remove/Change', rgb: [0.8, 0, 0] },
  blue: { hex: '#0000CC', label: 'New/Add', rgb: [0, 0, 0.8] },
  black: { hex: '#000000', label: 'Existing', rgb: [0, 0, 0] },
};

const TOOL = {
  FREEHAND: 'freehand',
  LINE: 'line',
  ARROW: 'arrow',
  SYMBOL: 'symbol',
  TEXT: 'text',
  BUILT_AS_DESIGNED: 'built_as_designed',
};

// ---- Helper: Convert color name to pdf-lib rgb ----
function colorToRgb(colorName) {
  const c = DEFAULT_COLORS[colorName];
  if (!c) return rgb(0, 0, 0);
  return rgb(c.rgb[0], c.rgb[1], c.rgb[2]);
}

// ---- Helper: Get cursor style for tool ----
function getCursor(tool) {
  switch (tool) {
    case TOOL.FREEHAND: return 'crosshair';
    case TOOL.LINE:
    case TOOL.ARROW: return 'crosshair';
    case TOOL.TEXT: return 'text';
    case TOOL.SYMBOL: return 'copy';
    default: return 'default';
  }
}

// ---- Component ----

const MAX_UNDO_STACK = 50;

const SketchMarkupEditor = ({
  pdfUrl,
  jobInfo: _jobInfo = {},
  onSave,
  // Utility config (from UtilityAsBuiltConfig)
  symbols = [],
  colorConventions = [],
  documentName = 'Construction Sketch',
  // Initial page (for multi-page sketches)
  initialPage = 1,
  // Saved sketch data (JSON) for restore
  initialData = null,
  // Callback to save sketch as JSON (for draft persistence)
  onSaveJson = null,
}) => {
  // ---- State ----
  const [pdfBytes, setPdfBytes] = useState(null);
  const [numPages, setNumPages] = useState(null);
  const [currentPage, setCurrentPage] = useState(initialPage);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });

  // Tool state
  const [activeTool, setActiveTool] = useState(TOOL.FREEHAND);
  const [activeColor, setActiveColor] = useState('red');
  const [lineWidth] = useState(3);
  const [zoom, setZoom] = useState(1);

  // Drawing state
  const [strokes, setStrokes] = useState([]);           // Freehand strokes: [{ points, color, width, page }]
  const [lines, setLines] = useState([]);                // Straight lines: [{ start, end, color, width, page, hasArrow }]
  const [placedSymbols, setPlacedSymbols] = useState([]); // Placed symbols: [{ symbol, x, y, color, page }]
  const [textAnnotations, setTextAnnotations] = useState([]); // Text: [{ text, x, y, color, fontSize, page }]
  const [builtAsDesigned, setBuiltAsDesigned] = useState(false);

  // Active drawing
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentStroke, setCurrentStroke] = useState(null); // In-progress freehand stroke
  const [lineStart, setLineStart] = useState(null);         // First point of a line tool
  const [tempLineEnd, setTempLineEnd] = useState(null);     // Preview endpoint while hovering

  // Symbol palette
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [selectedSymbol, setSelectedSymbol] = useState(null);

  // Text input
  const [textInput, setTextInput] = useState('');
  const [textPlacement, setTextPlacement] = useState(null); // { x, y } waiting for text

  // PDF dimensions
  const [pdfPageDimensions, setPdfPageDimensions] = useState({ width: 612, height: 792 });

  // Refs
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const [containerWidth, setContainerWidth] = useState(null);

  // Effective colors from config or defaults
  const colors = useMemo(() => {
    if (colorConventions.length > 0) {
      const map = {};
      for (const cc of colorConventions) {
        map[cc.color] = { hex: cc.hex, label: cc.meaning, rgb: hexToRgbArray(cc.hex) };
      }
      return map;
    }
    return DEFAULT_COLORS;
  }, [colorConventions]);

  const activeHex = colors[activeColor]?.hex || '#000000';

  // ---- PDF Loading ----
  useEffect(() => {
    if (!pdfUrl) return;
    const loadPdf = async () => {
      try {
        setLoading(true);
        const isApi = pdfUrl.includes('/api/');
        const token = localStorage.getItem('token');
        const opts = isApi && token ? { headers: { Authorization: `Bearer ${token}` } } : {};
        const response = await fetch(pdfUrl, opts);
        if (!response.ok) throw new Error(`Failed to load PDF (${response.status})`);
        const arrayBuffer = await response.arrayBuffer();
        setPdfBytes(arrayBuffer);

        // Get page dimensions
        const pdfDoc = await PDFDocument.load(arrayBuffer);
        const pages = pdfDoc.getPages();
        if (pages.length > 0) {
          const { width, height } = pages[0].getSize();
          setPdfPageDimensions({ width, height });
        }
        setError('');
      } catch (err) {
        console.error('Error loading PDF:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    loadPdf();
  }, [pdfUrl]);

  // Track container width
  useEffect(() => {
    const update = () => {
      if (containerRef.current) setContainerWidth(containerRef.current.clientWidth);
    };
    update();
    globalThis.addEventListener('resize', update);
    return () => globalThis.removeEventListener('resize', update);
  }, []);

  const onDocumentLoadSuccess = ({ numPages: n }) => {
    setNumPages(n);
    setLoading(false);
  };

  // Scale factor: screen pixels → PDF units
  const displayWidth = containerWidth ? Math.min(containerWidth - 32, 1200) * zoom : 800 * zoom;
  const scaleToActual = pdfPageDimensions.width / (displayWidth || 1);

  // ---- Canvas Rendering ----
  // Re-render the drawing canvas whenever strokes/lines/symbols change
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = displayWidth;
    const h = (pdfPageDimensions.height / pdfPageDimensions.width) * w;
    canvas.width = w;
    canvas.height = h;
    ctx.clearRect(0, 0, w, h);

    // Draw completed freehand strokes for this page
    for (const stroke of strokes.filter(s => s.page === currentPage)) {
      if (stroke.points.length < 2) continue;
      ctx.beginPath();
      ctx.strokeStyle = colors[stroke.color]?.hex || '#000';
      ctx.lineWidth = stroke.width / scaleToActual;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
      for (let i = 1; i < stroke.points.length; i++) {
        ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
      }
      ctx.stroke();
    }

    // Draw in-progress stroke
    if (currentStroke && currentStroke.points.length >= 2) {
      ctx.beginPath();
      ctx.strokeStyle = activeHex;
      ctx.lineWidth = lineWidth / scaleToActual;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.moveTo(currentStroke.points[0].x, currentStroke.points[0].y);
      for (let i = 1; i < currentStroke.points.length; i++) {
        ctx.lineTo(currentStroke.points[i].x, currentStroke.points[i].y);
      }
      ctx.stroke();
    }

    // Draw completed lines/arrows for this page
    for (const line of lines.filter(l => l.page === currentPage)) {
      drawLineOnCanvas(ctx, line.start, line.end, colors[line.color]?.hex || '#000', line.width / scaleToActual, line.hasArrow);
    }

    // Draw line preview
    if (lineStart && tempLineEnd && (activeTool === TOOL.LINE || activeTool === TOOL.ARROW)) {
      drawLineOnCanvas(ctx, lineStart, tempLineEnd, activeHex, lineWidth / scaleToActual, activeTool === TOOL.ARROW);
    }

    // Draw placed symbols for this page
    for (const ps of placedSymbols.filter(s => s.page === currentPage)) {
      drawSymbolOnCanvas(ctx, ps);
    }

    // Draw text annotations for this page
    for (const ta of textAnnotations.filter(t => t.page === currentPage)) {
      ctx.font = `${ta.fontSize / scaleToActual}px Helvetica, Arial, sans-serif`;
      ctx.fillStyle = colors[ta.color]?.hex || '#000';
      ctx.fillText(ta.text, ta.x, ta.y);
    }

    // Draw "Built As Designed" stamp
    if (builtAsDesigned) {
      const stampSize = 24 / scaleToActual;
      ctx.save();
      ctx.translate(w / 2, h / 2);
      ctx.rotate(-0.3);
      ctx.font = `bold ${stampSize}px Helvetica, Arial, sans-serif`;
      ctx.fillStyle = 'rgba(0, 128, 0, 0.4)';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('BUILT AS DESIGNED', 0, 0);
      ctx.strokeStyle = 'rgba(0, 128, 0, 0.6)';
      ctx.lineWidth = 3;
      const tw = ctx.measureText('BUILT AS DESIGNED').width;
      ctx.strokeRect(-tw / 2 - 20, -stampSize / 2 - 10, tw + 40, stampSize + 20);
      ctx.restore();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [strokes, currentStroke, lines, lineStart, tempLineEnd, placedSymbols, textAnnotations,
    builtAsDesigned, currentPage, displayWidth, activeHex, activeTool, lineWidth, scaleToActual]);

  // ---- Canvas Helpers ----

  function drawLineOnCanvas(ctx, start, end, color, width, hasArrow) {
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();

    if (hasArrow) {
      const angle = Math.atan2(end.y - start.y, end.x - start.x);
      const headLen = Math.max(width * 4, 12);
      ctx.beginPath();
      ctx.moveTo(end.x, end.y);
      ctx.lineTo(end.x - headLen * Math.cos(angle - 0.4), end.y - headLen * Math.sin(angle - 0.4));
      ctx.moveTo(end.x, end.y);
      ctx.lineTo(end.x - headLen * Math.cos(angle + 0.4), end.y - headLen * Math.sin(angle + 0.4));
      ctx.stroke();
    }
  }

  function drawSymbolOnCanvas(ctx, ps) {
    const color = colors[ps.color]?.hex || '#000';
    const size = (ps.symbol.width || 32) / scaleToActual;
    // Draw the SVG path using Path2D
    ctx.save();
    ctx.translate(ps.x - size / 2, ps.y - size / 2);
    ctx.scale(size / (ps.symbol.width || 32), size / (ps.symbol.height || 32));
    const path = new Path2D(ps.symbol.svgPath);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.stroke(path);
    ctx.restore();
  }

  // ---- Event Handlers ----

  const getCanvasPoint = useCallback((e) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
    };
  }, []);

  const handlePointerDown = useCallback((e) => {
    e.preventDefault();
    const pt = getCanvasPoint(e);
    if (!pt) return;

    if (activeTool === TOOL.FREEHAND) {
      setIsDrawing(true);
      setCurrentStroke({ points: [pt], color: activeColor, width: lineWidth, page: currentPage });
    } else if (activeTool === TOOL.LINE || activeTool === TOOL.ARROW) {
      if (!lineStart) {
        setLineStart(pt);
      } else {
        // Complete the line
        pushUndo('line', currentPage);
        setLines(prev => [...prev, {
          start: lineStart,
          end: pt,
          color: activeColor,
          width: lineWidth,
          page: currentPage,
          hasArrow: activeTool === TOOL.ARROW,
        }]);
        setLineStart(null);
        setTempLineEnd(null);
      }
    } else if (activeTool === TOOL.SYMBOL && selectedSymbol) {
      pushUndo('symbol', currentPage);
      setPlacedSymbols(prev => [...prev, {
        symbol: selectedSymbol,
        x: pt.x,
        y: pt.y,
        color: activeColor,
        page: currentPage,
      }]);
    } else if (activeTool === TOOL.TEXT) {
      setTextPlacement(pt);
    }
  }, [activeTool, activeColor, lineWidth, currentPage, lineStart, selectedSymbol, getCanvasPoint, pushUndo]);

  const handlePointerMove = useCallback((e) => {
    e.preventDefault();
    const pt = getCanvasPoint(e);
    if (!pt) return;

    if (activeTool === TOOL.FREEHAND && isDrawing && currentStroke) {
      setCurrentStroke(prev => ({
        ...prev,
        points: [...prev.points, pt],
      }));
    } else if ((activeTool === TOOL.LINE || activeTool === TOOL.ARROW) && lineStart) {
      setTempLineEnd(pt);
    }
  }, [activeTool, isDrawing, currentStroke, lineStart, getCanvasPoint]);

  const handlePointerUp = useCallback(() => {
    if (activeTool === TOOL.FREEHAND && isDrawing && currentStroke) {
      if (currentStroke.points.length >= 2) {
        pushUndo('stroke', currentPage);
        setStrokes(prev => [...prev, currentStroke]);
      }
      setCurrentStroke(null);
      setIsDrawing(false);
    }
  }, [activeTool, isDrawing, currentStroke, currentPage, pushUndo]);

  // Submit text annotation
  const handleTextSubmit = () => {
    if (!textInput.trim() || !textPlacement) return;
    pushUndo('text', currentPage);
    setTextAnnotations(prev => [...prev, {
      text: textInput.trim(),
      x: textPlacement.x,
      y: textPlacement.y,
      color: activeColor,
      fontSize: 14,
      page: currentPage,
    }]);
    setTextInput('');
    setTextPlacement(null);
  };

  // ---- Undo / Redo stack ----
  const [undoStack, setUndoStack] = useState([]);
  const [redoStack, setRedoStack] = useState([]);

  // Push to undo stack whenever an annotation is added
  const pushUndo = useCallback((type, page) => {
    setUndoStack(prev => {
      const next = [...prev, { type, page }];
      return next.length > MAX_UNDO_STACK ? next.slice(-MAX_UNDO_STACK) : next;
    });
    // Clear redo stack when a new action is performed
    setRedoStack([]);
  }, []);

  // Helper: find last index matching a predicate
  function findLastIndex(arr, predicate) {
    for (let i = arr.length - 1; i >= 0; i--) {
      if (predicate(arr[i])) return i;
    }
    return -1;
  }

  // ---- Undo ----
  const handleUndo = useCallback(() => {
    const lastOnPage = [...undoStack].reverse().findIndex(u => u.page === currentPage);
    if (lastOnPage < 0) {
      if (builtAsDesigned) setBuiltAsDesigned(false);
      return;
    }
    const undoIdx = undoStack.length - 1 - lastOnPage;
    const entry = undoStack[undoIdx];

    // Remove the item and push it to the redo stack with its data
    let removedItem = null;
    switch (entry.type) {
      case 'stroke': {
        const idx = findLastIndex(strokes, s => s.page === currentPage);
        if (idx >= 0) {
          removedItem = strokes[idx];
          setStrokes(prev => prev.filter((_, i) => i !== idx));
        }
        break;
      }
      case 'line': {
        const idx = findLastIndex(lines, l => l.page === currentPage);
        if (idx >= 0) {
          removedItem = lines[idx];
          setLines(prev => prev.filter((_, i) => i !== idx));
        }
        break;
      }
      case 'symbol': {
        const idx = findLastIndex(placedSymbols, s => s.page === currentPage);
        if (idx >= 0) {
          removedItem = placedSymbols[idx];
          setPlacedSymbols(prev => prev.filter((_, i) => i !== idx));
        }
        break;
      }
      case 'text': {
        const idx = findLastIndex(textAnnotations, t => t.page === currentPage);
        if (idx >= 0) {
          removedItem = textAnnotations[idx];
          setTextAnnotations(prev => prev.filter((_, i) => i !== idx));
        }
        break;
      }
    }

    // Move to redo stack
    setRedoStack(prev => [...prev, { ...entry, data: removedItem }]);
    setUndoStack(prev => prev.filter((_, i) => i !== undoIdx));
  }, [undoStack, currentPage, builtAsDesigned, strokes, lines, placedSymbols, textAnnotations]);

  // ---- Redo ----
  const handleRedo = useCallback(() => {
    const lastOnPage = [...redoStack].reverse().findIndex(r => r.page === currentPage);
    if (lastOnPage < 0) return;
    const redoIdx = redoStack.length - 1 - lastOnPage;
    const entry = redoStack[redoIdx];

    if (entry.data) {
      switch (entry.type) {
        case 'stroke': setStrokes(prev => [...prev, entry.data]); break;
        case 'line': setLines(prev => [...prev, entry.data]); break;
        case 'symbol': setPlacedSymbols(prev => [...prev, entry.data]); break;
        case 'text': setTextAnnotations(prev => [...prev, entry.data]); break;
      }
    }

    // Move back to undo stack
    setUndoStack(prev => [...prev, { type: entry.type, page: entry.page }]);
    setRedoStack(prev => prev.filter((_, i) => i !== redoIdx));
  }, [redoStack, currentPage]);

  // ---- Restore from saved JSON ----
  useEffect(() => {
    if (!initialData) return;
    try {
      const data = typeof initialData === 'string' ? JSON.parse(initialData) : initialData;
      if (data.strokes) setStrokes(data.strokes);
      if (data.lines) setLines(data.lines);
      if (data.placedSymbols) setPlacedSymbols(data.placedSymbols);
      if (data.textAnnotations) setTextAnnotations(data.textAnnotations);
      if (data.builtAsDesigned) setBuiltAsDesigned(data.builtAsDesigned);
    } catch (err) {
      console.error('[SketchMarkupEditor] Failed to restore saved data:', err);
    }
  }, [initialData]);

  // ---- Save as JSON (for draft persistence) ----
  const handleSaveJson = useCallback(() => {
    if (!onSaveJson) return;
    const data = {
      strokes,
      lines,
      placedSymbols,
      textAnnotations,
      builtAsDesigned,
      savedAt: new Date().toISOString(),
    };
    onSaveJson(data);
  }, [strokes, lines, placedSymbols, textAnnotations, builtAsDesigned, onSaveJson]);

  // ---- Keyboard Shortcuts (Ctrl+Z = undo, Ctrl+Shift+Z = redo) ----
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Ignore when typing in text fields
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'z') {
        e.preventDefault();
        handleRedo();
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        handleUndo();
      }
    };
    globalThis.addEventListener('keydown', handleKeyDown);
    return () => globalThis.removeEventListener('keydown', handleKeyDown);
  }, [handleUndo, handleRedo]);

  const hasAnyMarkup = strokes.length > 0 || lines.length > 0 || placedSymbols.length > 0
    || textAnnotations.length > 0 || builtAsDesigned;

  // ---- Built As Designed ----
  const handleBuiltAsDesigned = () => {
    setBuiltAsDesigned(true);
    setActiveTool(null);
    setSnackbar({ open: true, message: 'Marked as "Built As Designed" — no redlines needed', severity: 'success' });
  };

  // ---- Save to PDF ----
  const handleSave = async () => {
    if (!pdfBytes || !hasAnyMarkup) return;
    setSaving(true);

    try {
      const pdfDoc = await PDFDocument.load(pdfBytes);
      const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
      const pages = pdfDoc.getPages();

      // Draw freehand strokes
      for (const stroke of strokes) {
        const pageIdx = (stroke.page || 1) - 1;
        if (pageIdx >= pages.length) continue;
        const page = pages[pageIdx];
        const { height: ph } = page.getSize();
        const color = colorToRgb(stroke.color);

        for (let i = 0; i < stroke.points.length - 1; i++) {
          page.drawLine({
            start: { x: stroke.points[i].x * scaleToActual, y: ph - stroke.points[i].y * scaleToActual },
            end: { x: stroke.points[i + 1].x * scaleToActual, y: ph - stroke.points[i + 1].y * scaleToActual },
            thickness: stroke.width,
            color,
          });
        }
      }

      // Draw lines/arrows
      for (const line of lines) {
        const pageIdx = (line.page || 1) - 1;
        if (pageIdx >= pages.length) continue;
        const page = pages[pageIdx];
        const { height: ph } = page.getSize();
        const color = colorToRgb(line.color);

        page.drawLine({
          start: { x: line.start.x * scaleToActual, y: ph - line.start.y * scaleToActual },
          end: { x: line.end.x * scaleToActual, y: ph - line.end.y * scaleToActual },
          thickness: line.width,
          color,
        });

        // Arrowhead
        if (line.hasArrow) {
          const sx = line.start.x * scaleToActual;
          const sy = ph - line.start.y * scaleToActual;
          const ex = line.end.x * scaleToActual;
          const ey = ph - line.end.y * scaleToActual;
          const angle = Math.atan2(ey - sy, ex - sx);
          const headLen = Math.max(line.width * 4, 8);

          page.drawLine({
            start: { x: ex, y: ey },
            end: { x: ex - headLen * Math.cos(angle - 0.4), y: ey - headLen * Math.sin(angle - 0.4) },
            thickness: line.width,
            color,
          });
          page.drawLine({
            start: { x: ex, y: ey },
            end: { x: ex - headLen * Math.cos(angle + 0.4), y: ey - headLen * Math.sin(angle + 0.4) },
            thickness: line.width,
            color,
          });
        }
      }

      // Draw placed symbols (as SVG paths)
      for (const ps of placedSymbols) {
        const pageIdx = (ps.page || 1) - 1;
        if (pageIdx >= pages.length) continue;
        const page = pages[pageIdx];
        const { height: ph } = page.getSize();
        const color = colorToRgb(ps.color);
        const symSize = ps.symbol.width || 32;

        try {
          page.drawSvgPath(ps.symbol.svgPath, {
            x: ps.x * scaleToActual - symSize / 2,
            y: ph - ps.y * scaleToActual - symSize / 2,
            scale: 1,
            color,
            borderColor: color,
            borderWidth: 2,
          });
        } catch (_err) {
          // Fallback: draw a marker dot if SVG path fails
          page.drawCircle({
            x: ps.x * scaleToActual,
            y: ph - ps.y * scaleToActual,
            size: 6,
            color,
          });
        }
      }

      // Draw text annotations
      for (const ta of textAnnotations) {
        const pageIdx = (ta.page || 1) - 1;
        if (pageIdx >= pages.length) continue;
        const page = pages[pageIdx];
        const { height: ph } = page.getSize();

        page.drawText(ta.text, {
          x: ta.x * scaleToActual,
          y: ph - ta.y * scaleToActual,
          size: ta.fontSize,
          font: helveticaFont,
          color: colorToRgb(ta.color),
        });
      }

      // Draw "Built As Designed" stamp
      if (builtAsDesigned) {
        for (const page of pages) {
          const { width: pw, height: ph } = page.getSize();
          page.drawText('BUILT AS DESIGNED', {
            x: pw / 2 - 120,
            y: ph / 2,
            size: 28,
            font: helveticaBold,
            color: rgb(0, 0.5, 0),
            opacity: 0.5,
            rotate: { type: 'degrees', angle: -20 },
          });
        }
      }

      const modifiedPdfBytes = await pdfDoc.save();
      const base64 = btoa(
        new Uint8Array(modifiedPdfBytes)
          .reduce((data, byte) => data + String.fromCodePoint(byte), '')
      );

      if (onSave) {
        await onSave(base64, documentName, {
          strokeCount: strokes.length,
          lineCount: lines.length,
          symbolCount: placedSymbols.length,
          textCount: textAnnotations.length,
          builtAsDesigned,
          colorsUsed: getColorsUsed(),
        });
      }

      // Also persist the JSON state for resume capability
      handleSaveJson();

      setSnackbar({ open: true, message: 'Sketch markup saved!', severity: 'success' });
    } catch (err) {
      console.error('Error saving markup:', err);
      setSnackbar({ open: true, message: 'Save failed: ' + err.message, severity: 'error' });
    } finally {
      setSaving(false);
    }
  };

  // Get summary of colors used
  const getColorsUsed = () => {
    const used = new Set();
    strokes.forEach(s => used.add(s.color));
    lines.forEach(l => used.add(l.color));
    placedSymbols.forEach(s => used.add(s.color));
    textAnnotations.forEach(t => used.add(t.color));
    return Array.from(used);
  };

  // ---- Render ----

  if (error) {
    return (
      <Box sx={{ p: 3, textAlign: 'center' }}>
        <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>
      </Box>
    );
  }

  const canvasHeight = displayWidth * (pdfPageDimensions.height / pdfPageDimensions.width);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* ===== TOOLBAR ===== */}
      <Paper elevation={2} sx={{ px: 1.5, py: 1, borderRadius: 0, flexShrink: 0 }}>
        {/* Row 1: Color Mode */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.75 }}>
          <Typography variant="caption" sx={{ fontWeight: 600, mr: 0.5 }}>MODE:</Typography>
          <ToggleButtonGroup
            value={activeColor}
            exclusive
            onChange={(_, v) => { if (v) setActiveColor(v); }}
            size="small"
          >
            {Object.entries(colors).map(([name, config]) => (
              <ToggleButton
                key={name}
                value={name}
                sx={{
                  px: 1.5, py: 0.5, fontSize: '0.7rem', fontWeight: 700,
                  color: config.hex,
                  borderColor: activeColor === name ? config.hex : 'grey.400',
                  bgcolor: activeColor === name ? `${config.hex}15` : 'transparent',
                  '&.Mui-selected': {
                    color: config.hex,
                    bgcolor: `${config.hex}20`,
                    borderColor: config.hex,
                    '&:hover': { bgcolor: `${config.hex}30` },
                  },
                }}
              >
                {name.toUpperCase()}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
          <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>
            {colors[activeColor]?.label}
          </Typography>
        </Box>

        {/* Row 2: Tools */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap' }}>
          <Tooltip title="Freehand Draw (finger/stylus)">
            <Button
              size="small"
              variant={activeTool === TOOL.FREEHAND ? 'contained' : 'outlined'}
              onClick={() => setActiveTool(TOOL.FREEHAND)}
              sx={{ minWidth: 44, minHeight: 40, px: 1 }}
            >
              <GestureIcon fontSize="small" />
            </Button>
          </Tooltip>

          <Tooltip title="Straight Line">
            <Button
              size="small"
              variant={activeTool === TOOL.LINE ? 'contained' : 'outlined'}
              onClick={() => { setActiveTool(TOOL.LINE); setLineStart(null); }}
              sx={{ minWidth: 44, minHeight: 40, px: 1 }}
            >
              <TimelineIcon fontSize="small" />
            </Button>
          </Tooltip>

          <Tooltip title="Arrow">
            <Button
              size="small"
              variant={activeTool === TOOL.ARROW ? 'contained' : 'outlined'}
              onClick={() => { setActiveTool(TOOL.ARROW); setLineStart(null); }}
              sx={{ minWidth: 44, minHeight: 40, px: 1 }}
            >
              <ArrowForwardIcon fontSize="small" />
            </Button>
          </Tooltip>

          <Tooltip title="Text">
            <Button
              size="small"
              variant={activeTool === TOOL.TEXT ? 'contained' : 'outlined'}
              onClick={() => setActiveTool(TOOL.TEXT)}
              sx={{ minWidth: 44, minHeight: 40, px: 1 }}
            >
              <TextFieldsIcon fontSize="small" />
            </Button>
          </Tooltip>

          <Tooltip title="Symbol Palette">
            <Button
              size="small"
              variant={activeTool === TOOL.SYMBOL ? 'contained' : 'outlined'}
              onClick={() => { setActiveTool(TOOL.SYMBOL); setPaletteOpen(p => !p); }}
              sx={{ minWidth: 44, minHeight: 40, px: 1 }}
            >
              <CategoryIcon fontSize="small" />
            </Button>
          </Tooltip>

          <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />

          <Tooltip title="Built As Designed (no changes from estimate)">
            <Button
              size="small"
              variant={builtAsDesigned ? 'contained' : 'outlined'}
              color="success"
              onClick={handleBuiltAsDesigned}
              sx={{ minWidth: 44, minHeight: 40, px: 1.5, fontSize: '0.65rem', fontWeight: 700 }}
            >
              <CheckCircleIcon fontSize="small" sx={{ mr: 0.5 }} />BAD
            </Button>
          </Tooltip>

          <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />

          {/* Zoom */}
          <IconButton size="small" onClick={() => setZoom(z => Math.max(0.5, z - 0.25))}>
            <ZoomOutIcon fontSize="small" />
          </IconButton>
          <Typography variant="caption" sx={{ minWidth: 32, textAlign: 'center' }}>
            {Math.round(zoom * 100)}%
          </Typography>
          <IconButton size="small" onClick={() => setZoom(z => Math.min(3, z + 0.25))}>
            <ZoomInIcon fontSize="small" />
          </IconButton>

          <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />

          <Tooltip title="Undo (Ctrl+Z)">
            <span>
              <IconButton size="small" onClick={handleUndo} disabled={!hasAnyMarkup}>
                <UndoIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title="Redo (Ctrl+Shift+Z)">
            <span>
              <IconButton size="small" onClick={handleRedo} disabled={redoStack.length === 0}>
                <RedoIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>

          <Button
            size="small"
            variant="contained"
            color="primary"
            onClick={handleSave}
            disabled={saving || !hasAnyMarkup}
            startIcon={saving ? <CircularProgress size={16} /> : <SaveIcon />}
            sx={{ ml: 'auto', minWidth: 80, minHeight: 40 }}
          >
            Save
          </Button>
        </Box>
      </Paper>

      {/* ===== CONTENT AREA ===== */}
      <Box sx={{ display: 'flex', flexGrow: 1, overflow: 'hidden' }}>
        {/* Symbol Palette Drawer */}
        <Drawer
          variant="persistent"
          anchor="left"
          open={paletteOpen && activeTool === TOOL.SYMBOL}
          sx={{
            '& .MuiDrawer-paper': { position: 'relative', width: 280, border: 'none', borderRight: 1, borderColor: 'divider' },
          }}
        >
          <SymbolPalette
            symbols={symbols}
            activeColor={activeHex}
            activeColorName={activeColor}
            selectedSymbol={selectedSymbol?.code || null}
            onSelectSymbol={(sym) => setSelectedSymbol(sym)}
            onClose={() => setPaletteOpen(false)}
          />
        </Drawer>

        {/* PDF + Canvas */}
        <Box
          ref={containerRef}
          sx={{
            flexGrow: 1,
            overflow: 'auto',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            p: 2,
            bgcolor: '#e0e0e0',
          }}
        >
          {loading ? (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, py: 8 }}>
              <CircularProgress size={32} />
              <Typography>Loading sketch...</Typography>
            </Box>
          ) : (
            <>
              {/* Page navigation */}
              {numPages > 1 && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                  <IconButton
                    size="small"
                    disabled={currentPage <= 1}
                    onClick={() => setCurrentPage(p => p - 1)}
                  >
                    <NavigateBeforeIcon />
                  </IconButton>
                  <Chip label={`Page ${currentPage} / ${numPages}`} size="small" />
                  <IconButton
                    size="small"
                    disabled={currentPage >= numPages}
                    onClick={() => setCurrentPage(p => p + 1)}
                  >
                    <NavigateNextIcon />
                  </IconButton>
                </Box>
              )}

              {/* PDF + Drawing Overlay */}
              <Box
                sx={{
                  position: 'relative',
                  cursor: getCursor(activeTool),
                  userSelect: 'none',
                  touchAction: 'none',
                }}
              >
                <Document file={{ data: pdfBytes }} onLoadSuccess={onDocumentLoadSuccess}>
                  <Page
                    pageNumber={currentPage}
                    width={displayWidth}
                    renderTextLayer={false}
                    renderAnnotationLayer={false}
                  />
                </Document>

                {/* Drawing canvas overlay */}
                <canvas
                  ref={canvasRef}
                  width={displayWidth}
                  height={canvasHeight}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: displayWidth,
                    height: canvasHeight,
                    pointerEvents: activeTool ? 'auto' : 'none',
                  }}
                  onMouseDown={handlePointerDown}
                  onMouseMove={handlePointerMove}
                  onMouseUp={handlePointerUp}
                  onMouseLeave={handlePointerUp}
                  onTouchStart={handlePointerDown}
                  onTouchMove={handlePointerMove}
                  onTouchEnd={handlePointerUp}
                />
              </Box>
            </>
          )}
        </Box>
      </Box>

      {/* Text input dialog */}
      {textPlacement && (
        <Paper
          elevation={4}
          sx={{
            position: 'fixed',
            bottom: 16,
            left: '50%',
            transform: 'translateX(-50%)',
            p: 2,
            display: 'flex',
            gap: 1,
            alignItems: 'center',
            zIndex: 1300,
            borderRadius: 2,
          }}
        >
          <TextField
            autoFocus
            size="small"
            placeholder="Type annotation text..."
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleTextSubmit(); if (e.key === 'Escape') setTextPlacement(null); }}
            sx={{ minWidth: 200 }}
          />
          <Button size="small" variant="contained" onClick={handleTextSubmit} disabled={!textInput.trim()}>
            Place
          </Button>
          <Button size="small" onClick={() => setTextPlacement(null)}>
            Cancel
          </Button>
        </Paper>
      )}

      {/* Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={3000}
        onClose={() => setSnackbar(s => ({ ...s, open: false }))}
        message={snackbar.message}
      />
    </Box>
  );
};

// ---- Helpers ----

function hexToRgbArray(hex) {
  const h = hex.replace('#', '');
  return [
    parseInt(h.substring(0, 2), 16) / 255,
    parseInt(h.substring(2, 4), 16) / 255,
    parseInt(h.substring(4, 6), 16) / 255,
  ];
}

SketchMarkupEditor.propTypes = {
  pdfUrl: PropTypes.string.isRequired,
  jobInfo: PropTypes.object,
  onSave: PropTypes.func,
  symbols: PropTypes.array,
  colorConventions: PropTypes.array,
  documentName: PropTypes.string,
  initialPage: PropTypes.number,
  initialData: PropTypes.oneOfType([PropTypes.object, PropTypes.string]),
  onSaveJson: PropTypes.func,
};

export default SketchMarkupEditor;

