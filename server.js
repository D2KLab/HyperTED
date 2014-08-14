var express = require('express'),
    path = require("path"),
    video = require('./controllers/video'),
    logger = require('morgan'),
    errMsg = require('./controllers/error_msg');


var app = express();
var DEBUG = false;
app.set('view options', {layout: false});
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

if (DEBUG)
    app.use(logger('dev'));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/nerdify', video.nerdify);
app.get('/runhotspot', video.runHotspot);
app.get('/video/:uuid', video.view);
app.get('/video?', video.search);
app.get('/metadata/:uuid', video.ajaxGetMetadata);
app.get('/filter_ent/:uuid', video.filterEntities);
app.get('/builddb', video.buildDb);
app.get('/elasticsearch/:search', video.suggestMF);

app.get('/', function (req, res) {
    res.render('welcome.ejs')
});
app.get('*', function (req, res) {
    res.render('error.ejs', errMsg.e404);
});

app.use(function (err, req, res, next) {
    console.error(err);
    res.status(err.status || 500);
    res.render('error.ejs', errMsg.e500);
});

app.listen(8080);
console.log("Server Running on 8080");

