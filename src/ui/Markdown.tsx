import { lazy, Suspense } from 'react';

// The markdown + KaTeX renderer is about half the app's code but only needed
// once an answer is shown, so it loads on demand (and is precached for offline).
const Render = lazy(() => import('./MarkdownRender'));

export function Markdown({ text }: { text: string }) {
  return (
    <Suspense fallback={<div className="md" style={{ whiteSpace: 'pre-wrap' }}>{text}</div>}>
      <Render text={text} />
    </Suspense>
  );
}
