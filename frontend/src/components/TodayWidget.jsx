/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
/**
 * TodayWidget - Today's Schedule Overview Widget
 * 
 * A prominent widget showing today's scheduled work at the top of the dashboard.
 * Features:
 * - Today's scheduled jobs with crew assignments
 * - One-click to start tailboard
 * - Weather conditions
 * - Quick access to start work
 */

import React, { useState, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';
import { useNavigate, Link } from 'react-router-dom';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  Chip,
  IconButton,
  Tooltip,
  Divider,
  Avatar,
  AvatarGroup,
  LinearProgress,
  Skeleton,
  useTheme,
  alpha,
} from '@mui/material';
import TodayIcon from '@mui/icons-material/Today';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import ChecklistIcon from '@mui/icons-material/Checklist';
import DirectionsIcon from '@mui/icons-material/Directions';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import WbSunnyIcon from '@mui/icons-material/WbSunny';
import CloudIcon from '@mui/icons-material/Cloud';
import UmbrellaIcon from '@mui/icons-material/Umbrella';
import AcUnitIcon from '@mui/icons-material/AcUnit';
import WarningIcon from '@mui/icons-material/Warning';
import ThunderstormIcon from '@mui/icons-material/Thunderstorm';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import api from '../api';
import { openDirections } from '../utils/navigation';

// Weather icon mapping
const getWeatherIcon = (conditions) => {
  if (!conditions) return <WbSunnyIcon />;
  const lower = conditions.toLowerCase();
  if (lower.includes('rain') || lower.includes('shower')) return <UmbrellaIcon />;
  if (lower.includes('storm') || lower.includes('thunder')) return <ThunderstormIcon />;
  if (lower.includes('snow') || lower.includes('ice')) return <AcUnitIcon />;
  if (lower.includes('cloud') || lower.includes('overcast')) return <CloudIcon />;
  return <WbSunnyIcon />;
};

// Format time for display
const formatTime = (dateString) => {
  if (!dateString) return '';
  const date = new Date(dateString);
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
};

// Single job card within the widget
const TodayJobCard = ({ job, onStartWork, onStartTailboard }) => {
  const navigate = useNavigate();
  const theme = useTheme();
  
  const statusColors = {
    scheduled: theme.palette.info.main,
    in_progress: theme.palette.success.main,
    'in-progress': theme.palette.success.main,
  };
  
  const statusLabels = {
    scheduled: 'Scheduled',
    in_progress: 'In Progress',
    'in-progress': 'In Progress',
  };
  
  const color = statusColors[job.status] || theme.palette.grey[500];
  
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        p: 2,
        borderRadius: 2,
        bgcolor: alpha(color, 0.08),
        border: `1px solid ${alpha(color, 0.2)}`,
        transition: 'all 0.2s ease-in-out',
        '&:hover': {
          bgcolor: alpha(color, 0.12),
          transform: 'translateY(-1px)',
        },
      }}
    >
      {/* Status indicator */}
      <Box
        sx={{
          width: 4,
          height: 60,
          borderRadius: 2,
          bgcolor: color,
        }}
      />
      
      {/* Job info */}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
          <Typography 
            variant="subtitle1" 
            fontWeight={600}
            sx={{ 
              cursor: 'pointer',
              '&:hover': { color: 'primary.main' }
            }}
            onClick={() => navigate(`/jobs/${job._id}/details`)}
          >
            {job.pmNumber || job.woNumber || job.title}
          </Typography>
          <Chip 
            label={statusLabels[job.status] || job.status} 
            size="small"
            sx={{ 
              bgcolor: alpha(color, 0.15),
              color: color,
              fontWeight: 600,
              fontSize: '0.65rem',
              height: 20,
            }}
          />
        </Box>
        
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, color: 'text.secondary' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <LocationOnIcon sx={{ fontSize: 16 }} />
            <Typography variant="body2" noWrap sx={{ maxWidth: 200 }}>
              {job.address || job.city || 'No address'}
            </Typography>
          </Box>
          {job.crewScheduledDate && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <AccessTimeIcon sx={{ fontSize: 16 }} />
              <Typography variant="body2">
                {formatTime(job.crewScheduledDate)}
              </Typography>
            </Box>
          )}
        </Box>
        
        {/* Crew assignment */}
        {job.assignedTo && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1 }}>
            <Avatar 
              sx={{ width: 24, height: 24, fontSize: '0.75rem', bgcolor: 'primary.main' }}
            >
              {job.assignedTo.name?.charAt(0) || 'C'}
            </Avatar>
            <Typography variant="caption" color="text.secondary">
              {job.assignedTo.name || 'Assigned Crew'}
            </Typography>
          </Box>
        )}
      </Box>
      
      {/* Actions */}
      <Box sx={{ display: 'flex', gap: 1 }}>
        <Tooltip title="Get Directions">
          <IconButton 
            size="small"
            onClick={() => openDirections(job.address)}
            sx={{ color: 'text.secondary' }}
          >
            <DirectionsIcon />
          </IconButton>
        </Tooltip>
        
        {job.status === 'scheduled' && (
          <>
            <Tooltip title="Start Tailboard">
              <Button
                size="small"
                variant="outlined"
                color="success"
                startIcon={<ChecklistIcon />}
                onClick={() => onStartTailboard?.(job)}
                sx={{ minWidth: 0, px: 1.5 }}
              >
                Tailboard
              </Button>
            </Tooltip>
          </>
        )}
        
        {job.status === 'in_progress' || job.status === 'in-progress' ? (
          <Button
            size="small"
            variant="contained"
            component={Link}
            to={`/jobs/${job._id}/details`}
            endIcon={<ChevronRightIcon />}
            sx={{ minWidth: 0 }}
          >
            Continue
          </Button>
        ) : null}
      </Box>
    </Box>
  );
};

TodayJobCard.propTypes = {
  job: PropTypes.object.isRequired,
  onStartWork: PropTypes.func,
  onStartTailboard: PropTypes.func,
};

const TodayWidget = ({ jobs = [], weather, loading, onStartTailboard }) => {
  const navigate = useNavigate();
  const theme = useTheme();
  
  // Filter jobs for today (using local timezone, not UTC)
  const now = new Date();
  const todayLocal = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const todaysJobs = jobs.filter(job => {
    if (!job.crewScheduledDate) return false;
    const schedDate = new Date(job.crewScheduledDate);
    const schedLocal = `${schedDate.getFullYear()}-${String(schedDate.getMonth() + 1).padStart(2, '0')}-${String(schedDate.getDate()).padStart(2, '0')}`;
    return schedLocal === todayLocal && ['scheduled', 'in_progress', 'in-progress'].includes(job.status);
  });
  
  const inProgressCount = todaysJobs.filter(j => 
    j.status === 'in_progress' || j.status === 'in-progress'
  ).length;
  const scheduledCount = todaysJobs.filter(j => j.status === 'scheduled').length;
  
  // If no jobs today and not loading, don't show widget
  if (!loading && todaysJobs.length === 0) {
    return null;
  }
  
  return (
    <Card 
      sx={{ 
        mb: 3,
        background: `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.05)} 0%, ${alpha(theme.palette.primary.main, 0.02)} 100%)`,
        border: `1px solid ${alpha(theme.palette.primary.main, 0.1)}`,
      }}
    >
      <CardContent sx={{ p: 3 }}>
        {/* Header */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
              <TodayIcon color="primary" />
              <Typography variant="h6" fontWeight={700}>
                Today&apos;s Work
              </Typography>
              {todaysJobs.length > 0 && (
                <Chip 
                  label={`${todaysJobs.length} job${todaysJobs.length !== 1 ? 's' : ''}`}
                  size="small"
                  color="primary"
                  variant="outlined"
                />
              )}
            </Box>
            <Typography variant="body2" color="text.secondary">
              {new Date().toLocaleDateString('en-US', { 
                weekday: 'long', 
                month: 'long', 
                day: 'numeric' 
              })}
            </Typography>
          </Box>
          
          {/* Weather */}
          {weather && (
            <Tooltip title={weather.conditions || 'Current weather'}>
              <Box sx={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: 1,
                px: 2,
                py: 1,
                borderRadius: 2,
                bgcolor: 'background.paper',
                border: '1px solid',
                borderColor: 'divider',
              }}>
                {getWeatherIcon(weather.conditions)}
                <Typography variant="body2" fontWeight={600}>
                  {weather.temperature ? `${Math.round(weather.temperature)}°F` : '--'}
                </Typography>
              </Box>
            </Tooltip>
          )}
        </Box>
        
        {/* Status summary */}
        {!loading && todaysJobs.length > 0 && (
          <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
            {inProgressCount > 0 && (
              <Chip 
                icon={<PlayArrowIcon />}
                label={`${inProgressCount} In Progress`}
                color="success"
                size="small"
              />
            )}
            {scheduledCount > 0 && (
              <Chip 
                icon={<AccessTimeIcon />}
                label={`${scheduledCount} Scheduled`}
                color="info"
                size="small"
              />
            )}
          </Box>
        )}
        
        {/* Loading state */}
        {loading && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Skeleton variant="rounded" height={80} />
            <Skeleton variant="rounded" height={80} />
          </Box>
        )}
        
        {/* Jobs list */}
        {!loading && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {todaysJobs.slice(0, 3).map((job) => (
              <TodayJobCard 
                key={job._id} 
                job={job}
                onStartTailboard={onStartTailboard}
              />
            ))}
            
            {/* Show more link if more than 3 jobs */}
            {todaysJobs.length > 3 && (
              <Button 
                variant="text" 
                onClick={() => navigate('/dashboard?filter=today')}
                endIcon={<ChevronRightIcon />}
                sx={{ alignSelf: 'flex-start' }}
              >
                View all {todaysJobs.length} jobs
              </Button>
            )}
          </Box>
        )}
        
        {/* Empty state */}
        {!loading && todaysJobs.length === 0 && (
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <TodayIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
            <Typography variant="body1" color="text.secondary">
              No jobs scheduled for today
            </Typography>
            <Button 
              variant="outlined" 
              size="small" 
              sx={{ mt: 2 }}
              onClick={() => navigate('/dashboard')}
            >
              View All Jobs
            </Button>
          </Box>
        )}
      </CardContent>
    </Card>
  );
};

TodayWidget.propTypes = {
  jobs: PropTypes.arrayOf(PropTypes.object),
  weather: PropTypes.shape({
    temperature: PropTypes.number,
    conditions: PropTypes.string,
  }),
  loading: PropTypes.bool,
  onStartTailboard: PropTypes.func,
};

export default TodayWidget;

