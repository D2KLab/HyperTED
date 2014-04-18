var http = require('http'),
    https = require('https'),
    url = require("url");

var LOG_TAG = '[VIDEO.JS]: ';

//exports.getSub = function (vendor, video_id, callback) {
exports.getSub = function (req, res) {
    var video_id = req.query.video_id;
    var vendor = req.query.vendor;
    if (video_id == null || video_id == '') {
        console.error(LOG_TAG + "Empty video id");
        res.send(400, "Empty video id");
        return;
    }

    var subFunction;

    switch (vendor) {
        case 'youtube':
            subFunction = getYouTubeSub;
            break;
        case 'dailymotion':
            subFunction = getDailymotionSub;
            break;
        default :
            console.log(LOG_TAG + 'Vendor not recognized or not supported.');
            res.send(400, "Vendor not recognized or not supported.");
            return;
    }

    subFunction(video_id, function (err, msg) {
        if (err) {
            res.send(404, msg);
        } else {
            res.send(200, msg);
        }
    });
};

exports.view = function (req, res) {
    var videoURI = req.query.uri;
    if(!videoURI){
        res.redirect('/');
        return;
    }
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
    res.render('index.html', source);
}

function getYouTubeSub(video_id, callback) {
    http.get("http://www.youtube.com/api/timedtext?lang=en&format=srt&v=" + video_id, function (res) {
        if (res.statusCode != 200) {
            callback(true, res.statusCode);
            return;
        }
        var data = '';
        res.on("data", function (chunk) {
            data += chunk;
        });
        res.on('end', function () {
            if (data == '') {
                callback(true, 'No sub available');
                return;
            } else
                callback(false, data);

        });
    });
}

function getDailymotionSub(video_id, callback) {
    https.get('https://api.dailymotion.com/video/' + video_id + '/subtitles?fields=id,language%2Curl', function (res) {
        if (res.statusCode != 200) {
            callback(true, res.statusCode);
            return;
        }
        var data = '';
        res.on("data", function (chunk) {
            data += chunk;
        });
        res.on('end', function () {
            if (data == '') {
                callback(true, 'No sub available');
                return;
            }
            data = JSON.parse(data);
            if (data.total > 0) {
                var url = (data.list[0].url);
                http.get(url, function (res) {

                    console.log("Got res: " + res.statusCode);
                    if (res.statusCode != 200) {
                        callback(true, res.statusCode);
                        return;
                    }

                    var data = '';
                    res.on("data", function (chunk) {
                        data += chunk;
                    });
                    res.on('end', function () {
                        if (data == '') {
                            callback(true, 'No sub available');
                            return;
                        }
                        callback(false, data);
                    });
                });
            } else {
                //TODO
            }
        });
    });
}

function empty(data) {
    if (typeof(data) == 'number' || typeof(data) == 'boolean') {
        return false;
    }
    if (typeof(data) == 'undefined' || data === null) {
        return true;
    }
    if (typeof(data.length) != 'undefined') {
        return data.length == 0;
    }
    var count = 0;
    for (var i in data) {
        if (data.hasOwnProperty(i)) {
            count++;
        }
    }
    return count == 0;
}


