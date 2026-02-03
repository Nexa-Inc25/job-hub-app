/**
 * Price Book Item Selector
 * 
 * Mobile-optimized rate item selector for field workers.
 * Features:
 * - Search by item code or description
 * - Category filtering
 * - Recently used items
 * - Offline-capable with cached price book
 * 
 * @module components/billing/PriceBookSelector
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import PropTypes from 'prop-types';
import {
  Box,
  Typography,
  TextField,
  IconButton,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  InputAdornment,
  Divider,
  Alert,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import CloseIcon from '@mui/icons-material/Close';
import HistoryIcon from '@mui/icons-material/History';
import SelectIcon from '@mui/icons-material/ArrowForward';
import OfflineIcon from '@mui/icons-material/CloudOff';
import { useOffline } from '../../hooks/useOffline';
import offlineStorage from '../../utils/offlineStorage';
import api from '../../api';

// Colors matching UnitEntryForm
const COLORS = {
  bg: '#0a0a0f',
  surface: '#16161f',
  surfaceLight: '#1e1e2a',
  primary: '#00e676',
  primaryDark: '#00c853',
  error: '#ff5252',
  warning: '#ffab00',
  text: '#ffffff',
  textSecondary: '#9e9e9e',
  border: '#333344',
};

// Category colors
const CATEGORY_COLORS = {
  civil: '#64b5f6',
  electrical: '#ffab00',
  overhead: '#ff8a65',
  underground: '#81c784',
  traffic_control: '#ba68c8',
  vegetation: '#4db6ac',
  emergency: '#ef5350',
  other: '#90a4ae',
};

// Category labels
const CATEGORIES = [
  { value: 'all', label: 'All' },
  { value: 'electrical', label: 'Electrical' },
  { value: 'civil', label: 'Civil' },
  { value: 'overhead', label: 'Overhead' },
  { value: 'underground', label: 'Underground' },
  { value: 'traffic_control', label: 'Traffic' },
  { value: 'vegetation', label: 'Veg' },
  { value: 'emergency', label: 'Emergency' },
  { value: 'other', label: 'Other' },
];

/**
 * Rate Item Card
 */
const RateItemCard = ({ item, onSelect, isRecent }) => {
  const categoryColor = CATEGORY_COLORS[item.category] || CATEGORY_COLORS.other;
  
  return (
    <Card 
      onClick={() => onSelect(item)}
      sx={{ 
        bgcolor: COLORS.surface, 
        border: `1px solid ${COLORS.border}`,
        cursor: 'pointer',
        transition: 'all 0.15s ease',
        '&:hover': { 
          bgcolor: COLORS.surfaceLight,
          borderColor: COLORS.primary,
        },
        '&:active': {
          transform: 'scale(0.98)',
        },
      }}
    >
      <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <Box sx={{ flex: 1, mr: 2 }}>
            {/* Item Code */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
              <Typography sx={{ 
                color: COLORS.primary, 
                fontWeight: 700, 
                fontSize: '1rem',
                fontFamily: 'monospace',
              }}>
                {item.itemCode}
              </Typography>
              {isRecent && (
                <HistoryIcon sx={{ fontSize: 16, color: COLORS.textSecondary }} />
              )}
            </Box>
            
            {/* Description */}
            <Typography sx={{ 
              color: COLORS.text, 
              fontSize: '0.9rem',
              lineHeight: 1.3,
              mb: 1,
            }}>
              {item.description}
            </Typography>
            
            {/* Category chip */}
            <Chip
              label={item.category?.replace('_', ' ').toUpperCase()}
              size="small"
              sx={{
                bgcolor: `${categoryColor}20`,
                color: categoryColor,
                fontWeight: 600,
                fontSize: '0.7rem',
                height: 22,
              }}
            />
          </Box>
          
          {/* Price & select */}
          <Box sx={{ textAlign: 'right' }}>
            <Typography sx={{ 
              color: COLORS.text, 
              fontWeight: 700, 
              fontSize: '1.25rem',
              lineHeight: 1,
            }}>
              ${item.unitPrice?.toFixed(2)}
            </Typography>
            <Typography sx={{ 
              color: COLORS.textSecondary, 
              fontSize: '0.75rem',
              textTransform: 'uppercase',
            }}>
              per {item.unit}
            </Typography>
            <SelectIcon sx={{ color: COLORS.primary, mt: 1 }} />
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
};

RateItemCard.propTypes = {
  item: PropTypes.object.isRequired,
  onSelect: PropTypes.func.isRequired,
  isRecent: PropTypes.bool,
};

/**
 * Main Price Book Selector Component
 */
const PriceBookSelector = ({ 
  utilityId,
  onSelect,
  onClose,
}) => {
  // State
  const [priceBook, setPriceBook] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [recentItems, setRecentItems] = useState([]);
  const [isOfflineData, setIsOfflineData] = useState(false);
  
  const { isOnline } = useOffline();

  // Load price book
  useEffect(() => {
    const loadPriceBook = async () => {
      setLoading(true);
      setError(null);
      
      try {
        if (isOnline) {
          // Fetch from API
          const response = await api.get('/api/pricebooks/active', {
            params: { utilityId }
          });
          setPriceBook(response.data);
          setIsOfflineData(false);
          
          // Cache for offline use
          await offlineStorage.cachePriceBook(response.data);
        } else {
          // Load from cache
          const cached = await offlineStorage.getCachedPriceBook(utilityId);
          if (cached) {
            setPriceBook(cached);
            setIsOfflineData(true);
          } else {
            setError('No cached price book available. Please connect to the internet.');
          }
        }
      } catch (err) {
        console.error('Failed to load price book:', err);
        
        // Try cache on API failure
        try {
          const cached = await offlineStorage.getCachedPriceBook(utilityId);
          if (cached) {
            setPriceBook(cached);
            setIsOfflineData(true);
          } else {
            setError('Failed to load price book. Please try again.');
          }
        } catch {
          setError('Failed to load price book.');
        }
      } finally {
        setLoading(false);
      }
    };

    loadPriceBook();
  }, [utilityId, isOnline]);

  // Load recent items from storage
  useEffect(() => {
    const loadRecentItems = async () => {
      try {
        const recent = await offlineStorage.getUserData('recentRateItems');
        if (recent) {
          setRecentItems(recent);
        }
      } catch (err) {
        console.error('Failed to load recent items:', err);
      }
    };
    loadRecentItems();
  }, []);

  // Save to recent items
  const saveToRecent = useCallback(async (item) => {
    try {
      const updated = [
        item,
        ...recentItems.filter(r => r.itemCode !== item.itemCode)
      ].slice(0, 10); // Keep last 10
      
      await offlineStorage.saveUserData('recentRateItems', updated);
      setRecentItems(updated);
    } catch (err) {
      console.error('Failed to save recent item:', err);
    }
  }, [recentItems]);

  // Handle item selection
  const handleSelect = useCallback((item) => {
    saveToRecent(item);
    onSelect({
      ...item,
      priceBookId: priceBook?._id,
    });
  }, [onSelect, priceBook, saveToRecent]);

  // Filter items
  const filteredItems = useMemo(() => {
    if (!priceBook?.items) return [];
    
    let items = priceBook.items.filter(i => i.isActive !== false);
    
    // Category filter
    if (selectedCategory !== 'all') {
      items = items.filter(i => i.category === selectedCategory);
    }
    
    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      items = items.filter(i => 
        i.itemCode?.toLowerCase().includes(query) ||
        i.description?.toLowerCase().includes(query) ||
        i.shortDescription?.toLowerCase().includes(query)
      );
    }
    
    return items;
  }, [priceBook, selectedCategory, searchQuery]);

  // Check if item is in recent list
  const isRecent = useCallback((item) => {
    return recentItems.some(r => r.itemCode === item.itemCode);
  }, [recentItems]);

  return (
    <Box sx={{ 
      bgcolor: COLORS.bg, 
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* Header */}
      <Box sx={{ 
        bgcolor: COLORS.surface, 
        px: 2, 
        py: 2,
        borderBottom: `1px solid ${COLORS.border}`,
        position: 'sticky',
        top: 0,
        zIndex: 10,
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
          <Typography sx={{ color: COLORS.text, fontWeight: 700, fontSize: '1.25rem' }}>
            Select Rate Item
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {isOfflineData && (
              <Chip
                icon={<OfflineIcon />}
                label="Cached"
                size="small"
                sx={{
                  bgcolor: `${COLORS.warning}20`,
                  color: COLORS.warning,
                  fontWeight: 600,
                }}
              />
            )}
            <IconButton 
              onClick={onClose}
              sx={{ color: COLORS.text }}
              aria-label="Close"
            >
              <CloseIcon />
            </IconButton>
          </Box>
        </Box>

        {/* Search */}
        <TextField
          fullWidth
          placeholder="Search by code or description..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon sx={{ color: COLORS.textSecondary }} />
              </InputAdornment>
            ),
            endAdornment: searchQuery && (
              <InputAdornment position="end">
                <IconButton 
                  size="small" 
                  onClick={() => setSearchQuery('')}
                  aria-label="Clear search"
                >
                  <CloseIcon sx={{ fontSize: 18, color: COLORS.textSecondary }} />
                </IconButton>
              </InputAdornment>
            ),
          }}
          sx={{
            '& .MuiOutlinedInput-root': {
              bgcolor: COLORS.surfaceLight,
              color: COLORS.text,
              '& fieldset': { borderColor: COLORS.border },
              '&:hover fieldset': { borderColor: COLORS.textSecondary },
              '&.Mui-focused fieldset': { borderColor: COLORS.primary },
            },
          }}
        />

        {/* Category filters */}
        <Box sx={{ 
          display: 'flex', 
          gap: 1, 
          mt: 2, 
          pb: 1,
          overflowX: 'auto',
          '&::-webkit-scrollbar': { display: 'none' },
        }}>
          {CATEGORIES.map((cat) => (
            <Chip
              key={cat.value}
              label={cat.label}
              onClick={() => setSelectedCategory(cat.value)}
              sx={{
                bgcolor: selectedCategory === cat.value 
                  ? COLORS.primary 
                  : COLORS.surfaceLight,
                color: selectedCategory === cat.value 
                  ? COLORS.bg 
                  : COLORS.text,
                fontWeight: selectedCategory === cat.value ? 700 : 400,
                minHeight: 36,
                '&:hover': { 
                  bgcolor: selectedCategory === cat.value 
                    ? COLORS.primaryDark 
                    : COLORS.border 
                },
              }}
            />
          ))}
        </Box>
      </Box>

      {/* Content */}
      <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>
        {loading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
            <CircularProgress sx={{ color: COLORS.primary }} />
          </Box>
        )}
        {!loading && error && (
          <Alert 
            severity="error" 
            sx={{ 
              bgcolor: `${COLORS.error}15`,
              color: COLORS.error,
            }}
          >
            {error}
          </Alert>
        )}
        {!loading && !error && (
          <>
            {/* Recent items section (when no search) */}
            {!searchQuery && recentItems.length > 0 && (
              <Box sx={{ mb: 3 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                  <HistoryIcon sx={{ color: COLORS.textSecondary, fontSize: 18 }} />
                  <Typography sx={{ color: COLORS.textSecondary, fontWeight: 600, fontSize: '0.875rem' }}>
                    RECENTLY USED
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                  {recentItems.slice(0, 3).map((item) => (
                    <RateItemCard
                      key={item.itemCode}
                      item={item}
                      onSelect={handleSelect}
                      isRecent
                    />
                  ))}
                </Box>
                <Divider sx={{ my: 3, borderColor: COLORS.border }} />
              </Box>
            )}

            {/* Main items list */}
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
              <Typography sx={{ color: COLORS.textSecondary, fontWeight: 600, fontSize: '0.875rem' }}>
                {searchQuery ? 'SEARCH RESULTS' : 'ALL ITEMS'}
              </Typography>
              <Typography sx={{ color: COLORS.textSecondary, fontSize: '0.75rem' }}>
                {filteredItems.length} items
              </Typography>
            </Box>

            {filteredItems.length === 0 ? (
              <Box sx={{ textAlign: 'center', py: 8 }}>
                <Typography sx={{ color: COLORS.textSecondary }}>
                  No items found
                </Typography>
              </Box>
            ) : (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                {filteredItems.map((item) => (
                  <RateItemCard
                    key={item._id || item.itemCode}
                    item={item}
                    onSelect={handleSelect}
                    isRecent={isRecent(item)}
                  />
                ))}
              </Box>
            )}
          </>
        )}
      </Box>
    </Box>
  );
};

PriceBookSelector.propTypes = {
  utilityId: PropTypes.string.isRequired,
  onSelect: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
};

export default PriceBookSelector;

