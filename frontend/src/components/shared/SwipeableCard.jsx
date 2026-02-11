/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
/**
 * SwipeableCard - Card with swipe gesture actions for mobile
 * 
 * Provides swipe-to-action functionality for mobile users:
 * - Swipe right: Primary action (e.g., quick status update)
 * - Swipe left: Secondary actions (e.g., menu options)
 */

import React, { useState, useRef, useCallback } from 'react';
import PropTypes from 'prop-types';
import { Box, IconButton, Typography, useTheme, useMediaQuery, alpha } from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import MoreHorizIcon from '@mui/icons-material/MoreHoriz';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import BlockIcon from '@mui/icons-material/Block';

// Swipe thresholds
const SWIPE_THRESHOLD = 80;
const MAX_SWIPE = 120;

const SwipeableCard = ({ 
  children, 
  onSwipeRight, 
  onSwipeLeft,
  onDelete,
  onEdit,
  onMoreOptions,
  rightLabel = 'Advance',
  rightIcon = <CheckCircleIcon />,
  rightColor = '#22c55e',
  leftActions = ['more'],
  disabled = false,
}) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  
  const [swipeX, setSwipeX] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const startXRef = useRef(0);
  const currentXRef = useRef(0);
  
  // Touch handlers
  const handleTouchStart = useCallback((e) => {
    if (disabled || !isMobile) return;
    startXRef.current = e.touches[0].clientX;
    currentXRef.current = startXRef.current;
    setIsSwiping(true);
  }, [disabled, isMobile]);
  
  const handleTouchMove = useCallback((e) => {
    if (!isSwiping || disabled) return;
    
    currentXRef.current = e.touches[0].clientX;
    const diff = currentXRef.current - startXRef.current;
    
    // Limit swipe distance
    const clampedDiff = Math.max(-MAX_SWIPE, Math.min(MAX_SWIPE, diff));
    
    // Apply rubber band effect at edges
    const rubberBand = clampedDiff * 0.8;
    setSwipeX(rubberBand);
  }, [isSwiping, disabled]);
  
  const handleTouchEnd = useCallback(() => {
    if (!isSwiping) return;
    setIsSwiping(false);
    
    const diff = currentXRef.current - startXRef.current;
    
    // Check if swipe threshold was reached
    if (diff > SWIPE_THRESHOLD && onSwipeRight) {
      // Trigger right swipe action
      onSwipeRight();
    } else if (diff < -SWIPE_THRESHOLD && onSwipeLeft) {
      // Trigger left swipe action
      onSwipeLeft();
    }
    
    // Reset position
    setSwipeX(0);
  }, [isSwiping, onSwipeRight, onSwipeLeft]);
  
  // Don't render swipe functionality on desktop
  if (!isMobile) {
    return <>{children}</>;
  }
  
  const isSwipingRight = swipeX > 20;
  const isSwipingLeft = swipeX < -20;
  const swipeProgress = Math.min(Math.abs(swipeX) / SWIPE_THRESHOLD, 1);
  
  return (
    <Box sx={{ position: 'relative', overflow: 'hidden' }}>
      {/* Right swipe action background */}
      <Box
        sx={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: MAX_SWIPE,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-start',
          pl: 2,
          bgcolor: alpha(rightColor, 0.9),
          color: '#fff',
          opacity: isSwipingRight ? swipeProgress : 0,
          transition: isSwiping ? 'none' : 'opacity 0.2s ease-out',
        }}
      >
        <Box sx={{ 
          display: 'flex', 
          flexDirection: 'column', 
          alignItems: 'center',
          transform: `scale(${0.8 + swipeProgress * 0.2})`,
          transition: isSwiping ? 'none' : 'transform 0.2s ease-out',
        }}>
          {React.cloneElement(rightIcon, { sx: { fontSize: 28 } })}
          <Typography variant="caption" sx={{ mt: 0.5, fontWeight: 600 }}>
            {rightLabel}
          </Typography>
        </Box>
      </Box>
      
      {/* Left swipe action background */}
      <Box
        sx={{
          position: 'absolute',
          right: 0,
          top: 0,
          bottom: 0,
          width: MAX_SWIPE,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          pr: 2,
          gap: 1,
          bgcolor: alpha(theme.palette.grey[800], 0.9),
          color: '#fff',
          opacity: isSwipingLeft ? swipeProgress : 0,
          transition: isSwiping ? 'none' : 'opacity 0.2s ease-out',
        }}
      >
        {leftActions.includes('edit') && onEdit && (
          <IconButton 
            size="small" 
            onClick={onEdit}
            sx={{ 
              color: '#fff', 
              bgcolor: alpha('#fff', 0.2),
              transform: `scale(${0.8 + swipeProgress * 0.2})`,
            }}
          >
            <EditIcon fontSize="small" />
          </IconButton>
        )}
        {leftActions.includes('delete') && onDelete && (
          <IconButton 
            size="small" 
            onClick={onDelete}
            sx={{ 
              color: '#fff', 
              bgcolor: alpha(theme.palette.error.main, 0.8),
              transform: `scale(${0.8 + swipeProgress * 0.2})`,
            }}
          >
            <DeleteIcon fontSize="small" />
          </IconButton>
        )}
        {leftActions.includes('more') && onMoreOptions && (
          <IconButton 
            size="small" 
            onClick={onMoreOptions}
            sx={{ 
              color: '#fff', 
              bgcolor: alpha('#fff', 0.2),
              transform: `scale(${0.8 + swipeProgress * 0.2})`,
            }}
          >
            <MoreHorizIcon fontSize="small" />
          </IconButton>
        )}
      </Box>
      
      {/* Main content - moves with swipe */}
      <Box
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        sx={{
          position: 'relative',
          zIndex: 1,
          bgcolor: 'background.paper',
          transform: `translateX(${swipeX}px)`,
          transition: isSwiping ? 'none' : 'transform 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
          touchAction: 'pan-y', // Allow vertical scroll
        }}
      >
        {children}
      </Box>
    </Box>
  );
};

SwipeableCard.propTypes = {
  children: PropTypes.node.isRequired,
  onSwipeRight: PropTypes.func,
  onSwipeLeft: PropTypes.func,
  onDelete: PropTypes.func,
  onEdit: PropTypes.func,
  onMoreOptions: PropTypes.func,
  rightLabel: PropTypes.string,
  rightIcon: PropTypes.node,
  rightColor: PropTypes.string,
  leftActions: PropTypes.arrayOf(PropTypes.oneOf(['more', 'edit', 'delete'])),
  disabled: PropTypes.bool,
};

export default SwipeableCard;

