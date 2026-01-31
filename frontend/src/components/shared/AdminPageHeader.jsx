// src/components/shared/AdminPageHeader.js
// Reusable header for admin pages

import React from 'react';
import PropTypes from 'prop-types';
import { useNavigate } from 'react-router-dom';
import {
  AppBar,
  Toolbar,
  IconButton,
  Typography,
  Chip,
} from '@mui/material';
import { ArrowBack as ArrowBackIcon } from '@mui/icons-material';

const AdminPageHeader = ({
  title,
  icon: Icon,
  iconColor = '#6366f1',
  chipLabel,
  chipColor = '#6366f1',
  backPath = '/admin/owner-dashboard',
  cardBg,
  textPrimary,
  borderColor,
  children,
}) => {
  const navigate = useNavigate();

  return (
    <AppBar 
      position="sticky" 
      elevation={0} 
      sx={{ bgcolor: cardBg, borderBottom: `1px solid ${borderColor}` }}
    >
      <Toolbar>
        <IconButton 
          onClick={() => navigate(backPath)} 
          sx={{ mr: 2, color: textPrimary }}
          aria-label="Go back"
        >
          <ArrowBackIcon />
        </IconButton>
        {Icon && <Icon sx={{ mr: 1.5, color: iconColor }} />}
        <Typography variant="h6" sx={{ flexGrow: 1, color: textPrimary, fontWeight: 700 }}>
          {title}
        </Typography>
        {chipLabel && (
          <Chip 
            label={chipLabel}
            sx={{ bgcolor: `${chipColor}20`, color: chipColor, fontWeight: 600 }}
          />
        )}
        {children}
      </Toolbar>
    </AppBar>
  );
};

AdminPageHeader.propTypes = {
  title: PropTypes.string.isRequired,
  icon: PropTypes.elementType,
  iconColor: PropTypes.string,
  chipLabel: PropTypes.string,
  chipColor: PropTypes.string,
  backPath: PropTypes.string,
  cardBg: PropTypes.string.isRequired,
  textPrimary: PropTypes.string.isRequired,
  borderColor: PropTypes.string.isRequired,
  children: PropTypes.node,
};

export default AdminPageHeader;

