import { Film } from "./Film";
export function ExpandingFilm({
  reducedMotion,
  saveData,
}: {
  reducedMotion: boolean;
  saveData: boolean;
}) {
  return (
    <section
      className="home-expanding-runway"
      data-motion-section="expanding"
      aria-label="A closer look at the R35 in motion"
    >
      <div className="home-expanding-sticky">
        <div className="home-expanding-frame">
          <Film
            kind="detail"
            reducedMotion={reducedMotion}
            saveData={saveData}
          />
        </div>
      </div>
    </section>
  );
}
