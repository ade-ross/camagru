const routes = [];

function add(method, pattern, handler, options = {}) {
  // turn "/confirm/:token" into a regex that captures the :token part
  const paramNames = [];
  const regexStr = pattern
    .split('/')
    .map((segment) => {
      if (segment.startsWith(':')) {
        paramNames.push(segment.slice(1));
        return '([^/]+)';
      }
      return segment;
    })
    .join('/');
  const regex = new RegExp(`^${regexStr}$`);
  routes.push({ method, regex, paramNames, handler, auth: options.auth === true });
}

function match(method, url) {
  const path = url.split('?')[0]; // strip query string before matching
  for (const route of routes) {
    if (route.method !== method) continue;
    const result = route.regex.exec(path);
    if (result) {
      const params = {};
      route.paramNames.forEach((name, i) => {
        params[name] = result[i + 1];
      });
      return { handler: route.handler, params, auth: route.auth };
    }
  }
  return null;
}

module.exports = { add, match };
