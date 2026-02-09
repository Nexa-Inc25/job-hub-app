/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
/**
 * Voice Capture Component
 * 
 * Hands-free voice input for unit entry and field ticket capture.
 * Uses Web Audio API for recording and sends to OpenAI Whisper
 * for transcription, then GPT-4 for structured data extraction.
 * 
 * Features:
 * - Push-to-talk or toggle recording
 * - Visual recording indicator with waveform
 * - Multilingual support (Spanish, Portuguese)
 * - Parsed result confirmation before form auto-fill
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import PropTypes from 'prop-types';
import {
  Box,
  Typography,
  Button,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  CircularProgress,
  Alert,
  Chip,
  Card,
  CardContent,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Tooltip,
} from '@mui/material';
import MicIcon from '@mui/icons-material/Mic';
import StopIcon from '@mui/icons-material/Stop';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import RefreshIcon from '@mui/icons-material/Refresh';
import TranslateIcon from '@mui/icons-material/Translate';
import PersonIcon from '@mui/icons-material/Person';
import BuildIcon from '@mui/icons-material/Build';
import InventoryIcon from '@mui/icons-material/Inventory';
import InfoIcon from '@mui/icons-material/Info';
import api from '../../api';

// High-contrast colors
const COLORS = {
  bg: '#0a0a0f',
  surface: '#16161f',
  surfaceLight: '#1e1e2a',
  primary: '#00e676',
  primaryDark: '#00c853',
  error: '#ff5252',
  warning: '#ffab00',
  text: '#ffffff',
  textSecondary: '#9e9e9e',
  border: '#333344',
  recording: '#ff1744',
};

/**
 * Audio Visualizer Component - shows waveform during recording
 */
const AudioVisualizer = ({ analyser, isRecording }) => {
  const canvasRef = useRef(null);
  const animationRef = useRef(null);

  useEffect(() => {
    if (!isRecording || !analyser || !canvasRef.current) {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      return;
    }

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      if (!isRecording) return;
      
      animationRef.current = requestAnimationFrame(draw);
      analyser.getByteTimeDomainData(dataArray);

      ctx.fillStyle = COLORS.surface;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.lineWidth = 2;
      ctx.strokeStyle = COLORS.recording;
      ctx.beginPath();

      const sliceWidth = canvas.width / bufferLength;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const v = dataArray[i] / 128;
        const y = (v * canvas.height) / 2;

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }

        x += sliceWidth;
      }

      ctx.lineTo(canvas.width, canvas.height / 2);
      ctx.stroke();
    };

    draw();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isRecording, analyser]);

  return (
    <canvas
      ref={canvasRef}
      width={300}
      height={60}
      style={{
        width: '100%',
        height: 60,
        borderRadius: 8,
        border: `1px solid ${isRecording ? COLORS.recording : COLORS.border}`,
      }}
    />
  );
};

AudioVisualizer.propTypes = {
  analyser: PropTypes.object,
  isRecording: PropTypes.bool,
};

/**
 * Parsed Result Display Component
 */
const ParsedResultDisplay = ({ parsed, dataType }) => {
  if (!parsed) return null;

  if (dataType === 'fieldticket') {
    return (
      <Box>
        {parsed.changeReason && (
          <Chip
            label={parsed.changeReason.replace('_', ' ').toUpperCase()}
            size="small"
            sx={{ mb: 2, bgcolor: COLORS.warning, color: COLORS.bg }}
          />
        )}
        
        {parsed.changeDescription && (
          <Typography variant="body2" sx={{ color: COLORS.text, mb: 2 }}>
            {parsed.changeDescription}
          </Typography>
        )}

        {parsed.laborEntries?.length > 0 && (
          <Box sx={{ mb: 2 }}>
            <Typography variant="caption" sx={{ color: COLORS.textSecondary }}>
              LABOR ({parsed.laborEntries.length})
            </Typography>
            <List dense>
              {parsed.laborEntries.map((entry) => (
                <ListItem key={entry.workerName || entry.role || Math.random()} sx={{ py: 0 }}>
                  <ListItemIcon sx={{ minWidth: 32 }}>
                    <PersonIcon sx={{ color: COLORS.primary, fontSize: 18 }} />
                  </ListItemIcon>
                  <ListItemText
                    primary={entry.workerName || entry.role}
                    secondary={`${entry.regularHours || 0}h reg, ${entry.overtimeHours || 0}h OT`}
                    primaryTypographyProps={{ color: COLORS.text, fontSize: '0.875rem' }}
                    secondaryTypographyProps={{ color: COLORS.textSecondary }}
                  />
                </ListItem>
              ))}
            </List>
          </Box>
        )}

        {parsed.equipmentEntries?.length > 0 && (
          <Box sx={{ mb: 2 }}>
            <Typography variant="caption" sx={{ color: COLORS.textSecondary }}>
              EQUIPMENT ({parsed.equipmentEntries.length})
            </Typography>
            <List dense>
              {parsed.equipmentEntries.map((entry) => (
                <ListItem key={entry.description || entry.equipmentType || Math.random()} sx={{ py: 0 }}>
                  <ListItemIcon sx={{ minWidth: 32 }}>
                    <BuildIcon sx={{ color: COLORS.warning, fontSize: 18 }} />
                  </ListItemIcon>
                  <ListItemText
                    primary={entry.description || entry.equipmentType}
                    secondary={`${entry.hours || 0}h`}
                    primaryTypographyProps={{ color: COLORS.text, fontSize: '0.875rem' }}
                    secondaryTypographyProps={{ color: COLORS.textSecondary }}
                  />
                </ListItem>
              ))}
            </List>
          </Box>
        )}

        {parsed.materialEntries?.length > 0 && (
          <Box>
            <Typography variant="caption" sx={{ color: COLORS.textSecondary }}>
              MATERIALS ({parsed.materialEntries.length})
            </Typography>
            <List dense>
              {parsed.materialEntries.map((entry) => (
                <ListItem key={entry.description || entry.materialCode || Math.random()} sx={{ py: 0 }}>
                  <ListItemIcon sx={{ minWidth: 32 }}>
                    <InventoryIcon sx={{ color: '#64b5f6', fontSize: 18 }} />
                  </ListItemIcon>
                  <ListItemText
                    primary={entry.description}
                    secondary={`${entry.quantity} ${entry.unit || 'EA'}`}
                    primaryTypographyProps={{ color: COLORS.text, fontSize: '0.875rem' }}
                    secondaryTypographyProps={{ color: COLORS.textSecondary }}
                  />
                </ListItem>
              ))}
            </List>
          </Box>
        )}
      </Box>
    );
  }

  // Unit entry display
  return (
    <Box>
      {parsed.itemCode && (
        <Chip
          label={parsed.itemCode}
          size="small"
          sx={{ mb: 2, bgcolor: COLORS.primary, color: COLORS.bg, fontFamily: 'monospace' }}
        />
      )}
      
      {parsed.itemDescription && (
        <Typography variant="body2" sx={{ color: COLORS.text, mb: 2 }}>
          {parsed.itemDescription}
        </Typography>
      )}

      <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
        {parsed.quantity !== undefined && (
          <Box>
            <Typography variant="caption" sx={{ color: COLORS.textSecondary }}>
              QUANTITY
            </Typography>
            <Typography variant="h6" sx={{ color: COLORS.primary }}>
              {parsed.quantity} {parsed.unit || ''}
            </Typography>
          </Box>
        )}

        {parsed.equipmentType && (
          <Box>
            <Typography variant="caption" sx={{ color: COLORS.textSecondary }}>
              EQUIPMENT
            </Typography>
            <Typography variant="body1" sx={{ color: COLORS.text }}>
              {parsed.equipmentType.replace('_', ' ')}
            </Typography>
          </Box>
        )}

        {parsed.equipmentHours !== undefined && (
          <Box>
            <Typography variant="caption" sx={{ color: COLORS.textSecondary }}>
              EQUIP HOURS
            </Typography>
            <Typography variant="body1" sx={{ color: COLORS.text }}>
              {parsed.equipmentHours}h
            </Typography>
          </Box>
        )}
      </Box>

      {parsed.locationDescription && (
        <Box sx={{ mt: 2 }}>
          <Typography variant="caption" sx={{ color: COLORS.textSecondary }}>
            LOCATION
          </Typography>
          <Typography variant="body2" sx={{ color: COLORS.text }}>
            {parsed.locationDescription}
          </Typography>
        </Box>
      )}

      {parsed.notes && (
        <Box sx={{ mt: 2 }}>
          <Typography variant="caption" sx={{ color: COLORS.textSecondary }}>
            NOTES
          </Typography>
          <Typography variant="body2" sx={{ color: COLORS.text }}>
            {parsed.notes}
          </Typography>
        </Box>
      )}
    </Box>
  );
};

ParsedResultDisplay.propTypes = {
  parsed: PropTypes.object,
  dataType: PropTypes.oneOf(['unit', 'fieldticket']),
};

/**
 * Main Voice Capture Component
 */
const VoiceCapture = ({
  open,
  onClose,
  onResult,
  dataType = 'unit',
  utilityId = null,
  buttonOnly = false,
}) => {
  // Recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioBlob, setAudioBlob] = useState(null);
  const [analyser, setAnalyser] = useState(null);
  
  // Processing state
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState(null);
  
  // Result state
  const [transcription, setTranscription] = useState(null);
  const [translation, setTranslation] = useState(null);
  const [parsed, setParsed] = useState(null);
  const [showResult, setShowResult] = useState(false);

  // Refs
  const mediaRecorderRef = useRef(null);
  const audioContextRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  // Start recording
  const startRecording = useCallback(async () => {
    try {
      setError(null);
      chunksRef.current = [];

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      // Set up audio context for visualization
      const AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext;
      const audioContext = new AudioContextClass();
      audioContextRef.current = audioContext;
      const source = audioContext.createMediaStreamSource(stream);
      const analyserNode = audioContext.createAnalyser();
      analyserNode.fftSize = 2048;
      source.connect(analyserNode);
      setAnalyser(analyserNode);

      // Set up media recorder
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4'
      });
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mediaRecorder.mimeType });
        setAudioBlob(blob);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);

      // Start timer
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);

    } catch (err) {
      console.error('Error starting recording:', err);
      setError('Could not access microphone. Please check permissions.');
    }
  }, []);

  // Stop recording
  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
        audioContextRef.current = null;
      }
      setAnalyser(null);
    }
  }, [isRecording]);

  // Process the recorded audio
  const processAudio = useCallback(async () => {
    if (!audioBlob) return;

    setProcessing(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('audio', audioBlob, 'recording.webm');
      formData.append('dataType', dataType);
      if (utilityId) {
        formData.append('utilityId', utilityId);
      }

      const response = await api.post('/api/voice/process', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      if (response.data.success) {
        setTranscription(response.data.transcription);
        setTranslation(response.data.translation);
        setParsed(response.data.parsed);
        setShowResult(true);
      } else {
        setError(response.data.error || 'Failed to process audio');
      }
    } catch (err) {
      console.error('Error processing audio:', err);
      setError(err.response?.data?.error || 'Failed to process voice input');
    } finally {
      setProcessing(false);
    }
  }, [audioBlob, dataType, utilityId]);

  // Auto-process when recording stops
  useEffect(() => {
    if (audioBlob && !isRecording) {
      processAudio();
    }
  }, [audioBlob, isRecording, processAudio]);

  // Reset state
  const handleReset = useCallback(() => {
    setAudioBlob(null);
    setTranscription(null);
    setTranslation(null);
    setParsed(null);
    setShowResult(false);
    setError(null);
    setRecordingTime(0);
  }, []);

  // In buttonOnly mode, auto-call onResult when parsing completes
  // (since there's no dialog/confirm button in this mode)
  useEffect(() => {
    if (buttonOnly && parsed && onResult) {
      onResult({
        transcription,
        translation,
        parsed,
        dataType,
      });
      // Reset after sending result
      handleReset();
    }
  }, [buttonOnly, parsed, transcription, translation, dataType, onResult, handleReset]);

  // Confirm and use result
  const handleConfirm = () => {
    if (parsed && onResult) {
      onResult({
        transcription,
        translation,
        parsed,
        dataType,
      });
    }
    handleReset();
    onClose();
  };

  // Format recording time
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Get the recording button icon based on state
  const getRecordingIcon = () => {
    if (processing) return <CircularProgress size={32} sx={{ color: COLORS.bg }} />;
    if (isRecording) return <StopIcon sx={{ fontSize: 40 }} />;
    return <MicIcon sx={{ fontSize: 40 }} />;
  };

  // Get the recording status text based on state
  const getRecordingStatusText = () => {
    if (processing) return 'Processing...';
    if (isRecording) return 'Tap to stop recording';
    return 'Tap to start recording';
  };

  // Handle recording toggle
  const handleRecordingToggle = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  // Button-only mode (inline mic button)
  if (buttonOnly) {
    return (
      <Tooltip title="Voice Input">
        <IconButton
          onClick={handleRecordingToggle}
          sx={{
            bgcolor: isRecording ? COLORS.recording : COLORS.surface,
            color: isRecording ? COLORS.text : COLORS.primary,
            '&:hover': {
              bgcolor: isRecording ? COLORS.recording : COLORS.surfaceLight,
            },
            animation: isRecording ? 'pulse 1s infinite' : 'none',
            '@keyframes pulse': {
              '0%': { boxShadow: `0 0 0 0 ${COLORS.recording}80` },
              '70%': { boxShadow: `0 0 0 10px ${COLORS.recording}00` },
              '100%': { boxShadow: `0 0 0 0 ${COLORS.recording}00` },
            },
          }}
        >
          {isRecording ? <StopIcon /> : <MicIcon />}
        </IconButton>
      </Tooltip>
    );
  }

  // Full dialog mode
  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: { bgcolor: COLORS.bg, backgroundImage: 'none' }
      }}
    >
      <DialogTitle sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        bgcolor: COLORS.surface,
        color: COLORS.text,
        borderBottom: `1px solid ${COLORS.border}`
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <MicIcon sx={{ color: COLORS.primary }} />
          <Typography variant="h6">Voice Input</Typography>
        </Box>
        <IconButton onClick={onClose} sx={{ color: COLORS.textSecondary }}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ bgcolor: COLORS.bg, pt: 3 }}>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {/* Recording Section */}
        {!showResult && (
          <Box sx={{ textAlign: 'center' }}>
            <Typography variant="body2" sx={{ color: COLORS.textSecondary, mb: 2 }}>
              {dataType === 'fieldticket'
                ? 'Describe the extra work: labor, equipment, and materials used'
                : 'Describe the unit work: what you installed, quantity, and location'
              }
            </Typography>

            {/* Visualizer */}
            <Box sx={{ mb: 3 }}>
              <AudioVisualizer analyser={analyser} isRecording={isRecording} />
            </Box>

            {/* Recording Time */}
            {(isRecording || recordingTime > 0) && (
              <Typography
                variant="h4"
                sx={{
                  color: isRecording ? COLORS.recording : COLORS.text,
                  fontFamily: 'monospace',
                  mb: 2
                }}
              >
                {formatTime(recordingTime)}
              </Typography>
            )}

            {/* Record Button */}
            <IconButton
              onClick={() => isRecording ? stopRecording() : startRecording()}
              disabled={processing}
              sx={{
                width: 80,
                height: 80,
                bgcolor: isRecording ? COLORS.recording : COLORS.primary,
                color: COLORS.bg,
                '&:hover': {
                  bgcolor: isRecording ? '#d50000' : COLORS.primaryDark,
                },
                '&:disabled': {
                  bgcolor: COLORS.border,
                },
                animation: isRecording ? 'pulse 1s infinite' : 'none',
                '@keyframes pulse': {
                  '0%': { boxShadow: `0 0 0 0 ${COLORS.recording}80` },
                  '70%': { boxShadow: `0 0 0 20px ${COLORS.recording}00` },
                  '100%': { boxShadow: `0 0 0 0 ${COLORS.recording}00` },
                },
              }}
            >
              {getRecordingIcon()}
            </IconButton>

            <Typography
              variant="body2"
              sx={{ color: COLORS.textSecondary, mt: 2 }}
            >
              {getRecordingStatusText()}
            </Typography>

            {/* Multilingual hint */}
            <Box sx={{ mt: 3, display: 'flex', justifyContent: 'center', gap: 1 }}>
              <Chip
                icon={<TranslateIcon />}
                label="English"
                size="small"
                variant="outlined"
                sx={{ color: COLORS.textSecondary, borderColor: COLORS.border }}
              />
              <Chip
                label="Español"
                size="small"
                variant="outlined"
                sx={{ color: COLORS.textSecondary, borderColor: COLORS.border }}
              />
              <Chip
                label="Português"
                size="small"
                variant="outlined"
                sx={{ color: COLORS.textSecondary, borderColor: COLORS.border }}
              />
            </Box>
          </Box>
        )}

        {/* Result Section */}
        {showResult && parsed && (
          <Box>
            {/* Transcription */}
            <Card sx={{ mb: 2, bgcolor: COLORS.surface }}>
              <CardContent>
                <Typography variant="caption" sx={{ color: COLORS.textSecondary }}>
                  TRANSCRIPTION
                  {translation && (
                    <Chip
                      icon={<TranslateIcon sx={{ fontSize: 14 }} />}
                      label={`from ${transcription?.language}`}
                      size="small"
                      sx={{ ml: 1, height: 20, fontSize: '0.7rem' }}
                    />
                  )}
                </Typography>
                <Typography variant="body2" sx={{ color: COLORS.text, mt: 1 }}>
                  "{translation ? translation.translated : transcription?.text}"
                </Typography>
                {translation && (
                  <Typography
                    variant="caption"
                    sx={{ color: COLORS.textSecondary, display: 'block', mt: 1, fontStyle: 'italic' }}
                  >
                    Original: "{translation.original}"
                  </Typography>
                )}
              </CardContent>
            </Card>

            {/* Parsed Data */}
            <Card sx={{ bgcolor: COLORS.surface }}>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                  <Typography variant="caption" sx={{ color: COLORS.textSecondary }}>
                    EXTRACTED DATA
                  </Typography>
                  {parsed.confidence !== undefined && (
                    <Chip
                      label={`${Math.round(parsed.confidence * 100)}% confident`}
                      size="small"
                      sx={{
                        bgcolor: parsed.confidence > 0.7 ? COLORS.primary : COLORS.warning,
                        color: COLORS.bg,
                        fontSize: '0.7rem',
                      }}
                    />
                  )}
                </Box>
                <ParsedResultDisplay parsed={parsed} dataType={dataType} />
              </CardContent>
            </Card>

            {/* Info */}
            <Alert
              severity="info"
              icon={<InfoIcon />}
              sx={{ mt: 2, bgcolor: COLORS.surfaceLight }}
            >
              Review the extracted data. Click "Use This" to fill the form, or "Try Again" to re-record.
            </Alert>
          </Box>
        )}
      </DialogContent>

      <DialogActions sx={{
        bgcolor: COLORS.surface,
        borderTop: `1px solid ${COLORS.border}`,
        p: 2,
        gap: 2
      }}>
        {showResult ? (
          <>
            <Button
              startIcon={<RefreshIcon />}
              onClick={handleReset}
              sx={{ color: COLORS.textSecondary }}
            >
              Try Again
            </Button>
            <Button
              variant="contained"
              startIcon={<CheckIcon />}
              onClick={handleConfirm}
              sx={{
                bgcolor: COLORS.primary,
                color: COLORS.bg,
                fontWeight: 600,
                px: 4,
                '&:hover': { bgcolor: COLORS.primaryDark },
              }}
            >
              Use This
            </Button>
          </>
        ) : (
          <Button onClick={onClose} sx={{ color: COLORS.textSecondary }}>
            Cancel
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
};

VoiceCapture.propTypes = {
  open: PropTypes.bool,
  onClose: PropTypes.func,
  onResult: PropTypes.func.isRequired,
  dataType: PropTypes.oneOf(['unit', 'fieldticket']),
  utilityId: PropTypes.string,
  buttonOnly: PropTypes.bool,
};

export default VoiceCapture;

