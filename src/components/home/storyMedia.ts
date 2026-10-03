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
  r35: {
    src: "/images/gtr-premium.webp",
    small: "/images/gtr-premium.small.webp",
    smallWidth: 800,
    alt: "Front three-quarter photograph of a 2018 Nissan GT-R Premium in Super Silver",
    width: 1920,
    height: 1016,
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
    title: "Born to compete.",
    note: "A four-door Skyline with a racing heart. Its S20 straight-six drew on engine technology developed for the R380 prototype.",
    image: storyMedia.origin,
    caption: "1969 Skyline 2000GT-R",
  },
  {
    year: "1989",
    name: "R32 GT-R",
    generation: "R32",
    title: "A new kind of control.",
    note: "GT-R returned after 16 years: twin-turbo RB26DETT, ATTESA E-TS four-wheel drive, and victory in every Japanese Touring Car Championship race from 1990–1993.",
    image: storyMedia.r32,
    caption: "1992 R32 · generation introduced in 1989",
  },
  {
    year: "1999",
    name: "R34 GT-R",
    generation: "R34",
    title: "An icon takes shape.",
    note: "A smaller, more rigid body sharpened the R34. Inside, a multifunction display brought live engine information into the driver’s view.",
    image: storyMedia.r34,
    caption: "1999 Skyline GT-R R34",
  },
  {
    year: "2007",
    name: "R35 GT-R",
    generation: "R35",
    title: "The pursuit continues.",
    note: "Now independent of Skyline, the Nissan GT-R paired a 3.8-litre twin-turbo V6 with a rear dual-clutch transaxle and four-wheel drive.",
    image: storyMedia.r35,
    caption: "2018 GT-R Premium · R35 generation introduced in 2007",
  },
] as const;
