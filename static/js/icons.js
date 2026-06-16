// Self-hosted icon helper. References the inline SVG sprite (Lucide icons)
// injected into the page; symbol ids match the former Material ligature names.
export function ic(name, cls = '') {
  return `<svg class="ic${cls ? ' ' + cls : ''}" aria-hidden="true" focusable="false"><use href="#i-${name}"></use></svg>`;
}
