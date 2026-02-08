/**
 * FieldLedger - Socket Context
 * WebSocket connection management with auto-reconnect
 */

import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
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
  const maxReconnectAttempts = 10;

  // Get auth token from localStorage
  const getToken = useCallback(() => {
    return localStorage.getItem('token');
  }, []);

  // Connect to socket server
  const connect = useCallback(() => {
    const token = getToken();
    
    if (!token) {
      console.log('[Socket] No auth token, skipping connection');
      return;
    }

    const socketUrl = getSocketUrl();
    console.log('[Socket] Connecting to:', socketUrl);

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
      console.log('[Socket] Connected:', newSocket.id);
      setIsConnected(true);
      setConnectionError(null);
      reconnectAttempts.current = 0;
    });

    newSocket.on('connected', (data) => {
      console.log('[Socket] Server confirmed:', data.userName);
    });

    newSocket.on('disconnect', (reason) => {
      console.log('[Socket] Disconnected:', reason);
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

    return newSocket;
  }, [getToken]);

  // Disconnect from socket server
  const disconnect = useCallback(() => {
    if (socket) {
      console.log('[Socket] Disconnecting...');
      socket.disconnect();
      setSocket(null);
      setIsConnected(false);
    }
  }, [socket]);

  // Connect on mount if user is logged in
  useEffect(() => {
    const token = getToken();
    if (token && !socket) {
      connect();
    }

    return () => {
      if (socket) {
        socket.disconnect();
      }
    };
  }, []);

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

  const value = {
    socket,
    isConnected,
    connectionError,
    connect,
    disconnect,
    joinJobRoom,
    leaveJobRoom
  };

  return (
    <SocketContext.Provider value={value}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return context;
}

export default SocketContext;

