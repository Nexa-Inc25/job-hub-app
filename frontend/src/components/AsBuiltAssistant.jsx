import React, { useState, useEffect, useRef, useCallback } from 'react';
import PropTypes from 'prop-types';
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
  LinearProgress,
  Chip,
  Divider,
  IconButton,
  List,
  ListItem
} from '@mui/material';
import AiIcon from '@mui/icons-material/SmartToy';
import SendIcon from '@mui/icons-material/Send';
import CheckIcon from '@mui/icons-material/CheckCircle';
import AsBuiltIcon from '@mui/icons-material/Assignment';
import ChatIcon from '@mui/icons-material/Chat';
import RefreshIcon from '@mui/icons-material/Refresh';
import api from '../api';

// Helper to generate unique message IDs
let messageIdCounter = 0;
const generateMessageId = () => `msg-${Date.now()}-${++messageIdCounter}`;

// Sub-component: Start Session Panel
const StartSessionPanel = ({ onStart }) => (
  <Paper sx={{ p: 4, textAlign: 'center' }}>
    <AsBuiltIcon sx={{ fontSize: 64, color: 'primary.main', mb: 2 }} />
    <Typography variant="h6" gutterBottom>
      Ready to Fill Out As-Built
    </Typography>
    <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
      I&apos;ll guide you through the as-built documentation by asking questions based on PG&E procedures.
    </Typography>
    <Button variant="contained" size="large" onClick={onStart} startIcon={<AiIcon />}>
      Start As-Built Assistant
    </Button>
  </Paper>
);

StartSessionPanel.propTypes = {
  onStart: PropTypes.func.isRequired,
};

// Sub-component: Generated Document Panel
const GeneratedDocPanel = ({ content, onStartOver }) => (
  <Paper sx={{ p: 3 }}>
    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
      <Typography variant="h6">
        <CheckIcon sx={{ color: 'success.main', mr: 1, verticalAlign: 'text-bottom' }} />
        Generated As-Built Document
      </Typography>
      <Button variant="outlined" onClick={onStartOver} startIcon={<RefreshIcon />}>
        Start Over
      </Button>
    </Box>
    <Divider sx={{ mb: 2 }} />
    <Box sx={{ p: 2, bgcolor: 'grey.50', borderRadius: 1, whiteSpace: 'pre-wrap', fontFamily: 'monospace', fontSize: '0.875rem', maxHeight: 600, overflow: 'auto' }}>
      {content}
    </Box>
  </Paper>
);

GeneratedDocPanel.propTypes = {
  content: PropTypes.string.isRequired,
  onStartOver: PropTypes.func.isRequired,
};

// Sub-component: Question Form
const QuestionFormPanel = ({ session, questions, answers, submitting, generating, onAnswerChange, onSubmit, onGenerate }) => {
  const hasAnswers = Object.keys(answers).length > 0;
  const answeredCount = session?.answeredQuestions || 0;
  const totalQuestions = session?.totalQuestions || 1;
  const progress = (answeredCount / totalQuestions) * 100;

  if (questions.length === 0) {
    return (
      <Paper sx={{ p: 3 }}>
        <Box sx={{ textAlign: 'center', py: 4 }}>
          <CheckIcon sx={{ fontSize: 64, color: 'success.main', mb: 2 }} />
          <Typography variant="h6" gutterBottom>All Questions Answered!</Typography>
          <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
            Ready to generate your as-built document.
          </Typography>
          <Button variant="contained" size="large" onClick={onGenerate} disabled={generating} startIcon={generating ? <CircularProgress size={20} /> : <AsBuiltIcon />}>
            {generating ? 'Generating...' : 'Generate As-Built Document'}
          </Button>
        </Box>
      </Paper>
    );
  }

  return (
    <Paper sx={{ p: 3 }}>
      <Box sx={{ mb: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
          <Typography variant="h6">Answer These Questions</Typography>
          <Chip label={`${answeredCount} / ${totalQuestions} answered`} color="primary" variant="outlined" />
        </Box>
        <LinearProgress variant="determinate" value={progress} sx={{ height: 8, borderRadius: 4 }} />
      </Box>

      <Box component="form" onSubmit={(e) => { e.preventDefault(); onSubmit(); }}>
        {questions.map((q, idx) => (
          <Card key={q.field || `q-${idx}`} sx={{ mb: 2, bgcolor: 'grey.50' }}>
            <CardContent>
              <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
                {idx + 1}. {q.question}
              </Typography>
              {q.helpText && (
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>{q.helpText}</Typography>
              )}
              <TextField
                fullWidth
                variant="outlined"
                placeholder={`Enter ${q.field?.toLowerCase() || 'value'}...`}
                value={answers[q.field] || ''}
                onChange={(e) => onAnswerChange(q.field, e.target.value)}
                type={q.inputType === 'number' ? 'number' : 'text'}
                multiline={q.inputType === 'text'}
                rows={q.inputType === 'text' ? 2 : 1}
              />
              {q.sourceDoc && (
                <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                  Source: {q.sourceDoc}
                </Typography>
              )}
            </CardContent>
          </Card>
        ))}
        
        <Box sx={{ display: 'flex', gap: 2, mt: 3 }}>
          <Button variant="contained" type="submit" disabled={submitting || !hasAnswers} startIcon={submitting ? <CircularProgress size={20} /> : <CheckIcon />}>
            {submitting ? 'Submitting...' : 'Submit Answers'}
          </Button>
        </Box>
      </Box>
    </Paper>
  );
};

QuestionFormPanel.propTypes = {
  session: PropTypes.shape({
    answeredQuestions: PropTypes.number,
    totalQuestions: PropTypes.number,
  }),
  questions: PropTypes.arrayOf(PropTypes.shape({
    field: PropTypes.string,
    question: PropTypes.string,
    helpText: PropTypes.string,
    inputType: PropTypes.string,
    sourceDoc: PropTypes.string,
  })).isRequired,
  answers: PropTypes.object.isRequired,
  submitting: PropTypes.bool.isRequired,
  generating: PropTypes.bool.isRequired,
  onAnswerChange: PropTypes.func.isRequired,
  onSubmit: PropTypes.func.isRequired,
  onGenerate: PropTypes.func.isRequired,
};

// Sub-component: Chat Sidebar
const ChatSidebar = ({ chatHistory, chatMessage, chatLoading, chatEndRef, onMessageChange, onSend }) => (
  <Paper sx={{ p: 2, height: 600, display: 'flex', flexDirection: 'column' }}>
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
      <ChatIcon color="primary" />
      <Typography variant="h6">Ask the Assistant</Typography>
    </Box>
    <Divider sx={{ mb: 2 }} />
    
    <Box sx={{ flex: 1, overflow: 'auto', mb: 2 }}>
      <List>
        {chatHistory.map((msg) => (
          <ListItem 
            key={msg.id}
            sx={{ flexDirection: 'column', alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start', py: 1 }}
          >
            <Paper sx={{ p: 1.5, maxWidth: '85%', bgcolor: msg.role === 'user' ? 'primary.main' : 'grey.100', color: msg.role === 'user' ? 'white' : 'text.primary' }}>
              <Typography variant="body2">{msg.content}</Typography>
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
    
    <Box sx={{ display: 'flex', gap: 1 }}>
      <TextField
        fullWidth
        size="small"
        placeholder="Ask about as-built requirements..."
        value={chatMessage}
        onChange={(e) => onMessageChange(e.target.value)}
        onKeyPress={(e) => e.key === 'Enter' && onSend()}
        disabled={chatLoading}
      />
      <IconButton color="primary" onClick={onSend} disabled={chatLoading || !chatMessage.trim()}>
        <SendIcon />
      </IconButton>
    </Box>
  </Paper>
);

ChatSidebar.propTypes = {
  chatHistory: PropTypes.arrayOf(PropTypes.shape({
    id: PropTypes.string,
    role: PropTypes.string,
    content: PropTypes.string,
  })).isRequired,
  chatMessage: PropTypes.string.isRequired,
  chatLoading: PropTypes.bool.isRequired,
  chatEndRef: PropTypes.object.isRequired,
  onMessageChange: PropTypes.func.isRequired,
  onSend: PropTypes.func.isRequired,
};

// Main Component
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
  
  const [chatMessage, setChatMessage] = useState('');
  const [chatHistory, setChatHistory] = useState([]);
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef(null);

  const startSession = useCallback(async (isNew = true) => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await api.post(`/api/asbuilt-assistant/start/${jobId}`);
      
      setSession(response.data.session);
      setQuestions(response.data.nextQuestions || []);
      
      if (isNew) {
        const procCount = response.data.session.proceduresLoaded?.length || response.data.session.proceduresLoaded || 0;
        setChatHistory([{
          id: generateMessageId(),
          role: 'assistant',
          content: `I've loaded ${procCount} PG&E procedure documents with ${response.data.session.totalQuestions} questions. Let's get started!`
        }]);
      }
    } catch (err) {
      console.error('Start session error:', err);
      setError(err.response?.data?.error || 'Failed to start as-built session');
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  const loadJobAndSession = useCallback(async () => {
    try {
      setLoading(true);
      
      const jobResponse = await api.get(`/api/jobs/${jobId}`);
      setJob(jobResponse.data);
      
      const statusResponse = await api.get(`/api/asbuilt-assistant/status/${jobId}`);
      
      if (statusResponse.data.hasDocument) {
        setAsBuiltContent(jobResponse.data.asBuiltDocument?.content);
      } else if (statusResponse.data.hasSession) {
        setSession(statusResponse.data.session);
        await startSession(false);
      }
    } catch (err) {
      console.error('Load job error:', err);
      setError('Failed to load job information');
    } finally {
      setLoading(false);
    }
  }, [jobId, startSession]);

  useEffect(() => {
    loadJobAndSession();
  }, [loadJobAndSession]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory]);

  const handleAnswerChange = (field, value) => {
    setAnswers(prev => ({ ...prev, [field]: value }));
  };

  const submitAnswers = async () => {
    try {
      setSubmitting(true);
      const response = await api.post(`/api/asbuilt-assistant/answer/${jobId}`, { answers });
      
      setSession(prev => ({ ...prev, answeredQuestions: response.data.answeredCount, progress: response.data.progress }));
      
      if (response.data.isComplete) {
        setQuestions([]);
      } else {
        setQuestions(response.data.nextQuestions);
        setAnswers({});
      }
    } catch (err) {
      console.error('Submit answers error:', err);
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
        id: generateMessageId(),
        role: 'assistant',
        content: 'I\'ve generated your as-built document. Review it below!'
      }]);
    } catch (err) {
      console.error('Generate as-built error:', err);
      setError('Failed to generate as-built');
    } finally {
      setGenerating(false);
    }
  };

  const sendChatMessage = async () => {
    if (!chatMessage.trim()) return;
    
    const userMessage = chatMessage;
    setChatMessage('');
    setChatHistory(prev => [...prev, { id: generateMessageId(), role: 'user', content: userMessage }]);
    setChatLoading(true);
    
    try {
      const response = await api.post(`/api/asbuilt-assistant/chat/${jobId}`, { message: userMessage });
      setChatHistory(prev => [...prev, { id: generateMessageId(), role: 'assistant', content: response.data.response }]);
    } catch (err) {
      console.error('Chat error:', err);
      setChatHistory(prev => [...prev, { id: generateMessageId(), role: 'assistant', content: 'Sorry, I had trouble processing that.' }]);
    } finally {
      setChatLoading(false);
    }
  };

  const handleStartOver = () => {
    setAsBuiltContent(null);
    startSession(true);
  };

  // Determine which panel to show
  const renderMainContent = () => {
    if (!session) {
      return <StartSessionPanel onStart={() => startSession(true)} />;
    }
    if (asBuiltContent) {
      return <GeneratedDocPanel content={asBuiltContent} onStartOver={handleStartOver} />;
    }
    return (
      <QuestionFormPanel
        session={session}
        questions={questions}
        answers={answers}
        submitting={submitting}
        generating={generating}
        onAnswerChange={handleAnswerChange}
        onSubmit={submitAnswers}
        onGenerate={generateAsBuilt}
      />
    );
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
        <Grid item xs={12} md={8}>
          {renderMainContent()}
        </Grid>
        <Grid item xs={12} md={4}>
          <ChatSidebar
            chatHistory={chatHistory}
            chatMessage={chatMessage}
            chatLoading={chatLoading}
            chatEndRef={chatEndRef}
            onMessageChange={setChatMessage}
            onSend={sendChatMessage}
          />
        </Grid>
      </Grid>
    </Box>
  );
}
