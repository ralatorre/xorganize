import type { TagMatch, ViewChange } from '@/src/library/view';

/** All tags / Any tag, as two segments: whether a post needs every chosen tag or one. */
export function MatchSwitch(props: {
  match: TagMatch;
  /** The radio group's name, unique on the page. */
  name: string;
  onChange(change: ViewChange): void;
}) {
  return (
    <fieldset class="segmented" aria-label="Match">
      {(['all', 'any'] as const).map((option) => (
        <label key={option}>
          <input
            type="radio"
            name={props.name}
            checked={props.match === option}
            onChange={() => props.onChange({ type: 'match', match: option })}
          />
          {option === 'all' ? 'All tags' : 'Any tag'}
        </label>
      ))}
    </fieldset>
  );
}
