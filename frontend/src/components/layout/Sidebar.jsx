/**
 * FieldLedger - Sidebar Navigation
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 */

import React from 'react';
import PropTypes from 'prop-types';
import { Link, useLocation } from 'react-router-dom';
import { cn } from '../../lib/utils';
import {
  LayoutDashboard,
  Briefcase,
  FileText,
  DollarSign,
  Users,
  Settings,
  Shield,
  ChevronLeft,
  ChevronRight,
  Calendar,
  ClipboardCheck,
  BookOpen,
  BarChart3,
  Building2,
  X,
} from 'lucide-react';

// Navigation items with role-based visibility
const getNavItems = (role, isDemo = false) => {
  const items = [
    {
      title: 'Dashboard',
      href: '/dashboard',
      icon: LayoutDashboard,
      roles: ['admin', 'pm', 'gf', 'foreman', 'crew', 'super_admin'],
    },
    {
      title: 'Create Job',
      href: '/create-wo',
      icon: Briefcase,
      roles: ['admin', 'pm', 'super_admin'],
    },
    {
      title: 'Calendar',
      href: '/calendar',
      icon: Calendar,
      roles: ['admin', 'pm', 'gf', 'super_admin'],
    },
    {
      title: 'Billing',
      href: '/billing',
      icon: DollarSign,
      roles: ['admin', 'pm', 'super_admin'],
    },
    {
      title: 'QA Dashboard',
      href: '/qa/dashboard',
      icon: ClipboardCheck,
      roles: ['admin', 'pm', 'qa', 'super_admin'],
    },
    {
      title: 'Spec Library',
      href: '/qa/spec-library',
      icon: BookOpen,
      roles: ['admin', 'pm', 'qa', 'gf', 'foreman', 'super_admin'],
    },
    {
      title: 'SmartForms',
      href: '/smartforms',
      icon: FileText,
      roles: ['admin', 'pm', 'super_admin'],
    },
  ];

  const adminItems = [
    {
      title: 'Admin',
      href: '/admin/owner-dashboard',
      icon: BarChart3,
      roles: ['admin', 'super_admin'],
    },
    {
      title: 'Users',
      href: '/admin/users',
      icon: Users,
      roles: ['admin', 'super_admin'],
    },
    {
      title: 'Companies',
      href: '/admin/onboarding',
      icon: Building2,
      roles: ['super_admin'],
    },
    {
      title: 'Security',
      href: '/admin/security',
      icon: Shield,
      roles: ['admin', 'super_admin'],
      hideInDemo: true,
    },
    {
      title: 'Templates',
      href: '/admin/templates',
      icon: FileText,
      roles: ['admin', 'super_admin'],
      hideInDemo: true,
    },
    {
      title: 'Settings',
      href: '/admin/procedures',
      icon: Settings,
      roles: ['admin', 'super_admin'],
      hideInDemo: true,
    },
  ];

  // Filter by role and demo mode
  const filterByRole = (item) => {
    if (!role) return true;
    if (isDemo && item.hideInDemo) return false;
    return item.roles.includes(role);
  };

  return {
    main: items.filter(filterByRole),
    admin: adminItems.filter(filterByRole),
  };
};

const NavItem = ({ item, collapsed, isActive }) => {
  const Icon = item.icon;

  return (
    <Link
      to={item.href}
      className={cn(
        'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
        'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
        isActive
          ? 'bg-sidebar-accent text-sidebar-accent-foreground'
          : 'text-sidebar-foreground/70',
        collapsed && 'justify-center px-2'
      )}
      title={collapsed ? item.title : undefined}
      aria-label={item.title}
    >
      <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
      {!collapsed && <span>{item.title}</span>}
    </Link>
  );
};

NavItem.propTypes = {
  item: PropTypes.shape({
    title: PropTypes.string.isRequired,
    href: PropTypes.string.isRequired,
    icon: PropTypes.elementType.isRequired,
  }).isRequired,
  collapsed: PropTypes.bool,
  isActive: PropTypes.bool,
};

const Sidebar = ({
  collapsed,
  onCollapsedChange,
  mobileOpen,
  onMobileOpenChange,
  userRole,
  isDemo = false,
}) => {
  const location = useLocation();
  const navItems = getNavItems(userRole, isDemo);

  const isActive = (href) => {
    if (href === '/dashboard') {
      return location.pathname === '/' || location.pathname === '/dashboard';
    }
    return location.pathname.startsWith(href);
  };

  const sidebarContent = (
    <>
      {/* Logo */}
      <div className={cn(
        'flex h-16 items-center border-b border-sidebar-border px-4',
        collapsed && 'justify-center px-2'
      )}>
        <Link to="/dashboard" className="flex items-center gap-2" aria-label="FieldLedger - Go to Dashboard">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground font-bold" aria-hidden="true">
            FL
          </div>
          {!collapsed && (
            <span className="text-lg font-semibold text-sidebar-foreground">
              FieldLedger
            </span>
          )}
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 overflow-y-auto p-3" aria-label="Main navigation">
        {/* Main nav items */}
        <div className="space-y-1">
          {navItems.main.map((item) => (
            <NavItem
              key={item.href}
              item={item}
              collapsed={collapsed}
              isActive={isActive(item.href)}
            />
          ))}
        </div>

        {/* Admin section */}
        {navItems.admin.length > 0 && (
          <>
            <div className="my-4 border-t border-sidebar-border" />
            {!collapsed && (
              <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-sidebar-foreground/50">
                Admin
              </p>
            )}
            <div className="space-y-1">
              {navItems.admin.map((item) => (
                <NavItem
                  key={item.href}
                  item={item}
                  collapsed={collapsed}
                  isActive={isActive(item.href)}
                />
              ))}
            </div>
          </>
        )}
      </nav>

      {/* Collapse toggle - desktop only */}
      <div className="hidden border-t border-sidebar-border p-3 lg:block">
        <button
          onClick={() => onCollapsedChange(!collapsed)}
          className={cn(
            'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium',
            'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
            collapsed && 'justify-center px-2'
          )}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? (
            <ChevronRight className="h-5 w-5" />
          ) : (
            <>
              <ChevronLeft className="h-5 w-5" />
              <span>Collapse</span>
            </>
          )}
        </button>
      </div>
    </>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className={cn(
          'fixed left-0 top-0 z-30 hidden h-screen flex-col bg-sidebar transition-sidebar lg:flex',
          collapsed ? 'w-16' : 'w-64'
        )}
      >
        {sidebarContent}
      </aside>

      {/* Mobile sidebar drawer */}
      <aside
        className={cn(
          'fixed left-0 top-0 z-50 flex h-screen w-64 flex-col bg-sidebar transition-transform lg:hidden',
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* Close button */}
        <button
          onClick={() => onMobileOpenChange(false)}
          className="absolute right-3 top-4 rounded-lg p-1 text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          aria-label="Close sidebar"
        >
          <X className="h-5 w-5" />
        </button>
        {sidebarContent}
      </aside>
    </>
  );
};

Sidebar.propTypes = {
  collapsed: PropTypes.bool.isRequired,
  onCollapsedChange: PropTypes.func.isRequired,
  mobileOpen: PropTypes.bool.isRequired,
  onMobileOpenChange: PropTypes.func.isRequired,
  userRole: PropTypes.string,
  isDemo: PropTypes.bool,
};

export default Sidebar;

