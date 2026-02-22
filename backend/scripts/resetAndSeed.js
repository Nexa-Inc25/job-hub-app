/**
 * FieldLedger - Database Reset & Seed Script
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 *
 * Wipes all data EXCEPT super admin users (Mike & Spencer),
 * then seeds utilities, companies, and sample users.
 *
 * Usage:
 *   node scripts/resetAndSeed.js              # interactive confirmation
 *   node scripts/resetAndSeed.js --force      # skip confirmation
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const readline = require('readline');

// Models
const User = require('../models/User');
const Company = require('../models/Company');
const Utility = require('../models/Utility');
const Job = require('../models/Job');
const Claim = require('../models/Claim');
const UnitEntry = require('../models/UnitEntry');
const PriceBook = require('../models/PriceBook');
const FieldTicket = require('../models/FieldTicket');
const Tailboard = require('../models/Tailboard');
const LME = require('../models/LME');
const Timesheet = require('../models/Timesheet');
const Notification = require('../models/Notification');
const AuditLog = require('../models/AuditLog');
const AsBuiltSubmission = require('../models/AsBuiltSubmission');
const UtilityAsBuiltConfig = require('../models/UtilityAsBuiltConfig');
const RoutingRule = require('../models/RoutingRule');
const FormTemplate = require('../models/FormTemplate');
const AITrainingData = require('../models/AITrainingData');
const APIUsage = require('../models/APIUsage');
const SpecDocument = require('../models/SpecDocument');
const ContractRates = require('../models/ContractRates');
const Feedback = require('../models/Feedback');

// As-Built config seeds
const { getPGEConfig } = require('../seeds/pge-asbuilt-config');
const { getSCEConfig } = require('../seeds/sce-asbuilt-config');

// ============================================================================
// SUPER ADMINS TO PRESERVE
// ============================================================================
const PRESERVED_EMAILS = [
  'mike.v.moore@protonmail.com',
  'spencercook21@yahoo.com',
];

// ============================================================================
// UTILITY DEFINITIONS
// ============================================================================
const UTILITIES = [
  {
    name: 'Pacific Gas & Electric',
    slug: 'pge',
    shortName: 'PG&E',
    region: 'California',
    contactEmail: 'contractorservices@pge.com',
    contractorPortalUrl: 'https://contractor.pge.com',
    erpIntegration: {
      oracleBusinessUnit: 'PGE_BU',
      sapCompanyCode: '1000',
      masterContractNumber: 'MSA-PGE-2024',
    },
    folderStructure: [
      { name: 'ACI', subfolders: ['Face Sheet', 'Crew Instructions', 'Crew Materials'] },
      { name: 'UTC', subfolders: ['Construction Sketch', 'Circuit Map'] },
      { name: 'Permits', subfolders: ['Encroachment', 'City', 'County'] },
      { name: 'Safety', subfolders: ['Tailboard', 'TCP'] },
      { name: 'Billing', subfolders: ['Unit Price', 'Field Tickets'] },
      { name: 'As-Built', subfolders: ['CCSC', 'EC Tag', 'Photos'] },
    ],
  },
  {
    name: 'Xcel Energy',
    slug: 'xcel',
    shortName: 'Xcel',
    region: 'Colorado / Minnesota',
    contactEmail: 'contractorrelations@xcelenergy.com',
    contractorPortalUrl: 'https://contractors.xcelenergy.com',
    erpIntegration: {
      oracleBusinessUnit: 'XCEL_BU',
      masterContractNumber: 'MSA-XCEL-2024',
    },
    folderStructure: [
      { name: 'Work Package', subfolders: ['Design', 'Permits', 'Materials'] },
      { name: 'Field Docs', subfolders: ['Tailboard', 'Daily Log', 'Photos'] },
      { name: 'Completion', subfolders: ['As-Built', 'Inspection', 'Billing'] },
    ],
  },
  {
    name: 'DTE Energy',
    slug: 'dte',
    shortName: 'DTE',
    region: 'Michigan',
    contactEmail: 'contractorsupport@dteenergy.com',
    contractorPortalUrl: 'https://contractors.dteenergy.com',
    erpIntegration: {
      oracleBusinessUnit: 'DTE_BU',
      masterContractNumber: 'MSA-DTE-2025',
    },
    folderStructure: [
      { name: 'Project Docs', subfolders: ['Design', 'Specifications', 'Permits'] },
      { name: 'Construction', subfolders: ['Daily Reports', 'Safety', 'Photos'] },
      { name: 'Closeout', subfolders: ['As-Built', 'Punch List', 'Final Invoice'] },
    ],
  },
];

// ============================================================================
// CONTRACTOR COMPANY DEFINITIONS
// ============================================================================
const COMPANIES = [
  // --- PG&E Contractors ---
  {
    name: 'Alvah Group',
    slug: 'alvah-group',
    utilitySlug: 'pge',
    utilityAffiliation: 'PGE',
    email: 'info@alvah.com',
    phone: '(925) 555-0100',
    address: '1200 Concord Ave',
    city: 'Concord',
    state: 'CA',
    zip: '94520',
    contractorLicense: 'CA-ELEC-789012',
    plan: 'professional',
    seats: 50,
  },
  {
    name: 'Pacific Line Builders',
    slug: 'pacific-line-builders',
    utilitySlug: 'pge',
    utilityAffiliation: 'PGE',
    email: 'office@pacificline.com',
    phone: '(916) 555-0200',
    address: '800 Power Line Rd',
    city: 'Sacramento',
    state: 'CA',
    zip: '95814',
    contractorLicense: 'CA-ELEC-345678',
    plan: 'starter',
    seats: 10,
  },
  // --- Xcel Contractors ---
  {
    name: 'Rocky Mountain Electric',
    slug: 'rocky-mountain-electric',
    utilitySlug: 'xcel',
    utilityAffiliation: 'Xcel',
    email: 'dispatch@rockymtnelectric.com',
    phone: '(303) 555-0300',
    address: '4500 Industrial Blvd',
    city: 'Denver',
    state: 'CO',
    zip: '80216',
    contractorLicense: 'CO-ELEC-112233',
    plan: 'professional',
    seats: 30,
  },
  {
    name: 'Front Range Utilities',
    slug: 'front-range-utilities',
    utilitySlug: 'xcel',
    utilityAffiliation: 'Xcel',
    email: 'info@frontrangeutilities.com',
    phone: '(719) 555-0400',
    address: '220 Pike Peak Ave',
    city: 'Colorado Springs',
    state: 'CO',
    zip: '80903',
    contractorLicense: 'CO-ELEC-445566',
    plan: 'starter',
    seats: 10,
  },
  // --- DTE Contractors ---
  {
    name: 'Great Lakes Power',
    slug: 'great-lakes-power',
    utilitySlug: 'dte',
    utilityAffiliation: 'DTE',
    email: 'office@greatlakespower.com',
    phone: '(313) 555-0500',
    address: '7100 Michigan Ave',
    city: 'Detroit',
    state: 'MI',
    zip: '48210',
    contractorLicense: 'MI-ELEC-778899',
    plan: 'professional',
    seats: 40,
  },
  {
    name: 'Motor City Electric',
    slug: 'motor-city-electric',
    utilitySlug: 'dte',
    utilityAffiliation: 'DTE',
    email: 'info@motorcityelectric.com',
    phone: '(248) 555-0600',
    address: '3300 Woodward Ave',
    city: 'Royal Oak',
    state: 'MI',
    zip: '48073',
    contractorLicense: 'MI-ELEC-001122',
    plan: 'enterprise',
    seats: 100,
  },
];

// ============================================================================
// USER TEMPLATES (per company)
// ============================================================================
function getUsersForCompany(companySlug) {
  const domain = companySlug.replace(/-/g, '') + '.demo';
  return [
    { email: `admin@${domain}`,   name: 'Company Admin', role: 'admin',   isAdmin: true,  canApprove: true  },
    { email: `pm@${domain}`,      name: 'Project Mgr',   role: 'pm',      isAdmin: false, canApprove: true  },
    { email: `gf@${domain}`,      name: 'Gen Foreman',   role: 'gf',      isAdmin: false, canApprove: true  },
    { email: `foreman1@${domain}`, name: 'Foreman A',    role: 'foreman', isAdmin: false, canApprove: false },
    { email: `foreman2@${domain}`, name: 'Foreman B',    role: 'foreman', isAdmin: false, canApprove: false },
    { email: `crew1@${domain}`,   name: 'Crew Lead',     role: 'crew',    isAdmin: false, canApprove: false },
    { email: `crew2@${domain}`,   name: 'Crew Member',   role: 'crew',    isAdmin: false, canApprove: false },
  ];
}

const SEED_PASSWORD = 'FieldLedger2025!';

// ============================================================================
// PLAN → FEATURE MAP
// ============================================================================
function getSubscription(plan, seats) {
  const features = {
    free:         { smartForms: false, oracleExport: false, apiAccess: false, advancedAnalytics: false },
    starter:      { smartForms: false, oracleExport: false, apiAccess: false, advancedAnalytics: false },
    professional: { smartForms: true,  oracleExport: true,  apiAccess: false, advancedAnalytics: true  },
    enterprise:   { smartForms: true,  oracleExport: true,  apiAccess: true,  advancedAnalytics: true  },
  };
  const credits = { free: 10, starter: 100, professional: 500, enterprise: 99999 };
  return {
    plan,
    seats,
    seatsUsed: 0,
    status: 'active',
    features: features[plan],
    aiCreditsIncluded: credits[plan],
    aiCreditsUsed: 0,
  };
}

// ============================================================================
// CONFIRMATION PROMPT
// ============================================================================
async function confirm(message) {
  if (process.argv.includes('--force')) return true;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(`${message} (y/N): `, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === 'y');
    });
  });
}

// ============================================================================
// MAIN
// ============================================================================
async function resetAndSeed() {
  const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!mongoUri) {
    console.error('ERROR: MONGODB_URI or MONGO_URI env var not set');
    process.exit(1);
  }

  console.log('========================================');
  console.log('  FieldLedger - Database Reset & Seed');
  console.log('========================================\n');
  console.log(`  Target: ${mongoUri.substring(0, 40)}...`);
  console.log(`  Preserving: ${PRESERVED_EMAILS.join(', ')}`);
  console.log(`  Utilities:  ${UTILITIES.map(u => u.shortName).join(', ')}`);
  console.log(`  Companies:  ${COMPANIES.length}`);
  console.log(`  Users/Co:   7 (admin, pm, gf, 2 foremen, 2 crew)\n`);

  const ok = await confirm('⚠️  This will DELETE all data except super admins. Continue?');
  if (!ok) {
    console.log('Aborted.');
    process.exit(0);
  }

  console.log('\nConnecting to MongoDB...');
  await mongoose.connect(mongoUri);
  console.log('Connected.\n');

  // ------------------------------------------------------------------
  // STEP 1: Preserve super admins
  // ------------------------------------------------------------------
  console.log('--- Step 1: Preserving super admin accounts ---');
  const preserved = await User.find({
    email: { $in: PRESERVED_EMAILS.map(e => e.toLowerCase()) },
  }).lean();
  console.log(`  Found ${preserved.length} super admin(s) to preserve.`);
  for (const u of preserved) {
    console.log(`    ✓ ${u.name} (${u.email})`);
  }

  // ------------------------------------------------------------------
  // STEP 2: Wipe collections
  // ------------------------------------------------------------------
  console.log('\n--- Step 2: Wiping collections ---');
  const collectionsToWipe = [
    { model: Job,                label: 'Jobs' },
    { model: Claim,              label: 'Claims' },
    { model: UnitEntry,          label: 'UnitEntries' },
    { model: PriceBook,          label: 'PriceBooks' },
    { model: FieldTicket,        label: 'FieldTickets' },
    { model: Tailboard,          label: 'Tailboards' },
    { model: LME,                label: 'LMEs' },
    { model: Timesheet,          label: 'Timesheets' },
    { model: Notification,       label: 'Notifications' },
    { model: AuditLog,           label: 'AuditLogs' },
    { model: AsBuiltSubmission,  label: 'AsBuiltSubmissions' },
    { model: UtilityAsBuiltConfig, label: 'UtilityAsBuiltConfigs' },
    { model: RoutingRule,        label: 'RoutingRules' },
    { model: FormTemplate,       label: 'FormTemplates' },
    { model: AITrainingData,     label: 'AITrainingData' },
    { model: APIUsage,           label: 'APIUsage' },
    { model: SpecDocument,       label: 'SpecDocuments' },
    { model: ContractRates,      label: 'ContractRates' },
    { model: Feedback,           label: 'Feedback' },
    { model: Company,            label: 'Companies' },
    { model: Utility,            label: 'Utilities' },
  ];

  for (const { model, label } of collectionsToWipe) {
    const result = await model.deleteMany({});
    console.log(`  ✗ ${label}: ${result.deletedCount} removed`);
  }

  // Delete all users EXCEPT preserved super admins
  const userDeleteResult = await User.deleteMany({
    email: { $nin: PRESERVED_EMAILS.map(e => e.toLowerCase()) },
  });
  console.log(`  ✗ Users: ${userDeleteResult.deletedCount} removed (${preserved.length} preserved)`);

  // Clear companyId from preserved super admins (companies were deleted)
  await User.updateMany(
    { email: { $in: PRESERVED_EMAILS.map(e => e.toLowerCase()) } },
    { $unset: { companyId: 1 } },
  );

  // ------------------------------------------------------------------
  // STEP 3: Create Utilities
  // ------------------------------------------------------------------
  console.log('\n--- Step 3: Creating Utilities ---');
  const utilityMap = {};
  for (const uDef of UTILITIES) {
    const utility = await Utility.create({
      name: uDef.name,
      slug: uDef.slug,
      shortName: uDef.shortName,
      region: uDef.region,
      contactEmail: uDef.contactEmail,
      contractorPortalUrl: uDef.contractorPortalUrl,
      erpIntegration: uDef.erpIntegration,
      folderStructure: uDef.folderStructure,
      isActive: true,
    });
    utilityMap[uDef.slug] = utility;
    console.log(`  ✓ ${utility.shortName} (${utility.slug}) → ${utility._id}`);
  }

  // ------------------------------------------------------------------
  // STEP 4: Seed As-Built Configs
  // ------------------------------------------------------------------
  console.log('\n--- Step 4: Seeding As-Built Configs ---');
  try {
    const pgeConfig = getPGEConfig();
    await UtilityAsBuiltConfig.create(pgeConfig);
    console.log('  ✓ PG&E As-Built Config (TD-2051P-10)');
  } catch (err) {
    console.warn(`  ⚠ PG&E config: ${err.message}`);
  }
  try {
    const sceConfig = getSCEConfig();
    await UtilityAsBuiltConfig.create(sceConfig);
    console.log('  ✓ SCE As-Built Config');
  } catch (err) {
    console.warn(`  ⚠ SCE config: ${err.message}`);
  }

  // ------------------------------------------------------------------
  // STEP 5: Create Companies
  // ------------------------------------------------------------------
  console.log('\n--- Step 5: Creating Contractor Companies ---');
  const companyMap = {};
  for (const cDef of COMPANIES) {
    const utility = utilityMap[cDef.utilitySlug];
    if (!utility) {
      console.error(`  ✗ Unknown utility slug "${cDef.utilitySlug}" for ${cDef.name}`);
      continue;
    }

    const company = await Company.create({
      name: cDef.name,
      slug: cDef.slug,
      email: cDef.email,
      phone: cDef.phone,
      address: cDef.address,
      city: cDef.city,
      state: cDef.state,
      zip: cDef.zip,
      contractorLicense: cDef.contractorLicense,
      utilities: [utility._id],
      defaultUtility: utility._id,
      utilityAffiliation: cDef.utilityAffiliation,
      subscription: getSubscription(cDef.plan, cDef.seats),
      settings: {
        timezone: cDef.state === 'CA' ? 'America/Los_Angeles'
          : cDef.state === 'CO' ? 'America/Denver'
          : 'America/Detroit',
        defaultDivision: 'DA',
      },
      isActive: true,
    });
    companyMap[cDef.slug] = company;
    console.log(`  ✓ ${company.name} [${cDef.utilityAffiliation}] (${cDef.plan}) → ${company._id}`);
  }

  // ------------------------------------------------------------------
  // STEP 6: Create Users
  // ------------------------------------------------------------------
  console.log('\n--- Step 6: Creating Users ---');
  let totalUsers = 0;

  for (const cDef of COMPANIES) {
    const company = companyMap[cDef.slug];
    if (!company) continue;

    const utility = utilityMap[cDef.utilitySlug];
    const users = getUsersForCompany(cDef.slug);

    console.log(`\n  ${cDef.name} (${cDef.utilityAffiliation}):`);
    for (const uDef of users) {
      const user = new User({
        email: uDef.email,
        password: SEED_PASSWORD,
        name: `${uDef.name} - ${cDef.name.split(' ')[0]}`,
        role: uDef.role,
        isAdmin: uDef.isAdmin,
        canApprove: uDef.canApprove,
        companyId: company._id,
        userType: 'contractor',
      });
      await user.save();
      totalUsers++;
      console.log(`    ✓ ${uDef.role.toUpperCase().padEnd(7)} ${uDef.email}`);
    }

    // Update seat count
    await Company.findByIdAndUpdate(company._id, {
      'subscription.seatsUsed': users.length,
    });
  }

  // Re-confirm super admins have proper flags
  await User.updateMany(
    { email: { $in: PRESERVED_EMAILS.map(e => e.toLowerCase()) } },
    { $set: { isSuperAdmin: true, isAdmin: true, canApprove: true, role: 'admin' } },
  );

  // ------------------------------------------------------------------
  // SUMMARY
  // ------------------------------------------------------------------
  console.log('\n========================================');
  console.log('  SEED COMPLETE');
  console.log('========================================');
  console.log(`  Super Admins:  ${preserved.length}`);
  console.log(`  Utilities:     ${Object.keys(utilityMap).length}`);
  console.log(`  Companies:     ${Object.keys(companyMap).length}`);
  console.log(`  Users Created: ${totalUsers}`);
  console.log(`  Seed Password: ${SEED_PASSWORD}`);
  console.log('========================================\n');

  console.log('  Companies by Utility:');
  for (const uDef of UTILITIES) {
    const companies = COMPANIES.filter(c => c.utilitySlug === uDef.slug);
    console.log(`    ${uDef.shortName}:`);
    for (const c of companies) {
      console.log(`      - ${c.name} (${c.plan})`);
    }
  }

  console.log('\n  Login with any seed user:');
  console.log(`    Email:    admin@alvahgroup.demo  (or pm@, gf@, foreman1@, crew1@, etc.)`);
  console.log(`    Password: ${SEED_PASSWORD}`);
  console.log('\n  Super Admin:');
  for (const p of preserved) {
    console.log(`    ${p.name}: ${p.email}`);
  }
  console.log('');

  await mongoose.disconnect();
  process.exit(0);
}

resetAndSeed().catch((err) => {
  console.error('\nFATAL:', err);
  mongoose.disconnect().finally(() => process.exit(1));
});
