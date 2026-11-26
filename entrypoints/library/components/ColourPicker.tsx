import { useLayoutEffect, useRef } from 'preact/hooks';
import { TAG_COLOUR_NAMES, tagColour } from '@/src/tags/palette';

/** The palette as a group of radio buttons. Each choice applies at once. */
export function ColourPicker(props: {
  colour: number;
  onChange(colour: number): void;
  onDone(): void;
}) {
  const chosen = useRef<HTMLInputElement>(null);
  useLayoutEffect(() => chosen.current?.focus(), []);
  return (
    <div class="manage__form">
      <fieldset class="swatches">
        <legend class="manage__label">Colour</legend>
        {TAG_COLOUR_NAMES.map((name, index) => (
          <label key={name} class="swatch" title={name}>
            <input
              ref={index === props.colour ? chosen : undefined}
              type="radio"
              name="tag-colour"
              class="swatch__input"
              checked={index === props.colour}
              aria-label={name}
              onChange={() => props.onChange(index)}
            />
            <span
              class="swatch__colour"
              style={{ background: tagColour(index) }}
              aria-hidden="true"
            />
          </label>
        ))}
      </fieldset>
      <div class="manage__buttons">
        <button type="button" onClick={props.onDone}>
          Done
        </button>
      </div>
    </div>
  );
}
