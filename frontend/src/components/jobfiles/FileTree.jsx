/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
/**
 * FileTree - Folder tree navigation panel for the Job File System.
 *
 * Renders the left sidebar with a searchable SimpleTreeView showing
 * the full folder/subfolder hierarchy.
 *
 * @module components/jobfiles/FileTree
 */

import React from 'react';
import PropTypes from 'prop-types';
import {
  Box,
  Typography,
  TextField,
  Paper,
  Chip,
  IconButton,
} from '@mui/material';
import FolderIcon from '@mui/icons-material/Folder';
import SearchIcon from '@mui/icons-material/Search';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import DeleteIcon from '@mui/icons-material/Delete';
import { SimpleTreeView } from '@mui/x-tree-view/SimpleTreeView';
import { TreeItem } from '@mui/x-tree-view/TreeItem';

const FileTree = ({
  job,
  searchQuery,
  onSearchChange,
  onFolderSelect,
  isAdmin,
  onDeleteFolder,
}) => {
  const renderNestedSubfolder = (nestedSubfolder, subfolder, folder) => (
    <TreeItem
      key={`${folder.name}-${subfolder.name}-${nestedSubfolder.name}`}
      itemId={`${folder.name}-${subfolder.name}-${nestedSubfolder.name}`}
      label={
        <Box sx={{ display: 'flex', alignItems: 'center', width: '100%' }}>
          <FolderIcon sx={{ mr: 1, fontSize: '0.875rem', color: 'secondary.main' }} />
          <Typography sx={{ flexGrow: 1, fontSize: '0.8rem' }}>{nestedSubfolder.name}</Typography>
          <Chip label={nestedSubfolder.documents?.length || 0} size="small" color="secondary" sx={{ height: 16, fontSize: '0.65rem' }} />
        </Box>
      }
      onClick={(e) => {
        e.stopPropagation();
        onFolderSelect({ ...nestedSubfolder, parentFolder: subfolder.name, grandParentFolder: folder.name });
      }}
    />
  );

  const renderSubfolder = (subfolder, folder) => (
    <TreeItem
      key={`${folder.name}-${subfolder.name}`}
      itemId={`${folder.name}-${subfolder.name}`}
      label={
        <Box sx={{ display: 'flex', alignItems: 'center', width: '100%' }}>
          <FolderIcon sx={{ mr: 1, fontSize: '1rem' }} />
          <Typography sx={{ flexGrow: 1, fontSize: '0.875rem' }}>{subfolder.name}</Typography>
          <Chip
            label={(subfolder.documents?.length || 0) + (subfolder.subfolders?.length || 0)}
            size="small"
            sx={{ mr: 1, height: 18, fontSize: '0.7rem' }}
          />
          {isAdmin && (
            <IconButton
              size="small"
              onClick={(e) => { e.stopPropagation(); onDeleteFolder(subfolder.name, folder.name); }}
              sx={{ p: 1, minWidth: 44, minHeight: 44, color: 'error.main' }}
              aria-label="Delete subfolder"
            >
              <DeleteIcon fontSize="small" />
            </IconButton>
          )}
        </Box>
      }
      onClick={(e) => { e.stopPropagation(); onFolderSelect({ ...subfolder, parentFolder: folder.name }); }}
    >
      {subfolder.subfolders?.map((nested) => renderNestedSubfolder(nested, subfolder, folder))}
    </TreeItem>
  );

  return (
    <Paper sx={{ width: 300, p: 2, overflowY: 'auto' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
        <SearchIcon sx={{ mr: 1 }} />
        <TextField
          id="search-folders-files"
          fullWidth
          size="small"
          placeholder="Search folders/files..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
        />
      </Box>
      <SimpleTreeView
        slots={{ collapseIcon: ExpandMoreIcon, expandIcon: ChevronRightIcon }}
        defaultExpandedItems={['root', ...job.folders.map((f) => f.name)]}
      >
        <TreeItem
          itemId="root"
          label={
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <FolderIcon sx={{ mr: 1, color: 'primary.main' }} />
              <Typography variant="subtitle1" fontWeight="bold">
                {job.pmNumber || job.woNumber || 'Work Order'}
              </Typography>
            </Box>
          }
        >
          {job.folders
            .filter(
              (folder) =>
                folder.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                folder.subfolders?.some((sf) => sf.name.toLowerCase().includes(searchQuery.toLowerCase()))
            )
            .map((folder) => (
              <TreeItem
                key={folder.name}
                itemId={folder.name}
                label={
                  <Box sx={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                    <FolderIcon sx={{ mr: 1, color: folder.name === 'ACI' ? 'success.main' : 'warning.main' }} />
                    <Typography sx={{ flexGrow: 1 }}>{folder.name}</Typography>
                    <Chip
                      label={
                        folder.documents?.length +
                        (folder.subfolders?.reduce((acc, sf) => acc + (sf.documents?.length || 0), 0) || 0)
                      }
                      size="small"
                      sx={{ mr: 1 }}
                    />
                    {isAdmin && folder.name !== 'ACI' && folder.name !== 'UTC' && (
                      <IconButton
                        size="small"
                        onClick={(e) => { e.stopPropagation(); onDeleteFolder(folder.name); }}
                        sx={{ p: 0.5, color: 'error.main' }}
                        aria-label="Delete folder"
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    )}
                  </Box>
                }
                onClick={() => onFolderSelect({ ...folder, isParent: true })}
              >
                {folder.subfolders?.map((subfolder) => renderSubfolder(subfolder, folder))}
              </TreeItem>
            ))}
        </TreeItem>
      </SimpleTreeView>
    </Paper>
  );
};

FileTree.propTypes = {
  job: PropTypes.object.isRequired,
  searchQuery: PropTypes.string.isRequired,
  onSearchChange: PropTypes.func.isRequired,
  onFolderSelect: PropTypes.func.isRequired,
  isAdmin: PropTypes.bool.isRequired,
  onDeleteFolder: PropTypes.func.isRequired,
};

export default FileTree;
