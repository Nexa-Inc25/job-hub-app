/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
/**
 * Field Ticket Summary
 *
 * Extracted from FieldTicketForm.jsx to reduce file size.
 * Displays the totals breakdown: labor, equipment, materials, markup, grand total.
 *
 * @module components/billing/FieldTicketSummary
 */

import React from 'react';
import PropTypes from 'prop-types';
import {
  Box,
  Typography,
  TextField,
  Card,
  CardContent,
  Divider,
} from '@mui/material';
import { useAppColors } from '../shared/themeUtils';

const FieldTicketSummary = ({ laborTotal, equipmentTotal, materialTotal, markupRate, onMarkupRateChange }) => {
  const COLORS = useAppColors();

  const subtotal = laborTotal + equipmentTotal + materialTotal;
  const overallMarkup = subtotal * (markupRate / 100);
  const grandTotal = subtotal + overallMarkup;

  return (
    <Card sx={{ mb: 2, bgcolor: COLORS.surfaceLight }}>
      <CardContent>
        <Typography variant="subtitle1" sx={{ color: COLORS.text, mb: 2, fontWeight: 600 }}>
          Ticket Summary
        </Typography>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
          <Typography sx={{ color: COLORS.textSecondary }}>Labor</Typography>
          <Typography sx={{ color: COLORS.text }}>${laborTotal.toFixed(2)}</Typography>
        </Box>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
          <Typography sx={{ color: COLORS.textSecondary }}>Equipment</Typography>
          <Typography sx={{ color: COLORS.text }}>${equipmentTotal.toFixed(2)}</Typography>
        </Box>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
          <Typography sx={{ color: COLORS.textSecondary }}>Materials</Typography>
          <Typography sx={{ color: COLORS.text }}>${materialTotal.toFixed(2)}</Typography>
        </Box>
        <Divider sx={{ my: 1, borderColor: COLORS.border }} />
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
          <Typography sx={{ color: COLORS.textSecondary }}>Subtotal</Typography>
          <Typography sx={{ color: COLORS.text }}>${subtotal.toFixed(2)}</Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1 }}>
          <Typography sx={{ color: COLORS.textSecondary }}>Markup</Typography>
          <TextField
            type="number"
            value={markupRate}
            onChange={(e) => onMarkupRateChange(Number.parseFloat(e.target.value) || 0)}
            size="small"
            inputProps={{ min: 0, max: 100 }}
            sx={{ width: 80 }}
            InputProps={{
              endAdornment: '%',
              sx: { bgcolor: COLORS.surface, color: COLORS.text }
            }}
          />
          <Typography sx={{ color: COLORS.text, flex: 1, textAlign: 'right' }}>
            ${overallMarkup.toFixed(2)}
          </Typography>
        </Box>
        <Divider sx={{ my: 1, borderColor: COLORS.border }} />
        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
          <Typography variant="h6" sx={{ color: COLORS.primary, fontWeight: 700 }}>
            Total
          </Typography>
          <Typography variant="h6" sx={{ color: COLORS.primary, fontWeight: 700 }}>
            ${grandTotal.toFixed(2)}
          </Typography>
        </Box>
      </CardContent>
    </Card>
  );
};

FieldTicketSummary.propTypes = {
  laborTotal: PropTypes.number.isRequired,
  equipmentTotal: PropTypes.number.isRequired,
  materialTotal: PropTypes.number.isRequired,
  markupRate: PropTypes.number.isRequired,
  onMarkupRateChange: PropTypes.func.isRequired,
};

export default FieldTicketSummary;
