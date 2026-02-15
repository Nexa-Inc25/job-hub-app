/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
/**
 * FileActions - Context menu, approval actions, and folder CRUD dialogs.
 *
 * @module components/jobfiles/FileActions
 */

import React from 'react';
import PropTypes from 'prop-types';
import {
  Box,
  Button,
  TextField,
  Menu,
  MenuItem,
  Divider,
  IconButton,
  Tooltip,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Switch,
  FormControlLabel,
  Autocomplete,
  Chip,
} from '@mui/material';
import VisibilityIcon from '@mui/icons-material/Visibility';
import DownloadIcon from '@mui/icons-material/Download';
import DeleteIcon from '@mui/icons-material/Delete';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import { red } from '@mui/material/colors';

/**
 * ApprovalStatusChip - renders a colored chip for document approval status.
 */
const ApprovalStatusChip = ({ status }) => {
  if (!status || status === 'draft') return null;
  const map = {
    pending_approval: { label: 'Pending Approval', color: 'warning' },
    approved: { label: 'Approved', color: 'success' },
    rejected: { label: 'Rejected', color: 'error' },
  };
  const config = map[status];
  if (!config) return null;
  return <Chip label={config.label} color={config.color} size="small" variant="outlined" sx={{ height: 20, fontSize: '0.65rem' }} />;
};

ApprovalStatusChip.propTypes = { status: PropTypes.string };

/**
 * Document context menu (right-click or more-options).
 */
const DocumentContextMenu = ({ anchorEl, onClose, onPreview, onDownload, onDelete }) => (
  <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={onClose} slotProps={{ paper: { style: { width: 200 } } }}>
    <MenuItem onClick={onPreview}><VisibilityIcon sx={{ mr: 1 }} /> Open / Edit</MenuItem>
    <MenuItem onClick={onDownload}><DownloadIcon sx={{ mr: 1 }} /> Download</MenuItem>
    <Divider />
    <MenuItem onClick={onDelete} sx={{ color: red[500] }}><DeleteIcon sx={{ mr: 1 }} /> Delete</MenuItem>
  </Menu>
);

DocumentContextMenu.propTypes = {
  anchorEl: PropTypes.object,
  onClose: PropTypes.func.isRequired,
  onPreview: PropTypes.func.isRequired,
  onDownload: PropTypes.func.isRequired,
  onDelete: PropTypes.func.isRequired,
};

/**
 * Approval action buttons for documents with pending_approval status.
 */
const ApprovalButtons = ({ doc, canApprove, approvalLoading, onApprove, onReject }) => {
  if (doc.approvalStatus !== 'pending_approval' || !canApprove) return null;
  return (
    <>
      <Tooltip title="Approve document">
        <IconButton size="small" color="success" onClick={(e) => { e.stopPropagation(); onApprove(doc); }} disabled={approvalLoading === doc._id} aria-label="Approve document">
          {approvalLoading === doc._id ? <CircularProgress size={16} /> : <CheckCircleIcon fontSize="small" />}
        </IconButton>
      </Tooltip>
      <Tooltip title="Reject document">
        <IconButton size="small" color="error" onClick={(e) => { e.stopPropagation(); onReject(doc); }} disabled={approvalLoading === doc._id} aria-label="Reject document">
          <CancelIcon fontSize="small" />
        </IconButton>
      </Tooltip>
    </>
  );
};

ApprovalButtons.propTypes = {
  doc: PropTypes.object.isRequired,
  canApprove: PropTypes.bool.isRequired,
  approvalLoading: PropTypes.string,
  onApprove: PropTypes.func.isRequired,
  onReject: PropTypes.func.isRequired,
};

/**
 * Create Folder Dialog.
 */
const CreateFolderDialog = ({
  open,
  onClose,
  folderName,
  onFolderNameChange,
  isSubfolder,
  onIsSubfolderChange,
  parentFolder,
  onParentFolderChange,
  folderOptions,
  onSubmit,
}) => (
  <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
    <DialogTitle>Create New Folder</DialogTitle>
    <DialogContent>
      <Box sx={{ pt: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <TextField
          id="new-folder-name"
          fullWidth
          label="Folder Name"
          value={folderName}
          onChange={(e) => onFolderNameChange(e.target.value)}
          placeholder="e.g., Safety Documents"
        />
        <FormControlLabel
          control={<Switch checked={isSubfolder} onChange={(e) => onIsSubfolderChange(e.target.checked)} />}
          label="Create as subfolder"
        />
        {isSubfolder && (
          <Autocomplete
            options={folderOptions}
            value={parentFolder}
            onChange={(e, val) => onParentFolderChange(val || '')}
            renderInput={(params) => (
              <TextField {...params} id="parent-folder-select" label="Parent Folder" placeholder="Select parent folder" />
            )}
          />
        )}
      </Box>
    </DialogContent>
    <DialogActions>
      <Button onClick={onClose}>Cancel</Button>
      <Button variant="contained" onClick={onSubmit} disabled={!folderName.trim() || (isSubfolder && !parentFolder)}>
        Create Folder
      </Button>
    </DialogActions>
  </Dialog>
);

CreateFolderDialog.propTypes = {
  open: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  folderName: PropTypes.string.isRequired,
  onFolderNameChange: PropTypes.func.isRequired,
  isSubfolder: PropTypes.bool.isRequired,
  onIsSubfolderChange: PropTypes.func.isRequired,
  parentFolder: PropTypes.string.isRequired,
  onParentFolderChange: PropTypes.func.isRequired,
  folderOptions: PropTypes.array.isRequired,
  onSubmit: PropTypes.func.isRequired,
};

export { ApprovalStatusChip, DocumentContextMenu, ApprovalButtons, CreateFolderDialog };
export default DocumentContextMenu;
