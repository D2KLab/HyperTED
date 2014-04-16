var https = require('https');
var http = require('http');

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


exports.getDailymotionSub = getDailymotionSub;