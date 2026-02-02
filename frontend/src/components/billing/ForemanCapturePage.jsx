/**
 * Foreman Capture Page - Mobile-First Unit Entry
 * 
 * Complete workflow for field workers to:
 * 1. Select job (if multiple assigned)
 * 2. Pick item from price book
 * 3. Log unit with GPS + photo
 * 
 * Designed for:
 * - One-handed use on phone
 * - Glove-friendly 56px+ touch targets
 * - Sunlight-readable high contrast
 * - Works fully offline
 * 
 * @module components/billing/ForemanCapturePage
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import PropTypes from 'prop-types';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  Box,
  Typography,
  Button,
  IconButton,
  TextField,
  Card,
  CardContent,
  Chip,
  Alert,
  CircularProgress,
  InputAdornment,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Divider,
  Badge,
  Fab,
  SwipeableDrawer,
  Skeleton,
} from '@mui/material';
import BackIcon from '@mui/icons-material/ArrowBack';
import SearchIcon from '@mui/icons-material/Search';
import AddIcon from '@mui/icons-material/Add';
import CheckIcon from '@mui/icons-material/Check';
import OfflineIcon from '@mui/icons-material/CloudOff';
import OnlineIcon from '@mui/icons-material/CloudQueue';
import HistoryIcon from '@mui/icons-material/History';
import FilterIcon from '@mui/icons-material/FilterList';
import StarIcon from '@mui/icons-material/Star';
import GPSIcon from '@mui/icons-material/MyLocation';
import { useOffline } from '../../hooks/useOffline';
import UnitEntryForm from './UnitEntryForm';
import PriceBookSelector from './PriceBookSelector';
import api from '../../api';
import offlineStorage from '../../utils/offlineStorage';

// High-contrast colors for field visibility
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
  success: '#00e676',
};

/**
 * Recent Items Quick Access
 */
const RecentItems = ({ items, onSelect }) => {
  if (!items.length) return null;
  
  return (
    <Box sx={{ mb: 3 }}>
      <Typography sx={{ 
        color: COLORS.textSecondary, 
        fontWeight: 600, 
        fontSize: '0.75rem',
        mb: 1,
        px: 1,
      }}>
        RECENT
      </Typography>
      <Box sx={{ display: 'flex', gap: 1, overflowX: 'auto', pb: 1, px: 1 }}>
        {items.slice(0, 5).map((item) => (
          <Chip
            key={item._id}
            label={item.itemCode}
            onClick={() => onSelect(item)}
            sx={{
              bgcolor: COLORS.surfaceLight,
              color: COLORS.text,
              fontWeight: 600,
              minHeight: 44,
              '&:hover': { bgcolor: COLORS.surface },
            }}
          />
        ))}
      </Box>
    </Box>
  );
};

RecentItems.propTypes = {
  items: PropTypes.arrayOf(PropTypes.shape({
    _id: PropTypes.string,
    itemCode: PropTypes.string,
  })).isRequired,
  onSelect: PropTypes.func.isRequired,
};

/**
 * Item Card for price book selection
 */
const ItemCard = ({ item, onSelect, isRecent }) => (
  <Card 
    onClick={() => onSelect(item)}
    sx={{ 
      bgcolor: COLORS.surface, 
      mb: 1.5, 
      border: `1px solid ${COLORS.border}`,
      cursor: 'pointer',
      transition: 'all 0.2s',
      '&:active': {
        transform: 'scale(0.98)',
        bgcolor: COLORS.surfaceLight,
      },
    }}
  >
    <CardContent sx={{ py: 1.5, px: 2, '&:last-child': { pb: 1.5 } }}>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
            <Typography sx={{ 
              color: COLORS.primary, 
              fontWeight: 700,
              fontSize: '1rem',
            }}>
              {item.itemCode}
            </Typography>
            {isRecent && (
              <HistoryIcon sx={{ fontSize: 14, color: COLORS.textSecondary }} />
            )}
          </Box>
          <Typography sx={{ 
            color: COLORS.text, 
            fontSize: '0.875rem',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {item.description}
          </Typography>
        </Box>
        <Box sx={{ textAlign: 'right', ml: 2 }}>
          <Typography sx={{ color: COLORS.primary, fontWeight: 700, fontSize: '1.1rem' }}>
            ${item.unitPrice?.toFixed(2) || '0.00'}
          </Typography>
          <Typography sx={{ color: COLORS.textSecondary, fontSize: '0.75rem' }}>
            / {item.unit || 'EA'}
          </Typography>
        </Box>
      </Box>
    </CardContent>
  </Card>
);

ItemCard.propTypes = {
  item: PropTypes.shape({
    _id: PropTypes.string,
    itemCode: PropTypes.string,
    description: PropTypes.string,
    unitPrice: PropTypes.number,
    unit: PropTypes.string,
  }).isRequired,
  onSelect: PropTypes.func.isRequired,
  isRecent: PropTypes.bool,
};

/**
 * Pending Queue Badge
 */
const PendingBadge = ({ count, onClick }) => {
  if (!count) return null;
  
  return (
    <Chip
      icon={<OfflineIcon sx={{ color: COLORS.warning }} />}
      label={`${count} pending`}
      onClick={onClick}
      sx={{
        bgcolor: `${COLORS.warning}20`,
        color: COLORS.warning,
        fontWeight: 600,
        cursor: 'pointer',
      }}
    />
  );
};

PendingBadge.propTypes = {
  count: PropTypes.number,
  onClick: PropTypes.func,
};

/**
 * Main Foreman Capture Page
 */
const ForemanCapturePage = () => {
  const navigate = useNavigate();
  const { jobId } = useParams();
  const [searchParams] = useSearchParams();
  const preselectedItemCode = searchParams.get('item');
  
  // State
  const [step, setStep] = useState('select'); // 'select' | 'capture'
  const [job, setJob] = useState(null);
  const [priceBook, setPriceBook] = useState(null);
  const [priceBookItems, setPriceBookItems] = useState([]);
  const [selectedItem, setSelectedItem] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [recentItems, setRecentItems] = useState([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [todayUnits, setTodayUnits] = useState([]);
  
  // Hooks
  const { isOnline } = useOffline();

  // Helper: Try loading price book for utility
  const loadPriceBookForUtility = async (utilityId) => {
    try {
      const activePbRes = await api.get(`/api/pricebooks/active?utilityId=${utilityId}`);
      if (activePbRes.data) {
        return { priceBook: activePbRes.data, items: activePbRes.data.items || [] };
      }
    } catch {
      // No active price book for utility
    }
    return null;
  };

  // Helper: Try loading any available price book
  const loadFallbackPriceBook = async () => {
    try {
      console.log('[ForemanCapture] No items from job priceBookId, trying active pricebooks...');
      let allPbRes = await api.get('/api/pricebooks?status=active');
      console.log('[ForemanCapture] Active pricebooks:', allPbRes.data?.length || 0);
      
      if (!allPbRes.data?.length) {
        console.log('[ForemanCapture] No active, trying all pricebooks...');
        allPbRes = await api.get('/api/pricebooks');
        console.log('[ForemanCapture] All pricebooks:', allPbRes.data?.length || 0);
      }
      
      if (allPbRes.data?.length > 0) {
        console.log('[ForemanCapture] Fetching full pricebook:', allPbRes.data[0]._id, allPbRes.data[0].name);
        const fullPbRes = await api.get(`/api/pricebooks/${allPbRes.data[0]._id}`);
        console.log('[ForemanCapture] Full pricebook items:', fullPbRes.data?.items?.length || 0);
        if (fullPbRes.data) {
          return { priceBook: fullPbRes.data, items: fullPbRes.data.items || [] };
        }
      }
    } catch (error_) {
      console.error('[ForemanCapture] Error loading pricebooks:', error_);
    }
    return null;
  };

  // Helper: Load job's price book with fallbacks
  const loadJobPriceBook = async (jobData) => {
    // Try job's direct priceBookId first
    if (jobData.priceBookId) {
      const pbRes = await api.get(`/api/pricebooks/${jobData.priceBookId}`);
      return { priceBook: pbRes.data, items: pbRes.data.items || [] };
    }
    
    // Try utility-specific price book
    if (jobData.utilityId) {
      const result = await loadPriceBookForUtility(jobData.utilityId);
      if (result) return result;
    }
    
    // Final fallback: any available price book
    return await loadFallbackPriceBook();
  };

  // Load job and price book data
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        let loadedItems = [];
        
        if (jobId) {
          const jobRes = await api.get(`/api/jobs/${jobId}`);
          const jobData = jobRes.data;
          setJob(jobData);
          
          const pbResult = await loadJobPriceBook(jobData);
          if (pbResult) {
            setPriceBook(pbResult.priceBook);
            loadedItems = pbResult.items;
            setPriceBookItems(loadedItems);
          }
        }
        
        // Load recent items from local storage
        const recent = JSON.parse(localStorage.getItem('recentPriceBookItems') || '[]');
        setRecentItems(recent);
        
        // Get pending queue count
        const pendingUnits = await offlineStorage.getPendingUnits?.() || [];
        setPendingCount(pendingUnits.length);
        
        // Load today's units
        const today = new Date().toISOString().split('T')[0];
        const todayRes = await api.get(`/api/billing/units?jobId=${jobId}&startDate=${today}`).catch(() => ({ data: [] }));
        setTodayUnits(todayRes.data?.units || []);
        
        // Auto-select if item code provided
        if (preselectedItemCode && loadedItems.length > 0) {
          const item = loadedItems.find(i => i.itemCode === preselectedItemCode);
          if (item) {
            setSelectedItem(item);
            setStep('capture');
          }
        }
      } catch (err) {
        console.error('Load error:', err);
        setError(err.message);
        
        // Try loading from offline cache
        try {
          const cachedPb = await offlineStorage.getCachedPriceBook?.();
          if (cachedPb) {
            setPriceBook(cachedPb);
            setPriceBookItems(cachedPb.items || []);
          }
        } catch {
          // Ignore offline cache errors
        }
      } finally {
        setLoading(false);
      }
    };
    
    loadData();
  }, [jobId, preselectedItemCode]);

  // Filter items by search
  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return priceBookItems;
    
    const query = searchQuery.toLowerCase();
    return priceBookItems.filter(item => 
      item.itemCode?.toLowerCase().includes(query) ||
      item.description?.toLowerCase().includes(query)
    );
  }, [priceBookItems, searchQuery]);

  // Handle item selection
  const handleSelectItem = useCallback((item) => {
    setSelectedItem(item);
    
    // Save to recent
    const recent = JSON.parse(localStorage.getItem('recentPriceBookItems') || '[]');
    const updated = [item, ...recent.filter(i => i._id !== item._id)].slice(0, 10);
    localStorage.setItem('recentPriceBookItems', JSON.stringify(updated));
    setRecentItems(updated);
    
    setStep('capture');
  }, []);

  // Handle capture success
  const handleCaptureSuccess = useCallback((unitEntry) => {
    // Update today's count
    setTodayUnits(prev => [...prev, unitEntry]);
    
    // Go back to selection for next item
    setStep('select');
    setSelectedItem(null);
    
    // Update pending count if offline
    if (unitEntry._offline) {
      setPendingCount(prev => prev + 1);
    }
  }, []);

  // Handle back
  const handleBack = useCallback(() => {
    if (step === 'capture') {
      setStep('select');
      setSelectedItem(null);
    } else {
      navigate(-1);
    }
  }, [step, navigate]);

  // Loading state
  if (loading) {
    return (
      <Box sx={{ bgcolor: COLORS.bg, minHeight: '100vh', p: 2 }}>
        <Skeleton variant="rectangular" height={60} sx={{ bgcolor: COLORS.surface, mb: 2 }} />
        <Skeleton variant="rectangular" height={50} sx={{ bgcolor: COLORS.surface, mb: 2 }} />
        {[1, 2, 3, 4, 5].map((i) => (
          <Skeleton 
            key={i} 
            variant="rectangular" 
            height={80} 
            sx={{ bgcolor: COLORS.surface, mb: 1.5, borderRadius: 1 }} 
          />
        ))}
      </Box>
    );
  }

  // Capture step - show unit entry form
  if (step === 'capture' && selectedItem) {
    return (
      <UnitEntryForm
        jobId={jobId}
        priceBookId={priceBook?._id}
        selectedItem={selectedItem}
        onSuccess={handleCaptureSuccess}
        onCancel={() => setStep('select')}
      />
    );
  }

  // Selection step - show price book items
  return (
    <Box sx={{ bgcolor: COLORS.bg, minHeight: '100vh' }}>
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
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <IconButton 
              onClick={handleBack}
              sx={{ color: COLORS.text, p: 0.5 }}
              aria-label="Go back"
            >
              <BackIcon />
            </IconButton>
            <Box>
              <Typography sx={{ color: COLORS.text, fontWeight: 700, fontSize: '1.1rem' }}>
                Log Unit
              </Typography>
              {job && (
                <Typography sx={{ color: COLORS.textSecondary, fontSize: '0.75rem' }}>
                  {job.woNumber || job.jobNumber} • {job.address?.slice(0, 25)}...
                </Typography>
              )}
            </Box>
          </Box>
          
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <PendingBadge count={pendingCount} onClick={() => navigate('/billing/queue')} />
            <Chip
              icon={isOnline ? <OnlineIcon /> : <OfflineIcon />}
              label={isOnline ? 'Online' : 'Offline'}
              size="small"
              sx={{
                bgcolor: isOnline ? `${COLORS.success}20` : `${COLORS.warning}20`,
                color: isOnline ? COLORS.success : COLORS.warning,
                fontWeight: 600,
              }}
            />
          </Box>
        </Box>
        
        {/* Today's summary */}
        {todayUnits.length > 0 && (
          <Chip
            icon={<CheckIcon sx={{ color: COLORS.success }} />}
            label={`${todayUnits.length} logged today`}
            size="small"
            sx={{
              bgcolor: `${COLORS.success}15`,
              color: COLORS.success,
              fontWeight: 600,
            }}
          />
        )}
      </Box>

      {/* Search */}
      <Box sx={{ p: 2, pb: 0 }}>
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
          }}
          sx={{
            '& .MuiOutlinedInput-root': {
              bgcolor: COLORS.surface,
              color: COLORS.text,
              borderRadius: 2,
              '& fieldset': { borderColor: COLORS.border },
              '&:hover fieldset': { borderColor: COLORS.textSecondary },
              '&.Mui-focused fieldset': { borderColor: COLORS.primary },
            },
          }}
        />
      </Box>

      {/* Error display */}
      {error && (
        <Alert severity="error" sx={{ m: 2 }}>
          {error}
        </Alert>
      )}

      {/* Content */}
      <Box sx={{ p: 2 }}>
        {/* Recent items quick access */}
        {!searchQuery && recentItems.length > 0 && (
          <RecentItems items={recentItems} onSelect={handleSelectItem} />
        )}

        {/* Items list */}
        <Box>
          {!searchQuery && (
            <Typography sx={{ 
              color: COLORS.textSecondary, 
              fontWeight: 600, 
              fontSize: '0.75rem',
              mb: 1,
              px: 1,
            }}>
              {priceBook?.name || 'PRICE BOOK'} ({filteredItems.length} items)
            </Typography>
          )}
          
          {filteredItems.length === 0 ? (
            <Box sx={{ textAlign: 'center', py: 4 }}>
              <Typography sx={{ color: COLORS.textSecondary }}>
                {searchQuery ? 'No items match your search' : 'No items in price book'}
              </Typography>
            </Box>
          ) : (
            filteredItems.map((item) => (
              <ItemCard
                key={item._id}
                item={item}
                onSelect={handleSelectItem}
                isRecent={recentItems.some(r => r._id === item._id)}
              />
            ))
          )}
        </Box>
      </Box>

      {/* Quick Add FAB */}
      {selectedItem && (
        <Fab
          color="primary"
          onClick={() => setStep('capture')}
          sx={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            width: 64,
            height: 64,
            bgcolor: COLORS.primary,
            '&:hover': { bgcolor: COLORS.primaryDark },
          }}
          aria-label="Log unit"
        >
          <AddIcon sx={{ fontSize: 32, color: COLORS.bg }} />
        </Fab>
      )}
    </Box>
  );
};

export default ForemanCapturePage;

