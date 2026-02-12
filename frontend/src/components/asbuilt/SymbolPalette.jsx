/**
 * FieldLedger - Symbol Palette for Construction Sketch Markup
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * 
 * Displays utility-specific electrical symbols (loaded from UtilityAsBuiltConfig).
 * PG&E uses TD-9213S; other utilities will have their own symbol sets.
 * The palette is config-driven — no hardcoded symbols.
 */

import React, { useState, useMemo } from 'react';
import PropTypes from 'prop-types';
import {
  Box, Typography, IconButton, Tooltip, Tabs, Tab, Paper, Chip,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';

/**
 * Render a single SVG symbol from its path data
 */
const SymbolIcon = ({ svgPath, width = 32, height = 32, color = '#000', size = 28 }) => (
  <svg
    width={size}
    height={size}
    viewBox={`0 0 ${width} ${height}`}
    fill="none"
    stroke={color}
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d={svgPath} />
  </svg>
);

SymbolIcon.propTypes = {
  svgPath: PropTypes.string.isRequired,
  width: PropTypes.number,
  height: PropTypes.number,
  color: PropTypes.string,
  size: PropTypes.number,
};

/**
 * Symbol Palette Component
 * 
 * @param {Object} props
 * @param {Array} props.symbols - Symbol definitions from UtilityAsBuiltConfig
 * @param {string} props.activeColor - Current markup color hex (e.g., '#CC0000')
 * @param {string} props.activeColorName - Current color name ('red', 'blue', 'black')
 * @param {Function} props.onSelectSymbol - Callback when a symbol is tapped
 * @param {string|null} props.selectedSymbol - Currently selected symbol code
 * @param {Function} props.onClose - Close the palette
 */
const SymbolPalette = ({
  symbols = [],
  activeColor = '#000000',
  activeColorName = 'black',
  onSelectSymbol,
  selectedSymbol = null,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState(0);

  // Group symbols by category
  const categories = useMemo(() => {
    const catMap = new Map();
    for (const sym of symbols) {
      if (!catMap.has(sym.category)) {
        catMap.set(sym.category, []);
      }
      catMap.get(sym.category).push(sym);
    }
    return Array.from(catMap.entries()).map(([name, items]) => ({
      name,
      label: name.charAt(0).toUpperCase() + name.slice(1),
      items: items.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0)),
    }));
  }, [symbols]);

  // Filter symbols that are allowed in the current color
  const filteredItems = useMemo(() => {
    if (!categories[activeTab]) return [];
    return categories[activeTab].items.filter(sym => {
      if (!sym.allowedColors || sym.allowedColors.length === 0) return true;
      return sym.allowedColors.includes(activeColorName);
    });
  }, [categories, activeTab, activeColorName]);

  if (categories.length === 0) {
    return (
      <Paper sx={{ p: 2, textAlign: 'center' }}>
        <Typography variant="body2" color="text.secondary">
          No symbols loaded. Check utility configuration.
        </Typography>
      </Paper>
    );
  }

  return (
    <Paper
      elevation={3}
      sx={{
        width: 280,
        maxHeight: 400,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        borderRadius: 2,
      }}
    >
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', px: 1.5, py: 1, borderBottom: 1, borderColor: 'divider' }}>
        <Typography variant="subtitle2" sx={{ flexGrow: 1, fontWeight: 600 }}>
          Symbols
        </Typography>
        <Chip
          label={activeColorName.toUpperCase()}
          size="small"
          sx={{
            bgcolor: activeColor,
            color: activeColorName === 'black' ? '#fff' : '#fff',
            fontWeight: 700,
            fontSize: '0.65rem',
            height: 20,
            mr: 1,
          }}
        />
        {onClose && (
          <IconButton size="small" onClick={onClose} aria-label="Close palette">
            <CloseIcon fontSize="small" />
          </IconButton>
        )}
      </Box>

      {/* Category Tabs */}
      <Tabs
        value={activeTab}
        onChange={(_, v) => setActiveTab(v)}
        variant="scrollable"
        scrollButtons="auto"
        sx={{
          minHeight: 36,
          borderBottom: 1,
          borderColor: 'divider',
          '& .MuiTab-root': { minHeight: 36, py: 0.5, px: 1, fontSize: '0.7rem', textTransform: 'capitalize' },
        }}
      >
        {categories.map((cat) => (
          <Tab key={cat.name} label={cat.label} />
        ))}
      </Tabs>

      {/* Symbol Grid */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 0.5,
          p: 1,
          overflowY: 'auto',
          flexGrow: 1,
        }}
      >
        {filteredItems.map((sym) => (
          <Tooltip key={sym.code} title={sym.label} placement="top" arrow>
            <IconButton
              onClick={() => onSelectSymbol(sym)}
              sx={{
                width: 56,
                height: 56,
                border: selectedSymbol === sym.code ? '2px solid' : '1px solid',
                borderColor: selectedSymbol === sym.code ? 'primary.main' : 'grey.300',
                borderRadius: 1.5,
                bgcolor: selectedSymbol === sym.code ? 'primary.light' : 'background.paper',
                '&:hover': { bgcolor: 'action.hover', borderColor: 'primary.light' },
                display: 'flex',
                flexDirection: 'column',
                gap: 0,
              }}
              aria-label={sym.label}
            >
              <SymbolIcon
                svgPath={sym.svgPath}
                width={sym.width}
                height={sym.height}
                color={activeColor}
                size={28}
              />
              <Typography
                variant="caption"
                sx={{ fontSize: '0.5rem', lineHeight: 1, mt: 0.25, color: 'text.secondary' }}
                noWrap
              >
                {sym.label}
              </Typography>
            </IconButton>
          </Tooltip>
        ))}

        {filteredItems.length === 0 && (
          <Box sx={{ gridColumn: '1 / -1', py: 2, textAlign: 'center' }}>
            <Typography variant="caption" color="text.secondary">
              No symbols available in {activeColorName} mode
            </Typography>
          </Box>
        )}
      </Box>
    </Paper>
  );
};

SymbolPalette.propTypes = {
  symbols: PropTypes.arrayOf(PropTypes.shape({
    code: PropTypes.string.isRequired,
    label: PropTypes.string.isRequired,
    category: PropTypes.string.isRequired,
    svgPath: PropTypes.string.isRequired,
    width: PropTypes.number,
    height: PropTypes.number,
    allowedColors: PropTypes.arrayOf(PropTypes.string),
    sortOrder: PropTypes.number,
  })),
  activeColor: PropTypes.string,
  activeColorName: PropTypes.string,
  onSelectSymbol: PropTypes.func.isRequired,
  selectedSymbol: PropTypes.string,
  onClose: PropTypes.func,
};

export { SymbolIcon };
export default SymbolPalette;

