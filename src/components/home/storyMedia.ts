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
export interface ArchivePhoto {
  image: StoryImage;
  caption: string;
  credit: string;
  label: string;
}
const archiveImage = (
  key: string,
  alt: string,
  width: number,
  height: number,
): StoryImage => ({
  src: `/media/${key}.webp`,
  small: `/media/${key}-small.webp`,
  smallWidth: 640,
  width,
  height,
  alt,
});
export const eras = [
  {
    year: "1969",
    name: "Skyline GT-R",
    generation: "PGC10",
    theme: "Origins",
    title: "A racing heart.\nA new bloodline.",
    achievement: "WIN ON DEBUT",
    achievementNote: "JAF Grand Prix · Fuji, May 1969",
    note: "The first GT-R arrived as a four-door sedan with the S20, a four-valve-per-cylinder straight-six. Its first race brought its first win. Competition was there from the beginning.",
    source:
      "https://www.nissan-global.com/EN/HERITAGE_COLLECTION/skyline_2000gtr_1969.html",
    photos: [
      {
        image: archiveImage(
          "archive-pgc10-no39-replica",
          "Blue-and-white No.39 PGC10 GT-R JAF Grand Prix winner replica in a gallery",
          1920,
          1280,
        ),
        caption:
          "1969 PGC10 JAF Grand Prix winner replica, photographed in 2012",
        credit: "archive-pgc10-no39-replica",
        label: "Competition",
      },
      {
        image: storyMedia.origin,
        caption: "1969 Skyline 2000GT-R sedan, photographed in 2014",
        credit: "heritage-pgc10-1969",
        label: "The road car",
      },
      {
        image: archiveImage(
          "archive-c10-s20",
          "S20 inline-six with red air cleaner in a later KPGC10 Skyline GT-R coupe",
          1440,
          1080,
        ),
        caption: "S20 inline-six in a C10-generation GT-R; KPGC10 shown",
        credit: "archive-c10-s20",
        label: "Engineering",
      },
    ],
  },
  {
    year: "1989",
    name: "R32 GT-R",
    generation: "R32",
    theme: "Dominance",
    title: "29 races.\nNo defeats.",
    achievement: "29 / 29",
    achievementNote: "Japanese Touring Car Championship · 1990–1993",
    note: "Twin-turbo RB26DETT power met electronically controlled ATTESA E-TS four-wheel drive. The R32 won every JTCC race across four seasons. Its competition story reached far beyond Japan.",
    source:
      "https://www.nissan-global.com/EN/HERITAGE_COLLECTION/249_skyline_gt-r.html",
    photos: [
      {
        image: storyMedia.r32,
        caption: "1992 Skyline GT-R at Montlhéry, photographed in 2019",
        credit: "heritage-r32-1992",
        label: "The road car",
      },
      {
        image: archiveImage(
          "archive-r32-oran-park-1992",
          "Mark Skaife leading Jim Richards in two R32 race cars at Oran Park in Australia in 1992",
          1032,
          688,
        ),
        caption: "Mark Skaife leads Jim Richards at Oran Park, 21 June 1992",
        credit: "archive-r32-oran-park-1992",
        label: "Australia · 1992",
      },
      {
        image: archiveImage(
          "archive-r32-rb26",
          "RB26DETT engine bay of a 1990 Nissan Skyline GT-R",
          1600,
          1065,
        ),
        caption: "RB26DETT in a 1990 Skyline GT-R, photographed in 2025",
        credit: "archive-r32-rb26",
        label: "Engineering",
      },
    ],
  },
  {
    year: "1999",
    name: "R34 GT-R",
    generation: "R34",
    theme: "Precision",
    title: "An icon.\nProven in yellow.",
    achievement: "JGTC CHAMPION",
    achievementNote: "Pennzoil NISMO · 1999 drivers’ title",
    note: "The R34 carried the Skyline story into a new era. In 1999, the Pennzoil NISMO race car scored in every JGTC round as Érik Comas secured the drivers’ title. The race machine used rear-wheel drive; the road car retained four-wheel drive.",
    source:
      "https://www.nissan-global.com/EN/HERITAGE_COLLECTION/skyline_gt-r_1999.html",
    photos: [
      {
        image: archiveImage(
          "archive-r34-pennzoil",
          "Yellow 1999-spec Pennzoil Nismo R34 GT-R in a pit garage, photographed in 2011",
          1920,
          1273,
        ),
        caption: "1999-spec Pennzoil Nismo GT-R, photographed in 2011",
        credit: "archive-r34-pennzoil",
        label: "Competition",
      },
      {
        image: storyMedia.r34,
        caption: "1999 Skyline GT-R R34 road car",
        credit: "heritage-r34-1999",
        label: "The road car",
      },
      {
        image: archiveImage(
          "archive-r34-rb26",
          "Red RB26DETT engine cover and strut brace in an R34 Skyline GT-R engine bay",
          1024,
          768,
        ),
        caption: "RB26DETT engine in an R34 Skyline GT-R",
        credit: "archive-r34-rb26",
        label: "Engineering",
      },
    ],
  },
  {
    year: "2007",
    name: "R35 GT-R",
    generation: "R35",
    theme: "Beyond Skyline",
    title: "A new name.\nThe same pursuit.",
    achievement: "12 HOURS",
    achievementNote: "Bathurst overall victory · 2015",
    note: "The R35 paired a 3.8-litre twin-turbo V6 with a rear dual-clutch transaxle. The GT-R NISMO GT3 took the name onto the world’s endurance circuits, including an outright Bathurst 12 Hour win in 2015.",
    source:
      "https://australia.nissannews.com/en-AU/releases/nissan-confirms-driver-line-up-for-bathurst-12-hour-defence",
    photos: [
      {
        image: storyMedia.r35,
        caption: "2018 GT-R Premium · R35 generation introduced in 2007",
        credit: "photography-premium",
        label: "The road car",
      },
      {
        image: archiveImage(
          "archive-r35-bathurst",
          "No.35 Nissan GT-R Nismo GT3 at Bathurst in February 2015",
          1080,
          720,
        ),
        caption: "No.35 GT-R Nismo GT3 at Bathurst, February 2015",
        credit: "archive-r35-bathurst",
        label: "Bathurst · 2015",
      },
      {
        image: archiveImage(
          "archive-r35-vr38",
          "VR38DETT engine bay with silver intake runners and red engine cover",
          1440,
          1080,
        ),
        caption: "VR38DETT engine bay, photographed in 2013",
        credit: "archive-r35-vr38",
        label: "Engineering",
      },
    ],
  },
] as const;
