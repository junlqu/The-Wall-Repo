"use client";

import type { StaticImageData } from "next/image";
import Carousel from "@/components/Carousel";
import landing1 from "@/static/landingPhotos/landing1.jpg";
import landing2 from "@/static/landingPhotos/landing2.jpg";
import landing3 from "@/static/landingPhotos/landing3.jpg";
import landing4 from "@/static/landingPhotos/landing4.jpg";

type CommunityPhoto = {
  id: string;
  // Describes the photo for screen readers - it isn't shown on the slide.
  alt: string;
  // Until a photo is added, the slide shows a placeholder.
  // Drop photos in src/static/landingPhotos/ and import them here.
  image?: StaticImageData;
};

const COMMUNITY_PHOTOS: CommunityPhoto[] = [
  { id: "1", alt: "Climbers in Halloween costumes posing together on the wall", image: landing1 },
  { id: "2", alt: "A climber on top rope partway up the tall wall", image: landing2 },
  { id: "3", alt: "Three climbers striking poses on the wall, one holding up a trophy", image: landing3 },
  { id: "4", alt: "Two climbers on neighbouring routes stretching out to touch fingertips", image: landing4 },
];

const ROTATE_MS = 6000;

function PhotoSlide({ photo }: { photo: CommunityPhoto }) {
  return (
    <div className="aspect-[4/3] w-full overflow-hidden rounded-xl bg-neutral-200">
      {photo.image ? (
        // The site is a static export, so next/image's optimizer isn't available.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photo.image.src} alt={photo.alt} className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-gradient-to-br from-primary to-primary/80 text-white/70">
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-10 w-10">
            <rect x="3" y="5" width="18" height="14" rx="2" />
            <circle cx="9" cy="10" r="1.75" />
            <path d="m21 16-5-5-8 8" />
          </svg>
          <span className="text-xs font-semibold uppercase tracking-[0.2em]">Photo coming soon</span>
        </div>
      )}
    </div>
  );
}

export default function CommunityCarousel() {
  return (
    <Carousel
      label="Photos from the community"
      items={COMMUNITY_PHOTOS}
      getKey={(photo) => photo.id}
      renderItem={(photo) => <PhotoSlide photo={photo} />}
      rotateMs={ROTATE_MS}
    />
  );
}
