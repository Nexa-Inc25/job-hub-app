/**
 * TemplatePreview - PDF preview panel for SmartForms template editor
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 */

import React, { useRef, useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import { Box, CircularProgress, Typography, Alert } from '@mui/material';

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

const TemplatePreview = ({
  pdfBlobUrl, currentPage, zoom, isDark,
  drawMode, onMouseDown, onMouseMove, onMouseUp, onMouseLeave,
  isDrawing, drawRect, onDocumentLoadSuccess, onError,
  renderOverlays, onPageRendered,
}) => {
  const containerRef = useRef(null);
  const [containerWidth, setContainerWidth] = useState(null);

  useEffect(() => {
    const updateWidth = () => {
      if (containerRef.current) setContainerWidth(containerRef.current.clientWidth);
    };
    updateWidth();
    globalThis.addEventListener('resize', updateWidth);
    return () => globalThis.removeEventListener('resize', updateWidth);
  }, []);

  return (
    <Box
      ref={containerRef}
      sx={{ flex: 1, overflow: 'auto', p: 2, bgcolor: isDark ? 'grey.900' : 'grey.300' }}
    >
      <Box sx={{ display: 'flex', justifyContent: 'center', minWidth: 'fit-content' }}>
        {pdfBlobUrl ? (
          <Document
            file={pdfBlobUrl}
            onLoadSuccess={onDocumentLoadSuccess}
            onLoadError={err => { console.error('[TemplatePreview] PDF load error:', err); onError('Failed to load PDF: ' + err.message); }}
            loading={<Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress /></Box>}
            error={<Box sx={{ p: 4, textAlign: 'center' }}><Alert severity="error">Failed to load PDF. Please try again.</Alert></Box>}
          >
            <Box
              sx={{ position: 'relative', bgcolor: 'white', boxShadow: 3, cursor: drawMode ? 'crosshair' : 'default' }}
              onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseLeave}
            >
              <Page
                pageNumber={currentPage} scale={zoom} renderTextLayer={false} renderAnnotationLayer={false}
                width={containerWidth ? Math.min(containerWidth - 64, 800) : undefined}
                onRenderSuccess={() => onPageRendered()}
                onRenderError={err => console.error('Page render error:', err)}
                error={<Box sx={{ p: 4, textAlign: 'center', bgcolor: 'white' }}><Alert severity="error">Failed to render page {currentPage}</Alert></Box>}
              />
              {renderOverlays(containerRef.current?.querySelector('.react-pdf__Page'))}
              {isDrawing && drawRect && (
                <Box sx={{
                  position: 'absolute', left: drawRect.left, top: drawRect.top,
                  width: drawRect.width, height: drawRect.height,
                  border: '2px dashed #1976d2', bgcolor: 'rgba(25, 118, 210, 0.2)', pointerEvents: 'none',
                }} />
              )}
            </Box>
          </Document>
        ) : (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', p: 4, minHeight: 400 }}>
            <CircularProgress /><Typography sx={{ ml: 2 }}>Loading PDF...</Typography>
          </Box>
        )}
      </Box>
    </Box>
  );
};

TemplatePreview.propTypes = {
  pdfBlobUrl: PropTypes.string,
  currentPage: PropTypes.number.isRequired,
  zoom: PropTypes.number.isRequired,
  isDark: PropTypes.bool.isRequired,
  drawMode: PropTypes.bool.isRequired,
  onMouseDown: PropTypes.func.isRequired,
  onMouseMove: PropTypes.func.isRequired,
  onMouseUp: PropTypes.func.isRequired,
  onMouseLeave: PropTypes.func.isRequired,
  isDrawing: PropTypes.bool.isRequired,
  drawRect: PropTypes.object,
  onDocumentLoadSuccess: PropTypes.func.isRequired,
  onError: PropTypes.func.isRequired,
  renderOverlays: PropTypes.func.isRequired,
  onPageRendered: PropTypes.func.isRequired,
};

export default TemplatePreview;
