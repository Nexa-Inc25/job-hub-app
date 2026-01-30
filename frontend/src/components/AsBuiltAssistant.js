import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import {
  Box,
  Typography,
  Paper,
  Button,
  TextField,
  Card,
  CardContent,
  Grid,
  CircularProgress,
  Alert,
  Stepper,
  Step,
  StepLabel,
  LinearProgress,
  Chip,
  Divider,
  IconButton,
  List,
  ListItem,
  ListItemText
} from '@mui/material';
import {
  SmartToy as AiIcon,
  Send as SendIcon,
  CheckCircle as CheckIcon,
  Assignment as AsBuiltIcon,
  Chat as ChatIcon,
  Refresh as RefreshIcon
} from '@mui/icons-material';
import api from '../api';

export default function AsBuiltAssistant() {
  const { jobId } = useParams();
  const [job, setJob] = useState(null);
  const [session, setSession] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState(null);
  const [asBuiltContent, setAsBuiltContent] = useState(null);
  
  // Chat state
  const [chatMode, setChatMode] = useState(false);
  const [chatMessage, setChatMessage] = useState('');
  const [chatHistory, setChatHistory] = useState([]);
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef(null);

  useEffect(() => {
    loadJobAndSession();
  }, [jobId]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory]);

  const loadJobAndSession = async () => {
    try {
      setLoading(true);
      
      // Get job details
      const jobResponse = await api.get(`/api/jobs/${jobId}`);
      setJob(jobResponse.data);
      
      // Check for existing session
      const statusResponse = await api.get(`/api/asbuilt-assistant/status/${jobId}`);
      
      if (statusResponse.data.hasDocument) {
        // Load existing as-built
        setAsBuiltContent(jobResponse.data.asBuiltDocument?.content);
      } else if (statusResponse.data.hasSession) {
        setSession(statusResponse.data.session);
        // Reload questions if session exists
        await startSession(false);
      }
    } catch (err) {
      setError('Failed to load job information');
    } finally {
      setLoading(false);
    }
  };

  const startSession = async (isNew = true) => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await api.post(`/api/asbuilt-assistant/start/${jobId}`);
      
      setSession(response.data.session);
      setQuestions(response.data.nextQuestions || []);
      
      if (isNew) {
        setChatHistory([{
          role: 'assistant',
          content: `I've loaded ${response.data.session.proceduresLoaded.length} PG&E procedure documents with ${response.data.session.totalQuestions} questions to help you fill out the as-built for ${response.data.session.pmNumber || 'this job'}. Let's get started!`
        }]);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to start as-built session');
    } finally {
      setLoading(false);
    }
  };

  const handleAnswerChange = (field, value) => {
    setAnswers(prev => ({ ...prev, [field]: value }));
  };

  const submitAnswers = async () => {
    try {
      setSubmitting(true);
      
      const response = await api.post(`/api/asbuilt-assistant/answer/${jobId}`, { answers });
      
      setSession(prev => ({
        ...prev,
        answeredQuestions: response.data.answeredCount,
        progress: response.data.progress
      }));
      
      if (response.data.isComplete) {
        setQuestions([]);
      } else {
        setQuestions(response.data.nextQuestions);
        setAnswers({});
      }
    } catch (err) {
      setError('Failed to submit answers');
    } finally {
      setSubmitting(false);
    }
  };

  const generateAsBuilt = async () => {
    try {
      setGenerating(true);
      
      const response = await api.post(`/api/asbuilt-assistant/generate/${jobId}`);
      
      setAsBuiltContent(response.data.asBuilt.content);
      setChatHistory(prev => [...prev, {
        role: 'assistant',
        content: 'I\'ve generated your as-built document based on your answers. Review it below and let me know if you need any changes!'
      }]);
    } catch (err) {
      setError('Failed to generate as-built');
    } finally {
      setGenerating(false);
    }
  };

  const sendChatMessage = async () => {
    if (!chatMessage.trim()) return;
    
    const userMessage = chatMessage;
    setChatMessage('');
    setChatHistory(prev => [...prev, { role: 'user', content: userMessage }]);
    setChatLoading(true);
    
    try {
      const response = await api.post(`/api/asbuilt-assistant/chat/${jobId}`, {
        message: userMessage
      });
      
      setChatHistory(prev => [...prev, { role: 'assistant', content: response.data.response }]);
    } catch (err) {
      setChatHistory(prev => [...prev, { 
        role: 'assistant', 
        content: 'Sorry, I had trouble processing that. Please try again.' 
      }]);
    } finally {
      setChatLoading(false);
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3, maxWidth: 1200, mx: 'auto' }}>
      {/* Header */}
      <Paper sx={{ p: 3, mb: 3, background: 'linear-gradient(135deg, #1976d2 0%, #42a5f5 100%)', color: 'white' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <AiIcon sx={{ fontSize: 40 }} />
          <Box>
            <Typography variant="h5">As-Built Assistant</Typography>
            <Typography variant="body2" sx={{ opacity: 0.9 }}>
              AI-powered documentation helper for {job?.pmNumber || 'Job'}
            </Typography>
          </Box>
        </Box>
        
        {job && (
          <Box sx={{ mt: 2, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            <Chip label={job.address} sx={{ bgcolor: 'rgba(255,255,255,0.2)', color: 'white' }} />
            <Chip label={job.city} sx={{ bgcolor: 'rgba(255,255,255,0.2)', color: 'white' }} />
            {job.jobScope?.workType && (
              <Chip label={job.jobScope.workType} sx={{ bgcolor: 'rgba(255,255,255,0.2)', color: 'white' }} />
            )}
          </Box>
        )}
      </Paper>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>}

      <Grid container spacing={3}>
        {/* Main Content */}
        <Grid item xs={12} md={8}>
          {!session ? (
            // Start Session
            <Paper sx={{ p: 4, textAlign: 'center' }}>
              <AsBuiltIcon sx={{ fontSize: 64, color: 'primary.main', mb: 2 }} />
              <Typography variant="h6" gutterBottom>
                Ready to Fill Out As-Built
              </Typography>
              <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
                I'll guide you through the as-built documentation by asking questions based on PG&E procedures.
              </Typography>
              <Button
                variant="contained"
                size="large"
                onClick={() => startSession(true)}
                startIcon={<AiIcon />}
              >
                Start As-Built Assistant
              </Button>
            </Paper>
          ) : asBuiltContent ? (
            // Generated As-Built
            <Paper sx={{ p: 3 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="h6">
                  <CheckIcon sx={{ color: 'success.main', mr: 1, verticalAlign: 'text-bottom' }} />
                  Generated As-Built Document
                </Typography>
                <Button
                  variant="outlined"
                  onClick={() => { setAsBuiltContent(null); startSession(true); }}
                  startIcon={<RefreshIcon />}
                >
                  Start Over
                </Button>
              </Box>
              <Divider sx={{ mb: 2 }} />
              <Box 
                sx={{ 
                  p: 2, 
                  bgcolor: 'grey.50', 
                  borderRadius: 1,
                  whiteSpace: 'pre-wrap',
                  fontFamily: 'monospace',
                  fontSize: '0.875rem',
                  maxHeight: 600,
                  overflow: 'auto'
                }}
              >
                {asBuiltContent}
              </Box>
            </Paper>
          ) : (
            // Question Form
            <Paper sx={{ p: 3 }}>
              <Box sx={{ mb: 3 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                  <Typography variant="h6">Answer These Questions</Typography>
                  <Chip 
                    label={`${session.answeredQuestions || 0} / ${session.totalQuestions} answered`}
                    color="primary"
                    variant="outlined"
                  />
                </Box>
                <LinearProgress 
                  variant="determinate" 
                  value={(session.answeredQuestions || 0) / session.totalQuestions * 100} 
                  sx={{ height: 8, borderRadius: 4 }}
                />
              </Box>

              {questions.length > 0 ? (
                <Box component="form" onSubmit={(e) => { e.preventDefault(); submitAnswers(); }}>
                  {questions.map((q, idx) => (
                    <Card key={q.field} sx={{ mb: 2, bgcolor: 'grey.50' }}>
                      <CardContent>
                        <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
                          {idx + 1}. {q.question}
                        </Typography>
                        {q.helpText && (
                          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                            {q.helpText}
                          </Typography>
                        )}
                        <TextField
                          fullWidth
                          variant="outlined"
                          placeholder={`Enter ${q.field.toLowerCase()}...`}
                          value={answers[q.field] || ''}
                          onChange={(e) => handleAnswerChange(q.field, e.target.value)}
                          type={q.inputType === 'number' ? 'number' : 'text'}
                          multiline={q.inputType === 'text'}
                          rows={q.inputType === 'text' ? 2 : 1}
                        />
                        <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                          Source: {q.sourceDoc}
                        </Typography>
                      </CardContent>
                    </Card>
                  ))}
                  
                  <Box sx={{ display: 'flex', gap: 2, mt: 3 }}>
                    <Button
                      variant="contained"
                      type="submit"
                      disabled={submitting || Object.keys(answers).length === 0}
                      startIcon={submitting ? <CircularProgress size={20} /> : <CheckIcon />}
                    >
                      {submitting ? 'Submitting...' : 'Submit Answers'}
                    </Button>
                  </Box>
                </Box>
              ) : (
                <Box sx={{ textAlign: 'center', py: 4 }}>
                  <CheckIcon sx={{ fontSize: 64, color: 'success.main', mb: 2 }} />
                  <Typography variant="h6" gutterBottom>
                    All Questions Answered!
                  </Typography>
                  <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
                    Ready to generate your as-built document.
                  </Typography>
                  <Button
                    variant="contained"
                    size="large"
                    onClick={generateAsBuilt}
                    disabled={generating}
                    startIcon={generating ? <CircularProgress size={20} /> : <AsBuiltIcon />}
                  >
                    {generating ? 'Generating...' : 'Generate As-Built Document'}
                  </Button>
                </Box>
              )}
            </Paper>
          )}
        </Grid>

        {/* Chat Sidebar */}
        <Grid item xs={12} md={4}>
          <Paper sx={{ p: 2, height: 600, display: 'flex', flexDirection: 'column' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
              <ChatIcon color="primary" />
              <Typography variant="h6">Ask the Assistant</Typography>
            </Box>
            <Divider sx={{ mb: 2 }} />
            
            {/* Chat Messages */}
            <Box sx={{ flex: 1, overflow: 'auto', mb: 2 }}>
              <List>
                {chatHistory.map((msg, idx) => (
                  <ListItem 
                    key={idx}
                    sx={{ 
                      flexDirection: 'column', 
                      alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start',
                      py: 1
                    }}
                  >
                    <Paper 
                      sx={{ 
                        p: 1.5, 
                        maxWidth: '85%',
                        bgcolor: msg.role === 'user' ? 'primary.main' : 'grey.100',
                        color: msg.role === 'user' ? 'white' : 'text.primary'
                      }}
                    >
                      <Typography variant="body2">
                        {msg.content}
                      </Typography>
                    </Paper>
                  </ListItem>
                ))}
                {chatLoading && (
                  <ListItem sx={{ justifyContent: 'flex-start' }}>
                    <CircularProgress size={20} />
                  </ListItem>
                )}
                <div ref={chatEndRef} />
              </List>
            </Box>
            
            {/* Chat Input */}
            <Box sx={{ display: 'flex', gap: 1 }}>
              <TextField
                fullWidth
                size="small"
                placeholder="Ask about as-built requirements..."
                value={chatMessage}
                onChange={(e) => setChatMessage(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && sendChatMessage()}
                disabled={chatLoading}
              />
              <IconButton 
                color="primary" 
                onClick={sendChatMessage}
                disabled={chatLoading || !chatMessage.trim()}
              >
                <SendIcon />
              </IconButton>
            </Box>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
}

