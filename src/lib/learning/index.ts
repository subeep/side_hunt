/**
 * Public surface of the collective-learning library (server-side). Client components must import the pure modules
 * (constants, validation, sensitive, diff) directly, never this barrel.
 * Contract with the insights area: publishShared, withdrawShared, unpublishShared, indexShared, removeFromIndex,
 * purgeRetrievalCache, transition. Select shared rows ONLY with sharedPublicColumns.
 */
export { publishShared, withdrawShared, withdrawContribution, unpublishShared, reinstateShared, indexShared, removeFromIndex, purgeRetrievalCache, sharedVersions, scanShared, PRODUCTION_PROPAGATION_SLA } from './publish';
export type { TraceStep } from './publish';
export { transition, notifyStateChange, ALLOWED, SPECIAL_EDGES, edgeFor } from './lifecycle';
export type { TransitionResult, TransitionOpts } from './lifecycle';
export { createContribution, saveContribution, submitContribution, scanContribution, MATERIAL_FIELDS } from './contributions';
export { currentConsents, consentHistory, recordConsents, setOptionalConsent } from './consent';
export { getContributionForViewer, getOwnContribution, getForModeration, listMine, listOrg, moderatorVisible, authorTimeline } from './access';
export { moderationQueue, openReports, moderationDetail, claimForReview, saveSharedDraft, requestClarification, rejectContribution, decideReport, investigateReport } from './review';
export { createReport } from './reports';
export { sharedPublicColumns } from './columns';
export type { SharedPublic } from './columns';
export { scanFields, scanText, findRanges } from './sensitive';
export * from './constants';
