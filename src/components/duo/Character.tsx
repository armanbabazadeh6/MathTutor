export type Pose = "happy" | "cheer" | "think" | "wow" | "oops" | "sleep";

const mouth: Record<Pose, string> = {
  happy: "M36 52 Q50 62 64 52",
  cheer: "M34 50 Q50 68 66 50 Q50 58 34 50 Z",
  think: "M40 56 Q50 53 60 56",
  wow: "M50 50 m-7 0 a7 9 0 1 0 14 0 a7 9 0 1 0 -14 0 Z",
  oops: "M39 57 Q50 49 61 57",
  sleep: "M40 55 Q50 60 60 55",
};

const eyes: Record<Pose, "open" | "closed" | "wide" | "look"> = {
  happy: "open",
  cheer: "open",
  think: "look",
  wow: "wide",
  oops: "closed",
  sleep: "closed",
};

/**
 * Original friendly blob mascot. No third-party assets.
 *
 * Deliberately id-free: the wrapper carries the accessible name, so several
 * mascots can render on one page without duplicate ARIA/SVG ids.
 */
export function Character({
  pose = "happy",
  size = 120,
  label,
  animate = true,
}: {
  pose?: Pose;
  size?: number;
  label?: string;
  /** Set false to freeze the idle float (e.g. inside a large hero grid). */
  animate?: boolean;
}) {
  const kind = eyes[pose];
  const closed = kind === "closed";
  return (
    <div
      role="img"
      aria-label={label ?? `Mascot feeling ${pose}`}
      className={`relative inline-block ${animate ? "animate-duo-float" : ""}`}
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden focusable="false">
        {/* ground shadow — breathes opposite the float so the hop reads */}
        <ellipse cx="50" cy="94" rx="26" ry="4.5" fill="#3f3a32" opacity="0.14">
          {animate ? (
            <animate
              attributeName="rx"
              values="26;21;26"
              dur="2.6s"
              repeatCount="indefinite"
              calcMode="spline"
              keySplines="0.4 0 0.2 1;0.4 0 0.2 1"
            />
          ) : null}
        </ellipse>

        {/* arms */}
        {pose === "cheer" ? (
          <>
            <line x1="16" y1="56" x2="6" y2="26" stroke="#2f7d62" strokeWidth="7" strokeLinecap="round" />
            <line x1="84" y1="56" x2="94" y2="26" stroke="#2f7d62" strokeWidth="7" strokeLinecap="round" />
            <circle cx="6" cy="24" r="6" fill="#ffc800" stroke="#e0a800" strokeWidth="1.5" />
            <circle cx="94" cy="24" r="6" fill="#ffc800" stroke="#e0a800" strokeWidth="1.5" />
          </>
        ) : pose === "sleep" ? (
          <>
            <ellipse cx="13" cy="64" rx="7" ry="10" fill="#2f7d62" />
            <ellipse cx="87" cy="64" rx="7" ry="10" fill="#2f7d62" />
          </>
        ) : (
          <>
            <ellipse cx="12" cy="62" rx="7" ry="10" fill="#2f7d62" />
            <ellipse cx="88" cy="62" rx="7" ry="10" fill="#2f7d62" />
            <ellipse cx="12" cy="62" rx="7" ry="10" fill="#ffffff" opacity="0.08" />
          </>
        )}

        {/* body: base + top light + rim */}
        <ellipse cx="50" cy="54" rx="36" ry="34" fill="#58cc02" />
        <ellipse cx="50" cy="46" rx="30" ry="22" fill="#7ade33" opacity="0.55" />
        <ellipse cx="50" cy="54" rx="36" ry="34" fill="none" stroke="#46a302" strokeWidth="3.5" />

        {/* belly */}
        <ellipse cx="50" cy="70" rx="20" ry="14" fill="#d7ffb8" />
        <ellipse cx="50" cy="68" rx="16" ry="9" fill="#eaffd6" opacity="0.8" />

        {/* eye sockets */}
        <circle cx="38" cy="44" r="8.5" fill="#ffffff" stroke="#2f7d62" strokeWidth="1.2" />
        <circle cx="62" cy="44" r="8.5" fill="#ffffff" stroke="#2f7d62" strokeWidth="1.2" />

        {/* pupils */}
        {closed ? (
          <>
            <path d="M33 45 Q38 50 43 45" fill="none" stroke="#3f3a32" strokeWidth="3" strokeLinecap="round" />
            <path d="M57 45 Q62 50 67 45" fill="none" stroke="#3f3a32" strokeWidth="3" strokeLinecap="round" />
          </>
        ) : (
          <g className={animate ? "mt-blink" : undefined}>
            {kind === "look" ? (
              <>
                <circle cx="40.5" cy="45" r="3.6" fill="#3f3a32" />
                <circle cx="60.5" cy="45" r="3.6" fill="#3f3a32" />
              </>
            ) : kind === "wide" ? (
              <>
                <circle cx="38" cy="44" r="5.4" fill="#3f3a32" />
                <circle cx="62" cy="44" r="5.4" fill="#3f3a32" />
              </>
            ) : (
              <>
                <circle cx="40" cy="45" r="4.2" fill="#3f3a32" />
                <circle cx="60" cy="45" r="4.2" fill="#3f3a32" />
              </>
            )}
            <circle cx="41.6" cy="43.2" r="1.6" fill="#ffffff" />
            <circle cx="61.6" cy="43.2" r="1.6" fill="#ffffff" />
          </g>
        )}

        {/* cheeks */}
        <circle cx="27" cy="53" r="4.5" fill="#ffb3b3" opacity="0.8" />
        <circle cx="73" cy="53" r="4.5" fill="#ffb3b3" opacity="0.8" />

        {/* mouth */}
        <path
          d={mouth[pose]}
          fill={pose === "cheer" || pose === "wow" ? "#3f3a32" : "none"}
          stroke="#3f3a32"
          strokeWidth="3.2"
          strokeLinecap="round"
        />
        {pose === "wow" ? (
          <path d="M46 56 Q50 58 54 56" fill="#ff8fa3" stroke="none" />
        ) : null}

        {/* sprout */}
        <line x1="50" y1="20" x2="50" y2="12" stroke="#46a302" strokeWidth="4" strokeLinecap="round" />
        <ellipse cx="58" cy="12" rx="8" ry="5" fill="#46a302" transform="rotate(-20 58 12)" />
        <ellipse cx="58" cy="11" rx="5" ry="2.4" fill="#7ade33" transform="rotate(-20 58 11)" opacity="0.7" />

        {/* idea spark */}
        {pose === "think" ? (
          <>
            <circle cx="82" cy="18" r="5" fill="#fff" stroke="#efdfc4" strokeWidth="2" />
            <circle cx="90" cy="10" r="3" fill="#fff" stroke="#efdfc4" strokeWidth="2" />
          </>
        ) : null}

        {/* sleep z's */}
        {pose === "sleep" ? (
          <g fill="#8a7d6b" fontFamily="Fredoka, Nunito, sans-serif" fontWeight="700">
            <text x="76" y="26" fontSize="13">z</text>
            <text x="86" y="14" fontSize="10">z</text>
          </g>
        ) : null}
      </svg>
    </div>
  );
}
