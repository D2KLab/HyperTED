var express = require('express'),
    sys = require("sys"),
    path = require("path"),
    url = require("url"),
    fs = require("fs"), //file system
    nerdify = require('./nerdify'),
    video = require('./video'),
    exphbs = require("express3-handlebars"),
    Cache = require("node-cache"),
    nerdCache = new Cache();

var app = express(), hbs=exphbs.create({});
app.set('view options', {layout: false});
app.set('views', path.join(__dirname, 'views'));
app.engine('html', hbs.engine);
app.set('view engine', 'html');

//app.register('.html', require('handlebars'));

//var template = fs.readFileSync("./index.html", "utf8");

app.use(express.static(path.join(__dirname, 'public')));

app.get('/nerdify', function (req, res) {
    var text = req.query.text;
    var type = req.query.type;
    var video_id = req.query.videoid;
    var vendor = req.query.vendor;
    var cacheKey = vendor + video_id + type;

    var cachedData = nerdCache.get(cacheKey);
    var json = cachedData[cacheKey];
    if (json) {
        res.json(json);
        return;
    }

    nerdify.start(text, type, function (err, data) {
        if (err) {
            console.log(err);
            res.send(500, err.message);
        } else {
            nerdCache.set(cacheKey, data);
            res.json(data);
        }
    });
});
app.get('/srt', function (req, res) {
    var video_id = req.query.video_id;
    var vendor = req.query.vendor;

    video.getSub(vendor, video_id, function (err, data) {
        if (err) {
            res.send(500, data + '');
        } else {
            res.send(200, data);
        }
    })
});
app.get('/video', function (req, res) {
    var videoURI = req.query.uri;
    var concSign = url.parse(videoURI).hash ? '&' : '#';

    var t = req.query.t;
    if (t) {
        videoURI += concSign + 't=' + t;
        concSign = '&';
    }
    var xywh = req.query.xywh;
    if (xywh) {
        videoURI += concSign + 'xywh=' + xywh;
//        concSign = '&';
    }

    var source = {
        videoURI: videoURI
    };
//    var pageBuilder = handlebars.compile(template);
//    var pageText = pageBuilder(source);
//
//    res.send(pageText);
    res.render('index.html', source);
});

app.listen(8080);
sys.puts("Server Running on 8080");