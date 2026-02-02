/**
 * Fix Orphaned Units
 * 
 * Finds unit entries that are missing price book data and attempts to repair them
 * by looking up the data from the price book, or optionally deleting them.
 * 
 * Run with: node scripts/fixOrphanedUnits.js [--delete]
 */

const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const UnitEntry = require('../models/UnitEntry');
const PriceBook = require('../models/PriceBook');

const DRY_RUN = !process.argv.includes('--execute');
const DELETE_MODE = process.argv.includes('--delete');

async function fixOrphanedUnits() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected!\n');

    if (DRY_RUN) {
      console.log('=== DRY RUN MODE (add --execute to make changes) ===\n');
    }

    // Find units with missing required price book data
    const orphanedUnits = await UnitEntry.find({
      $or: [
        { itemCode: { $exists: false } },
        { itemCode: null },
        { itemCode: '' },
        { description: { $exists: false } },
        { description: null },
        { description: '' },
        { unitPrice: { $exists: false } },
        { unitPrice: null },
        { unitPrice: 0 },
        { totalAmount: { $exists: false } },
        { totalAmount: null },
      ]
    });

    console.log(`Found ${orphanedUnits.length} units with missing price data\n`);

    if (orphanedUnits.length === 0) {
      console.log('✓ All units have proper price data!');
      await mongoose.disconnect();
      return;
    }

    let fixed = 0;
    let unfixable = 0;
    let deleted = 0;

    for (const unit of orphanedUnits) {
      console.log(`\n--- Unit ${unit._id} ---`);
      console.log(`  Status: ${unit.status}`);
      console.log(`  Job: ${unit.jobId}`);
      console.log(`  PriceBook: ${unit.priceBookId}`);
      console.log(`  PriceBookItem: ${unit.priceBookItemId}`);
      console.log(`  Current Data:`);
      console.log(`    itemCode: ${unit.itemCode || '(missing)'}`);
      console.log(`    description: ${unit.description || '(missing)'}`);
      console.log(`    unitPrice: ${unit.unitPrice ?? '(missing)'}`);
      console.log(`    totalAmount: ${unit.totalAmount ?? '(missing)'}`);
      console.log(`    quantity: ${unit.quantity}`);

      if (DELETE_MODE) {
        console.log('  Action: DELETE');
        if (!DRY_RUN) {
          await UnitEntry.deleteOne({ _id: unit._id });
        }
        deleted++;
        continue;
      }

      // Try to find the price book item
      let rateItem = null;
      
      if (unit.priceBookId && unit.priceBookItemId) {
        const priceBook = await PriceBook.findById(unit.priceBookId);
        if (priceBook) {
          rateItem = priceBook.items.id(unit.priceBookItemId);
        }
      }

      if (!rateItem && unit.itemCode && unit.priceBookId) {
        // Try by item code
        const priceBook = await PriceBook.findById(unit.priceBookId);
        if (priceBook) {
          rateItem = priceBook.items.find(i => i.itemCode === unit.itemCode);
        }
      }

      if (rateItem) {
        console.log('  Found matching price book item!');
        console.log(`    itemCode: ${rateItem.itemCode}`);
        console.log(`    description: ${rateItem.description}`);
        console.log(`    unitPrice: ${rateItem.unitPrice}`);
        
        if (!DRY_RUN) {
          unit.itemCode = rateItem.itemCode;
          unit.description = rateItem.description;
          unit.unit = rateItem.unit;
          unit.unitPrice = rateItem.unitPrice;
          unit.totalAmount = unit.quantity * rateItem.unitPrice;
          unit.category = rateItem.category;
          await unit.save();
        }
        console.log('  Action: REPAIR');
        fixed++;
      } else {
        console.log('  Could not find matching price book item');
        console.log('  Action: SKIP (use --delete to remove these)');
        unfixable++;
      }
    }

    console.log('\n=== Summary ===');
    console.log(`Total orphaned: ${orphanedUnits.length}`);
    if (DELETE_MODE) {
      console.log(`Deleted: ${deleted}${DRY_RUN ? ' (would be)' : ''}`);
    } else {
      console.log(`Fixed: ${fixed}${DRY_RUN ? ' (would be)' : ''}`);
      console.log(`Unfixable: ${unfixable}`);
    }

    if (DRY_RUN) {
      console.log('\n👆 This was a dry run. Add --execute to make changes.');
      console.log('   Add --delete to remove unfixable units instead of repairing.');
    }

    await mongoose.disconnect();
    console.log('\nDone!');
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

fixOrphanedUnits();

