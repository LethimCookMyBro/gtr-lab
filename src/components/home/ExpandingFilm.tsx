import { useState } from "react";
import { Play } from "lucide-react";
import { Film } from "./Film";
import { FilmDialog } from "./FilmDialog";
export function ExpandingFilm({
  reducedMotion,
  saveData,
}: {
  reducedMotion: boolean;
  saveData: boolean;
}) {
  const [open, setOpen] = useState(false);
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
            suspended={open}
          />
          <button
            className="home-film-enlarge"
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Enlarge driving film"
          >
            <span className="home-film-enlarge-icon">
              <Play
                size={22}
                fill="currentColor"
                strokeWidth={1}
                aria-hidden="true"
              />
            </span>
            <span>Take a closer look</span>
          </button>
        </div>
      </div>
      <FilmDialog open={open} onClose={() => setOpen(false)} />
    </section>
  );
}
