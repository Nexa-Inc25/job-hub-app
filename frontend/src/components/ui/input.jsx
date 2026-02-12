/**
 * FieldLedger - Input Component
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 */

import React from 'react';
import PropTypes from 'prop-types';
import { cn } from '../../lib/utils';

// React 19: ref is a regular prop, no forwardRef needed
// React 19: defaultProps removed, using default parameter values instead
const Input = ({ className, type = 'text', ref, ...props }) => {
  return (
    <input
      type={type}
      className={cn(
        'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm',
        'ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium',
        'placeholder:text-muted-foreground',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
      ref={ref}
      {...props}
    />
  );
};

Input.displayName = 'Input';

Input.propTypes = {
  className: PropTypes.string,
  type: PropTypes.string,
};

// Textarea component
const Textarea = ({ className, ref, ...props }) => {
  return (
    <textarea
      className={cn(
        'flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm',
        'ring-offset-background placeholder:text-muted-foreground',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
      ref={ref}
      {...props}
    />
  );
};

Textarea.displayName = 'Textarea';

Textarea.propTypes = {
  className: PropTypes.string,
};

// Label component - htmlFor is required for accessibility
// Must match the id attribute of the associated form control
const Label = ({ className, htmlFor, ref, ...props }) => (
  <label
    ref={ref}
    htmlFor={htmlFor}
    className={cn(
      'text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70',
      className
    )}
    {...props}
  />
);

Label.displayName = 'Label';

Label.propTypes = {
  className: PropTypes.string,
  htmlFor: PropTypes.string.isRequired, // Required for a11y: must match input id
  children: PropTypes.node,
};

export { Input, Textarea, Label };
