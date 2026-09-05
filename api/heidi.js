// Vercel Serverless Function: eine Datei, die die komplette Express-App bedient.
// Alles unter /api/heidi/* wird per rewrite (siehe vercel.json) hierher geleitet;
// req.url bleibt der Originalpfad, den die App unter '/api/heidi' gemountet hat.
export { default } from './_lib/heidi-app.js'
