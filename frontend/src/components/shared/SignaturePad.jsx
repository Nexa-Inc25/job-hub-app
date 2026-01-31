/**
 * Job Hub Pro - SignaturePad Component
 * Copyright (c) 2024-2026 Job Hub Pro. All Rights Reserved.
 * 
 * Reusable signature capture component for crew sign-offs.
 */

import React, { useRef, useState, useEffect } from 'react';
import SignatureCanvas from 'react-signature-canvas';
import {
  Box,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Typography,
  IconButton,
  Paper,
  useTheme,
  useMediaQuery
} from '@mui/material';
import {
  Clear as ClearIcon,
  Check as CheckIcon,
  Close as CloseIcon
} from '@mui/icons-material';

/**
 * SignaturePad Component
 * 
 * @param {Object} props
 * @param {boolean} props.open - Dialog open state
 * @param {function} props.onClose - Close handler
 * @param {function} props.onSave - Save handler (receives {name, role, signatureData})
 * @param {string} props.initialName - Pre-filled name
 * @param {string} props.initialRole - Pre-filled role
 * @param {string} props.title - Dialog title
 */
const SignaturePad = ({ 
  open, 
  onClose, 
  onSave, 
  initialName = '', 
  initialRole = 'crew',
  title = 'Sign Tailboard'
}) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const sigCanvas = useRef(null);
  const [name, setName] = useState(initialName);
  const [role, setRole] = useState(initialRole);
  const [isEmpty, setIsEmpty] = useState(true);

  // Reset when dialog opens
  useEffect(() => {
    if (open) {
      setName(initialName);
      setRole(initialRole);
      setIsEmpty(true);
      if (sigCanvas.current) {
        sigCanvas.current.clear();
      }
    }
  }, [open, initialName, initialRole]);

  const handleClear = () => {
    if (sigCanvas.current) {
      sigCanvas.current.clear();
      setIsEmpty(true);
    }
  };

  const handleSave = () => {
    if (!name.trim()) {
      return;
    }
    
    if (sigCanvas.current && !isEmpty) {
      const signatureData = sigCanvas.current.getTrimmedCanvas().toDataURL('image/png');
      onSave({
        name: name.trim(),
        role,
        signatureData
      });
      onClose();
    }
  };

  const handleEnd = () => {
    if (sigCanvas.current) {
      setIsEmpty(sigCanvas.current.isEmpty());
    }
  };

  const canvasWidth = isMobile ? 280 : 450;
  const canvasHeight = isMobile ? 150 : 200;

  return (
    <Dialog 
      open={open} 
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: { m: isMobile ? 1 : 2 }
      }}
    >
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h6">{title}</Typography>
        <IconButton onClick={onClose} size="small">
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
          <TextField
            label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            fullWidth
            required
            placeholder="Enter your name"
            size={isMobile ? 'small' : 'medium'}
          />
          
          <TextField
            label="Role"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            fullWidth
            select
            SelectProps={{ native: true }}
            size={isMobile ? 'small' : 'medium'}
          >
            <option value="foreman">Foreman</option>
            <option value="crew">Crew Member</option>
            <option value="apprentice">Apprentice</option>
            <option value="operator">Equipment Operator</option>
            <option value="flagger">Flagger</option>
          </TextField>

          <Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              Sign below:
            </Typography>
            <Paper
              elevation={0}
              sx={{
                border: `2px solid ${theme.palette.divider}`,
                borderRadius: 1,
                overflow: 'hidden',
                bgcolor: theme.palette.mode === 'dark' ? '#1e1e1e' : '#fff',
                position: 'relative'
              }}
            >
              <SignatureCanvas
                ref={sigCanvas}
                canvasProps={{
                  width: canvasWidth,
                  height: canvasHeight,
                  style: {
                    width: '100%',
                    height: canvasHeight,
                    touchAction: 'none'
                  }
                }}
                penColor={theme.palette.mode === 'dark' ? '#fff' : '#000'}
                backgroundColor={theme.palette.mode === 'dark' ? '#1e1e1e' : '#fff'}
                onEnd={handleEnd}
              />
              <IconButton
                onClick={handleClear}
                size="small"
                sx={{
                  position: 'absolute',
                  top: 4,
                  right: 4,
                  bgcolor: 'action.hover'
                }}
                title="Clear signature"
              >
                <ClearIcon fontSize="small" />
              </IconButton>
            </Paper>
            {isEmpty && (
              <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                Use your finger or stylus to sign
              </Typography>
            )}
          </Box>
        </Box>
      </DialogContent>

      <DialogActions sx={{ p: 2, pt: 0 }}>
        <Button onClick={onClose} color="inherit">
          Cancel
        </Button>
        <Button
          onClick={handleSave}
          variant="contained"
          disabled={!name.trim() || isEmpty}
          startIcon={<CheckIcon />}
        >
          Sign & Confirm
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default SignaturePad;
