/** Display-font price. Secular One draws U+20AA (₪) as bare ש+ח letterforms,
 * which reads like a typo ("שח") — so the numeral stays in the display face
 * while the currency sign is set in Assistant, where it's the standard glyph. */
export default function Price({ value }: { value: number }) {
  return (
    <span className="tnum">
      {value.toLocaleString("en-US")} <span className="font-body text-[0.78em] font-bold">₪</span>
    </span>
  );
}
