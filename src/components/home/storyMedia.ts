export interface StoryImage {
  src: string;
  small?: string;
  smallWidth?: number;
  alt: string;
  width: number;
  height: number;
  position?: string;
}
/** Photo model years remain separate from generation launch dates. */
export const storyMedia = {
  detail: {
    src: "/images/gtr-nismo.webp",
    small: "/images/gtr-nismo.small.webp",
    smallWidth: 800,
    alt: "Rear detail of a 2024 Nissan GT-R NISMO",
    width: 1920,
    height: 1407,
    position: "57% 50%",
  },
  cockpit: {
    src: "/media/cockpit-r35-2017-portrait.webp",
    small: "/media/cockpit-r35-2017-portrait-small.webp",
    smallWidth: 480,
    alt: "Tan right-hand-drive cockpit of a 2017 Nissan GT-R Premium Edition",
    width: 1200,
    height: 1600,
    position: "50% 50%",
  },
  origin: {
    src: "/media/heritage-pgc10-1969-desktop.webp",
    small: "/media/heritage-pgc10-1969-small.webp",
    smallWidth: 640,
    alt: "1969 Nissan Skyline 2000GT-R PGC10 four-door sedan",
    width: 1600,
    height: 696,
  },
  r32: {
    src: "/media/heritage-r32-1992-desktop.webp",
    small: "/media/heritage-r32-1992-small.webp",
    smallWidth: 640,
    alt: "1992 Nissan Skyline GT-R R32 at Montlhéry, representing the generation launched in 1989",
    width: 1600,
    height: 997,
  },
  r34: {
    src: "/media/heritage-r34-1999-desktop.webp",
    small: "/media/heritage-r34-1999-small.webp",
    smallWidth: 640,
    alt: "1999 Nissan Skyline GT-R R34",
    width: 1600,
    height: 1000,
  },
} satisfies Record<string, StoryImage>;
export const eras = [
  {
    year: "1969",
    name: "Skyline GT-R",
    generation: "PGC10",
    note: "The beginning of an obsession.",
  },
  {
    year: "1989",
    name: "R32 GT-R",
    generation: "R32",
    note: "A new kind of all-wheel-drive performance.",
  },
  {
    year: "2007",
    name: "R35 GT-R",
    generation: "R35",
    note: "A new shape. The same restless pursuit.",
  },
] as const;
