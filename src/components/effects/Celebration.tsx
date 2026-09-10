import "./effects.css";

/** Celebration burst for perfect sessions / new badges. CSS-only confetti row. */
export function Celebration({ label = "Great work!" }: { label?: string }) {
  const pieces = ["🎉", "⭐", "🎊", "✨", "🥳"];
  return (
    <div className="mt-celebrate rounded-2xl border-2 border-primarydark bg-mint px-4 py-3" role="status" aria-live="polite">
      <p className="text-kid-lg font-bold text-primaryink">{label}</p>
      <p aria-hidden className="mt-1 flex gap-1 text-2xl">
        {pieces.map((p, i) => (
          <span key={i} className="mt-confetti-piece" style={{ animationDelay: `${i * 90}ms` }}>
            {p}
          </span>
        ))}
      </p>
    </div>
  );
}
