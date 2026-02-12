const ICONS = {
  menu: (
    <>
      <path d="M4 7h16" />
      <path d="M4 12h16" />
      <path d="M4 17h16" />
    </>
  ),
  dashboard: (
    <>
      <rect x="3" y="3" width="8" height="8" rx="2" />
      <rect x="13" y="3" width="8" height="5" rx="2" />
      <rect x="13" y="10" width="8" height="11" rx="2" />
      <rect x="3" y="13" width="8" height="8" rx="2" />
    </>
  ),
  spark: (
    <>
      <path d="M12 2l1.6 4.4L18 8l-4.4 1.6L12 14l-1.6-4.4L6 8l4.4-1.6L12 2z" />
      <path d="M18.5 15l.9 2.5L22 18.4l-2.6.9L18.5 22l-.9-2.7-2.6-.9 2.6-.9.9-2.5z" />
      <path d="M4.5 15l.7 1.8L7 17.5l-1.8.7L4.5 20l-.7-1.8L2 17.5l1.8-.7.7-1.8z" />
    </>
  ),
  list: (
    <>
      <path d="M8 6h12" />
      <path d="M8 12h12" />
      <path d="M8 18h12" />
      <circle cx="4" cy="6" r="1.2" />
      <circle cx="4" cy="12" r="1.2" />
      <circle cx="4" cy="18" r="1.2" />
    </>
  ),
  building: (
    <>
      <rect x="3" y="3" width="12" height="18" rx="2" />
      <path d="M7 7h2v2H7zM11 7h2v2h-2zM7 11h2v2H7zM11 11h2v2h-2zM7 15h2v2H7zM11 15h2v2h-2z" />
      <path d="M15 9h6v12h-6" />
    </>
  ),

  inbox: (
    <>
      <path d="M4 12V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v7" />
      <path d="M4 12l4 6h8l4-6" />
      <path d="M9 12h6" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3l8 3v6c0 5.2-3.2 8.5-8 10-4.8-1.5-8-4.8-8-10V6l8-3z" />
      <path d="M9.5 12.5l2 2 3-3" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.5-2.4 1a7.3 7.3 0 0 0-1.8-1L14.5 3h-5L9.3 6a7.3 7.3 0 0 0-1.8 1l-2.4-1-2 3.5L5.1 11a7 7 0 0 0 0 2l-2 1.5 2 3.5 2.4-1a7.3 7.3 0 0 0 1.8 1l.2 3h5l.2-3a7.3 7.3 0 0 0 1.8-1l2.4 1 2-3.5-2-1.5c.1-.3.1-.7.1-1z" />
    </>
  ),
  chevronLeft: <path d="M15 18l-6-6 6-6" />,
  chevronRight: <path d="M9 6l6 6-6 6" />,
  chevronDown: <path d="M6 9l6 6 6-6" />,
  external: (
    <>
      <path d="M14 4h6v6" />
      <path d="M10 14L20 4" />
      <path d="M20 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h5" />
    </>
  ),
  refresh: (
    <>
      <path d="M20 6v5h-5" />
      <path d="M4 18v-5h5" />
      <path d="M6.5 9A7 7 0 0 1 18 6l2 2" />
      <path d="M17.5 15A7 7 0 0 1 6 18l-2-2" />
    </>
  ),
  play: <path d="M8 5v14l11-7-11-7z" />,
  filter: (
    <>
      <path d="M4 6h16" />
      <path d="M7 12h10" />
      <path d="M10 18h4" />
    </>
  ),
};

export default function Icon({ name, size = 16, strokeWidth = 1.8, className = "", ariaHidden = true }) {
  const glyph = ICONS[name] || ICONS.list;
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={ariaHidden}
      focusable="false"
    >
      {glyph}
    </svg>
  );
}
