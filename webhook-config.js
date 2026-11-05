/**
 * Cloud submit via CORS-safe Cloudflare Worker proxy.
 * Secrets stay on the Worker; the public Pages site only posts JSON to the proxy.
 * Fallback: paste raw webhook URL+key in the page panel (localStorage), or override:
 *   window.COURSE_WEBHOOK = { url, key }
 */
window.COURSE_SUBMIT = {
  url: "https://decision-course-submit.abgyja.workers.dev/submit"
};
window.COURSE_TUTOR = {
  // Stock Pages endpoint. Lesson script rewrites this to same-origin /api/tutor
  // when location.host is the Worker. Any other url is an override and is kept.
  url: "https://decision-course-submit.abgyja.workers.dev/api/tutor"
};
window.COURSE_WEBHOOK = {
  url: "",
  key: ""
};
