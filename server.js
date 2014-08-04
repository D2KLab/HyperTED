var express = require('express'),
    path = require("path"),
    video = require('./controllers/video'),
    logger = require('morgan'),
    db = require('./controllers/database'),
    err = require('./controllers/error_msg');

var app = express();
var DEBUG = false;
db.prepare();
app.set('view options', {layout: false});
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

if(DEBUG)
app.use(logger('dev'));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/nerdify', video.nerdify);
app.get('/runhotspot', video.runHotspot);
app.get('/video/:uuid', video.view);
app.get('/video?', video.search);
app.get('/metadata/:uuid', video.ajaxGetMetadata);
app.get('/builddb', video.buildDb);
app.get('/', function (req, res) {
    res.render('welcome.ejs')
});
app.get('*', function (req, res) {
    res.render('error.ejs', err.e404);
});

/// error handlers

// development error handler
// will print stacktrace
if (app.get('env') === 'development') {
    app.use(function (err, req, res, next) {
        res.status(err.status || 500);
        res.render('error', {
            message: err.message,
            error: err
        });
    });
}

// production error handler
// no stacktraces leaked to user
app.use(function (err, req, res, next) {
    res.status(err.status || 500);
    res.render('error.ejs', {
        message: err.e500
    });
});

app.listen(8080);
console.log("Server Running on 8080");

