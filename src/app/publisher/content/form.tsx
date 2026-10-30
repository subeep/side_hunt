import { Field } from '@/components/ui';
import type { listContentForManage } from '@/lib/public/publisher';

type Row = Awaited<ReturnType<typeof listContentForManage>>[number];

export function ContentFields({ r }: { r?: Row }) {
  const k = r?.id ?? 'new';
  const tags = ((r?.meta as { tags?: string[] } | null)?.tags ?? []).join(', ');
  return (
    <>
      {r && <><input type="hidden" name="id" value={r.id} /><input type="hidden" name="kind" value={r.kind} /></>}
      <div className="grid gap-3 sm:grid-cols-3">
        {!r && <Field label="Type" htmlFor={`k-${k}`}><select id={`k-${k}`} name="kind" className="select" defaultValue="perspective"><option value="perspective">Perspective</option><option value="lab">Lab post</option><option value="page">Page</option></select></Field>}
        <Field label="Title" htmlFor={`t-${k}`}><input id={`t-${k}`} name="title" required minLength={3} maxLength={140} className="input" defaultValue={r?.title} /></Field>
        <Field label="Slug" htmlFor={`s-${k}`} hint="Lowercase letters, numbers, hyphens."><input id={`s-${k}`} name="slug" required minLength={2} maxLength={80} pattern="[a-z0-9]+(-[a-z0-9]+)*" className="input" defaultValue={r?.slug} /></Field>
      </div>
      <Field label="Summary" htmlFor={`m-${k}`}><input id={`m-${k}`} name="summary" maxLength={300} className="input" defaultValue={r?.summary ?? ''} /></Field>
      <Field label="Body" htmlFor={`b-${k}`} hint="Plain text. Blank line = new paragraph; start a line with '## ' for a heading and '- ' for list items. HTML is never interpreted."><textarea id={`b-${k}`} name="body" required minLength={20} maxLength={8000} className="textarea !min-h-40" defaultValue={r?.body ?? ''} /></Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Tags" htmlFor={`g-${k}`} hint="Comma separated, up to 6."><input id={`g-${k}`} name="tags" className="input" defaultValue={tags} /></Field>
        <Field label="Audience" htmlFor={`a-${k}`}><select id={`a-${k}`} name="audience" className="select" defaultValue={r?.audienceKind ?? 'public'}><option value="public">Public (everyone)</option><option value="employees">Employees only</option></select></Field>
      </div>
    </>
  );
}
