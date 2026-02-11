/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
/**
 * JobStatusProgress - Visual progress indicator for job workflow status
 * 
 * Shows where a job is in the workflow as a progress bar with steps,
 * making it easy to see at a glance how far along a job is.
 */

import React from 'react';
import PropTypes from 'prop-types';
import { Box, Typography, Tooltip, useTheme, useMediaQuery } from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import BlockIcon from '@mui/icons-material/Block';

// Define workflow steps in order
const WORKFLOW_STEPS = [
  { key: 'new', label: 'Received', shortLabel: 'New' },
  { key: 'pre_fielding', label: 'Pre-Field', shortLabel: 'Pre-F' },
  { key: 'scheduled', label: 'Scheduled', shortLabel: 'Sched' },
  { key: 'in_progress', label: 'In Progress', shortLabel: 'Work' },
  { key: 'pending_gf_review', label: 'GF Review', shortLabel: 'GF' },
  { key: 'pending_pm_approval', label: 'PM Review', shortLabel: 'PM' },
  { key: 'submitted', label: 'Submitted', shortLabel: 'Sub' },
];

// Map legacy/alternate statuses to workflow positions
const STATUS_MAPPING = {
  'new': 0,
  'pending': 0,
  'assigned_to_gf': 0,
  'pre_fielding': 1,
  'pre-field': 1,
  'scheduled': 2,
  'in_progress': 3,
  'in-progress': 3,
  'pending_gf_review': 4,
  'pending_qa_review': 4,
  'pending_pm_approval': 5,
  'ready_to_submit': 6,
  'submitted': 6,
  'go_back': 5,
  'billed': 6,
  'invoiced': 6,
  'completed': 6,
  'stuck': -1, // Special case
};

// Colors for different states
const COLORS = {
  completed: '#22c55e',  // Green
  current: '#6366f1',    // Indigo
  upcoming: '#94a3b8',   // Gray
  stuck: '#ef4444',      // Red
};

// Size configuration lookup
const SIZE_CONFIG = {
  small: { dotSize: 16, fontSize: '0.65rem', lineHeight: 2 },
  medium: { dotSize: 22, fontSize: '0.7rem', lineHeight: 3 },
  large: { dotSize: 28, fontSize: '0.8rem', lineHeight: 4 },
};

/**
 * Get the color for a step based on its state
 */
const getStepColor = (isStuck, isCurrent, isCompleted) => {
  if (isStuck && isCurrent) return COLORS.stuck;
  if (isCompleted) return COLORS.completed;
  if (isCurrent) return COLORS.current;
  return COLORS.upcoming;
};

const JobStatusProgress = ({ 
  status, 
  variant = 'default',
  showLabels = true,
  size = 'medium' 
}) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  
  // Get current step index
  const currentIndex = STATUS_MAPPING[status] ?? 0;
  const isStuck = status === 'stuck';
  
  // Sizing
  const { dotSize, fontSize, lineHeight } = SIZE_CONFIG[size] || SIZE_CONFIG.medium;
  
  // Compact variant for cards
  if (variant === 'compact') {
    const completedSteps = Math.min(currentIndex + 1, WORKFLOW_STEPS.length);
    const progressPercent = (completedSteps / WORKFLOW_STEPS.length) * 100;
    
    return (
      <Tooltip title={`${WORKFLOW_STEPS[Math.min(currentIndex, WORKFLOW_STEPS.length - 1)]?.label || status}`}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%' }}>
          <Box 
            sx={{ 
              flex: 1, 
              height: 6, 
              bgcolor: 'action.hover', 
              borderRadius: 3,
              overflow: 'hidden'
            }}
          >
            <Box 
              sx={{ 
                width: `${progressPercent}%`, 
                height: '100%', 
                bgcolor: isStuck ? COLORS.stuck : COLORS.completed,
                borderRadius: 3,
                transition: 'width 0.3s ease-in-out'
              }} 
            />
          </Box>
          <Typography 
            variant="caption" 
            sx={{ 
              color: isStuck ? COLORS.stuck : 'text.secondary',
              fontSize: '0.65rem',
              fontWeight: 600,
              minWidth: 45,
              textAlign: 'right'
            }}
          >
            {isStuck ? 'STUCK' : `${completedSteps}/${WORKFLOW_STEPS.length}`}
          </Typography>
        </Box>
      </Tooltip>
    );
  }
  
  // Mini variant - just dots, no labels
  if (variant === 'mini') {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
        {WORKFLOW_STEPS.map((step, index) => {
          const isCompleted = index < currentIndex;
          const isCurrent = index === currentIndex;
          
          return (
            <Tooltip key={step.key} title={step.label}>
              <Box
                sx={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  bgcolor: getStepColor(isStuck, isCurrent, isCompleted),
                  transition: 'background-color 0.2s ease-in-out',
                }}
              />
            </Tooltip>
          );
        })}
      </Box>
    );
  }
  
  // Default variant - full stepper
  return (
    <Box sx={{ width: '100%', py: 1 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        {WORKFLOW_STEPS.map((step, index) => {
          const isCompleted = index < currentIndex;
          const isCurrent = index === currentIndex;
          
          // Determine color
          let color = COLORS.upcoming;
          
          if (isCompleted) {
            color = COLORS.completed;
          } else if (isCurrent) {
            color = isStuck ? COLORS.stuck : COLORS.current;
          }
          
          return (
            <React.Fragment key={step.key}>
              {/* Step dot and label */}
              <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 0 }}>
                <Tooltip title={step.label}>
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: dotSize,
                      height: dotSize,
                      borderRadius: '50%',
                      bgcolor: isCompleted || isCurrent ? color : 'transparent',
                      border: `2px solid ${color}`,
                      color: isCompleted || isCurrent ? '#fff' : color,
                      transition: 'all 0.2s ease-in-out',
                    }}
                  >
                    {isCompleted && (
                      <CheckCircleIcon sx={{ fontSize: dotSize - 4 }} />
                    )}
                    {isCurrent && isStuck && (
                      <BlockIcon sx={{ fontSize: dotSize - 4 }} />
                    )}
                  </Box>
                </Tooltip>
                {showLabels && (
                  <Typography
                    variant="caption"
                    sx={{
                      mt: 0.5,
                      color: isCurrent ? color : 'text.secondary',
                      fontWeight: isCurrent ? 600 : 400,
                      fontSize,
                      textAlign: 'center',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      maxWidth: 60,
                    }}
                  >
                    {isMobile ? step.shortLabel : step.label}
                  </Typography>
                )}
              </Box>
              
              {/* Connecting line */}
              {index < WORKFLOW_STEPS.length - 1 && (
                <Box
                  sx={{
                    flex: 1,
                    height: lineHeight,
                    mx: 0.5,
                    bgcolor: index < currentIndex ? COLORS.completed : COLORS.upcoming,
                    borderRadius: lineHeight / 2,
                    transition: 'background-color 0.3s ease-in-out',
                    alignSelf: 'flex-start',
                    mt: `${dotSize / 2 - lineHeight / 2}px`,
                  }}
                />
              )}
            </React.Fragment>
          );
        })}
      </Box>
    </Box>
  );
};

JobStatusProgress.propTypes = {
  status: PropTypes.string.isRequired,
  variant: PropTypes.oneOf(['default', 'compact', 'mini']),
  showLabels: PropTypes.bool,
  size: PropTypes.oneOf(['small', 'medium', 'large']),
};

export default JobStatusProgress;

