var express = require('express'),
    path = require("path"),
    nerdify = require('./controllers/nerdify'),
    video = require('./controllers/video');

var app = express();
app.set('view options', {layout: false});
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

app.use(express.static(path.join(__dirname, 'public')));

app.get('/nerdify', nerdify.start);
app.get('/srt', video.getSub);
app.get('/video', video.view);
app.get('/', function (req, res) {
    res.render('welcome.ejs')
});

app.listen(8080);
console.log("Server Running on 8080");