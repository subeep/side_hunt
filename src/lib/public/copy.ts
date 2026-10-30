/** Static marketing copy for the public site (source: docs/PROTOTYPE_CONTENT.md). */
export const CAPABILITIES = [
  { icon: 'decision', title: 'Intelligent Decisioning', blurb: 'Turn policies, evidence, and data into informed recommendations.', points: ['Evaluate applications against configurable policies', 'Analyse risk, financial data and historical patterns', 'Simulate policy changes before they go live', 'Produce evidence-backed recommendations'] },
  { icon: 'document', title: 'Document Intelligence', blurb: 'Extract, interpret, and validate complex information.', points: ['Classify documents and extract key fields', 'Validate information across documents', 'Detect inconsistencies for human review', 'Deliver structured data to downstream systems'] },
  { icon: 'agent', title: 'AI Agents & Automation', blurb: 'Connect intelligence with workflows and human oversight.', points: ['Interpret tasks and plan the steps', 'Coordinate connected workflows', 'Automate multi-step activities', 'Keep human approvals and audit trails'] },
  { icon: 'chart', title: 'Analytics & Insights', blurb: 'Transform data into actionable intelligence.', points: ['Unify data sources', 'Identify trends and root causes', 'Compare portfolios and simulate scenarios', 'Surface insights people can act on'] },
  { icon: 'config', title: 'Configurable AI Platforms', blurb: 'Adapt solutions to evolving business requirements.', points: ['Configure rules without rewrites', 'Map databases and APIs', 'Manage templates and modules', 'Track versions and approvals'] },
  { icon: 'shield', title: 'Trusted Enterprise AI', blurb: 'Design for security, accountability, and traceability.', points: ['Enterprise SSO and role-based access', 'Protect data by default', 'Maintain audit records', 'Human oversight and governance'] },
] as const;
export type IconName = (typeof CAPABILITIES)[number]['icon'];

export const TRUST = [
  { n: '01', title: 'Identity & SSO', text: 'Verified identities and approved memberships. An email address alone never creates trusted access.' },
  { n: '02', title: 'Role-Based Access', text: 'Permissions are separate, explicit grants. Employee status implies none of them.' },
  { n: '03', title: 'Auditability', text: 'Privileged and security-relevant actions leave an append-only audit record.' },
  { n: '04', title: 'Data Protection', text: 'Every resource carries its audience. Missing audience metadata means deny, never public.' },
  { n: '05', title: 'Human Oversight', text: 'People review what is shared. AI summarises permitted evidence; it does not decide.' },
  { n: '06', title: 'Secure Deployment', text: 'Access is enforced on the server, including direct API and media requests.' },
] as const;

export const HAPPENING = [
  { href: '/lab', eyebrow: 'AI Lab', title: 'Experiment Boldly. Engineer Purposefully.', text: 'Prototypes, experiments and engineering notes from the lab.' },
  { href: '/live', eyebrow: 'azentio.ai Live', title: 'Conversations Where Intelligence Comes Alive.', text: 'Public webinars and recordings.' },
  { href: '/perspectives', eyebrow: 'Perspectives', title: 'Ideas Worth Exploring. Perspectives Worth Sharing.', text: 'Short reads on applied AI for regulated industries.' },
] as const;
