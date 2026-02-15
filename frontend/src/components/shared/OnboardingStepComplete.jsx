/** Copyright (c) 2024-2026 FieldLedger. All Rights Reserved. */

import React from 'react';
import PropTypes from 'prop-types';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Box, Paper, Typography, TextField, Button, IconButton, Alert
} from '@mui/material';
import FolderIcon from '@mui/icons-material/Folder';
import DeleteIcon from '@mui/icons-material/Delete';
import CreateNewFolderIcon from '@mui/icons-material/CreateNewFolder';

/**
 * Dialog for managing the folder template structure of a company.
 *
 * @param {Object} props
 * @param {boolean}  props.open
 * @param {Function} props.onClose
 * @param {Object|null} props.company
 * @param {Array}    props.folderTemplate
 * @param {Function} props.onTemplateChange - (newTemplate) => void
 * @param {Function} props.onSave
 * @param {string}   props.textPrimary
 * @param {string}   props.textSecondary
 * @param {string}   props.borderColor
 * @param {string}   props.mode            - 'dark' | 'light'
 */
const OnboardingStepComplete = ({
  open, onClose, company,
  folderTemplate, onTemplateChange, onSave,
  textPrimary, textSecondary, borderColor, mode
}) => {
  const [newFolderName, setNewFolderName] = React.useState('');
  const [newSubfolderName, setNewSubfolderName] = React.useState('');
  const [selectedFolderIndex, setSelectedFolderIndex] = React.useState(null);

  const addParentFolder = () => {
    if (!newFolderName.trim()) return;
    onTemplateChange([...folderTemplate, { name: newFolderName.trim(), subfolders: [] }]);
    setNewFolderName('');
  };

  const addSubfolder = (folderIndex) => {
    if (!newSubfolderName.trim()) return;
    const updated = [...folderTemplate];
    if (!updated[folderIndex].subfolders) updated[folderIndex].subfolders = [];
    updated[folderIndex].subfolders.push({ name: newSubfolderName.trim(), subfolders: [] });
    onTemplateChange(updated);
    setNewSubfolderName('');
  };

  const removeFolder = (folderIndex) => {
    onTemplateChange(folderTemplate.filter((_, i) => i !== folderIndex));
    setSelectedFolderIndex(null);
  };

  const removeSubfolder = (folderIndex, subfolderIndex) => {
    const updated = [...folderTemplate];
    updated[folderIndex].subfolders = updated[folderIndex].subfolders.filter((_, i) => i !== subfolderIndex);
    onTemplateChange(updated);
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 1 }}>
        <FolderIcon sx={{ color: '#f59e0b' }} />
        Folder Structure for {company?.name}
      </DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, mt: 1 }}>
          <Alert severity="info">
            Define the folder structure for new jobs created by this company. Each job will automatically have these folders.
          </Alert>

          {/* Add Parent Folder */}
          <Paper sx={{ p: 2, bgcolor: mode === 'dark' ? '#1e1e2e' : '#f8fafc' }}>
            <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600, color: textPrimary }}>Add Parent Folder</Typography>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <TextField size="small" value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)} placeholder="e.g., Fuse Electric, Job Documents" fullWidth onKeyDown={(e) => e.key === 'Enter' && addParentFolder()} autoComplete="off" />
              <Button variant="contained" startIcon={<CreateNewFolderIcon />} onClick={addParentFolder} sx={{ bgcolor: '#22c55e', '&:hover': { bgcolor: '#16a34a' }, whiteSpace: 'nowrap' }}>Add Folder</Button>
            </Box>
          </Paper>

          {/* Folder List */}
          {folderTemplate.length === 0 ? (
            <Box sx={{ textAlign: 'center', py: 4, color: textSecondary }}>
              <FolderIcon sx={{ fontSize: 48, mb: 1, opacity: 0.5 }} />
              <Typography>No folders yet. Add a parent folder above.</Typography>
              <Typography variant="caption">If left empty, the default folder structure (ACI, UCS, UTCS) will be used.</Typography>
            </Box>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {folderTemplate.map((folder, folderIndex) => (
                <Paper key={folder.name || `folder-${folderIndex}`} sx={{ p: 2, border: `1px solid ${selectedFolderIndex === folderIndex ? '#6366f1' : borderColor}`, borderRadius: 2 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <FolderIcon sx={{ color: '#f59e0b' }} />
                      <Typography variant="h6" sx={{ fontWeight: 600, color: textPrimary }}>{folder.name}</Typography>
                    </Box>
                    <IconButton size="small" onClick={() => removeFolder(folderIndex)} sx={{ color: '#ef4444' }} aria-label="Remove folder"><DeleteIcon fontSize="small" /></IconButton>
                  </Box>

                  <Box sx={{ pl: 4 }}>
                    {folder.subfolders && folder.subfolders.length > 0 && (
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mb: 2 }}>
                        {folder.subfolders.map((subfolder) => (
                          <Box key={subfolder.name} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', bgcolor: mode === 'dark' ? '#252538' : '#f1f5f9', px: 2, py: 1, borderRadius: 1 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <FolderIcon sx={{ fontSize: 18, color: textSecondary }} />
                              <Typography variant="body2" sx={{ color: textPrimary }}>{subfolder.name}</Typography>
                            </Box>
                            <IconButton size="small" onClick={() => removeSubfolder(folderIndex, folder.subfolders.indexOf(subfolder))} sx={{ color: '#ef4444' }} aria-label="Remove subfolder"><DeleteIcon fontSize="small" /></IconButton>
                          </Box>
                        ))}
                      </Box>
                    )}

                    <Box sx={{ display: 'flex', gap: 1 }}>
                      <TextField
                        size="small"
                        value={selectedFolderIndex === folderIndex ? newSubfolderName : ''}
                        onChange={(e) => { setSelectedFolderIndex(folderIndex); setNewSubfolderName(e.target.value); }}
                        onFocus={() => setSelectedFolderIndex(folderIndex)}
                        placeholder="Add subfolder..."
                        sx={{ flex: 1 }}
                        onKeyDown={(e) => { if (e.key === 'Enter' && selectedFolderIndex === folderIndex) addSubfolder(folderIndex); }}
                      />
                      <Button size="small" variant="outlined" onClick={() => { setSelectedFolderIndex(folderIndex); addSubfolder(folderIndex); }} disabled={selectedFolderIndex !== folderIndex || !newSubfolderName.trim()}>Add</Button>
                    </Box>
                  </Box>
                </Paper>
              ))}
            </Box>
          )}
        </Box>
      </DialogContent>
      <DialogActions sx={{ p: 3 }}>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={onSave} sx={{ bgcolor: '#f59e0b', '&:hover': { bgcolor: '#d97706' } }}>Save Folder Structure</Button>
      </DialogActions>
    </Dialog>
  );
};

OnboardingStepComplete.propTypes = {
  open: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  company: PropTypes.shape({ name: PropTypes.string }),
  folderTemplate: PropTypes.arrayOf(PropTypes.shape({
    name: PropTypes.string,
    subfolders: PropTypes.array
  })).isRequired,
  onTemplateChange: PropTypes.func.isRequired,
  onSave: PropTypes.func.isRequired,
  textPrimary: PropTypes.string,
  textSecondary: PropTypes.string,
  borderColor: PropTypes.string,
  mode: PropTypes.string
};

export default OnboardingStepComplete;
