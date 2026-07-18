"use client";

// Dropped inside a GET filter <form>: selects/checkboxes submit on change, so
// filtering is one tap instead of pick→scroll→find-the-button→tap. The text
// input (min score) still uses the button — nobody wants a reload per keystroke.
import { useEffect, useRef } from "react";

export default function AutoSubmitOnChange() {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const form = ref.current?.closest("form");
    if (!form) return;
    const onChange = (e: Event) => {
      const t = e.target as HTMLInputElement;
      if (t.tagName === "SELECT" || t.type === "checkbox") form.requestSubmit();
    };
    form.addEventListener("change", onChange);
    return () => form.removeEventListener("change", onChange);
  }, []);
  return <span ref={ref} hidden />;
}
