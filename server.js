import express from 'express';
import path from 'path';
import * as logger from 'morgan';
import video from './controllers/video';
import errorMsg from './controllers/error_msg';

const app = express();
const DEBUG = false;
app.set('view options', { layout: false });
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

if (DEBUG) app.use(logger('dev'));

app.use('/', express.static(path.join(__dirname, 'public')));

app.get('/nerdify', video.runNerdify);
app.get('/runhotspot', video.runHotspot);
app.get('/video/:uuid', video.view);
app.get('/video?', video.search);
app.get('/courses?', video.getSuggestedCourses);
app.get('/metadata/:uuid', video.ajaxGetMetadata);
app.get('/suggestmf/:uuid', video.ajaxSuggestMF);
app.get('/builddb', video.buildDb);
app.get('/topicsearch', video.topicSearch);
app.get('/topicmodel', (req, res) => {
  const { uuid, modelname, chapter } = req.query;
  video.getTopics(uuid, modelname, chapter).then((words) => {
    res.json({ result: words });
  }).catch((message) => {
    console.error(message);
    res.status(400).json({ error: 'Error in topic modeling.' });
  });
});

app.get('/', (_req, res) => {
  res.render('index.ejs');
});
app.get('/*', (_req, res) => {
  res.render('error.ejs', errorMsg(404));
});

app.use((err, _req, res, next) => { // eslint-disable-line no-unused-vars
  console.error('ERROR', err);
  res.status(err.status || 500);
  res.render('error.ejs', errorMsg(500));
});

app.listen(8011);
console.log('Server Running on 8011');
