import type { ReactNode } from "react";
import styles from "../dashboard.module.css";

// Copilot's answers come back as light Markdown (**bold**, *italic*, `code`,
// "- " or "1." lists, # headings). This renders that subset as real elements
// (never as HTML from the model) and drops any marks it doesn't understand,
// so no stray asterisks reach the screen.

function inline(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  // **bold**, __bold__, *italic*, _italic_ (not inside words), `code`
  const re = /(\*\*|__)(.+?)\1|(?<![\w*])\*(?!\s)(.+?)(?<!\s)\*(?![\w*])|(?<![\w_])_(?!\s)(.+?)(?<!\s)_(?![\w_])|`([^`]+)`/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const k = `${key}-${i++}`;
    if (m[2] !== undefined) out.push(<strong key={k}>{inline(m[2], k)}</strong>);
    else if (m[3] !== undefined || m[4] !== undefined) out.push(<em key={k}>{inline((m[3] ?? m[4])!, k)}</em>);
    else out.push(<code key={k} className={styles.copilotCode}>{m[5]}</code>);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  // Marks left unpaired (a lone ** or *) are noise, not emphasis.
  return out.map((part) => (typeof part === "string" ? part.replace(/\*\*|(?<=\s|^)\*(?=\s|$)/g, "") : part));
}

type Block = { kind: "p"; text: string } | { kind: "h"; text: string } | { kind: "ul"; items: string[] } | { kind: "ol"; items: string[] };

function blocks(source: string): Block[] {
  const out: Block[] = [];
  const lines = source.replace(/\r/g, "").split("\n");
  let para: string[] = [];
  const flush = () => {
    if (para.length) out.push({ kind: "p", text: para.join(" ") });
    para = [];
  };
  for (const raw of lines) {
    const line = raw.trim();
    const bullet = /^(?:[-*•–]|•)\s+(.*)$/.exec(line);
    const numbered = /^\d+[.)]\s+(.*)$/.exec(line);
    const heading = /^#{1,6}\s+(.*)$/.exec(line);
    if (!line || /^(-{3,}|\*{3,}|_{3,})$/.test(line)) {
      flush();
    } else if (bullet || numbered) {
      flush();
      const kind = bullet ? "ul" : "ol";
      const prev = out.at(-1);
      const item = (bullet ?? numbered)![1]!;
      if (prev && prev.kind === kind) prev.items.push(item);
      else out.push({ kind, items: [item] });
    } else if (heading) {
      flush();
      out.push({ kind: "h", text: heading[1]! });
    } else {
      para.push(line);
    }
  }
  flush();
  return out;
}

export function CopilotText({ text }: { text: string }) {
  return (
    <div className={styles.copilotText}>
      {blocks(text).map((b, i) => {
        const k = String(i);
        if (b.kind === "p") return <p key={k}>{inline(b.text, k)}</p>;
        if (b.kind === "h") return <p key={k}><strong>{inline(b.text.replace(/\*\*/g, ""), k)}</strong></p>;
        const items = b.items.map((item, j) => <li key={j}>{inline(item, `${k}-${j}`)}</li>);
        return b.kind === "ul" ? <ul key={k}>{items}</ul> : <ol key={k}>{items}</ol>;
      })}
    </div>
  );
}
