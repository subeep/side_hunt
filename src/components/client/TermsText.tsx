import { CURRENT_TERMS_VERSION } from '@/lib/client/terms';
import { Alert } from '@/components/ui';

/** Workspace terms + the plain-language learning-sharing explanation. Used on /client/terms and /invite/<token>. */
export function TermsText({ orgName }: { orgName: string }) {
  return (
    <div className="space-y-6">
      <section aria-labelledby="terms-h">
        <h2 id="terms-h" className="text-xl">Workspace terms <span className="text-sm font-normal text-muted">(version {CURRENT_TERMS_VERSION})</span></h2>
        <ul className="prose-az mt-2 text-[0.95rem]">
          <li>This workspace belongs to <strong>{orgName}</strong>. What you see and do here is scoped to this organisation and to the products it is entitled to.</li>
          <li>Use the Sandbox with <strong>synthetic data only</strong>. Sandbox outputs are simulated illustrations, not credit or business decisions.</li>
          <li>Keep your sign-in private. Administrators can invite colleagues into {orgName} only; nobody here can grant Azentio staff or platform roles.</li>
          <li>Activity such as invitations, role changes and sandbox runs is recorded in an audit log for security.</li>
        </ul>
      </section>
      <section aria-labelledby="learn-h">
        <h2 id="learn-h" className="text-xl">Sharing what you learn: in plain language</h2>
        <Alert tone="warn" className="mt-3">
          <strong>Joining a workspace is not consent to share or to train anything.</strong> Accepting these terms gives you access to {orgName}&apos;s workspace and nothing more.
        </Alert>
        <ul className="prose-az mt-3 text-[0.95rem]">
          <li><strong>Observations start private.</strong> Saving a draft never shares it with anyone outside your own account.</li>
          <li><strong>You choose each time.</strong> When you submit an observation you separately decide: whether it is stored and processed, whether a reviewed copy may be published to the approved learning community, whether your organisation may be named, and whether it may be used in any future training or federated programme. Each choice is recorded on its own and each can be refused.</li>
          <li><strong>Review comes first.</strong> A moderator checks and de-identifies anything proposed for sharing. Removing a name does not always make a rare observation anonymous, so it may be returned to you.</li>
          <li><strong>You can withdraw.</strong> Withdrawing removes the shared copy from search and retrieval straight away. Material other people have already viewed, and copies they made, cannot be recalled automatically, and withdrawal does not undo a model that has already been trained.</li>
          <li><strong>Please do not include</strong> customer identities, account numbers, transaction-level data, credentials or confidential contract terms. A warning or automated scan is not a privacy guarantee.</li>
        </ul>
      </section>
    </div>
  );
}
