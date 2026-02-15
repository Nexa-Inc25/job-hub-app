/**
 * FieldLedger - SharePoint Adapter
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 *
 * Delivers documents to SharePoint Online document libraries
 * via the Microsoft Graph API. Uses MSAL client-credentials flow
 * for app-only authentication.
 *
 * Each destination maps to a specific site / library / folder structure.
 * Metadata columns are written to the list item after upload.
 */

class SharePointAdapter {
  constructor(destination) {
    this.destination = destination;

    // SharePoint configuration by destination
    this.config = {
      sharepoint_do: {
        siteUrl: process.env.SHAREPOINT_DO_SITE || 'https://pge.sharepoint.com/sites/DistrictOperations',
        libraryName: 'Circuit Maps',
        folderTemplate: '{{year}}/{{circuitId}}',
      },
      sharepoint_permits: {
        siteUrl: process.env.SHAREPOINT_PERMITS_SITE || 'https://pge.sharepoint.com/sites/Permits',
        libraryName: 'Completed Permits',
        folderTemplate: '{{year}}/{{month}}',
      },
      sharepoint_utcs: {
        siteUrl: process.env.SHAREPOINT_UTCS_SITE || 'https://pge.sharepoint.com/sites/UTCS',
        libraryName: 'Traffic Control Plans',
        folderTemplate: '{{year}}/{{pmNumber}}',
      },
    };

    // MSAL auth config (app-only / client-credentials)
    this.tenantId = process.env.SHAREPOINT_TENANT_ID || '';
    this.clientId = process.env.SHAREPOINT_CLIENT_ID || '';
    this.clientSecret = process.env.SHAREPOINT_CLIENT_SECRET || '';
    this.graphBaseUrl = 'https://graph.microsoft.com/v1.0';

    // Token cache (in-memory; production should use distributed cache)
    this._tokenCache = { token: null, expiresAt: 0 };
  }

  // -------------------------------------------------------------------
  // Public API (required adapter interface)
  // -------------------------------------------------------------------

  /**
   * Deliver document to SharePoint
   * @returns {{ success: boolean, details: Object }}
   */
  async deliver(submission, section, _sectionIndex) {
    const config = this.config[this.destination];
    if (!config) {
      return { success: false, details: { error: `Unknown SharePoint destination: ${this.destination}` } };
    }

    const payload = this._buildPayload(submission, section, config);

    // Attempt real upload if credentials are configured
    if (this._isConfigured()) {
      return this._uploadViaGraph(payload);
    }

    // Simulation mode when credentials are absent
    console.warn(`[SharePointAdapter] ${this.destination}: credentials not configured — using mock`);
    return this._simulateUpload(payload);
  }

  // -------------------------------------------------------------------
  // Authentication — MSAL client-credentials flow
  // -------------------------------------------------------------------

  _isConfigured() {
    return !!(this.tenantId && this.clientId && this.clientSecret);
  }

  /**
   * Acquire an access token via the OAuth 2.0 client-credentials grant.
   * Tokens are cached until 5 minutes before expiry.
   */
  async _getAccessToken() {
    const now = Date.now();
    if (this._tokenCache.token && this._tokenCache.expiresAt > now + 300_000) {
      return this._tokenCache.token;
    }

    const tokenUrl = `https://login.microsoftonline.com/${this.tenantId}/oauth2/v2.0/token`;

    const body = new URLSearchParams({
      client_id: this.clientId,
      client_secret: this.clientSecret,
      scope: 'https://graph.microsoft.com/.default',
      grant_type: 'client_credentials',
    });

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`MSAL token request failed (${response.status}): ${text}`);
    }

    const data = await response.json();
    this._tokenCache = {
      token: data.access_token,
      expiresAt: now + data.expires_in * 1000,
    };

    return data.access_token;
  }

  // -------------------------------------------------------------------
  // Graph API Upload Flow
  // -------------------------------------------------------------------

  /**
   * Upload file via Microsoft Graph API:
   * 1. Resolve site ID from URL
   * 2. Resolve drive (library) ID
   * 3. Ensure folder exists
   * 4. Upload file content
   * 5. Update list-item metadata columns
   */
  async _uploadViaGraph(payload) {
    const token = await this._getAccessToken();
    const headers = { Authorization: `Bearer ${token}` };

    // Step 1: Resolve the SharePoint site ID
    // Graph path: /sites/{hostname}:{serverRelativePath}
    const siteHostname = new URL(payload.siteUrl).hostname;
    const sitePath = new URL(payload.siteUrl).pathname;

    const siteRes = await fetch(
      `${this.graphBaseUrl}/sites/${siteHostname}:${sitePath}`,
      { headers }
    );
    if (!siteRes.ok) throw new Error(`Site lookup failed: ${siteRes.status}`);
    const site = await siteRes.json();

    // Step 2: Resolve drive (document library) by name
    const drivesRes = await fetch(
      `${this.graphBaseUrl}/sites/${site.id}/drives`,
      { headers }
    );
    if (!drivesRes.ok) throw new Error(`Drives list failed: ${drivesRes.status}`);
    const drivesData = await drivesRes.json();
    const drive = drivesData.value.find(d => d.name === payload.libraryName);
    if (!drive) throw new Error(`Library '${payload.libraryName}' not found`);

    // Step 3: Upload file (small-file upload — for files < 4 MB)
    // PUT /drives/{driveId}/root:/{folderPath}/{filename}:/content
    const uploadPath = encodeURI(`${payload.folderPath}/${payload.filename}`);
    const uploadUrl = `${this.graphBaseUrl}/drives/${drive.id}/root:/${uploadPath}:/content`;

    // In production, stream actual file bytes from R2/S3 here.
    // For now, upload a placeholder PDF.
    const fileContent = payload.fileBuffer || Buffer.from('%PDF-1.4 placeholder', 'utf8');

    const uploadRes = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        ...headers,
        'Content-Type': 'application/pdf',
      },
      body: fileContent,
    });

    if (!uploadRes.ok) {
      const errText = await uploadRes.text();
      throw new Error(`SharePoint upload failed (${uploadRes.status}): ${errText}`);
    }

    const uploadedItem = await uploadRes.json();

    // Step 4: Update list-item metadata (if item has a listItem reference)
    if (uploadedItem.parentReference?.siteId) {
      try {
        const listItemUrl = `${this.graphBaseUrl}/drives/${drive.id}/items/${uploadedItem.id}/listItem/fields`;
        await fetch(listItemUrl, {
          method: 'PATCH',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify(payload.metadata),
        });
      } catch (metaErr) {
        console.warn('[SharePointAdapter] Metadata update failed (non-fatal):', metaErr.message);
      }
    }

    return {
      success: true,
      details: {
        referenceId: uploadedItem.id,
        webUrl: uploadedItem.webUrl,
        timestamp: new Date().toISOString(),
      },
    };
  }

  // -------------------------------------------------------------------
  // Payload Builder
  // -------------------------------------------------------------------

  _buildPayload(submission, section, config) {
    const now = new Date();

    const folderPath = config.folderTemplate
      .replace('{{year}}', now.getFullYear().toString())
      .replace('{{month}}', String(now.getMonth() + 1).padStart(2, '0'))
      .replace('{{pmNumber}}', submission.pmNumber || 'Unknown')
      .replace('{{circuitId}}', submission.circuitId || 'Unknown');

    const filename = `${submission.pmNumber}_${section.sectionType}_${now.toISOString().split('T')[0]}.pdf`;

    return {
      siteUrl: config.siteUrl,
      libraryName: config.libraryName,
      folderPath,
      filename,
      fileKey: section.fileKey,
      fileUrl: section.fileUrl,
      metadata: {
        Title: `${submission.pmNumber} - ${section.sectionType}`,
        PMNumber: submission.pmNumber,
        CircuitId: submission.circuitId || '',
        WorkOrderNumber: submission.workOrderNumber || '',
        DocumentType: section.sectionType,
        SubmissionId: submission.submissionId,
        SubmittedDate: submission.submittedAt,
        ContractorId: submission.companyId?.toString() || '',
        PageRange: `${section.pageStart}-${section.pageEnd}`,
        ContentHash: section.fileHash,
      },
    };
  }

  // -------------------------------------------------------------------
  // Simulation (dev / test)
  // -------------------------------------------------------------------

  async _simulateUpload(payload) {
    // NOSONAR: Math.random() used for simulation timing, not security
    await new Promise(resolve => setTimeout(resolve, 200 + Math.random() * 300)); // NOSONAR

    if (Math.random() > 0.90) { // NOSONAR
      return { success: false, details: { error: 'SharePoint upload failed: Service unavailable (simulated)' } };
    }

    const itemId = `SP-${Date.now()}-${Math.random().toString(36).substring(7)}`; // NOSONAR

    console.log(`[SharePointAdapter] Simulated upload → ${payload.siteUrl}/${payload.libraryName}/${payload.folderPath}/${payload.filename}`);

    return {
      success: true,
      details: {
        referenceId: itemId,
        webUrl: `${payload.siteUrl}/${payload.libraryName}/${payload.folderPath}/${payload.filename}`,
        timestamp: new Date().toISOString(),
        simulated: true,
      },
    };
  }
}

module.exports = SharePointAdapter;
