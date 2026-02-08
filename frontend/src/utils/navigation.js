/**
 * Navigation Utilities
 * Opens native maps apps with directions to a destination
 */

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

  // Build full address
  const parts = [address];
  if (city) parts.push(city);
  if (state) parts.push(state);
  const destination = encodeURIComponent(parts.join(', '));

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
