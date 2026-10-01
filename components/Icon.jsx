const PATHS = {
  today: (<><path d="M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" /><path d="M4 10h16M8 3v4M16 3v4" /><circle cx="12" cy="15" r="1.4" /></>),
  rem: (<><path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15z" /><path d="M10 21h4" /></>),
  task: (<><rect x="4" y="4" width="16" height="16" rx="5" /><path d="m8.5 12.3 2.5 2.5 4.6-5" /></>),
  set: (<><path d="M4 7h9M17 7h3M4 17h3M11 17h9" /><circle cx="15" cy="7" r="2" /><circle cx="9" cy="17" r="2" /></>),
  plus: <path d="M12 5v14M5 12h14" />,
  tick: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  repeat: <path d="M4 11V9a3 3 0 0 1 3-3h11l-2.5-2.5M20 13v2a3 3 0 0 1-3 3H6l2.5 2.5" />,
};

// `size` is only for inline icons (like the repeat glyph in a row's meta line);
// the tab bar and check boxes size theirs from CSS.
export default function Icon({ name, size }) {
  const style = size
    ? { width: size, height: size, stroke: "currentColor", strokeWidth: 2, fill: "none", strokeLinecap: "round", strokeLinejoin: "round" }
    : undefined;
  return (
    <svg viewBox="0 0 24 24" style={style} aria-hidden="true">
      {PATHS[name]}
    </svg>
  );
}
