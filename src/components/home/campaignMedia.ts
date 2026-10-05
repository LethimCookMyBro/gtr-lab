import type { ArchivePhoto } from "./storyMedia";

/** Contemporary examples are never presented as period or factory-spec images. */
export const campaignMedia = {
  premium: {
    src: "/media/campaign-r35-orange.webp",
    small: "/media/campaign-r35-orange-small.webp",
    alt: "Orange facelift Nissan GT-R R35 photographed by Martin Katler; model year unverified",
    position: "50% 70%",
  },
  r34: {
    image: {
      src: "/media/campaign-r34-white.webp",
      small: "/media/campaign-r34-white-small.webp",
      smallWidth: 640,
      width: 1600,
      height: 900,
      alt: "Modified white Nissan Skyline R34 GT-R on a wet road; a modern example, not factory-original 1999 photography",
    },
    caption:
      "Modified R34 example, photographed in the modern era; published 2022. Not factory-original or period 1999 photography",
    credit: "campaign-r34-white",
    label: "A contemporary example",
  } satisfies ArchivePhoto,
  r35: {
    image: {
      src: "/media/campaign-r35-mountain.webp",
      small: "/media/campaign-r35-mountain-small.webp",
      smallWidth: 640,
      width: 1600,
      height: 1000,
      alt: "Modern photograph of a charcoal Nissan GT-R R35 on a mountain road; exact model year unverified",
    },
    caption:
      "Modern R35 photograph, published 2021; exact model year unverified. The generation was introduced in 2007",
    credit: "campaign-r35-mountain",
    label: "A contemporary example",
  } satisfies ArchivePhoto,
};
