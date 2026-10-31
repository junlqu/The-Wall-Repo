"use client";

import { useCallback, useRef } from "react";
import { type Announcement, setAnnouncementLiked } from "@/lib/announcements";

// Likes or takes back a like, given how to swap the changed announcement into
// the page. Shows the change straight away and puts it back if it doesn't save.
// One at a time per post, so quick clicks can't arrive out of order.
export function useToggleLike(replace: (announcement: Announcement) => void) {
  const liking = useRef(new Set<string>());

  return useCallback(
    (announcement: Announcement) => {
      if (liking.current.has(announcement.id)) return;
      liking.current.add(announcement.id);
      const liked = !announcement.liked;
      replace({ ...announcement, liked, likes: announcement.likes + (liked ? 1 : -1) });
      setAnnouncementLiked(announcement.id, liked)
        .then(replace)
        .catch(() => replace(announcement))
        .finally(() => liking.current.delete(announcement.id));
    },
    [replace],
  );
}

// Members can like a post; guests just see the count. `light` is for a dark
// background.
export function LikeButton({
  announcement,
  canLike,
  onToggle,
  light = false,
}: {
  announcement: Announcement;
  canLike: boolean;
  onToggle: (announcement: Announcement) => void;
  light?: boolean;
}) {
  const { liked } = announcement;
  const likedClass = light ? "bg-white/20 text-white" : "bg-secondary/20 text-primary";
  const hoverClass = light ? "hover:bg-white/10" : "hover:bg-neutral-100";

  return (
    <button
      type="button"
      onClick={() => onToggle(announcement)}
      disabled={!canLike}
      aria-pressed={canLike ? liked : undefined}
      title={canLike ? (liked ? "Take back your like" : "Like") : "Log in to like"}
      className={`-mx-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 transition-colors disabled:cursor-default ${
        liked ? likedClass : canLike ? hoverClass : ""
      }`}
    >
      <span aria-hidden="true" className={`text-sm leading-none ${liked ? "" : "opacity-70 grayscale"}`}>
        👌
      </span>
      {announcement.likes}
      <span className="sr-only">likes</span>
    </button>
  );
}
