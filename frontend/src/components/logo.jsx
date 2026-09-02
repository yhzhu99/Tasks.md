/**
 * Tasks.md mark: three rounded bars of unequal height (middle tallest).
 * Uses currentColor so it inherits accent / foreground from CSS.
 *
 * @param {Object} props
 * @param {number} [props.size=18]
 * @param {string} [props.class]
 */
export function LogoMark(props) {
  const size = () => props.size || 18;
  return (
    <svg
      class={props.class}
      width={size()}
      height={size()}
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden="true"
    >
      <rect x="1.2" y="5.5" width="3.2" height="8.3" rx="1.4" />
      <rect x="6.4" y="2.2" width="3.2" height="11.6" rx="1.4" />
      <rect x="11.6" y="4" width="3.2" height="9.8" rx="1.4" />
    </svg>
  );
}
