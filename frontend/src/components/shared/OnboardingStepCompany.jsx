/** Copyright (c) 2024-2026 FieldLedger. All Rights Reserved. */

import React from 'react';
import PropTypes from 'prop-types';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Box, Button, TextField
} from '@mui/material';

/**
 * Dialog for creating a new contractor company.
 *
 * @param {Object} props
 * @param {boolean} props.open
 * @param {Function} props.onClose
 * @param {Object}  props.form        - { name, email, phone, city, state }
 * @param {Function} props.onChange    - (updatedForm) => void
 * @param {Function} props.onSubmit
 */
const OnboardingStepCompany = ({ open, onClose, form, onChange, onSubmit }) => {
  const set = (field, value) => onChange({ ...form, [field]: value });

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 600 }}>Add New Contractor Company</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
          <TextField
            label="Company Name *"
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            placeholder="e.g., ABC Electric Inc."
            fullWidth
            autoFocus
            autoComplete="organization"
          />
          <TextField
            label="Email"
            type="email"
            value={form.email}
            onChange={(e) => set('email', e.target.value)}
            placeholder="office@company.com"
            fullWidth
            autoComplete="email"
          />
          <TextField
            label="Phone"
            value={form.phone}
            onChange={(e) => set('phone', e.target.value)}
            placeholder="(555) 123-4567"
            fullWidth
            autoComplete="tel"
          />
          <Box sx={{ display: 'flex', gap: 2 }}>
            <TextField
              label="City"
              value={form.city}
              onChange={(e) => set('city', e.target.value)}
              placeholder="Sacramento"
              sx={{ flex: 2 }}
              autoComplete="address-level2"
            />
            <TextField
              label="State"
              value={form.state}
              onChange={(e) => set('state', e.target.value)}
              placeholder="CA"
              sx={{ flex: 1 }}
              autoComplete="address-level1"
            />
          </Box>
        </Box>
      </DialogContent>
      <DialogActions sx={{ p: 3 }}>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          onClick={onSubmit}
          sx={{ bgcolor: '#22c55e', '&:hover': { bgcolor: '#16a34a' } }}
        >
          Create Company
        </Button>
      </DialogActions>
    </Dialog>
  );
};

OnboardingStepCompany.propTypes = {
  open: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  form: PropTypes.shape({
    name: PropTypes.string,
    email: PropTypes.string,
    phone: PropTypes.string,
    city: PropTypes.string,
    state: PropTypes.string
  }).isRequired,
  onChange: PropTypes.func.isRequired,
  onSubmit: PropTypes.func.isRequired
};

export default OnboardingStepCompany;
