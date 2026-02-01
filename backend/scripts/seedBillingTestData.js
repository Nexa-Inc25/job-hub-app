/**
 * Seed Billing Test Data
 * 
 * Creates sample unit entries and claims for testing the BillingDashboard.
 * Run with: node scripts/seedBillingTestData.js
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const User = require('../models/User');
const Job = require('../models/Job');
const UnitEntry = require('../models/UnitEntry');
const Claim = require('../models/Claim');

async function seedBillingData() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected!\n');

    // Find a job first, then find a user in that company
    const job = await Job.findOne({ isDeleted: { $ne: true } }).sort({ createdAt: -1 });
    if (!job) {
      console.error('No jobs found. Please create a job first.');
      process.exit(1);
    }
    console.log(`Using job: ${job.pmNumber || job.jobName || job._id}`);

    // Find or get user with matching company
    let user = await User.findOne({ companyId: job.companyId });
    if (!user) {
      // Use any user and update their companyId
      user = await User.findOne({});
      if (!user) {
        console.error('No users found. Please create a user first.');
        process.exit(1);
      }
      user.companyId = job.companyId;
      await user.save();
      console.log(`Updated user ${user.email} with companyId: ${job.companyId}`);
    }
    console.log(`Using user: ${user.name || 'Unknown'} (${user.email}), Company: ${user.companyId}`);

    // Find or create a price book
    const PriceBook = require('../models/PriceBook');
    let priceBook = await PriceBook.findOne({ companyId: job.companyId });
    if (!priceBook) {
      priceBook = await PriceBook.create({
        companyId: job.companyId,
        utilityId: job.utilityId,
        name: 'Test Price Book',
        effectiveDate: new Date(),
        status: 'active',
        items: [
          { itemCode: 'OH-101', description: 'Install 40ft Wood Pole', unit: 'EA', unitPrice: 2500.00, category: 'overhead', subcategory: 'Poles' },
          { itemCode: 'OH-102', description: 'Install Crossarm Assembly', unit: 'EA', unitPrice: 450.00, category: 'overhead', subcategory: 'Hardware' },
          { itemCode: 'OH-103', description: 'String Primary Conductor', unit: 'FT', unitPrice: 8.50, category: 'electrical', subcategory: 'Conductor' },
          { itemCode: 'UG-201', description: 'Trench and Backfill', unit: 'FT', unitPrice: 25.00, category: 'underground', subcategory: 'Civil' },
          { itemCode: 'UG-202', description: 'Install Pad Mount Transformer', unit: 'EA', unitPrice: 3200.00, category: 'underground', subcategory: 'Equipment' },
          { itemCode: 'TC-301', description: 'Traffic Control Setup', unit: 'HR', unitPrice: 125.00, category: 'traffic_control', subcategory: 'Setup' },
        ],
        createdBy: user._id,
      });
      console.log(`Created test price book: ${priceBook.name}`);
    } else {
      console.log(`Using existing price book: ${priceBook.name}`);
    }

    // Sample items from price book
    const sampleItems = priceBook.items.slice(0, 6).map(item => ({
      _id: item._id,
      itemCode: item.itemCode,
      description: item.description,
      unit: item.unit,
      unitPrice: item.unitPrice,
      category: item.category,
    }));

    // Create unit entries in various statuses
    const statuses = ['submitted', 'submitted', 'verified', 'verified', 'approved', 'approved', 'approved'];
    const tiers = ['prime', 'prime', 'sub', 'prime', 'sub_of_sub', 'prime', 'sub'];
    const workCategories = ['electrical', 'electrical', 'civil', 'electrical', 'traffic_control', 'electrical', 'civil'];
    
    console.log('\nCreating unit entries...');
    const createdUnits = [];
    
    for (let i = 0; i < 7; i++) {
      const item = sampleItems[i % sampleItems.length];
      const quantity = Math.floor(Math.random() * 10) + 1;
      const workDate = new Date();
      workDate.setDate(workDate.getDate() - Math.floor(Math.random() * 14)); // Random date within last 2 weeks

      const unitEntry = await UnitEntry.create({
        jobId: job._id,
        companyId: user.companyId,
        priceBookId: priceBook._id,
        priceBookItemId: item._id,
        itemCode: item.itemCode,
        description: item.description,
        category: item.category,
        quantity,
        unit: item.unit,
        unitPrice: item.unitPrice,
        totalAmount: quantity * item.unitPrice,
        workDate,
        workCategory: workCategories[i],
        status: statuses[i],
        location: {
          latitude: 37.7749 + (Math.random() * 0.1 - 0.05),
          longitude: -122.4194 + (Math.random() * 0.1 - 0.05),
          accuracy: Math.floor(Math.random() * 30) + 5,
          capturedAt: workDate,
        },
        photos: [{
          url: 'https://via.placeholder.com/400x300?text=Work+Photo',
          thumbnailUrl: 'https://via.placeholder.com/150x100?text=Thumb',
          photoType: 'before',
          capturedAt: workDate,
        }],
        performedBy: {
          tier: tiers[i],
          foremanId: user._id,
          foremanName: user.name || 'Test Foreman',
          workCategory: workCategories[i],
          subContractorName: tiers[i] !== 'prime' ? `Sub Co ${i}` : undefined,
        },
        enteredBy: user._id,
        enteredAt: workDate,
        checksum: `test-hash-${Date.now()}-${i}`,
      });

      createdUnits.push(unitEntry);
      console.log(`  ✓ ${item.itemCode}: ${quantity} ${item.unit} @ $${item.unitPrice} = $${unitEntry.totalAmount.toFixed(2)} [${statuses[i]}]`);
    }

    // Summary
    const submitted = createdUnits.filter(u => u.status === 'submitted').length;
    const verified = createdUnits.filter(u => u.status === 'verified').length;
    const approved = createdUnits.filter(u => u.status === 'approved').length;
    const totalValue = createdUnits.reduce((sum, u) => sum + u.totalAmount, 0);

    console.log('\n=== Test Data Created ===');
    console.log(`Submitted: ${submitted}`);
    console.log(`Verified: ${verified}`);
    console.log(`Approved: ${approved}`);
    console.log(`Total Value: $${totalValue.toFixed(2)}`);
    console.log('\nNow log in as a PM/GF user and go to /billing to see the dashboard!');

    await mongoose.disconnect();
    console.log('\nDone!');
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

seedBillingData();

