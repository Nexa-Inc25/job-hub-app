# Third-Party Licenses

Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.

This document lists all third-party open source software packages used by FieldLedger,
along with their respective licenses. FieldLedger is grateful to the open source
community for these valuable contributions.

## License Summary

### Backend Dependencies (Production)

| License Type | Count |
|-------------|-------|
| MIT | 292 |
| Apache-2.0 | 122 |
| ISC | 33 |
| BSD-2-Clause | 7 |
| BSD-3-Clause | 4 |
| BlueOak-1.0.0 | 3 |
| 0BSD | 2 |
| LGPL-3.0-or-later | 1 |
| LGPL-3.0 | 1 |
| MIT-0 | 1 |
| Python-2.0 | 1 |
| Unlicense | 1 |
| Other (OR combinations) | 3 |

### Frontend Dependencies (Production)

| License Type | Count |
|-------------|-------|
| MIT | 233 |
| ISC | 22 |
| Apache-2.0 | 8 |
| BSD-3-Clause | 5 |
| 0BSD | 2 |
| MPL-2.0 | 1 |
| Other (OR combinations) | 3 |

## License Compatibility Notes

### LGPL-Licensed Packages

The following packages are licensed under LGPL-3.0:

1. **@img/sharp-libvips-darwin-arm64** (LGPL-3.0-or-later)
   - Used for: Image processing (compression, resizing)
   - Usage: Dynamic linking via npm package (not modified)
   - SaaS Note: LGPL allows use in SaaS without source disclosure since the software is not distributed

2. **libheif-js** (LGPL-3.0)
   - Used for: HEIC/HEIF image format conversion
   - Usage: Used as-is via npm package (not modified)
   - SaaS Note: Same as above - SaaS usage is compliant

### Permissive Licenses

The vast majority of dependencies (98%+) use permissive licenses (MIT, Apache-2.0, ISC, BSD)
which are fully compatible with proprietary software and SaaS business models.

## Major Dependencies

### Backend Core

| Package | Version | License | Purpose |
|---------|---------|---------|---------|
| express | ^4.x | MIT | Web framework |
| mongoose | ^8.x | MIT | MongoDB ODM |
| jsonwebtoken | ^9.x | MIT | JWT authentication |
| bcryptjs | ^2.x | MIT | Password hashing |
| socket.io | ^4.x | MIT | Real-time websockets |
| helmet | ^7.x | MIT | Security headers |
| cors | ^2.x | MIT | CORS middleware |
| multer | ^1.x | MIT | File uploads |
| pdf-lib | ^1.x | MIT | PDF generation |
| openai | ^4.x | Apache-2.0 | AI integration |
| @aws-sdk/client-s3 | ^3.x | Apache-2.0 | Cloud storage |
| resend | ^4.x | MIT | Email delivery |
| sharp | ^0.x | Apache-2.0 | Image processing |

### Frontend Core

| Package | Version | License | Purpose |
|---------|---------|---------|---------|
| react | ^18.x | MIT | UI framework |
| react-dom | ^18.x | MIT | DOM rendering |
| react-router-dom | ^6.x | MIT | Client routing |
| @mui/material | ^5.x | MIT | UI component library |
| @emotion/react | ^11.x | MIT | CSS-in-JS styling |
| axios | ^1.x | MIT | HTTP client |
| socket.io-client | ^4.x | MIT | Websocket client |
| react-pdf | ^7.x | MIT | PDF viewer |
| pdf-lib | ^1.x | MIT | PDF manipulation |
| recharts | ^2.x | MIT | Charts/graphs |
| @capacitor/core | ^8.x | MIT | Mobile app framework |

## Full Dependency Lists

For complete dependency listings, run:

```bash
# Backend
cd backend && npx license-checker --production --csv

# Frontend
cd frontend && npx license-checker --production --csv
```

## Updates

This document was last updated: February 2026

For questions about licensing, contact: legal@fieldledger.io

