/**
 * Navigation Utilities
 * Opens native maps apps with directions to a destination
 */

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

  // Detect platform
  const userAgent = navigator.userAgent || navigator.vendor || window.opera;
  const isIOS = /iPad|iPhone|iPod/.test(userAgent) && !window.MSStream;
  const isAndroid = /Android/.test(userAgent);

  if (isIOS) {
    // Apple Maps - uses maps:// scheme
    window.location.href = `maps://maps.apple.com/?daddr=${destination}&dirflg=d`;
    return true;
  } else if (isAndroid) {
    // Google Maps app - uses geo: scheme with navigation intent
    window.location.href = `google.navigation:q=${destination}`;
    return true;
  } else {
    // Desktop - open Google Maps in new tab
    window.open(
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
  const userAgent = navigator.userAgent || navigator.vendor || window.opera;
  const isIOS = /iPad|iPhone|iPod/.test(userAgent) && !window.MSStream;
  const isAndroid = /Android/.test(userAgent);
  return isIOS || isAndroid;
}

/**
 * Get the name of the maps app that will be used
 * @returns {string}
 */
export function getMapsAppName() {
  const userAgent = navigator.userAgent || navigator.vendor || window.opera;
  const isIOS = /iPad|iPhone|iPod/.test(userAgent) && !window.MSStream;
  const isAndroid = /Android/.test(userAgent);
  
  if (isIOS) return 'Apple Maps';
  if (isAndroid) return 'Google Maps';
  return 'Google Maps';
}

