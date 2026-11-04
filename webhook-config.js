/**
 * Optional local webhook config for cloud submit.
 * Copy this file next to index.html and fill in real values IF you host privately.
 *
 * IMPORTANT:
 * - Do NOT commit real secrets to a public GitHub Pages repo.
 * - Prefer pasting URL + key in the page "Webhook 设置" panel (saved to localStorage).
 * - Or override at runtime in DevTools: window.COURSE_WEBHOOK = { url: "...", key: "..." }
 *
 * Auth header used by the courseware: Authorization: Bearer <key>
 * (Parent can adjust if the Grok Bot routine expects a different header.)
 */
window.COURSE_WEBHOOK = {
  url: "",   // e.g. "https://…/webhook/…"
  key: ""    // sender key / secret — leave empty on public Pages
};
