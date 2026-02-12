/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
/**
 * Navigation Utilities
 * Opens native maps apps with directions to a destination
 */

/**
 * Clean PG&E pole notation from address strings
 * PG&E uses prefixes like "2PN/O", "3PS/O", "1PE/O", "1PW/O" to indicate
 * pole locations relative to an address (N/O = North Of, S/O = South Of, etc.)
 * 
 * Examples:
 * - "2PN/O 105 HIGHLAND AV" -> "105 HIGHLAND AV"
 * - "3PS/O 456 OAK ST" -> "456 OAK ST"
 * - "1PE/O 789 MAIN BLVD" -> "789 MAIN BLVD"
 * - "1PW/O 123 ELM DR" -> "123 ELM DR"
 * - "O/H ADJ 100 PINE ST" -> "100 PINE ST"
 * - "ADJ TO 200 MAPLE AVE" -> "200 MAPLE AVE"
 * 
 * @param {string} address - Raw address that may contain pole notation
 * @returns {string} - Cleaned address suitable for navigation
 */
function cleanPoleNotation(address) {
  if (!address || typeof address !== 'string') return address;
  
  // Pattern: [digit]P[N/S/E/W]/O - e.g., "2PN/O", "3PS/O", "1PE/O", "1PW/O"
  // Also matches: "O/H ADJ", "ADJ TO", "NEAR", "AT", "BTW" (between)
  const polePatterns = [
    /^\d+P[NSEW]\/O\s+/i,           // "2PN/O ", "3PS/O ", etc.
    /^\d+\s*POLES?\s*[NSEW]\/O\s+/i, // "2 POLES N/O ", "1 POLE S/O "
    /^O\/H\s+ADJ\s+/i,               // "O/H ADJ " (overhead adjacent)
    /^ADJ\s+TO\s+/i,                 // "ADJ TO "
    /^NEAR\s+/i,                     // "NEAR "
    /^AT\s+/i,                       // "AT "
    /^BTW\s+.*?\s+AND\s+/i,          // "BTW X AND " (between)
    /^[NSEW]\/S\s+OF\s+/i,           // "N/S OF ", "E/S OF " (north side of, etc.)
    /^[NSEW]\s+OF\s+/i,              // "N OF ", "S OF "
  ];
  
  let cleaned = address.trim();
  
  for (const pattern of polePatterns) {
    cleaned = cleaned.replace(pattern, '');
  }
  
  return cleaned.trim();
}

/**
 * Get user agent string for platform detection
 * @returns {string}
 */
function getUserAgent() {
  return navigator.userAgent || '';
}

/**
 * Check if running on iOS
 * @returns {boolean}
 */
function isIOSDevice() {
  return /iPad|iPhone|iPod/.test(getUserAgent());
}

/**
 * Check if running on Android
 * @returns {boolean}
 */
function isAndroidDevice() {
  return /Android/.test(getUserAgent());
}

/**
 * Open directions to a job address in the native maps app
 * - iOS: Opens Apple Maps
 * - Android: Opens Google Maps app
 * - Desktop: Opens Google Maps in new tab
 * 
 * @param {string} address - Street address
 * @param {string} city - City name (optional)
 * @param {string} state - State (optional, defaults to CA for PG&E territory)
 */
export function openDirections(address, city, state = 'CA') {
  if (!address) {
    console.warn('[Navigation] No address provided');
    return false;
  }

  // Clean PG&E pole notation from address (e.g., "2PN/O 105 MAIN ST" -> "105 MAIN ST")
  const cleanedAddress = cleanPoleNotation(address);
  
  if (!cleanedAddress) {
    console.warn('[Navigation] Address empty after cleaning pole notation:', address);
    return false;
  }

  // Build full address
  const parts = [cleanedAddress];
  if (city) parts.push(city);
  if (state) parts.push(state);
  const destination = encodeURIComponent(parts.join(', '));

  console.warn('[Navigation] Opening directions to:', parts.join(', '), '(original:', address, ')');

  if (isIOSDevice()) {
    // Apple Maps - uses maps:// scheme
    globalThis.location.href = `maps://maps.apple.com/?daddr=${destination}&dirflg=d`;
    return true;
  } else if (isAndroidDevice()) {
    // Google Maps app - uses geo: scheme with navigation intent
    globalThis.location.href = `google.navigation:q=${destination}`;
    return true;
  } else {
    // Desktop - open Google Maps in new tab
    globalThis.open(
      `https://www.google.com/maps/dir/?api=1&destination=${destination}&travelmode=driving`,
      '_blank'
    );
    return true;
  }
}

/**
 * Check if the device supports native navigation
 * @returns {boolean}
 */
export function supportsNativeNavigation() {
  return isIOSDevice() || isAndroidDevice();
}

/**
 * Get the name of the maps app that will be used
 * @returns {string}
 */
export function getMapsAppName() {
  if (isIOSDevice()) return 'Apple Maps';
  if (isAndroidDevice()) return 'Google Maps';
  return 'Google Maps';
}
