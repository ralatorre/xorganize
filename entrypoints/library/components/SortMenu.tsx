import { SORT_LABELS } from '@/src/library/toolbar';
import { SORT_ORDERS, type SortOrder } from '@/src/library/view';
import { Icon } from './Icon';
import { Menu } from './Menu';
import { MenuItem } from './MenuItem';

/** The order of the list: each choice says what it means in a second line. */
export function SortMenu(props: { sort: SortOrder; onSort(sort: SortOrder): void }) {
  return (
    <Menu
      label="Sort"
      buttonLabel={`Sort: ${SORT_LABELS[props.sort].label}`}
      buttonClass="button button--small button--quiet"
      button={
        <>
          <Icon name="sort" size="small" />
          {SORT_LABELS[props.sort].label}
          <Icon name="chevron" size="tiny" />
        </>
      }
    >
      <p class="dropdown__label" aria-hidden="true">
        Sort by
      </p>
      {SORT_ORDERS.map((order) => (
        <MenuItem
          key={order}
          checked={order === props.sort}
          detail={SORT_LABELS[order].detail}
          onSelect={() => props.onSort(order)}
        >
          {SORT_LABELS[order].label}
        </MenuItem>
      ))}
    </Menu>
  );
}
