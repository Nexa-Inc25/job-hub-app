/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
/**
 * DashboardJobList - Standard job card grid with flip functionality.
 *
 * Renders filtered jobs as flip-cards showing front (summary) and
 * back (pre-field checklist or dependencies).
 *
 * @module components/dashboard/DashboardJobList
 */

import React from 'react';
import PropTypes from 'prop-types';
import { Link } from 'react-router-dom';
import {
  Grid,
  Card,
  CardContent,
  CardActions,
  Button,
  Typography,
  Box,
  Chip,
  Paper,
  Divider,
  IconButton,
  Tooltip,
  LinearProgress,
  TextField,
  Checkbox,
  FormControlLabel,
  Collapse,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DescriptionIcon from '@mui/icons-material/Description';
import ScheduleIcon from '@mui/icons-material/Schedule';
import PersonIcon from '@mui/icons-material/Person';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import FlipIcon from '@mui/icons-material/Flip';
import ChatIcon from '@mui/icons-material/Chat';
import ConstructionIcon from '@mui/icons-material/Construction';
import BuildIcon from '@mui/icons-material/Build';
import CalendarIcon from '@mui/icons-material/CalendarMonth';

import {
  STATUS_COLORS_MAP,
  STATUS_LABELS_MAP,
  needsPreField,
  getDependencyStatusColor,
  getDependencyChipSx,
  getDependencyStatusLabel,
  getDependencyTypeLabel,
  preFieldItems,
  hasTagsOrLabels,
  renderECTagChips,
  renderPreFieldChipData,
} from './dashboardHelpers';

// Status icon mapping
const STATUS_ICONS = {
  new: <ScheduleIcon />, assigned_to_gf: <DescriptionIcon />,
  pre_fielding: <DescriptionIcon />, scheduled: <ScheduleIcon />,
  stuck: null, in_progress: <DescriptionIcon />,
  pending_gf_review: <ScheduleIcon />, pending_qa_review: <ScheduleIcon />,
  pending_pm_approval: <ScheduleIcon />,
  ready_to_submit: null, submitted: null,
  go_back: null, billed: null, invoiced: null,
  pending: <ScheduleIcon />, 'pre-field': <DescriptionIcon />,
  'in-progress': <DescriptionIcon />, completed: null,
};

const formatDate = (dateString) => {
  if (!dateString) return 'No date';
  return new Date(dateString).toLocaleDateString();
};

const DashboardJobList = ({
  jobs,
  flippedCards,
  jobDetails,
  preFieldChecklist,
  userRole,
  onCardFlip,
  onJobMenuOpen,
  onPreFieldCheck,
  onPreFieldNotes,
  onSavePreField,
  onDependencyStatusClick,
  onCreateWorkOrder,
  search,
  filter,
}) => {
  const getStatusColor = (status) => STATUS_COLORS_MAP[status] || 'default';
  const getStatusLabel = (status) => STATUS_LABELS_MAP[status] || status?.replaceAll('_', ' ') || 'Unknown';
  const getStatusIcon = (status) => STATUS_ICONS[status] || <DescriptionIcon />;

  if (jobs.length === 0) {
    return (
      <Grid container spacing={3}>
        <Grid size={12}>
          <Paper sx={{ p: 6, textAlign: 'center', borderRadius: 2, boxShadow: 1 }}>
            <DescriptionIcon sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
            <Typography variant="h6" component="h3" gutterBottom>
              No work orders found
            </Typography>
            <Typography variant="body2" color="text.secondary" mb={3}>
              {search || filter !== 'all'
                ? 'Try adjusting your search or filter criteria'
                : 'Get started by creating your first work order'}
            </Typography>
            <Button variant="contained" startIcon={<AddIcon />} onClick={onCreateWorkOrder} sx={{ borderRadius: 2 }}>
              Create Work Order
            </Button>
          </Paper>
        </Grid>
      </Grid>
    );
  }

  return (
    <Grid container spacing={3}>
      {jobs.map((job) => {
        const isFlipped = !!flippedCards[job._id];
        const details = jobDetails[job._id] || job;

        return (
          <Grid size={{ xs: 12, md: 6, lg: 4 }} key={job._id}>
            <Box sx={{ height: 420, position: 'relative' }}>
              {/* FRONT SIDE */}
              {!isFlipped && (
                <Card
                  component={Link}
                  to={`/jobs/${job._id}/details`}
                  sx={{
                    position: 'absolute',
                    top: 0, left: 0, width: '100%', height: '100%',
                    borderRadius: 2, boxShadow: 2,
                    display: 'flex', flexDirection: 'column',
                    cursor: 'pointer', textDecoration: 'none', color: 'inherit',
                    transition: 'box-shadow 0.2s, transform 0.1s',
                    '&:hover': { boxShadow: 4 },
                    '&:active': { transform: 'scale(0.99)' },
                  }}
                >
                  <CardContent sx={{ flexGrow: 1, overflow: 'auto' }}>
                    <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={2}>
                      <Box flex={1}>
                        <Typography variant="h6" component="h3" gutterBottom sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {job.title || 'Untitled Work Order'}
                        </Typography>
                        {job.client && (
                          <Typography variant="body2" color="text.secondary" display="flex" alignItems="center" gap={0.5}>
                            <PersonIcon fontSize="small" /> {job.client}
                          </Typography>
                        )}
                      </Box>
                      <Chip icon={getStatusIcon(job.status)} label={getStatusLabel(job.status)} color={getStatusColor(job.status)} size="small" variant="filled" />
                    </Box>

                    {job.description && (
                      <Typography variant="body2" color="text.secondary" sx={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', mb: 2 }}>
                        {job.description}
                      </Typography>
                    )}

                    {/* EC Tag & Pre-field Labels */}
                    {hasTagsOrLabels(job) && (
                      <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mb: 1 }}>
                        {renderECTagChips(job).map((c) => <Chip key={c.key} size="small" label={c.label} color={c.color} variant={c.variant} sx={c.sx} />)}
                        {renderPreFieldChipData(job).map((c) => <Chip key={c.key} size="small" label={c.label} color={c.color} variant={c.variant} sx={c.sx} />)}
                      </Box>
                    )}

                    {/* Job Scope Summary */}
                    {job.jobScope?.summary && (
                      <Box sx={{ p: 1, mb: 1.5, bgcolor: 'rgba(59, 130, 246, 0.12)', borderRadius: 1, borderLeft: '3px solid', borderColor: '#3b82f6' }}>
                        <Typography variant="caption" sx={{ fontWeight: 600, color: 'info.dark', display: 'block', mb: 0.5 }}>Scope</Typography>
                        <Typography variant="caption" color="text.primary" sx={{ lineHeight: 1.4 }}>{job.jobScope.summary}</Typography>
                      </Box>
                    )}

                    {/* Workflow Info */}
                    <Box sx={{ mt: 1, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                      <Typography variant="caption" color="text.secondary">Created: {formatDate(job.createdAt)}</Typography>
                      {job.crewScheduledDate && (
                        <Typography variant="caption" color="primary.main">Scheduled: {formatDate(job.crewScheduledDate)}</Typography>
                      )}
                      {job.dueDate && (
                        <Typography variant="caption" color={new Date(job.dueDate) < new Date() ? 'error.main' : 'text.secondary'}>Due: {formatDate(job.dueDate)}</Typography>
                      )}
                    </Box>

                    {/* Dependencies Preview */}
                    {job.dependencies?.length > 0 && (
                      <Box sx={{ mt: 1, display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                        {job.dependencies.slice(0, 3).map((dep) => (
                          <Chip key={`${dep.type}-${dep.status}`} size="small" label={getDependencyTypeLabel(dep.type)} color={getDependencyStatusColor(dep.status)} variant="outlined" sx={getDependencyChipSx(dep.status)} />
                        ))}
                        {job.dependencies.length > 3 && <Chip size="small" label={`+${job.dependencies.length - 3}`} variant="outlined" sx={{ fontSize: '0.65rem', height: 20 }} />}
                      </Box>
                    )}

                    {/* AI Extraction Status */}
                    {job.aiExtractionStarted && !job.aiExtractionComplete && (
                      <Box sx={{ mt: 1 }}>
                        <Typography variant="caption" color="primary">Extracting assets...</Typography>
                        <LinearProgress sx={{ mt: 0.5, borderRadius: 1 }} />
                      </Box>
                    )}
                  </CardContent>

                  <Divider />

                  <CardActions sx={{ justifyContent: 'space-between', px: 2 }} onClick={(e) => e.preventDefault()}>
                    <Tooltip title="Flip card for details">
                      <IconButton size="small" onClick={(e) => { e.preventDefault(); onCardFlip(job._id); }} color="primary"><FlipIcon /></IconButton>
                    </Tooltip>
                    {userRole === 'foreman' || userRole === 'crew' ? (
                      <Button size="small" component={Link} to={`/jobs/${job._id}/closeout`} color="success">Close Out</Button>
                    ) : (
                      <Button size="small" component={Link} to={`/jobs/${job._id}/files`}>Files</Button>
                    )}
                    <Button size="small" component={Link} to={`/jobs/${job._id}/details`}>Details</Button>
                    <IconButton size="small" onClick={(e) => { e.preventDefault(); onJobMenuOpen(e, job._id); }}><MoreVertIcon /></IconButton>
                  </CardActions>
                </Card>
              )}

              {/* BACK SIDE */}
              {isFlipped && (
                <Card sx={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', borderRadius: 2, boxShadow: 2, display: 'flex', flexDirection: 'column', bgcolor: 'background.paper' }}>
                  <CardContent sx={{ flexGrow: 1, overflow: 'auto', py: 1 }}>
                    <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
                      <Typography variant="subtitle2" fontWeight="bold" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '70%' }}>
                        {job.pmNumber || job.woNumber || job.title}
                      </Typography>
                      <Chip label={getStatusLabel(job.status)} color={getStatusColor(job.status)} size="small" sx={{ height: 20, fontSize: '0.65rem' }} />
                    </Box>

                    {needsPreField(job.status) ? (
                      <Box>
                        <Typography variant="caption" color="primary" fontWeight="bold" display="flex" alignItems="center" gap={0.5} mb={1}>
                          <ConstructionIcon fontSize="small" /> Pre-Field Checklist
                        </Typography>
                        <Box sx={{ maxHeight: 300, overflow: 'auto' }}>
                          {preFieldItems.map((item) => {
                            const isChecked = preFieldChecklist[job._id]?.[item.key]?.checked || false;
                            const notes = preFieldChecklist[job._id]?.[item.key]?.notes || '';
                            return (
                              <Box key={item.key} sx={{ mb: 0.5 }}>
                                <FormControlLabel
                                  control={<Checkbox size="small" checked={isChecked} onChange={(e) => onPreFieldCheck(job._id, item.key, e.target.checked)} sx={{ py: 0 }} />}
                                  label={<Typography variant="caption" fontWeight={isChecked ? 'bold' : 'normal'}>{item.label}</Typography>}
                                  sx={{ m: 0, height: 24 }}
                                />
                                <Collapse in={isChecked}>
                                  <TextField
                                    id={`prefield-notes-main-${job._id}-${item.key}`}
                                    name={`prefield-notes-main-${item.key}`}
                                    size="small"
                                    placeholder={`Details for ${item.label}...`}
                                    value={notes}
                                    onChange={(e) => onPreFieldNotes(job._id, item.key, e.target.value)}
                                    multiline rows={2} fullWidth
                                    sx={{ ml: 3, mb: 1, '& .MuiInputBase-input': { fontSize: '0.75rem', py: 0.5 } }}
                                  />
                                </Collapse>
                              </Box>
                            );
                          })}
                        </Box>
                      </Box>
                    ) : (
                      <>
                        <Paper variant="outlined" sx={{ p: 1, mb: 1, bgcolor: 'action.hover' }}>
                          <Typography variant="caption" color="text.secondary" fontWeight="bold" display="flex" alignItems="center" gap={0.5}>
                            <CalendarIcon fontSize="small" /> Schedule
                          </Typography>
                          <Box sx={{ mt: 0.5, pl: 2 }}>
                            {details.crewScheduledDate ? (
                              <Typography variant="caption" display="block">Scheduled: {formatDate(details.crewScheduledDate)}</Typography>
                            ) : (
                              <Typography variant="caption" color="text.secondary" display="block">Not scheduled</Typography>
                            )}
                            {details.assignedTo && (
                              <Typography variant="caption" display="block">Crew: {details.assignedTo.name || details.assignedTo.email || 'Assigned'}</Typography>
                            )}
                          </Box>
                        </Paper>

                        <Paper variant="outlined" sx={{ p: 1, mb: 1 }}>
                          <Typography variant="caption" color="text.secondary" fontWeight="bold" display="flex" alignItems="center" gap={0.5}>
                            <BuildIcon fontSize="small" /> Dependencies ({details.dependencies?.length || 0})
                          </Typography>
                          <Box sx={{ mt: 0.5, maxHeight: 80, overflow: 'auto' }}>
                            {details.dependencies?.length > 0 ? details.dependencies.map((dep, i) => (
                              <Box key={dep._id || i} display="flex" alignItems="center" gap={0.5} mb={0.5} flexWrap="wrap">
                                <Chip size="small" label={getDependencyTypeLabel(dep.type)} variant="outlined" sx={{ fontSize: '0.6rem', height: 18 }} />
                                <Tooltip title="Click to change status" arrow>
                                  <Chip
                                    size="small"
                                    label={getDependencyStatusLabel(dep.status)}
                                    color={getDependencyStatusColor(dep.status)}
                                    onClick={(e) => onDependencyStatusClick(job._id, dep._id, dep.status, e)}
                                    sx={{ fontSize: '0.55rem', height: 16, fontWeight: 'bold', cursor: 'pointer', '&:hover': { opacity: 0.8 } }}
                                  />
                                </Tooltip>
                              </Box>
                            )) : (
                              <Typography variant="caption" color="text.secondary">No dependencies tracked</Typography>
                            )}
                          </Box>
                        </Paper>

                        <Paper variant="outlined" sx={{ p: 1 }}>
                          <Typography variant="caption" color="text.secondary" fontWeight="bold" display="flex" alignItems="center" gap={0.5}>
                            <ChatIcon fontSize="small" /> Notes ({details.notes?.length || 0})
                          </Typography>
                          <Box sx={{ mt: 0.5, maxHeight: 50, overflow: 'auto' }}>
                            {details.notes?.length > 0 ? details.notes.slice(-2).map((note) => (
                              <Typography key={note._id || note.createdAt} variant="caption" display="block" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                <strong>{note.userName || 'User'}:</strong> {note.message}
                              </Typography>
                            )) : (
                              <Typography variant="caption" color="text.secondary">No notes yet</Typography>
                            )}
                          </Box>
                        </Paper>
                      </>
                    )}
                  </CardContent>

                  <Divider />

                  <CardActions sx={{ justifyContent: 'space-between', px: 2 }}>
                    <Tooltip title="Flip back">
                      <IconButton size="small" onClick={(e) => { e.stopPropagation(); onCardFlip(job._id); }} color="primary"><FlipIcon /></IconButton>
                    </Tooltip>
                    {needsPreField(job.status) ? (
                      <Button size="small" variant="contained" color="primary" onClick={() => onSavePreField(job._id)} sx={{ borderRadius: 1, fontSize: '0.7rem' }}>Save Pre-Field</Button>
                    ) : (
                      <Button size="small" component={Link} to={`/jobs/${job._id}/details`} sx={{ borderRadius: 1 }}>Full Details</Button>
                    )}
                    <IconButton size="small" onClick={(e) => onJobMenuOpen(e, job._id)}><MoreVertIcon /></IconButton>
                  </CardActions>
                </Card>
              )}
            </Box>
          </Grid>
        );
      })}
    </Grid>
  );
};

DashboardJobList.propTypes = {
  jobs: PropTypes.array.isRequired,
  flippedCards: PropTypes.object.isRequired,
  jobDetails: PropTypes.object.isRequired,
  preFieldChecklist: PropTypes.object.isRequired,
  userRole: PropTypes.string,
  onCardFlip: PropTypes.func.isRequired,
  onJobMenuOpen: PropTypes.func.isRequired,
  onPreFieldCheck: PropTypes.func.isRequired,
  onPreFieldNotes: PropTypes.func.isRequired,
  onSavePreField: PropTypes.func.isRequired,
  onDependencyStatusClick: PropTypes.func.isRequired,
  onCreateWorkOrder: PropTypes.func.isRequired,
  search: PropTypes.string,
  filter: PropTypes.string,
};

export default DashboardJobList;
