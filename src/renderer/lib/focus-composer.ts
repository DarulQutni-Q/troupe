/** Frames {@link focusComposerWhenReady} waits for the composer to take typing (~1 s). */
const MAX_FRAMES = 60

/**
 * Put focus in the first composer that `editable` matches (a selector for the
 * `contenteditable="true"` element). A composer that is mounting, or mounted
 * read-only until its agent resolves, gets focus once it turns editable,
 * within about a second.
 */
export function focusComposerWhenReady(editable: string): void {
  let frames = 0
  const tryFocus = (): void => {
    const editor = document.querySelector<HTMLElement>(editable)
    if (editor) {
      editor.focus()
      return
    }
    frames += 1
    if (frames < MAX_FRAMES) requestAnimationFrame(tryFocus)
  }
  requestAnimationFrame(tryFocus)
}
