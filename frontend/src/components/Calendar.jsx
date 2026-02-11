/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
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
  useMediaQuery,
  FormControlLabel,
  Switch
} from '@mui/material';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import TodayIcon from '@mui/icons-material/Today';
import WorkIcon from '@mui/icons-material/Work';
import api from '../api';

// Helper to get user info from token synchronously
const getUserInfoFromToken = () => {
  const token = localStorage.getItem('token');
  if (token) {
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      return {
        isAdmin: payload.isAdmin === true,
        role: payload.role || null
      };
    } catch (error) {
      console.error('Failed to parse token:', error);
      return { isAdmin: false, role: null };
    }
  }
  return { isAdmin: false, role: null };
};

const Calendar = () => {
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [currentDate, setCurrentDate] = useState(new Date());
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [userInfo] = useState(() => getUserInfoFromToken()); // Initialize synchronously
  const isAdmin = userInfo.isAdmin;
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
    // Always go to the details page for quick access to sketches and job info
    navigate(`/jobs/${jobId}/details`);
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
  const dayNamesShort = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  const isDark = theme.palette.mode === 'dark';

  // Helper: Get day cell background color
  const getDayBgColor = (isToday) => {
    if (isToday) return isDark ? 'primary.900' : 'primary.50';
    return isDark ? 'grey.800' : 'white';
  };

  // Helper: Render empty calendar cell
  const renderEmptyCell = (key) => (
    <Paper 
      key={key}
      sx={{ 
        minHeight: { xs: 60, sm: 100, md: 140 }, 
        p: { xs: 0.5, sm: 1 }, 
        bgcolor: isDark ? 'grey.900' : 'grey.50',
        opacity: 0.4, borderRadius: 1
      }}
    />
  );

  // Helper: Render job item in calendar
  const renderJobItem = (job) => (
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
      placement={isMobile ? 'top' : 'right'}
      enterTouchDelay={0}
    >
      <Box
        onClick={() => handleJobClick(job._id)}
        sx={{
          mb: 0.5, 
          p: { xs: 0.25, sm: 0.5 }, 
          cursor: 'pointer',
          borderLeft: `3px solid ${getPriorityColor(job.priority)}`,
          bgcolor: isDark ? 'grey.700' : 'grey.100',
          borderRadius: '0 4px 4px 0',
          '&:hover': { bgcolor: isDark ? 'grey.600' : 'grey.200' },
          minHeight: { xs: 24, sm: 'auto' },
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
            fontSize: { xs: '0.6rem', sm: '0.7rem' },
            lineHeight: 1.2,
          }}
        >
          {job.pmNumber || job.woNumber || 'Job'}
        </Typography>
        {!isMobile && job.assignedTo && (
          <Typography variant="caption" sx={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'text.secondary', fontSize: '0.65rem' }}>
            {job.assignedTo.name || job.assignedTo.email?.split('@')[0]}
          </Typography>
        )}
      </Box>
    </Tooltip>
  );

  // Helper to render a single day cell
  const renderDayCell = (day, isToday, dayJobs) => (
    <Paper
      key={day}
      sx={{
        minHeight: { xs: 60, sm: 100, md: 140 }, 
        p: { xs: 0.5, sm: 1 }, 
        overflow: 'hidden',
        border: isToday ? `2px solid ${theme.palette.primary.main}` : '1px solid',
        borderColor: isToday ? 'primary.main' : 'divider',
        bgcolor: getDayBgColor(isToday),
        borderRadius: 1,
        '&:hover': { bgcolor: isDark ? 'grey.700' : 'grey.50' }
      }}
    >
      <Typography 
        variant="body2" 
        sx={{ 
          fontWeight: isToday ? 'bold' : 'medium', 
          color: isToday ? 'primary.main' : 'text.primary', 
          mb: 0.5,
          fontSize: { xs: '0.7rem', sm: '0.875rem' },
        }}
      >
        {day}
      </Typography>
      <Box sx={{ overflow: 'auto', maxHeight: { xs: 40, sm: 70, md: 110 } }}>
        {dayJobs.map(renderJobItem)}
      </Box>
    </Paper>
  );

  // Helper to generate trailing empty cells
  const getTrailingEmptyCells = (firstDay, daysInMonth) => {
    const totalCells = firstDay + daysInMonth;
    const remainingCells = 7 - (totalCells % 7);
    if (remainingCells >= 7) return [];
    return Array.from({ length: remainingCells }, (_, i) => renderEmptyCell(`empty-end-${i}`));
  };

  const renderCalendarDays = () => {
    const daysInMonth = getDaysInMonth(currentDate);
    const firstDay = getFirstDayOfMonth(currentDate);
    const today = new Date();
    const isCurrentMonth = today.getMonth() === currentDate.getMonth() && 
                          today.getFullYear() === currentDate.getFullYear();

    // Leading empty cells
    const leadingEmpties = Array.from({ length: firstDay }, (_, i) => renderEmptyCell(`empty-${i}`));

    // Day cells
    const dayCells = Array.from({ length: daysInMonth }, (_, i) => {
      const day = i + 1;
      const isToday = isCurrentMonth && today.getDate() === day;
      return renderDayCell(day, isToday, getJobsForDay(day));
    });

    // Trailing empty cells
    const trailingEmpties = getTrailingEmptyCells(firstDay, daysInMonth);

    return [...leadingEmpties, ...dayCells, ...trailingEmpties];
  };

  return (
    <Box sx={{ p: { xs: 1, sm: 2, md: 3 } }}>
      {/* Header */}
      <Paper sx={{ 
        p: { xs: 1.5, sm: 2 }, 
        mb: { xs: 2, sm: 3 }, 
        display: 'flex', 
        flexDirection: { xs: 'column', md: 'row' },
        alignItems: { xs: 'stretch', md: 'center' }, 
        justifyContent: 'space-between',
        gap: { xs: 1.5, md: 2 },
      }}>
        {/* Title - Hidden on mobile, month nav takes priority */}
        <Box sx={{ display: { xs: 'none', sm: 'flex' }, alignItems: 'center', gap: 2 }}>
          <WorkIcon color="primary" sx={{ fontSize: { sm: 28, md: 32 } }} />
          <Typography variant="h5" fontWeight="bold" sx={{ fontSize: { sm: '1.25rem', md: '1.5rem' } }}>
            My Schedule
          </Typography>
        </Box>
        
        {/* Month Navigation - Primary on mobile */}
        <Box sx={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center',
          gap: { xs: 0.5, sm: 1 },
          order: { xs: -1, md: 0 },
        }}>
          <IconButton onClick={previousMonth} aria-label="Previous month" size={isMobile ? 'small' : 'medium'}>
            <ChevronLeftIcon />
          </IconButton>
          <Typography 
            variant="h6" 
            sx={{ 
              minWidth: { xs: 120, sm: 160, md: 180 }, 
              textAlign: 'center',
              fontSize: { xs: '0.95rem', sm: '1.1rem', md: '1.25rem' },
              fontWeight: 600,
            }}
          >
            {isMobile ? `${monthNames[currentDate.getMonth()].slice(0, 3)} ${currentDate.getFullYear()}` : `${monthNames[currentDate.getMonth()]} ${currentDate.getFullYear()}`}
          </Typography>
          <IconButton onClick={nextMonth} aria-label="Next month" size={isMobile ? 'small' : 'medium'}>
            <ChevronRightIcon />
          </IconButton>
          <Tooltip title="Go to Today">
            <IconButton onClick={goToToday} color="primary" aria-label="Go to today" size={isMobile ? 'small' : 'medium'}>
              <TodayIcon />
            </IconButton>
          </Tooltip>
        </Box>

        {/* Controls */}
        <Box sx={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: { xs: 'space-between', md: 'flex-end' },
          gap: { xs: 1, md: 2 },
          flexWrap: 'wrap',
        }}>
          {isAdmin && (
            <FormControlLabel
              control={
                <Switch
                  checked={viewAll}
                  onChange={(e) => setViewAll(e.target.checked)}
                  color="primary"
                  size={isMobile ? 'small' : 'medium'}
                />
              }
              label={isMobile ? 'All Crews' : 'View All Crews'}
              sx={{ 
                mr: 0,
                '& .MuiFormControlLabel-label': { 
                  fontSize: { xs: '0.75rem', sm: '0.875rem' } 
                } 
              }}
            />
          )}
          <Chip 
            icon={<WorkIcon sx={{ fontSize: { xs: 14, sm: 18 } }} />} 
            label={isMobile ? `${jobs.length} Jobs` : `${jobs.length} Jobs This Month`} 
            color="primary" 
            variant="outlined"
            size={isMobile ? 'small' : 'medium'}
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
        <Paper sx={{ p: { xs: 0.5, sm: 1, md: 2 }, overflow: 'hidden' }}>
          {/* Day Headers - Responsive columns */}
          <Box sx={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(7, 1fr)', 
            gap: { xs: 0.25, sm: 0.5, md: 1 }, 
            mb: { xs: 0.5, sm: 1 } 
          }}>
            {(isMobile ? dayNamesShort : dayNames).map((day, index) => (
              <Typography
                key={`${day}-${index}`}
                variant="subtitle2"
                align="center"
                sx={{ 
                  fontWeight: 'bold', 
                  color: 'text.secondary',
                  py: { xs: 0.5, sm: 1 },
                  fontSize: { xs: '0.65rem', sm: '0.75rem', md: '0.875rem' },
                  borderBottom: '2px solid',
                  borderColor: 'divider'
                }}
              >
                {day}
              </Typography>
            ))}
          </Box>

          {/* Calendar Grid - Responsive columns */}
          <Box sx={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(7, 1fr)', 
            gap: { xs: 0.25, sm: 0.5, md: 1 } 
          }}>
            {renderCalendarDays()}
          </Box>
        </Paper>
      )}

      {/* Legend */}
      <Paper sx={{ p: { xs: 1, sm: 2 }, mt: { xs: 1, sm: 2 } }}>
        <Typography variant="subtitle2" gutterBottom sx={{ fontSize: { xs: '0.7rem', sm: '0.875rem' } }}>
          Priority Legend:
        </Typography>
        <Box sx={{ display: 'flex', gap: { xs: 1, sm: 2 }, flexWrap: 'wrap' }}>
          {['emergency', 'high', 'medium', 'low'].map((priority) => (
            <Box key={priority} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Box sx={{ width: { xs: 10, sm: 12 }, height: { xs: 10, sm: 12 }, bgcolor: getPriorityColor(priority), borderRadius: 0.5 }} />
              <Typography variant="caption" sx={{ textTransform: 'capitalize', fontSize: { xs: '0.6rem', sm: '0.75rem' } }}>
                {priority}
              </Typography>
            </Box>
          ))}
        </Box>
      </Paper>
    </Box>
  );
};

export default Calendar;
