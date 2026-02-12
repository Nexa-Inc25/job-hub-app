/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
/**
 * FieldLedger - Socket Context
 * WebSocket connection management with auto-reconnect
 */

import React, { createContext, useContext, useEffect, useState, useRef, useCallback, useMemo } from 'react';
import PropTypes from 'prop-types';
import { io } from 'socket.io-client';

const SocketContext = createContext(null);

// Get API base URL from environment or use same origin
const getSocketUrl = () => {
  const apiUrl = import.meta.env.VITE_API_URL || '';
  if (apiUrl) {
    // Extract base URL (remove /api if present)
    return apiUrl.replace(/\/api\/?$/, '');
  }
  // Default to same origin - works for both production and dev proxy
  // Never fallback to hardcoded URLs for security
  return globalThis.location?.origin || '';
};

export function SocketProvider({ children }) {
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionError, setConnectionError] = useState(null);
  const reconnectAttempts = useRef(0);
  const socketRef = useRef(null); // Ref to track socket for cleanup (avoids stale closure)
  const maxReconnectAttempts = 10;

  // Get auth token from localStorage
  const getToken = useCallback(() => {
    return localStorage.getItem('token');
  }, []);

  // Connect to socket server
  const connect = useCallback(() => {
    const token = getToken();
    
    if (!token) {
      console.warn('[Socket] No auth token, skipping connection');
      return;
    }

    const socketUrl = getSocketUrl();
    console.warn('[Socket] Connecting to:', socketUrl);

    const newSocket = io(socketUrl, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: maxReconnectAttempts,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
      timeout: 20000
    });

    newSocket.on('connect', () => {
      console.warn('[Socket] Connected:', newSocket.id);
      setIsConnected(true);
      setConnectionError(null);
      reconnectAttempts.current = 0;
    });

    newSocket.on('connected', (data) => {
      console.warn('[Socket] Server confirmed:', data.userName);
    });

    newSocket.on('disconnect', (reason) => {
      console.warn('[Socket] Disconnected:', reason);
      setIsConnected(false);
      
      // If server disconnected us, try to reconnect
      if (reason === 'io server disconnect') {
        newSocket.connect();
      }
    });

    newSocket.on('connect_error', (error) => {
      console.error('[Socket] Connection error:', error.message);
      setConnectionError(error.message);
      reconnectAttempts.current += 1;
      
      if (reconnectAttempts.current >= maxReconnectAttempts) {
        console.error('[Socket] Max reconnection attempts reached');
      }
    });

    setSocket(newSocket);
    socketRef.current = newSocket; // Keep ref updated for cleanup

    return newSocket;
  }, [getToken]);

  // Disconnect from socket server
  const disconnect = useCallback(() => {
    if (socket) {
      console.warn('[Socket] Disconnecting...');
      socket.disconnect();
      setSocket(null);
      socketRef.current = null; // Clear ref on disconnect
      setIsConnected(false);
    }
  }, [socket]);

  // Connect on mount if user is logged in
  useEffect(() => {
    const token = getToken();
    if (token && !socketRef.current) {
      connect();
    }

    // Use ref in cleanup to avoid stale closure issue
    // State-based cleanup would always see initial null value due to empty deps
    return () => {
      if (socketRef.current) {
        console.warn('[Socket] Cleanup: disconnecting on unmount');
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [connect, getToken]);

  // Listen for login/logout events to connect/disconnect
  useEffect(() => {
    const handleStorageChange = (e) => {
      if (e.key === 'token') {
        if (e.newValue) {
          // Token added - connect
          if (!socket) {
            connect();
          }
        } else {
          // Token removed - disconnect
          disconnect();
        }
      }
    };

    globalThis.addEventListener('storage', handleStorageChange);
    return () => globalThis.removeEventListener('storage', handleStorageChange);
  }, [socket, connect, disconnect]);

  // Join a job room for real-time updates
  const joinJobRoom = useCallback((jobId) => {
    if (socket && isConnected) {
      socket.emit('join:job', jobId);
    }
  }, [socket, isConnected]);

  // Leave a job room
  const leaveJobRoom = useCallback((jobId) => {
    if (socket && isConnected) {
      socket.emit('leave:job', jobId);
    }
  }, [socket, isConnected]);

  const value = useMemo(() => ({
    socket,
    isConnected,
    connectionError,
    connect,
    disconnect,
    joinJobRoom,
    leaveJobRoom
  }), [socket, isConnected, connectionError, connect, disconnect, joinJobRoom, leaveJobRoom]);

  return (
    <SocketContext.Provider value={value}>
      {children}
    </SocketContext.Provider>
  );
}

SocketProvider.propTypes = {
  children: PropTypes.node.isRequired
};

export function useSocket() {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return context;
}

export default SocketContext;

