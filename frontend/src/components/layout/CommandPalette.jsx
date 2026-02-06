/**
 * FieldLedger - Command Palette
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * 
 * Cmd+K powered command palette for quick navigation and actions
 */

import React, { useState, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';
import { useNavigate } from 'react-router-dom';
import { Command } from 'cmdk';
import * as Dialog from '@radix-ui/react-dialog';
import { cn } from '../../lib/utils';
import api from '../../api';
import {
  Search,
  LayoutDashboard,
  Briefcase,
  DollarSign,
  Calendar,
  Users,
  FileText,
  Plus,
  Settings,
  ArrowRight,
} from 'lucide-react';

const CommandPalette = ({ open, onOpenChange }) => {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(false);

  // Search jobs when query changes
  const searchJobs = useCallback(async (query) => {
    if (!query || query.length < 2) {
      setJobs([]);
      return;
    }

    setLoading(true);
    try {
      const response = await api.get('/api/jobs', {
        params: { search: query, limit: 5 },
      });
      setJobs(response.data?.jobs || response.data || []);
    } catch (error) {
      console.error('Failed to search jobs:', error);
      setJobs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      searchJobs(search);
    }, 200);
    return () => clearTimeout(timer);
  }, [search, searchJobs]);

  // Reset search when closed
  useEffect(() => {
    if (!open) {
      setSearch('');
      setJobs([]);
    }
  }, [open]);

  const runCommand = useCallback((command) => {
    onOpenChange(false);
    command();
  }, [onOpenChange]);

  // Navigation items
  const navItems = [
    { icon: LayoutDashboard, label: 'Dashboard', href: '/dashboard' },
    { icon: Briefcase, label: 'Jobs', href: '/dashboard' },
    { icon: DollarSign, label: 'Billing', href: '/billing' },
    { icon: Calendar, label: 'Calendar', href: '/calendar' },
    { icon: Users, label: 'Users', href: '/admin/users' },
    { icon: FileText, label: 'Templates', href: '/admin/templates' },
    { icon: Settings, label: 'Settings', href: '/admin/procedures' },
  ];

  // Quick actions
  const actions = [
    { icon: Plus, label: 'Create Work Order', href: '/create-wo' },
    { icon: Plus, label: 'Emergency Work Order', href: '/emergency-wo' },
  ];

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" />
        <Dialog.Content
          className={cn(
            'fixed left-1/2 top-1/4 z-50 w-full max-w-lg -translate-x-1/2',
            'rounded-xl border border-border bg-popover shadow-2xl',
            'animate-fade-in'
          )}
        >
          <Command className="flex flex-col">
            {/* Search input */}
            <div className="flex items-center border-b border-border px-4">
              <Search className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
              <Command.Input
                value={search}
                onValueChange={setSearch}
                placeholder="Search jobs, pages, actions..."
                className={cn(
                  'flex h-12 w-full bg-transparent py-3 text-sm outline-none',
                  'placeholder:text-muted-foreground'
                )}
              />
              <kbd className="rounded bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
                ESC
              </kbd>
            </div>

            {/* Results */}
            <Command.List className="max-h-[400px] overflow-y-auto p-2">
              <Command.Empty className="py-6 text-center text-sm text-muted-foreground">
                {loading ? 'Searching...' : 'No results found.'}
              </Command.Empty>

              {/* Jobs results */}
              {jobs.length > 0 && (
                <Command.Group heading="Jobs" className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                  {jobs.map((job) => (
                    <Command.Item
                      key={job._id}
                      value={`job-${job.pmNumber || job._id}`}
                      onSelect={() => runCommand(() => navigate(`/jobs/${job._id}`))}
                      className={cn(
                        'flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm',
                        'aria-selected:bg-accent aria-selected:text-accent-foreground'
                      )}
                    >
                      <Briefcase className="h-4 w-4 text-muted-foreground" />
                      <div className="flex-1 overflow-hidden">
                        <p className="truncate font-medium">
                          PM {job.pmNumber}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {job.address || job.location || 'No address'}
                        </p>
                      </div>
                      <span className={cn(
                        'rounded-full px-2 py-0.5 text-xs font-medium capitalize',
                        job.status === 'in_progress' && 'bg-success/10 text-success',
                        job.status === 'new' && 'bg-info/10 text-info',
                        job.status === 'pending' && 'bg-warning/10 text-warning',
                        job.status === 'completed' && 'bg-success/20 text-success',
                        job.status === 'billed' && 'bg-primary/10 text-primary',
                        job.status === 'invoiced' && 'bg-primary/20 text-primary',
                        job.status === 'submitted' && 'bg-info/20 text-info',
                        job.status === 'ready_to_submit' && 'bg-info/10 text-info',
                        job.status === 'stuck' && 'bg-destructive/10 text-destructive',
                        job.status === 'on_hold' && 'bg-warning/20 text-warning',
                        // Fallback for any other status
                        !['in_progress', 'new', 'pending', 'completed', 'billed', 'invoiced', 'submitted', 'ready_to_submit', 'stuck', 'on_hold'].includes(job.status) && 'bg-muted text-muted-foreground'
                      )}>
                        {job.status?.replaceAll('_', ' ')}
                      </span>
                      <ArrowRight className="h-4 w-4 text-muted-foreground" />
                    </Command.Item>
                  ))}
                </Command.Group>
              )}

              {/* Quick actions */}
              <Command.Group heading="Quick Actions" className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                {actions.map((action) => (
                  <Command.Item
                    key={action.href}
                    value={action.label}
                    onSelect={() => runCommand(() => navigate(action.href))}
                    className={cn(
                      'flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm',
                      'aria-selected:bg-accent aria-selected:text-accent-foreground'
                    )}
                  >
                    <action.icon className="h-4 w-4 text-muted-foreground" />
                    <span>{action.label}</span>
                  </Command.Item>
                ))}
              </Command.Group>

              {/* Navigation */}
              <Command.Group heading="Navigation" className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                {navItems.map((item) => (
                  <Command.Item
                    key={item.href}
                    value={item.label}
                    onSelect={() => runCommand(() => navigate(item.href))}
                    className={cn(
                      'flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm',
                      'aria-selected:bg-accent aria-selected:text-accent-foreground'
                    )}
                  >
                    <item.icon className="h-4 w-4 text-muted-foreground" />
                    <span>{item.label}</span>
                  </Command.Item>
                ))}
              </Command.Group>
            </Command.List>

            {/* Footer hint */}
            <div className="flex items-center justify-between border-t border-border px-4 py-2 text-xs text-muted-foreground">
              <div className="flex items-center gap-2">
                <kbd className="rounded bg-muted px-1.5 py-0.5 font-medium">↑↓</kbd>
                <span>Navigate</span>
              </div>
              <div className="flex items-center gap-2">
                <kbd className="rounded bg-muted px-1.5 py-0.5 font-medium">↵</kbd>
                <span>Select</span>
              </div>
            </div>
          </Command>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};

CommandPalette.propTypes = {
  open: PropTypes.bool.isRequired,
  onOpenChange: PropTypes.func.isRequired,
};

export default CommandPalette;

