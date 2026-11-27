import type { Ref, SelectHTMLAttributes } from 'preact';
import { Icon } from './Icon';

/**
 * A native select, styled to match the library's other controls, with its own
 * arrow. `class` goes on the wrapper, as `select--block` to fill the width.
 */
export function Select(
  props: SelectHTMLAttributes<HTMLSelectElement> & { selectRef?: Ref<HTMLSelectElement> },
) {
  const { selectRef, class: variant, ...select } = props;
  return (
    <span class={variant ? `select ${String(variant)}` : 'select'}>
      <select ref={selectRef} class="select__input" {...select} />
      <Icon name="chevron" size="small" />
    </span>
  );
}
