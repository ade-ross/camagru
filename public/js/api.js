// Every call to our JSON API goes through api(), so each page doesn't repeat
// the same fetch boilerplate and error handling.
//
// Resolves with the parsed JSON on a 2xx. Otherwise throws an Error whose
// message can be shown to the user, with the HTTP status in err.status
// (0 when the server could not be reached at all).
export async function api(method, url, body) {
  const options = { method, headers: {} };
  // Every request that changes something says "JSON", even with no body (logout,
  // like): the server refuses those without it (415). A form on another site
  // can't send this header, so it can't make the browser do these requests (CSRF).
  if (method !== 'GET') options.headers['Content-Type'] = 'application/json';
  if (body !== undefined) options.body = JSON.stringify(body);

  let res;
  try {
    // same-origin request: the browser sends the session cookie by itself
    res = await fetch(url, options);
  } catch {
    // fetch only rejects when there is no answer at all (server down, no network)
    throw apiError('Cannot reach the server, please try again', 0);
  }

  let data;
  try {
    data = await res.json();
  } catch {
    data = {}; // our API always answers JSON, but don't crash if something else did
  }

  if (!res.ok) throw apiError(data.error || 'Something went wrong', res.status);
  return data;
}

function apiError(message, status) {
  const err = new Error(message);
  err.status = status;
  return err;
}
