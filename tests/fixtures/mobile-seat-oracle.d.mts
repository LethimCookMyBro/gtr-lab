type Seat = "driver" | "passenger" | "rear";
type Pose = {
  position: number[];
  quaternion: number[];
  projection: number[];
};

/** Type surface for the verbatim, independently pinned JavaScript oracle. */
export function createCabinOracle(transform: {
  scale: number;
  position: number[];
}): {
  reset(seat: Seat): void;
  expected(
    width: number,
    height: number,
  ): {
    seat: Seat;
    preset: "interior";
    fov: number;
    pose: Pose;
    destination: number[];
    target: number[];
  } | null;
  compare(actual: { pose: Pose }, width: number, height: number): boolean;
};
