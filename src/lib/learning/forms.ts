/** FormData -> plain objects (pure). Validation happens in validation.ts on the server. */
const str = (fd: FormData, k: string) => (typeof fd.get(k) === 'string' ? (fd.get(k) as string) : '');

export const readContribution = (fd: FormData) => ({
  kind: str(fd, 'kind'),
  title: str(fd, 'title'),
  observation: str(fd, 'observation'),
  offeringSlug: str(fd, 'offeringSlug'),
  industry: str(fd, 'industry'),
  region: str(fd, 'region'),
  observationPeriod: str(fd, 'observationPeriod'),
  evidenceType: str(fd, 'evidenceType'),
  confidence: str(fd, 'confidence'),
  topic: str(fd, 'topic'),
  supportLinks: str(fd, 'supportLinks'),
  sharingChoice: str(fd, 'sharingChoice'),
});

export const readConsents = (fd: FormData) => ({
  store_process: fd.get('store_process') === 'on',
  publish_shared: fd.get('publish_shared') === 'on',
  attribution: fd.get('attribution') === 'on',
  training: fd.get('training') === 'on',
});

export const readSharedRep = (fd: FormData) => ({
  title: str(fd, 'title'),
  summary: str(fd, 'summary'),
  industry: str(fd, 'industry'),
  region: str(fd, 'region'),
  periodLabel: str(fd, 'periodLabel'),
  evidenceQuality: str(fd, 'evidenceQuality'),
  includeAttribution: fd.get('includeAttribution') === 'on',
  redactionNotes: str(fd, 'redactionNotes'),
});

export const readStr = str;
