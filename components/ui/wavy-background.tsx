"use client";

import { useEffect, useRef } from "react";

type Wave = {
  amplitude: number;
  color: string;
  frequency: number;
  offset: number;
  speed: number;
  y: number;
};

const WAVES: Wave[] = [
  { amplitude: 34, color: "rgba(155, 109, 255, 0.08)", frequency: 0.004, offset: 0, speed: 0.00018, y: 0.22 },
  { amplitude: 48, color: "rgba(255, 95, 120, 0.07)", frequency: 0.0032, offset: 2.3, speed: -0.00016, y: 0.45 },
  { amplitude: 38, color: "rgba(155, 109, 255, 0.06)", frequency: 0.0048, offset: 4.1, speed: 0.00014, y: 0.69 },
];

export function WavyBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");

    if (!canvas || !context) return;

    const canvasElement = canvas;
    const drawingContext = context;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let animationFrame = 0;
    let width = 0;
    let height = 0;

    function resize() {
      const scale = Math.min(window.devicePixelRatio, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvasElement.width = width * scale;
      canvasElement.height = height * scale;
      canvasElement.style.width = `${width}px`;
      canvasElement.style.height = `${height}px`;
      drawingContext.setTransform(scale, 0, 0, scale, 0, 0);
    }

    function draw(timestamp = 0) {
      drawingContext.clearRect(0, 0, width, height);
      drawingContext.fillStyle = "#0a0a0d";
      drawingContext.fillRect(0, 0, width, height);

      for (const wave of WAVES) {
        const movement = reducedMotion.matches ? 0 : timestamp * wave.speed;
        drawingContext.beginPath();
        drawingContext.moveTo(0, height);

        for (let x = 0; x <= width; x += 8) {
          const y = height * wave.y + Math.sin(x * wave.frequency + wave.offset + movement) * wave.amplitude;
          drawingContext.lineTo(x, y);
        }

        drawingContext.lineTo(width, height);
        drawingContext.closePath();
        drawingContext.fillStyle = wave.color;
        drawingContext.fill();
      }

      if (!reducedMotion.matches) animationFrame = window.requestAnimationFrame(draw);
    }

    resize();
    draw();
    window.addEventListener("resize", resize);

    return () => {
      window.removeEventListener("resize", resize);
      window.cancelAnimationFrame(animationFrame);
    };
  }, []);

  return <canvas ref={canvasRef} className="pointer-events-none fixed inset-0 z-[-1]" aria-hidden="true" />;
}
