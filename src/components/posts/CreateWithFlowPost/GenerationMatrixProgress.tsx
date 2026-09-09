import React, { useEffect, useRef, useState } from "react";

interface GenerationMatrixProgressProps {
  initialStage?: string;
  onCancel?: () => void;
}

const STAGES = [
  { label: "Analyzing brief & brand identity", maxPercent: 24, durationMs: 4000 },
  { label: "Sketching it out", maxPercent: 49, durationMs: 9000 },
  { label: "Art directing visual & depth", maxPercent: 74, durationMs: 14000 },
  { label: "Composing typography & hierarchy", maxPercent: 89, durationMs: 12000 },
  { label: "Harmonizing palette & final polish", maxPercent: 97, durationMs: 15000 },
];

export function GenerationMatrixProgress({ initialStage }: GenerationMatrixProgressProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [percent, setPercent] = useState(12);
  const [stageLabel, setStageLabel] = useState(initialStage || "Sketching it out");

  // Progress percentage interpolation
  useEffect(() => {
    const startTime = Date.now();
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      let accumulated = 0;

      for (const s of STAGES) {
        if (elapsed <= accumulated + s.durationMs) {
          const stageProgress = (elapsed - accumulated) / s.durationMs;
          const prevMax = STAGES[STAGES.indexOf(s) - 1]?.maxPercent || 8;
          const currentTarget = Math.round(prevMax + stageProgress * (s.maxPercent - prevMax));
          setPercent(Math.min(97, Math.max(12, currentTarget)));
          setStageLabel(s.label);
          break;
        }
        accumulated += s.durationMs;
      }

      if (elapsed > accumulated) {
        setStageLabel("Finalizing high-res render");
        setPercent((prev) => Math.min(98, prev + 1));
      }
    }, 400);

    return () => clearInterval(interval);
  }, []);

  // Canvas animated dot matrix
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationFrameId: number;
    let time = 0;

    const cols = 28;
    const rows = 28;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);
    };

    resize();
    window.addEventListener("resize", resize);

    const render = () => {
      time += 0.04;
      const rect = canvas.getBoundingClientRect();
      const width = rect.width;
      const height = rect.height;

      ctx.clearRect(0, 0, width, height);

      const cellW = width / (cols + 1);
      const cellH = height / (rows + 1);
      const centerX = width / 2;
      const centerY = height / 2;
      const maxDist = Math.sqrt(centerX * centerX + centerY * centerY);

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const x = (c + 1) * cellW;
          const y = (r + 1) * cellH;

          const dx = x - centerX;
          const dy = y - centerY;
          const dist = Math.sqrt(dx * dx + dy * dy);

          // Circular mask corner clipping like in screenshot
          if (dist > maxDist * 0.72) continue;

          // Radial wave propagation
          const wave = Math.sin(dist * 0.045 - time * 2.5);
          const noise = Math.sin(c * 0.4 + time) * Math.cos(r * 0.4 + time * 0.8);
          const intensity = Math.max(0, (wave + noise + 1.2) / 3.2);

          // Dot size & alpha
          const radius = Math.max(1, 1.2 + intensity * 2.2);
          const alpha = 0.12 + intensity * 0.82;

          // Color gradation: deep blue to vibrant electric cyan/sky
          const isBright = intensity > 0.65;
          const red = isBright ? Math.round(56 + intensity * 60) : 30;
          const green = isBright ? Math.round(140 + intensity * 90) : 80;
          const blue = isBright ? 255 : 180;

          ctx.beginPath();
          ctx.arc(x, y, radius, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${red}, ${green}, ${blue}, ${alpha})`;
          ctx.fill();

          // Soft bloom on brighter active dots
          if (isBright) {
            ctx.beginPath();
            ctx.arc(x, y, radius * 2.2, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(${red}, ${green}, ${blue}, ${alpha * 0.25})`;
            ctx.fill();
          }
        }
      }

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <div className="relative w-full max-w-[440px] aspect-square mx-auto rounded-2xl bg-[#090a0f] border border-white/[0.08] shadow-2xl overflow-hidden flex flex-col justify-between p-6 select-none my-4">
      {/* Subtle ambient backglow */}
      <div className="absolute inset-0 bg-gradient-to-tr from-sky-600/10 via-transparent to-indigo-600/10 pointer-events-none" />

      {/* Top Header Label */}
      <div className="relative z-10 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-sky-500" />
          </span>
          <h3 className="text-sm font-semibold tracking-wide text-white/90">
            {stageLabel}
          </h3>
        </div>
      </div>

      {/* Center Canvas Matrix */}
      <div className="absolute inset-0 flex items-center justify-center p-8">
        <canvas
          ref={canvasRef}
          className="w-full h-full max-w-[340px] max-h-[340px]"
        />
      </div>

      {/* Bottom Percentage Pill */}
      <div className="relative z-10 flex items-center justify-end w-full">
        <div className="inline-flex items-center gap-1.5 rounded-full bg-black/60 backdrop-blur-md px-3 py-1 border border-white/15 shadow-lg">
          <span className="text-xs font-mono font-semibold text-sky-400">
            {percent}%
          </span>
        </div>
      </div>
    </div>
  );
}
