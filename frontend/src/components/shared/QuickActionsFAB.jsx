/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
/**
 * QuickActionsFAB - Floating Action Button for mobile quick actions
 * 
 * Provides context-aware quick actions that expand on tap.
 * Shows different actions based on current route and user role.
 */

import React, { useState, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';
import { useNavigate, useLocation, useParams } from 'react-router-dom';
import {
  SpeedDial,
  SpeedDialAction,
  SpeedDialIcon,
  useMediaQuery,
  useTheme,
  Backdrop,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import CloseIcon from '@mui/icons-material/Close';
import DescriptionIcon from '@mui/icons-material/Description';
import PlaylistAddCheckIcon from '@mui/icons-material/PlaylistAddCheck';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import CameraAltIcon from '@mui/icons-material/CameraAlt';
import NoteAddIcon from '@mui/icons-material/NoteAdd';
import PhoneIcon from '@mui/icons-material/Phone';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import AssignmentIcon from '@mui/icons-material/Assignment';
import TimerIcon from '@mui/icons-material/Timer';

// Action configurations by route context
const ACTION_CONFIGS = {
  dashboard: [
    { 
      icon: <DescriptionIcon />, 
      name: 'New Job', 
      action: 'new-job',
      color: '#6366f1'
    },
    { 
      icon: <PlaylistAddCheckIcon />, 
      name: 'Start Tailboard', 
      action: 'tailboard',
      color: '#22c55e'
    },
    { 
      icon: <ReceiptLongIcon />, 
      name: 'Capture Unit', 
      action: 'capture-unit',
      color: '#f59e0b'
    },
    { 
      icon: <TimerIcon />, 
      name: 'Log Time', 
      action: 'timesheet',
      color: '#3b82f6'
    },
  ],
  jobDetails: [
    { 
      icon: <CameraAltIcon />, 
      name: 'Take Photo', 
      action: 'photo',
      color: '#22c55e'
    },
    { 
      icon: <CloudUploadIcon />, 
      name: 'Upload File', 
      action: 'upload',
      color: '#6366f1'
    },
    { 
      icon: <NoteAddIcon />, 
      name: 'Add Note', 
      action: 'note',
      color: '#f59e0b'
    },
    { 
      icon: <PhoneIcon />, 
      name: 'Call Customer', 
      action: 'call',
      color: '#3b82f6'
    },
  ],
  billing: [
    { 
      icon: <ReceiptLongIcon />, 
      name: 'New Unit Entry', 
      action: 'capture-unit',
      color: '#22c55e'
    },
    { 
      icon: <AssignmentIcon />, 
      name: 'New Field Ticket', 
      action: 'field-ticket',
      color: '#f59e0b'
    },
  ],
};

// Determine context from pathname
const getContextFromPath = (pathname) => {
  if (pathname.includes('/jobs/') && (pathname.includes('/details') || pathname.includes('/files'))) {
    return 'jobDetails';
  }
  if (pathname.includes('/billing')) {
    return 'billing';
  }
  if (pathname === '/dashboard' || pathname === '/') {
    return 'dashboard';
  }
  return 'dashboard'; // Default
};

const QuickActionsFAB = ({ onAction }) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams();
  
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(false);
  
  // Get actions for current context
  const context = getContextFromPath(location.pathname);
  const actions = ACTION_CONFIGS[context] || ACTION_CONFIGS.dashboard;
  
  // Hide FAB when scrolling down, show when scrolling up
  useEffect(() => {
    let lastScrollY = window.scrollY;
    
    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      if (currentScrollY > lastScrollY && currentScrollY > 100) {
        setHidden(true);
        setOpen(false);
      } else {
        setHidden(false);
      }
      lastScrollY = currentScrollY;
    };
    
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);
  
  // Handle action clicks
  const handleAction = useCallback((action) => {
    setOpen(false);
    
    // If parent provided handler, use it
    if (onAction) {
      onAction(action, params);
      return;
    }
    
    // Default navigation
    switch (action) {
      case 'new-job':
        navigate('/jobs/new');
        break;
      case 'tailboard':
        navigate('/tailboard');
        break;
      case 'capture-unit':
        navigate('/billing/capture');
        break;
      case 'timesheet':
        navigate('/timesheet');
        break;
      case 'field-ticket':
        navigate('/billing/field-tickets/new');
        break;
      case 'photo':
        // Trigger photo capture on job details
        if (params.id) {
          navigate(`/jobs/${params.id}/files?action=photo`);
        }
        break;
      case 'upload':
        if (params.id) {
          navigate(`/jobs/${params.id}/files?action=upload`);
        }
        break;
      case 'note':
        if (params.id) {
          navigate(`/jobs/${params.id}/details?action=note`);
        }
        break;
      case 'call':
        // Could trigger call dialog or open phone app
        break;
      default:
        break;
    }
  }, [navigate, onAction, params]);
  
  // Only show on mobile
  if (!isMobile) {
    return null;
  }
  
  return (
    <>
      <Backdrop 
        open={open} 
        onClick={() => setOpen(false)}
        sx={{ zIndex: 1199 }}
      />
      <SpeedDial
        ariaLabel="Quick Actions"
        sx={{
          position: 'fixed',
          bottom: 80, // Above bottom nav if present
          right: 16,
          zIndex: 1200,
          transition: 'transform 0.2s ease-in-out, opacity 0.2s ease-in-out',
          transform: hidden ? 'translateY(100px)' : 'translateY(0)',
          opacity: hidden ? 0 : 1,
          '& .MuiFab-primary': {
            bgcolor: '#6366f1',
            '&:hover': {
              bgcolor: '#4f46e5',
            },
          },
        }}
        icon={<SpeedDialIcon icon={<AddIcon />} openIcon={<CloseIcon />} />}
        onClose={() => setOpen(false)}
        onOpen={() => setOpen(true)}
        open={open}
        direction="up"
      >
        {actions.map((action) => (
          <SpeedDialAction
            key={action.action}
            icon={action.icon}
            tooltipTitle={action.name}
            tooltipOpen
            onClick={() => handleAction(action.action)}
            sx={{
              '& .MuiSpeedDialAction-fab': {
                bgcolor: action.color,
                color: '#fff',
                '&:hover': {
                  bgcolor: action.color,
                  filter: 'brightness(0.9)',
                },
              },
              '& .MuiSpeedDialAction-staticTooltipLabel': {
                whiteSpace: 'nowrap',
                bgcolor: 'background.paper',
                color: 'text.primary',
                boxShadow: 2,
              },
            }}
          />
        ))}
      </SpeedDial>
    </>
  );
};

QuickActionsFAB.propTypes = {
  onAction: PropTypes.func, // Optional custom action handler
};

export default QuickActionsFAB;

