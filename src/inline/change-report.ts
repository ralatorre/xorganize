/**
 * Passes on what x.com shows, such as its theme or the signed-in account's
 * handle: once when it is first read, and again only when it changes.
 */
export function createChangeReport<Value>(
  onChange: (value: Value) => void,
  keyOf: (value: Value) => string = String,
): (value: Value) => void {
  let reported: string | undefined;
  return (value) => {
    const key = keyOf(value);
    if (key === reported) return;
    reported = key;
    onChange(value);
  };
}
