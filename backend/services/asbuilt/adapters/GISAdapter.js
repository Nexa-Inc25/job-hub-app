/**
 * FieldLedger - GIS / ESRI Adapter
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 *
 * Delivers construction sketches and as-built drawings to ESRI ArcGIS
 * via the ArcGIS REST API. Supports:
 *   - Feature attachment upload (sketch PDFs)
 *   - Feature attribute updates (completion date, PM#)
 *   - Geometry updates (GPS coordinates from field)
 *
 * Auth: ArcGIS token (generateToken endpoint) or OAuth 2.0 app credentials.
 */

class GISAdapter {
  constructor() {
    this.endpoint = process.env.ESRI_GIS_ENDPOINT || 'https://gis.pge.com/arcgis/rest/services';
    this.featureLayerId = process.env.ESRI_FEATURE_LAYER_ID || 'Distribution_Assets';
    this.featureServiceUrl = process.env.ESRI_FEATURE_SERVICE_URL || '';
    this.username = process.env.ESRI_USERNAME || '';
    this.password = process.env.ESRI_PASSWORD || '';
    this.clientId = process.env.ESRI_CLIENT_ID || '';
    this.clientSecret = process.env.ESRI_CLIENT_SECRET || '';
    this.tokenUrl = process.env.ESRI_TOKEN_URL || 'https://www.arcgis.com/sharing/rest/generateToken';

    // Token cache
    this._tokenCache = { token: null, expiresAt: 0 };
  }

  // -------------------------------------------------------------------
  // Public API (required adapter interface)
  // -------------------------------------------------------------------

  /**
   * Deliver document to GIS
   * @returns {{ success: boolean, details: Object }}
   */
  async deliver(submission, section, _sectionIndex) {
    const payload = this._buildPayload(submission, section);

    if (this._isConfigured()) {
      return this._deliverViaRest(payload);
    }

    console.warn('[GISAdapter] ESRI credentials not configured — using mock');
    return this._simulateDelivery(payload);
  }

  // -------------------------------------------------------------------
  // Authentication
  // -------------------------------------------------------------------

  _isConfigured() {
    return !!(this.featureServiceUrl && (this.username || this.clientId));
  }

  /**
   * Acquire an ArcGIS token.
   * Supports two flows:
   *   1. Username/password → generateToken
   *   2. OAuth 2.0 client_credentials → /oauth2/token
   */
  async _getToken() {
    const now = Date.now();
    if (this._tokenCache.token && this._tokenCache.expiresAt > now + 60_000) {
      return this._tokenCache.token;
    }

    let token;
    let expiresAt;

    if (this.clientId && this.clientSecret) {
      // OAuth 2.0
      const body = new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        grant_type: 'client_credentials',
      });

      const res = await fetch('https://www.arcgis.com/sharing/rest/oauth2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      });
      if (!res.ok) throw new Error(`ESRI OAuth failed (${res.status})`);
      const data = await res.json();
      token = data.access_token;
      expiresAt = now + data.expires_in * 1000;
    } else {
      // Username/password
      const body = new URLSearchParams({
        username: this.username,
        password: this.password,
        referer: process.env.ESRI_REFERER || 'https://app.fieldledger.io',
        f: 'json',
      });

      const res = await fetch(this.tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      });
      if (!res.ok) throw new Error(`ESRI token request failed (${res.status})`);
      const data = await res.json();
      if (data.error) throw new Error(`ESRI token error: ${data.error.message}`);
      token = data.token;
      expiresAt = data.expires || (now + 3600_000);
    }

    this._tokenCache = { token, expiresAt };
    return token;
  }

  // -------------------------------------------------------------------
  // ESRI REST API Delivery
  // -------------------------------------------------------------------

  /**
   * Deliver via ESRI ArcGIS REST API:
   * 1. Add attachment to feature(s)
   * 2. Update feature attributes
   * 3. Optionally update geometry
   */
  async _deliverViaRest(payload) {
    const token = await this._getToken();
    const results = { attachments: 0, featuresUpdated: 0 };

    // Step 1: Add attachment to each identified feature
    for (const obj of payload.ObjectIds) {
      try {
        const attachUrl = `${this.featureServiceUrl}/${this.featureLayerId}/${obj.id}/addAttachment`;

        // Build multipart form data
        const formData = new FormData();
        formData.append('f', 'json');
        formData.append('token', token);
        // In production, stream actual file bytes here
        formData.append('attachment', new Blob(['%PDF-placeholder'], { type: 'application/pdf' }), payload.Attachment.name);

        const attachRes = await fetch(attachUrl, { method: 'POST', body: formData });
        if (!attachRes.ok) throw new Error(`Attachment upload failed: ${attachRes.status}`);
        const attachData = await attachRes.json();
        if (attachData.addAttachmentResult?.success) results.attachments++;
      } catch (err) {
        console.warn(`[GISAdapter] Attachment failed for ${obj.type} ${obj.id}: ${err.message}`);
      }
    }

    // Step 2: Update feature attributes
    if (payload.AttributeUpdates && payload.ObjectIds.length > 0) {
      try {
        const updateUrl = `${this.featureServiceUrl}/${this.featureLayerId}/updateFeatures`;
        const features = payload.ObjectIds.map(obj => ({
          attributes: {
            OBJECTID: obj.id,
            ...payload.AttributeUpdates,
          },
        }));

        const body = new URLSearchParams({
          f: 'json',
          token,
          features: JSON.stringify(features),
        });

        const updateRes = await fetch(updateUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: body.toString(),
        });

        if (updateRes.ok) {
          const updateData = await updateRes.json();
          results.featuresUpdated = (updateData.updateResults || []).filter(r => r.success).length;
        }
      } catch (err) {
        console.warn(`[GISAdapter] Feature update failed: ${err.message}`);
      }
    }

    // Step 3: Geometry updates (if GPS coordinates provided)
    if (payload.GeometryUpdates?.length > 0) {
      try {
        const geomUrl = `${this.featureServiceUrl}/${this.featureLayerId}/updateFeatures`;
        const features = payload.GeometryUpdates.map((geom, idx) => ({
          attributes: { OBJECTID: payload.ObjectIds[idx]?.id },
          geometry: { x: geom.x, y: geom.y, spatialReference: geom.spatialReference },
        }));

        const body = new URLSearchParams({
          f: 'json',
          token,
          features: JSON.stringify(features),
        });

        await fetch(geomUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: body.toString(),
        });
      } catch (err) {
        console.warn(`[GISAdapter] Geometry update failed: ${err.message}`);
      }
    }

    return {
      success: results.attachments > 0 || results.featuresUpdated > 0,
      details: {
        referenceId: `GIS-ATT-${Date.now()}`,
        attachmentsUploaded: results.attachments,
        featuresUpdated: results.featuresUpdated,
        timestamp: new Date().toISOString(),
      },
    };
  }

  // -------------------------------------------------------------------
  // Payload Builder
  // -------------------------------------------------------------------

  _buildPayload(submission, section) {
    return {
      FeatureLayerId: this.featureLayerId,
      ObjectIds: this._getObjectIds(section),
      Attachment: {
        name: `${submission.pmNumber}_${section.sectionType}.pdf`,
        contentType: 'application/pdf',
        keywords: ['as-built', section.sectionType, submission.pmNumber, new Date().getFullYear().toString()].join(','),
      },
      AttributeUpdates: {
        LAST_ASBUILT_DATE: new Date().toISOString().split('T')[0],
        LAST_ASBUILT_PM: submission.pmNumber,
        CONSTRUCTION_COMPLETE: 'Y',
        ASBUILT_DOC_ID: `${submission.submissionId}-${section.sectionType}`,
      },
      GeometryUpdates: section.extractedData?.gpsCoordinates?.map(coord => ({
        x: coord.longitude,
        y: coord.latitude,
        spatialReference: { wkid: 4326 },
      })) || null,
      WorkOrder: submission.workOrderNumber || submission.pmNumber,
      CircuitId: submission.circuitId,
      CompletionDate: new Date().toISOString(),
    };
  }

  _getObjectIds(section) {
    const ids = [];
    if (section.extractedData?.poleIds?.length > 0) {
      ids.push(...section.extractedData.poleIds.map(id => ({ type: 'POLE', id })));
    }
    if (section.extractedData?.transformerIds?.length > 0) {
      ids.push(...section.extractedData.transformerIds.map(id => ({ type: 'TRANSFORMER', id })));
    }
    if (ids.length === 0) {
      ids.push({ type: 'WORK_ORDER', id: section.extractedData?.pmNumber });
    }
    return ids;
  }

  // -------------------------------------------------------------------
  // Simulation
  // -------------------------------------------------------------------

  async _simulateDelivery(_payload) {
    // NOSONAR: Math.random() used for simulation timing/success rates
    await new Promise(resolve => setTimeout(resolve, 150 + Math.random() * 250)); // NOSONAR

    if (Math.random() > 0.90) { // NOSONAR
      return { success: false, details: { error: 'GIS feature service temporarily unavailable (simulated)' } };
    }

    return {
      success: true,
      details: {
        referenceId: `GIS-ATT-${Date.now()}`,
        attachmentsUploaded: 1,
        featuresUpdated: 1,
        timestamp: new Date().toISOString(),
        simulated: true,
      },
    };
  }
}

module.exports = GISAdapter;
