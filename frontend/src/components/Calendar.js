import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Paper,
  Typography,
  IconButton,
  Chip,
  Tooltip,
  CircularProgress,
  Alert,
  useTheme,
  FormControlLabel,
  Switch
} from '@mui/material';
import {
  ChevronLeft as ChevronLeftIcon,
  ChevronRight as ChevronRightIcon,
  Today as TodayIcon,
  Work as WorkIcon
} from '@mui/icons-material';
import api from '../api';

// Helper to get admin status from token synchronously
const getAdminStatus = () => {
  const token = localStorage.getItem('token');
  if (token) {
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      return payload.isAdmin === true;
    } catch (e) {
      return false;
    }
  }
  return false;
};

const Calendar = () => {
  const navigate = useNavigate();
  const theme = useTheme();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isAdmin] = useState(() => getAdminStatus()); // Initialize synchronously
  const [viewAll, setViewAll] = useState(true); // Admin toggle to view all scheduled jobs

  const fetchCalendarData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const token = localStorage.getItem('token');
      const month = currentDate.getMonth() + 1;
      const year = currentDate.getFullYear();
      
      // If admin and viewAll is true, fetch all scheduled jobs
      const viewAllParam = isAdmin && viewAll ? '&viewAll=true' : '';
      
      const response = await api.get(`/api/calendar?month=${month}&year=${year}${viewAllParam}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      setJobs(response.data);
    } catch (err) {
      console.error('Error fetching calendar:', err);
      setError('Failed to load calendar data');
    } finally {
      setLoading(false);
    }
  }, [currentDate, isAdmin, viewAll]);

  useEffect(() => {
    fetchCalendarData();
  }, [fetchCalendarData]);

  const getDaysInMonth = (date) => {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (date) => {
    return new Date(date.getFullYear(), date.getMonth(), 1).getDay();
  };

  const previousMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };

  const nextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  const goToToday = () => {
    setCurrentDate(new Date());
  };

  const getJobsForDay = (day) => {
    return jobs.filter(job => {
      const jobDate = new Date(job.crewScheduledDate);
      return jobDate.getDate() === day &&
             jobDate.getMonth() === currentDate.getMonth() &&
             jobDate.getFullYear() === currentDate.getFullYear();
    });
  };

  const handleJobClick = (jobId) => {
    navigate(`/jobs/${jobId}`);
  };

  const getStatusColor = (status) => {
    const colors = {
      'pending': '#ff9800',
      'pre-field': '#2196f3',
      'in-progress': '#4caf50',
      'completed': '#9e9e9e',
      'billed': '#673ab7',
      'invoiced': '#009688'
    };
    return colors[status] || '#757575';
  };

  const getPriorityColor = (priority) => {
    const colors = {
      'emergency': '#f44336',
      'high': '#ff5722',
      'medium': '#ff9800',
      'low': '#4caf50'
    };
    return colors[priority] || '#757575';
  };

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const renderCalendarDays = () => {
    const daysInMonth = getDaysInMonth(currentDate);
    const firstDay = getFirstDayOfMonth(currentDate);
    const days = [];
    const today = new Date();
    const isCurrentMonth = today.getMonth() === currentDate.getMonth() && 
                          today.getFullYear() === currentDate.getFullYear();

    // Empty cells for days before the first day of the month
    for (let i = 0; i < firstDay; i++) {
      days.push(
        <Paper 
          key={`empty-${i}`}
          sx={{ 
            minHeight: 140, 
            p: 1, 
            bgcolor: theme.palette.mode === 'dark' ? 'grey.900' : 'grey.50',
            opacity: 0.4,
            borderRadius: 1
          }}
        />
      );
    }

    // Days of the month
    for (let day = 1; day <= daysInMonth; day++) {
      const dayJobs = getJobsForDay(day);
      const isToday = isCurrentMonth && today.getDate() === day;

      days.push(
        <Paper
          key={day}
          sx={{
            minHeight: 140,
            p: 1,
            overflow: 'hidden',
            border: isToday ? `2px solid ${theme.palette.primary.main}` : '1px solid',
            borderColor: isToday ? 'primary.main' : 'divider',
            bgcolor: isToday 
              ? (theme.palette.mode === 'dark' ? 'primary.900' : 'primary.50')
              : (theme.palette.mode === 'dark' ? 'grey.800' : 'white'),
            borderRadius: 1,
            '&:hover': {
              bgcolor: theme.palette.mode === 'dark' ? 'grey.700' : 'grey.50'
            }
          }}
        >
          <Typography
            variant="body2"
            sx={{
              fontWeight: isToday ? 'bold' : 'medium',
              color: isToday ? 'primary.main' : 'text.primary',
              mb: 0.5
            }}
          >
            {day}
          </Typography>
          <Box sx={{ overflow: 'auto', maxHeight: 110 }}>
            {dayJobs.map((job) => (
              <Tooltip
                key={job._id}
                title={
                  <Box>
                    <Typography variant="body2"><strong>{job.pmNumber || job.woNumber}</strong></Typography>
                    <Typography variant="caption">{job.address}</Typography>
                    {isAdmin && viewAll && job.assignedTo && (
                      <Typography variant="caption" display="block" color="info.main">
                        Crew: {job.assignedTo.name || job.assignedTo.email}
                      </Typography>
                    )}
                    {job.dueDate && (
                      <Typography variant="caption" display="block" color="warning.main">
                        Due: {new Date(job.dueDate).toLocaleDateString()}
                      </Typography>
                    )}
                  </Box>
                }
                arrow
                placement="right"
              >
                <Box
                  onClick={() => handleJobClick(job._id)}
                  sx={{
                    mb: 0.5,
                    p: 0.5,
                    cursor: 'pointer',
                    borderLeft: `3px solid ${getPriorityColor(job.priority)}`,
                    bgcolor: theme.palette.mode === 'dark' ? 'grey.700' : 'grey.100',
                    borderRadius: '0 4px 4px 0',
                    '&:hover': { 
                      bgcolor: theme.palette.mode === 'dark' ? 'grey.600' : 'grey.200'
                    },
                  }}
                >
                  <Typography
                    variant="caption"
                    sx={{
                      fontWeight: 'bold',
                      display: 'block',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      fontSize: '0.7rem'
                    }}
                  >
                    {job.pmNumber || job.woNumber || 'Job'}
                  </Typography>
                  {job.assignedTo && (
                    <Typography
                      variant="caption"
                      sx={{
                        display: 'block',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        color: 'text.secondary',
                        fontSize: '0.65rem'
                      }}
                    >
                      {job.assignedTo.name || job.assignedTo.email?.split('@')[0]}
                    </Typography>
                  )}
                </Box>
              </Tooltip>
            ))}
          </Box>
        </Paper>
      );
    }

    // Fill remaining cells to complete the grid
    const totalCells = firstDay + daysInMonth;
    const remainingCells = 7 - (totalCells % 7);
    if (remainingCells < 7) {
      for (let i = 0; i < remainingCells; i++) {
        days.push(
          <Paper 
            key={`empty-end-${i}`}
            sx={{ 
              minHeight: 140, 
              p: 1, 
              bgcolor: theme.palette.mode === 'dark' ? 'grey.900' : 'grey.50',
              opacity: 0.4,
              borderRadius: 1
            }}
          />
        );
      }
    }

    return days;
  };

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Paper sx={{ p: 2, mb: 3, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <WorkIcon color="primary" sx={{ fontSize: 32 }} />
          <Typography variant="h5" fontWeight="bold">
            My Schedule
          </Typography>
        </Box>
        
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <IconButton onClick={previousMonth}>
            <ChevronLeftIcon />
          </IconButton>
          <Typography variant="h6" sx={{ minWidth: 180, textAlign: 'center' }}>
            {monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}
          </Typography>
          <IconButton onClick={nextMonth}>
            <ChevronRightIcon />
          </IconButton>
          <Tooltip title="Go to Today">
            <IconButton onClick={goToToday} color="primary">
              <TodayIcon />
            </IconButton>
          </Tooltip>
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          {isAdmin && (
            <FormControlLabel
              control={
                <Switch
                  checked={viewAll}
                  onChange={(e) => setViewAll(e.target.checked)}
                  color="primary"
                />
              }
              label="View All Crews"
            />
          )}
          <Chip 
            icon={<WorkIcon />} 
            label={`${jobs.length} Jobs This Month`} 
            color="primary" 
            variant="outlined"
          />
        </Box>
      </Paper>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>
      )}

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress />
        </Box>
      ) : (
        <Paper sx={{ p: 2 }}>
          {/* Day Headers - Fixed width columns */}
          <Box sx={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(7, 1fr)', 
            gap: 1, 
            mb: 1 
          }}>
            {dayNames.map((day) => (
              <Typography
                key={day}
                variant="subtitle2"
                align="center"
                sx={{ 
                  fontWeight: 'bold', 
                  color: 'text.secondary',
                  py: 1,
                  borderBottom: '2px solid',
                  borderColor: 'divider'
                }}
              >
                {day}
              </Typography>
            ))}
          </Box>

          {/* Calendar Grid - Same fixed width columns */}
          <Box sx={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(7, 1fr)', 
            gap: 1 
          }}>
            {renderCalendarDays()}
          </Box>
        </Paper>
      )}

      {/* Legend */}
      <Paper sx={{ p: 2, mt: 2 }}>
        <Typography variant="subtitle2" gutterBottom>Priority Legend:</Typography>
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
          {['emergency', 'high', 'medium', 'low'].map((priority) => (
            <Box key={priority} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Box sx={{ width: 12, height: 12, bgcolor: getPriorityColor(priority), borderRadius: 0.5 }} />
              <Typography variant="caption" sx={{ textTransform: 'capitalize' }}>{priority}</Typography>
            </Box>
          ))}
        </Box>
      </Paper>
    </Box>
  );
};

export default Calendar;
