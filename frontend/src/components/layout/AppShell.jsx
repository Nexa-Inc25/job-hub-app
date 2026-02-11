/**
 * FieldLedger - AppShell Layout
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * 
 * Enterprise layout shell with sidebar navigation and header
 */

import React, { useState, useEffect, lazy, Suspense } from 'react';
import PropTypes from 'prop-types';
import { useLocation } from 'react-router-dom';
import { cn } from '../../lib/utils';
import Sidebar from './Sidebar';
import Header from './Header';
import Breadcrumbs from './Breadcrumbs';

// Lazy load CommandPalette for better initial load
const CommandPalette = lazy(() => import('./CommandPalette'));
// Lazy load QuickActionsFAB for mobile
const QuickActionsFAB = lazy(() => import('../shared/QuickActionsFAB'));

const AppShell = ({ children }) => {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false); // Mobile drawer
  const [commandOpen, setCommandOpen] = useState(false);
  const location = useLocation();

  // Close mobile sidebar on route change
  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  // Keyboard shortcut for command palette (Cmd+K / Ctrl+K)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCommandOpen((prev) => !prev);
      }
      // Escape to close
      if (e.key === 'Escape') {
        setCommandOpen(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Get user from localStorage
  const user = React.useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem('user') || '{}');
    } catch {
      return {};
    }
  }, []);

  // Check if this is a demo session
  const isDemo = localStorage.getItem('isDemo') === 'true';

  return (
    <div className="min-h-screen bg-background">
      {/* Sidebar */}
      <Sidebar
        collapsed={sidebarCollapsed}
        onCollapsedChange={setSidebarCollapsed}
        mobileOpen={sidebarOpen}
        onMobileOpenChange={setSidebarOpen}
        userRole={user.role}
        isDemo={isDemo}
      />

      {/* Main content area */}
      <div
        className={cn(
          'transition-sidebar min-h-screen',
          sidebarCollapsed ? 'lg:pl-16' : 'lg:pl-64'
        )}
      >
        {/* Header */}
        <Header
          onMenuClick={() => setSidebarOpen(true)}
          onSearchClick={() => setCommandOpen(true)}
          user={user}
        />

        {/* Breadcrumbs */}
        <div className="border-b border-border bg-card px-4 py-2 lg:px-6">
          <Breadcrumbs />
        </div>

        {/* Page content */}
        <main className="p-4 lg:p-6">
          {children}
        </main>
      </div>

      {/* Command Palette */}
      <Suspense fallback={null}>
        <CommandPalette 
          open={commandOpen} 
          onOpenChange={setCommandOpen} 
        />
      </Suspense>

      {/* Quick Actions FAB for mobile */}
      <Suspense fallback={null}>
        <QuickActionsFAB />
      </Suspense>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}
    </div>
  );
};

AppShell.propTypes = {
  children: PropTypes.node.isRequired,
};

export default AppShell;

