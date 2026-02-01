/**
 * Network Status Component
 * 
 * Shows a banner when the user goes offline and notifies when back online.
 * Critical for field workers in areas with spotty connectivity.
 */

import React, { useState, useEffect } from 'react';
import { Snackbar, Alert, Slide, Box, LinearProgress } from '@mui/material';
import WifiOff from '@mui/icons-material/WifiOff';
import Wifi from '@mui/icons-material/Wifi';
import CloudSync from '@mui/icons-material/CloudSync';

function SlideTransition(props) {
  return <Slide {...props} direction="down" />;
}

const NetworkStatus = () => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [showOnlineNotification, setShowOnlineNotification] = useState(false);
  const [wasOffline, setWasOffline] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      if (wasOffline) {
        setShowOnlineNotification(true);
        setReconnecting(true);
        // Show syncing state briefly
        setTimeout(() => setReconnecting(false), 3000);
      }
      setWasOffline(false);
    };

    const handleOffline = () => {
      setIsOnline(false);
      setWasOffline(true);
    };

    globalThis.addEventListener('online', handleOnline);
    globalThis.addEventListener('offline', handleOffline);

    return () => {
      globalThis.removeEventListener('online', handleOnline);
      globalThis.removeEventListener('offline', handleOffline);
    };
  }, [wasOffline]);

  return (
    <>
      {/* Offline Banner - Fixed at top */}
      {!isOnline && (
        <Box
          sx={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            zIndex: 9999,
            bgcolor: 'warning.main',
            color: 'warning.contrastText',
            py: 1,
            px: 2,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 1,
            boxShadow: 3
          }}
        >
          <WifiOff fontSize="small" />
          <span>You're offline. Changes will be saved and synced when you reconnect.</span>
        </Box>
      )}

      {/* Reconnecting/Syncing indicator */}
      {reconnecting && (
        <Box
          sx={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            zIndex: 9999
          }}
        >
          <LinearProgress color="success" />
        </Box>
      )}

      {/* Back Online Notification */}
      <Snackbar
        open={showOnlineNotification}
        autoHideDuration={4000}
        onClose={() => setShowOnlineNotification(false)}
        TransitionComponent={SlideTransition}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      >
        <Alert
          severity="success"
          icon={reconnecting ? <CloudSync /> : <Wifi />}
          sx={{ width: '100%' }}
          onClose={() => setShowOnlineNotification(false)}
        >
          {reconnecting 
            ? 'Back online! Syncing your changes...' 
            : 'You\'re back online!'}
        </Alert>
      </Snackbar>
    </>
  );
};

export default NetworkStatus;

