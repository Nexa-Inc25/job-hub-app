/**
 * FieldLedger - Card Component
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 */

import React from 'react';
import PropTypes from 'prop-types';
import { cn } from '../../lib/utils';

// React 19: ref is a regular prop, no forwardRef needed
const Card = ({ className, ref, ...props }) => (
  <div
    ref={ref}
    className={cn(
      'rounded-lg border border-border bg-card text-card-foreground shadow-sm',
      className
    )}
    {...props}
  />
);
Card.displayName = 'Card';

const CardHeader = ({ className, ref, ...props }) => (
  <div
    ref={ref}
    className={cn('flex flex-col space-y-1.5 p-6', className)}
    {...props}
  />
);
CardHeader.displayName = 'CardHeader';

const CardTitle = ({ className, children, ref, ...props }) => (
  <h3
    ref={ref}
    className={cn('text-lg font-semibold leading-none tracking-tight', className)}
    {...props}
  >
    {children}
  </h3>
);
CardTitle.displayName = 'CardTitle';

const CardDescription = ({ className, ref, ...props }) => (
  <p
    ref={ref}
    className={cn('text-sm text-muted-foreground', className)}
    {...props}
  />
);
CardDescription.displayName = 'CardDescription';

const CardContent = ({ className, ref, ...props }) => (
  <div ref={ref} className={cn('p-6 pt-0', className)} {...props} />
);
CardContent.displayName = 'CardContent';

const CardFooter = ({ className, ref, ...props }) => (
  <div
    ref={ref}
    className={cn('flex items-center p-6 pt-0', className)}
    {...props}
  />
);
CardFooter.displayName = 'CardFooter';

Card.propTypes = { className: PropTypes.string };
CardHeader.propTypes = { className: PropTypes.string };
CardTitle.propTypes = { className: PropTypes.string, children: PropTypes.node.isRequired };
CardDescription.propTypes = { className: PropTypes.string };
CardContent.propTypes = { className: PropTypes.string };
CardFooter.propTypes = { className: PropTypes.string };

export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter };
