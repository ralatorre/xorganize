import { TAG_COLOUR_NAMES, tagColour } from '@/src/tags/palette';

/**
 * The tag palette inside a menu: one choice per colour, the chosen one ringed.
 * Choosing applies at once and closes the menu.
 */
export function ColourSwatches(props: { colour: number; onChoose(colour: number): void }) {
  return (
    <div class="swatches" role="group" aria-label="Change colour">
      {TAG_COLOUR_NAMES.map((name, index) => (
        <button
          key={name}
          type="button"
          class="swatch"
          role="menuitemradio"
          aria-checked={index === props.colour}
          aria-label={name}
          title={name}
          tabIndex={-1}
          onClick={() => props.onChoose(index)}
        >
          <span class="swatch__colour" style={{ background: tagColour(index) }} />
        </button>
      ))}
    </div>
  );
}
