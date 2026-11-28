/**
 * The on and off control of a setting row: a checkbox drawn as a switch,
 * named and described by the row whose `id` it is given (`SettingRow`).
 */
export function SettingSwitch(props: {
  id: string;
  checked: boolean;
  onChange(checked: boolean): void;
}) {
  return (
    <input
      type="checkbox"
      role="switch"
      class="switch"
      aria-labelledby={`${props.id}-title`}
      aria-describedby={`${props.id}-description`}
      checked={props.checked}
      onChange={(event) => props.onChange(event.currentTarget.checked)}
    />
  );
}
