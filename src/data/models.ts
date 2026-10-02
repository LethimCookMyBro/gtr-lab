import type { CameraView } from "../components/three/sceneHelpers";
import facts from "./specifications.json";
import imageCredits from "./image-credits.json";
export type VariantId =
  "premium" | "nismo" | "tspec" | "gtr50" | "gt3" | "gt500";
export interface AssetManifest {
  status: "missing" | "ready";
  kind?: "original-study" | "licensed-model";
  displayName?: string;
  referenceNote?: string;
  limitations?: string[];
  url: string | null;
  source: string | null;
  license: string | null;
  licenseName?: string;
  changes?: string[];
  author: string | null;
  materialRoles: {
    paint: string[];
    headlights: string[];
    taillights: string[];
    lampCovers?: string[];
  };
  interior: boolean;
  lights: boolean;
  disabledEmissive?: string[];
  cameraViews?: Partial<Record<string, CameraView>>;
}
export interface VehicleModel {
  id: VariantId;
  name: string;
  shortName: string;
  tagline: string;
  description: string;
  category: "Road" | "Track" | "Bespoke";
  image: string;
  imagePosition: string;
  imageCaption: string;
  powerValue: number;
  powerUnit: string;
  torqueValue: number;
  torqueUnit: string;
  outputIsEstimate?: boolean;
  purpose?: string;
  engine: string;
  drive: string;
  transmission: string;
  modelYear: string;
  sourceUrls: string[];
  notes: string[];
  asset: AssetManifest;
}
const editorial: Record<
  VariantId,
  {
    shortName: string;
    tagline: string;
    description: string;
    category: VehicleModel["category"];
    imagePosition: string;
  }
> = {
  premium: {
    shortName: "Premium",
    tagline: "The icon, distilled.",
    description:
      "A singular approach to the road. Twin-turbo response, intelligent all-wheel drive and the unmistakable silhouette of the R35.",
    category: "Road",
    imagePosition: "50% 58%",
  },
  nismo: {
    shortName: "NISMO",
    tagline: "Precision under pressure.",
    description:
      "Developed through competition. Carbon-fiber aero, focused chassis tuning and a sharper expression of the GT-R philosophy.",
    category: "Road",
    imagePosition: "50% 56%",
  },
  tspec: {
    shortName: "T-spec",
    tagline: "The grand touring edge.",
    description:
      "A considered expression of performance. Gold-forged wheels, carefully chosen materials and the quiet confidence of something rare.",
    category: "Road",
    imagePosition: "50% 52%",
  },
  gtr50: {
    shortName: "GT-R50",
    tagline: "A collector’s statement.",
    description:
      "Japanese engineering meets Italian coachbuilding. An anniversary collaboration with Italdesign, sculpted around a NISMO-developed heart.",
    category: "Bespoke",
    imagePosition: "50% 58%",
  },
  gt3: {
    shortName: "GT3",
    tagline: "Race-bred intent.",
    description:
      "Purpose-built for customer racing. Competition aero, a sequential transmission and endurance at the center of its brief.",
    category: "Track",
    imagePosition: "50% 55%",
  },
  gt500: {
    shortName: "GT500",
    tagline: "Motorsport without compromise.",
    description:
      "A silhouette, re-engineered for the circuit. The Class 1 machine pairs a turbocharged inline-four with a dedicated rear-drive racing chassis.",
    category: "Track",
    imagePosition: "50% 58%",
  },
};
const licensedR35: AssetManifest = {
  status: "ready",
  kind: "licensed-model",
  displayName: "GT-R R35",
  referenceNote:
    "The 3D scene is Ciasny’s artist-built R35 with custom aero, not a verified replica of the 2024 Premium. Published specifications describe the catalog model separately.",
  limitations: [
    "Source exterior is a custom-aero R35; exact factory trim and model year are unverified.",
    "The licensed source has no cabin. Interior view remains unavailable while a fitted cabin is being authored.",
    "Body paint and head/tail lights are independently controlled. Doors and other parts are not animated.",
  ],
  url: "/models/ciasny-r35.glb",
  source:
    "https://sketchfab.com/3d-models/nissan-gtr-r35-51c912a8310c4e00a82ad7673d84228a",
  license: "https://creativecommons.org/licenses/by/4.0/",
  licenseName: "CC BY 4.0",
  author: "Ciasny",
  changes: [
    "Adapted for GT-R LAB: transforms normalized, exhaust and lamp/window materials separated, textures resized to 2K WebP, tangents generated and geometry Meshopt-compressed. Exterior topology retained; original source preserved unchanged.",
    "Runtime lamp-cover transparency calibrated so the existing headlamp and taillamp emitters remain visible; window and housing materials are unchanged.",
  ],
  materialRoles: {
    paint: ["CarPaint"],
    headlights: ["Headlight_Emitter"],
    taillights: ["Taillight_Emitter"],
    lampCovers: [
      "Headlights_Glass_0",
      "TailightsGlass_Glass_0",
      "TailightsGlass_Glass.001_0",
    ],
  },
  interior: false,
  lights: true,
  disabledEmissive: ["Reverse_Emitter"],
};
export const models: VehicleModel[] = facts.variants.map((v) => ({
  ...v,
  ...editorial[v.id as VariantId],
  id: v.id as VariantId,
  drive: "drive" in v ? v.drive! : "Not specified in source",
  transmission:
    "transmission" in v ? v.transmission! : "Not specified in source",
  image: `/images/gtr-${v.id}.webp`,
  imageCaption: imageCredits.find((c) => c.id === v.id)?.description || "",
  asset:
    v.id === "premium"
      ? licensedR35
      : {
          status: "missing",
          url: null,
          source: null,
          license: null,
          author: null,
          materialRoles: { paint: [], headlights: [], taillights: [] },
          interior: false,
          lights: false,
        },
}));
export const getModel = (id: string) => models.find((m) => m.id === id);
export { imageCredits };
