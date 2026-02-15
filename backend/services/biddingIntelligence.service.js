/**
 * FieldLedger - Bidding Intelligence Service
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * 
 * Leverages historical unit entry data to inform future bidding.
 * The "Executive Brain" - turns actual costs into bid intelligence.
 * 
 * Features:
 * - Historical cost analysis by item code
 * - Productivity rate calculations
 * - AI-suggested bid prices
 * - Full job estimate generation
 */

const mongoose = require('mongoose');
const UnitEntry = require('../models/UnitEntry');
const FieldTicket = require('../models/FieldTicket');
const Job = require('../models/Job');
const PriceBook = require('../models/PriceBook');

/**
 * Get historical cost analysis for an item code
 * @param {string} companyId - Company ID
 * @param {string} itemCode - Price book item code
 * @param {Object} options - Analysis options
 * @returns {Promise<Object>} Cost analysis data
 */
async function getItemCostAnalysis(companyId, itemCode, options = {}) {
  const {
    dateRange = 365, // Days of history to analyze
    minSamples = 5,   // Minimum samples for reliable stats
  } = options;

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - dateRange);

  // Aggregate unit entries for this item
  const pipeline = [
    {
      $match: {
        companyId: new mongoose.Types.ObjectId(companyId),
        itemCode: itemCode,
        status: { $in: ['approved', 'invoiced', 'paid'] },
        workDate: { $gte: startDate },
      }
    },
    {
      $group: {
        _id: null,
        totalQuantity: { $sum: '$quantity' },
        totalAmount: { $sum: { $multiply: ['$quantity', '$unitPrice'] } },
        avgUnitPrice: { $avg: '$unitPrice' },
        minUnitPrice: { $min: '$unitPrice' },
        maxUnitPrice: { $max: '$unitPrice' },
        entries: { $push: { quantity: '$quantity', unitPrice: '$unitPrice', workDate: '$workDate' } },
        count: { $sum: 1 },
      }
    }
  ];

  const result = await UnitEntry.aggregate(pipeline);
  
  if (!result.length || result[0].count < minSamples) {
    return {
      itemCode,
      hasData: false,
      sampleCount: result.length ? result[0].count : 0,
      minSamplesRequired: minSamples,
      message: 'Insufficient historical data for reliable analysis',
    };
  }

  const data = result[0];
  
  // Calculate standard deviation
  const prices = data.entries.map(e => e.unitPrice);
  const mean = data.avgUnitPrice;
  const variance = prices.reduce((sum, p) => sum + Math.pow(p - mean, 2), 0) / prices.length;
  const stdDev = Math.sqrt(variance);
  
  // Calculate coefficient of variation (price stability)
  const cv = (stdDev / mean) * 100;
  const priceStability = cv < 10 ? 'high' : cv < 25 ? 'medium' : 'low';

  // Calculate trend (simple linear regression)
  const sortedEntries = data.entries.sort((a, b) => new Date(a.workDate) - new Date(b.workDate));
  const n = sortedEntries.length;
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  sortedEntries.forEach((entry, i) => {
    sumX += i;
    sumY += entry.unitPrice;
    sumXY += i * entry.unitPrice;
    sumX2 += i * i;
  });
  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const trend = slope > 0.01 ? 'increasing' : slope < -0.01 ? 'decreasing' : 'stable';

  return {
    itemCode,
    hasData: true,
    sampleCount: data.count,
    dateRange: {
      start: startDate.toISOString(),
      end: new Date().toISOString(),
    },
    statistics: {
      totalQuantity: data.totalQuantity,
      totalAmount: Math.round(data.totalAmount * 100) / 100,
      avgUnitPrice: Math.round(data.avgUnitPrice * 100) / 100,
      minUnitPrice: Math.round(data.minUnitPrice * 100) / 100,
      maxUnitPrice: Math.round(data.maxUnitPrice * 100) / 100,
      stdDev: Math.round(stdDev * 100) / 100,
      priceStability,
      trend,
    },
    suggestedBidPrice: {
      conservative: Math.round((data.avgUnitPrice + stdDev) * 100) / 100,
      moderate: Math.round(data.avgUnitPrice * 100) / 100,
      aggressive: Math.round((data.avgUnitPrice - stdDev * 0.5) * 100) / 100,
    },
  };
}

/**
 * Get overall cost analytics for a company
 * @param {string} companyId - Company ID
 * @param {Object} options - Filter options
 * @returns {Promise<Object>} Company-wide analytics
 */
async function getCompanyAnalytics(companyId, options = {}) {
  const {
    dateRange = 365,
    groupBy: _groupBy = 'category', // 'category', 'month', 'utility' (reserved for future aggregation)
  } = options;

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - dateRange);

  // Unit entry totals
  const unitPipeline = [
    {
      $match: {
        companyId: new mongoose.Types.ObjectId(companyId),
        status: { $in: ['approved', 'invoiced', 'paid'] },
        workDate: { $gte: startDate },
      }
    },
    {
      $group: {
        _id: null,
        totalAmount: { $sum: { $multiply: ['$quantity', '$unitPrice'] } },
        totalEntries: { $sum: 1 },
        avgPerEntry: { $avg: { $multiply: ['$quantity', '$unitPrice'] } },
      }
    }
  ];

  // Field ticket (T&M) totals
  const ticketPipeline = [
    {
      $match: {
        companyId: new mongoose.Types.ObjectId(companyId),
        status: { $in: ['approved', 'billed', 'paid'] },
        workDate: { $gte: startDate },
      }
    },
    {
      $group: {
        _id: null,
        totalAmount: { $sum: '$totalAmount' },
        totalTickets: { $sum: 1 },
        laborTotal: { $sum: '$laborTotal' },
        equipmentTotal: { $sum: '$equipmentTotal' },
        materialTotal: { $sum: '$materialTotal' },
      }
    }
  ];

  // Monthly breakdown
  const monthlyPipeline = [
    {
      $match: {
        companyId: new mongoose.Types.ObjectId(companyId),
        status: { $in: ['approved', 'invoiced', 'paid'] },
        workDate: { $gte: startDate },
      }
    },
    {
      $group: {
        _id: {
          year: { $year: '$workDate' },
          month: { $month: '$workDate' }
        },
        amount: { $sum: { $multiply: ['$quantity', '$unitPrice'] } },
        count: { $sum: 1 },
      }
    },
    { $sort: { '_id.year': 1, '_id.month': 1 } }
  ];

  // Top items by volume
  const topItemsPipeline = [
    {
      $match: {
        companyId: new mongoose.Types.ObjectId(companyId),
        status: { $in: ['approved', 'invoiced', 'paid'] },
        workDate: { $gte: startDate },
      }
    },
    {
      $group: {
        _id: '$itemCode',
        totalQuantity: { $sum: '$quantity' },
        totalAmount: { $sum: { $multiply: ['$quantity', '$unitPrice'] } },
        avgUnitPrice: { $avg: '$unitPrice' },
        entryCount: { $sum: 1 },
      }
    },
    { $sort: { totalAmount: -1 } },
    { $limit: 20 }
  ];

  const [unitResults, ticketResults, monthlyResults, topItems] = await Promise.all([
    UnitEntry.aggregate(unitPipeline),
    FieldTicket.aggregate(ticketPipeline),
    UnitEntry.aggregate(monthlyPipeline),
    UnitEntry.aggregate(topItemsPipeline),
  ]);

  const unitData = unitResults[0] || { totalAmount: 0, totalEntries: 0, avgPerEntry: 0 };
  const ticketData = ticketResults[0] || { totalAmount: 0, totalTickets: 0, laborTotal: 0, equipmentTotal: 0, materialTotal: 0 };

  return {
    dateRange: {
      start: startDate.toISOString(),
      end: new Date().toISOString(),
      days: dateRange,
    },
    unitPriceBilling: {
      totalAmount: Math.round(unitData.totalAmount * 100) / 100,
      totalEntries: unitData.totalEntries,
      avgPerEntry: Math.round(unitData.avgPerEntry * 100) / 100,
    },
    timeAndMaterial: {
      totalAmount: Math.round(ticketData.totalAmount * 100) / 100,
      totalTickets: ticketData.totalTickets,
      laborTotal: Math.round(ticketData.laborTotal * 100) / 100,
      equipmentTotal: Math.round(ticketData.equipmentTotal * 100) / 100,
      materialTotal: Math.round(ticketData.materialTotal * 100) / 100,
    },
    combinedTotal: Math.round((unitData.totalAmount + ticketData.totalAmount) * 100) / 100,
    tmRatio: ticketData.totalAmount > 0 
      ? Math.round((ticketData.totalAmount / (unitData.totalAmount + ticketData.totalAmount)) * 100) 
      : 0,
    monthlyTrend: monthlyResults.map(m => ({
      month: `${m._id.year}-${String(m._id.month).padStart(2, '0')}`,
      amount: Math.round(m.amount * 100) / 100,
      entries: m.count,
    })),
    topItems: topItems.map(item => ({
      itemCode: item._id,
      totalQuantity: item.totalQuantity,
      totalAmount: Math.round(item.totalAmount * 100) / 100,
      avgUnitPrice: Math.round(item.avgUnitPrice * 100) / 100,
      entryCount: item.entryCount,
    })),
  };
}

/**
 * Generate a bid estimate for a job based on historical data
 * @param {string} companyId - Company ID
 * @param {Array} scopeItems - Array of { itemCode, quantity } objects
 * @param {Object} options - Estimation options
 * @returns {Promise<Object>} Bid estimate
 */
async function generateBidEstimate(companyId, scopeItems, options = {}) {
  const {
    contingencyRate = 10, // % contingency to add
    markupRate = 15,      // % markup/profit
    confidence = 'moderate', // 'conservative', 'moderate', 'aggressive'
  } = options;

  const estimates = [];
  let subtotal = 0;
  let itemsWithData = 0;
  let itemsWithoutData = 0;

  for (const item of scopeItems) {
    const analysis = await getItemCostAnalysis(companyId, item.itemCode);
    
    if (analysis.hasData) {
      const priceKey = confidence === 'conservative' ? 'conservative' 
        : confidence === 'aggressive' ? 'aggressive' 
        : 'moderate';
      const unitPrice = analysis.suggestedBidPrice[priceKey];
      const lineTotal = unitPrice * item.quantity;
      
      estimates.push({
        itemCode: item.itemCode,
        quantity: item.quantity,
        unitPrice,
        lineTotal: Math.round(lineTotal * 100) / 100,
        dataSource: 'historical',
        sampleCount: analysis.sampleCount,
        priceStability: analysis.statistics.priceStability,
      });
      
      subtotal += lineTotal;
      itemsWithData++;
    } else {
      // Try to get from price book as fallback
      const priceBook = await PriceBook.findOne({
        companyId,
        'items.itemCode': item.itemCode,
        isActive: true,
      });
      
      const priceBookItem = priceBook?.items?.find(i => i.itemCode === item.itemCode);
      
      if (priceBookItem) {
        const lineTotal = priceBookItem.unitPrice * item.quantity;
        estimates.push({
          itemCode: item.itemCode,
          quantity: item.quantity,
          unitPrice: priceBookItem.unitPrice,
          lineTotal: Math.round(lineTotal * 100) / 100,
          dataSource: 'pricebook',
          warning: 'Using price book rate - no historical data',
        });
        subtotal += lineTotal;
      } else {
        estimates.push({
          itemCode: item.itemCode,
          quantity: item.quantity,
          unitPrice: null,
          lineTotal: null,
          dataSource: 'none',
          warning: 'No pricing data available - manual entry required',
        });
      }
      itemsWithoutData++;
    }
  }

  const contingency = subtotal * (contingencyRate / 100);
  const markup = subtotal * (markupRate / 100);
  const total = subtotal + contingency + markup;

  return {
    generatedAt: new Date().toISOString(),
    confidence,
    lineItems: estimates,
    summary: {
      itemCount: scopeItems.length,
      itemsWithHistoricalData: itemsWithData,
      itemsWithoutHistoricalData: itemsWithoutData,
      dataConfidence: itemsWithData / scopeItems.length,
    },
    financials: {
      subtotal: Math.round(subtotal * 100) / 100,
      contingencyRate,
      contingency: Math.round(contingency * 100) / 100,
      markupRate,
      markup: Math.round(markup * 100) / 100,
      total: Math.round(total * 100) / 100,
    },
  };
}

/**
 * Get productivity rates (units per hour) for items
 * @param {string} companyId - Company ID
 * @param {string} itemCode - Optional specific item code
 * @returns {Promise<Array>} Productivity data
 */
async function getProductivityRates(companyId, itemCode = null) {
  const match = {
    companyId: new mongoose.Types.ObjectId(companyId),
    status: { $in: ['approved', 'invoiced', 'paid'] },
    'metadata.laborHours': { $exists: true, $gt: 0 },
  };

  if (itemCode) {
    match.itemCode = itemCode;
  }

  const pipeline = [
    { $match: match },
    {
      $group: {
        _id: '$itemCode',
        totalQuantity: { $sum: '$quantity' },
        totalLaborHours: { $sum: '$metadata.laborHours' },
        entryCount: { $sum: 1 },
      }
    },
    {
      $project: {
        itemCode: '$_id',
        totalQuantity: 1,
        totalLaborHours: 1,
        entryCount: 1,
        unitsPerHour: { $divide: ['$totalQuantity', '$totalLaborHours'] },
        hoursPerUnit: { $divide: ['$totalLaborHours', '$totalQuantity'] },
      }
    },
    { $sort: { entryCount: -1 } },
    { $limit: 50 }
  ];

  const results = await UnitEntry.aggregate(pipeline);

  return results.map(r => ({
    itemCode: r.itemCode,
    totalQuantity: r.totalQuantity,
    totalLaborHours: Math.round(r.totalLaborHours * 10) / 10,
    entryCount: r.entryCount,
    unitsPerHour: Math.round(r.unitsPerHour * 100) / 100,
    hoursPerUnit: Math.round(r.hoursPerUnit * 100) / 100,
  }));
}

/**
 * Compare actual costs to bid prices
 * @param {string} companyId - Company ID
 * @param {string} jobId - Job ID
 * @returns {Promise<Object>} Bid vs actual comparison
 */
async function compareBidToActual(companyId, jobId) {
  const job = await Job.findOne({
    _id: jobId,
    companyId,
  }).lean();

  if (!job) {
    throw new Error('Job not found');
  }

  // Get all unit entries for this job
  const entries = await UnitEntry.find({
    jobId,
    companyId,
    status: { $in: ['approved', 'invoiced', 'paid'] },
  }).lean();

  // Get field tickets for this job
  const tickets = await FieldTicket.find({
    jobId,
    companyId,
    status: { $in: ['approved', 'billed', 'paid'] },
  }).lean();

  // Calculate actuals
  const unitTotal = entries.reduce((sum, e) => sum + (e.quantity * e.unitPrice), 0);
  const tmTotal = tickets.reduce((sum, t) => sum + t.totalAmount, 0);
  const actualTotal = unitTotal + tmTotal;

  // Get bid amount if available (from job.estimatedValue or similar)
  const bidTotal = job.estimatedValue || job.contractValue || 0;

  const variance = actualTotal - bidTotal;
  const variancePercent = bidTotal > 0 ? (variance / bidTotal) * 100 : 0;

  return {
    jobId,
    pmNumber: job.pmNumber,
    woNumber: job.woNumber,
    bid: {
      total: Math.round(bidTotal * 100) / 100,
      source: job.estimatedValue ? 'estimate' : job.contractValue ? 'contract' : 'none',
    },
    actual: {
      unitPriceTotal: Math.round(unitTotal * 100) / 100,
      tmTotal: Math.round(tmTotal * 100) / 100,
      total: Math.round(actualTotal * 100) / 100,
      unitEntryCount: entries.length,
      fieldTicketCount: tickets.length,
    },
    variance: {
      amount: Math.round(variance * 100) / 100,
      percent: Math.round(variancePercent * 10) / 10,
      status: variance < 0 ? 'under_budget' : variance === 0 ? 'on_budget' : 'over_budget',
    },
  };
}

/**
 * Get company-wide bid accuracy trend data
 * @param {string} companyId - Company ID
 * @param {Object} dateRange - { start, end } or { days }
 * @returns {Promise<Object>} Bid accuracy stats and trend
 */
async function getCompanyBidAccuracy(companyId, dateRange = {}) {
  const { days = 365 } = dateRange;
  const start = dateRange.start ? new Date(dateRange.start) : new Date(Date.now() - days * 86400000);
  const end = dateRange.end ? new Date(dateRange.end) : new Date();

  // Get all completed jobs within the date range that have bid values
  const jobs = await Job.find({
    companyId,
    $or: [
      { estimatedValue: { $gt: 0 } },
      { contractValue: { $gt: 0 } },
    ],
    createdAt: { $gte: start, $lte: end },
  }).lean();

  if (jobs.length === 0) {
    return {
      hasData: false,
      jobCount: 0,
      message: 'No jobs with bid/contract values found in the date range',
    };
  }

  // Gather variance for each job
  const jobResults = [];
  for (const job of jobs) {
    const bidTotal = job.estimatedValue || job.contractValue || 0;
    if (bidTotal <= 0) continue;

    // Get actuals
    const [unitEntries, tickets] = await Promise.all([
      UnitEntry.aggregate([
        { $match: { jobId: job._id, companyId: new mongoose.Types.ObjectId(companyId), status: { $in: ['approved', 'invoiced', 'paid'] } } },
        { $group: { _id: null, total: { $sum: { $multiply: ['$quantity', '$unitPrice'] } } } },
      ]),
      FieldTicket.aggregate([
        { $match: { jobId: job._id, companyId: new mongoose.Types.ObjectId(companyId), status: { $in: ['approved', 'billed', 'paid'] } } },
        { $group: { _id: null, total: { $sum: '$totalAmount' } } },
      ]),
    ]);

    const actualTotal = (unitEntries[0]?.total || 0) + (tickets[0]?.total || 0);
    const variance = actualTotal - bidTotal;
    const variancePercent = (variance / bidTotal) * 100;

    jobResults.push({
      jobId: job._id,
      pmNumber: job.pmNumber,
      woNumber: job.woNumber,
      bidTotal: Math.round(bidTotal * 100) / 100,
      actualTotal: Math.round(actualTotal * 100) / 100,
      variance: Math.round(variance * 100) / 100,
      variancePercent: Math.round(variancePercent * 10) / 10,
      createdAt: job.createdAt,
    });
  }

  if (jobResults.length === 0) {
    return { hasData: false, jobCount: 0, message: 'No jobs with actuals found' };
  }

  // Aggregate stats
  const totalBid = jobResults.reduce((s, j) => s + j.bidTotal, 0);
  const totalActual = jobResults.reduce((s, j) => s + j.actualTotal, 0);
  const avgVariancePercent = jobResults.reduce((s, j) => s + j.variancePercent, 0) / jobResults.length;
  const underBudgetCount = jobResults.filter(j => j.variance < 0).length;
  const overBudgetCount = jobResults.filter(j => j.variance > 0).length;
  const onBudgetCount = jobResults.filter(j => j.variance === 0).length;

  // Monthly trend: group by month
  const monthMap = {};
  for (const j of jobResults) {
    const d = new Date(j.createdAt);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (!monthMap[key]) {
      monthMap[key] = { month: key, bidTotal: 0, actualTotal: 0, jobCount: 0, varianceSum: 0 };
    }
    monthMap[key].bidTotal += j.bidTotal;
    monthMap[key].actualTotal += j.actualTotal;
    monthMap[key].jobCount += 1;
    monthMap[key].varianceSum += j.variancePercent;
  }

  const trend = Object.values(monthMap)
    .sort((a, b) => a.month.localeCompare(b.month))
    .map(m => ({
      month: m.month,
      bidTotal: Math.round(m.bidTotal * 100) / 100,
      actualTotal: Math.round(m.actualTotal * 100) / 100,
      avgVariancePercent: Math.round((m.varianceSum / m.jobCount) * 10) / 10,
      jobCount: m.jobCount,
    }));

  return {
    hasData: true,
    dateRange: { start: start.toISOString(), end: end.toISOString() },
    jobCount: jobResults.length,
    summary: {
      totalBid: Math.round(totalBid * 100) / 100,
      totalActual: Math.round(totalActual * 100) / 100,
      totalVariance: Math.round((totalActual - totalBid) * 100) / 100,
      avgVariancePercent: Math.round(avgVariancePercent * 10) / 10,
      underBudgetCount,
      overBudgetCount,
      onBudgetCount,
      accuracy: Math.round((1 - Math.abs(avgVariancePercent) / 100) * 1000) / 10, // % accuracy
    },
    trend,
    jobs: jobResults,
  };
}

module.exports = {
  getItemCostAnalysis,
  getCompanyAnalytics,
  generateBidEstimate,
  getProductivityRates,
  compareBidToActual,
  getCompanyBidAccuracy,
};

