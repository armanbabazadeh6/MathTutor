import "./effects.css";

/** Celebration burst for perfect sessions / new badges. CSS-only confetti row. */
export function Celebration({ label = "Great work!" }: { label?: string }) {
  const pieces = ["🎉", "⭐", "🎊", "✨", "🥳"];
  return (
    <div className="mt-celebrate" role="status" aria-live="polite">
      <p className="text-xl font-extrabold">{label}</p>
      <p aria-hidden className="flex gap-1 text-2xl">
        {pieces.map((p, i) => (
          <span key={i} className="mt-confetti-piece" style={{ animationDelay: `${i * 90}ms` }}>
            {p}
          </span>
        ))}
      </p>
    </div>
  );
}
