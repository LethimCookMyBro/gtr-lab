import type { CabinSourceViews } from "../components/three/cabinPreview";
import { getModel, type VehicleModel } from "./models";
import anchors from "./r35-study-camera-anchors.json";

/** Optional private study. It is deliberately absent from the six-model catalog. */
export const R35_STUDY: VehicleModel = {
  id: "premium",
  name: "2008 GT-R R35 · Study",
  shortName: "2008 R35 study",
  tagline: "Exterior and cabin from one artist model.",
  description:
    "PolyTigr’s 2008 R35 artist model, with its authored exterior and cabin preserved together. Inspection views remain under review.",
  category: "Road",
  image: null,
  imagePosition: "50% 50%",
  imageCaption: "",
  powerValue: null,
  powerUnit: "",
  torqueValue: null,
  torqueUnit: "",
  engine: "Not verified for this artist model",
  drive: "Not verified for this artist model",
  transmission: "Not verified for this artist model",
  modelYear: "2008 artist model · factory specifications unverified",
  purpose: "Whole-car and cabin inspection study",
  sourceUrls: [],
  notes: [],
  asset: {
    status: "ready",
    kind: "licensed-model",
    displayName: "2008 GT-R R35 · Study",
    referenceNote:
      "2008 artist model by PolyTigr. Factory dimensions and trim are unverified. This is not a NISMO or T-spec representation.",
    limitations: [
      "One source scene contains the exterior and cabin. Authored materials and glass are retained; paint and lamp controls are unavailable in this study.",
      "Driver, passenger and rear views are source-backed inspection starting points, not measured factory seating positions or collision-safe camera volumes. Fresh visual and device review remains outstanding.",
      "Doors, seats and instruments are static. The source’s 2008 identity does not establish factory accuracy.",
    ],
    url: "/models/polytigr-r35-2008-precision-meshopt-rebuilt.glb",
    source:
      "https://sketchfab.com/3d-models/nissan-gt-r-2008-red-c8cd27c3c8cf4e2d86da031f1e98f8c8",
    author: "PolyTigr (formerly TGRRRR)",
    license: "https://creativecommons.org/licenses/by/4.0/",
    licenseName: "CC BY 4.0",
    changes: [
      "Constant texture slots converted to equivalent factors; identical images deduplicated; bounded attribute quantization and Meshopt compression. Ordered topology, cabin parts and retained image bytes preserved. Whole car normalized once for the viewer.",
    ],
    materialRoles: { paint: [], headlights: [], taillights: [] },
    interior: true,
    cabinPreview: "integrated-study",
    cabinLayout: {
      kind: "integrated",
      sourceViews: anchors.sourceViews as CabinSourceViews,
    },
    lights: false,
  },
};
export function getConfiguratorModel(id: string, study: boolean) {
  return id === "premium" && study ? R35_STUDY : getModel(id);
}
