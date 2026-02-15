/**
 * Tailboard Form Utilities
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 */

/**
 * Populate form state from existing tailboard data.
 * @param {Object} tb - Tailboard data from API
 * @param {Object} s - Object containing all setState functions
 */
export function populateFormFromTailboard(tb, s) {
  if (tb.date) s.setDate(new Date(tb.date).toISOString().split('T')[0]);
  if (tb.startTime) s.setStartTime(tb.startTime);
  if (tb.taskDescription) s.setTaskDescription(tb.taskDescription);
  if (tb.jobSteps) s.setJobSteps(tb.jobSteps);
  if (tb.hazards) s.setHazards(tb.hazards);
  if (tb.hazardsDescription) s.setHazardsDescription(tb.hazardsDescription);
  if (tb.mitigationDescription) s.setMitigationDescription(tb.mitigationDescription);
  if (tb.ppeRequired) s.setPpeRequired(tb.ppeRequired);
  if (tb.crewMembers) s.setCrewMembers(tb.crewMembers);
  if (tb.weatherConditions) s.setWeatherConditions(tb.weatherConditions);
  if (tb.emergencyContact) s.setEmergencyContact(tb.emergencyContact);
  if (tb.emergencyPhone) s.setEmergencyPhone(tb.emergencyPhone);
  if (tb.nearestHospital) s.setNearestHospital(tb.nearestHospital);
  if (tb.additionalNotes) s.setAdditionalNotes(tb.additionalNotes);
  if (tb.pmNumber) s.setPmNumber(tb.pmNumber);
  if (tb.circuit) s.setCircuit(tb.circuit);
  if (tb.showUpYardLocation) s.setShowUpYardLocation(tb.showUpYardLocation);
  if (tb.generalForemanName) s.setGeneralForemanName(tb.generalForemanName);
  if (tb.inspector) s.setInspector(tb.inspector);
  if (tb.inspectorName) s.setInspectorName(tb.inspectorName);
  if (tb.eicName) s.setEicName(tb.eicName);
  if (tb.eicPhone) s.setEicPhone(tb.eicPhone);
  if (tb.specialMitigations?.length) s.setSpecialMitigations(tb.specialMitigations);
  if (tb.grounding) {
    s.setGroundingNeeded(tb.grounding.needed);
    s.setGroundingAccountedFor(tb.grounding.accountedFor);
    if (tb.grounding.locations?.length) s.setGroundingLocations(tb.grounding.locations);
  }
  if (tb.sourceSideDevices?.length) s.setSourceSideDevices(tb.sourceSideDevices);
  if (tb.nominalVoltages) s.setNominalVoltages(tb.nominalVoltages);
  if (tb.copperConditionInspected !== undefined) s.setCopperConditionInspected(tb.copperConditionInspected);
  if (tb.notTiedIntoCircuit) s.setNotTiedIntoCircuit(tb.notTiedIntoCircuit);
  if (tb.ugChecklist?.length) { s.setUgChecklist(tb.ugChecklist); s.setShowUgChecklist(true); }
}
