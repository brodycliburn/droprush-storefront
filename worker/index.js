// Freebuff Sites supplies the ASSETS binding for the built website.
export default {
  fetch(request, env) {
    return env.ASSETS.fetch(request)
  },
}
