import express from 'express';
import path from 'path';
import logger from 'morgan';
import video from './controllers/video';
import errorMsg from './controllers/error_msg';

const basepath = '/HyperTED/';
const app = express();
const DEBUG = false;
app.set('view options', { layout: false });
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

if (DEBUG) app.use(logger('dev'));

app.use(basepath, express.static(path.join(__dirname, 'public')));

app.get(`${basepath}nerdify`, video.runNerdify);
app.get(`${basepath}runhotspot`, video.runHotspot);
app.get(`${basepath}video/:uuid`, video.view);
app.get(`${basepath}video?`, video.search);
app.get(`${basepath}courses?`, video.getSuggestedCourses);
app.get(`${basepath}metadata/:uuid`, video.ajaxGetMetadata);
app.get(`${basepath}suggestmf/:uuid`, video.ajaxSuggestMF);
app.get(`${basepath}builddb`, video.buildDb);
app.get(`${basepath}topicsearch`, video.topicSearch);

app.get('/mediafragmentplayer', (_req, res) => {
  res.render('welcome.ejs');
});
app.get(basepath, (_req, res) => {
  res.render('welcome.ejs');
});
app.get(`${basepath}*`, (_req, res) => {
  res.render('error.ejs', errorMsg(404));
});

app.use((err, _req, res) => {
  console.error('ERROR', err);
  res.status(err.status || 500);
  res.render('error.ejs', errorMsg(500));
});

app.listen(8011);
console.log('Server Running on 8011');
