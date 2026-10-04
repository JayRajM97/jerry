import { createApp } from '../server/app';

// Vercel Function entry. An Express app is already a (req, res) handler, so it can
// be exported directly. vercel.json rewrites every /api/* path here, and Express
// does its own routing from the original URL.
export default createApp();
