import { h } from 'preact';
import { useEffect, useRef } from 'preact/hooks';

interface HeatmapProps {
    active: boolean;
}

export function Heatmap({ active }: HeatmapProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const spriteRef = useRef<HTMLCanvasElement | null>(null);
    const pointsRef = useRef<{ x: number, y: number, age: number }[]>([]);
    const lastPointTime = useRef<number>(0);

    // 1. Create Sprite (Pre-render gradient)
    useEffect(() => {
        if (!spriteRef.current) {
            const sprite = document.createElement('canvas');
            sprite.width = 100;
            sprite.height = 100;
            const ctx = sprite.getContext('2d');
            if (ctx) {
                const grad = ctx.createRadialGradient(50, 50, 0, 50, 50, 50);
                grad.addColorStop(0, 'rgba(255, 100, 0, 0.4)'); // Orange center
                grad.addColorStop(1, 'rgba(255, 0, 0, 0)');
                ctx.fillStyle = grad;
                ctx.beginPath();
                ctx.arc(50, 50, 50, 0, Math.PI * 2);
                ctx.fill();
            }
            spriteRef.current = sprite;
        }
    }, []);

    useEffect(() => {
        if (!active) return;

        const handleMove = (e: MouseEvent) => {
            const now = Date.now();
            // Throttle input to avoid flooding (Limit to ~60 events/sec)
            if (now - lastPointTime.current < 16) return;

            lastPointTime.current = now;
            pointsRef.current.push({ x: e.clientX, y: e.clientY, age: 1.0 });

            // Limit points for performance
            if (pointsRef.current.length > 200) pointsRef.current.shift();
        };

        window.addEventListener('mousemove', handleMove);

        let frameId: number;
        const render = () => {
            const canvas = canvasRef.current;
            if (!canvas) return;
            const ctx = canvas.getContext('2d');
            if (!ctx) return;

            // Resize if needed
            if (canvas.width !== window.innerWidth || canvas.height !== window.innerHeight) {
                canvas.width = window.innerWidth;
                canvas.height = window.innerHeight;
            }

            // Clear
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            const sprite = spriteRef.current;

            // Decay and Draw
            pointsRef.current.forEach(p => {
                p.age -= 0.01; // Fade out slightly faster
            });
            pointsRef.current = pointsRef.current.filter(p => p.age > 0);

            // Batch Draw
            if (sprite) {
                pointsRef.current.forEach(p => {
                    ctx.globalAlpha = p.age; // Use globalAlpha for fade
                    // Draw image centered on point
                    ctx.drawImage(sprite, p.x - 50, p.y - 50);
                });
                ctx.globalAlpha = 1.0; // Reset
            }

            frameId = requestAnimationFrame(render);
        };

        render();

        return () => {
            window.removeEventListener('mousemove', handleMove);
            cancelAnimationFrame(frameId);
        };
    }, [active]);

    if (!active) return null;

    return (
        <canvas
            ref={canvasRef}
            className="fixed inset-0 pointer-events-none z-40"
            style={{ mixBlendMode: 'screen' }}
        />
    );
}
