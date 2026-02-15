/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
/**
 * CloseOutChecklist - Completion checklist and submit-for-review controls.
 *
 * Includes tailboard safety section, timesheet section, and the submit
 * confirmation dialog with completion percentage tracking.
 *
 * @module components/closeout/CloseOutChecklist
 */

import React from 'react';
import PropTypes from 'prop-types';
import {
  Box,
  Typography,
  Button,
  Card,
  CardContent,
  Avatar,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  CircularProgress,
  Fab,
} from '@mui/material';
import ShieldIcon from '@mui/icons-material/Shield';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import GroupsIcon from '@mui/icons-material/Groups';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import SendIcon from '@mui/icons-material/Send';
import { useAppColors } from '../shared/themeUtils';

/**
 * Tailboard / Safety Briefing sub-section.
 */
const TailboardCard = ({ tailboard, onNavigateTailboard }) => {
  const COLORS = useAppColors();
  const isComplete = tailboard?.status === 'completed';
  const crewCount = tailboard?.crewMembers?.length || 0;

  return (
    <Card
      sx={{
        bgcolor: COLORS.surface,
        border: `1px solid ${isComplete ? COLORS.success : COLORS.warning}`,
        mb: 3,
      }}
    >
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
          <Avatar sx={{ bgcolor: isComplete ? COLORS.success : COLORS.warning, width: 56, height: 56 }}>
            <ShieldIcon sx={{ fontSize: 32 }} />
          </Avatar>
          <Box>
            <Typography sx={{ color: COLORS.text, fontWeight: 700, fontSize: '1.25rem' }}>
              Daily Tailboard
            </Typography>
            <Typography sx={{ color: COLORS.textSecondary }}>
              {isComplete ? 'Completed today' : 'Required before starting work'}
            </Typography>
          </Box>
        </Box>

        {isComplete && (
          <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
            <Chip icon={<GroupsIcon />} label={`${crewCount} crew`} size="small" sx={{ bgcolor: `${COLORS.success}20`, color: COLORS.success }} />
            {tailboard?.hazardCount > 0 && (
              <Chip label={`${tailboard.hazardCount} hazards`} size="small" color="warning" />
            )}
          </Box>
        )}

        <Button
          fullWidth
          variant="contained"
          startIcon={<ShieldIcon />}
          onClick={onNavigateTailboard}
          sx={{
            py: 1.5,
            bgcolor: isComplete ? COLORS.success : COLORS.warning,
            color: isComplete ? COLORS.bg : '#000',
            fontWeight: 700,
            '&:hover': {
              bgcolor: isComplete ? '#2e7d32' : '#e65100',
            },
          }}
        >
          {isComplete ? 'View Tailboard' : 'Start Tailboard'}
        </Button>
      </CardContent>
    </Card>
  );
};

TailboardCard.propTypes = {
  tailboard: PropTypes.shape({
    status: PropTypes.string,
    crewMembers: PropTypes.array,
    hazardCount: PropTypes.number,
  }),
  onNavigateTailboard: PropTypes.func.isRequired,
};

/**
 * LME / Timesheet sub-section.
 */
const TimesheetCard = ({ lme, onNavigateTimesheet }) => {
  const COLORS = useAppColors();
  const laborEntries = lme?.labor || [];
  const totalHours = laborEntries.reduce(
    (sum, l) => sum + (l.stHours || 0) + (l.otHours || 0) + (l.dtHours || 0),
    0
  );

  return (
    <Card sx={{ bgcolor: COLORS.surface, border: `1px solid ${COLORS.border}`, mb: 3 }}>
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
          <Avatar sx={{ bgcolor: COLORS.secondary, width: 56, height: 56 }}>
            <AccessTimeIcon sx={{ fontSize: 32 }} />
          </Avatar>
          <Box>
            <Typography sx={{ color: COLORS.text, fontWeight: 700, fontSize: '1.25rem' }}>
              Daily LME
            </Typography>
            <Typography sx={{ color: COLORS.textSecondary }}>
              {totalHours > 0 ? `${totalHours} hrs logged` : 'Labor, Material & Equipment'}
            </Typography>
          </Box>
        </Box>

        <Button
          fullWidth
          variant="contained"
          startIcon={<AccessTimeIcon />}
          onClick={onNavigateTimesheet}
          sx={{
            py: 1.5,
            bgcolor: COLORS.secondary,
            color: COLORS.text,
            fontWeight: 700,
            '&:hover': { bgcolor: '#1565c0' },
          }}
        >
          Fill Out LME
        </Button>
      </CardContent>
    </Card>
  );
};

TimesheetCard.propTypes = {
  lme: PropTypes.shape({ labor: PropTypes.array }),
  onNavigateTimesheet: PropTypes.func.isRequired,
};

/**
 * Submit FAB and completion checklist dialog.
 */
const SubmitSection = ({
  canSubmit,
  completionStatus,
  completionPercent: _completionPercent,
  showSubmitDialog,
  setShowSubmitDialog,
  submitting,
  onSubmitForReview,
}) => {
  const COLORS = useAppColors();

  return (
    <>
      <Fab
        variant="extended"
        onClick={() => setShowSubmitDialog(true)}
        disabled={!canSubmit}
        sx={{
          position: 'fixed',
          bottom: 24,
          right: 24,
          bgcolor: canSubmit ? COLORS.primary : COLORS.border,
          color: COLORS.bg,
          fontWeight: 700,
          '&:hover': { bgcolor: COLORS.primaryDark },
          '&.Mui-disabled': { bgcolor: COLORS.border, color: COLORS.textSecondary },
        }}
      >
        <SendIcon sx={{ mr: 1 }} />
        Submit for Review
      </Fab>

      <Dialog
        open={showSubmitDialog}
        onClose={() => setShowSubmitDialog(false)}
        PaperProps={{ sx: { bgcolor: COLORS.surface } }}
      >
        <DialogTitle sx={{ color: COLORS.text }}>Submit Job for GF Review?</DialogTitle>
        <DialogContent>
          <Typography sx={{ color: COLORS.textSecondary, mb: 2 }}>
            This will notify the General Foreman that this job is ready for review.
          </Typography>

          <Box sx={{ mb: 2 }}>
            <Typography sx={{ color: COLORS.text, fontWeight: 600, mb: 1 }}>
              Completion Checklist:
            </Typography>
            {[
              { label: 'Photos uploaded (3+ required)', done: completionStatus.photos },
              { label: 'Tailboard completed', done: completionStatus.tailboard },
              { label: 'Units logged', done: completionStatus.units },
              { label: 'Documents signed', done: completionStatus.documents },
            ].map((item) => (
              <Box key={item.label} sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                <CheckCircleIcon
                  sx={{ color: item.done ? COLORS.success : COLORS.border, fontSize: 20 }}
                />
                <Typography
                  sx={{
                    color: item.done ? COLORS.text : COLORS.textSecondary,
                    fontSize: '0.875rem',
                  }}
                >
                  {item.label}
                </Typography>
              </Box>
            ))}
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setShowSubmitDialog(false)} sx={{ color: COLORS.textSecondary }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={onSubmitForReview}
            disabled={submitting}
            sx={{ bgcolor: COLORS.primary, color: COLORS.bg }}
          >
            {submitting ? <CircularProgress size={20} /> : 'Submit'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

SubmitSection.propTypes = {
  canSubmit: PropTypes.bool.isRequired,
  completionStatus: PropTypes.shape({
    photos: PropTypes.bool,
    tailboard: PropTypes.bool,
    units: PropTypes.bool,
    documents: PropTypes.bool,
  }).isRequired,
  completionPercent: PropTypes.number.isRequired,
  showSubmitDialog: PropTypes.bool.isRequired,
  setShowSubmitDialog: PropTypes.func.isRequired,
  submitting: PropTypes.bool.isRequired,
  onSubmitForReview: PropTypes.func.isRequired,
};

export { TailboardCard, TimesheetCard, SubmitSection };
export default SubmitSection;
