/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
/**
 * DashboardSchedule - GF categorized view with collapsible sections.
 *
 * Shows jobs organized by: Pre-Fielding In Progress, Today's Work,
 * Stuck, Needs Scheduling, Pending Pre-Field, and Future Scheduled.
 *
 * @module components/dashboard/DashboardSchedule
 */

import React from 'react';
import PropTypes from 'prop-types';
import { Link } from 'react-router-dom';
import {
  Box,
  Typography,
  Button,
  Chip,
  IconButton,
  Collapse,
} from '@mui/material';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import TodayIcon from '@mui/icons-material/Today';
import EventNoteIcon from '@mui/icons-material/EventNote';
import ScheduleIcon from '@mui/icons-material/Schedule';
import BlockIcon from '@mui/icons-material/Block';
import CalendarIcon from '@mui/icons-material/CalendarMonth';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import DescriptionIcon from '@mui/icons-material/Description';

const renderEmptySection = (message) => (
  <Typography variant="body2" color="text.secondary" sx={{ py: 2, px: 2 }}>
    {message}
  </Typography>
);

const SectionHeader = ({ title, icon, count, expanded, onToggle }) => (
  <Box
    sx={{
      py: 1.5,
      px: 2,
      mb: 1,
      cursor: 'pointer',
      borderBottom: '1px solid',
      borderColor: 'divider',
      '&:hover': { bgcolor: 'action.hover' },
      transition: 'background 0.2s ease',
    }}
    onClick={onToggle}
  >
    <Box display="flex" alignItems="center" justifyContent="space-between">
      <Box display="flex" alignItems="center" gap={1}>
        <Box sx={{ color: 'text.secondary', display: 'flex' }}>{icon}</Box>
        <Typography variant="subtitle1" component="h3" fontWeight="medium" color="text.primary">
          {title}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ ml: 0.5 }}>
          ({count})
        </Typography>
      </Box>
      <Box sx={{ color: 'text.secondary' }}>
        {expanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
      </Box>
    </Box>
  </Box>
);

SectionHeader.propTypes = {
  title: PropTypes.string.isRequired,
  icon: PropTypes.node.isRequired,
  count: PropTypes.number.isRequired,
  expanded: PropTypes.bool.isRequired,
  onToggle: PropTypes.func.isRequired,
};

/**
 * Renders a simple job row used in all collapsible sections.
 */
const JobRow = ({ job, actions, sx }) => (
  <Box
    sx={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      py: 1,
      px: 2,
      borderBottom: '1px solid',
      borderColor: 'divider',
      '&:hover': { bgcolor: 'action.hover' },
      ...sx,
    }}
  >
    <Box sx={{ flex: 1, minWidth: 0 }}>
      <Typography variant="body2" fontWeight="medium" noWrap>
        {job.pmNumber || job.woNumber || job.title}
      </Typography>
      <Typography variant="caption" color="text.secondary" noWrap>
        {job.address}
        {job.assignedTo && ` • ${job.assignedTo.name || job.assignedTo.email}`}
      </Typography>
    </Box>
    <Box sx={{ display: 'flex', gap: 0.5 }}>{actions}</Box>
  </Box>
);

JobRow.propTypes = {
  job: PropTypes.object.isRequired,
  actions: PropTypes.node,
  sx: PropTypes.object,
};

const DashboardSchedule = ({
  categories,
  expandedSections,
  onToggleSection,
  userRole,
  onScheduleJob,
  onStartPreField,
  onUnstickJob,
}) => {
  const isFieldRole = userRole === 'foreman' || userRole === 'crew';

  return (
    <Box>
      {/* PRE-FIELDING IN PROGRESS */}
      {categories.preFieldingInProgress.length > 0 && (
        <>
          <SectionHeader
            title="Pre-Fielding In Progress"
            icon={<DescriptionIcon fontSize="small" />}
            count={categories.preFieldingInProgress.length}
            expanded={expandedSections.preFieldingInProgress !== false}
            onToggle={() => onToggleSection('preFieldingInProgress')}
          />
          <Collapse in={expandedSections.preFieldingInProgress !== false}>
            {categories.preFieldingInProgress.map((job) => (
              <JobRow
                key={job._id}
                job={job}
                actions={
                  <>
                    <Button size="small" component={Link} to={`/jobs/${job._id}/files`} variant="outlined" color="primary">
                      Pre-Field
                    </Button>
                    <IconButton size="small" component={Link} to={`/jobs/${job._id}/details`} aria-label="View job details">
                      <MoreVertIcon fontSize="small" />
                    </IconButton>
                  </>
                }
              />
            ))}
          </Collapse>
        </>
      )}

      {/* TODAY'S WORK */}
      <SectionHeader
        title="Today's Work"
        icon={<TodayIcon fontSize="small" />}
        count={categories.todaysWork.length}
        expanded={expandedSections.todaysWork}
        onToggle={() => onToggleSection('todaysWork')}
      />
      <Collapse in={expandedSections.todaysWork}>
        {categories.todaysWork.length === 0
          ? renderEmptySection('No jobs scheduled for today')
          : categories.todaysWork.map((job) => (
              <JobRow
                key={job._id}
                job={job}
                actions={
                  <>
                    {isFieldRole ? (
                      <Button size="small" component={Link} to={`/jobs/${job._id}/closeout`} color="success">
                        Close Out
                      </Button>
                    ) : (
                      <Button size="small" component={Link} to={`/jobs/${job._id}/files`}>
                        Files
                      </Button>
                    )}
                    <IconButton size="small" component={Link} to={`/jobs/${job._id}/details`} aria-label="View job details">
                      <MoreVertIcon fontSize="small" />
                    </IconButton>
                  </>
                }
              />
            ))}
      </Collapse>

      {/* STUCK JOBS */}
      {categories.stuck.length > 0 && (
        <>
          <SectionHeader
            title="Stuck"
            icon={<BlockIcon fontSize="small" />}
            count={categories.stuck.length}
            expanded={expandedSections.stuck}
            onToggle={() => onToggleSection('stuck')}
          />
          <Collapse in={expandedSections.stuck}>
            {categories.stuck.map((job) => (
              <JobRow
                key={job._id}
                job={job}
                sx={{ bgcolor: 'error.50', '&:hover': { bgcolor: 'error.100' } }}
                actions={
                  <>
                    <Button size="small" color="success" onClick={(e) => onUnstickJob(job._id, e)}>
                      Resume
                    </Button>
                    <IconButton size="small" component={Link} to={`/jobs/${job._id}/details`} aria-label="View job details">
                      <MoreVertIcon fontSize="small" />
                    </IconButton>
                  </>
                }
              />
            ))}
          </Collapse>
        </>
      )}

      {/* NEEDS SCHEDULING */}
      <SectionHeader
        title="Needs Scheduling"
        icon={<EventNoteIcon fontSize="small" />}
        count={categories.needsScheduling.length}
        expanded={expandedSections.needsScheduling}
        onToggle={() => onToggleSection('needsScheduling')}
      />
      <Collapse in={expandedSections.needsScheduling}>
        {categories.needsScheduling.length === 0
          ? renderEmptySection('All pre-fielded jobs are scheduled')
          : categories.needsScheduling.map((job) => (
              <Box
                key={job._id}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  py: 1,
                  px: 2,
                  borderBottom: '1px solid',
                  borderColor: 'divider',
                  '&:hover': { bgcolor: 'action.hover' },
                }}
              >
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography variant="body2" fontWeight="medium" noWrap>
                      {job.pmNumber || job.woNumber || job.title}
                    </Typography>
                    {job.cancelType && (
                      <Chip
                        size="small"
                        label={job.cancelType === 'rescheduled' ? 'Rescheduled' : 'Canceled'}
                        color={job.cancelType === 'rescheduled' ? 'warning' : 'error'}
                        sx={{ height: 18, fontSize: '0.65rem' }}
                      />
                    )}
                  </Box>
                  <Typography variant="caption" color="text.secondary" noWrap>
                    {job.cancelReason
                      ? job.cancelReason.length > 50
                        ? `${job.cancelReason.substring(0, 50)}...`
                        : job.cancelReason
                      : job.address}
                    {!job.cancelReason && job.dueDate && ` • Due: ${new Date(job.dueDate).toLocaleDateString()}`}
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', gap: 0.5 }}>
                  <Button size="small" onClick={() => onScheduleJob(job._id)}>
                    Schedule
                  </Button>
                  <Button size="small" component={Link} to={`/jobs/${job._id}/files`}>
                    Files
                  </Button>
                  <IconButton size="small" component={Link} to={`/jobs/${job._id}/details`} aria-label="View job details">
                    <MoreVertIcon fontSize="small" />
                  </IconButton>
                </Box>
              </Box>
            ))}
      </Collapse>

      {/* PENDING PRE-FIELD */}
      <SectionHeader
        title="Pending Pre-Field"
        icon={<ScheduleIcon fontSize="small" />}
        count={categories.pendingPreField.length}
        expanded={expandedSections.pendingPreField}
        onToggle={() => onToggleSection('pendingPreField')}
      />
      <Collapse in={expandedSections.pendingPreField}>
        {categories.pendingPreField.length === 0
          ? renderEmptySection('No jobs pending pre-field')
          : categories.pendingPreField.map((job) => (
              <Box
                key={job._id}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  py: 1,
                  px: 2,
                  borderBottom: '1px solid',
                  borderColor: 'divider',
                  '&:hover': { bgcolor: 'action.hover' },
                }}
              >
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="body2" fontWeight="medium" noWrap>
                    {job.pmNumber || job.woNumber || job.title}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" noWrap>
                    {job.address}
                    {job.dueDate && ` • Due: ${new Date(job.dueDate).toLocaleDateString()}`}
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', gap: 0.5 }}>
                  <Button size="small" variant="outlined" color="primary" onClick={() => onStartPreField(job._id)}>
                    Start Pre-Field
                  </Button>
                  <Button size="small" component={Link} to={`/jobs/${job._id}/files`}>
                    Files
                  </Button>
                  <IconButton size="small" component={Link} to={`/jobs/${job._id}/details`} aria-label="View job details">
                    <MoreVertIcon fontSize="small" />
                  </IconButton>
                </Box>
              </Box>
            ))}
      </Collapse>

      {/* SCHEDULED (Future) */}
      {categories.scheduled.length > 0 && (
        <>
          <SectionHeader
            title="Scheduled"
            icon={<CalendarIcon fontSize="small" />}
            count={categories.scheduled.length}
            expanded={expandedSections.scheduled}
            onToggle={() => onToggleSection('scheduled')}
          />
          <Collapse in={expandedSections.scheduled}>
            {categories.scheduled.map((job) => (
              <Box
                key={job._id}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  py: 1,
                  px: 2,
                  borderBottom: '1px solid',
                  borderColor: 'divider',
                  '&:hover': { bgcolor: 'action.hover' },
                }}
              >
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="body2" fontWeight="medium" noWrap>
                    {job.pmNumber || job.woNumber || job.title}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" noWrap>
                    {new Date(job.crewScheduledDate).toLocaleDateString()} •{' '}
                    {job.assignedTo?.name || job.assignedTo?.email || 'Unassigned'}
                    {job.address && ` • ${job.address}`}
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', gap: 0.5 }}>
                  <Button size="small" component={Link} to={`/jobs/${job._id}/files`}>
                    Files
                  </Button>
                  <IconButton size="small" component={Link} to={`/jobs/${job._id}/details`} aria-label="View job details">
                    <MoreVertIcon fontSize="small" />
                  </IconButton>
                </Box>
              </Box>
            ))}
          </Collapse>
        </>
      )}
    </Box>
  );
};

DashboardSchedule.propTypes = {
  categories: PropTypes.shape({
    preFieldingInProgress: PropTypes.array.isRequired,
    pendingPreField: PropTypes.array.isRequired,
    needsScheduling: PropTypes.array.isRequired,
    stuck: PropTypes.array.isRequired,
    todaysWork: PropTypes.array.isRequired,
    scheduled: PropTypes.array.isRequired,
  }).isRequired,
  expandedSections: PropTypes.object.isRequired,
  onToggleSection: PropTypes.func.isRequired,
  userRole: PropTypes.string,
  onScheduleJob: PropTypes.func.isRequired,
  onStartPreField: PropTypes.func.isRequired,
  onUnstickJob: PropTypes.func.isRequired,
};

export default DashboardSchedule;
