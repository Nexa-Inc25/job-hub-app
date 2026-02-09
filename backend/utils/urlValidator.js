/**
 * FieldLedger - URL Validation Utility
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * 
 * Prevents Server-Side Request Forgery (SSRF) attacks by validating
 * URLs before server-side requests are made.
 * 
 * Security Features:
 * - Blocks private/internal IP ranges (10.x, 172.16-31.x, 192.168.x, 127.x, 169.254.x)
 * - Blocks localhost and loopback addresses
 * - Blocks cloud metadata endpoints (169.254.169.254, fd00::, etc.)
 * - Allowlist-based domain validation
 * - Protocol restriction (only https allowed by default)
 */

const { URL } = require('node:url');
const dns = require('node:dns').promises;
const net = require('node:net');

// Allowed domains for external fetches (whitelist approach)
const ALLOWED_DOMAINS = new Set([
  // FieldLedger's own domains
  'fieldledger.io',
  'api.fieldledger.io',
  'app.fieldledger.io',
  
  // Cloudflare R2 storage
  'r2.cloudflarestorage.com',
  
  // Add other trusted domains as needed
  // 'example-trusted-cdn.com',
]);

// Patterns to match allowed domain suffixes (for subdomains)
const ALLOWED_DOMAIN_PATTERNS = [
  /\.r2\.cloudflarestorage\.com$/,
  /\.fieldledger\.io$/,
  /\.cloudflare\.com$/,
];

// Private/internal IP ranges to block
const PRIVATE_IP_RANGES = [
  // IPv4 private ranges
  { start: '10.0.0.0', end: '10.255.255.255' },       // Class A private
  { start: '172.16.0.0', end: '172.31.255.255' },     // Class B private
  { start: '192.168.0.0', end: '192.168.255.255' },   // Class C private
  { start: '127.0.0.0', end: '127.255.255.255' },     // Loopback
  { start: '169.254.0.0', end: '169.254.255.255' },   // Link-local (includes cloud metadata!)
  { start: '0.0.0.0', end: '0.255.255.255' },         // "This" network
  { start: '100.64.0.0', end: '100.127.255.255' },    // Carrier-grade NAT
  { start: '192.0.0.0', end: '192.0.0.255' },         // IETF Protocol Assignments
  { start: '192.0.2.0', end: '192.0.2.255' },         // TEST-NET-1
  { start: '198.51.100.0', end: '198.51.100.255' },   // TEST-NET-2
  { start: '203.0.113.0', end: '203.0.113.255' },     // TEST-NET-3
  { start: '224.0.0.0', end: '239.255.255.255' },     // Multicast
  { start: '240.0.0.0', end: '255.255.255.255' },     // Reserved
];

// Blocked hostnames (case-insensitive)
const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  'metadata.google.internal',
  'metadata.google',
  'metadata',
  'kubernetes.default',
  'kubernetes.default.svc',
  'kubernetes.default.svc.cluster.local',
]);

/**
 * Convert IP address string to numeric value for range comparison
 */
function ipToNumber(ip) {
  const parts = ip.split('.').map(Number);
  return (parts[0] << 24) + (parts[1] << 16) + (parts[2] << 8) + parts[3];
}

/**
 * Check if an IP address is in a private range
 */
function isPrivateIP(ip) {
  // Handle IPv6 loopback
  if (ip === '::1' || ip === '::' || ip.startsWith('fe80:') || ip.startsWith('fd')) {
    return true;
  }
  
  // Only process IPv4 for range checks
  if (!net.isIPv4(ip)) {
    // For IPv6, block private/link-local ranges
    return ip.startsWith('fe80:') || ip.startsWith('fd') || ip.startsWith('fc');
  }
  
  const ipNum = ipToNumber(ip);
  
  for (const range of PRIVATE_IP_RANGES) {
    const startNum = ipToNumber(range.start);
    const endNum = ipToNumber(range.end);
    if (ipNum >= startNum && ipNum <= endNum) {
      return true;
    }
  }
  
  return false;
}

/**
 * Check if a hostname is explicitly blocked
 */
function isBlockedHostname(hostname) {
  const lower = hostname.toLowerCase();
  return BLOCKED_HOSTNAMES.has(lower) || 
         lower.endsWith('.internal') ||
         lower.endsWith('.local') ||
         lower.endsWith('.localhost');
}

/**
 * Check if a domain is in the allowlist
 */
function isAllowedDomain(hostname) {
  const lower = hostname.toLowerCase();
  
  // Check exact match
  if (ALLOWED_DOMAINS.has(lower)) {
    return true;
  }
  
  // Check pattern match (for subdomains)
  for (const pattern of ALLOWED_DOMAIN_PATTERNS) {
    if (pattern.test(lower)) {
      return true;
    }
  }
  
  return false;
}

/**
 * Validate a URL for safe server-side fetching
 * 
 * @param {string} urlString - The URL to validate
 * @param {Object} options - Validation options
 * @param {boolean} options.allowHttp - Allow http:// protocol (default: false)
 * @param {boolean} options.requireAllowlist - Require domain to be in allowlist (default: true)
 * @param {boolean} options.resolveDNS - Resolve DNS and check IP (default: true)
 * @returns {Promise<{valid: boolean, error?: string, url?: URL}>}
 */
async function validateUrl(urlString, options = {}) {
  const {
    allowHttp = false,
    requireAllowlist = true,
    resolveDNS = true,
  } = options;
  
  // Parse URL
  let parsedUrl;
  try {
    parsedUrl = new URL(urlString);
  } catch {
    return { valid: false, error: 'Invalid URL format' };
  }
  
  // Check protocol
  const allowedProtocols = allowHttp ? ['https:', 'http:'] : ['https:'];
  if (!allowedProtocols.includes(parsedUrl.protocol)) {
    return { valid: false, error: `Protocol not allowed: ${parsedUrl.protocol}` };
  }
  
  // Check for blocked hostnames
  if (isBlockedHostname(parsedUrl.hostname)) {
    return { valid: false, error: 'Hostname is blocked' };
  }
  
  // Check if hostname is an IP address directly
  if (net.isIP(parsedUrl.hostname)) {
    if (isPrivateIP(parsedUrl.hostname)) {
      return { valid: false, error: 'Private/internal IP addresses are not allowed' };
    }
  }
  
  // Check allowlist (if required)
  if (requireAllowlist && !isAllowedDomain(parsedUrl.hostname)) {
    return { valid: false, error: `Domain not in allowlist: ${parsedUrl.hostname}` };
  }
  
  // DNS resolution check (prevents DNS rebinding attacks)
  if (resolveDNS && !net.isIP(parsedUrl.hostname)) {
    try {
      const addresses = await dns.resolve4(parsedUrl.hostname);
      
      for (const ip of addresses) {
        if (isPrivateIP(ip)) {
          return { 
            valid: false, 
            error: `Domain resolves to private IP: ${ip}` 
          };
        }
      }
    } catch (dnsError) {
      // DNS resolution failed - could be temporary or invalid domain
      console.warn('[URLValidator] DNS resolution failed:', parsedUrl.hostname, dnsError.code);
      // Allow to proceed if in allowlist (trust the allowlist)
      if (!isAllowedDomain(parsedUrl.hostname)) {
        return { valid: false, error: 'DNS resolution failed' };
      }
    }
  }
  
  return { valid: true, url: parsedUrl };
}

/**
 * Check if a URL is safe for server-side fetching (synchronous check, no DNS)
 * Use this for quick validation when DNS lookup is not needed
 */
function isUrlSafeSync(urlString, options = {}) {
  const {
    allowHttp = false,
    requireAllowlist = true,
  } = options;
  
  try {
    const parsedUrl = new URL(urlString);
    
    // Check protocol
    const allowedProtocols = allowHttp ? ['https:', 'http:'] : ['https:'];
    if (!allowedProtocols.includes(parsedUrl.protocol)) {
      return false;
    }
    
    // Check for blocked hostnames
    if (isBlockedHostname(parsedUrl.hostname)) {
      return false;
    }
    
    // Check if hostname is a private IP
    if (net.isIP(parsedUrl.hostname) && isPrivateIP(parsedUrl.hostname)) {
      return false;
    }
    
    // Check allowlist
    if (requireAllowlist && !isAllowedDomain(parsedUrl.hostname)) {
      return false;
    }
    
    return true;
  } catch {
    return false;
  }
}

/**
 * Sanitize and validate a URL, returning null if invalid
 */
async function sanitizeUrl(urlString, options = {}) {
  const result = await validateUrl(urlString, options);
  return result.valid ? result.url.href : null;
}

module.exports = {
  validateUrl,
  isUrlSafeSync,
  sanitizeUrl,
  isPrivateIP,
  isAllowedDomain,
  ALLOWED_DOMAINS,
  ALLOWED_DOMAIN_PATTERNS,
};

