/** Serializable browser-side reader for the native timeline focus checkpoints. */
export function readTimelineFocus(element: Element) {
  // Keep all dependencies inside this function: Playwright serializes it into the page.
  const finite = (raw: string | number, name: string) => {
    const value =
      typeof raw === "string" && raw.trim() === "" ? NaN : Number(raw);
    if (!Number.isFinite(value))
      throw new Error(
        `Timeline focus ${name} is missing or nonfinite: ${JSON.stringify(raw)}`,
      );
    return value;
  };
  const imageElement = element.querySelector(".home-timeline-image");
  if (!imageElement)
    throw new Error("Missing timeline image at focus checkpoint");
  const style = getComputedStyle(element);
  const image = getComputedStyle(imageElement);
  // Missing measurements or even blur(0px) must fail; the optimized photos have no filter.
  if (image.filter !== "none")
    throw new Error(
      `Timeline image filter must be none: ${JSON.stringify(image.filter)}`,
    );
  return {
    scrollY: finite(scrollY, "scrollY"),
    opacity: finite(style.getPropertyValue("--timeline-opacity"), "opacity"),
    scale: finite(style.getPropertyValue("--timeline-scale"), "scale"),
    renderedOpacity: finite(image.opacity, "rendered opacity"),
    renderedFilter: image.filter,
  };
}
