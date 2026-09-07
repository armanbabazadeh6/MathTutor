import "./effects.css";

/** Streak flame with a subtle pop whenever the count changes. */
export function Streak({ days }: { days: number }) {
  return (
    <span key={days} className="mt-streak" role="status" aria-label={`${days}-day streak`}>
      🔥 {days}-day streak
    </span>
  );
}
