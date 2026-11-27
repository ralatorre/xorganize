import { useLayoutEffect, useRef, useState } from 'preact/hooks';

/** A post's text, cut to a few lines with a button to show the rest. */
export function PostText({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const [cut, setCut] = useState(false);
  const paragraph = useRef<HTMLParagraphElement>(null);

  useLayoutEffect(() => {
    const element = paragraph.current;
    if (element && !expanded) setCut(element.scrollHeight > element.clientHeight + 1);
  }, [text, expanded]);

  return (
    <>
      <p ref={paragraph} class={expanded ? 'post__text' : 'post__text post__text--clamped'}>
        {text}
      </p>
      {cut ? (
        <button
          type="button"
          class="link-button post__more"
          aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? 'Show less' : 'Show more'}
        </button>
      ) : null}
    </>
  );
}
