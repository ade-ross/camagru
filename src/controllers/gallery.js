const imagesModel = require('../models/images');
const likesModel = require('../models/likes');
const commentsModel = require('../models/comments');
const { requireAuth } = require('../middleware/session');
const { sendJson } = require('../lib/http');
const { sendCommentNotification } = require('../lib/mailer');
const log = require('../lib/log');

const PAGE_SIZE = 6;               // the subject asks for at least 5 per page
const IMAGE_ID = /^\d{1,9}$/;      // 9 digits always fit a Postgres integer
const COMMENT_MAX = 1000;

// The logged-in user's id, or null for a visitor (the gallery is public)
function viewerId(req) {
  return req.user ? req.user.id : null;
}

// GET /api/gallery?before=<id>: one page, newest first. No "before" = first page.
async function list(req, res) {
  // The router drops the query string; URL parses it (PHP: $_GET / parse_str).
  // The base address is only there because req.url is a path and URL needs a full one.
  const before = new URL(req.url, 'http://localhost').searchParams.get('before');
  if (before !== null && !IMAGE_ID.test(before)) {
    return sendJson(res, 400, { error: 'Invalid page cursor' });
  }

  try {
    const images = await imagesModel.listPage(viewerId(req), before === null ? null : Number(before), PAGE_SIZE);
    // A full page means there may be more: the next one starts below the last id.
    // (If exactly PAGE_SIZE were left, the next request simply returns an empty page.)
    const nextBefore = images.length === PAGE_SIZE ? images[images.length - 1].id : null;
    return sendJson(res, 200, { images, nextBefore });
  } catch (err) {
    log.error('Gallery list error:', err);
    return sendJson(res, 500, { error: 'Something went wrong' });
  }
}

// GET /api/gallery/:id: one picture and its comments (image.html)
async function getOne(req, res, params) {
  if (!IMAGE_ID.test(params.id)) {
    return sendJson(res, 404, { error: 'Not found' });
  }
  const imageId = Number(params.id);
  try {
    const image = await imagesModel.findPublic(viewerId(req), imageId);
    if (!image) {
      return sendJson(res, 404, { error: 'Not found' });
    }
    const comments = await commentsModel.listForImage(imageId);
    return sendJson(res, 200, { image, comments });
  } catch (err) {
    log.error('Gallery getOne error:', err);
    return sendJson(res, 500, { error: 'Something went wrong' });
  }
}

// POST and DELETE /api/images/:id/like. Two methods instead of a "toggle":
// sending the same request twice gives the same result (liked stays liked).
const like = (req, res, params) => setLike(req, res, params, true);
const unlike = (req, res, params) => setLike(req, res, params, false);

async function setLike(req, res, params, liked) {
  if (!requireAuth(req, res)) return;
  if (!IMAGE_ID.test(params.id)) {
    return sendJson(res, 404, { error: 'Not found' });
  }
  const imageId = Number(params.id);
  try {
    if (!(await imagesModel.exists(imageId))) {
      return sendJson(res, 404, { error: 'Not found' });
    }
    if (liked) await likesModel.addLike(req.user.id, imageId);
    else await likesModel.removeLike(req.user.id, imageId);
    const likes = await likesModel.countForImage(imageId);
    return sendJson(res, 200, { liked, likes });
  } catch (err) {
    // 23503 = foreign key violation: the picture was deleted between our check and the insert
    if (err.code === '23503') return sendJson(res, 404, { error: 'Not found' });
    log.error('Like error:', err);
    return sendJson(res, 500, { error: 'Something went wrong' });
  }
}

// POST /api/images/:id/comments, body: { text }
async function addComment(req, res, params) {
  if (!requireAuth(req, res)) return;
  if (!IMAGE_ID.test(params.id)) {
    return sendJson(res, 404, { error: 'Not found' });
  }
  const imageId = Number(params.id);

  // Stored as typed (trimmed). It is escaped when DISPLAYED, by the frontend's textContent.
  const text = typeof req.body.text === 'string' ? req.body.text.trim() : '';
  if (text.length === 0 || text.length > COMMENT_MAX) {
    return sendJson(res, 400, { error: `A comment must be 1 to ${COMMENT_MAX} characters` });
  }

  try {
    const author = await imagesModel.findAuthor(imageId);
    if (!author) {
      return sendJson(res, 404, { error: 'Not found' });
    }
    const comment = await commentsModel.createComment(req.user.id, imageId, text);

    // Not awaited: the email is only a notification. The commenter shouldn't wait
    // for the mail server, and the comment is saved even if the mail fails
    // (unlike registration, where the email IS the feature). No notification
    // when you comment on your own picture.
    if (author.notify_on_comment && author.id !== req.user.id) {
      sendCommentNotification(author.email, imageId).catch((err) => {
        log.error('Comment notification failed:', err);
      });
    }

    return sendJson(res, 201, comment);
  } catch (err) {
    if (err.code === '23503') return sendJson(res, 404, { error: 'Not found' });
    log.error('Add comment error:', err);
    return sendJson(res, 500, { error: 'Something went wrong' });
  }
}

module.exports = { list, getOne, like, unlike, addComment };
