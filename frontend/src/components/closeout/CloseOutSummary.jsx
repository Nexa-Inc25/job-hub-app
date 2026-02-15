/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
/**
 * CloseOutSummary - Units, Change Orders, and completion summary for close out.
 *
 * Contains UnitsSection (bid units) and ChangeOrderSection (field tickets / T&M).
 *
 * @module components/closeout/CloseOutSummary
 */

import React from 'react';
import PropTypes from 'prop-types';
import {
  Box,
  Typography,
  Button,
  Card,
  CardContent,
  Grid,
  Chip,
  Alert,
} from '@mui/material';
import ReceiptIcon from '@mui/icons-material/Receipt';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import NoteAddIcon from '@mui/icons-material/NoteAdd';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { useAppColors } from '../shared/themeUtils';

/**
 * Units Section - Submit bid units for approval.
 */
const UnitsSection = ({ units, onNavigateUnits }) => {
  const COLORS = useAppColors();
  const pendingUnits = units.filter((u) => u.status === 'pending');
  const approvedUnits = units.filter((u) => u.status === 'approved');
  const totalValue = units.reduce((sum, u) => sum + (u.totalAmount || 0), 0);

  return (
    <Box>
      {/* Summary cards */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid size={6}>
          <Card sx={{ bgcolor: COLORS.surface, border: `1px solid ${COLORS.border}` }}>
            <CardContent sx={{ textAlign: 'center', py: 2 }}>
              <Typography sx={{ color: COLORS.primary, fontSize: '2rem', fontWeight: 700 }}>
                {units.length}
              </Typography>
              <Typography sx={{ color: COLORS.textSecondary, fontSize: '0.75rem' }}>Units Logged</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={6}>
          <Card sx={{ bgcolor: COLORS.surface, border: `1px solid ${COLORS.border}` }}>
            <CardContent sx={{ textAlign: 'center', py: 2 }}>
              <Typography sx={{ color: COLORS.success, fontSize: '1.5rem', fontWeight: 700 }}>
                ${totalValue.toLocaleString()}
              </Typography>
              <Typography sx={{ color: COLORS.textSecondary, fontSize: '0.75rem' }}>Total Value</Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Status breakdown */}
      <Box sx={{ mb: 3 }}>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          <Chip
            icon={<AccessTimeIcon />}
            label={`${pendingUnits.length} Pending`}
            sx={{ bgcolor: `${COLORS.warning}20`, color: COLORS.warning }}
          />
          <Chip
            icon={<CheckCircleIcon />}
            label={`${approvedUnits.length} Approved`}
            sx={{ bgcolor: `${COLORS.success}20`, color: COLORS.success }}
          />
        </Box>
      </Box>

      {/* Action button */}
      <Button
        fullWidth
        variant="contained"
        startIcon={<ReceiptIcon />}
        onClick={onNavigateUnits}
        sx={{
          py: 2,
          bgcolor: COLORS.primary,
          color: COLORS.bg,
          fontWeight: 700,
          fontSize: '1rem',
          '&:hover': { bgcolor: COLORS.primaryDark },
        }}
      >
        Log New Unit
      </Button>

      {/* Recent units */}
      {units.length > 0 && (
        <Box sx={{ mt: 3 }}>
          <Typography sx={{ color: COLORS.textSecondary, fontWeight: 600, fontSize: '0.75rem', mb: 1 }}>
            RECENT ENTRIES
          </Typography>
          {units.slice(0, 5).map((unit, idx) => (
            <Card
              key={unit._id || idx}
              sx={{ bgcolor: COLORS.surface, mb: 1, border: `1px solid ${COLORS.border}` }}
            >
              <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Box>
                    <Typography sx={{ color: COLORS.primary, fontWeight: 700 }}>{unit.itemCode}</Typography>
                    <Typography sx={{ color: COLORS.textSecondary, fontSize: '0.75rem' }}>
                      Qty: {unit.quantity} • ${unit.totalAmount?.toFixed(2)}
                    </Typography>
                  </Box>
                  <Chip
                    size="small"
                    label={unit.status}
                    sx={{
                      bgcolor: unit.status === 'approved' ? `${COLORS.success}20` : `${COLORS.warning}20`,
                      color: unit.status === 'approved' ? COLORS.success : COLORS.warning,
                      textTransform: 'capitalize',
                    }}
                  />
                </Box>
              </CardContent>
            </Card>
          ))}
        </Box>
      )}
    </Box>
  );
};

UnitsSection.propTypes = {
  units: PropTypes.arrayOf(
    PropTypes.shape({
      _id: PropTypes.string,
      itemCode: PropTypes.string,
      quantity: PropTypes.number,
      totalAmount: PropTypes.number,
      status: PropTypes.string,
    })
  ).isRequired,
  onNavigateUnits: PropTypes.func.isRequired,
};

// --- Helper functions for ChangeOrderSection ---

const getStatusColor = (status, COLORS) => {
  switch (status) {
    case 'draft': return COLORS.warning;
    case 'pending_signature': return '#e65100';
    case 'signed': return COLORS.primary;
    case 'approved': return COLORS.success;
    case 'disputed': return '#c62828';
    default: return COLORS.textSecondary;
  }
};

const getStatusLabel = (status) => {
  switch (status) {
    case 'draft': return 'Draft';
    case 'pending_signature': return 'Needs Signature';
    case 'signed': return 'Signed';
    case 'approved': return 'Approved';
    case 'disputed': return 'Disputed';
    case 'billed': return 'Billed';
    default: return status;
  }
};

const getReasonLabel = (reason) => {
  const labels = {
    scope_change: 'Scope Change',
    unforeseen_condition: 'Unforeseen Condition',
    utility_request: 'Utility Request',
    safety_requirement: 'Safety',
    permit_requirement: 'Permit',
    design_error: 'Design Error',
    weather_damage: 'Weather',
    third_party_damage: '3rd Party Damage',
    other: 'Other',
  };
  return labels[reason] || reason;
};

/**
 * Change Order / Field Ticket (T&M) Section.
 */
const ChangeOrderSection = ({ fieldTickets, onNavigateFieldTicket, onCreateFieldTicket }) => {
  const COLORS = useAppColors();
  const atRiskTickets = fieldTickets.filter((t) => ['draft', 'pending_signature'].includes(t.status));
  const signedTickets = fieldTickets.filter((t) => ['signed', 'approved'].includes(t.status));
  const totalAtRisk = atRiskTickets.reduce((sum, t) => sum + (t.totalAmount || 0), 0);
  const totalSigned = signedTickets.reduce((sum, t) => sum + (t.totalAmount || 0), 0);

  return (
    <Box>
      {/* Summary cards */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid size={6}>
          <Card sx={{ bgcolor: COLORS.surface, border: `1px solid ${totalAtRisk > 0 ? COLORS.warning : COLORS.border}` }}>
            <CardContent sx={{ textAlign: 'center', py: 2 }}>
              <Typography
                sx={{
                  color: totalAtRisk > 0 ? COLORS.warning : COLORS.textSecondary,
                  fontSize: '1.5rem',
                  fontWeight: 700,
                }}
              >
                ${totalAtRisk.toLocaleString()}
              </Typography>
              <Typography sx={{ color: COLORS.textSecondary, fontSize: '0.75rem' }}>
                At Risk ({atRiskTickets.length})
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={6}>
          <Card sx={{ bgcolor: COLORS.surface, border: `1px solid ${COLORS.border}` }}>
            <CardContent sx={{ textAlign: 'center', py: 2 }}>
              <Typography sx={{ color: COLORS.success, fontSize: '1.5rem', fontWeight: 700 }}>
                ${totalSigned.toLocaleString()}
              </Typography>
              <Typography sx={{ color: COLORS.textSecondary, fontSize: '0.75rem' }}>
                Signed ({signedTickets.length})
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* At-risk warning */}
      {totalAtRisk > 0 && (
        <Alert
          severity="warning"
          icon={<WarningAmberIcon />}
          sx={{ mb: 2, bgcolor: `${COLORS.warning}15`, border: `1px solid ${COLORS.warning}` }}
        >
          <strong>${totalAtRisk.toLocaleString()}</strong> in unsigned change orders — get inspector
          signatures before leaving the site.
        </Alert>
      )}

      {/* Create new button */}
      <Button
        fullWidth
        variant="contained"
        startIcon={<NoteAddIcon />}
        onClick={onCreateFieldTicket}
        sx={{
          py: 2,
          bgcolor: COLORS.secondary,
          color: COLORS.bg,
          fontWeight: 700,
          fontSize: '1rem',
          mb: 3,
          '&:hover': { bgcolor: '#7b1fa2' },
        }}
      >
        Log Change Order
      </Button>

      {/* Existing tickets */}
      {fieldTickets.length > 0 && (
        <Box>
          <Typography sx={{ color: COLORS.textSecondary, fontWeight: 600, fontSize: '0.75rem', mb: 1 }}>
            CHANGE ORDERS ({fieldTickets.length})
          </Typography>
          {fieldTickets.map((ticket, idx) => (
            <Card
              key={ticket._id || idx}
              sx={{
                bgcolor: COLORS.surface,
                mb: 1.5,
                border: `1px solid ${COLORS.border}`,
                cursor: 'pointer',
                '&:hover': { borderColor: COLORS.primary },
              }}
              onClick={() => onNavigateFieldTicket(ticket)}
            >
              <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 0.5 }}>
                  <Box>
                    <Typography sx={{ color: COLORS.text, fontWeight: 700, fontSize: '0.95rem' }}>
                      {ticket.ticketNumber || `FT-${idx + 1}`}
                    </Typography>
                    <Typography sx={{ color: COLORS.textSecondary, fontSize: '0.75rem' }}>
                      {getReasonLabel(ticket.changeReason)}
                    </Typography>
                  </Box>
                  <Box sx={{ textAlign: 'right' }}>
                    <Typography sx={{ color: COLORS.text, fontWeight: 700 }}>
                      ${(ticket.totalAmount || 0).toLocaleString()}
                    </Typography>
                    <Chip
                      label={getStatusLabel(ticket.status)}
                      size="small"
                      sx={{
                        bgcolor: `${getStatusColor(ticket.status, COLORS)}20`,
                        color: getStatusColor(ticket.status, COLORS),
                        fontWeight: 600,
                        fontSize: '0.65rem',
                        height: 20,
                      }}
                    />
                  </Box>
                </Box>
                {ticket.changeDescription && (
                  <Typography sx={{ color: COLORS.textSecondary, fontSize: '0.75rem', mt: 0.5 }} noWrap>
                    {ticket.changeDescription}
                  </Typography>
                )}
              </CardContent>
            </Card>
          ))}
        </Box>
      )}

      {fieldTickets.length === 0 && (
        <Box sx={{ border: `2px dashed ${COLORS.border}`, borderRadius: 2, p: 4, textAlign: 'center' }}>
          <NoteAddIcon sx={{ fontSize: 48, color: COLORS.textSecondary, mb: 1 }} />
          <Typography sx={{ color: COLORS.textSecondary }}>
            No change orders yet. Tap above to log extra work.
          </Typography>
        </Box>
      )}
    </Box>
  );
};

ChangeOrderSection.propTypes = {
  fieldTickets: PropTypes.arrayOf(
    PropTypes.shape({
      _id: PropTypes.string,
      ticketNumber: PropTypes.string,
      changeReason: PropTypes.string,
      changeDescription: PropTypes.string,
      totalAmount: PropTypes.number,
      status: PropTypes.string,
    })
  ).isRequired,
  onNavigateFieldTicket: PropTypes.func.isRequired,
  onCreateFieldTicket: PropTypes.func.isRequired,
};

export { UnitsSection, ChangeOrderSection };
export default UnitsSection;
