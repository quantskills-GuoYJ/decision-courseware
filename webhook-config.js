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
  // Default tutor endpoint (custom domain; *.workers.dev is blocked on some networks).
  // Lesson script uses same-origin /api/tutor when location.host is this host.
  // Any other url is an override and is kept.
  url: "https://dm-course.vibeniubi.com/api/tutor"
};
window.COURSE_WEBHOOK = {
  url: "",
  key: ""
};
