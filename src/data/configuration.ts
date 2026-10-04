export const paints = [
  { id: "silver", name: "Ultimate Silver", color: "#a6acb1" },
  { id: "gunmetal", name: "Gun Metallic", color: "#51565a" },
  { id: "white", name: "Pearl White", color: "#e9e7df" },
  { id: "black", name: "Jet Black", color: "#121619" },
  { id: "red", name: "Vibrant Red", color: "#9b1024" },
  { id: "blue", name: "Deep Blue", color: "#123264" },
  { id: "stealth", name: "Stealth Gray", color: "#7b8183" },
  { id: "purple", name: "Midnight Violet", color: "#342d47" },
  { id: "darkmetal", name: "Dark Metal Gray", color: "#33383c" },
] as const;
export const environments = [
  {
    id: "studio",
    name: "Pit garage",
    description: "Concrete, steel and a working pit bay.",
    color: "#484b4d",
  },
  {
    id: "gallery",
    name: "Gallery",
    description: "Open atrium. Architectural daylight.",
    color: "#bbb9b1",
  },
  {
    id: "night",
    name: "After hours",
    description: "Low light. Sharper reflections.",
    color: "#151b29",
  },
  {
    id: "forest",
    name: "Test paddock",
    description: "Pit lane asphalt. Open-air circuit paddock.",
    color: "#354038",
  },
  {
    id: "coast",
    name: "Coastal road",
    description: "Real road, sea wall and open water.",
    color: "#7791a0",
  },
] as const;
export const cameraPresets = [
  { id: "hero", name: "Front ¾" },
  { id: "front", name: "Front" },
  { id: "side", name: "Side" },
  { id: "rear-quarter", name: "Rear ¾" },
  { id: "rear", name: "Rear" },
  { id: "wheel", name: "Wheel detail" },
  { id: "interior", name: "Interior" },
  { id: "top", name: "Top detail" },
] as const;
export type EnvironmentId = (typeof environments)[number]["id"];
