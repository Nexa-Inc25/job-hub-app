# API Versioning

## Overview

The Job Hub Pro API uses URL-based versioning to ensure backwards compatibility as the API evolves.

## Current Versions

| Version | Status | Base URL | Notes |
|---------|--------|----------|-------|
| v1 | **Stable** | `/api/v1/` | Current production version |
| (unversioned) | Legacy | `/api/` | Deprecated, use v1 |

## Usage

### Recommended (Versioned)
```bash
# Use explicit version
curl https://api.jobhubpro.com/api/v1/jobs
curl https://api.jobhubpro.com/api/v1/auth/login
```

### Legacy (Unversioned)
```bash
# Still works but deprecated
curl https://api.jobhubpro.com/api/jobs
```

## Version Lifecycle

1. **Stable** - Production ready, fully supported
2. **Deprecated** - Still works, but will be removed in future
3. **Sunset** - No longer available

## Deprecation Policy

- New versions are announced at least 6 months before old versions are deprecated
- Deprecated versions continue to work for 12 months after deprecation notice
- Response headers include deprecation warnings:
  ```
  X-API-Deprecated: true
  X-API-Sunset-Date: 2027-01-01
  X-API-Upgrade-To: v2
  ```

## Breaking Changes

Breaking changes require a new major version:
- Removing endpoints
- Changing response structure
- Removing required fields
- Changing authentication methods

Non-breaking changes can be added to existing versions:
- Adding new endpoints
- Adding optional fields
- Adding new query parameters
- Bug fixes

## Version Header (Optional)

You can also specify version via header:
```
X-API-Version: 1
```

The URL version takes precedence if both are specified.

