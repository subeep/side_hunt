/** Renders plain-text content (paragraphs, "## " headings, "- " lists). Text only: React escapes everything, no HTML is ever interpreted. */
export function Prose({ text }: { text: string | null | undefined }) {
  if (!text) return null;
  const blocks = text.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  return (
    <div className="prose-az">
      {blocks.map((b, i) => {
        if (b.startsWith('## ')) {
          const [head, ...rest] = b.split('\n');
          return (
            <div key={i}>
              <h2>{head.slice(3)}</h2>
              {rest.length > 0 && <ul>{rest.map((l, j) => <li key={j}>{l.replace(/^-\s*/, '')}</li>)}</ul>}
            </div>
          );
        }
        const lines = b.split('\n');
        if (lines.every((l) => l.startsWith('- '))) return <ul key={i}>{lines.map((l, j) => <li key={j}>{l.slice(2)}</li>)}</ul>;
        return <p key={i}>{b}</p>;
      })}
    </div>
  );
}
