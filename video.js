var http = require('http'),
    https = require('https');

function getYouTubeSub(video_id, callback) {
    if (video_id == null || video_id == '') {
        console.error("Empty video id");
        callback(true, "Empty video id");
        return;
    }
    console.log("http://www.youtube.com/api/timedtext?lang=en&v=" + video_id);
    http.get("http://www.youtube.com/api/timedtext?lang=en&format=srt&v=" + video_id, function (res) {
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
            } else
                callback(false, data);

        });
    });

}

function getDailymotionSub(video_id, callback) {
    if (video_id == null || video_id == '') {
        console.error("Empty video id");
        callback(true, "Empty video id");
        return;
    }
    https.get('https://api.dailymotion.com/video/' + video_id + '/subtitles?fields=id,language%2Curl', function (res) {
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
            data = JSON.parse(data);
            if (data.total > 0) {
//                video_info.sub_id = data.list[0].id;
//                video_info.sub_language = data.list[0].language;
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

function getSub(vendor, video_id, callback) {
    switch (vendor) {
        case 'youtube':
            getYouTubeSub(video_id, callback);
            break;
        case 'dailymotion':
            getDailymotionSub(video_id, callback);
            break;
        default :
            console.log('[VIDEO.JS]: Vendor not recognized or not supported.');
            callback(true, 'Vendor not recognized or not supported.');
    }
}
exports.getSub = getSub;