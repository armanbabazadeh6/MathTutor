/** Attempt hearts for the player — original art, no third-party assets. */
export function HeartBar({ hearts, max = 3 }: { hearts: number; max?: number }) {
  const slots = Array.from({ length: Math.max(0, max) }, (_, i) => i);
  return (
    <div className="inline-flex items-center gap-1" role="status" aria-label={`${hearts} of ${max} hearts left`}>
      {slots.map((i) => {
        const full = i < hearts;
        return (
          <svg
            key={i}
            viewBox="0 0 24 22"
            width="26"
            height="24"
            aria-hidden
            className={full ? "animate-duo-pop" : undefined}
          >
            <path
              d="M12 20S3 14.5 3 8.8C3 5.6 5.4 3.5 8.2 3.5c1.6 0 3 .8 3.8 2 .8-1.2 2.2-2 3.8-2 2.8 0 5.2 2.1 5.2 5.3C21 14.5 12 20 12 20z"
              fill={full ? "#ff5c5c" : "#e5e5e5"}
              stroke={full ? "#d33131" : "#cfcfcf"}
              strokeWidth="1.8"
              strokeLinejoin="round"
            />
            {full ? <circle cx="8.5" cy="8" r="1.8" fill="#ffc9c9" /> : null}
          </svg>
        );
      })}
    </div>
  );
}
