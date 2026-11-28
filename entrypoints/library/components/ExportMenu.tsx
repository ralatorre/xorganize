import { exportMenuLabel } from '@/src/library/view-export';
import type { ExportFormat } from '@/src/transfer/format';
import { Icon } from './Icon';
import { Menu } from './Menu';
import { MenuItem } from './MenuItem';

/** Exports exactly the posts the view lists, as JSON or CSV (DESIGN, 5.6). */
export function ExportMenu(props: { count: number; onExport(format: ExportFormat): void }) {
  return (
    <Menu
      label="Export"
      buttonClass="button button--small"
      button={
        <>
          <Icon name="export" size="small" />
          Export
          <Icon name="chevron" size="tiny" />
        </>
      }
    >
      <p class="dropdown__label" aria-hidden="true">
        {exportMenuLabel(props.count)}
      </p>
      <MenuItem detail="Can be imported again" onSelect={() => props.onExport('json')}>
        JSON
      </MenuItem>
      <MenuItem detail="For spreadsheets" onSelect={() => props.onExport('csv')}>
        CSV
      </MenuItem>
    </Menu>
  );
}
