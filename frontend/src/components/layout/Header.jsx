/**
 * FieldLedger - Header Component
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 */

import React, { useState } from 'react';
import PropTypes from 'prop-types';
import { useNavigate } from 'react-router-dom';
import { cn, getInitials } from '../../lib/utils';
import { useThemeMode } from '../../ThemeContext';
import {
  Menu,
  Search,
  Sun,
  Moon,
  LogOut,
  User,
  Settings,
  Bell,
  ChevronDown,
} from 'lucide-react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';

const Header = ({ onMenuClick, onSearchClick, user }) => {
  const navigate = useNavigate();
  const { darkMode, toggleDarkMode } = useThemeMode();
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
  };

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-4 border-b border-border bg-card px-4 lg:px-6">
      {/* Mobile menu button */}
      <button
        onClick={onMenuClick}
        className="rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-accent-foreground lg:hidden"
        aria-label="Open menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Search button */}
      <button
        onClick={onSearchClick}
        className={cn(
          'flex flex-1 items-center gap-2 rounded-lg border border-input bg-background px-3 py-2 text-sm',
          'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
          'lg:max-w-sm'
        )}
      >
        <Search className="h-4 w-4" />
        <span className="hidden sm:inline">Search jobs, units...</span>
        <span className="sm:hidden">Search...</span>
        <kbd className="ml-auto hidden rounded bg-muted px-1.5 py-0.5 text-xs font-medium sm:inline">
          ⌘K
        </kbd>
      </button>

      {/* Right side actions */}
      <div className="flex items-center gap-2">
        {/* Notifications */}
        <DropdownMenu.Root open={notificationsOpen} onOpenChange={setNotificationsOpen}>
          <DropdownMenu.Trigger asChild>
            <button
              className="relative rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              aria-label="Notifications"
            >
              <Bell className="h-5 w-5" />
              {/* Notification badge */}
              <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-destructive" />
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              className="z-50 min-w-[280px] rounded-lg border border-border bg-popover p-2 shadow-lg"
              sideOffset={5}
              align="end"
            >
              <div className="mb-2 px-2 py-1.5 text-sm font-semibold">Notifications</div>
              <div className="px-2 py-4 text-center text-sm text-muted-foreground">
                No new notifications
              </div>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>

        {/* Theme toggle */}
        <button
          onClick={toggleDarkMode}
          className="rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {darkMode ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
        </button>

        {/* User menu */}
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-accent">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-medium">
                {getInitials(user?.name || user?.email)}
              </div>
              <div className="hidden text-left lg:block">
                <p className="text-sm font-medium leading-none">{user?.name || 'User'}</p>
                <p className="text-xs text-muted-foreground capitalize">{user?.role || 'Unknown'}</p>
              </div>
              <ChevronDown className="hidden h-4 w-4 text-muted-foreground lg:block" />
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              className="z-50 min-w-[180px] rounded-lg border border-border bg-popover p-1 shadow-lg"
              sideOffset={5}
              align="end"
            >
              <DropdownMenu.Label className="px-2 py-1.5 text-sm font-semibold">
                {user?.email}
              </DropdownMenu.Label>
              <DropdownMenu.Separator className="my-1 h-px bg-border" />
              <DropdownMenu.Item
                className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none hover:bg-accent"
                onSelect={() => navigate('/profile')}
              >
                <User className="h-4 w-4" />
                Profile
              </DropdownMenu.Item>
              <DropdownMenu.Item
                className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none hover:bg-accent"
                onSelect={() => navigate('/settings')}
              >
                <Settings className="h-4 w-4" />
                Settings
              </DropdownMenu.Item>
              <DropdownMenu.Separator className="my-1 h-px bg-border" />
              <DropdownMenu.Item
                className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-destructive outline-none hover:bg-destructive/10"
                onSelect={handleLogout}
              >
                <LogOut className="h-4 w-4" />
                Logout
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>
    </header>
  );
};

Header.propTypes = {
  onMenuClick: PropTypes.func.isRequired,
  onSearchClick: PropTypes.func.isRequired,
  user: PropTypes.shape({
    name: PropTypes.string,
    email: PropTypes.string,
    role: PropTypes.string,
  }),
};

export default Header;

