/**
 * LME Form Constants
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 */

// PG&E craft codes
export const CRAFT_CODES = [
  { code: 'GF', label: 'General Foreman' },
  { code: 'F', label: 'Foreman' },
  { code: 'JL', label: 'Journeyman Lineman' },
  { code: 'AL', label: 'Apprentice Lineman' },
  { code: 'GM', label: 'Groundman' },
  { code: 'EO', label: 'Equipment Operator' },
  { code: 'FL', label: 'Flagger' },
  { code: 'LAB', label: 'Laborer' },
  { code: 'DR', label: 'Driver' },
  { code: 'CAB', label: 'Cable Splicer' },
  { code: 'EL', label: 'Electrician' },
];

// Rate types
export const RATE_TYPES = [
  { code: 'ST', label: 'Straight Time', multiplier: 1 },
  { code: 'OT', label: 'Overtime (1.5x)', multiplier: 1.5 },
  { code: 'PT', label: 'Premium Time', multiplier: 1.5 },
  { code: 'DT', label: 'Double Time', multiplier: 2 },
];

// Equipment types commonly used
export const EQUIPMENT_TYPES = [
  'Bucket Truck',
  'Digger Derrick',
  'Crane',
  'Flatbed Truck',
  'Pickup Truck',
  'Backhoe',
  'Trencher',
  'Air Compressor',
  'Generator',
  'Trailer',
  'Pole Trailer',
  'Wire Trailer',
];
