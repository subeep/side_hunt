import { ReportButton } from '@/components/learning/ReportButton';

/** The only place the insights area imports the learning area's report widget (contract: CLAUDE.md). */
export function ReportSlot({ sharedId }: { sharedId: string }) {
  return <ReportButton sharedId={sharedId} />;
}
