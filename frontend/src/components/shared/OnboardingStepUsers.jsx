/** Copyright (c) 2024-2026 FieldLedger. All Rights Reserved. */

import React from 'react';
import PropTypes from 'prop-types';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Box, Button, TextField, FormControl, InputLabel, Select, MenuItem,
  Typography, Alert
} from '@mui/material';

const ROLE_OPTIONS = [
  { value: 'crew', label: 'Crew Member', description: 'Field worker - can view assigned jobs' },
  { value: 'foreman', label: 'Foreman', description: 'Crew lead - can update job status & upload photos' },
  { value: 'gf', label: 'General Foreman', description: 'Pre-fields jobs, schedules crews, reviews work' },
  { value: 'pm', label: 'Project Manager', description: 'Full access - approves work, manages jobs' },
  { value: 'admin', label: 'Company Admin', description: 'Full access + company settings' },
];

/**
 * Generate a cryptographically secure random password.
 * @returns {string}
 */
function generatePassword() {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const randomValues = new Uint32Array(12);
  crypto.getRandomValues(randomValues);
  return Array.from(randomValues, (v) => chars[v % chars.length]).join('');
}

// ---- Add Employee Dialog ----

/**
 * @param {Object} props
 * @param {boolean}  props.open
 * @param {Function} props.onClose
 * @param {Object}   props.form       - { name, email, password, role, phone }
 * @param {Function} props.onChange    - (updatedForm) => void
 * @param {Function} props.onSubmit
 */
export const AddUserDialog = ({ open, onClose, form, onChange, onSubmit }) => {
  const set = (field, value) => onChange({ ...form, [field]: value });

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 600 }}>Add Employee</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
          <TextField label="Full Name *" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="John Smith" fullWidth autoFocus autoComplete="name" />
          <TextField label="Email *" type="email" value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="john@company.com" helperText="This will be their login username" fullWidth autoComplete="email" />
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
            <TextField label="Password *" type="text" value={form.password} onChange={(e) => set('password', e.target.value)} placeholder="Enter a password" helperText="At least 6 characters. Give this to the employee." fullWidth autoComplete="new-password" />
            <Button variant="outlined" onClick={() => set('password', generatePassword())} sx={{ mt: 1, whiteSpace: 'nowrap' }}>Generate</Button>
          </Box>
          <FormControl fullWidth>
            <InputLabel>Role *</InputLabel>
            <Select id="user-role" name="role" value={form.role} label="Role *" onChange={(e) => set('role', e.target.value)}>
              {ROLE_OPTIONS.map((role) => (
                <MenuItem key={role.value} value={role.value}>
                  <Box>
                    <Typography variant="body1">{role.label}</Typography>
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>{role.description}</Typography>
                  </Box>
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <TextField label="Phone (optional)" value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="(555) 123-4567" fullWidth autoComplete="tel" />
        </Box>
      </DialogContent>
      <DialogActions sx={{ p: 3 }}>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={onSubmit} sx={{ bgcolor: '#6366f1', '&:hover': { bgcolor: '#4f46e5' } }}>Add Employee</Button>
      </DialogActions>
    </Dialog>
  );
};

// ---- Reset Password Dialog ----

/**
 * @param {Object} props
 * @param {boolean}  props.open
 * @param {Function} props.onClose
 * @param {Object|null} props.user       - The user whose password is being reset
 * @param {string}   props.password
 * @param {Function} props.onPasswordChange
 * @param {Function} props.onSubmit
 */
export const ResetPasswordDialog = ({ open, onClose, user, password, onPasswordChange, onSubmit }) => (
  <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
    <DialogTitle sx={{ fontWeight: 600 }}>Reset Password for {user?.name}</DialogTitle>
    <DialogContent>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
        <Alert severity="info">Set a new password for this user. They will need to use this password to log in.</Alert>
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
          <TextField label="New Password" type="text" value={password} onChange={(e) => onPasswordChange(e.target.value)} placeholder="Enter new password" helperText="At least 6 characters" fullWidth autoFocus autoComplete="new-password" />
          <Button variant="outlined" onClick={() => onPasswordChange(generatePassword())} sx={{ mt: 1, whiteSpace: 'nowrap' }}>Generate</Button>
        </Box>
      </Box>
    </DialogContent>
    <DialogActions sx={{ p: 3 }}>
      <Button onClick={onClose}>Cancel</Button>
      <Button variant="contained" onClick={onSubmit} sx={{ bgcolor: '#f59e0b', '&:hover': { bgcolor: '#d97706' } }}>Reset Password</Button>
    </DialogActions>
  </Dialog>
);

const formShape = PropTypes.shape({
  name: PropTypes.string,
  email: PropTypes.string,
  password: PropTypes.string,
  role: PropTypes.string,
  phone: PropTypes.string
});

AddUserDialog.propTypes = {
  open: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  form: formShape.isRequired,
  onChange: PropTypes.func.isRequired,
  onSubmit: PropTypes.func.isRequired
};

ResetPasswordDialog.propTypes = {
  open: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  user: PropTypes.shape({ name: PropTypes.string }),
  password: PropTypes.string.isRequired,
  onPasswordChange: PropTypes.func.isRequired,
  onSubmit: PropTypes.func.isRequired
};

export { ROLE_OPTIONS, generatePassword };
export default AddUserDialog;
