var express = require('express'),
    path = require("path"),
    video = require('./controllers/video'),
    db = require('./controllers/database'),
    err = require('./controllers/error_msg');

var app = express();
db.prepare();
app.set('view options', {layout: false});
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

app.use(express.static(path.join(__dirname, 'public')));

app.get('/nerdify', video.nerdify);
app.get('/video/:uuid', video.view);
app.get('/metadata/:uuid', video.ajaxGetMetadata);
app.get('/video?', video.search);
app.get('/', function (req, res) {
    res.render('welcome.ejs')
});
app.get('*', function(req,res){
    res.render('error.ejs', err.e404);
});
app.listen(8080);
console.log("Server Running on 8080");