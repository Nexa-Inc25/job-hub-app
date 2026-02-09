#!/bin/bash
# Add FieldLedger copyright headers to source files
# Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.

COPYRIGHT_HEADER="/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */"

# Find all JS/JSX files without copyright headers (excluding build artifacts)
find . \( -name "*.js" -o -name "*.jsx" \) \
  ! -path "*/node_modules/*" \
  ! -path "*/.min.js" \
  ! -path "*/ios/App/*" \
  ! -path "*/build/*" \
  ! -path "*service-worker*" \
  ! -path "*/coverage/*" \
  -exec grep -L "Copyright" {} \; 2>/dev/null | while read file; do
  
  echo "Adding header to: $file"
  
  # Create temp file with header + original content
  echo "$COPYRIGHT_HEADER" > "$file.tmp"
  cat "$file" >> "$file.tmp"
  mv "$file.tmp" "$file"
  
done

echo "Done! Copyright headers added."

