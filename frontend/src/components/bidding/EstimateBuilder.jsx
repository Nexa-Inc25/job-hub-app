/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
/**
 * Estimate Builder - AI-Assisted Bid Estimating
 * 
 * Tool for building new bids using historical data.
 * Suggests pricing based on actual costs.
 * 
 * Features:
 * - Add scope items with quantities
 * - Get AI-suggested pricing
 * - Adjust confidence level
 * - Add contingency and markup
 * - Generate bid summary
 */

import React, { useState, useCallback } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Button,
  TextField,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  CircularProgress,
  Alert,
  Slider,
  Chip,
  Divider,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import CalculateIcon from '@mui/icons-material/Calculate';
import LightbulbIcon from '@mui/icons-material/Lightbulb';
import WarningIcon from '@mui/icons-material/Warning';
import CheckIcon from '@mui/icons-material/Check';
import InfoIcon from '@mui/icons-material/Info';
import SaveIcon from '@mui/icons-material/Save';
import api from '../../api';

const COLORS = {
  bg: '#0a0a0f',
  surface: '#16161f',
  surfaceLight: '#1e1e2a',
  primary: '#00e676',
  primaryDark: '#00c853',
  secondary: '#7c4dff',
  error: '#ff5252',
  warning: '#ffab00',
  text: '#ffffff',
  textSecondary: '#9e9e9e',
  border: '#333344',
};

// Format currency
const formatCurrency = (amount) => {
  if (amount === null || amount === undefined) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(amount);
};

// Confidence labels
const CONFIDENCE_LABELS = {
  conservative: { label: 'Conservative', desc: 'Higher pricing, less risk', color: COLORS.primary },
  moderate: { label: 'Moderate', desc: 'Average historical pricing', color: COLORS.secondary },
  aggressive: { label: 'Aggressive', desc: 'Lower pricing, more competitive', color: COLORS.warning },
};

const EstimateBuilder = () => {
  // State
  const [items, setItems] = useState([
    { itemCode: '', quantity: 0 }
  ]);
  const [confidence, setConfidence] = useState('moderate');
  const [contingencyRate, setContingencyRate] = useState(10);
  const [markupRate, setMarkupRate] = useState(15);
  const [estimate, setEstimate] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [bidName, setBidName] = useState('');
  const [showSaveDialog, setShowSaveDialog] = useState(false);

  // Add item
  const addItem = () => {
    setItems([...items, { itemCode: '', quantity: 0 }]);
  };

  // Remove item
  const removeItem = (index) => {
    setItems(items.filter((_, i) => i !== index));
  };

  // Update item
  const updateItem = (index, field, value) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], [field]: value };
    setItems(newItems);
  };

  // Generate estimate
  const generateEstimate = useCallback(async () => {
    const validItems = items.filter(i => i.itemCode && i.quantity > 0);
    
    if (validItems.length === 0) {
      setError('Add at least one item with a quantity');
      return;
    }

    setLoading(true);
    setError(null);
    setEstimate(null);

    try {
      const response = await api.post('/api/bidding/estimate', {
        scopeItems: validItems.map(i => ({
          itemCode: i.itemCode.trim(),
          quantity: parseFloat(i.quantity),
        })),
        contingencyRate,
        markupRate,
        confidence,
      });

      setEstimate(response.data);
    } catch (err) {
      console.error('Error generating estimate:', err);
      setError(err.response?.data?.error || 'Failed to generate estimate');
    } finally {
      setLoading(false);
    }
  }, [items, contingencyRate, markupRate, confidence]);

  // Confidence slider marks
  const confidenceMarks = [
    { value: 0, label: 'Conservative' },
    { value: 50, label: 'Moderate' },
    { value: 100, label: 'Aggressive' },
  ];

  const handleConfidenceChange = (_, value) => {
    if (value <= 33) setConfidence('conservative');
    else if (value <= 66) setConfidence('moderate');
    else setConfidence('aggressive');
  };

  const getConfidenceValue = () => {
    if (confidence === 'conservative') return 0;
    if (confidence === 'moderate') return 50;
    return 100;
  };

  return (
    <Box sx={{ bgcolor: COLORS.bg, minHeight: '100%', p: 3 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h5" sx={{ color: COLORS.text, fontWeight: 700 }}>
            Estimate Builder
          </Typography>
          <Typography variant="body2" sx={{ color: COLORS.textSecondary }}>
            Build bids using historical cost data
          </Typography>
        </Box>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
        {/* Left Column - Input */}
        <Box sx={{ flex: 1, minWidth: 400 }}>
          {/* Scope Items */}
          <Card sx={{ bgcolor: COLORS.surface, mb: 3 }}>
            <CardContent>
              <Typography variant="h6" sx={{ color: COLORS.text, mb: 2, fontWeight: 600 }}>
                Scope Items
              </Typography>
              
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ color: COLORS.textSecondary, borderColor: COLORS.border }}>
                        Item Code
                      </TableCell>
                      <TableCell sx={{ color: COLORS.textSecondary, borderColor: COLORS.border }} align="right">
                        Quantity
                      </TableCell>
                      <TableCell sx={{ borderColor: COLORS.border, width: 50 }} />
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {items.map((item, idx) => (
                      <TableRow key={idx}>
                        <TableCell sx={{ borderColor: COLORS.border }}>
                          <TextField
                            value={item.itemCode}
                            onChange={(e) => updateItem(idx, 'itemCode', e.target.value)}
                            placeholder="e.g., 123456"
                            size="small"
                            fullWidth
                            InputProps={{
                              sx: { 
                                bgcolor: COLORS.surfaceLight, 
                                color: COLORS.text,
                                fontFamily: 'monospace'
                              }
                            }}
                          />
                        </TableCell>
                        <TableCell sx={{ borderColor: COLORS.border }} align="right">
                          <TextField
                            type="number"
                            value={item.quantity}
                            onChange={(e) => updateItem(idx, 'quantity', e.target.value)}
                            size="small"
                            inputProps={{ min: 0 }}
                            sx={{ width: 100 }}
                            InputProps={{
                              sx: { bgcolor: COLORS.surfaceLight, color: COLORS.text }
                            }}
                          />
                        </TableCell>
                        <TableCell sx={{ borderColor: COLORS.border }}>
                          <IconButton
                            size="small"
                            onClick={() => removeItem(idx)}
                            disabled={items.length === 1}
                            sx={{ color: COLORS.error }}
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>

              <Button
                startIcon={<AddIcon />}
                onClick={addItem}
                sx={{ mt: 2, color: COLORS.primary }}
              >
                Add Item
              </Button>
            </CardContent>
          </Card>

          {/* Settings */}
          <Card sx={{ bgcolor: COLORS.surface, mb: 3 }}>
            <CardContent>
              <Typography variant="h6" sx={{ color: COLORS.text, mb: 2, fontWeight: 600 }}>
                Estimate Settings
              </Typography>

              {/* Confidence Slider */}
              <Box sx={{ mb: 3 }}>
                <Typography variant="body2" sx={{ color: COLORS.textSecondary, mb: 1 }}>
                  Pricing Strategy
                </Typography>
                <Box sx={{ px: 2 }}>
                  <Slider
                    value={getConfidenceValue()}
                    onChange={handleConfidenceChange}
                    step={null}
                    marks={confidenceMarks}
                    sx={{
                      color: CONFIDENCE_LABELS[confidence].color,
                      '& .MuiSlider-markLabel': { color: COLORS.textSecondary },
                    }}
                  />
                </Box>
                <Typography variant="caption" sx={{ color: COLORS.textSecondary, display: 'block', textAlign: 'center' }}>
                  {CONFIDENCE_LABELS[confidence].desc}
                </Typography>
              </Box>

              {/* Rates */}
              <Box sx={{ display: 'flex', gap: 3 }}>
                <Box sx={{ flex: 1 }}>
                  <Typography variant="body2" sx={{ color: COLORS.textSecondary, mb: 1 }}>
                    Contingency %
                  </Typography>
                  <TextField
                    type="number"
                    value={contingencyRate}
                    onChange={(e) => setContingencyRate(parseFloat(e.target.value) || 0)}
                    size="small"
                    fullWidth
                    inputProps={{ min: 0, max: 50 }}
                    InputProps={{
                      endAdornment: '%',
                      sx: { bgcolor: COLORS.surfaceLight, color: COLORS.text }
                    }}
                  />
                </Box>
                <Box sx={{ flex: 1 }}>
                  <Typography variant="body2" sx={{ color: COLORS.textSecondary, mb: 1 }}>
                    Markup/Profit %
                  </Typography>
                  <TextField
                    type="number"
                    value={markupRate}
                    onChange={(e) => setMarkupRate(parseFloat(e.target.value) || 0)}
                    size="small"
                    fullWidth
                    inputProps={{ min: 0, max: 100 }}
                    InputProps={{
                      endAdornment: '%',
                      sx: { bgcolor: COLORS.surfaceLight, color: COLORS.text }
                    }}
                  />
                </Box>
              </Box>
            </CardContent>
          </Card>

          {/* Generate Button */}
          <Button
            variant="contained"
            size="large"
            fullWidth
            onClick={generateEstimate}
            disabled={loading}
            startIcon={loading ? <CircularProgress size={20} /> : <CalculateIcon />}
            sx={{
              bgcolor: COLORS.primary,
              color: COLORS.bg,
              fontWeight: 600,
              py: 1.5,
              '&:hover': { bgcolor: COLORS.primaryDark },
              '&:disabled': { bgcolor: COLORS.border },
            }}
          >
            {loading ? 'Generating...' : 'Generate Estimate'}
          </Button>
        </Box>

        {/* Right Column - Results */}
        <Box sx={{ flex: 1, minWidth: 400 }}>
          {estimate ? (
            <>
              {/* Summary Card */}
              <Card sx={{ bgcolor: COLORS.primary, mb: 3 }}>
                <CardContent>
                  <Typography variant="body2" sx={{ color: COLORS.bg, opacity: 0.8 }}>
                    Estimated Total
                  </Typography>
                  <Typography variant="h3" sx={{ color: COLORS.bg, fontWeight: 700 }}>
                    {formatCurrency(estimate.financials.total)}
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 2, mt: 2 }}>
                    <Chip
                      label={`${Math.round(estimate.summary.dataConfidence * 100)}% data confidence`}
                      size="small"
                      sx={{ bgcolor: 'rgba(0,0,0,0.2)', color: COLORS.bg }}
                    />
                    <Chip
                      label={confidence}
                      size="small"
                      sx={{ bgcolor: 'rgba(0,0,0,0.2)', color: COLORS.bg }}
                    />
                  </Box>
                </CardContent>
              </Card>

              {/* Line Items */}
              <Card sx={{ bgcolor: COLORS.surface, mb: 3 }}>
                <CardContent>
                  <Typography variant="h6" sx={{ color: COLORS.text, mb: 2, fontWeight: 600 }}>
                    Line Items
                  </Typography>
                  <TableContainer>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell sx={{ color: COLORS.textSecondary, borderColor: COLORS.border }}>
                            Item
                          </TableCell>
                          <TableCell sx={{ color: COLORS.textSecondary, borderColor: COLORS.border }} align="right">
                            Qty
                          </TableCell>
                          <TableCell sx={{ color: COLORS.textSecondary, borderColor: COLORS.border }} align="right">
                            Unit $
                          </TableCell>
                          <TableCell sx={{ color: COLORS.textSecondary, borderColor: COLORS.border }} align="right">
                            Total
                          </TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {estimate.lineItems.map((item, idx) => (
                          <TableRow key={idx}>
                            <TableCell sx={{ borderColor: COLORS.border }}>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <Typography 
                                  variant="body2" 
                                  sx={{ color: COLORS.text, fontFamily: 'monospace' }}
                                >
                                  {item.itemCode}
                                </Typography>
                                {item.dataSource === 'historical' && (
                                  <Tooltip title={`Based on ${item.sampleCount} historical entries`}>
                                    <LightbulbIcon sx={{ fontSize: 16, color: COLORS.primary }} />
                                  </Tooltip>
                                )}
                                {item.warning && (
                                  <Tooltip title={item.warning}>
                                    <WarningIcon sx={{ fontSize: 16, color: COLORS.warning }} />
                                  </Tooltip>
                                )}
                              </Box>
                            </TableCell>
                            <TableCell sx={{ color: COLORS.text, borderColor: COLORS.border }} align="right">
                              {item.quantity}
                            </TableCell>
                            <TableCell sx={{ color: COLORS.text, borderColor: COLORS.border }} align="right">
                              {formatCurrency(item.unitPrice)}
                            </TableCell>
                            <TableCell sx={{ color: COLORS.primary, borderColor: COLORS.border, fontWeight: 600 }} align="right">
                              {formatCurrency(item.lineTotal)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </CardContent>
              </Card>

              {/* Financials */}
              <Card sx={{ bgcolor: COLORS.surface }}>
                <CardContent>
                  <Typography variant="h6" sx={{ color: COLORS.text, mb: 2, fontWeight: 600 }}>
                    Financials
                  </Typography>
                  
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                    <Typography sx={{ color: COLORS.textSecondary }}>Subtotal</Typography>
                    <Typography sx={{ color: COLORS.text }}>{formatCurrency(estimate.financials.subtotal)}</Typography>
                  </Box>
                  
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                    <Typography sx={{ color: COLORS.textSecondary }}>
                      Contingency ({estimate.financials.contingencyRate}%)
                    </Typography>
                    <Typography sx={{ color: COLORS.text }}>{formatCurrency(estimate.financials.contingency)}</Typography>
                  </Box>
                  
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                    <Typography sx={{ color: COLORS.textSecondary }}>
                      Markup ({estimate.financials.markupRate}%)
                    </Typography>
                    <Typography sx={{ color: COLORS.text }}>{formatCurrency(estimate.financials.markup)}</Typography>
                  </Box>
                  
                  <Divider sx={{ my: 2, borderColor: COLORS.border }} />
                  
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography variant="h6" sx={{ color: COLORS.primary, fontWeight: 700 }}>
                      Total
                    </Typography>
                    <Typography variant="h6" sx={{ color: COLORS.primary, fontWeight: 700 }}>
                      {formatCurrency(estimate.financials.total)}
                    </Typography>
                  </Box>

                  {/* Data Quality Info */}
                  <Alert 
                    severity={estimate.summary.dataConfidence > 0.7 ? 'success' : 'warning'}
                    icon={<InfoIcon />}
                    sx={{ mt: 2 }}
                  >
                    {estimate.summary.itemsWithHistoricalData} of {estimate.summary.itemCount} items 
                    have historical pricing data
                  </Alert>
                </CardContent>
              </Card>
            </>
          ) : (
            <Card sx={{ bgcolor: COLORS.surface, height: 400, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <CardContent sx={{ textAlign: 'center' }}>
                <CalculateIcon sx={{ fontSize: 64, color: COLORS.textSecondary, mb: 2 }} />
                <Typography variant="h6" sx={{ color: COLORS.text, mb: 1 }}>
                  Build Your Estimate
                </Typography>
                <Typography variant="body2" sx={{ color: COLORS.textSecondary }}>
                  Add scope items and click "Generate Estimate"
                  <br />to get AI-powered pricing suggestions
                </Typography>
              </CardContent>
            </Card>
          )}
        </Box>
      </Box>
    </Box>
  );
};

export default EstimateBuilder;

