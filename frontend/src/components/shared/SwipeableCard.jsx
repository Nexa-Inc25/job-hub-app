/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
/**
 * SwipeableCard - Card with swipe gesture actions for mobile
 * 
 * Provides swipe-to-action functionality for mobile users:
 * - Swipe right: Primary action (triggers immediately on threshold)
 * - Swipe left: Reveals action buttons that can be tapped
 * 
 * The left swipe uses a "reveal and lock" pattern where swiping past
 * threshold keeps the buttons visible for the user to tap.
 */

import React, { useState, useRef, useCallback } from 'react';
import PropTypes from 'prop-types';
import { Box, IconButton, Typography, useTheme, useMediaQuery, alpha } from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import MoreHorizIcon from '@mui/icons-material/MoreHoriz';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';

// Swipe thresholds
const SWIPE_THRESHOLD = 60;
const REVEAL_DISTANCE = 100; // How far the card stays open when revealing buttons

const SwipeableCard = ({ 
  children, 
  onSwipeRight, 
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
  const [isRevealed, setIsRevealed] = useState(false); // Left buttons are revealed and locked
  const startXRef = useRef(0);
  const currentXRef = useRef(0);
  
  // Close the revealed actions
  const closeActions = useCallback(() => {
    setIsRevealed(false);
    setSwipeX(0);
  }, []);
  
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
    let diff = currentXRef.current - startXRef.current;
    
    // If already revealed, start from the revealed position
    if (isRevealed) {
      diff = diff - REVEAL_DISTANCE;
    }
    
    // Limit swipe distance with rubber band effect
    const maxRight = REVEAL_DISTANCE;
    const maxLeft = -REVEAL_DISTANCE - 20;
    
    if (diff > 0) {
      // Swiping right - apply resistance
      diff = diff * 0.5;
    }
    
    const clampedDiff = Math.max(maxLeft, Math.min(maxRight, diff));
    setSwipeX(clampedDiff);
  }, [isSwiping, disabled, isRevealed]);
  
  const handleTouchEnd = useCallback(() => {
    if (!isSwiping) return;
    setIsSwiping(false);
    
    const rawDiff = currentXRef.current - startXRef.current;
    
    // Check for right swipe action (immediate trigger)
    if (rawDiff > SWIPE_THRESHOLD && onSwipeRight && !isRevealed) {
      onSwipeRight();
      setSwipeX(0);
      return;
    }
    
    // Check for left swipe to reveal buttons
    if (rawDiff < -SWIPE_THRESHOLD && !isRevealed) {
      // Lock in revealed position
      setIsRevealed(true);
      setSwipeX(-REVEAL_DISTANCE);
      return;
    }
    
    // If already revealed and swiping right, close
    if (isRevealed && rawDiff > SWIPE_THRESHOLD / 2) {
      closeActions();
      return;
    }
    
    // Otherwise snap back to current state
    if (isRevealed) {
      setSwipeX(-REVEAL_DISTANCE);
    } else {
      setSwipeX(0);
    }
  }, [isSwiping, onSwipeRight, isRevealed, closeActions]);
  
  // Handle action button clicks
  const handleActionClick = useCallback((action) => {
    closeActions();
    if (action) {
      action();
    }
  }, [closeActions]);
  
  // Don't render swipe functionality on desktop
  if (!isMobile) {
    return <>{children}</>;
  }
  
  const isSwipingRight = swipeX > 20;
  const swipeProgress = Math.min(Math.abs(swipeX) / SWIPE_THRESHOLD, 1);
  const showLeftActions = isRevealed || swipeX < -20;
  
  return (
    <Box sx={{ position: 'relative', overflow: 'hidden' }}>
      {/* Right swipe action background (immediate action) */}
      <Box
        sx={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: REVEAL_DISTANCE,
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
      
      {/* Left swipe action buttons (tappable) */}
      <Box
        sx={{
          position: 'absolute',
          right: 0,
          top: 0,
          bottom: 0,
          width: REVEAL_DISTANCE,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 1,
          bgcolor: alpha(theme.palette.grey[800], 0.95),
          color: '#fff',
          opacity: showLeftActions ? 1 : 0,
          transition: isSwiping ? 'none' : 'opacity 0.2s ease-out',
          pointerEvents: showLeftActions ? 'auto' : 'none',
        }}
      >
        {leftActions.includes('edit') && onEdit && (
          <IconButton 
            size="medium" 
            onClick={() => handleActionClick(onEdit)}
            sx={{ 
              color: '#fff', 
              bgcolor: alpha('#fff', 0.2),
              '&:hover': { bgcolor: alpha('#fff', 0.3) },
              '&:active': { bgcolor: alpha('#fff', 0.4) },
            }}
          >
            <EditIcon />
          </IconButton>
        )}
        {leftActions.includes('delete') && onDelete && (
          <IconButton 
            size="medium" 
            onClick={() => handleActionClick(onDelete)}
            sx={{ 
              color: '#fff', 
              bgcolor: alpha(theme.palette.error.main, 0.8),
              '&:hover': { bgcolor: alpha(theme.palette.error.main, 0.9) },
              '&:active': { bgcolor: theme.palette.error.main },
            }}
          >
            <DeleteIcon />
          </IconButton>
        )}
        {leftActions.includes('more') && onMoreOptions && (
          <IconButton 
            size="medium" 
            onClick={() => handleActionClick(onMoreOptions)}
            sx={{ 
              color: '#fff', 
              bgcolor: alpha('#fff', 0.2),
              '&:hover': { bgcolor: alpha('#fff', 0.3) },
              '&:active': { bgcolor: alpha('#fff', 0.4) },
            }}
          >
            <MoreHorizIcon />
          </IconButton>
        )}
      </Box>
      
      {/* Main content - moves with swipe */}
      <Box
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onClick={isRevealed ? closeActions : undefined}
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
