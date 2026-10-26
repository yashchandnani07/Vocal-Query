// auth.js : if the server answers "401 please log in" to any request, go to the login page.
// Loaded first on /app and /import, so every fetch() below it is covered.
const originalFetch = window.fetch
window.fetch = async (...args) => {
  const res = await originalFetch(...args)
  if (res.status === 401 && !location.pathname.startsWith('/login')) {
    location.href = '/login?next=' + encodeURIComponent(location.pathname)
  }
  return res
}
