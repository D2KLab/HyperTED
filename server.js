var express = require('express'),
    sys = require("sys"),
    path = require("path"),
    url = require("url"),
    nerdify = require('./controllers/nerdify'),
    video = require('./controllers/video'),
    exphbs = require("express3-handlebars");

var app = express(), hbs = exphbs.create({});
app.set('view options', {layout: false});
app.set('views', path.join(__dirname, 'views'));
app.engine('html', hbs.engine);
app.set('view engine', 'html');

app.use(express.static(path.join(__dirname, 'public')));

app.get('/nerdify', nerdify.start);
app.get('/srt', video.getSub);
app.get('/video', video.view);
app.get('/', function (req, res) {
    res.render('welcome.html')
});

app.listen(8080);
sys.puts("Server Running on 8080");