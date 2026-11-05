"use client";

import { type KeyboardEvent, type PointerEvent, useEffect, useRef, useState } from "react";
import { Dialog } from "@/components/ClimbActions";
import { AVATAR_SIZE, renderAvatar } from "@/lib/avatar";

// The square the picture is framed in, in CSS pixels. Small enough to fit a
// phone inside the dialog's padding.
const FRAME = 256;
// How far in they can zoom, from the whole short side filling the frame.
const MAX_ZOOM = 8;
// How far an arrow key moves the picture.
const KEY_STEP = 10;

// Where the picture sits: how far it's zoomed in, and where its top-left corner
// is relative to the frame's.
type View = { zoom: number; x: number; y: number };

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

// Lets them move and zoom their picked picture until the part they want fills
// the frame, then shrinks that part to the avatar size. The circle shows how it
// will look; the saved picture is the whole square.
export default function AvatarCropDialog({
  file,
  onCancel,
  onSave,
}: {
  file: File;
  onCancel: () => void;
  // Uploads the picture. Errors carry the message to show.
  onSave: (avatar: string) => Promise<void>;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [view, setView] = useState<View>({ zoom: 1, x: 0, y: 0 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Each finger or mouse pressed on the frame, by pointer ID - two at once pinch.
  const pointers = useRef(new Map<number, { x: number; y: number }>());

  // Load the picked file. Starts centred, with the short side filling the frame.
  const [src, setSrc] = useState<string>();
  useEffect(() => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = FRAME / Math.min(img.naturalWidth, img.naturalHeight);
      setView({
        zoom: 1,
        x: (FRAME - img.naturalWidth * scale) / 2,
        y: (FRAME - img.naturalHeight * scale) / 2,
      });
      setImage(img);
      setSrc(url);
    };
    img.onerror = () => setError("That file couldn't be read as an image. Try a JPEG or PNG.");
    img.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const width = image?.naturalWidth ?? 1;
  const height = image?.naturalHeight ?? 1;
  // CSS pixels per image pixel at zoom 1.
  const baseScale = FRAME / Math.min(width, height);
  const scale = baseScale * view.zoom;

  // Keeps the picture covering the whole frame, so there's never a gap.
  const fit = (next: View): View => {
    const s = baseScale * next.zoom;
    return {
      zoom: next.zoom,
      x: clamp(next.x, FRAME - width * s, 0),
      y: clamp(next.y, FRAME - height * s, 0),
    };
  };

  // Zooms to `zoom`, keeping the point at (ax, ay) in the frame where it is.
  const zoomAt = (current: View, zoom: number, ax: number, ay: number): View => {
    const nextZoom = clamp(zoom, 1, MAX_ZOOM);
    const ratio = nextZoom / current.zoom;
    return fit({ zoom: nextZoom, x: ax - (ax - current.x) * ratio, y: ay - (ay - current.y) * ratio });
  };

  // The point in the frame under the pointer.
  const framePoint = (clientX: number, clientY: number) => {
    const rect = frame.current!.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  };

  // React's wheel listener can't stop the dialog scrolling, so it's added by hand.
  useEffect(() => {
    const element = frame.current;
    if (!element || !image) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const point = framePoint(event.clientX, event.clientY);
      setView((current) => zoomAt(current, current.zoom * Math.exp(-event.deltaY * 0.002), point.x, point.y));
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
    // zoomAt only changes with the image, which is a dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [image]);

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (busy) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, framePoint(event.clientX, event.clientY));
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const previous = pointers.current.get(event.pointerId);
    if (!previous) return;
    const point = framePoint(event.clientX, event.clientY);
    const others = [...pointers.current.entries()].filter(([id]) => id !== event.pointerId).map(([, p]) => p);
    pointers.current.set(event.pointerId, point);

    if (others.length === 0) {
      // One pointer drags.
      setView((current) => fit({ ...current, x: current.x + point.x - previous.x, y: current.y + point.y - previous.y }));
      return;
    }
    // Two pinch: zoom by how much further apart they are, around the point
    // between them, and follow that point as it moves.
    const other = others[0];
    const before = Math.hypot(previous.x - other.x, previous.y - other.y);
    const after = Math.hypot(point.x - other.x, point.y - other.y);
    if (before === 0) return;
    const middleBefore = { x: (previous.x + other.x) / 2, y: (previous.y + other.y) / 2 };
    const middleAfter = { x: (point.x + other.x) / 2, y: (point.y + other.y) / 2 };
    setView((current) => {
      const zoomed = zoomAt(current, current.zoom * (after / before), middleBefore.x, middleBefore.y);
      return fit({ ...zoomed, x: zoomed.x + middleAfter.x - middleBefore.x, y: zoomed.y + middleAfter.y - middleBefore.y });
    });
  };

  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(event.pointerId);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [KEY_STEP, 0],
      ArrowRight: [-KEY_STEP, 0],
      ArrowUp: [0, KEY_STEP],
      ArrowDown: [0, -KEY_STEP],
    };
    const centre = FRAME / 2;
    if (event.key in moves) {
      const [dx, dy] = moves[event.key];
      setView((current) => fit({ ...current, x: current.x + dx, y: current.y + dy }));
    } else if (event.key === "+" || event.key === "=") {
      setView((current) => zoomAt(current, current.zoom * 1.1, centre, centre));
    } else if (event.key === "-") {
      setView((current) => zoomAt(current, current.zoom / 1.1, centre, centre));
    } else {
      return;
    }
    event.preventDefault();
  };

  const save = async () => {
    if (!image) return;
    setBusy(true);
    setError(null);
    try {
      // The frame's square, in the image's own pixels.
      await onSave(renderAvatar(image, { x: -view.x / scale, y: -view.y / scale, size: FRAME / scale }));
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Something went wrong. Try again.");
      setBusy(false);
    }
  };

  return (
    <Dialog title="Choose your picture" busy={busy} onClose={onCancel}>
      <p className="text-sm text-neutral-600">
        Drag to move it, and zoom with the slider, your scroll wheel, or a pinch. The part in the circle becomes your
        picture.
      </p>

      <div className="flex justify-center">
        <div
          ref={frame}
          tabIndex={0}
          role="group"
          aria-label="Picture framing. Use the arrow keys to move it and + or - to zoom."
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onKeyDown={onKeyDown}
          style={{ width: FRAME, height: FRAME }}
          className={`relative shrink-0 touch-none select-none overflow-hidden rounded-lg bg-neutral-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-secondary ${
            image && !busy ? "cursor-grab active:cursor-grabbing" : ""
          }`}
        >
          {image && src && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={src}
              alt=""
              draggable={false}
              className="pointer-events-none absolute top-0 left-0 max-w-none origin-top-left"
              style={{
                width: width * scale,
                height: height * scale,
                transform: `translate(${view.x}px, ${view.y}px)`,
              }}
            />
          )}
          {/* Darkens everything outside the circle the picture is shown in. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 rounded-full ring-2 ring-white/80"
            style={{ boxShadow: "0 0 0 9999px rgb(0 0 0 / 0.55)" }}
          />
          {!image && !error && (
            <p className="absolute inset-0 flex items-center justify-center text-sm text-white/70">Loading…</p>
          )}
        </div>
      </div>

      <label className="flex items-center gap-3 text-sm text-neutral-600">
        <span aria-hidden="true" className="text-lg leading-none">
          −
        </span>
        <span className="sr-only">Zoom</span>
        <input
          type="range"
          min={1}
          max={MAX_ZOOM}
          step={0.01}
          value={view.zoom}
          disabled={!image || busy}
          onChange={(event) => {
            const centre = FRAME / 2;
            setView((current) => zoomAt(current, Number(event.target.value), centre, centre));
          }}
          className="flex-1 accent-primary"
        />
        <span aria-hidden="true" className="text-lg leading-none">
          +
        </span>
      </label>

      <p className="text-xs text-neutral-500">
        It&apos;s saved at {AVATAR_SIZE}×{AVATAR_SIZE}.
      </p>

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}

      <div className="flex justify-end gap-3">
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="rounded-full px-5 py-2 text-sm font-semibold text-neutral-600 transition-colors hover:bg-neutral-200/70 hover:text-neutral-900 disabled:opacity-60"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={save}
          disabled={!image || busy}
          className="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? "Saving…" : "Save picture"}
        </button>
      </div>
    </Dialog>
  );
}
