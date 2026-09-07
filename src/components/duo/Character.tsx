type Pose = "happy" | "cheer" | "think";

const mouth: Record<Pose, string> = {
  happy: "M36 52 Q50 62 64 52",
  cheer: "M34 50 Q50 68 66 50 Q50 58 34 50 Z",
  think: "M40 56 Q50 53 60 56",
};

/** Original friendly blob mascot. No third-party assets. */
export function Character({
  pose = "happy",
  size = 120,
  label,
}: {
  pose?: Pose;
  size?: number;
  label?: string;
}) {
  const titleId = `duo-mascot-${pose}`;
  return (
    <div
      role="img"
      aria-label={label ?? `Mascot feeling ${pose}`}
      className="animate-duo-float inline-block"
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 100 100" width={size} height={size} aria-labelledby={titleId}>
        <title id={titleId}>{`Mascot ${pose}`}</title>
        {/* arms */}
        {pose === "cheer" ? (
          <>
            <line x1="14" y1="58" x2="4" y2="30" stroke="#2f7d62" strokeWidth="7" strokeLinecap="round" />
            <line x1="86" y1="58" x2="96" y2="30" stroke="#2f7d62" strokeWidth="7" strokeLinecap="round" />
            <circle cx="4" cy="28" r="6" fill="#ffc800" />
            <circle cx="96" cy="28" r="6" fill="#ffc800" />
          </>
        ) : (
          <>
            <ellipse cx="12" cy="62" rx="7" ry="10" fill="#2f7d62" />
            <ellipse cx="88" cy="62" rx="7" ry="10" fill="#2f7d62" />
          </>
        )}
        {/* body */}
        <ellipse cx="50" cy="54" rx="36" ry="34" fill="#58cc02" />
        <ellipse cx="50" cy="54" rx="36" ry="34" fill="none" stroke="#46a302" strokeWidth="4" />
        {/* belly */}
        <ellipse cx="50" cy="68" rx="20" ry="14" fill="#d7ffb8" />
        {/* eyes */}
        <circle cx="38" cy="44" r="8" fill="#fff" />
        <circle cx="62" cy="44" r="8" fill="#fff" />
        {pose === "think" ? (
          <>
            <circle cx="40" cy="46" r="3.5" fill="#3f3a32" />
            <circle cx="60" cy="46" r="3.5" fill="#3f3a32" />
            <circle cx="82" cy="18" r="5" fill="#fff" stroke="#f0e3cb" strokeWidth="2" />
            <circle cx="90" cy="10" r="3" fill="#fff" stroke="#f0e3cb" strokeWidth="2" />
          </>
        ) : (
          <>
            <circle cx="40" cy="46" r="4" fill="#3f3a32" />
            <circle cx="60" cy="46" r="4" fill="#3f3a32" />
            <circle cx="41.5" cy="44.5" r="1.5" fill="#fff" />
            <circle cx="61.5" cy="44.5" r="1.5" fill="#fff" />
          </>
        )}
        {/* cheeks */}
        <circle cx="28" cy="52" r="4.5" fill="#ffb3b3" opacity="0.85" />
        <circle cx="72" cy="52" r="4.5" fill="#ffb3b3" opacity="0.85" />
        {/* mouth */}
        <path d={mouth[pose]} fill={pose === "cheer" ? "#3f3a32" : "none"} stroke="#3f3a32" strokeWidth="3.5" strokeLinecap="round" />
        {/* sprout */}
        <line x1="50" y1="20" x2="50" y2="12" stroke="#46a302" strokeWidth="4" strokeLinecap="round" />
        <ellipse cx="58" cy="12" rx="8" ry="5" fill="#46a302" transform="rotate(-20 58 12)" />
      </svg>
    </div>
  );
}
