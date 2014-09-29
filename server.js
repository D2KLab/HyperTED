var express = require('express'),
    path = require("path"),
    video = require('./controllers/video'),
    logger = require('morgan'),
    errMsg = require('./controllers/error_msg');

var basepath = "/HyperTED/";
var app = express();
var DEBUG = false;
app.set('view options', {layout: false});
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

if (DEBUG)
    app.use(logger('dev'));
app.use(basepath, express.static(path.join(__dirname, 'public')));

app.get(basepath+'nerdify', video.nerdify);
app.get(basepath+'runhotspot', video.runHotspot);
app.get(basepath+'video/:uuid', video.view);
app.get(basepath+'video?', video.search);
app.get(basepath+'courses?', video.getSuggestedCourses);
app.get(basepath+'metadata/:uuid', video.ajaxGetMetadata);
app.get(basepath+'suggestmf/:uuid', video.ajaxSuggestMF);
app.get(basepath+'builddb', video.buildDb);
app.get(basepath+'topicsearch', video.topicSearch);

app.get('/mediafragmentplayer', function (req, res, next) {
    res.render('welcome.ejs')
});
app.get(basepath, function (req, res) {
    res.render('welcome.ejs')
});
app.get(basepath+'*', function (req, res) {
    res.render('error.ejs', errMsg.e404);
});

app.use(function (err, req, res, next) {
    console.error(err);
    res.status(err.status || 500);
    res.render('error.ejs', errMsg.e500);
});

app.listen(8011);
console.log("Server Running on 8011");

