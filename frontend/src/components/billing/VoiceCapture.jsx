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
  TextField,
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
import EditIcon from '@mui/icons-material/Edit';
import api from '../../api';
import { useAppColors } from '../shared/themeUtils';

/**
 * Audio Visualizer Component - shows waveform during recording
 */
const AudioVisualizer = ({ analyser, isRecording, colors }) => {
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

      ctx.fillStyle = colors.surface;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.lineWidth = 2;
      ctx.strokeStyle = colors.recording;
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
  }, [isRecording, analyser, colors]);

  return (
    <canvas
      ref={canvasRef}
      width={300}
      height={60}
      style={{
        width: '100%',
        height: 60,
        borderRadius: 8,
        border: `1px solid ${isRecording ? colors.recording : colors.border}`,
      }}
    />
  );
};

AudioVisualizer.propTypes = {
  analyser: PropTypes.object,
  isRecording: PropTypes.bool,
  colors: PropTypes.object.isRequired,
};

/**
 * Parsed Result Display Component
 */
const ParsedResultDisplay = ({ parsed, dataType, colors }) => {
  if (!parsed) return null;

  if (dataType === 'fieldticket') {
    return (
      <Box>
        {parsed.changeReason && (
          <Chip
            label={parsed.changeReason.replace('_', ' ').toUpperCase()}
            size="small"
            sx={{ mb: 2, bgcolor: colors.warning, color: colors.bg }}
          />
        )}
        
        {parsed.changeDescription && (
          <Typography variant="body2" sx={{ color: colors.text, mb: 2 }}>
            {parsed.changeDescription}
          </Typography>
        )}

        {parsed.laborEntries?.length > 0 && (
          <Box sx={{ mb: 2 }}>
            <Typography variant="caption" sx={{ color: colors.textSecondary }}>
              LABOR ({parsed.laborEntries.length})
            </Typography>
            <List dense>
              {parsed.laborEntries.map((entry) => (
                <ListItem key={entry.workerName || entry.role || Math.random()} sx={{ py: 0 }}>
                  <ListItemIcon sx={{ minWidth: 32 }}>
                    <PersonIcon sx={{ color: colors.primary, fontSize: 18 }} />
                  </ListItemIcon>
                  <ListItemText
                    primary={entry.workerName || entry.role}
                    secondary={`${entry.regularHours || 0}h reg, ${entry.overtimeHours || 0}h OT`}
                    primaryTypographyProps={{ color: colors.text, fontSize: '0.875rem' }}
                    secondaryTypographyProps={{ color: colors.textSecondary }}
                  />
                </ListItem>
              ))}
            </List>
          </Box>
        )}

        {parsed.equipmentEntries?.length > 0 && (
          <Box sx={{ mb: 2 }}>
            <Typography variant="caption" sx={{ color: colors.textSecondary }}>
              EQUIPMENT ({parsed.equipmentEntries.length})
            </Typography>
            <List dense>
              {parsed.equipmentEntries.map((entry) => (
                <ListItem key={entry.description || entry.equipmentType || Math.random()} sx={{ py: 0 }}>
                  <ListItemIcon sx={{ minWidth: 32 }}>
                    <BuildIcon sx={{ color: colors.warning, fontSize: 18 }} />
                  </ListItemIcon>
                  <ListItemText
                    primary={entry.description || entry.equipmentType}
                    secondary={`${entry.hours || 0}h`}
                    primaryTypographyProps={{ color: colors.text, fontSize: '0.875rem' }}
                    secondaryTypographyProps={{ color: colors.textSecondary }}
                  />
                </ListItem>
              ))}
            </List>
          </Box>
        )}

        {parsed.materialEntries?.length > 0 && (
          <Box>
            <Typography variant="caption" sx={{ color: colors.textSecondary }}>
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
                    primaryTypographyProps={{ color: colors.text, fontSize: '0.875rem' }}
                    secondaryTypographyProps={{ color: colors.textSecondary }}
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
          sx={{ mb: 2, bgcolor: colors.primary, color: colors.bg, fontFamily: 'monospace' }}
        />
      )}
      
      {parsed.itemDescription && (
        <Typography variant="body2" sx={{ color: colors.text, mb: 2 }}>
          {parsed.itemDescription}
        </Typography>
      )}

      <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
        {parsed.quantity !== undefined && (
          <Box>
            <Typography variant="caption" sx={{ color: colors.textSecondary }}>
              QUANTITY
            </Typography>
            <Typography variant="h6" sx={{ color: colors.primary }}>
              {parsed.quantity} {parsed.unit || ''}
            </Typography>
          </Box>
        )}

        {parsed.equipmentType && (
          <Box>
            <Typography variant="caption" sx={{ color: colors.textSecondary }}>
              EQUIPMENT
            </Typography>
            <Typography variant="body1" sx={{ color: colors.text }}>
              {parsed.equipmentType.replace('_', ' ')}
            </Typography>
          </Box>
        )}

        {parsed.equipmentHours !== undefined && (
          <Box>
            <Typography variant="caption" sx={{ color: colors.textSecondary }}>
              EQUIP HOURS
            </Typography>
            <Typography variant="body1" sx={{ color: colors.text }}>
              {parsed.equipmentHours}h
            </Typography>
          </Box>
        )}
      </Box>

      {parsed.locationDescription && (
        <Box sx={{ mt: 2 }}>
          <Typography variant="caption" sx={{ color: colors.textSecondary }}>
            LOCATION
          </Typography>
          <Typography variant="body2" sx={{ color: colors.text }}>
            {parsed.locationDescription}
          </Typography>
        </Box>
      )}

      {parsed.notes && (
        <Box sx={{ mt: 2 }}>
          <Typography variant="caption" sx={{ color: colors.textSecondary }}>
            NOTES
          </Typography>
          <Typography variant="body2" sx={{ color: colors.text }}>
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
  colors: PropTypes.object.isRequired,
};

/**
 * RecordingSection - Extracted sub-component for recording UI
 * Reduces cognitive complexity of main VoiceCapture component
 */
const RecordingSection = ({
  dataType,
  analyser,
  isRecording,
  recordingTime,
  processing,
  startRecording,
  stopRecording,
  formatTime,
  colors,
}) => {
  const getRecordingIcon = () => {
    if (processing) return <CircularProgress size={32} sx={{ color: colors.bg }} />;
    if (isRecording) return <StopIcon sx={{ fontSize: 40 }} />;
    return <MicIcon sx={{ fontSize: 40 }} />;
  };

  const getRecordingStatusText = () => {
    if (processing) return 'Processing...';
    if (isRecording) return 'Tap to stop recording';
    return 'Tap to start recording';
  };

  // Use ternary for concise toggle - called from RecordingSection UI
  const handleToggle = () => (isRecording ? stopRecording() : startRecording());

  return (
    <Box sx={{ textAlign: 'center' }}>
      <Typography variant="body2" sx={{ color: colors.textSecondary, mb: 2 }}>
        {dataType === 'fieldticket'
          ? 'Describe the extra work: labor, equipment, and materials used'
          : 'Describe the unit work: what you installed, quantity, and location'
        }
      </Typography>

      {/* Visualizer */}
      <Box sx={{ mb: 3 }}>
        <AudioVisualizer analyser={analyser} isRecording={isRecording} colors={colors} />
      </Box>

      {/* Recording Time */}
      {(isRecording || recordingTime > 0) && (
        <Typography
          variant="h4"
          sx={{
            color: isRecording ? colors.recording : colors.text,
            fontFamily: 'monospace',
            mb: 2
          }}
        >
          {formatTime(recordingTime)}
        </Typography>
      )}

      {/* Record Button */}
      <IconButton
        onClick={handleToggle}
        disabled={processing}
        sx={{
          width: 80,
          height: 80,
          bgcolor: isRecording ? colors.recording : colors.primary,
          color: colors.bg,
          '&:hover': {
            bgcolor: isRecording ? '#d50000' : colors.primaryDark,
          },
          '&:disabled': {
            bgcolor: colors.border,
          },
          animation: isRecording ? 'pulse 1s infinite' : 'none',
          '@keyframes pulse': {
            '0%': { boxShadow: `0 0 0 0 ${colors.recording}80` },
            '70%': { boxShadow: `0 0 0 20px ${colors.recording}00` },
            '100%': { boxShadow: `0 0 0 0 ${colors.recording}00` },
          },
        }}
      >
        {getRecordingIcon()}
      </IconButton>

      <Typography
        variant="body2"
        sx={{ color: colors.textSecondary, mt: 2 }}
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
          sx={{ color: colors.textSecondary, borderColor: colors.border }}
        />
        <Chip
          label="Español"
          size="small"
          variant="outlined"
          sx={{ color: colors.textSecondary, borderColor: colors.border }}
        />
        <Chip
          label="Português"
          size="small"
          variant="outlined"
          sx={{ color: colors.textSecondary, borderColor: colors.border }}
        />
      </Box>
    </Box>
  );
};

RecordingSection.propTypes = {
  dataType: PropTypes.oneOf(['unit', 'fieldticket']).isRequired,
  analyser: PropTypes.object,
  isRecording: PropTypes.bool.isRequired,
  recordingTime: PropTypes.number.isRequired,
  processing: PropTypes.bool.isRequired,
  startRecording: PropTypes.func.isRequired,
  stopRecording: PropTypes.func.isRequired,
  formatTime: PropTypes.func.isRequired,
  colors: PropTypes.object.isRequired,
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
  const COLORS = useAppColors();
  
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
  
  // Edit transcript state
  const [showEditTranscript, setShowEditTranscript] = useState(false);
  const [editedTranscript, setEditedTranscript] = useState('');

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

  // Re-parse edited transcript
  const reparseTranscript = useCallback(async () => {
    if (!editedTranscript.trim()) return;

    setProcessing(true);
    setError(null);
    setShowEditTranscript(false);

    try {
      const endpoint = dataType === 'fieldticket' ? '/api/voice/parse-fieldticket' : '/api/voice/parse-unit';
      const payload = { text: editedTranscript.trim() };
      if (dataType === 'unit' && utilityId) {
        payload.utilityId = utilityId;
      }

      const response = await api.post(endpoint, payload);
      setParsed(response.data);
      setShowResult(true);
    } catch (err) {
      console.error('Error re-parsing transcript:', err);
      setError(err.response?.data?.error || 'Failed to re-parse transcript');
    } finally {
      setProcessing(false);
    }
  }, [editedTranscript, dataType, utilityId]);

  // Reset state
  const handleReset = useCallback(() => {
    setAudioBlob(null);
    setTranscription(null);
    setTranslation(null);
    setParsed(null);
    setShowResult(false);
    setShowEditTranscript(false);
    setEditedTranscript('');
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

  // Button-only mode (inline mic button)
  if (buttonOnly) {
    // Inline toggle handler for button-only mode
    const toggleRecording = () => isRecording ? stopRecording() : startRecording();
    
    return (
      <Tooltip title="Voice Input">
        <IconButton
          onClick={toggleRecording}
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
        <IconButton onClick={onClose} sx={{ color: COLORS.textSecondary }} aria-label="Close">
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
          <RecordingSection
            dataType={dataType}
            analyser={analyser}
            isRecording={isRecording}
            recordingTime={recordingTime}
            processing={processing}
            startRecording={startRecording}
            stopRecording={stopRecording}
            formatTime={formatTime}
            colors={COLORS}
          />
        )}

        {/* Edit Transcript Section */}
        {showEditTranscript && (
          <Box>
            <Typography variant="body2" sx={{ color: COLORS.textSecondary, mb: 2 }}>
              Edit the transcript below, then click "Re-parse" to extract data from the corrected text.
            </Typography>
            <TextField
              value={editedTranscript}
              onChange={(e) => setEditedTranscript(e.target.value)}
              multiline
              rows={4}
              fullWidth
              placeholder="Edit the transcribed text..."
              InputProps={{ sx: { bgcolor: COLORS.surface, color: COLORS.text } }}
              InputLabelProps={{ sx: { color: COLORS.textSecondary } }}
              sx={{ mb: 2 }}
            />
            <Box sx={{ display: 'flex', gap: 2 }}>
              <Button
                onClick={() => setShowEditTranscript(false)}
                sx={{ color: COLORS.textSecondary }}
              >
                Cancel
              </Button>
              <Button
                variant="contained"
                onClick={reparseTranscript}
                disabled={!editedTranscript.trim() || processing}
                startIcon={processing ? <CircularProgress size={16} /> : <CheckIcon />}
                sx={{
                  bgcolor: COLORS.primary,
                  color: COLORS.bg,
                  '&:hover': { bgcolor: COLORS.primaryDark },
                }}
              >
                {processing ? 'Parsing...' : 'Re-parse'}
              </Button>
            </Box>
          </Box>
        )}

        {/* Result Section */}
        {showResult && parsed && !showEditTranscript && (
          <Box>
            {/* Transcription */}
            <Card sx={{ mb: 2, bgcolor: COLORS.surface }}>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
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
                  <Tooltip title="Edit transcript before auto-fill">
                    <IconButton
                      size="small"
                      onClick={() => {
                        const text = translation ? translation.translated : transcription?.text;
                        setEditedTranscript(text || '');
                        setShowEditTranscript(true);
                      }}
                      sx={{ color: COLORS.textSecondary }}
                    >
                      <EditIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Box>
                <Typography variant="body2" sx={{ color: COLORS.text, mt: 1 }}>
                  &ldquo;{translation ? translation.translated : transcription?.text}&rdquo;
                </Typography>
                {translation && (
                  <Typography
                    variant="caption"
                    sx={{ color: COLORS.textSecondary, display: 'block', mt: 1, fontStyle: 'italic' }}
                  >
                    Original: &ldquo;{translation.original}&rdquo;
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
                <ParsedResultDisplay parsed={parsed} dataType={dataType} colors={COLORS} />

                {/* Low confidence warning */}
                {parsed.confidence !== undefined && parsed.confidence < 0.5 && (
                  <Alert severity="warning" sx={{ mt: 2 }}>
                    Low confidence score. Consider editing the transcript or re-recording.
                  </Alert>
                )}

                {/* Parse error indicator */}
                {parsed.parseError && (
                  <Alert severity="warning" sx={{ mt: 2 }}>
                    {parsed.parseError}. Try editing the transcript above.
                  </Alert>
                )}
              </CardContent>
            </Card>

            {/* Info */}
            <Alert
              severity="info"
              icon={<InfoIcon />}
              sx={{ mt: 2, bgcolor: COLORS.surfaceLight }}
            >
              Review the extracted data. Click &ldquo;Use This&rdquo; to fill the form, &ldquo;Edit Transcript&rdquo; to correct, or &ldquo;Try Again&rdquo; to re-record.
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

