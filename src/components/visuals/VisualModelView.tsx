"use client";

import type { CSSProperties, ReactNode } from "react";
import { describeVisual, type VisualFraction, type VisualModel } from "@/lib/visual/models";

/**
 * Inline-SVG renderings of `VisualModel`s.
 *
 * Deliberately id-free — several instances share a page, so no `<defs>`, no
 * gradients-by-id, no clip paths. Depth comes from layered shapes and opacity.
 * Colour comes from the Tailwind design tokens; entrance motion is the shared
 * `.mt-stagger-item` utility, which the reduced-motion block in globals.css
 * switches off (so nothing is ever left invisible).
 */
export function VisualModelView({
  model,
  label,
  className,
}: {
  model: VisualModel;
  /** Accessible description override. */
  label?: string;
  className?: string;
}): JSX.Element {
  const { height, body } = renderModel(model);
  return (
    <div
      role="img"
      aria-label={label ?? describeVisual(model)}
      className={`w-full max-w-full${className ? ` ${className}` : ""}`}
    >
      <svg
        viewBox={`0 0 ${WIDTH} ${height}`}
        className="h-auto w-full max-w-full"
        aria-hidden
        focusable="false"
      >
        {body}
      </svg>
    </div>
  );
}

const WIDTH = 360;
const PAD = 18;
/** Max entrance delay, matching the .mt-stagger-item ladder in globals.css. */
const STAGGER_STEP = 45;
const STAGGER_MAX = 480;

type StaggerStyle = CSSProperties & Record<`--${string}`, string>;

/** Entrance delay for the nth drawn element. */
function stagger(index: number): StaggerStyle {
  return { "--mt-delay": `${Math.min(index * STAGGER_STEP, STAGGER_MAX)}ms` };
}

function rounded(value: number, places = 4): number {
  return Number(value.toFixed(places));
}

function tickLabel(value: number): string {
  return Number.isInteger(value) ? value.toLocaleString("en-US") : String(rounded(value, 3));
}

/** Split a caption into lines of roughly `maxChars`, without breaking words. */
function wrapText(text: string, maxChars: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    if (line.length > 0 && line.length + word.length + 1 > maxChars) {
      lines.push(line);
      line = word;
    } else {
      line = line.length > 0 ? `${line} ${word}` : word;
    }
  }
  if (line.length > 0) lines.push(line);
  return lines.slice(0, 3);
}

function renderModel(model: VisualModel): { height: number; body: ReactNode } {
  switch (model.kind) {
    case "fraction-bar":
      return fractionBar(model);
    case "number-line":
      return numberLine(model);
    case "area-model":
      return areaModel(model);
    case "place-value":
      return placeValue(model);
    case "coordinate-grid":
      return coordinateGrid(model);
    case "angle":
      return angle(model);
    case "unit-cubes":
      return unitCubes(model);
    case "clock":
      return clock(model);
    case "polygon":
      return polygon(model);
    case "symmetry":
      return symmetry(model);
    case "bar-graph":
      return barGraph(model);
    case "number-chips":
      return numberChips(model);
  }
}

/* ------------------------------------------------------------------ *
 * Captions
 * ------------------------------------------------------------------ */

function Caption({ lines, y }: { lines: string[]; y: number }): JSX.Element {
  return (
    <g className="mt-stagger-item" style={stagger(0)}>
      {lines.map((line, i) => (
        <text
          key={line + i}
          x={WIDTH / 2}
          y={y + i * 15}
          textAnchor="middle"
          className="fill-muted text-[11px]"
        >
          {line}
        </text>
      ))}
    </g>
  );
}

/* ------------------------------------------------------------------ *
 * fraction-bar
 * ------------------------------------------------------------------ */

function fractionRows(fraction: VisualFraction): number {
  // The largest numerator any covered skill produces is a product of a proper
  // fraction and a whole number, so this stays exact (never truncating a bar).
  return Math.min(Math.max(Math.ceil(fraction.numerator / fraction.denominator), 1), 12);
}

function fractionBar(model: Extract<VisualModel, { kind: "fraction-bar" }>): {
  height: number;
  body: ReactNode;
} {
  const barW = WIDTH - PAD * 2;
  const rowH = 22;
  const rowGap = 6;
  const groupGap = 22;
  const groups = [model, ...(model.compare ? [model.compare] : [])];
  let y = 16;
  let step = 0;
  const nodes: ReactNode[] = [];

  for (const fraction of groups) {
    const rows = fractionRows(fraction);
    const groupTop = y;
    for (let row = 0; row < rows; row++) {
      const rowY = groupTop + row * (rowH + rowGap);
      nodes.push(
        <rect
          key={`bg-${row}`}
          x={PAD}
          y={rowY}
          width={barW}
          height={rowH}
          rx={6}
          className="fill-card stroke-line"
          strokeWidth={1.5}
        />,
      );
      const segment = barW / fraction.denominator;
      for (let part = 0; part < fraction.denominator; part++) {
        const filled = row * fraction.denominator + part < fraction.numerator;
        const x = PAD + part * segment;
        if (filled) {
          nodes.push(
            <rect
              key={`f-${row}-${part}`}
              x={x + 1}
              y={rowY + 1}
              width={Math.max(segment - 2, 1)}
              height={rowH - 2}
              rx={3}
              className="fill-mint"
              style={stagger(step++)}
            />,
          );
        } else if (part > 0 && fraction.denominator <= 24) {
          nodes.push(
            <line
              key={`d-${row}-${part}`}
              x1={x}
              y1={rowY + 3}
              x2={x}
              y2={rowY + rowH - 3}
              className="stroke-line"
              strokeWidth={1}
              opacity={0.8}
            />,
          );
        }
      }
    }
    const labelY = groupTop + rows * (rowH + rowGap) - rowGap + 16;
    nodes.push(
      <text
        key={`lbl-${groupTop}`}
        x={WIDTH / 2}
        y={labelY}
        textAnchor="middle"
        className="fill-ink-soft text-[12px] font-semibold"
        style={stagger(step)}
      >
        {fraction.numerator}/{fraction.denominator}
      </text>,
    );
    y = labelY + groupGap;
  }

  return { height: y + 4, body: <g>{nodes}</g> };
}

/* ------------------------------------------------------------------ *
 * number-line
 * ------------------------------------------------------------------ */

function tickStep(span: number): number {
  const raw = span / 8;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const scaled = raw / magnitude;
  const multiplier = scaled <= 1 ? 1 : scaled <= 2 ? 2 : scaled <= 5 ? 5 : 10;
  return multiplier * magnitude;
}

function axisTicks(min: number, max: number, x0: number, x1: number): number[] {
  const span = max - min;
  if (!(span > 0)) return [min];
  const pxPerUnit = (x1 - x0) / span;
  // Where a tick's label actually sits, so long labels at the ends of the axis
  // are measured against the shifted anchor the view gives them.
  const interval = (value: number): [number, number] => {
    const x = x0 + (value - min) * pxPerUnit;
    const width = tickLabel(value).length * 5.9;
    if (x < x0 + 14) return [x, x + width];
    if (x > x1 - 14) return [x - width, x];
    return [x - width / 2, x + width / 2];
  };
  const step = tickStep(span);
  const candidates: number[] = [min];
  for (let value = Math.ceil(min / step) * step; value <= max + step / 1e6; value += step) {
    candidates.push(rounded(value, 6));
  }
  if (candidates[candidates.length - 1] !== max) candidates.push(max);
  const kept: number[] = [];
  for (const value of candidates) {
    const previous = kept[kept.length - 1];
    if (previous === undefined || interval(value)[0] - interval(previous)[1] >= 4) kept.push(value);
  }
  if (kept[kept.length - 1] !== max) {
    const end = interval(max);
    while (kept.length > 1 && end[0] - interval(kept[kept.length - 1])[1] < 4) kept.pop();
    kept.push(max);
  }
  return kept.slice(-14);
}

function numberLine(model: Extract<VisualModel, { kind: "number-line" }>): {
  height: number;
  body: ReactNode;
} {
  const y = 84;
  const x0 = PAD + 8;
  const x1 = WIDTH - PAD - 8;
  const span = model.max - model.min || 1;
  const xOf = (value: number) => x0 + ((value - model.min) / span) * (x1 - x0);
  const ticks = axisTicks(model.min, model.max, x0, x1);
  const marks = [...model.marks].sort((a, b) => a - b);
  const caption = model.label ? wrapText(model.label, 52) : [];
  const captionY = 126;
  const height = captionY + caption.length * 15 + 4;
  let step = 0;

  const anchor = (x: number): "start" | "middle" | "end" =>
    x < x0 + 14 ? "start" : x > x1 - 14 ? "end" : "middle";

  return {
    height,
    body: (
      <g>
        <line
          x1={x0 - 10}
          y1={y}
          x2={x1 + 12}
          y2={y}
          className="stroke-ink"
          strokeWidth={2.5}
          strokeLinecap="round"
        />
        <path
          d={`M ${x1 + 12} ${y} L ${x1 + 2} ${y - 5} L ${x1 + 2} ${y + 5} Z`}
          className="fill-ink"
        />
        {ticks.map((tick) => {
          const x = xOf(tick);
          return (
            <g key={`t-${tick}`} className="mt-stagger-item" style={stagger(step++)}>
              <line x1={x} y1={y - 5} x2={x} y2={y + 5} className="stroke-ink" strokeWidth={1.5} />
              <text x={x} y={y + 20} textAnchor={anchor(x)} className="fill-muted text-[10px]">
                {tickLabel(tick)}
              </text>
            </g>
          );
        })}
        {marks.map((mark, i) => {
          const x = xOf(mark);
          const labelY = y - 14 - (i % 2) * 20;
          return (
            <g key={`m-${mark}-${i}`} className="mt-stagger-item" style={stagger(step++)}>
              <line
                x1={x}
                y1={y - 4}
                x2={x}
                y2={labelY + 5}
                className="stroke-coral"
                strokeWidth={2}
                strokeDasharray="4 3"
              />
              <circle cx={x} cy={y} r={5.5} className="fill-coral stroke-card" strokeWidth={2} />
              <text
                x={x}
                y={labelY}
                textAnchor={anchor(x)}
                className="fill-coralink text-[11px] font-semibold"
              >
                {tickLabel(mark)}
              </text>
            </g>
          );
        })}
        {caption.length > 0 && <Caption lines={caption} y={captionY} />}
      </g>
    ),
  };
}

/* ------------------------------------------------------------------ *
 * area-model
 * ------------------------------------------------------------------ */

function areaModel(model: Extract<VisualModel, { kind: "area-model" }>): {
  height: number;
  body: ReactNode;
} {
  const cell = Math.min((WIDTH - PAD * 2 - 24) / model.cols, 190 / model.rows, 26);
  const gridW = cell * model.cols;
  const gridH = cell * model.rows;
  const x0 = (WIDTH - gridW) / 2 + 10;
  const y0 = 34;
  const caption = model.label ? wrapText(model.label, 50) : [];
  const height = y0 + gridH + 46 + caption.length * 15;
  const nodeGroups: ReactNode[] = [];

  for (let row = 0; row < model.rows; row++) {
    const rowNodes: ReactNode[] = [];
    for (let col = 0; col < model.cols; col++) {
      rowNodes.push(
        <rect
          key={`c-${row}-${col}`}
          x={x0 + col * cell}
          y={y0 + row * cell}
          width={cell}
          height={cell}
          className="fill-sky stroke-skyink"
          fillOpacity={0.22}
          strokeWidth={0.75}
          strokeOpacity={0.5}
        />,
      );
    }
    nodeGroups.push(
      <g key={`r-${row}`} className="mt-stagger-item" style={stagger(row)}>
        {rowNodes}
      </g>,
    );
  }

  return {
    height,
    body: (
      <g>
        {nodeGroups}
        <rect
          x={x0}
          y={y0}
          width={gridW}
          height={gridH}
          rx={3}
          fill="none"
          className="stroke-skyink"
          strokeWidth={2}
        />
        <text x={x0 - 8} y={y0 + gridH / 2} textAnchor="end" className="fill-skyink text-[12px] font-semibold">
          {model.rows}
        </text>
        <text x={x0 + gridW / 2} y={y0 - 9} textAnchor="middle" className="fill-skyink text-[12px] font-semibold">
          {model.cols}
        </text>
        <text
          x={WIDTH / 2}
          y={y0 + gridH + 22}
          textAnchor="middle"
          className="fill-ink text-[14px] font-semibold"
          style={stagger(model.rows)}
        >
          {model.rows} × {model.cols} = {model.rows * model.cols}
        </text>
        {caption.length > 0 && <Caption lines={caption} y={y0 + gridH + 40} />}
      </g>
    ),
  };
}

/* ------------------------------------------------------------------ *
 * place-value
 * ------------------------------------------------------------------ */

const SHORT_INT_PLACES = ["1s", "10s", "100s", "1,000s", "10,000s", "100,000s"];
const SHORT_DEC_PLACES = ["tenths", "hundredths", "thousandths"];

function shortPlaceName(digits: string, index: number): string {
  const dot = digits.indexOf(".");
  if (dot === -1) return SHORT_INT_PLACES[digits.length - 1 - index] ?? "";
  if (index < dot) return SHORT_INT_PLACES[dot - 1 - index] ?? "";
  if (index === dot) return "";
  return SHORT_DEC_PLACES[index - dot - 1] ?? "";
}

/** "3 × 100 = 300" for the digit at `index`, or null when it is the point. */
function digitWorth(digits: string, index: number): string | null {
  const digit = Number(digits[index]);
  if (!Number.isInteger(digit)) return null;
  const dot = digits.indexOf(".");
  if (dot !== -1 && index > dot) {
    const places = index - dot;
    const unit = places === 1 ? "1/10" : `1/1${"0".repeat(places - 1)}`;
    return `${digit} × ${unit} = ${String(rounded(digit / 10 ** places))}`;
  }
  const exponent = dot === -1 ? digits.length - 1 - index : dot - 1 - index;
  return `${digit} × 1${"0".repeat(Math.max(exponent, 0))} = ${(digit * 10 ** exponent).toLocaleString("en-US")}`;
}

function placeValue(model: Extract<VisualModel, { kind: "place-value" }>): {
  height: number;
  body: ReactNode;
} {
  const chars = model.digits.split("");
  const cellW = Math.min(58, (WIDTH - PAD * 2) / Math.max(chars.length, 1));
  const totalW = cellW * chars.length;
  const x0 = (WIDTH - totalW) / 2;
  const y0 = 34;
  const worth =
    model.highlight === undefined ? null : digitWorth(model.digits, model.highlight);

  return {
    height: worth ? 136 : 116,
    body: (
      <g>
        {chars.map((char, i) => {
          const highlighted = i === model.highlight;
          const x = x0 + i * cellW;
          return (
            <g
              key={`${char}-${i}`}
              className="mt-stagger-item"
              style={stagger(i)}
            >
              <text
                x={x + cellW / 2}
                y={26}
                textAnchor="middle"
                className={highlighted ? "fill-sunnyink text-[11px] font-semibold" : "fill-muted text-[11px]"}
              >
                {char === "." ? "" : shortPlaceName(model.digits, i)}
              </text>
              <rect
                x={x + 2}
                y={y0}
                width={cellW - 4}
                height={48}
                rx={8}
                className={highlighted ? "fill-sunny stroke-sunnydark" : "fill-card stroke-line"}
                strokeWidth={highlighted ? 2.5 : 1.5}
              />
              <text
                x={x + cellW / 2}
                y={y0 + 34}
                textAnchor="middle"
                className={highlighted ? "fill-sunnyink text-[24px] font-bold" : "fill-ink text-[24px] font-semibold"}
              >
                {char}
              </text>
            </g>
          );
        })}
        {model.highlight !== undefined && worth && (
          <text
            x={WIDTH / 2}
            y={y0 + 76}
            textAnchor="middle"
            className="fill-ink-soft text-[13px] font-semibold"
            style={stagger(chars.length)}
          >
            {worth}
          </text>
        )}
      </g>
    ),
  };
}

/* ------------------------------------------------------------------ *
 * coordinate-grid
 * ------------------------------------------------------------------ */

function coordinateGrid(model: Extract<VisualModel, { kind: "coordinate-grid" }>): {
  height: number;
  body: ReactNode;
} {
  const max = Math.max(Math.round(model.max), 1);
  const size = 232;
  const x0 = (WIDTH - size) / 2;
  const y0 = 34;
  const bottom = y0 + size;
  const px = (value: number) => x0 + (value / max) * size;
  const py = (value: number) => bottom - (value / max) * size;
  const lines: ReactNode[] = [];
  for (let i = 0; i <= max; i++) {
    lines.push(
      <line key={`v-${i}`} x1={px(i)} y1={y0} x2={px(i)} y2={bottom} className="stroke-line" strokeWidth={0.7} />,
      <line key={`h-${i}`} x1={x0} y1={py(i)} x2={x0 + size} y2={py(i)} className="stroke-line" strokeWidth={0.7} />,
    );
  }
  const tickLabels: ReactNode[] = [];
  for (let i = 1; i <= max; i++) {
    tickLabels.push(
      <text key={`xl-${i}`} x={px(i)} y={bottom + 14} textAnchor="middle" className="fill-muted text-[9px]">
        {i}
      </text>,
      <text key={`yl-${i}`} x={x0 - 7} y={py(i) + 3} textAnchor="end" className="fill-muted text-[9px]">
        {i}
      </text>,
    );
  }
  return {
    height: bottom + 34,
    body: (
      <g>
        {lines}
        <line x1={x0} y1={y0 - 6} x2={x0} y2={bottom + 6} className="stroke-ink" strokeWidth={2} />
        <line x1={x0 - 6} y1={bottom} x2={x0 + size + 12} y2={bottom} className="stroke-ink" strokeWidth={2} />
        <path d={`M ${x0 + size + 12} ${bottom} L ${x0 + size + 2} ${bottom - 5} L ${x0 + size + 2} ${bottom + 5} Z`} className="fill-ink" />
        <path d={`M ${x0} ${y0 - 6} L ${x0 - 5} ${y0 + 4} L ${x0 + 5} ${y0 + 4} Z`} className="fill-ink" />
        {tickLabels}
        <text x={x0 + size + 8} y={bottom + 20} className="fill-muted text-[10px]">
          x
        </text>
        <text x={x0 - 12} y={y0 - 16} className="fill-muted text-[10px]">
          y
        </text>
        {model.points.map((point, i) => (
          <g key={`p-${i}`} className="mt-stagger-item" style={stagger(i)}>
            <circle cx={px(point.x)} cy={py(point.y)} r={6} className="fill-coral stroke-card" strokeWidth={2} />
            <text
              x={px(point.x) + 10}
              y={py(point.y) - 8}
              className="fill-coralink text-[12px] font-semibold"
            >
              ({point.x}, {point.y})
            </text>
          </g>
        ))}
      </g>
    ),
  };
}

/* ------------------------------------------------------------------ *
 * angle
 * ------------------------------------------------------------------ */

function angle(model: Extract<VisualModel, { kind: "angle" }>): { height: number; body: ReactNode } {
  const degrees = Math.min(Math.max(model.degrees, 1), 179);
  const height = 232;
  const vertex = { x: 62, y: 178 };
  const rad = (deg: number) => (deg * Math.PI) / 180;
  // Longest ray that still fits the canvas for this opening, so obtuse angles
  // never shoot a ray off the edge.
  const reach = Math.min(
    212,
    (vertex.x - 10) / Math.max(Math.cos(rad(degrees)) * -1, 0),
    (vertex.y - 10) / Math.max(Math.sin(rad(degrees)), 0),
    (WIDTH - 10 - vertex.x) / Math.max(Math.cos(rad(degrees)), 0),
  );
  const rayLength = Math.max(reach, 48);
  const radius = Math.min(66, rayLength * 0.52);
  const point = (deg: number, len: number) => ({
    x: rounded(vertex.x + len * Math.cos(rad(deg))),
    y: rounded(vertex.y - len * Math.sin(rad(deg))),
  });
  const right = point(0, rayLength);
  const tip = point(degrees, rayLength);
  const arcStart = point(0, radius);
  const arcEnd = point(degrees, radius);
  const labelAt = point(degrees / 2, radius + 30);
  const kindName = degrees === 90 ? "right" : degrees < 90 ? "acute" : "obtuse";
  const reference = degrees === 90 ? null : point(90, Math.min(rayLength * 0.72, vertex.y - 24));

  return {
    height,
    body: (
      <g>
        {reference && (
          <g className="mt-stagger-item" style={stagger(3)}>
            <line
              x1={vertex.x}
              y1={vertex.y}
              x2={reference.x}
              y2={reference.y}
              className="stroke-muted"
              strokeWidth={1.5}
              strokeDasharray="5 5"
              opacity={0.7}
            />
            <text
              x={reference.x}
              y={Math.max(reference.y - 8, 15)}
              textAnchor="middle"
              className="fill-muted text-[10px]"
            >
              90°
            </text>
          </g>
        )}
        <path
          d={`M ${arcStart.x} ${arcStart.y} A ${radius} ${radius} 0 0 0 ${arcEnd.x} ${arcEnd.y}`}
          fill="none"
          className="stroke-accent"
          strokeWidth={3}
          style={stagger(1)}
        />
        <line
          x1={vertex.x}
          y1={vertex.y}
          x2={right.x}
          y2={right.y}
          className="stroke-ink"
          strokeWidth={4}
          strokeLinecap="round"
          style={stagger(0)}
        />
        <line
          x1={vertex.x}
          y1={vertex.y}
          x2={tip.x}
          y2={tip.y}
          className="stroke-ink"
          strokeWidth={4}
          strokeLinecap="round"
          style={stagger(0)}
        />
        <circle cx={vertex.x} cy={vertex.y} r={5} className="fill-ink" style={stagger(0)} />
        <text
          x={labelAt.x}
          y={labelAt.y}
          textAnchor="middle"
          className="fill-accentink text-[16px] font-bold"
          style={stagger(1)}
        >
          {degrees}°
        </text>
        <text x={WIDTH / 2} y={210} textAnchor="middle" className="fill-ink-soft text-[12px] font-semibold">
          {degrees === 90
            ? "exactly 90° — a right angle"
            : degrees < 90
              ? `${degrees}° is less than 90° — acute`
              : `${degrees}° is more than 90° — obtuse`}
        </text>
        <text x={WIDTH / 2} y={78} textAnchor="middle" className="fill-muted text-[11px]">
          {kindName} angle
        </text>
      </g>
    ),
  };
}

/* ------------------------------------------------------------------ *
 * unit-cubes
 * ------------------------------------------------------------------ */

function unitCubes(model: Extract<VisualModel, { kind: "unit-cubes" }>): {
  height: number;
  body: ReactNode;
} {
  const { length: l, width: w, height: h } = model;
  const unit = Math.min(20, 170 / h, 190 / w, 292 / (l + 0.55 * w));
  const frontW = l * unit;
  const frontH = h * unit;
  const depthW = w * unit * 0.55;
  const depthH = w * unit * 0.36;
  const x0 = (WIDTH - (frontW + depthW)) / 2;
  const y0 = 26 + depthH;
  const bottom = y0 + frontH;
  const lines: ReactNode[] = [];

  for (let i = 1; i < l; i++) {
    lines.push(
      <line key={`fv-${i}`} x1={x0 + i * unit} y1={y0} x2={x0 + i * unit} y2={bottom} className="stroke-ink" strokeWidth={0.9} opacity={0.35} />,
      <line
        key={`tv-${i}`}
        x1={x0 + i * unit}
        y1={y0}
        x2={x0 + i * unit + depthW}
        y2={y0 - depthH}
        className="stroke-ink"
        strokeWidth={0.9}
        opacity={0.3}
      />,
    );
  }
  for (let j = 1; j < h; j++) {
    lines.push(
      <line key={`fh-${j}`} x1={x0} y1={y0 + j * unit} x2={x0 + frontW} y2={y0 + j * unit} className="stroke-ink" strokeWidth={0.9} opacity={0.35} />,
      <line
        key={`sh-${j}`}
        x1={x0 + frontW}
        y1={y0 + j * unit}
        x2={x0 + frontW + depthW}
        y2={y0 + j * unit - depthH}
        className="stroke-ink"
        strokeWidth={0.9}
        opacity={0.3}
      />,
    );
  }
  for (let k = 1; k < w; k++) {
    lines.push(
      <line
        key={`td-${k}`}
        x1={x0 + k * unit * 0.55}
        y1={y0 - k * unit * 0.36}
        x2={x0 + frontW + k * unit * 0.55}
        y2={y0 - k * unit * 0.36}
        className="stroke-ink"
        strokeWidth={0.9}
        opacity={0.3}
      />,
      <line
        key={`sd-${k}`}
        x1={x0 + frontW + k * unit * 0.55}
        y1={y0 - k * unit * 0.36}
        x2={x0 + frontW + k * unit * 0.55}
        y2={bottom - k * unit * 0.36}
        className="stroke-ink"
        strokeWidth={0.9}
        opacity={0.3}
      />,
    );
  }

  return {
    height: bottom + 52,
    body: (
      <g>
        <polygon
          points={`${x0},${y0} ${x0 + frontW},${y0} ${x0 + frontW + depthW},${y0 - depthH} ${x0 + depthW},${y0 - depthH}`}
          className="fill-mint stroke-mintdeep"
          fillOpacity={0.75}
          strokeWidth={2}
          style={stagger(2)}
        />
        <polygon
          points={`${x0 + frontW},${y0} ${x0 + frontW + depthW},${y0 - depthH} ${x0 + frontW + depthW},${bottom - depthH} ${x0 + frontW},${bottom}`}
          className="fill-mint stroke-mintdeep"
          fillOpacity={0.45}
          strokeWidth={2}
          style={stagger(1)}
        />
        <rect
          x={x0}
          y={y0}
          width={frontW}
          height={frontH}
          className="fill-mint stroke-mintdeep"
          fillOpacity={0.6}
          strokeWidth={2}
          style={stagger(0)}
        />
        <g className="mt-stagger-item" style={stagger(3)}>
          {lines}
        </g>
        <text
          x={WIDTH / 2}
          y={bottom + 34}
          textAnchor="middle"
          className="fill-ink text-[14px] font-semibold"
          style={stagger(4)}
        >
          {l} × {w} × {h} = {l * w * h} unit cubes
        </text>
      </g>
    ),
  };
}

/* ------------------------------------------------------------------ *
 * clock
 * ------------------------------------------------------------------ */

function clock(model: Extract<VisualModel, { kind: "clock" }>): { height: number; body: ReactNode } {
  const cx = WIDTH / 2;
  const cy = 104;
  const r = 76;
  const hour = ((model.hour % 12) + 12) % 12;
  const minute = Math.min(Math.max(model.minute, 0), 59);
  const handAngle = (deg: number) => (deg * Math.PI) / 180;
  const handEnd = (deg: number, len: number, width: number, delay: number) => {
    const a = handAngle(deg);
    return (
      <line
        x1={cx}
        y1={cy}
        x2={rounded(cx + len * Math.sin(a))}
        y2={rounded(cy - len * Math.cos(a))}
        className="stroke-ink"
        strokeWidth={width}
        strokeLinecap="round"
        style={stagger(delay)}
      />
    );
  };
  const numbers: ReactNode[] = [];
  const ticks: ReactNode[] = [];
  for (let i = 0; i < 12; i++) {
    const a = handAngle(i * 30);
    ticks.push(
      <line
        key={`t-${i}`}
        x1={rounded(cx + (r - 9) * Math.sin(a))}
        y1={rounded(cy - (r - 9) * Math.cos(a))}
        x2={rounded(cx + r * Math.sin(a))}
        y2={rounded(cy - r * Math.cos(a))}
        className="stroke-ink"
        strokeWidth={2}
        opacity={0.7}
      />,
    );
    const hourNumber = i === 0 ? 12 : i;
    numbers.push(
      <text
        key={`n-${i}`}
        x={rounded(cx + (r - 24) * Math.sin(a))}
        y={rounded(cy - (r - 24) * Math.cos(a)) + 4}
        textAnchor="middle"
        className="fill-ink-soft text-[12px] font-semibold"
      >
        {hourNumber}
      </text>,
    );
  }

  return {
    height: cy + r + 54,
    body: (
      <g>
        <circle cx={cx} cy={cy} r={r + 6} className="fill-card stroke-line" strokeWidth={2} />
        <circle cx={cx} cy={cy} r={r} className="fill-cream" />
        <g className="mt-stagger-item" style={stagger(0)}>
          {ticks}
          {numbers}
        </g>
        {handEnd(hour * 30 + minute * 0.5, r * 0.52, 7, 1)}
        {handEnd(minute * 6, r * 0.78, 4.5, 2)}
        <circle cx={cx} cy={cy} r={6} className="fill-ink" style={stagger(3)} />
        <text
          x={cx}
          y={cy + r + 36}
          textAnchor="middle"
          className="fill-ink text-[16px] font-bold"
          style={stagger(4)}
        >
          {hour === 0 ? 12 : hour}:{String(minute).padStart(2, "0")}
        </text>
      </g>
    ),
  };
}

/* ------------------------------------------------------------------ *
 * polygon & symmetry
 * ------------------------------------------------------------------ */

function polygonPoints(sides: number, cx: number, cy: number, r: number): string {
  const points: string[] = [];
  for (let i = 0; i < sides; i++) {
    const a = ((i * 360) / sides - 90) * (Math.PI / 180);
    points.push(`${rounded(cx + r * Math.cos(a))},${rounded(cy + r * Math.sin(a))}`);
  }
  return points.join(" ");
}

/** Irregular stand-ins when the shape is explicitly not equilateral. */
function irregularPoints(sides: number, cx: number, cy: number): string {
  if (sides === 4) {
    return [
      `${cx - 100},${cy - 62}`,
      `${cx + 100},${cy - 62}`,
      `${cx + 100},${cy + 62}`,
      `${cx - 100},${cy + 62}`,
    ].join(" ");
  }
  if (sides === 3) {
    return [`${cx - 104},${cy + 60}`, `${cx + 96},${cy + 60}`, `${cx - 34},${cy - 72}`].join(" ");
  }
  return polygonPoints(sides, cx, cy, 74);
}

function polygon(model: Extract<VisualModel, { kind: "polygon" }>): { height: number; body: ReactNode } {
  const sides = Math.min(Math.max(Math.round(model.sides), 3), 12);
  const cx = WIDTH / 2;
  const cy = 100;
  const points =
    model.equalSides === false ? irregularPoints(sides, cx, cy) : polygonPoints(sides, cx, cy, 76);
  const caption = model.label ? wrapText(model.label, 46) : [];
  const captionY = 196;

  return {
    height: captionY + caption.length * 15 + 4,
    body: (
      <g>
        <polygon
          points={points}
          className="fill-sky stroke-skyink"
          fillOpacity={0.3}
          strokeWidth={3}
          strokeLinejoin="round"
          style={stagger(0)}
        />
        {points.split(" ").map((pair, i) => {
          const [x, y] = pair.split(",");
          return <circle key={`v-${i}`} cx={x} cy={y} r={3.5} className="fill-skyink" style={stagger(1)} />;
        })}
        <text x={cx} y={cy + 4} textAnchor="middle" className="fill-ink-soft text-[12px] font-semibold">
          {sides} sides
        </text>
        {caption.length > 0 && <Caption lines={caption} y={captionY} />}
      </g>
    ),
  };
}

function symmetry(model: Extract<VisualModel, { kind: "symmetry" }>): { height: number; body: ReactNode } {
  const sides = Math.min(Math.max(Math.round(model.sides), 3), 12);
  const axes = Math.max(Math.round(model.axes), 0);
  const cx = WIDTH / 2;
  const cy = 100;
  const r = 74;
  const lines: ReactNode[] = [];
  for (let i = 0; i < axes; i++) {
    const a = ((i * 180) / axes - 90) * (Math.PI / 180);
    const len = r + 16;
    lines.push(
      <line
        key={`a-${i}`}
        x1={rounded(cx - len * Math.cos(a))}
        y1={rounded(cy - len * Math.sin(a))}
        x2={rounded(cx + len * Math.cos(a))}
        y2={rounded(cy + len * Math.sin(a))}
        className="stroke-coral"
        strokeWidth={2}
        strokeDasharray="7 5"
        style={stagger(i)}
      />,
    );
  }
  return {
    height: 224,
    body: (
      <g>
        <polygon
          points={polygonPoints(sides, cx, cy, r)}
          className="fill-grape stroke-grapeink"
          fillOpacity={0.28}
          strokeWidth={3}
          strokeLinejoin="round"
          style={stagger(0)}
        />
        {lines}
        <text x={cx} y={cy + r + 36} textAnchor="middle" className="fill-ink-soft text-[12px] font-semibold">
          {sides}-sided shape · {axes} {axes === 1 ? "line" : "lines"} of symmetry
        </text>
      </g>
    ),
  };
}

/* ------------------------------------------------------------------ *
 * bar-graph
 * ------------------------------------------------------------------ */

const BAR_FILLS = ["fill-sky", "fill-sunny", "fill-coral", "fill-grape", "fill-mint", "fill-accent"];

function barGraph(model: Extract<VisualModel, { kind: "bar-graph" }>): { height: number; body: ReactNode } {
  const values = model.values.length > 0 ? model.values : [0];
  const max = Math.max(...values, 1);
  const baseline = 156;
  const plotH = 104;
  const gap = 14;
  const barW = Math.min(64, (WIDTH - PAD * 2 - gap * (values.length - 1)) / values.length);
  const totalW = barW * values.length + gap * (values.length - 1);
  const x0 = (WIDTH - totalW) / 2 + 6;
  const title = wrapText(model.label, 44);

  return {
    height: baseline + 40 + title.length * 14,
    body: (
      <g>
        {values.map((value, i) => {
          const h = Math.max((value / max) * plotH, 3);
          const x = x0 + i * (barW + gap);
          return (
            <g key={`b-${i}`} className="mt-stagger-item" style={stagger(i)}>
              <rect
                x={x}
                y={baseline - h}
                width={barW}
                height={h}
                rx={8}
                className={`${BAR_FILLS[i % BAR_FILLS.length]} stroke-line`}
                strokeWidth={1}
              />
              <rect
                x={x}
                y={baseline - h}
                width={barW}
                height={Math.min(h * 0.35, 16)}
                rx={8}
                className="fill-card"
                fillOpacity={0.35}
              />
              <text
                x={x + barW / 2}
                y={baseline - h - 7}
                textAnchor="middle"
                className="fill-ink text-[12px] font-bold"
              >
                {tickLabel(value)}
              </text>
            </g>
          );
        })}
        <line x1={PAD - 4} y1={baseline} x2={WIDTH - PAD + 4} y2={baseline} className="stroke-line" strokeWidth={2} />
        <Caption lines={title} y={baseline + 22} />
        {model.unit && (
          <text x={WIDTH / 2} y={baseline + 26 + title.length * 14} textAnchor="middle" className="fill-muted text-[10px]">
            {model.unit}
          </text>
        )}
      </g>
    ),
  };
}

/* ------------------------------------------------------------------ *
 * number-chips
 * ------------------------------------------------------------------ */

function chipWidth(value: number): number {
  return Math.min(30 + String(value).length * 9.5, 132);
}

function numberChips(model: Extract<VisualModel, { kind: "number-chips" }>): {
  height: number;
  body: ReactNode;
} {
  const values = model.values;
  const maxW = WIDTH - PAD * 2;
  const rows: { value: number; x: number }[][] = [];
  let row: { value: number; x: number }[] = [];
  let used = 0;
  for (const value of values) {
    const width = chipWidth(value);
    if (row.length > 0 && used + width + 10 > maxW) {
      rows.push(row);
      row = [];
      used = 0;
    }
    row.push({ value, x: used });
    used += width + 10;
  }
  if (row.length > 0) rows.push(row);
  const chipH = 42;
  const rowH = chipH + 12;
  let step = 0;

  return {
    height: rows.length * rowH + 20,
    body: (
      <g>
        {rows.map((chips, r) => {
          const totalW = chips.reduce((sum, chip, i) => sum + chipWidth(chip.value) + (i > 0 ? 10 : 0), 0);
          const left = (WIDTH - totalW) / 2;
          return (
            <g key={`row-${r}`}>
              {chips.map((chip, i) => {
                const x = left + chip.x;
                return (
                  <g key={`chip-${r}-${i}`} className="mt-stagger-item" style={stagger(step++)}>
                    <rect
                      x={x}
                      y={r * rowH + 10}
                      width={chipWidth(chip.value)}
                      height={chipH}
                      rx={13}
                      className={i % 2 === 0 ? "fill-sky-soft stroke-skyink" : "fill-card stroke-line"}
                      strokeWidth={1.5}
                    />
                    <text
                      x={x + chipWidth(chip.value) / 2}
                      y={r * rowH + 10 + chipH / 2 + 6}
                      textAnchor="middle"
                      className="fill-ink text-[16px] font-bold"
                    >
                      {tickLabel(chip.value)}
                    </text>
                  </g>
                );
              })}
            </g>
          );
        })}
      </g>
    ),
  };
}
