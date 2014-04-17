var http = require('http'),
    https = require('https');

var LOG_TAG = '[VIDEO.JS]: ';

exports.getSub = function (vendor, video_id, callback) {
    if (video_id == null || video_id == '') {
        console.error(LOG_TAG + "Empty video id");
        callback(true, "Empty video id");
        return;
    }

    switch (vendor) {
        case 'youtube':
            getYouTubeSub(video_id, callback);
            break;
        case 'dailymotion':
            getDailymotionSub(video_id, callback);
            break;
        default :
            console.log(LOG_TAG + 'Vendor not recognized or not supported.');
            callback(true, 'Vendor not recognized or not supported.');
    }
};

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